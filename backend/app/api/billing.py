"""Nexora - Billing / Subscription API.

订阅收款闭环（微信 Native 扫码）：
    GET  /plans                     套餐列表（Free/Pro/Enterprise，来自 seed_default_plans）
    GET  /status                    当前工作空间订阅状态（超管 → is_admin=True，全功能免费）
    POST /checkout                  下单（生成微信 Native code_url；sandbox 模式返回模拟码）
    GET  /order/{order_id}          轮询订单状态（前端扫码后轮询）
    POST /sandbox-confirm/{oid}     【仅非生产环境】模拟支付成功，激活订阅
    POST /wechat/notify             微信异步回调（全局路由，验签解密 → 激活订阅）

超管（is_superadmin）账号无需订阅、不进付费流程：/status 返回 is_admin，
checkout 直接拒绝。真实凭据（WXPAY_* env）就绪时自动切真实微信通道。

sandbox-confirm 是本地演示用的调试端点，只在 ENVIRONMENT != production
且订单本身是 sandbox 订单时可用；生产环境一律 404。
"""

import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import _require_member
from app.config import settings
from app.database import get_db
from app.middleware.auth import AuthContext, get_principal
from app.models.subscription import Subscription, SubscriptionPlan, SubscriptionStatus, PaymentStatus
from app.models.subscription_order import SubscriptionOrder
from app.models.workspace import Workspace, WorkspaceRole
from app.services.wechat_pay import create_native_order, verify_and_decrypt_notify, wechat_enabled
from app.utils.logging import get_logger
from app.utils.timeutils import to_naive_utc

logger = get_logger(__name__)

router = APIRouter(prefix="/workspaces/{slug}/billing", tags=["Billing - Subscription"])
public_router = APIRouter(prefix="/billing", tags=["Billing - WeChat Notify"])

PERIOD_MONTHS = {"month": 1, "year": 12}


def _new_alipay_trade_no() -> str:
    """生成支付宝商户订单号：时间戳 + 8 位随机。

    原实现是 ``f"NEXAL{int(time.time())}{plan.slug[:2]}"`` —— 精度只到「秒」，
    同一秒内两个工作空间购买同档套餐会得到**完全相同**的 out_trade_no。
    而回调是按 out_trade_no 匹配订单再 ``.limit(1)`` 取一条，这意味着可能
    激活错误租户的订单。加上 8 位随机十六进制后碰撞概率可忽略，且仍可人工阅读。
    """
    return (
        f"NEXAL{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
        f"{uuid.uuid4().hex[:8].upper()}"
    )


def _is_subscription_live(sub: Subscription, now: datetime) -> bool:
    """订阅当前是否仍然生效（周期尚未走完）。

    判定优先级：**付费周期 > 试用期**；两者都为 ``None`` 表示无限期 ——
    Free 套餐没有到期概念（见 services/workspace.py 里的说明）。

    为什么必须显式判断：``status == ACTIVE`` 只表示「订阅关系存在」，
    并不代表周期还没走完。此前 trial_ends_at / current_period_end 只被写入、
    从未被读取做判断，导致试用期结束后订阅仍是 ACTIVE，用户可无限期使用
    付费功能且不会被扣费。

    时间比较一律经 ``to_naive_utc``：SQLite 取回 naive、PostgreSQL 可能返回
    aware，直接比较会抛 TypeError。
    """
    deadline = to_naive_utc(sub.current_period_end or sub.trial_ends_at)
    if deadline is None:
        return True
    return deadline > now


async def get_ws_plan_tier(db: AsyncSession, ws_id: str) -> str:
    """工作空间有效档位（free/pro/enterprise）。

    取「生效中(ACTIVE)」订阅中的**最高档**——而不是最新一条，
    避免历史换购遗留的堆叠记录把用户档位判低（曾导致 Enterprise 用户被误拦）。

    同时过滤掉**周期已走完**的订阅：ACTIVE 只说明订阅关系在，不代表还在服务期内。
    """
    from sqlalchemy import select as _select

    tier_rank = {"free": 0, "pro": 1, "enterprise": 2}
    subs = (
        await db.execute(
            _select(Subscription).where(
                Subscription.workspace_id == ws_id,
                Subscription.status == SubscriptionStatus.ACTIVE,
            )
        )
    ).scalars().all()

    now = to_naive_utc(datetime.now(timezone.utc))
    best = "free"
    for sub in subs:
        if not _is_subscription_live(sub, now):
            continue  # 周期已过，不计入档位
        plan = await db.get(SubscriptionPlan, sub.plan_id)
        slug = (plan.slug if plan else "free") or "free"
        if tier_rank.get(slug, 0) > tier_rank.get(best, 0):
            best = slug
    return best


async def resolve_workspace_tier(
    db: AsyncSession, ws_id: str, principal: AuthContext | None = None
) -> str:
    """档位解析的**统一入口**。

    超管直通 enterprise，其余按有效订阅取最高档。

    为什么要有这个函数：超管判断此前散落在各调用点 —— ``api/ai.py`` 的
    ``_ensure_ai_tier`` 记得跳过超管，但 ``api/store_agent.py`` 的 ``_ws_plan_tier``
    漏了，于是超管在巡店 Agent 上反而会被当普通用户拦。
    合并到一处，避免以后再漏。新增门控请一律走这里。
    """
    if principal is not None and _is_admin(principal):
        return "enterprise"
    return await get_ws_plan_tier(db, ws_id)


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

    # 必须在覆盖 plan_id 之前快照原状态，否则无法区分「续费」与「换套餐」
    previous_plan_id = sub.plan_id if sub is not None else None
    previous_payment_status = sub.payment_status if sub is not None else None
    previous_period_end = to_naive_utc(sub.current_period_end) if sub is not None else None

    if sub is None:
        sub = Subscription(workspace_id=order.workspace_id, plan_id=plan.id)
        db.add(sub)
    else:
        sub.plan_id = plan.id

    # 周期计算：只有「同一付费套餐的续费」才从原周期终点顺延；
    # 首次购买与跨套餐换购一律从付款时刻起算。
    # 原先无条件相信 current_period_end，而 Free 套餐曾遗留一个「10 年后到期」的
    # 虚假日期，导致付一次 ¥99 实际拿到约 10 年服务。
    is_renewal_of_same_paid_plan = (
        previous_plan_id == plan.id
        and previous_payment_status == PaymentStatus.VERIFIED
        and previous_period_end is not None
        and previous_period_end > now
    )
    base = previous_period_end if is_renewal_of_same_paid_plan else now

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
    method = str(body.get("method") or "wechat")
    if method not in ("wechat", "alipay"):
        raise HTTPException(status_code=400, detail="method 仅支持 wechat/alipay")
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

    sandbox_flag = False
    pay_content: dict = {}

    if method == "alipay":
        from app.services.alipay_pay import alipay_enabled, build_page_pay_form
        if alipay_enabled():
            notify_url = settings.ALIPAY_NOTIFY_URL or f"{settings.PUBLIC_BASE_URL}/api/v1/billing/alipay/notify"
            out_trade_no = _new_alipay_trade_no()
            form_html = build_page_pay_form(out_trade_no, amount, f"Nexora {plan.name} {period}", notify_url)
            pay_content = {"method": "alipay", "form_html": form_html, "out_trade_no": out_trade_no, "sandbox": False}
        else:
            sandbox_flag = True
            pay_content = {"method": "alipay", "sandbox": True}
    else:
        notify_url = settings.WXPAY_NOTIFY_URL or f"{settings.PUBLIC_BASE_URL}/api/v1/billing/wechat/notify"
        try:
            wx = await create_native_order(amount, f"Nexora {plan.name} {period}", notify_url)
            pay_content = {"method": "wechat", "code_url": wx["code_url"], "out_trade_no": wx["out_trade_no"], "sandbox": wx["sandbox"]}
            sandbox_flag = wx["sandbox"]
        except Exception as e:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=str(e)[:180])

    order = SubscriptionOrder(
        workspace_id=workspace.id,
        user_id=principal.user_id,
        plan_slug=plan.slug,
        plan_name=plan.name,
        period=period,
        amount=amount,
        method="alipay_webpay" if method == "alipay" else "wechat_native",
        status="pending",
        code_url=pay_content.get("form_html") or pay_content.get("code_url"),
        out_trade_no=pay_content.get("out_trade_no"),
        sandbox=bool(sandbox_flag),
    )
    db.add(order)
    await db.commit()
    return {
        "order_id": order.id,
        "method": order.method,
        "code_url": order.code_url,
        "form_html": order.code_url if order.method == "alipay_webpay" else None,
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

    # 三重防线。原先只判断 wechat_enabled()，与订单实际走的通道脱钩 ——
    # 生产环境一旦漏配微信凭据（证书丢失、路径写错、env 未注入），任何 OWNER
    # 都能把自己下的真实订单自助置为已付并激活订阅，直接造成资损。
    if settings.ENVIRONMENT == "production":
        logger.warning(
            "sandbox-confirm called in production (workspace=%s, order=%s, user=%s) — rejected",
            workspace.slug, order_id, principal.user_id,
        )
        # 故意返回 404：不向外界暴露该调试端点的存在
        raise HTTPException(status_code=404, detail="Not found")
    if wechat_enabled():
        raise HTTPException(status_code=400, detail="已配置真实微信通道，sandbox 确认不可用")
    if not order.sandbox:
        raise HTTPException(status_code=400, detail="该订单不是 sandbox 订单，不可自助确认")
    if order.status != "pending":
        raise HTTPException(status_code=400, detail=f"订单状态为 {order.status}，不可确认")
    order.status = "paid"
    order.paid_at = datetime.utcnow()
    order.provider_trade_no = f"SANDBOX{order.id[:12].upper()}"
    await _activate_subscription(db, order)
    return {"paid": True, "order_id": order.id}



@public_router.post("/alipay/notify", summary="支付宝异步通知（表单回传，RSA2 验签后激活订阅）")
async def alipay_notify(request: Request, db: Annotated[AsyncSession, Depends(get_db)]) -> str:
    from app.services.alipay_pay import alipay_enabled, verify_notify_sign

    if not alipay_enabled():
        return "fail"
    form = await request.form()
    params = {k: str(v) for k, v in form.items()}
    if params.get("trade_status") not in ("TRADE_SUCCESS", "TRADE_FINISHED"):
        return "fail"
    if not verify_notify_sign(params):
        logger.warning("alipay notify sign invalid: %s", params.get("out_trade_no"))
        return "fail"
    out_trade_no = params.get("out_trade_no")
    order = (
        await db.execute(
            select(SubscriptionOrder).where(SubscriptionOrder.out_trade_no == out_trade_no).limit(1)
        )
    ).scalar_one_or_none()
    if order is None:
        return "fail"

    # 校验归属与金额：验签只能证明「报文来自支付宝」，不能证明「这就是本应用、
    # 本订单应得的钱」。缺了这两项，理论上可以用其他应用的合法回调、或用一笔
    # 低价订单的付款去激活高价套餐。
    if str(params.get("app_id") or "") != str(settings.ALIPAY_APP_ID or ""):
        logger.warning("alipay notify app_id 不匹配: %s", params.get("app_id"))
        return "fail"
    try:
        notified_amount = float(params.get("total_amount") or "nan")
    except (TypeError, ValueError):
        logger.warning("alipay notify 金额字段非法: %s", params.get("total_amount"))
        return "fail"
    if abs(notified_amount - float(order.amount)) > 0.01:
        logger.warning(
            "alipay notify 金额不匹配: order=%s 应付=%.2f 实付=%.2f",
            order.id, float(order.amount), notified_amount,
        )
        return "fail"

    if order.status != "paid":
        order.status = "paid"
        order.provider_trade_no = params.get("trade_no")
        order.paid_at = datetime.utcnow()
        await _activate_subscription(db, order)
    return "success"


@public_router.post("/wechat/notify", summary="微信支付异步回调（全局，无鉴权，验签解密）")
async def wechat_notify(request: Request, db: Annotated[AsyncSession, Depends(get_db)]) -> dict:
    if not wechat_enabled():
        raise HTTPException(status_code=400, detail="微信通道未配置")
    body = await request.body()
    try:
        headers_dict = {k.lower(): v for k, v in request.headers.items()}
        data = await verify_and_decrypt_notify(headers_dict, body)
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

    # 金额校验：防止「用一笔低价订单的付款激活高价套餐」。
    expected_fen = int(round(float(order.amount) * 100))
    try:
        paid_fen = int(data.get("amount_total"))
    except (TypeError, ValueError):
        logger.warning("wxpay notify 缺少金额字段: order=%s", order.id)
        return {"code": "FAIL", "message": "amount missing"}
    if paid_fen != expected_fen:
        logger.warning(
            "wxpay notify 金额不匹配: order=%s 应付=%d分 实付=%d分",
            order.id, expected_fen, paid_fen,
        )
        return {"code": "FAIL", "message": "amount mismatch"}

    if order.status != "paid":
        order.status = "paid"
        order.provider_trade_no = data.get("transaction_id")
        order.paid_at = datetime.utcnow()
        await _activate_subscription(db, order)
    return {"code": "SUCCESS", "message": "OK"}
