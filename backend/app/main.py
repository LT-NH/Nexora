"""Nexora - Main Application Entry Point.

Creates and configures the FastAPI application with all middleware,
routers, and startup events.
"""

import os
import uuid
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import api_router
from app.config import settings
from app.database import async_session_factory, get_db, init_db
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.request_id import RequestMiddleware
from app.middleware.performance import PerformanceMiddleware
from app.middleware.observability import MetricsMiddleware, metrics_response
from app.middleware.auth import require_superadmin
from app.models.subscription import SubscriptionPlan
from app.utils.exceptions import register_exception_handlers
from app.utils.logging import get_logger, setup_logging

# Initialize structured logging
setup_logging()
logger = get_logger(__name__)

scheduler: "AsyncIOScheduler | None" = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler.

    On startup:
        - Creates all database tables.
        - Seeds default subscription plans (Free, Pro, Enterprise).
        - Validates that SECRET_KEY is not using the default value.

    On shutdown:
        - Cleanup tasks (if any).
    """
    # Startup
    logger.info("Starting Nexora API...")

    await init_db()
    logger.info("Database tables initialized.")

    # Validate critical secrets (SECRET_KEY strength, etc.)
    for warning in settings.validate_critical_secrets():
        logger.warning(warning)

    try:
        await seed_default_plans()
        logger.info("Default subscription plans seeded.")
    except Exception as e:
        logger.error("Failed to seed default subscription plans: %s", str(e))

    # Start scheduled database backup (daily at 3:00 AM)
    try:
        global scheduler
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        import sys
        import os as _os
        _backend_path = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..")
        if _backend_path not in sys.path:
            sys.path.insert(0, _backend_path)
        from backup import backup as backup_func
        scheduler = AsyncIOScheduler()
        scheduler.add_job(backup_func, "cron", hour=3, minute=0)
        # Send weekly reports every Monday at 8:00 AM
        from app.services.report import send_all_weekly_reports
        scheduler.add_job(send_all_weekly_reports, "cron", day_of_week="mon", hour=8, minute=0)
        # AI 自动巡检：每天 9:00 生成经营体检结论
        from app.services.patrol import run_ai_patrol
        scheduler.add_job(run_ai_patrol, "cron", hour=9, minute=0)
        # 店铺自动同步：每 5 分钟扫描到期店铺执行增量同步
        from app.services.store_sync import run_due_store_syncs
        scheduler.add_job(run_due_store_syncs, "interval", minutes=5, id="store_autosync")
        scheduler.start()
        logger.info(
            "Scheduled daily backup 03:00, weekly reports Mon 08:00, "
            "AI patrol 09:00, store auto-sync every 5min."
        )
    except Exception as e:
        logger.warning("Failed to start backup scheduler: %s", str(e))

    logger.info("Nexora API is ready.")
    yield
    # Shutdown
    if scheduler:
        scheduler.shutdown(wait=False)
    logger.info("Shutting down Nexora API.")


async def seed_default_plans() -> None:
    """Seed the database with default subscription plans if they don't exist."""
    try:
        async with async_session_factory() as session:
            # Check if plans already exist
            result = await session.execute(
                select(SubscriptionPlan).limit(1)
            )
            if result.scalar_one_or_none() is not None:
                return  # Already seeded

            plans = [
                SubscriptionPlan(
                    id=str(uuid.uuid4()),
                    name="Free",
                    slug="free",
                    price_monthly=0.0,
                    price_yearly=0.0,
                    max_members=5,
                    max_workspaces=1,
                    features={
                        "description": "Basic features for individuals and small teams.",
                        "api_access": True,
                        "storage_gb": 1,
                        "support": "community",
                        "custom_domain": False,
                        "audit_logs": False,
                        "api_keys": 1,
                        "priority_support": False,
                    },
                    is_active=True,
                ),
                SubscriptionPlan(
                    id=str(uuid.uuid4()),
                    name="Pro",
                    slug="pro",
                    price_monthly=29.0,
                    price_yearly=290.0,
                    max_members=20,
                    max_workspaces=5,
                    features={
                        "description": "Advanced features for growing teams.",
                        "api_access": True,
                        "storage_gb": 50,
                        "support": "email",
                        "custom_domain": True,
                        "audit_logs": True,
                        "api_keys": 10,
                        "priority_support": False,
                    },
                    is_active=True,
                ),
                SubscriptionPlan(
                    id=str(uuid.uuid4()),
                    name="Enterprise",
                    slug="enterprise",
                    price_monthly=99.0,
                    price_yearly=990.0,
                    max_members=999,
                    max_workspaces=999,
                    features={
                        "description": "Full-featured plan for large organizations.",
                        "api_access": True,
                        "storage_gb": 500,
                        "support": "priority",
                        "custom_domain": True,
                        "audit_logs": True,
                        "api_keys": 100,
                        "priority_support": True,
                        "sso": True,
                        "white_label": True,
                        "dedicated_support": True,
                    },
                    is_active=True,
                ),
            ]

            for plan in plans:
                session.add(plan)

            await session.commit()
    except Exception:
        logger.exception("Error seeding default subscription plans.")
        raise


# Create FastAPI application
app = FastAPI(
    title="Nexora API",
    description="Multi-tenant e-commerce platform API. Use API keys to authenticate.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# Register unified exception handlers
register_exception_handlers(app)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate Limiter Middleware
app.add_middleware(
    RateLimitMiddleware,
    max_requests=settings.RATE_LIMIT_REQUESTS,
    window_seconds=settings.RATE_LIMIT_WINDOW_SECONDS,
)

# Request ID Middleware
app.add_middleware(RequestMiddleware)

# Performance Monitoring Middleware
app.add_middleware(PerformanceMiddleware)

# Prometheus Metrics Middleware (request counters / latency histograms)
app.add_middleware(MetricsMiddleware)

# Include API router
app.include_router(api_router)


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
@app.get(
    "/health",
    summary="Health check",
    tags=["System"],
)
async def health_check(session: AsyncSession = Depends(get_db)) -> dict:
    """Health check endpoint for monitoring and load balancers.

    Checks database and Redis connectivity and returns service metadata.
    """
    db_ok = await _check_db(session)
    redis_ok = await _check_redis()
    healthy = db_ok and redis_ok
    return {
        "status": "healthy" if healthy else "degraded",
        "version": "1.0.0",
        "service": "nexora-api",
        "database": "connected" if db_ok else "unavailable",
        "redis": "connected" if redis_ok else "unavailable",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@app.get(
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


@app.get(
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
@app.get(
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
    """
    token = settings.METRICS_TOKEN
    if token:
        expected = f"Bearer {token}"
        if authorization != expected:
            raise HTTPException(status_code=401, detail="Invalid metrics token")
    return metrics_response()


# Alias under the API prefix so the frontend's `api.get('/metrics/process')`
# (which prepends /api/v1) resolves correctly.
@app.get(
    "/api/v1/metrics/process",
    summary="Process metrics (API prefix alias)",
    tags=["System"],
    response_model=dict,
)
async def process_metrics_api():
    """API-prefixed alias of /metrics/process for the dashboard card."""
    return await process_metrics()


@app.get(
    "/metrics/process",
    summary="Process metrics",
    tags=["System"],
    response_model=dict,
)
async def process_metrics():
    """Return process-level performance metrics (memory, CPU, connections)."""
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
@app.post(
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
@app.post(
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


@app.get(
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


# ---------------------------------------------------------------------------
# Serve uploaded files (avatars, logos, etc.)
# ---------------------------------------------------------------------------
_UPLOADS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "uploads")
if not os.path.isdir(_UPLOADS_DIR):
    os.makedirs(_UPLOADS_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=_UPLOADS_DIR), name="uploads")

# ---------------------------------------------------------------------------
# Serve frontend static files (production mode)
# The frontend is built to ../frontend/dist/ relative to the backend directory.
# ---------------------------------------------------------------------------
_FRONTEND_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", "frontend", "dist"
)

if os.path.isdir(_FRONTEND_DIR):
    _assets_dir = os.path.join(_FRONTEND_DIR, "assets")
    if os.path.isdir(_assets_dir):
        app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_frontend(full_path: str):
        """Serve the frontend SPA, falling back to index.html for client-side routing.

        IMPORTANT: This catch-all route MUST NOT intercept API, docs, or health paths.
        Requests for those paths that reach here are genuine 404s, not SPA routes.
        """
        # Never intercept API, docs, or health-check paths
        _RESERVED_PREFIXES = ("api/", "docs", "redoc", "openapi.json", "health")
        if full_path.startswith(_RESERVED_PREFIXES):
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=404, content={"detail": "Not found"})

        file_path = os.path.join(_FRONTEND_DIR, full_path) if full_path else ""
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(_FRONTEND_DIR, "index.html"))

    logger.info("Frontend static files mounted from %s", _FRONTEND_DIR)
else:
    logger.warning(
        "Frontend dist directory not found at %s. Run 'npm run build' in the frontend directory.",
        _FRONTEND_DIR,
    )