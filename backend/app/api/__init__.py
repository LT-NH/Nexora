"""Nexora - API v1 Router."""

from fastapi import APIRouter

from app.api.auth import router as auth_router
from app.api.workspaces import router as workspaces_router
from app.api.subscriptions import router as subscriptions_router
from app.api.apikeys import router as apikeys_router
from app.api.admin import router as admin_router
from app.api.products import router as products_router
from app.api.orders import router as orders_router
from app.api.customers import router as customers_router
from app.api.stores import router as stores_router
from app.api.ai import router as ai_router
from app.api.notifications import router as notifications_router
from app.api.webhooks import router as webhooks_router
from app.api.export import router as export_router
from app.api.search import router as search_router
from app.api.reports import router as reports_router

api_router = APIRouter(prefix="/api/v1")


@api_router.get("", summary="API root")
@api_router.get("/", summary="API root")
async def api_root() -> dict:
    """Root endpoint for the API v1."""
    return {
        "service": "Nexora API",
        "version": "1.0.0",
        "docs": "/docs",
        "redoc": "/redoc",
    }


api_router.include_router(auth_router, tags=["Authentication"])
api_router.include_router(workspaces_router, tags=["Workspaces"])
api_router.include_router(subscriptions_router, tags=["Subscriptions"])
api_router.include_router(apikeys_router, tags=["API Keys"])
api_router.include_router(admin_router, tags=["Admin"])
api_router.include_router(products_router, tags=["E-Commerce - Products"])
api_router.include_router(orders_router, tags=["E-Commerce - Orders"])
api_router.include_router(customers_router, tags=["E-Commerce - Customers"])
api_router.include_router(stores_router, tags=["E-Commerce - Stores"])
api_router.include_router(ai_router, tags=["E-Commerce - AI"])
api_router.include_router(notifications_router, tags=["Notifications"])
api_router.include_router(webhooks_router, tags=["Webhooks"])
api_router.include_router(export_router, tags=["Export"])
api_router.include_router(search_router, tags=["Search"])
api_router.include_router(reports_router, tags=["Reports"])