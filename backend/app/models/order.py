"""Nexora - Order & OrderItem Models."""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
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


class OrderStatus(str, enum.Enum):
    """Order lifecycle status."""

    PENDING = "pending"
    CONFIRMED = "confirmed"
    PROCESSING = "processing"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"


class PaymentStatus(str, enum.Enum):
    """Payment status for an order."""

    UNPAID = "unpaid"
    PAID = "paid"
    PARTIALLY_REFUNDED = "partially_refunded"
    REFUNDED = "refunded"


class Order(Base):
    """Customer order scoped to a workspace."""

    __tablename__ = "orders"

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
    customer_id: Mapped[str | None] = mapped_column(
        CHAR(36),
        ForeignKey("customers.id", ondelete="SET NULL"),
        nullable=True,
        default=None,
        index=True,
    )
    customer_name: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        default=None,
    )
    customer_email: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        default=None,
    )
    order_number: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        nullable=False,
        index=True,
    )
    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus),
        default=OrderStatus.PENDING,
        nullable=False,
    )
    subtotal: Mapped[float] = mapped_column(
        Float(asdecimal=True),
        default=0.0,
        nullable=False,
    )
    tax: Mapped[float] = mapped_column(
        Float(asdecimal=True),
        default=0.0,
        nullable=False,
    )
    shipping: Mapped[float] = mapped_column(
        Float(asdecimal=True),
        default=0.0,
        nullable=False,
    )
    discount: Mapped[float] = mapped_column(
        Float(asdecimal=True),
        default=0.0,
        nullable=False,
    )
    total: Mapped[float] = mapped_column(
        Float(asdecimal=True),
        default=0.0,
        nullable=False,
    )
    shipping_address: Mapped[dict] = mapped_column(
        JSON,
        default=dict,
        nullable=False,
    )
    shipped_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )
    delivered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )
    tracking_number: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        default=None,
    )
    carrier: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        default=None,
        comment="SF/YT/ZTO/STO etc.",
    )
    notes: Mapped[str | None] = mapped_column(
        String(2000),
        nullable=True,
        default=None,
    )
    payment_status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus),
        default=PaymentStatus.UNPAID,
        nullable=False,
    )
    platform: Mapped[str | None] = mapped_column(
        String(50),
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
    items: Mapped[list["OrderItem"]] = relationship(
        "OrderItem",
        back_populates="order",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    customer: Mapped["Customer"] = relationship(
        "Customer",
        back_populates="orders",
    )

    def __repr__(self) -> str:
        return (
            f"<Order(id={self.id!r}, order_number={self.order_number!r}, "
            f"status={self.status!r}, total={self.total!r})>"
        )


class OrderItem(Base):
    """Line item within an order."""

    __tablename__ = "order_items"

    id: Mapped[str] = mapped_column(
        CHAR(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    order_id: Mapped[str] = mapped_column(
        CHAR(36),
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    product_id: Mapped[str | None] = mapped_column(
        CHAR(36),
        ForeignKey("products.id", ondelete="SET NULL"),
        nullable=True,
        default=None,
        index=True,
    )
    variant_id: Mapped[str | None] = mapped_column(
        CHAR(36),
        ForeignKey("product_variants.id", ondelete="SET NULL"),
        nullable=True,
        default=None,
    )
    product_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    sku: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        default=None,
    )
    quantity: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
    )
    unit_price: Mapped[float] = mapped_column(
        Float(asdecimal=True),
        default=0.0,
        nullable=False,
    )
    total_price: Mapped[float] = mapped_column(
        Float(asdecimal=True),
        default=0.0,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    order: Mapped["Order"] = relationship(
        "Order",
        back_populates="items",
    )

    def __repr__(self) -> str:
        return (
            f"<OrderItem(id={self.id!r}, product_name={self.product_name!r}, "
            f"quantity={self.quantity!r}, total_price={self.total_price!r})>"
        )
