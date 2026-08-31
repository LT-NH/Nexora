"""Nexora - Admin Ops API (Superadmin only).

平台运营扩展（v5.3）：
  1. 租户健康雷达   GET  /admin/tenant-health          —— 全平台商户健康评分榜 + 红灯预警
  2. 工作空间管理   GET  /admin/workspaces/{id}         —— 详情（成员/订阅/业务统计/健康分）
                   POST /admin/workspaces/{id}/suspend —— 暂停
                   POST /admin/workspaces/{id}/resume  —— 恢复
  3. 反馈中心       GET  /admin/feedback                —— 全平台反馈 + NPS 分布
                   PATCH /admin/feedback/{id}/status    —— 处理状态流转
  4. 营收看板       GET  /admin/revenue                 —— MRR / ARR / 月度趋势 / 流失预警
  5. 公告广播       POST /admin/announcements           —— 广播到所有工作空间成员
                   GET  /admin/announcements            —— 最近广播
"""

from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import require_superadmin
from app.models.customer import Customer
from app.models.feedback import Feedback
from app.models.notification import Notification
from app.models.order import Order, OrderStatus
from app.models.payment import Payment, PaymentStatus
from app.models.product import Product
from app.models.subscription import Subscription, SubscriptionPlan, SubscriptionStatus
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember

router = APIRouter(prefix="/admin", tags=["Admin"])

_EXCLUDED = (OrderStatus.CANCELLED, OrderStatus.REFUNDED)
_WEIGHTS = {"cashflow": 0.25, "inventory": 0.25, "customer": 0.2, "channel": 0.15, "growth": 0.15}


def _level(score: float) -> str:
    return "green" if score >= 80 else ("yellow" if score >= 60 else "red")


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def _pct(a: float, b: float) -> float:
    return (a / b * 100.0) if b else 0.0


# ----------------------------------------------------------------------
# 租户健康快照：评分口径与 app/api/health.py 完全一致（5 维加权）
# ----------------------------------------------------------------------

async def _tenant_health_snapshot(db: AsyncSession, ws_id: str) -> dict:
    now = datetime.utcnow()
    since = now - timedelta(days=14)

    # 订单聚合（近 14 天）
    order_rows = (
        await db.execute(
            select(Order.created_at, Order.total, Order.status, Order.platform).where(
                Order.workspace_id == ws_id, Order.created_at >= since
            )
        )
    ).all()
    refund_cnt = 0
    total_orders = 0
    total_rev = 0.0
    daily_rev: dict[str, float] = {}
    daily_ord: dict[str, int] = {}
    platform_rev: dict[str, float] = {}
    platform_prev: dict[str, float] = {}
    for created_at, total, status, platform in order_rows:
        if created_at is None:
            continue
        day = created_at.date().isoformat()
        is_excluded = status in _EXCLUDED
        total_orders += 1
        if status == OrderStatus.REFUNDED:
            refund_cnt += 1
        if is_excluded:
            continue
        amt = float(total or 0)
        daily_rev[day] = daily_rev.get(day, 0.0) + amt
        daily_ord[day] = daily_ord.get(day, 0) + 1
        total_rev += amt
        dt = created_at.date()
        key = platform or "manual"
        if dt >= (now - timedelta(days=7)).date():
            platform_rev[key] = platform_rev.get(key, 0.0) + amt
        else:
            platform_prev[key] = platform_prev.get(key, 0.0) + amt

    last7 = sum(v for k, v in daily_rev.items() if k >= (now - timedelta(days=7)).date().isoformat())
    prev7 = sum(v for k, v in daily_rev.items() if k < (now - timedelta(days=7)).date().isoformat())
    growth = _pct(last7 - prev7, prev7) if prev7 > 0 else (100.0 if last7 > 0 else 0.0)
    refund_rate = _pct(refund_cnt, total_orders) if total_orders else 0.0

    # 库存
    products = (await db.execute(select(Product).where(Product.workspace_id == ws_id))).scalars().all()
    last7_orders = sum(daily_ord.values())
    daily_sales = last7_orders / 7.0 / max(len(products), 1) if last7_orders else 0.0
    overstock = 0
    stockout_risk = 0
    for p in products:
        stock = p.stock or 0
        if stock <= 0:
            stockout_risk += 1
        elif daily_sales > 0:
            days = stock / daily_sales
            if days > 120:
                overstock += 1
            elif days < 14:
                stockout_risk += 1

    # 客户
    customers = (await db.execute(select(Customer).where(Customer.workspace_id == ws_id))).scalars().all()
    c_total = len(customers)
    c_repeat = sum(1 for c in customers if (c.total_orders or 0) >= 2)
    c_churn = sum(1 for c in customers if c.last_order_at is not None and (now - c.last_order_at).days > 30)
    repeat_rate = _pct(c_repeat, c_total) if c_total else 0.0
    churn_rate = _pct(c_churn, c_total) if c_total else 0.0

    # 5 维评分（与 health.py 同公式）
    cashflow = _clamp(85.0 - refund_rate * 4.0 + _clamp(growth * 0.3, -15, 15))
    n = max(len(products), 1)
    inventory = _clamp(100.0 - _pct(overstock, n) * 1.5 - _pct(stockout_risk, n) * 2.5)
    customer = _clamp(_clamp(repeat_rate * 0.9 + 45.0) - churn_rate * 1.5)
    ch_total = sum(platform_rev.values()) or 1.0
    max_share = max(platform_rev.values()) / ch_total if platform_rev else 0.0
    worst_growth = 0.0
    for key, cur in platform_rev.items():
        prev = platform_prev.get(key, 0.0)
        if prev > 0:
            worst_growth = min(worst_growth, (cur - prev) / prev * 100.0)
    channel = _clamp(92.0 - max(0.0, max_share - 0.6) * 100.0 - max(0.0, -worst_growth) * 0.5)
    growth_score = _clamp(50.0 + growth * 1.0)

    dims = [
        {"key": "cashflow", "name": "现金流", "score": round(cashflow), "level": _level(cashflow)},
        {"key": "inventory", "name": "库存", "score": round(inventory), "level": _level(inventory)},
        {"key": "customer", "name": "客户", "score": round(customer), "level": _level(customer)},
        {"key": "channel", "name": "渠道", "score": round(channel), "level": _level(channel)},
        {"key": "growth", "name": "增长", "score": round(growth_score), "level": _level(growth_score)},
    ]
    score = round(sum(d["score"] * _WEIGHTS[d["key"]] for d in dims))
    return {
        "score": score,
        "level": _level(score),
        "dimensions": dims,
        "metrics": {
            "refund_rate": round(refund_rate, 1),
            "growth": round(growth, 1),
            "revenue_7d": round(last7),
            "stockout_count": stockout_risk,
            "overstock_count": overstock,
            "churn_count": c_churn,
            "repeat_rate": round(repeat_rate, 1),
        },
    }


# ----------------------------------------------------------------------
# 1. 租户健康雷达
# ----------------------------------------------------------------------

@router.get("/tenant-health", summary="租户健康雷达：全平台商户健康评分榜")
async def admin_tenant_health(
    db: Annotated[AsyncSession, Depends(get_db)],
    _sa: Annotated[User, Depends(require_superadmin)],
) -> dict:
    workspaces = (await db.execute(select(Workspace).order_by(Workspace.created_at.asc()))).scalars().all()
    rows = []
    for ws in workspaces:
        snap = await _tenant_health_snapshot(db, ws.id)
        rows.append({
            "workspace_id": ws.id,
            "name": ws.name,
            "slug": ws.slug,
            "status": ws.status,
            **snap,
        })
    rows.sort(key=lambda r: r["score"])
    red = [r for r in rows if r["level"] == "red"]
    yellow = [r for r in rows if r["level"] == "yellow"]
    avg = round(sum(r["score"] for r in rows) / len(rows)) if rows else 0
    return {
        "total": len(rows),
        "average_score": avg,
        "red_count": len(red),
        "yellow_count": len(yellow),
        "green_count": len(rows) - len(red) - len(yellow),
        "tenants": rows,
    }


# ----------------------------------------------------------------------
# 2. 工作空间管理
# ----------------------------------------------------------------------

async def _ws_detail(db: AsyncSession, ws: Workspace) -> dict:
    from app.models.order import Order as _O
    from app.models.product import Product as _P
    from app.models.customer import Customer as _C
    from sqlalchemy import func as _func

    member_rows = (
        await db.execute(
            select(WorkspaceMember, User)
            .join(User, User.id == WorkspaceMember.user_id)
            .where(WorkspaceMember.workspace_id == ws.id)
        )
    ).all()
    sub = (
        await db.execute(
            select(Subscription, SubscriptionPlan)
            .join(SubscriptionPlan, SubscriptionPlan.id == Subscription.plan_id)
            .where(Subscription.workspace_id == ws.id)
            .order_by(Subscription.created_at.desc())
            .limit(1)
        )
    ).first()
    order_cnt = (await db.execute(select(_func.count(_O.id)).where(_O.workspace_id == ws.id))).scalar_one()
    product_cnt = (await db.execute(select(_func.count(_P.id)).where(_P.workspace_id == ws.id))).scalar_one()
    customer_cnt = (await db.execute(select(_func.count(_C.id)).where(_C.workspace_id == ws.id))).scalar_one()
    snap = await _tenant_health_snapshot(db, ws.id)
    return {
        "id": ws.id,
        "name": ws.name,
        "slug": ws.slug,
        "status": ws.status,
        "brand_name": ws.brand_name,
        "brand_color": ws.brand_color,
        "created_at": ws.created_at,
        "members": [
            {"user_id": m.user_id, "email": u.email, "full_name": u.full_name, "role": m.role.value if hasattr(m.role, "value") else str(m.role)}
            for m, u in member_rows
        ],
        "subscription": {
            "plan": sub[1].name if sub else None,
            "status": sub[0].status.value if sub and hasattr(sub[0].status, "value") else (sub[0].status if sub else None),
            "current_period_end": sub[0].current_period_end if sub else None,
        },
        "counts": {
            "orders": order_cnt,
            "products": product_cnt,
            "customers": customer_cnt,
        },
        "health": {"score": snap["score"], "level": snap["level"]},
    }


@router.get("/workspaces/{ws_id}", summary="工作空间详情（成员/订阅/统计/健康分）")
async def admin_workspace_detail(
    ws_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    _sa: Annotated[User, Depends(require_superadmin)],
) -> dict:
    ws = await db.get(Workspace, ws_id)
    if ws is None:
        raise HTTPException(status_code=404, detail="工作空间不存在")
    return await _ws_detail(db, ws)


@router.post("/workspaces/{ws_id}/suspend", summary="暂停工作空间")
async def admin_suspend_workspace(
    ws_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    sa: Annotated[User, Depends(require_superadmin)],
) -> dict:
    ws = await db.get(Workspace, ws_id)
    if ws is None:
        raise HTTPException(status_code=404, detail="工作空间不存在")
    ws.status = "suspended"
    await db.commit()
    from app.utils.audit import create_audit_log
    await create_audit_log(db, None, sa.id, "admin.workspace.suspend", "workspace",
                           resource_id=ws.id, details={"name": ws.name})
    return {"ok": True}


@router.post("/workspaces/{ws_id}/resume", summary="恢复工作空间")
async def admin_resume_workspace(
    ws_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    sa: Annotated[User, Depends(require_superadmin)],
) -> dict:
    ws = await db.get(Workspace, ws_id)
    if ws is None:
        raise HTTPException(status_code=404, detail="工作空间不存在")
    ws.status = "active"
    await db.commit()
    from app.utils.audit import create_audit_log
    await create_audit_log(db, None, sa.id, "admin.workspace.resume", "workspace",
                           resource_id=ws.id, details={"name": ws.name})
    return {"ok": True}


# ----------------------------------------------------------------------
# 3. 反馈中心
# ----------------------------------------------------------------------

@router.get("/feedback", summary="全平台反馈 + NPS 分布")
async def admin_feedback(
    db: Annotated[AsyncSession, Depends(get_db)],
    _sa: Annotated[User, Depends(require_superadmin)],
    limit: int = 100,
) -> dict:
    rows = (
        await db.execute(
            select(Feedback, Workspace, User)
            .join(Workspace, Workspace.id == Feedback.workspace_id)
            .join(User, User.id == Feedback.user_id)
            .order_by(Feedback.created_at.desc())
            .limit(min(limit, 200))
        )
    ).all()
    items = []
    promoters = passives = detractors = 0
    for f, ws, u in rows:
        if f.type == "nps" and f.nps_score is not None:
            if f.nps_score >= 9:
                promoters += 1
            elif f.nps_score >= 7:
                passives += 1
            else:
                detractors += 1
        items.append({
            "id": f.id,
            "type": f.type,
            "nps_score": f.nps_score,
            "content": f.content,
            "status": f.status,
            "workspace_name": ws.name,
            "user_email": u.email,
            "created_at": f.created_at,
        })
    nps_total = promoters + passives + detractors
    return {
        "items": items,
        "nps_stats": {
            "total": nps_total,
            "promoters": promoters,
            "passives": passives,
            "detractors": detractors,
            "score": round((promoters - detractors) / nps_total * 100) if nps_total else 0,
        },
    }


@router.patch("/feedback/{fb_id}/status", summary="反馈处理状态流转")
async def admin_feedback_status(
    fb_id: str,
    body: dict,
    db: Annotated[AsyncSession, Depends(get_db)],
    sa: Annotated[User, Depends(require_superadmin)],
) -> dict:
    status = str(body.get("status") or "")
    if status not in {"new", "resolved", "dismissed"}:
        raise HTTPException(status_code=400, detail="状态必须是 new / resolved / dismissed")
    f = await db.get(Feedback, fb_id)
    if f is None:
        raise HTTPException(status_code=404, detail="反馈不存在")
    f.status = status
    await db.commit()
    from app.utils.audit import create_audit_log
    await create_audit_log(db, None, sa.id, "admin.feedback.status", "feedback",
                           resource_id=f.id, details={"status": status})
    return {"ok": True}


# ----------------------------------------------------------------------
# 4. 营收看板
# ----------------------------------------------------------------------

@router.get("/revenue", summary="平台营收看板（MRR/趋势/流失预警）")
async def admin_revenue(
    db: Annotated[AsyncSession, Depends(get_db)],
    _sa: Annotated[User, Depends(require_superadmin)],
) -> dict:
    plans = {p.id: p for p in (await db.execute(select(SubscriptionPlan))).scalars().all()}
    subs = (await db.execute(select(Subscription))).scalars().all()
    ws_ids = {w.id for w in (await db.execute(select(Workspace))).scalars().all()}

    active_subs = [s for s in subs if s.status == SubscriptionStatus.ACTIVE]
    mrr = sum(float(plans[s.plan_id].price_monthly or 0) for s in active_subs if s.plan_id in plans)
    monthly = [0.0] * 12
    months = [""] * 12
    now = datetime.utcnow()
    for i in range(11, -1, -1):
        d = now - timedelta(days=30 * i)
        months[11 - i] = f"{d.year}-{d.month:02d}"

    pays = (await db.execute(select(Payment).where(Payment.status == PaymentStatus.PAID))).scalars().all()
    for p in pays:
        if p.created_at is None:
            continue
        key = f"{p.created_at.year}-{p.created_at.month:02d}"
        if key in months:
            monthly[months.index(key)] += float(p.amount or 0)

    # 流失预警：active 订阅 14 天内到期
    risk = []
    for s in active_subs:
        if s.current_period_end is None:
            continue
        days_left = (s.current_period_end - now).days
        if days_left <= 14:
            ws = await db.get(Workspace, s.workspace_id)
            risk.append({
                "workspace_name": ws.name if ws else "?",
                "plan": plans[s.plan_id].name if s.plan_id in plans else "?",
                "days_left": max(days_left, 0),
                "current_period_end": s.current_period_end,
            })
    risk.sort(key=lambda r: r["days_left"])

    # 套餐分布
    plan_dist = {}
    for s in subs:
        name = plans[s.plan_id].name if s.plan_id in plans else "?"
        plan_dist[name] = plan_dist.get(name, 0) + 1

    total_ws = len(ws_ids)
    return {
        "mrr": round(mrr),
        "arr": round(mrr * 12),
        "active_subscriptions": len(active_subs),
        "trial_subscriptions": sum(1 for s in subs if s.status == SubscriptionStatus.TRIALING),
        "pay_rate": round(_pct(len(active_subs), total_ws)) if total_ws else 0,
        "monthly_trend": [{"month": months[i], "amount": round(monthly[i])} for i in range(12)],
        "churn_risk": risk,
        "plan_distribution": [{"plan": k, "count": v} for k, v in plan_dist.items()],
    }


# ----------------------------------------------------------------------
# 5. 公告广播
# ----------------------------------------------------------------------

@router.post("/announcements", summary="公告广播（推送至所有工作空间成员）")
async def admin_announce(
    body: dict,
    db: Annotated[AsyncSession, Depends(get_db)],
    sa: Annotated[User, Depends(require_superadmin)],
) -> dict:
    title = str(body.get("title") or "").strip()
    message = str(body.get("message") or "").strip()
    if not title or not message:
        raise HTTPException(status_code=400, detail="标题与内容不能为空")
    workspaces = (await db.execute(select(Workspace))).scalars().all()
    sent = 0
    created: list[tuple[str, Notification]] = []  # (workspace_id, notification)
    for ws in workspaces:
        members = (
            await db.execute(select(WorkspaceMember.user_id).where(WorkspaceMember.workspace_id == ws.id))
        ).scalars().all()
        for uid in members:
            note = Notification(
                workspace_id=ws.id,
                user_id=uid,
                title=title,
                message=message,
                notification_type="announcement",
                link=None,
            )
            db.add(note)
            created.append((str(ws.id), note))
            sent += 1
    await db.commit()
    # 实时推送 WebSocket：在线商户的通知中心立即收到公告
    from app.api.ws import notify_workspace
    for ws_id, note in created:
        await notify_workspace(ws_id, "notification", {
            "id": str(note.id),
            "title": note.title,
            "message": note.message,
            "notification_type": note.notification_type,
            "link": None,
            "is_read": False,
            "created_at": note.created_at.isoformat() if note.created_at else None,
        })
    from app.utils.audit import create_audit_log
    await create_audit_log(db, None, sa.id, "admin.announcement.broadcast", "announcement",
                           details={"title": title, "recipients": sent})
    return {"ok": True, "recipients": sent}


@router.get("/announcements", summary="最近广播记录")
async def admin_announcements_list(
    db: Annotated[AsyncSession, Depends(get_db)],
    _sa: Annotated[User, Depends(require_superadmin)],
    limit: int = 20,
) -> dict:
    rows = (
        await db.execute(
            select(Notification).where(Notification.notification_type == "announcement")
            .order_by(Notification.created_at.desc()).limit(min(limit, 50))
        )
    ).scalars().all()
    # 按标题去重（一次广播会写入多条）
    seen: dict[str, dict] = {}
    for r in rows:
        if r.title in seen:
            seen[r.title]["recipients"] += 1
        else:
            seen[r.title] = {
                "title": r.title,
                "message": r.message,
                "created_at": r.created_at,
                "recipients": 1,
            }
    return {"items": list(seen.values())}
