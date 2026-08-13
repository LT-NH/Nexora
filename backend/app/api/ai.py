"""Nexora - AI Intelligence API Routes.

Provides AI-powered features: product description, SEO keywords,
sales trend analysis, customer insights, and marketing copy generation.
"""

import asyncio
from typing import Annotated, Optional

import json

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import _require_member
from app.database import get_db
from app.middleware.auth import get_principal, AuthContext
from app.models.customer import Customer
from app.models.order import Order, OrderStatus
from app.models.user import User
from app.models.workspace import WorkspaceRole
from app.schemas.ai import AIChatRequest
from app.services.ai import AIService
from app.services.ai_agent import BIAgent
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

    # 千问网络调用可能较慢：4s 超时保护，避免阻塞 asyncio 事件循环（其他接口排队）
    try:
        analysis = await asyncio.wait_for(
            AIService.analyze_sales_trend(order_dicts), timeout=4.0
        )
    except asyncio.TimeoutError:
        analysis = {
            "trend": "stable",
            "forecast": {"next_7_days": 0, "confidence": "low"},
            "peak_days": [],
            "recommendations": ["AI 深度分析超时，已返回基础统计，请稍后重试"],
        }

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


@router.post("/chat/stream", summary="AI 对话流式输出 (SSE)")
async def ai_chat_stream(
    slug: str,
    body: dict,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Stream an AI chat response via Server-Sent Events (SSE).

    The endpoint returns a ``text/event-stream`` response. Each SSE event
    carries a JSON payload ``{"content": "<chunk>"}`` with a piece of the
    AI-generated text. Falls back to a rule-based response when no Qwen
    API key is configured.
    """
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)

    async def generate():
        async for chunk in AIService.stream_chat(
            body.get("prompt", ""),
            {"workspace_id": workspace.id},
            db=db,
            history=body.get("history") or [],
        ):
            yield f"data: {json.dumps({'content': chunk})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/chat", summary="AI 自然语言 BI 问答")
async def ai_bi_chat(
    slug: str,
    body: AIChatRequest,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Answer a business question in natural language.

    Detects the intent from the question, queries the real database
    (scoped to the workspace), and returns a structured dict with
    ``intent`` / ``answer_text`` / ``data`` / ``chart_type`` / ``suggestion``
    that the frontend renders as text, table and chart.
    """
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    return await BIAgent.answer(
        db, workspace.id, principal.user_id, body.question, history=body.history
    )


@router.get("/weekly-summary", summary="AI 周报摘要")
async def ai_weekly_summary(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Return an AI-generated summary of this week's business performance.

    Runs the same weekly-report queries used by the email report, then
    produces a Chinese summary (3 highlights + 1 risk + 1 suggestion).
    """
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    from app.services.report import (  # noqa: PLC0415 - local import to avoid cycles
        collect_weekly_report_data,
        generate_ai_summary,
    )

    report_data = await collect_weekly_report_data(db, workspace.id)
    summary = await generate_ai_summary(db, workspace.id, report_data)
    return {"summary": summary, "report_data": report_data}


@router.get("/pricing", summary="AI 定价建议")
async def ai_pricing_suggestion(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Return per-product pricing suggestions based on stock coverage."""
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    items = await BIAgent.pricing_suggestion(db, workspace.id)
    return {"items": items}