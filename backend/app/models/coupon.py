"""Nexora - Coupon Model."""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CouponType(str, enum.Enum):
    """Type of discount offered by a coupon."""

    PERCENT = "percent"  # e.g. 10% off
    FIXED = "fixed"  # e.g. ¥5 off
    FREE_SHIPPING = "free_shipping"


class Coupon(Base):
    """Promotional coupon scoped to a workspace."""

    __tablename__ = "coupons"

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
    code: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )
    type: Mapped[CouponType] = mapped_column(
        Enum(CouponType),
        nullable=False,
    )
    value: Mapped[float] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        comment="percent: 10=10%, fixed: 5=¥5",
    )
    min_order_amount: Mapped[float] = mapped_column(
        Numeric(12, 2),
        default=0,
        nullable=False,
        comment="Minimum order amount required to apply",
    )
    max_uses: Mapped[int] = mapped_column(
        Integer,
        default=100,
        nullable=False,
    )
    used_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
    starts_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<Coupon(id={self.id!r}, code={self.code!r}, "
            f"type={self.type!r}, value={self.value!r})>"
        )
