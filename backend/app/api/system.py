"""系统级端点：健康探针、Prometheus 指标、超管运维触发。

从 app/main.py 抽出（原先 248 行内联在装配文件里）。

⚠️ **路径保持不变**：这些端点挂在**根路径**（/health、/live、/ready、
/metrics、/metrics/process），另有若干自带 /api/v1 前缀的别名，
因此挂载到 app 时**不加 prefix**。前端与运维脚本依赖这些确切路径。
"""

import asyncio
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.auth import get_current_active_user, require_superadmin
from app.middleware.observability import metrics_response
from app.models.user import User
from app.utils.logging import get_logger

logger = get_logger(__name__)

router = APIRouter()


async def _check_db(session: AsyncSession) -> bool:
    """Return ``True`` if the database responds to a simple query."""
    try:
        await session.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


async def _check_redis() -> bool:
    """Return ``True`` if Redis responds to a PING.

    Uses the shared async Redis client from ``app.utils.redis``. A failure
    to import or connect (e.g. Redis not configured) is treated as
    "unavailable" rather than raising.
    """
    try:
        from app.utils.redis import get_redis
        client = await get_redis()
        await client.ping()
        return True
    except Exception:
        return False


# Health check endpoint
@router.get(
    "/health",
    summary="Health check",
    tags=["System"],
)
async def health_check(session: AsyncSession = Depends(get_db)) -> JSONResponse:
    """Health check endpoint for monitoring and load balancers.

    HTTP 状态码只由数据库决定：DB 不可用即返回 503，让编排层能真实发现故障。
    此前该端点恒返回 200，导致 render.yaml 的 ``healthCheckPath: /health``
    形同虚设 —— 数据库挂掉时实例仍被判为健康，不会被重启。

    Redis 是可选加速器（不可用时自动降级到内存限流/缓存），若把它计入状态码，
    Redis 抖动会导致实例被误重启；因此只作为 body 里的附加信息。
    """
    db_ok = await _check_db(session)
    redis_ok = await _check_redis()
    if not db_ok:
        status_label = "unhealthy"
    elif not redis_ok:
        status_label = "degraded"
    else:
        status_label = "healthy"

    return JSONResponse(
        status_code=200 if db_ok else 503,
        content={
            "status": status_label,
            "version": settings.APP_VERSION,
            "service": "nexora-api",
            "database": "connected" if db_ok else "unavailable",
            "redis": "connected" if redis_ok else "unavailable",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


@router.get(
    "/live",
    summary="Liveness probe",
    tags=["System"],
)
async def liveness() -> dict:
    """Liveness probe.

    Returns 200 as long as the process is running. Performs no dependency
    checks so that transient backend outages do not cause the pod to be
    killed during rolling restarts.
    """
    return {"status": "alive"}


@router.get(
    "/ready",
    summary="Readiness probe",
    tags=["System"],
)
async def readiness(session: AsyncSession = Depends(get_db)) -> JSONResponse:
    """Readiness probe.

    Returns 200 when the database is reachable. Redis is treated as an
    optional dependency: if it is not configured, the instance is still
    ready (SQLite is the default storage and Redis is only an accelerator).
    """
    db_ok = await _check_db(session)
    redis_ok = await _check_redis()
    ready = db_ok  # Redis is optional; only the DB gates readiness
    return JSONResponse(
        status_code=200 if ready else 503,
        content={
            "status": "ready" if ready else "not ready",
            "database": "connected" if db_ok else "unavailable",
            "redis": "connected" if redis_ok else "unavailable",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


# ---------------------------------------------------------------------------
# Metrics endpoint (Prometheus + process monitoring)
# ---------------------------------------------------------------------------
@router.get(
    "/metrics",
    summary="Prometheus metrics",
    tags=["System"],
)
async def metrics(
    request: Request,
    authorization: str | None = Header(default=None),
):
    """Return Prometheus-format application metrics.

    If ``settings.METRICS_TOKEN`` is configured, the request must carry
    ``Authorization: Bearer <token>``.

    SECURITY: 生产环境必须配置 METRICS_TOKEN，否则直接拒绝。该端点会暴露
    路由清单、延迟分布与错误率，对攻击者是零成本的侦察信息。
    （提醒：render.yaml 历史上写的是后端并不存在的 ``METRICS_AUTH`` 键，
    等于「以为关掉了、其实从未生效」。）
    """
    token = settings.METRICS_TOKEN
    if token:
        expected = f"Bearer {token}"
        if authorization != expected:
            raise HTTPException(status_code=401, detail="Invalid metrics token")
    elif settings.ENVIRONMENT == "production":
        raise HTTPException(
            status_code=403,
            detail="Metrics endpoint disabled: METRICS_TOKEN is not configured.",
        )
    return metrics_response()


# Alias under the API prefix so the frontend's `api.get('/metrics/process')`
# (which prepends /api/v1) resolves correctly.
@router.get(
    "/api/v1/metrics/process",
    summary="Process metrics (API prefix alias)",
    tags=["System"],
    response_model=dict,
)
async def process_metrics_api(
    current_user: Annotated[User, Depends(get_current_active_user)],
):
    """API-prefixed alias of /metrics/process for the dashboard card.

    需要登录：该端点暴露进程内存、CPU 与连接数，不应匿名可读。
    """
    return await process_metrics()


@router.get(
    "/metrics/process",
    summary="Process metrics",
    tags=["System"],
    response_model=dict,
)
async def process_metrics(
    current_user: Annotated[User, Depends(get_current_active_user)],
):
    """Return process-level performance metrics (memory, CPU, connections).

    需要登录：该端点暴露进程内存、CPU 与连接数，不应匿名可读。
    """
    try:
        import psutil
        import os as _os
        process = psutil.Process(_os.getpid())
        return {
            "memory_mb": round(process.memory_info().rss / 1024 / 1024, 2),
            "cpu_percent": process.cpu_percent(interval=0.1),
            "connections": len(process.connections()),
        }
    except ImportError:
        return {
            "memory_mb": 0,
            "cpu_percent": 0,
            "connections": 0,
            "note": "psutil not installed",
        }


# ---------------------------------------------------------------------------
# Weekly report manual trigger endpoint
# ---------------------------------------------------------------------------
@router.post(
    "/api/v1/admin/trigger-weekly-report",
    summary="Manually trigger weekly reports",
    tags=["System"],
)
async def trigger_report(_user=Depends(require_superadmin)):
    """Manually trigger sending weekly reports to all workspace owners.

    Requires superadmin privileges.
    """
    from app.services.report import send_all_weekly_reports

    async def _safe_send_weekly_reports() -> None:
        """Run the weekly reports, logging any error instead of letting it
        vanish as an un-retrieved task exception."""
        try:
            await send_all_weekly_reports()
        except Exception:
            logger.exception("Error sending weekly reports.")

    asyncio.create_task(_safe_send_weekly_reports())
    return {"status": "started"}


# ---------------------------------------------------------------------------
# Manual backup trigger endpoint
# ---------------------------------------------------------------------------
@router.post(
    "/api/v1/backup",
    summary="Trigger manual database backup",
    tags=["System"],
)
async def trigger_backup(_user=Depends(require_superadmin)):
    """Trigger a manual database backup. Returns the path and last backup time.

    Requires superadmin privileges.
    """
    try:
        import sys
        import os as _os
        _backend_path = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..")
        if _backend_path not in sys.path:
            sys.path.insert(0, _backend_path)
        from backup import backup as backup_func, get_last_backup_time

        result = backup_func()
        last = get_last_backup_time()
        return {
            "status": "done",
            "last_backup": last,
            "path": result,
        }
    except Exception as e:
        # Log the real error internally but never leak it to the client.
        logger.exception("Manual backup failed: %s", str(e))
        return JSONResponse(
            status_code=500,
            content={"status": "error", "detail": "备份操作失败，请检查日志"},
        )


@router.get(
    "/api/v1/backup/status",
    summary="Get last backup time",
    tags=["System"],
)
async def backup_status(_user=Depends(require_superadmin)):
    """Return the timestamp of the most recent database backup.

    Requires superadmin privileges.
    """
    try:
        import sys
        import os as _os
        _backend_path = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..")
        if _backend_path not in sys.path:
            sys.path.insert(0, _backend_path)
        from backup import get_last_backup_time

        last = get_last_backup_time()
        return {
            "last_backup": last,
        }
    except Exception as e:
        # Log the real error internally but never leak it to the client.
        logger.exception("Failed to get backup status: %s", str(e))
        return JSONResponse(
            status_code=500,
            content={"last_backup": None, "error": "获取备份状态失败"},
        )

