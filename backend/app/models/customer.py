"""Nexora - Customer Model."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Customer(Base):
    """Customer profile scoped to a workspace."""

    __tablename__ = "customers"

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
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    email: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        default=None,
        index=True,
    )
    phone: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        default=None,
    )
    tags: Mapped[list] = mapped_column(
        JSON,
        default=list,
        nullable=False,
    )
    total_orders: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    total_spent: Mapped[float] = mapped_column(
        Numeric(12, 2),
        default=0.0,
        nullable=False,
    )
    last_order_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )
    membership_level: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
        default="bronze",
    )
    membership_points: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(
        String(2000),
        nullable=True,
        default=None,
    )
    source: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        default=None,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    orders: Mapped[list["Order"]] = relationship(
        "Order",
        back_populates="customer",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return (
            f"<Customer(id={self.id!r}, name={self.name!r}, "
            f"email={self.email!r})>"
        )
