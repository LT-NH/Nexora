"""Nexora - Order & OrderItem Models."""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    UniqueConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    func,
)
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


class OrderDataSource(str, enum.Enum):
    """订单数据来源 —— 把「演示/测试数据」与「真实经营数据」分开。

    背景：此前全库不区分来源，simulator 造的假订单会贴上任意的 platform 标签
    （库里有 941 笔标着 douyin / taobao / wechat 的订单，而系统里根本没有这些
    平台的店铺），导致利润分析、健康评分、AI 建议都可能建立在假数据上，
    而且**事后无法区分真假**。

    判定原则：宁可误标为 simulated，不可漏标为 real —— 本产品卖的就是数据洞察，
    把假数据当真的代价（客户信任归零）远大于把真数据当假的代价（可人工修正）。
    """

    REAL = "real"            # 平台真实同步，或商家手工真实录入
    SANDBOX = "sandbox"      # 沙箱适配器产生（对应店铺 sandbox=True）
    SIMULATED = "simulated"  # 模拟器 / 种子脚本 / 自动化测试产生


class Order(Base):
    """Customer order scoped to a workspace."""

    __tablename__ = "orders"

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
    customer_id: Mapped[str | None] = mapped_column(
        String(36),
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
        unique=False,  # 多租户：订单号按工作空间隔离（复合唯一见 __table_args__）
        nullable=False,
        index=True,
    )
    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus),
        default=OrderStatus.PENDING,
        nullable=False,
    )
    subtotal: Mapped[float] = mapped_column(
        Numeric(12, 2),
        default=0.0,
        nullable=False,
    )
    tax: Mapped[float] = mapped_column(
        Numeric(12, 2),
        default=0.0,
        nullable=False,
    )
    shipping: Mapped[float] = mapped_column(
        Numeric(12, 2),
        default=0.0,
        nullable=False,
    )
    discount: Mapped[float] = mapped_column(
        Numeric(12, 2),
        default=0.0,
        nullable=False,
    )
    total: Mapped[float] = mapped_column(
        Numeric(12, 2),
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
    platform_order_id: Mapped[str | None] = mapped_column(
        String(128),
        nullable=True,
        default=None,
        index=True,
        comment="平台侧订单 ID —— 跨次同步的幂等键（Shopify id / 淘宝 tid …）",
    )
    data_source: Mapped[OrderDataSource] = mapped_column(
        Enum(OrderDataSource),
        default=OrderDataSource.REAL,
        nullable=False,
        index=True,
        comment="real / sandbox / simulated —— 见 OrderDataSource",
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

    __table_args__ = (
        UniqueConstraint("workspace_id", "order_number", name="uq_order_workspace_number"),
        # 平台单号的幂等键：同一工作空间 + 同一平台订单只允许一行。
        # 此前同步去重用的是 order_number，而 Shopify 的订单号**每个店铺独立编号**
        # （每家都从 #1001 开始）—— 同工作空间接入两个店铺时会互相覆盖。
        # SQLite / PostgreSQL 都允许多行 NULL，因此历史数据（该列为空）不受影响。
        UniqueConstraint(
            "workspace_id", "platform_order_id", name="uq_order_workspace_platform_id"
        ),
        # 时间窗聚合（体检 / 报表 / 巡检 / AI 摘要）一律是
        # `workspace_id = ? AND created_at >= ?`；只有 workspace_id 单列索引时，
        # 数据库要先按空间取出全部历史订单再过滤时间 —— 大租户下这是体检变慢的
        # 直接原因。旧库由 database.init_db 的 _ensure_performance_indexes 补齐。
        Index("ix_orders_workspace_created", "workspace_id", "created_at"),
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
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    order_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    product_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("products.id", ondelete="SET NULL"),
        nullable=True,
        default=None,
        index=True,
    )
    variant_id: Mapped[str | None] = mapped_column(
        String(36),
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
        Numeric(12, 2),
        default=0.0,
        nullable=False,
    )
    total_price: Mapped[float] = mapped_column(
        Numeric(12, 2),
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
