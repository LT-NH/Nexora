"""Nexora - Order Schemas (Pydantic v2)."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class OrderItemCreate(BaseModel):
    """Schema for creating an order line item."""
    product_id: Optional[str] = None
    variant_id: Optional[str] = None
    product_name: str = Field(..., min_length=1, max_length=255)
    sku: Optional[str] = Field(None, max_length=100)
    quantity: int = Field(..., ge=1)
    unit_price: float = Field(..., ge=0)
    total_price: Optional[float] = Field(None, ge=0)

    def model_post_init(self, __context) -> None:
        """Auto-calculate total_price from quantity * unit_price if not provided."""
        if self.total_price is None or self.total_price == 0:
            self.total_price = self.quantity * self.unit_price


class OrderItemResponse(BaseModel):
    """Schema for order item data returned in API responses."""
    id: str
    order_id: str
    product_id: Optional[str] = None
    variant_id: Optional[str] = None
    product_name: str
    sku: Optional[str] = None
    quantity: int
    unit_price: float
    total_price: float
    created_at: datetime
    model_config = {"from_attributes": True}


class OrderCreate(BaseModel):
    """Schema for creating a new order."""
    customer_id: Optional[str] = None
    customer_name: Optional[str] = Field(None, max_length=255)
    customer_email: Optional[str] = Field(None, max_length=255)
    order_number: Optional[str] = Field(None, min_length=1, max_length=100)
    status: str = Field(default="pending", pattern=r"^(pending|confirmed|processing|shipped|delivered|cancelled|refunded)$")
    subtotal: float = Field(default=0.0, ge=0)
    tax: float = Field(default=0.0, ge=0)
    shipping: float = Field(default=0.0, ge=0)
    discount: float = Field(default=0.0, ge=0)
    total: float = Field(default=0.0, ge=0)
    shipping_address: Optional[dict[str, Any]] = Field(default=None)
    notes: Optional[str] = Field(None, max_length=2000)
    payment_status: str = Field(default="unpaid", pattern=r"^(unpaid|paid|partially_refunded|refunded)$")
    platform: Optional[str] = Field(None, max_length=50)
    items: list[OrderItemCreate] = Field(default_factory=list)


class OrderUpdate(BaseModel):
    """Schema for updating an existing order."""
    customer_id: Optional[str] = None
    status: Optional[str] = Field(None, pattern=r"^(pending|confirmed|processing|shipped|delivered|cancelled|refunded)$")
    subtotal: Optional[float] = Field(None, ge=0)
    tax: Optional[float] = Field(None, ge=0)
    shipping: Optional[float] = Field(None, ge=0)
    discount: Optional[float] = Field(None, ge=0)
    total: Optional[float] = Field(None, ge=0)
    shipping_address: Optional[dict[str, Any]] = None
    notes: Optional[str] = Field(None, max_length=2000)
    payment_status: Optional[str] = Field(None, pattern=r"^(unpaid|paid|partially_refunded|refunded)$")
    platform: Optional[str] = Field(None, max_length=50)


class OrderResponse(BaseModel):
    """Schema for order data returned in API responses."""
    id: str
    workspace_id: str
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    order_number: str
    status: str
    subtotal: float
    tax: float
    shipping: float
    discount: float
    total: float
    shipping_address: Optional[dict[str, Any]] = None
    shipped_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    notes: Optional[str] = None
    payment_status: str
    platform: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    items: list[OrderItemResponse] = []
    model_config = {"from_attributes": True}


class OrderDetailResponse(OrderResponse):
    """Schema for order data including line items."""
    items: list[OrderItemResponse] = []
