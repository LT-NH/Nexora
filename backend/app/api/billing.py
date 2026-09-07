"""Nexora - Billing / Subscription API.

订阅收款闭环（微信 Native 扫码）：
    GET  /plans                     套餐列表（Free/Pro/Enterprise，来自 seed_default_plans）
    GET  /status                    当前工作空间订阅状态（超管 → is_admin=True，全功能免费）
    POST /checkout                  下单（生成微信 Native code_url；sandbox 模式返回模拟码）
    GET  /order/{order_id}          轮询订单状态（前端扫码后轮询）
    POST /sandbox-confirm/{oid}     【仅 sandbox】模拟支付成功，激活订阅
    POST /wechat/notify             微信异步回调（全局路由，验签解密 → 激活订阅）

超管（is_superadmin）账号无需订阅、不进付费流程：/status 返回 is_admin，
checkout 直接拒绝。真实凭据（WXPAY_* env）就绪时自动切真实微信通道，sandbox 端点自动失效。
"""

import json
from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import _require_member
from app.database import get_db
from app.middleware.auth import AuthContext, get_principal
from app.models.subscription import Subscription, SubscriptionPlan, SubscriptionStatus, PaymentStatus
from app.models.subscription_order import SubscriptionOrder
from app.models.workspace import Workspace, WorkspaceRole
from app.services.wechat_pay import create_native_order, verify_and_decrypt_notify, wechat_enabled
from app.utils.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/workspaces/{slug}/billing", tags=["Billing - Subscription"])
public_router = APIRouter(prefix="/billing", tags=["Billing - WeChat Notify"])

PERIOD_MONTHS = {"month": 1, "year": 12}


def _is_admin(principal: AuthContext) -> bool:
    u = getattr(principal, "user", None)
    return bool(u is not None and getattr(u, "is_superadmin", False))


async def _activate_subscription(db: AsyncSession, order: SubscriptionOrder) -> None:
    """支付成功后：激活/续期工作空间订阅。"""
    plan = (
        await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.slug == order.plan_slug))
    ).scalar_one_or_none()
    if plan is None:
        raise RuntimeError(f"plan {order.plan_slug} 不存在")
    months = PERIOD_MONTHS.get(order.period, 1)
    now = datetime.utcnow()
    # 每个工作空间只保留一条当前订阅：换购/续费都更新同一条，避免同秒多行导致状态混乱
    sub = (
        await db.execute(
            select(Subscription).where(
                Subscription.workspace_id == order.workspace_id,
            ).order_by(Subscription.created_at.desc()).limit(1)
        )
    ).scalar_one_or_none()
    if sub is None:
        sub = Subscription(workspace_id=order.workspace_id, plan_id=plan.id)
        db.add(sub)
    else:
        sub.plan_id = plan.id
    # 续费叠加：未过期则从 current_period_end 顺延
    base = sub.current_period_end.replace(tzinfo=None) if (sub.current_period_end and sub.current_period_end.replace(tzinfo=None) > now) else now
    sub.status = SubscriptionStatus.ACTIVE
    sub.payment_status = PaymentStatus.VERIFIED
    sub.current_period_start = now
    sub.current_period_end = base + timedelta(days=30 * months)
    await db.commit()


@router.get("/plans", summary="套餐列表")
async def list_plans(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    rows = (
        await db.execute(
            select(SubscriptionPlan).where(SubscriptionPlan.is_active == True).order_by(SubscriptionPlan.price_monthly)  # noqa: E712
        )
    ).scalars().all()
    return {
        "is_admin": _is_admin(principal),
        "plans": [
            {
                "id": p.id,
                "slug": p.slug,
                "name": p.name,
                "price_monthly": float(p.price_monthly),
                "price_yearly": float(p.price_yearly),
                "max_members": p.max_members,
                "max_workspaces": p.max_workspaces,
                "features": p.features or {},
            }
            for p in rows
        ],
    }


@router.get("/status", summary="当前订阅状态")
async def subscription_status(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    if _is_admin(principal):
        return {"is_admin": True, "plan": None, "status": "admin_free", "note": "超管账号 · 全功能免费，无需订阅"}
    sub = (
        await db.execute(
            select(Subscription).where(Subscription.workspace_id == workspace.id)
            .order_by(Subscription.created_at.desc()).limit(1)
        )
    ).scalar_one_or_none()
    if sub is None:
        return {"is_admin": False, "plan": None, "status": "none"}
    plan = await db.get(SubscriptionPlan, sub.plan_id)
    end = sub.current_period_end.replace(tzinfo=None) if sub.current_period_end else None
    expired = bool(end and end < datetime.utcnow())
    return {
        "is_admin": False,
        "plan": {"slug": plan.slug, "name": plan.name} if plan else None,
        "status": "expired" if expired else str(sub.status.value if hasattr(sub.status, "value") else sub.status),
        "current_period_end": end.isoformat() if end else None,
    }


@router.post("/checkout", summary="下单开通/升级套餐（微信 Native 扫码）")
async def checkout(
    slug: str,
    body: dict,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    if _is_admin(principal):
        raise HTTPException(status_code=403, detail="超管账号无需订阅，全功能免费")
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.OWNER)
    plan_slug = str(body.get("plan_slug") or "")
    period = str(body.get("period") or "month")
    if period not in PERIOD_MONTHS:
        raise HTTPException(status_code=400, detail="period 仅支持 month/year")
    plan = (
        await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.slug == plan_slug, SubscriptionPlan.is_active == True))  # noqa: E712
    ).scalar_one_or_none()
    if plan is None:
        raise HTTPException(status_code=404, detail="套餐不存在")
    if plan.slug == "free":
        raise HTTPException(status_code=400, detail="Free 套餐无需购买")
    amount = float(plan.price_yearly if period == "year" else plan.price_monthly)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="该套餐价格异常")

    from app.config import settings
    notify_url = settings.WXPAY_NOTIFY_URL or f"{settings.PUBLIC_BASE_URL}/api/v1/billing/wechat/notify"
    try:
        wx = await create_native_order(amount, f"Nexora {plan.name} {period}", notify_url)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(e)[:180])

    order = SubscriptionOrder(
        workspace_id=workspace.id,
        user_id=principal.user_id,
        plan_slug=plan.slug,
        plan_name=plan.name,
        period=period,
        amount=amount,
        method="wechat_native",
        status="pending",
        code_url=wx["code_url"],
        out_trade_no=wx["out_trade_no"],
        sandbox=wx["sandbox"],
    )
    db.add(order)
    await db.commit()
    return {
        "order_id": order.id,
        "code_url": order.code_url,
        "sandbox": order.sandbox,
        "amount": amount,
        "plan": {"slug": plan.slug, "name": plan.name},
        "period": period,
    }


@router.get("/order/{order_id}", summary="订单状态（扫码后轮询）")
async def order_status(
    slug: str,
    order_id: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    order = await db.get(SubscriptionOrder, order_id)
    if order is None or order.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="订单不存在")
    # 超时过期：pending 超 2 小时置 expired
    if order.status == "pending" and order.created_at and (datetime.utcnow() - order.created_at).total_seconds() > 7200:
        order.status = "expired"
        await db.commit()
    return {"order_id": order.id, "status": order.status, "sandbox": order.sandbox, "amount": order.amount,
            "plan": {"slug": order.plan_slug, "name": order.plan_name}, "period": order.period}


@router.post("/sandbox-confirm/{order_id}", summary="【仅 sandbox】模拟支付成功")
async def sandbox_confirm(
    slug: str,
    order_id: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.OWNER)
    order = await db.get(SubscriptionOrder, order_id)
    if order is None or order.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="订单不存在")
    if wechat_enabled():
        raise HTTPException(status_code=400, detail="已配置真实微信通道，sandbox 确认不可用")
    if order.status != "pending":
        raise HTTPException(status_code=400, detail=f"订单状态为 {order.status}，不可确认")
    order.status = "paid"
    order.paid_at = datetime.utcnow()
    order.provider_trade_no = f"SANDBOX{order.id[:12].upper()}"
    await _activate_subscription(db, order)
    return {"paid": True, "order_id": order.id}


@public_router.post("/wechat/notify", summary="微信支付异步回调（全局，无鉴权，验签解密）")
async def wechat_notify(request: Request, db: Annotated[AsyncSession, Depends(get_db)]) -> dict:
    if not wechat_enabled():
        raise HTTPException(status_code=400, detail="微信通道未配置")
    body = await request.body()
    try:
        headers_dict = {k.lower(): v for k, v in request.headers.items()}
        data = verify_and_decrypt_notify(headers_dict, body)
    except Exception as e:  # noqa: BLE001
        logger.warning("wxpay notify verify failed: %s", str(e)[:200])
        return {"code": "FAIL", "message": str(e)[:120]}
    out_trade_no = data.get("out_trade_no")
    order = (
        await db.execute(
            select(SubscriptionOrder).where(SubscriptionOrder.out_trade_no == out_trade_no).limit(1)
        )
    ).scalar_one_or_none()
    if order is None:
        return {"code": "FAIL", "message": "order not found"}
    if order.status != "paid":
        order.status = "paid"
        order.provider_trade_no = data.get("transaction_id")
        order.paid_at = datetime.utcnow()
        await _activate_subscription(db, order)
    return {"code": "SUCCESS", "message": "OK"}
