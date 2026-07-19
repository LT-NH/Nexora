"""Nexora - AI Intelligence API Routes.

Provides AI-powered features: product description, SEO keywords,
sales trend analysis, customer insights, and marketing copy generation.
"""

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import _require_member
from app.database import get_db
from app.middleware.auth import get_principal, AuthContext
from app.models.customer import Customer
from app.models.order import Order, OrderStatus
from app.models.user import User
from app.models.workspace import WorkspaceRole
from app.services.ai import AIService
from app.utils.logging import get_logger

router = APIRouter(prefix="/workspaces/{slug}/ai")
logger = get_logger(__name__)


@router.post("/generate-description", summary="AI 生成商品描述")
async def generate_product_description(
    slug: str,
    body: dict,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Generate a product description with AI."""
    await _require_member(slug, principal, db, WorkspaceRole.VIEWER)

    tone_map = {"professional": "professional", "casual": "casual", "lively": "casual",
                "premium": "luxury", "luxury": "luxury"}
    tone = tone_map.get(body.get("style", "professional"), "professional")
    selling_points = body.get("selling_points", "")
    features = [s.strip() for s in selling_points.split("\n") if s.strip()] if selling_points else []

    result = await AIService.generate_product_description(
        name=body.get("product_name", ""),
        category=body.get("category", ""),
        features=features,
        target_platform=body.get("platform", "general"),
        tone=tone,
    )
    return {
        "title": result.get("title", ""),
        "description": result.get("description", ""),
        "highlights": result.get("bullet_points", []),
        "tags": result.get("bullet_points", [])[:5],
    }


@router.post("/seo-keywords", summary="AI 生成 SEO 关键词")
async def generate_seo_keywords(
    slug: str,
    body: dict,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Generate SEO keywords for a product."""
    await _require_member(slug, principal, db, WorkspaceRole.VIEWER)

    result = await AIService.generate_seo_keywords(
        name=body.get("product_name", ""),
        category=body.get("category", ""),
        description=body.get("description", ""),
    )
    return {"keywords": result}


@router.post("/analyze-sales", summary="AI 分析销售趋势")
async def analyze_sales_trend(
    slug: str,
    body: dict,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Analyze sales trends and generate insights."""
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)

    # Fetch recent orders for analysis
    result = await db.execute(
        select(Order).where(
            Order.workspace_id == workspace.id,
        ).order_by(Order.created_at.desc()).limit(200)
    )
    orders = result.scalars().all()

    order_dicts = []
    for order in orders:
        order_dicts.append({
            "total": float(order.total),
            "status": order.status.value if hasattr(order.status, "value") else str(order.status),
            "created_at": order.created_at.isoformat() if order.created_at else None,
            "platform": order.platform,
        })

    analysis = await AIService.analyze_sales_trend(order_dicts)

    # Add workspace-specific stats
    return {
        "workspace_id": workspace.id,
        "total_orders_analyzed": len(orders),
        **analysis,
    }


@router.post("/customer-insights", summary="AI 客户洞察分析")
async def customer_insights(
    slug: str,
    body: dict,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Generate AI-powered customer insights."""
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)

    customers_result = await db.execute(
        select(Customer).where(Customer.workspace_id == workspace.id)
    )
    customers = customers_result.scalars().all()

    customer_dicts = []
    # Batch query all orders for all customers (fix N+1)
    customer_ids = [c.id for c in customers]
    all_orders_result = await db.execute(
        select(Order).where(
            Order.customer_id.in_(customer_ids),
            Order.workspace_id == workspace.id,
        )
    )
    all_orders = all_orders_result.scalars().all()
    orders_by_customer: dict[str, list[Order]] = {}
    for o in all_orders:
        orders_by_customer.setdefault(o.customer_id, []).append(o)

    for customer in customers:
        customer_orders = orders_by_customer.get(customer.id, [])

        customer_dicts.append({
            "name": customer.name,
            "email": customer.email,
            "total_orders": len(customer_orders),
            "total_spent": float(customer.total_spent),
            "tags": customer.tags if isinstance(customer.tags, list) else [],
            "source": customer.source,
            "last_order_at": customer.last_order_at.isoformat() if customer.last_order_at else None,
            "created_at": customer.created_at.isoformat() if customer.created_at else None,
        })

    insights = await AIService.customer_insights(customer_dicts)
    return {
        "workspace_id": workspace.id,
        "total_customers": len(customers),
        **insights,
    }


@router.post("/marketing-copy", summary="AI 生成营销文案")
async def generate_marketing_copy(
    slug: str,
    body: dict,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Generate marketing copy for a product."""
    await _require_member(slug, principal, db, WorkspaceRole.VIEWER)

    product = {
        "name": body.get("product_name", ""),
        "category": body.get("category", ""),
        "price": body.get("price", 0),
        "features": body.get("features", []),
    }
    channel = body.get("channel", "taobao")

    copy = await AIService.generate_marketing_copy(product, channel)
    return {
        "channel": channel,
        "copy": copy,
    }