"""Nexora - Subscription Service.

Handles subscription plans, subscribing, cancelling, and limit checks.
"""

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.subscription import (
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
    PaymentStatus,
)
from app.models.workspace import Workspace
from app.schemas.subscription import (
    PlanResponse,
    SubscriptionCreate,
    SubscriptionResponse,
)


class SubscriptionService:
    """Service for subscription-related business logic."""

    # Default trial duration in days
    TRIAL_DURATION_DAYS = 14

    @staticmethod
    async def get_plans(
        db: AsyncSession,
        active_only: bool = True,
    ) -> list[PlanResponse]:
        """Get all available subscription plans.

        Args:
            db: Async database session.
            active_only: If True, only return active plans.

        Returns:
            List of PlanResponse objects.
        """
        query = select(SubscriptionPlan).order_by(SubscriptionPlan.price_monthly)
        if active_only:
            query = query.where(SubscriptionPlan.is_active == True)  # noqa: E712

        result = await db.execute(query)
        plans = result.scalars().all()
        return [PlanResponse.model_validate(p) for p in plans]

    @staticmethod
    async def get_workspace_subscription(
        db: AsyncSession,
        workspace: Workspace,
    ) -> SubscriptionResponse | None:
        """Get the active subscription for a workspace.

        Args:
            db: Async database session.
            workspace: The workspace.

        Returns:
            SubscriptionResponse if an active subscription exists, None otherwise.
        """
        result = await db.execute(
            select(Subscription)
            .options(selectinload(Subscription.plan))
            .where(
                Subscription.workspace_id == workspace.id,
                Subscription.status.in_([
                    SubscriptionStatus.ACTIVE,
                    SubscriptionStatus.TRIALING,
                    SubscriptionStatus.INCOMPLETE,
                ]),
            )
            .order_by(Subscription.created_at.desc())
        )
        subscription = result.scalars().first()

        if subscription is None:
            return None

        return SubscriptionResponse.model_validate(subscription)

    @staticmethod
    async def subscribe_workspace(
        db: AsyncSession,
        workspace: Workspace,
        sub_data: SubscriptionCreate,
    ) -> SubscriptionResponse:
        """Subscribe a workspace to a plan.

        Args:
            db: Async database session.
            workspace: The workspace to subscribe.
            sub_data: Subscription details.

        Returns:
            SubscriptionResponse for the created subscription.

        Raises:
            HTTPException 404: If the plan is not found.
            HTTPException 409: If the workspace already has an active subscription.
        """
        # Find the plan
        result = await db.execute(
            select(SubscriptionPlan).where(
                SubscriptionPlan.slug == sub_data.plan_slug.lower()
            )
        )
        plan = result.scalar_one_or_none()

        if plan is None or not plan.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Subscription plan '{sub_data.plan_slug}' not found.",
            )

        # Check for existing active subscription
        existing = await SubscriptionService.get_workspace_subscription(db, workspace)
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Workspace already has an active subscription.",
            )

        now = datetime.now(timezone.utc)
        trial_end = now + timedelta(days=SubscriptionService.TRIAL_DURATION_DAYS)

        period_delta = timedelta(days=365) if sub_data.billing_cycle == "yearly" else timedelta(days=30)

        # Enterprise plans require payment verification
        is_paid_plan = plan.price_monthly > 0
        subscription_status = SubscriptionStatus.TRIALING if not is_paid_plan else SubscriptionStatus.INCOMPLETE
        payment_status = PaymentStatus.PENDING if is_paid_plan else PaymentStatus.NOT_REQUIRED

        subscription = Subscription(
            workspace_id=workspace.id,
            plan_id=plan.id,
            status=subscription_status,
            payment_status=payment_status,
            trial_ends_at=trial_end,
            current_period_start=now,
            current_period_end=now + period_delta,
        )
        db.add(subscription)
        await db.flush()

        # Fetch plan separately to avoid greenlet issues
        plan_result = await db.execute(
            select(SubscriptionPlan).where(SubscriptionPlan.id == plan.id)
        )
        plan = plan_result.scalar_one()

        return SubscriptionResponse(
            id=subscription.id,
            workspace_id=subscription.workspace_id,
            plan_id=subscription.plan_id,
            plan=PlanResponse.model_validate(plan),
            status=subscription.status.value,
            trial_ends_at=subscription.trial_ends_at,
            current_period_start=subscription.current_period_start,
            current_period_end=subscription.current_period_end,
            stripe_subscription_id=subscription.stripe_subscription_id,
            payment_status=subscription.payment_status.value,
            created_at=subscription.created_at,
        )

    @staticmethod
    async def cancel_subscription(
        db: AsyncSession,
        workspace: Workspace,
    ) -> SubscriptionResponse:
        """Cancel the active subscription for a workspace.

        Args:
            db: Async database session.
            workspace: The workspace.

        Returns:
            SubscriptionResponse for the cancelled subscription.

        Raises:
            HTTPException 404: If no active subscription is found.
        """
        result = await db.execute(
            select(Subscription)
            .where(
                Subscription.workspace_id == workspace.id,
                Subscription.status.in_([
                    SubscriptionStatus.ACTIVE,
                    SubscriptionStatus.TRIALING,
                    SubscriptionStatus.INCOMPLETE,
                ]),
            )
        )
        subscription = result.scalar_one_or_none()

        if subscription is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No active subscription found for this workspace.",
            )

        subscription.status = SubscriptionStatus.CANCELLED
        await db.flush()

        # Fetch plan separately to avoid greenlet issues
        plan_result = await db.execute(
            select(SubscriptionPlan).where(SubscriptionPlan.id == subscription.plan_id)
        )
        plan = plan_result.scalar_one()

        return SubscriptionResponse(
            id=subscription.id,
            workspace_id=subscription.workspace_id,
            plan_id=subscription.plan_id,
            plan=PlanResponse.model_validate(plan),
            status=subscription.status.value,
            trial_ends_at=subscription.trial_ends_at,
            current_period_start=subscription.current_period_start,
            current_period_end=subscription.current_period_end,
            stripe_subscription_id=subscription.stripe_subscription_id,
            payment_status=subscription.payment_status.value,
            created_at=subscription.created_at,
        )

    @staticmethod
    async def switch_plan(
        db: AsyncSession,
        workspace: Workspace,
        target_plan_slug: str,
    ) -> SubscriptionResponse:
        """Self-service plan change. Handles upgrade/downgrade.

        Logic:
        - If current plan == target: no-op, return existing
        - If upgrading (free -> pro, free -> ent, pro -> ent):
            Set current sub to INCOMPLETE + PENDING so user must pay
        - If downgrading (pro -> free, ent -> free, ent -> pro):
            IMMEDIATELY switch plan_id, keep current period_end unchanged
            (user keeps paid features until period ends, then auto-downgrades)
        - If switching from paid to paid (e.g., pro -> ent while still active):
            Same as upgrade -- set to pending payment

        Args:
            db: Async database session
            workspace: The workspace
            target_plan_slug: Target plan slug ('free', 'pro', 'enterprise')

        Returns:
            SubscriptionResponse with updated subscription
        """
        # Find current subscription
        result = await db.execute(
            select(Subscription)
            .options(selectinload(Subscription.plan))
            .where(Subscription.workspace_id == workspace.id)
            .order_by(Subscription.created_at.desc())
        )
        current_sub = result.scalar_one_or_none()

        if current_sub is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No subscription found",
            )

        # Find target plan
        plan_result = await db.execute(
            select(SubscriptionPlan).where(SubscriptionPlan.slug == target_plan_slug)
        )
        target_plan = plan_result.scalar_one_or_none()
        if target_plan is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Plan '{target_plan_slug}' not found",
            )

        # Find current plan
        current_plan_result = await db.execute(
            select(SubscriptionPlan).where(SubscriptionPlan.id == current_sub.plan_id)
        )
        current_plan = current_plan_result.scalar_one()

        # If same plan, no change
        if current_plan.slug == target_plan.slug:
            return SubscriptionResponse.model_validate(current_sub)

        # Determine if upgrade or downgrade (by price_monthly)
        is_upgrade = target_plan.price_monthly > current_plan.price_monthly

        if is_upgrade:
            # Set to pending payment -- user must pay
            current_sub.plan_id = target_plan.id
            current_sub.status = SubscriptionStatus.INCOMPLETE
            current_sub.payment_status = PaymentStatus.PENDING
            # Reset period
            now = datetime.now(timezone.utc)
            current_sub.current_period_start = now
            current_sub.current_period_end = now + timedelta(days=30)
        else:
            # Downgrade -- instant switch, keep current paid period
            current_sub.plan_id = target_plan.id
            # If current sub was INCOMPLETE, mark as ACTIVE
            if current_sub.status == SubscriptionStatus.INCOMPLETE:
                current_sub.status = SubscriptionStatus.ACTIVE
                current_sub.payment_status = PaymentStatus.VERIFIED

        await db.flush()

        # Re-fetch plan to build response (avoid greenlet issues)
        final_plan_result = await db.execute(
            select(SubscriptionPlan).where(SubscriptionPlan.id == target_plan.id)
        )
        final_plan = final_plan_result.scalar_one()

        return SubscriptionResponse(
            id=current_sub.id,
            workspace_id=current_sub.workspace_id,
            plan_id=current_sub.plan_id,
            plan=PlanResponse.model_validate(final_plan),
            status=current_sub.status.value,
            trial_ends_at=current_sub.trial_ends_at,
            current_period_start=current_sub.current_period_start,
            current_period_end=current_sub.current_period_end,
            stripe_subscription_id=current_sub.stripe_subscription_id,
            payment_status=current_sub.payment_status.value,
            created_at=current_sub.created_at,
        )

    @staticmethod
    async def verify_payment(
        db: AsyncSession,
        workspace: Workspace,
    ) -> SubscriptionResponse:
        """Verify payment and activate the subscription.

        Args:
            db: Async database session.
            workspace: The workspace.

        Returns:
            SubscriptionResponse with activated subscription.

        Raises:
            HTTPException 404: If no pending subscription is found.
        """
        result = await db.execute(
            select(Subscription)
            .where(
                Subscription.workspace_id == workspace.id,
                Subscription.status == SubscriptionStatus.INCOMPLETE,
                Subscription.payment_status == PaymentStatus.PENDING,
            )
        )
        subscription = result.scalar_one_or_none()

        if subscription is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No pending payment subscription found for this workspace.",
            )

        subscription.payment_status = PaymentStatus.VERIFIED
        subscription.status = SubscriptionStatus.ACTIVE
        await db.flush()

        # Fetch plan separately to avoid greenlet issues
        plan_result = await db.execute(
            select(SubscriptionPlan).where(SubscriptionPlan.id == subscription.plan_id)
        )
        plan = plan_result.scalar_one()

        return SubscriptionResponse(
            id=subscription.id,
            workspace_id=subscription.workspace_id,
            plan_id=subscription.plan_id,
            plan=PlanResponse.model_validate(plan),
            status=subscription.status.value,
            trial_ends_at=subscription.trial_ends_at,
            current_period_start=subscription.current_period_start,
            current_period_end=subscription.current_period_end,
            stripe_subscription_id=subscription.stripe_subscription_id,
            payment_status=subscription.payment_status.value,
            created_at=subscription.created_at,
        )

    @staticmethod
    async def check_limits(
        db: AsyncSession,
        workspace: Workspace,
    ) -> dict:
        """Check the current usage against subscription limits.

        Args:
            db: Async database session.
            workspace: The workspace to check limits for.

        Returns:
            A dict with limit information and current usage.
        """
        subscription = await SubscriptionService.get_workspace_subscription(
            db, workspace
        )

        if subscription is None:
            return {
                "has_subscription": False,
                "message": "No active subscription. Please subscribe to a plan.",
            }

        plan = subscription.plan
        if plan is None:
            # Reload plan
            sub_result = await db.execute(
                select(Subscription)
                .options(selectinload(Subscription.plan))
                .where(Subscription.id == subscription.id)
            )
            subscription = sub_result.scalar_one()
            plan = subscription.plan

        from app.models.workspace import WorkspaceMember

        result = await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace.id
            )
        )
        member_count = len(result.scalars().all())

        return {
            "has_subscription": True,
            "plan_name": plan.name,
            "plan_slug": plan.slug,
            "status": subscription.status,
            "max_members": plan.max_members,
            "current_members": member_count,
            "members_within_limit": member_count <= plan.max_members,
            "max_workspaces": plan.max_workspaces,
            "features": plan.features,
            "trial_ends_at": subscription.trial_ends_at.isoformat()
            if subscription.trial_ends_at
            else None,
            "current_period_end": subscription.current_period_end.isoformat()
            if subscription.current_period_end
            else None,
        }