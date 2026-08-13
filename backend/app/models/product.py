"""Nexora - Product, ProductVariant & ProductCategory Models."""

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
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.sqlite import CHAR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ProductStatus(str, enum.Enum):
    """Product lifecycle status."""

    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"
    OUT_OF_STOCK = "out_of_stock"


class Product(Base):
    """Product / SKU master data for e-commerce retail."""

    __tablename__ = "products"
    __table_args__ = (
        UniqueConstraint("workspace_id", "slug", name="uq_product_slug_per_workspace"),
    )

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
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    slug: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        index=True,
    )
    description: Mapped[str | None] = mapped_column(
        String(2000),
        nullable=True,
        default=None,
    )
    category: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        default=None,
    )
    brand: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        default=None,
    )
    price: Mapped[float] = mapped_column(
        Float(asdecimal=True),
        nullable=False,
        default=0.0,
    )
    compare_at_price: Mapped[float | None] = mapped_column(
        Float(asdecimal=True),
        nullable=True,
        default=None,
    )
    cost_price: Mapped[float | None] = mapped_column(
        Float(asdecimal=True),
        nullable=True,
        default=None,
    )
    sku: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        default=None,
        index=True,
        comment="Stock keeping unit code",
    )
    stock: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="Current stock quantity",
    )
    low_stock_threshold: Mapped[int] = mapped_column(
        Integer,
        default=10,
        nullable=False,
        comment="Low stock alert threshold",
    )
    barcode: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        default=None,
    )
    weight: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
        default=None,
    )
    status: Mapped[ProductStatus] = mapped_column(
        Enum(ProductStatus),
        default=ProductStatus.DRAFT,
        nullable=False,
    )
    has_variants: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    tags: Mapped[list] = mapped_column(
        JSON,
        default=list,
        nullable=False,
    )
    images: Mapped[list] = mapped_column(
        JSON,
        default=list,
        nullable=False,
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
    variants: Mapped[list["ProductVariant"]] = relationship(
        "ProductVariant",
        back_populates="product",
        lazy="selectin",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return (
            f"<Product(id={self.id!r}, name={self.name!r}, "
            f"sku={self.sku!r}, status={self.status!r})>"
        )


class ProductVariant(Base):
    """Variant of a product (e.g. size, color)."""

    __tablename__ = "product_variants"

    id: Mapped[str] = mapped_column(
        CHAR(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    product_id: Mapped[str] = mapped_column(
        CHAR(36),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    sku: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        default=None,
        index=True,
    )
    price: Mapped[float | None] = mapped_column(
        Float(asdecimal=True),
        nullable=True,
        default=None,
    )
    stock: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    attributes: Mapped[dict] = mapped_column(
        JSON,
        default=dict,
        nullable=False,
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
    product: Mapped["Product"] = relationship(
        "Product",
        back_populates="variants",
    )

    def __repr__(self) -> str:
        return (
            f"<ProductVariant(id={self.id!r}, name={self.name!r}, "
            f"sku={self.sku!r}, product_id={self.product_id!r})>"
        )


class ProductCategory(Base):
    """Hierarchical product category tree scoped to a workspace."""

    __tablename__ = "product_categories"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "slug", name="uq_category_slug_per_workspace"
        ),
    )

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
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    slug: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        index=True,
    )
    parent_id: Mapped[str | None] = mapped_column(
        CHAR(36),
        ForeignKey("product_categories.id", ondelete="SET NULL"),
        nullable=True,
        default=None,
        index=True,
    )
    sort_order: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    description: Mapped[str | None] = mapped_column(
        String(500),
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

    # Self-referential relationship
    children: Mapped[list["ProductCategory"]] = relationship(
        "ProductCategory",
        backref="parent",
        remote_side="ProductCategory.id",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return (
            f"<ProductCategory(id={self.id!r}, name={self.name!r}, "
            f"slug={self.slug!r})>"
        )
