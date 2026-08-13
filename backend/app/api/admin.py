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