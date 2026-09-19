"""应用装配辅助：错误监控与中间件注册。

从 app/main.py 抽出 —— main 只保留「创建应用 + 挂载」的骨架。

⚠️ 中间件注册顺序与抽取前**完全一致**。Starlette 的 `add_middleware` 是
「后注册者更靠外层」，因此请求实际经过的顺序为：
    CORS → 限流 → 请求 ID → 性能采集 → Prometheus 指标
改动这个顺序会改变行为（例如让限流先于 CORS 生效），不要随意调整。
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.middleware.observability import MetricsMiddleware
from app.middleware.performance import PerformanceMiddleware
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.request_id import RequestMiddleware
from app.utils.logging import get_logger

logger = get_logger(__name__)


def init_sentry() -> None:
    """错误监控（Sentry）。未配置 SENTRY_DSN 时静默跳过——本地开发零副作用。"""
    dsn = (getattr(settings, "SENTRY_DSN", "") or "").strip()
    if not dsn:
        logger.info("Sentry 未启用（未配置 SENTRY_DSN）")
        return
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration

        sentry_sdk.init(
            dsn=dsn,
            environment=(getattr(settings, "SENTRY_ENV", "") or "development"),
            traces_sample_rate=float(getattr(settings, "SENTRY_TRACES_SAMPLE_RATE", 0) or 0),
            integrations=[StarletteIntegration(), FastApiIntegration(), SqlalchemyIntegration()],
            send_default_pii=False,  # 不采集个人身份信息
        )
        logger.info("Sentry 已启用 env=%s", getattr(settings, "SENTRY_ENV", "development"))
    except Exception as e:  # noqa: BLE001
        logger.warning("Sentry 初始化失败（已忽略，不影响服务）: %s", str(e)[:150])


def register_middlewares(app: FastAPI) -> None:
    """注册全站中间件（顺序见模块文档）。"""
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
