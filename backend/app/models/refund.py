"""Nexora - Refund Model."""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.database import Base


class RefundStatus(str, enum.Enum):
    """Refund lifecycle status."""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    PROCESSING = "processing"
    COMPLETED = "completed"


class RefundReason(str, enum.Enum):
    """Categories of refund reasons."""
    QUALITY = "quality"
    WRONG_ITEM = "wrong_item"
    DAMAGED = "damaged"
    NOT_AS_DESCRIBED = "not_as_described"
    OTHER = "other"


class Refund(Base):
    """A refund/after-sales request linked to an order within a workspace."""

    __tablename__ = "refunds"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id = Column(String(36), ForeignKey("workspaces.id"), nullable=False)
    order_id = Column(String(36), ForeignKey("orders.id"), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    reason = Column(Enum(RefundReason), nullable=False)
    reason_detail = Column(Text, nullable=True)
    status = Column(Enum(RefundStatus), default=RefundStatus.PENDING, nullable=False)
    reviewer_note = Column(Text, nullable=True)
    reviewed_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    workspace = relationship("Workspace", backref="refunds", lazy="selectin")
    order = relationship("Order", backref="refunds", lazy="selectin")
    reviewer = relationship("User", backref="reviewed_refunds", lazy="selectin")

    def __repr__(self) -> str:
        return (
            f"<Refund(id={self.id!r}, order_id={self.order_id!r}, "
            f"status={self.status!r}, amount={self.amount!r})>"
        )
