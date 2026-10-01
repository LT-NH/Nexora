"""Nexora - Main Application Entry Point.

本文件只负责**应用装配**：创建 FastAPI 实例、挂载中间件与路由、生命周期
钩子、静态资源。业务与基础设施细节已拆到各自模块（2026-09-19 拆分前本文件
有 616 行，混杂了套餐矩阵、Sentry、定时任务、健康探针等）：

  app/plan_matrix.py   套餐能力矩阵与默认套餐种子
  app/bootstrap.py     Sentry 初始化与中间件注册
  app/scheduler.py     常驻定时任务（备份 / 周报 / 巡检 / 巡店 / 店铺同步）
  app/api/system.py    健康探针、Prometheus 指标、超管运维触发端点
  app/version.py       产品版本号唯一来源
"""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api import api_router
from app.api.system import router as system_router
from app.bootstrap import init_sentry, register_middlewares
from app.config import settings
from app.database import init_db
from app.plan_matrix import seed_default_plans
from app.scheduler import shutdown_scheduler, start_scheduler
from app.utils.exceptions import register_exception_handlers
from app.utils.logging import get_logger, setup_logging

# Initialize structured logging
setup_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler.

    On startup:
        - Creates all database tables.
        - Seeds default subscription plans (Free, Pro, Enterprise).
        - Validates that SECRET_KEY is not using the default value.
        - Starts the scheduler (failures are logged, never block startup).

    On shutdown:
        - Stops the scheduler.
    """
    logger.info("Starting Nexora API...")

    await init_db()
    logger.info("Database tables initialized.")

    # 装载 AI 模型注册表：补齐内置目录、校准唯一 active、预热进程内缓存。
    # 这样 _get_qwen_config() 在热路径上无需查库即可拿到当前模型。
    from app.services import model_registry

    active_model = await model_registry.hydrate()
    logger.info("Active AI model: %s", active_model)

    # Validate critical secrets (SECRET_KEY strength, etc.)
    for warning in settings.validate_critical_secrets():
        logger.warning(warning)

    try:
        await seed_default_plans()
        logger.info("Default subscription plans seeded.")
    except Exception as e:
        logger.error("Failed to seed default subscription plans: %s", str(e))

    start_scheduler()

    logger.info("Nexora API is ready.")
    yield
    # Shutdown
    shutdown_scheduler()
    logger.info("Shutting down Nexora API.")


# Create FastAPI application
app = FastAPI(
    title="Nexora API",
    description="Multi-tenant e-commerce platform API. Use API keys to authenticate.",
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# Register unified exception handlers
register_exception_handlers(app)

# 错误监控（未配置 SENTRY_DSN 时静默跳过）
init_sentry()

# 中间件链（顺序见 app/bootstrap.py 的模块文档）
register_middlewares(app)

# 业务 API（/api/v1 前缀）+ 系统端点（根路径，不加 prefix）
app.include_router(api_router)
app.include_router(system_router)


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
# 只有**真的有 index.html** 时才挂载 SPA 回退。
# 此前只判断目录存在：若 dist 是残留的半成品（有 assets 但没 index.html —— 例如
# 构建被中断），任何未匹配路由都会落到 catch-all 并抛
# `RuntimeError: File ... does not exist`，客户端拿到 500 而不是干净的 404。
_FRONTEND_INDEX = os.path.join(_FRONTEND_DIR, "index.html")

if os.path.isfile(_FRONTEND_INDEX):
    # 解析后的真实根目录，用于 catch-all 路由的越界归属校验（防止 `..` / 软链逃逸）。
    _FRONTEND_ROOT = Path(_FRONTEND_DIR).resolve()
    _assets_dir = os.path.join(_FRONTEND_DIR, "assets")
    if os.path.isdir(_assets_dir):
        app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_frontend(full_path: str):
        """Serve the frontend SPA, falling back to index.html for client-side routing.

        IMPORTANT: This catch-all route MUST NOT intercept API, docs, or health paths.
        Requests for those paths that reach here are genuine 404s, not SPA routes.

        SECURITY: ``full_path`` is attacker-controlled. It is resolved to a real
        path and must stay inside ``_FRONTEND_ROOT``; anything that escapes
        (``../..``, URL-encoded variants, symlinks, absolute paths) falls back to
        the SPA entrypoint instead of being served. Without this check a single
        request like ``/..%2f..%2fbackend%2f.env`` would disclose arbitrary files.
        """
        # Never intercept API, docs, or health-check paths
        _RESERVED_PREFIXES = ("api/", "docs", "redoc", "openapi.json", "health")
        if full_path.startswith(_RESERVED_PREFIXES):
            return JSONResponse(status_code=404, content={"detail": "Not found"})

        target: Path | None = None
        if full_path:
            try:
                candidate = (_FRONTEND_ROOT / full_path).resolve()
                if candidate.is_relative_to(_FRONTEND_ROOT) and candidate.is_file():
                    target = candidate
            except (OSError, ValueError):
                # 非法路径段（空字节、超长路径、平台拒绝的字符等）：按 SPA 路由处理
                target = None

        if target is not None:
            return FileResponse(target)
        # 运行期 index.html 被删也要给干净的 404，而不是 500
        if not os.path.isfile(_FRONTEND_INDEX):
            return JSONResponse(
                status_code=404,
                content={
                    "detail": "前端构建产物缺失（frontend/dist/index.html）。"
                    "请在 frontend 目录执行 npm run build，或改用 dev server 运行前端。"
                },
            )
        return FileResponse(_FRONTEND_ROOT / "index.html")

    logger.info("Frontend static files mounted from %s", _FRONTEND_DIR)
else:
    logger.warning(
        "Frontend static files NOT mounted: %s 不存在或不含 index.html。"
        "请在 frontend 目录执行 npm run build（未挂载时未匹配路由会返回干净的 404）。",
        _FRONTEND_DIR,
    )
