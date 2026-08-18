"""Nexora - Product Schemas (Pydantic v2)."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class ProductCreate(BaseModel):
    """Schema for creating a new product."""
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=255, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    description: Optional[str] = Field(None, max_length=2000)
    category: Optional[str] = Field(None, max_length=100)
    brand: Optional[str] = Field(None, max_length=100)
    price: float = Field(..., ge=0)
    compare_at_price: Optional[float] = Field(None, ge=0)
    cost_price: Optional[float] = Field(None, ge=0)
    sku: Optional[str] = Field(None, max_length=100)
    stock: Optional[int] = Field(0, ge=0)
    low_stock_threshold: Optional[int] = Field(10, ge=0)
    barcode: Optional[str] = Field(None, max_length=100)
    weight: Optional[float] = Field(None, ge=0)
    status: str = Field(default="draft", pattern=r"^(draft|active|archived)$")
    has_variants: bool = Field(default=False)
    tags: Optional[list[Any]] = Field(default=None)
    images: Optional[list[Any]] = Field(default=None)


class ProductUpdate(BaseModel):
    """Schema for updating an existing product."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    slug: Optional[str] = Field(None, min_length=1, max_length=255, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    description: Optional[str] = Field(None, max_length=2000)
    category: Optional[str] = Field(None, max_length=100)
    brand: Optional[str] = Field(None, max_length=100)
    price: Optional[float] = Field(None, ge=0)
    compare_at_price: Optional[float] = Field(None, ge=0)
    cost_price: Optional[float] = Field(None, ge=0)
    sku: Optional[str] = Field(None, max_length=100)
    stock: Optional[int] = Field(None, ge=0)
    low_stock_threshold: Optional[int] = Field(None, ge=0)
    barcode: Optional[str] = Field(None, max_length=100)
    weight: Optional[float] = Field(None, ge=0)
    status: Optional[str] = Field(None, pattern=r"^(draft|active|archived)$")
    has_variants: Optional[bool] = None
    tags: Optional[list[Any]] = None
    images: Optional[list[Any]] = None


class ProductResponse(BaseModel):
    """Schema for product data returned in API responses."""
    id: str
    workspace_id: str
    name: str
    slug: str
    description: Optional[str] = None
    category: Optional[str] = None
    brand: Optional[str] = None
    price: float
    compare_at_price: Optional[float] = None
    cost_price: Optional[float] = None
    sku: Optional[str] = None
    stock: int = 0
    low_stock_threshold: int = 10
    barcode: Optional[str] = None
    weight: Optional[float] = None
    status: str
    has_variants: bool
    shopify_sync_warning: Optional[str] = None  # 双向同步失败时的提示
    tags: list[Any] = []
    images: list[Any] = []
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class ProductVariantCreate(BaseModel):
    """Schema for creating a product variant."""
    name: str = Field(..., min_length=1, max_length=255)
    sku: Optional[str] = Field(None, max_length=100)
    price: Optional[float] = Field(None, ge=0)
    stock: int = Field(default=0, ge=0)
    attributes: Optional[dict[str, Any]] = Field(default=None)


class ProductVariantUpdate(BaseModel):
    """Schema for updating a product variant."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    sku: Optional[str] = Field(None, max_length=100)
    price: Optional[float] = Field(None, ge=0)
    stock: Optional[int] = Field(None, ge=0)
    attributes: Optional[dict[str, Any]] = None


class ProductVariantResponse(BaseModel):
    """Schema for variant data returned in API responses."""
    id: str
    product_id: str
    name: str
    sku: Optional[str] = None
    price: Optional[float] = None
    stock: int
    attributes: dict[str, Any] = {}
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class ProductCategoryCreate(BaseModel):
    """Schema for creating a product category."""
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=255, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    parent_id: Optional[str] = Field(None)
    sort_order: int = Field(default=0, ge=0)
    description: Optional[str] = Field(None)


class ProductCategoryUpdate(BaseModel):
    """Schema for updating a product category."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    slug: Optional[str] = Field(None, min_length=1, max_length=255, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    parent_id: Optional[str] = None
    sort_order: Optional[int] = Field(None, ge=0)
    description: Optional[str] = Field(None)


class ProductCategoryResponse(BaseModel):
    """Schema for category data returned in API responses."""
    id: str
    workspace_id: str
    name: str
    slug: str
    parent_id: Optional[str] = None
    sort_order: int
    description: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}
