"""Nexora - Subscriptions API Routes.

Endpoints for viewing plans, subscribing, and managing subscriptions.
"""

from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import _require_member, create_audit_log
from app.database import get_db
from app.middleware.auth import get_current_active_user
from app.models.subscription import Subscription
from app.models.user import User
from app.models.workspace import WorkspaceRole
from app.schemas.subscription import (
    PlanResponse,
    SubscriptionCreate,
    SubscriptionResponse,
)
from app.services.subscription import SubscriptionService
from app.utils.logging import get_logger

router = APIRouter(prefix="/subscriptions")
logger = get_logger(__name__)


@router.get(
    "/plans",
    response_model=list[PlanResponse],
    summary="List available subscription plans",
)
async def list_plans(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[PlanResponse]:
    """Return all available (active) subscription plans."""
    return await SubscriptionService.get_plans(db)


@router.get(
    "/workspace/{slug}/subscription",
    response_model=SubscriptionResponse,
    summary="Get workspace subscription",
)
async def get_workspace_subscription(
    slug: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SubscriptionResponse:
    """Return the current subscription for a workspace."""
    workspace, _ = await _require_member(slug, current_user, db, WorkspaceRole.VIEWER)
    subscription = await SubscriptionService.get_workspace_subscription(db, workspace)

    if subscription is None:
        from fastapi import HTTPException, status as http_status

        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="No active subscription found for this workspace.",
        )

    return subscription


@router.post(
    "/workspace/{slug}/subscribe",
    response_model=SubscriptionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Subscribe workspace to a plan",
)
async def subscribe_workspace(
    slug: str,
    sub_data: SubscriptionCreate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SubscriptionResponse:
    """Subscribe the workspace to a plan. Requires owner role.

    - **plan_slug**: Slug of the plan (e.g., 'free', 'pro', 'enterprise').
    - **billing_cycle**: 'monthly' or 'yearly'.
    """
    workspace, _ = await _require_member(slug, current_user, db, WorkspaceRole.OWNER)
    result = await SubscriptionService.subscribe_workspace(db, workspace, sub_data)

    # Audit log: subscription created
    await create_audit_log(
        db=db,
        workspace_id=workspace.id,
        user_id=current_user.id,
        action="subscription.created",
        resource_type="subscription",
        resource_id=result.id,
        details={
            "plan_slug": sub_data.plan_slug,
            "billing_cycle": sub_data.billing_cycle,
            "status": result.status,
        },
    )

    logger.info(
        "Workspace %s subscribed to plan %s",
        workspace.slug,
        sub_data.plan_slug,
    )
    return result


@router.post(
    "/workspace/{slug}/cancel",
    response_model=SubscriptionResponse,
    summary="Cancel workspace subscription",
)
async def cancel_subscription(
    slug: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SubscriptionResponse:
    """Cancel the active subscription. Requires owner role."""
    workspace, _ = await _require_member(slug, current_user, db, WorkspaceRole.OWNER)
    result = await SubscriptionService.cancel_subscription(db, workspace)

    # Audit log: subscription cancelled
    await create_audit_log(
        db=db,
        workspace_id=workspace.id,
        user_id=current_user.id,
        action="subscription.cancelled",
        resource_type="subscription",
        resource_id=result.id,
        details={"previous_status": "active"},
    )

    logger.info(
        "Subscription cancelled for workspace %s",
        workspace.slug,
    )
    return result


@router.get(
    "/workspace/{slug}/limits",
    summary="Check workspace subscription limits",
)
async def check_limits(
    slug: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Check current usage against subscription plan limits."""
    workspace, _ = await _require_member(slug, current_user, db, WorkspaceRole.VIEWER)
    return await SubscriptionService.check_limits(db, workspace)


@router.post(
    "/workspace/{slug}/verify-payment",
    response_model=SubscriptionResponse,
    summary="Verify payment for enterprise plan",
)
async def verify_payment(
    slug: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SubscriptionResponse:
    """Verify payment and activate the enterprise subscription. Requires owner role."""
    workspace, _ = await _require_member(slug, current_user, db, WorkspaceRole.OWNER)
    result = await SubscriptionService.verify_payment(db, workspace)

    await create_audit_log(
        db=db,
        workspace_id=workspace.id,
        user_id=current_user.id,
        action="payment.verified",
        resource_type="subscription",
        resource_id=result.id,
        details={"status": result.status},
    )

    logger.info("Payment verified for workspace %s", workspace.slug)
    return result


@router.post(
    "/workspace/{slug}/switch-plan",
    response_model=SubscriptionResponse,
    summary="Self-service plan change (upgrade/downgrade)",
)
async def switch_plan(
    slug: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    body: dict = Body(...),
) -> SubscriptionResponse:
    """Switch the workspace to a different plan. Only OWNER can switch plans.

    Body: {"plan_slug": "pro"}
    """
    target_slug = body.get("plan_slug")
    if not target_slug:
        raise HTTPException(status_code=400, detail="plan_slug required")

    workspace, _ = await _require_member(slug, current_user, db, WorkspaceRole.OWNER)
    result = await SubscriptionService.switch_plan(db, workspace, target_slug)

    await create_audit_log(
        db=db,
        workspace_id=workspace.id,
        user_id=current_user.id,
        action="subscription.plan_switched",
        resource_type="subscription",
        resource_id=result.id,
        details={
            "target_plan": target_slug,
            "status": result.status,
            "payment_status": result.payment_status,
        },
    )

    logger.info(
        "Workspace %s switched to plan %s",
        workspace.slug,
        target_slug,
    )
    return result


@router.get(
    "/workspace/{slug}/billing-history",
    summary="Get billing history for workspace",
)
async def get_billing_history(
    slug: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict]:
    """Get billing history (subscription changes) for a workspace."""
    workspace, _ = await _require_member(slug, current_user, db, WorkspaceRole.ADMIN)

    result = await db.execute(
        select(Subscription)
        .options(selectinload(Subscription.plan))
        .where(Subscription.workspace_id == workspace.id)
        .order_by(Subscription.created_at.desc())
    )
    subscriptions = result.scalars().all()

    history = []
    for sub in subscriptions:
        history.append({
            "id": sub.id,
            "plan_name": sub.plan.name if sub.plan else "Unknown",
            "status": sub.status.value,
            "payment_status": sub.payment_status.value,
            "amount": sub.plan.price_monthly if sub.plan else 0,
            "created_at": sub.created_at.isoformat() if sub.created_at else "",
            "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
        })

    return history