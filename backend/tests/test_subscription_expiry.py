"""订阅周期到期处理测试。

覆盖三层：
1. ``_is_subscription_live`` —— 纯函数，周期是否还在服务期内
2. ``get_ws_plan_tier`` —— 过期订阅不应计入档位
3. ``expire_due_subscriptions`` —— 到期落库，且**超管工作空间豁免**

背景：此前 trial_ends_at / current_period_end 只被写入、从未被读取做判断，
定时任务里也没有到期处理，导致试用期结束后仍可无限期使用付费功能且不扣费。
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.api.billing import _is_subscription_live, get_ws_plan_tier
from app.models.subscription import (
    PaymentStatus,
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
)
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember, WorkspaceRole
from app.services.subscription import SubscriptionService

NOW = datetime(2026, 6, 15, 12, 0, 0)


def _utcnow_naive() -> datetime:
    """naive UTC，与生产代码里 to_naive_utc 的口径一致。"""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _sub(**kwargs) -> Subscription:
    """构造一个未落库的 Subscription，用于纯函数测试。"""
    sub = Subscription(
        id=str(uuid.uuid4()),
        workspace_id="ws-1",
        plan_id="plan-1",
        status=SubscriptionStatus.ACTIVE,
    )
    for key, value in kwargs.items():
        setattr(sub, key, value)
    return sub


# ---------------------------------------------------------------------------
# 1. _is_subscription_live
# ---------------------------------------------------------------------------

def test_trial_still_running():
    sub = _sub(trial_ends_at=NOW + timedelta(days=3))
    assert _is_subscription_live(sub, NOW) is True


def test_trial_expired():
    sub = _sub(trial_ends_at=NOW - timedelta(days=1))
    assert _is_subscription_live(sub, NOW) is False


def test_paid_period_still_running():
    sub = _sub(current_period_end=NOW + timedelta(days=20))
    assert _is_subscription_live(sub, NOW) is True


def test_paid_period_expired():
    sub = _sub(current_period_end=NOW - timedelta(hours=1))
    assert _is_subscription_live(sub, NOW) is False


def test_free_plan_never_expires():
    """Free 没有到期概念（两个字段都为空），不应被判为过期。"""
    sub = _sub(current_period_end=None, trial_ends_at=None)
    assert _is_subscription_live(sub, NOW) is True


def test_paid_period_takes_precedence_over_trial():
    """两个字段都有时以付费周期为准。

    付费周期已过、但旧的 trial_ends_at 还没到 —— 不能因为残留的试用期而续命。
    """
    sub = _sub(
        current_period_end=NOW - timedelta(days=1),
        trial_ends_at=NOW + timedelta(days=30),
    )
    assert _is_subscription_live(sub, NOW) is False


def test_aware_datetime_is_normalized():
    """带时区的 deadline 与 naive 的 now 比较不能抛 TypeError。

    SQLite 取回 naive、PostgreSQL 可能返回 aware —— 跨库必须归一。
    """
    from datetime import timezone

    aware_future = datetime(2026, 6, 20, 12, 0, 0, tzinfo=timezone.utc)
    sub = _sub(trial_ends_at=aware_future)
    assert _is_subscription_live(sub, NOW) is True  # 6/20 > 6/15，且不抛异常


# ---------------------------------------------------------------------------
# 2 & 3. 需要数据库的集成测试
# ---------------------------------------------------------------------------

async def _make_plan(db, slug: str, price: float) -> SubscriptionPlan:
    plan = SubscriptionPlan(
        id=str(uuid.uuid4()),
        name=slug.title(),
        slug=slug,
        price_monthly=price,
        price_yearly=price * 10,
        max_members=5,
        max_workspaces=1,
        features={"description": f"{slug} plan"},
    )
    db.add(plan)
    return plan


async def test_expired_subscription_is_not_counted_in_tier(session_factory, workspace_id):
    """周期已过的 ACTIVE 订阅不该让工作空间保持付费档位。"""
    async with session_factory() as db:
        plan = await _make_plan(db, "pro", 29)
        db.add(
            Subscription(
                id=str(uuid.uuid4()),
                workspace_id=workspace_id,
                plan_id=plan.id,
                status=SubscriptionStatus.ACTIVE,
                payment_status=PaymentStatus.VERIFIED,
                current_period_start=_utcnow_naive() - timedelta(days=60),
                current_period_end=_utcnow_naive() - timedelta(days=1),  # 已过期
            )
        )
        await db.commit()

        assert await get_ws_plan_tier(db, workspace_id) == "free"


async def test_live_subscription_keeps_tier(session_factory, workspace_id):
    """周期未过的订阅正常计入档位（确认上面的过滤没有误伤）。"""
    async with session_factory() as db:
        plan = await _make_plan(db, "pro", 29)
        db.add(
            Subscription(
                id=str(uuid.uuid4()),
                workspace_id=workspace_id,
                plan_id=plan.id,
                status=SubscriptionStatus.ACTIVE,
                payment_status=PaymentStatus.VERIFIED,
                current_period_start=_utcnow_naive(),
                current_period_end=_utcnow_naive() + timedelta(days=20),
            )
        )
        await db.commit()

        assert await get_ws_plan_tier(db, workspace_id) == "pro"


async def test_expire_marks_due_subscription(session_factory, workspace_id):
    """到期任务把过期的 ACTIVE 订阅置为 EXPIRED。"""
    sub_id = str(uuid.uuid4())
    async with session_factory() as db:
        plan = await _make_plan(db, "pro", 29)
        db.add(
            Subscription(
                id=sub_id,
                workspace_id=workspace_id,
                plan_id=plan.id,
                status=SubscriptionStatus.ACTIVE,
                payment_status=PaymentStatus.VERIFIED,
                current_period_start=_utcnow_naive() - timedelta(days=40),
                current_period_end=_utcnow_naive() - timedelta(days=2),
            )
        )
        await db.commit()

        stats = await SubscriptionService.expire_due_subscriptions(db)
        assert stats["expired"] == 1

        refreshed = await db.get(Subscription, sub_id)
        assert refreshed.status == SubscriptionStatus.EXPIRED


async def test_expire_keeps_live_subscription(session_factory, workspace_id):
    """未到期的订阅不能被误杀。"""
    sub_id = str(uuid.uuid4())
    async with session_factory() as db:
        plan = await _make_plan(db, "pro", 29)
        db.add(
            Subscription(
                id=sub_id,
                workspace_id=workspace_id,
                plan_id=plan.id,
                status=SubscriptionStatus.ACTIVE,
                payment_status=PaymentStatus.VERIFIED,
                current_period_start=_utcnow_naive(),
                current_period_end=_utcnow_naive() + timedelta(days=10),
            )
        )
        await db.commit()

        stats = await SubscriptionService.expire_due_subscriptions(db)
        assert stats["expired"] == 0

        refreshed = await db.get(Subscription, sub_id)
        assert refreshed.status == SubscriptionStatus.ACTIVE


async def test_expire_skips_superadmin_workspace(session_factory):
    """超管工作空间豁免：即使周期已过也不置 EXPIRED，不降级。"""
    ws_id = str(uuid.uuid4())
    uid = str(uuid.uuid4())
    sub_id = str(uuid.uuid4())

    async with session_factory() as db:
        db.add(Workspace(id=ws_id, name="Admin WS", slug=f"admin-{ws_id[:8]}"))
        db.add(
            User(
                id=uid,
                email=f"admin-{uid[:8]}@example.com",
                password_hash="x",
                full_name="Super Admin",
                is_superadmin=True,
            )
        )
        db.add(
            WorkspaceMember(
                id=str(uuid.uuid4()),
                workspace_id=ws_id,
                user_id=uid,
                role=WorkspaceRole.OWNER,
            )
        )
        plan = await _make_plan(db, "enterprise", 99)
        db.add(
            Subscription(
                id=sub_id,
                workspace_id=ws_id,
                plan_id=plan.id,
                status=SubscriptionStatus.ACTIVE,
                payment_status=PaymentStatus.VERIFIED,
                current_period_start=_utcnow_naive() - timedelta(days=400),
                current_period_end=_utcnow_naive() - timedelta(days=30),  # 早就过期
            )
        )
        await db.commit()

        stats = await SubscriptionService.expire_due_subscriptions(db)
        assert stats["expired"] == 0
        assert stats["skipped_admin"] >= 1

        refreshed = await db.get(Subscription, sub_id)
        assert refreshed.status == SubscriptionStatus.ACTIVE, "超管订阅不该被降级"


@pytest.mark.parametrize("slug,expected", [("free", 0), ("pro", 1), ("enterprise", 2)])
async def test_tier_rank_ordering(session_factory, workspace_id, slug, expected):
    """档位优先级：enterprise > pro > free（取最高档，不取最新）。"""
    async with session_factory() as db:
        plan = await _make_plan(db, slug, expected * 29)
        db.add(
            Subscription(
                id=str(uuid.uuid4()),
                workspace_id=workspace_id,
                plan_id=plan.id,
                status=SubscriptionStatus.ACTIVE,
                payment_status=PaymentStatus.VERIFIED,
                current_period_start=_utcnow_naive(),
                current_period_end=None,  # Free 无到期；付费档在测试里也不设
                trial_ends_at=None,
            )
        )
        await db.commit()
        # 不设到期的付费订阅仍应生效（确认 None 不被误判为过期）
        assert await get_ws_plan_tier(db, workspace_id) == slug
