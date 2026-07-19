"""Nexora - SubscriptionPlan & Subscription Models."""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    func,
)
from sqlalchemy.dialects.sqlite import CHAR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SubscriptionStatus(str, enum.Enum):
    """Status of a workspace subscription."""

    ACTIVE = "active"
    CANCELLED = "cancelled"
    PAST_DUE = "past_due"
    TRIALING = "trialing"
    INCOMPLETE = "incomplete"


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
        CHAR(36),
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
        Float,
        default=0.0,
        nullable=False,
    )
    price_yearly: Mapped[float] = mapped_column(
        Float,
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
        CHAR(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        CHAR(36),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    plan_id: Mapped[str] = mapped_column(
        CHAR(36),
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