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
from app.utils.logging import get_logger
from app.utils.timeutils import to_naive_utc

logger = get_logger(__name__)


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

        # If no existing subscription, create one (first-time subscribe via switch)
        if current_sub is None:
            now = datetime.now(timezone.utc)
            trial_end = now + timedelta(days=SubscriptionService.TRIAL_DURATION_DAYS)
            period_delta = timedelta(days=30)

            is_paid_plan = target_plan.price_monthly > 0
            sub_status = (
                SubscriptionStatus.TRIALING
                if not is_paid_plan
                else SubscriptionStatus.INCOMPLETE
            )
            pay_status = (
                PaymentStatus.PENDING if is_paid_plan else PaymentStatus.NOT_REQUIRED
            )

            new_sub = Subscription(
                workspace_id=workspace.id,
                plan_id=target_plan.id,
                status=sub_status,
                payment_status=pay_status,
                trial_ends_at=trial_end,
                current_period_start=now,
                current_period_end=now + period_delta,
            )
            db.add(new_sub)
            await db.flush()

            return SubscriptionResponse(
                id=new_sub.id,
                workspace_id=new_sub.workspace_id,
                plan_id=new_sub.plan_id,
                plan=PlanResponse.model_validate(target_plan),
                status=new_sub.status.value,
                trial_ends_at=new_sub.trial_ends_at,
                current_period_start=new_sub.current_period_start,
                current_period_end=new_sub.current_period_end,
                stripe_subscription_id=new_sub.stripe_subscription_id,
                payment_status=new_sub.payment_status.value,
                created_at=new_sub.created_at,
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
            # 降级必须是「已付费订阅」的自助操作。原先此处无条件把 INCOMPLETE
            # 订阅写成 ACTIVE + VERIFIED，导致「先升 enterprise（→INCOMPLETE/PENDING）
            # 再降 pro」两次调用即可零支付开通付费能力。
            period_end = to_naive_utc(current_sub.current_period_end)
            is_currently_paid = (
                current_sub.payment_status == PaymentStatus.VERIFIED
                and period_end is not None
                and period_end > datetime.utcnow()
            )
            if not is_currently_paid:
                raise HTTPException(
                    status_code=status.HTTP_402_PAYMENT_REQUIRED,
                    detail=(
                        "当前订阅尚未完成支付或已过期，无法降级。"
                        "请先完成付款，或等待当前周期结束后再切换套餐。"
                    ),
                )
            # 已付费且在有效期内：保留当前付费周期，仅切换套餐档位
            current_sub.plan_id = target_plan.id

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

    # ------------------------------------------------------------------
    # 周期到期处理
    # ------------------------------------------------------------------

    @staticmethod
    async def _superadmin_workspace_ids(db: AsyncSession) -> set[str]:
        """所有「OWNER 是超级管理员」的工作空间 id。

        超管不参与任何计费与降级：既不该被过期处理，也不该因缺订阅记录被拦。
        这里一次查全，避免在处理循环里逐个查询。
        """
        from app.models.user import User
        from app.models.workspace import WorkspaceMember, WorkspaceRole

        rows = (
            await db.execute(
                select(WorkspaceMember.workspace_id)
                .join(User, User.id == WorkspaceMember.user_id)
                .where(
                    User.is_superadmin.is_(True),
                    WorkspaceMember.role == WorkspaceRole.OWNER,
                )
            )
        ).scalars().all()
        return set(rows)

    @staticmethod
    async def expire_due_subscriptions(db: AsyncSession) -> dict:
        """把「周期已走完但状态仍是 ACTIVE」的订阅置为 EXPIRED。

        ## 为什么需要这个任务

        在此之前，``trial_ends_at`` / ``current_period_end`` 只被写入、从未被读取
        做判断，定时任务里也没有任何到期处理。于是试用期结束后：
        ``status`` 仍是 ACTIVE → ``get_ws_plan_tier`` 照常返回 pro →
        用户可**无限期使用付费功能且不会被扣费**。

        （档位判断那边已加了周期过滤作为兜底；这个任务负责把状态**落库纠正**，
        让后台列表、统计报表里的数据也是真实的。）

        ## 超管豁免

        超管工作空间直接跳过，不置 EXPIRED、不降级 —— 超管账号是无限期的。

        :return: 处理统计，供日志与手工排查使用。
        """
        from app.api.billing import _is_subscription_live

        now = to_naive_utc(datetime.now(timezone.utc))
        subs = (
            await db.execute(
                select(Subscription).where(
                    Subscription.status == SubscriptionStatus.ACTIVE
                )
            )
        ).scalars().all()

        superadmin_ws = await SubscriptionService._superadmin_workspace_ids(db)

        expired = 0
        skipped_admin = 0
        for sub in subs:
            if sub.workspace_id in superadmin_ws:
                skipped_admin += 1
                continue
            if _is_subscription_live(sub, now):
                continue
            sub.status = SubscriptionStatus.EXPIRED
            expired += 1

        if expired:
            await db.commit()

        return {
            "scanned": len(subs),
            "expired": expired,
            "skipped_admin": skipped_admin,
        }

    # ------------------------------------------------------------------
    # 到期前提醒
    # ------------------------------------------------------------------

    #: 提醒用的通知类型，同时作为**幂等键**（见 notify_expiring_subscriptions）
    EXPIRING_NOTIFICATION_TYPE = "subscription_expiring"

    @staticmethod
    async def _workspace_owner(db: AsyncSession, ws_id: str):
        """工作空间的 OWNER 用户（可能为 None）。"""
        from app.models.user import User
        from app.models.workspace import WorkspaceMember, WorkspaceRole

        return (
            await db.execute(
                select(User)
                .join(WorkspaceMember, WorkspaceMember.user_id == User.id)
                .where(
                    WorkspaceMember.workspace_id == ws_id,
                    WorkspaceMember.role == WorkspaceRole.OWNER,
                )
                .limit(1)
            )
        ).scalars().first()

    @staticmethod
    async def notify_expiring_subscriptions(db: AsyncSession, within_days: int = 3) -> dict:
        """给「还有 within_days 天到期」的订阅发提醒（站内信 + 邮件）。

        ## 幂等设计

        任务每天跑一次，而「到期前 3 天」是一个**持续 3 天的窗口** ——
        不做去重的话同一条订阅会被提醒 3 次。

        这里用 ``notification_type`` 做幂等键：发之前先查这个工作空间**今天**
        是否已经发过同类型通知。好处是不用给 subscription 表加
        ``reminder_sent_at`` 字段（省一次迁移），而且「同一自然日只提醒一次」
        这个语义比「只提醒一次」更合理 —— 万一任务某天没跑，第二天还能补上。

        ## 超管豁免

        与到期处理一致：超管工作空间不参与计费，不发提醒。
        """
        now = to_naive_utc(datetime.now(timezone.utc))
        window_end = now + timedelta(days=within_days)

        subs = (
            await db.execute(
                select(Subscription).where(
                    Subscription.status == SubscriptionStatus.ACTIVE
                )
            )
        ).scalars().all()

        superadmin_ws = await SubscriptionService._superadmin_workspace_ids(db)

        notified = 0
        skipped_admin = 0
        skipped_dupe = 0

        # 今天的时间下界，用于幂等查询
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        for sub in subs:
            if sub.workspace_id in superadmin_ws:
                skipped_admin += 1
                continue

            deadline = to_naive_utc(sub.current_period_end or sub.trial_ends_at)
            if deadline is None:
                continue  # Free：无到期概念
            if not (now < deadline <= window_end):
                continue  # 不在提醒窗口（已过期或还早）

            # 幂等：今天已提醒过就跳过
            from app.models.notification import Notification

            already = (
                await db.execute(
                    select(Notification.id).where(
                        Notification.workspace_id == sub.workspace_id,
                        Notification.notification_type
                        == SubscriptionService.EXPIRING_NOTIFICATION_TYPE,
                        Notification.created_at >= today_start,
                    ).limit(1)
                )
            ).first()
            if already:
                skipped_dupe += 1
                continue

            owner = await SubscriptionService._workspace_owner(db, sub.workspace_id)
            if owner is None:
                continue

            days_left = max(0, (deadline - now).days)
            plan = await db.get(SubscriptionPlan, sub.plan_id)
            plan_name = plan.name if plan else "当前套餐"

            title = f"{plan_name} 还有 {days_left} 天到期"
            message = (
                f"你的「{plan_name}」将在 {days_left} 天后到期（{deadline:%Y-%m-%d}）。"
                f"到期后将无法使用 AI 决策助手、利润归因等付费功能，"
                f"前往「计费与方案」可继续订阅。"
            )

            from app.services.notification import NotificationService

            await NotificationService.create_notification(
                db=db,
                workspace_id=sub.workspace_id,
                user_id=owner.id,
                title=title,
                message=message,
                notification_type=SubscriptionService.EXPIRING_NOTIFICATION_TYPE,
                link="/billing",
            )

            # 邮件是「锦上添花」：发信失败不该让整批任务回滚或中断
            if owner.email:
                try:
                    from app.services.email import send_email_async

                    await send_email_async(
                        to_email=owner.email,
                        subject=f"【Nexora】{title}",
                        body_html=(
                            f"<p>{message}</p>"
                            f'<p><a href="/billing">前往计费与方案</a></p>'
                        ),
                    )
                except Exception as e:  # noqa: BLE001
                    logger.warning(
                        "到期提醒邮件发送失败 ws=%s: %s", sub.workspace_id, str(e)[:150]
                    )

            notified += 1

        if notified:
            await db.commit()

        return {
            "scanned": len(subs),
            "notified": notified,
            "skipped_admin": skipped_admin,
            "skipped_duplicate": skipped_dupe,
        }


async def run_expire_subscriptions() -> dict:
    """调度器入口：处理订阅到期。

    与 ``store_sync.run_due_store_syncs`` 同构 —— 自建 session、自己兜异常，
    一次失败不影响调度器后续运行（调度器起不来/挂掉不该影响整个服务）。
    """
    from app.database import async_session_factory

    try:
        async with async_session_factory() as db:
            stats = await SubscriptionService.expire_due_subscriptions(db)
        if stats["expired"]:
            logger.info("订阅到期处理完成: %s", stats)
        else:
            logger.debug("订阅到期处理：本次无到期订阅 %s", stats)
        return stats
    except Exception as e:  # noqa: BLE001
        logger.warning("订阅到期处理失败: %s", str(e)[:200])
        return {"error": str(e)[:200]}


async def run_notify_expiring_subscriptions() -> dict:
    """调度器入口：给快到期（默认 3 天内）的订阅发提醒。"""
    from app.database import async_session_factory

    try:
        async with async_session_factory() as db:
            stats = await SubscriptionService.notify_expiring_subscriptions(db, within_days=3)
        if stats["notified"]:
            logger.info("订阅到期提醒已发送: %s", stats)
        else:
            logger.debug("订阅到期提醒：本次无需发送 %s", stats)
        return stats
    except Exception as e:  # noqa: BLE001
        logger.warning("订阅到期提醒失败: %s", str(e)[:200])
        return {"error": str(e)[:200]}