"""Nexora - Admin API Routes (Superadmin only).

Endpoints for platform administration: users, workspaces, and statistics.
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import require_superadmin
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.models.subscription import Subscription, SubscriptionPlan, SubscriptionStatus
from app.schemas.user import UserResponse
from app.schemas.workspace import WorkspaceResponse
from app.utils.pagination import PaginatedResponse, PaginationParams

router = APIRouter(prefix="/admin")


@router.get(
    "/users",
    response_model=PaginatedResponse[UserResponse],
    summary="List all users (superadmin only)",
)
async def list_users(
    db: Annotated[AsyncSession, Depends(get_db)],
    _superadmin: Annotated[User, Depends(require_superadmin)],
    pagination: Annotated[PaginationParams, Depends()],
) -> PaginatedResponse[UserResponse]:
    """Return all registered users. Requires superadmin privileges."""
    # Count total
    count_result = await db.execute(select(func.count(User.id)))
    total = count_result.scalar_one()

    # Fetch page
    result = await db.execute(
        select(User)
        .order_by(User.created_at.desc())
        .offset(pagination.offset)
        .limit(pagination.limit)
    )
    users = result.scalars().all()
    items = [UserResponse.model_validate(u) for u in users]
    return PaginatedResponse.create(items=items, total=total, params=pagination)


@router.get(
    "/workspaces",
    response_model=PaginatedResponse[WorkspaceResponse],
    summary="List all workspaces (superadmin only)",
)
async def list_all_workspaces(
    db: Annotated[AsyncSession, Depends(get_db)],
    _superadmin: Annotated[User, Depends(require_superadmin)],
    pagination: Annotated[PaginationParams, Depends()],
) -> PaginatedResponse[WorkspaceResponse]:
    """Return all workspaces across the platform. Requires superadmin privileges."""
    # Count total
    count_result = await db.execute(select(func.count(Workspace.id)))
    total = count_result.scalar_one()

    # Fetch page
    result = await db.execute(
        select(Workspace)
        .order_by(Workspace.created_at.desc())
        .offset(pagination.offset)
        .limit(pagination.limit)
    )
    workspaces = result.scalars().all()
    items = [WorkspaceResponse.model_validate(w) for w in workspaces]
    return PaginatedResponse.create(items=items, total=total, params=pagination)


@router.get(
    "/stats",
    summary="Platform statistics (superadmin only)",
)
async def get_stats(
    db: Annotated[AsyncSession, Depends(get_db)],
    _superadmin: Annotated[User, Depends(require_superadmin)],
) -> dict:
    """Return platform-wide statistics. Requires superadmin privileges."""
    # Total users
    user_count_result = await db.execute(
        select(func.count(User.id))
    )
    total_users = user_count_result.scalar_one()

    # Active users
    active_user_result = await db.execute(
        select(func.count(User.id)).where(User.is_active == True)  # noqa: E712
    )
    active_users = active_user_result.scalar_one()

    # Total workspaces
    workspace_count_result = await db.execute(
        select(func.count(Workspace.id))
    )
    total_workspaces = workspace_count_result.scalar_one()

    # Total memberships
    member_count_result = await db.execute(
        select(func.count(WorkspaceMember.id))
    )
    total_memberships = member_count_result.scalar_one()

    # Active subscriptions
    sub_count_result = await db.execute(
        select(func.count(Subscription.id)).where(
            Subscription.status == SubscriptionStatus.ACTIVE
        )
    )
    active_subscriptions = sub_count_result.scalar_one()

    # Trial subscriptions
    trial_count_result = await db.execute(
        select(func.count(Subscription.id)).where(
            Subscription.status == SubscriptionStatus.TRIALING
        )
    )
    trial_subscriptions = trial_count_result.scalar_one()

    # Total plans
    plan_count_result = await db.execute(
        select(func.count(SubscriptionPlan.id))
    )
    total_plans = plan_count_result.scalar_one()

    return {
        "users": {
            "total": total_users,
            "active": active_users,
        },
        "workspaces": {
            "total": total_workspaces,
        },
        "memberships": {
            "total": total_memberships,
        },
        "subscriptions": {
            "active": active_subscriptions,
            "trialing": trial_subscriptions,
        },
        "plans": {
            "total": total_plans,
        },
    }


@router.post(
    "/reset-demo",
    summary="一键重置演示数据（超管专属）",
)
async def reset_demo_data(
    db: Annotated[AsyncSession, Depends(get_db)],
    _superadmin: Annotated[User, Depends(require_superadmin)],
) -> dict:
    """清空演示工作空间的业务数据并重新播种 90 天种子数据。

    用于演示现场被评委乱改数据后一键恢复。只影响 demo 用户所属的
    工作空间（demo@nexora.com 的第一个工作空间），不触碰其他租户。
    """
    from app.models.order import Order, OrderItem
    from app.models.product import Product
    from app.models.customer import Customer
    from app.models.refund import Refund
    from app.models.notification import Notification

    # 找到 demo 用户及其第一个工作空间
    demo_user = await db.execute(
        select(User).where(User.email == "demo@nexora.com")
    )
    demo_user = demo_user.scalar_one_or_none()
    if demo_user is None:
        # 没有 demo 用户时直接播种（会重建 demo 用户/工作空间）
        demo_ws = None
    else:
        demo_ws = await db.execute(
            select(Workspace)
            .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
            .where(WorkspaceMember.user_id == demo_user.id)
            .order_by(Workspace.created_at.asc())
            .limit(1)
        )
        demo_ws = demo_ws.scalar_one_or_none()

    if demo_ws is not None:
        ws_id = demo_ws.id
        # 删除该工作空间全部业务数据（保持外键顺序）
        await db.execute(delete(Notification).where(Notification.workspace_id == ws_id))
        await db.execute(delete(Refund).where(Refund.workspace_id == ws_id))
        await db.execute(
            delete(OrderItem).where(
                OrderItem.order_id.in_(
                    select(Order.id).where(Order.workspace_id == ws_id)
                )
            )
        )
        await db.execute(delete(Order).where(Order.workspace_id == ws_id))
        await db.execute(delete(Customer).where(Customer.workspace_id == ws_id))
        await db.execute(delete(Product).where(Product.workspace_id == ws_id))
        # 重置白标字段为默认
        demo_ws.name = "Demo 优选旗舰店"
        demo_ws.brand_name = "Demo 优选"
        demo_ws.brand_color = "#7C3AED"
        demo_ws.brand_dark_mode = False
        demo_ws.brand_logo_url = None
        demo_ws.logo_url = None
        await db.commit()

    # 重新播种 90 天数据（force=True：订单/退款强制重建）
    import os
    import sys as _sys
    _backend_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
    if _backend_path not in _sys.path:
        _sys.path.insert(0, _backend_path)
    import seed_demo

    code = await seed_demo.run(days=90, force=True)
    return {
        "status": "ok" if code == 0 else "error",
        "message": "演示数据已重置（商品/客户/订单/退款已恢复为 90 天种子数据）",
        "workspace": demo_ws.slug if demo_ws else None,
    }

# ----------------------------------------------------------------------
# P0 · 用户管理 / 订阅支付 / 审计（Superadmin 运营闭环）
# ----------------------------------------------------------------------

@router.get("/users/{user_id}", summary="用户详情（含工作空间与最近审计）")
async def admin_user_detail(
    user_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    _sa: Annotated[User, Depends(require_superadmin)],
) -> dict:
    from app.models.audit import AuditLog
    user = await db.get(User, user_id)
    if user is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="用户不存在")
    members = (
        await db.execute(select(WorkspaceMember).where(WorkspaceMember.user_id == user_id))
    ).scalars().all()
    audits = (
        await db.execute(
            select(AuditLog).where(AuditLog.user_id == user_id).order_by(AuditLog.created_at.desc()).limit(10)
        )
    ).scalars().all()
    return {
        "id": user.id, "email": user.email, "full_name": user.full_name,
        "is_active": user.is_active, "is_superadmin": user.is_superadmin,
        "totp_enabled": user.totp_enabled, "last_login_at": user.last_login_at,
        "created_at": user.created_at,
        "workspaces": [
            {"workspace_id": m.workspace_id, "role": m.role, "name": (await db.get(Workspace, m.workspace_id)).name if await db.get(Workspace, m.workspace_id) else None}
            for m in members
        ],
        "recent_audits": [
            {"action": a.action, "created_at": a.created_at, "detail": a.detail}
            for a in audits
        ],
    }


async def _ensure_superadmin_quota(db: AsyncSession, exclude_user_id: str | None = None) -> None:
    """自锁保护：平台至少保留一名超管。"""
    from fastapi import HTTPException
    q = select(User).where(User.is_superadmin.is_(True))
    if exclude_user_id:
        q = q.where(User.id != exclude_user_id)
    remaining = (await db.execute(q)).scalars().all()
    if len(remaining) < 1:
        raise HTTPException(status_code=400, detail="平台必须至少保留一名超级管理员")


@router.post("/users/{user_id}/disable", summary="禁用用户（立即生效）")
async def admin_disable_user(
    user_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    sa: Annotated[User, Depends(require_superadmin)],
) -> dict:
    from fastapi import HTTPException
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.id == sa.id:
        raise HTTPException(status_code=400, detail="不能禁用自己")
    if user.is_superadmin:
        await _ensure_superadmin_quota(db, exclude_user_id=user.id)
    user.is_active = False
    await db.commit()
    from app.utils.audit import create_audit_log
    await create_audit_log(db, None, sa.id, "admin.user.disable", "user", resource_id=user.id, details={"email": user.email, "op": "disable"})
    return {"ok": True}


@router.post("/users/{user_id}/enable", summary="启用用户")
async def admin_enable_user(
    user_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    sa: Annotated[User, Depends(require_superadmin)],
) -> dict:
    user = await db.get(User, user_id)
    if user is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="用户不存在")
    user.is_active = True
    await db.commit()
    from app.utils.audit import create_audit_log
    await create_audit_log(db, None, sa.id, "admin.user.enable", "user", resource_id=user.id, details={"email": user.email, "op": "enable"})
    return {"ok": True}


@router.post("/users/{user_id}/reset-password", summary="重置密码（返回一次性临时密码）")
async def admin_reset_password(
    user_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    sa: Annotated[User, Depends(require_superadmin)],
) -> dict:
    import secrets
    from fastapi import HTTPException
    from app.utils.security import hash_password
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    tmp = secrets.token_urlsafe(9)
    user.password_hash = hash_password(tmp)
    await db.commit()
    from app.utils.audit import create_audit_log
    await create_audit_log(db, None, sa.id, "admin.user.reset_password", "user", resource_id=user.id, details={"email": user.email, "op": "reset_password"})
    return {"ok": True, "temporary_password": tmp}


@router.post("/users/{user_id}/toggle-superadmin", summary="授予/收回超管（含自锁保护）")
async def admin_toggle_superadmin(
    user_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    sa: Annotated[User, Depends(require_superadmin)],
) -> dict:
    from fastapi import HTTPException
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.id == sa.id:
        raise HTTPException(status_code=400, detail="不能变更自己的超管权限")
    if user.is_superadmin:
        await _ensure_superadmin_quota(db, exclude_user_id=user.id)
    user.is_superadmin = not user.is_superadmin
    await db.commit()
    from app.utils.audit import create_audit_log
    await create_audit_log(db, None, sa.id, "admin.user.toggle_superadmin", "user",
                           resource_id=user.id, details={"email": user.email, "superadmin": user.is_superadmin})
    return {"ok": True, "is_superadmin": user.is_superadmin}


@router.get("/subscriptions", summary="全平台订阅列表")
async def admin_subscriptions(
    db: Annotated[AsyncSession, Depends(get_db)],
    _sa: Annotated[User, Depends(require_superadmin)],
) -> dict:
    subs = (await db.execute(select(Subscription).order_by(Subscription.created_at.desc()).limit(200))).scalars().all()
    plan_ids = {p.id: p for p in (await db.execute(select(SubscriptionPlan))).scalars().all()}
    out = []
    for s in subs:
        ws = await db.get(Workspace, s.workspace_id)
        plan = plan_ids.get(s.plan_id)
        out.append({
            "id": s.id, "workspace_name": ws.name if ws else "?",
            "workspace_id": s.workspace_id,
            "plan": plan.name if plan else "?",
            "status": s.status.value if hasattr(s.status, "value") else str(s.status),
            "current_period_end": s.current_period_end,
            "created_at": s.created_at,
        })
    return {"items": out}


@router.post("/subscriptions/{sub_id}/change-plan", summary="手动变更套餐（备注必填）")
async def admin_change_plan(
    sub_id: str,
    body: dict,
    db: Annotated[AsyncSession, Depends(get_db)],
    sa: Annotated[User, Depends(require_superadmin)],
) -> dict:
    from fastapi import HTTPException
    note = str(body.get("note") or "").strip()
    if len(note) < 3:
        raise HTTPException(status_code=400, detail="请填写变更备注（≥3 字，将记录审计）")
    plan_slug = body.get("plan_slug")
    sub = await db.get(Subscription, sub_id)
    if sub is None:
        raise HTTPException(status_code=404, detail="订阅不存在")
    if plan_slug:
        plan = (await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.slug == plan_slug))).scalar_one_or_none()
        if plan is None:
            raise HTTPException(status_code=404, detail="套餐不存在")
        sub.plan_id = plan.id
    await db.commit()
    from app.utils.audit import create_audit_log
    await create_audit_log(db, None, sa.id, "admin.subscription.change_plan", "subscription",
                           resource_id=sub.id, details={"plan_slug": plan_slug or "", "note": note})
    return {"ok": True}


@router.post("/subscriptions/{sub_id}/extend", summary="延长周期 N 天")
async def admin_extend_subscription(
    sub_id: str,
    body: dict,
    db: Annotated[AsyncSession, Depends(get_db)],
    sa: Annotated[User, Depends(require_superadmin)],
) -> dict:
    from datetime import datetime, timedelta
    from fastapi import HTTPException
    days = int(body.get("days") or 0)
    if not (1 <= days <= 3650):
        raise HTTPException(status_code=400, detail="延期天数需在 1-3650 之间")
    sub = await db.get(Subscription, sub_id)
    if sub is None:
        raise HTTPException(status_code=404, detail="订阅不存在")
    sub.current_period_end = (sub.current_period_end or datetime.utcnow()) + timedelta(days=days)
    await db.commit()
    from app.utils.audit import create_audit_log
    await create_audit_log(db, None, sa.id, "admin.subscription.extend", "subscription",
                           resource_id=sub.id, details={"days": days})
    return {"ok": True, "new_period_end": sub.current_period_end}


@router.get("/payments", summary="全平台支付流水")
async def admin_payments(
    db: Annotated[AsyncSession, Depends(get_db)],
    _sa: Annotated[User, Depends(require_superadmin)],
) -> dict:
    from app.models.payment import Payment
    pays = (await db.execute(select(Payment).order_by(Payment.created_at.desc()).limit(200))).scalars().all()
    out = []
    for p in pays:
        ws = await db.get(Workspace, p.workspace_id)
        out.append({
            "id": p.id, "workspace_name": ws.name if ws else "?",
            "amount": float(p.amount or 0), "method": p.method,
            "status": p.status.value if hasattr(p.status, "value") else str(p.status),
            "created_at": p.created_at,
        })
    return {"items": out}


@router.post("/payments/{pay_id}/mark-paid", summary="手动标记已支付")
async def admin_mark_paid(
    pay_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    sa: Annotated[User, Depends(require_superadmin)],
) -> dict:
    from fastapi import HTTPException
    from app.models.payment import Payment, PaymentStatus
    p = await db.get(Payment, pay_id)
    if p is None:
        raise HTTPException(status_code=404, detail="支付记录不存在")
    p.status = PaymentStatus.PAID
    await db.commit()
    from app.utils.audit import create_audit_log
    await create_audit_log(db, None, sa.id, "admin.payment.mark_paid", "payment",
                           resource_id=p.id, details={"op": "mark_paid"})
    return {"ok": True}


@router.get("/audit", summary="全局审计日志查询")
async def admin_audit(
    db: Annotated[AsyncSession, Depends(get_db)],
    _sa: Annotated[User, Depends(require_superadmin)],
    action: str | None = None,
    user_id: str | None = None,
    limit: int = 50,
) -> dict:
    from app.models.audit import AuditLog
    q = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(min(limit, 100))
    if action:
        q = select(AuditLog).where(AuditLog.action.ilike(f"%{action}%")).order_by(AuditLog.created_at.desc()).limit(min(limit, 100))
    if user_id:
        q = select(AuditLog).where(AuditLog.user_id == user_id).order_by(AuditLog.created_at.desc()).limit(min(limit, 100))
    rows = (await db.execute(q)).scalars().all()
    return {
        "items": [
            {
                "id": r.id, "action": r.action, "user_id": r.user_id,
                "resource_id": r.resource_id, "details": r.details,
                "created_at": r.created_at,
            }
            for r in rows
        ]
    }
