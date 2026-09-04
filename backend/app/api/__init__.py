"""Nexora - API v1 Router."""

from fastapi import APIRouter

from app.api.auth import router as auth_router
from app.api.workspaces import router as workspaces_router
from app.api.subscriptions import router as subscriptions_router
from app.api.apikeys import router as apikeys_router
from app.api.admin import router as admin_router
from app.api.admin_ops import router as admin_ops_router
from app.api.products import router as products_router
from app.api.orders import router as orders_router
from app.api.customers import router as customers_router
from app.api.health import router as health_router
from app.api.store_agent import router as store_agent_router
from app.api.stores import router as stores_router
from app.api.ai import router as ai_router
from app.api.notifications import router as notifications_router
from app.api.webhooks import router as webhooks_router
from app.api.webhooks import outbound as webhooks_outbound
from app.api.export import router as export_router
from app.api.import_csv import router as import_router
from app.api.reports import router as reports_router
from app.api.coupons import router as coupons_router
from app.api.reviews import router as reviews_router
from app.api.feedback import router as feedback_router
from app.api.permissions import router as permissions_router
from app.api.refunds import router as refunds_router
from app.api.membership import router as membership_router
from app.api.ws import router as ws_router
from app.api.payments import router as payments_router

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
api_router.include_router(admin_ops_router, tags=["Admin"])
api_router.include_router(products_router, tags=["E-Commerce - Products"])
api_router.include_router(orders_router, tags=["E-Commerce - Orders"])
api_router.include_router(customers_router, tags=["E-Commerce - Customers"])
api_router.include_router(health_router, tags=["E-Commerce - Health"])
api_router.include_router(store_agent_router, tags=["AI - Store Sentinel Agent"])
api_router.include_router(stores_router, tags=["E-Commerce - Stores"])
api_router.include_router(ai_router, tags=["E-Commerce - AI"])
api_router.include_router(notifications_router, tags=["Notifications"])
api_router.include_router(webhooks_router, tags=["Webhooks"])
api_router.include_router(webhooks_outbound, tags=["Outbound Webhooks"])
api_router.include_router(export_router, tags=["Export"])
api_router.include_router(import_router, tags=["Import"])
api_router.include_router(reports_router, tags=["Reports"])
api_router.include_router(coupons_router, tags=["E-Commerce - Coupons"])
api_router.include_router(reviews_router, tags=["E-Commerce - Reviews"])
api_router.include_router(feedback_router, tags=["Feedback"])
api_router.include_router(permissions_router, tags=["Permissions"])
api_router.include_router(refunds_router, tags=["E-Commerce - Refunds"])
api_router.include_router(membership_router, tags=["E-Commerce - Membership"])
api_router.include_router(ws_router, tags=["WebSocket"])
api_router.include_router(payments_router, tags=["E-Commerce - Payments"])