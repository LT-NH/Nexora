"""Nexora - SubscriptionPlan & Subscription Models."""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SubscriptionStatus(str, enum.Enum):
    """Status of a workspace subscription.

    存储用枚举 name（大写），与本项目其他枚举列一致。
    """

    ACTIVE = "active"
    CANCELLED = "cancelled"
    PAST_DUE = "past_due"
    TRIALING = "trialing"
    INCOMPLETE = "incomplete"
    # 试用期或付费周期已过，且未续费。
    #
    # 与 PAST_DUE 的区别：PAST_DUE 是「该付款但没付成功」（有未结订单、要催收），
    # EXPIRED 是「周期自然走完且没有续费意图」（试用结束、或付费周期结束未续）。
    # 两者的运营动作不同，所以不能合并成一个状态。
    #
    # 加这个值不需要迁移：列是 VARCHAR(10)，"EXPIRED" 只有 7 个字符。
    EXPIRED = "expired"


class PaymentStatus(str, enum.Enum):
    """Payment verification status."""

    PENDING = "pending"
    VERIFIED = "verified"
    FAILED = "failed"
    NOT_REQUIRED = "not_required"


class SubscriptionPlan(Base):
    """Available subscription plans."""

    __tablename__ = "subscription_plans"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    slug: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        nullable=False,
        index=True,
    )
    price_monthly: Mapped[float] = mapped_column(
        Numeric(12, 2),
        default=0.0,
        nullable=False,
    )
    price_yearly: Mapped[float] = mapped_column(
        Numeric(12, 2),
        default=0.0,
        nullable=False,
    )
    max_members: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
    )
    max_workspaces: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
    )
    features: Mapped[dict] = mapped_column(
        JSON,
        default=dict,
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    # Relationships
    subscriptions: Mapped[list["Subscription"]] = relationship(
        "Subscription",
        back_populates="plan",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<SubscriptionPlan(id={self.id!r}, slug={self.slug!r})>"


class Subscription(Base):
    """A workspace's subscription to a plan."""

    __tablename__ = "subscriptions"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    plan_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("subscription_plans.id", ondelete="RESTRICT"),
        nullable=False,
    )
    status: Mapped[SubscriptionStatus] = mapped_column(
        Enum(SubscriptionStatus),
        default=SubscriptionStatus.TRIALING,
        nullable=False,
    )
    trial_ends_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )
    current_period_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    current_period_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )
    stripe_subscription_id: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        default=None,
    )
    payment_status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus),
        default=PaymentStatus.NOT_REQUIRED,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship(
        "Workspace",
        back_populates="subscriptions",
    )
    plan: Mapped["SubscriptionPlan"] = relationship(
        "SubscriptionPlan",
        back_populates="subscriptions",
    )

    def __repr__(self) -> str:
        return (
            f"<Subscription(id={self.id!r}, workspace_id={self.workspace_id!r}, "
            f"status={self.status!r})>"
        )