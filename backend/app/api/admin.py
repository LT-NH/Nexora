"""Nexora - Admin API Routes (Superadmin only).

Endpoints for platform administration: users, workspaces, and statistics.
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
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