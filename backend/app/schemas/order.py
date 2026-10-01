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
    # 数据来源。默认 real（商家手工录入是真实经营数据）。
    # 模拟器 / 种子脚本 / 自动化测试**必须显式传 simulated**，
    # 否则假数据会被当成真实数据进入利润分析。
    data_source: str = Field(default="real", pattern=r"^(real|sandbox|simulated)$")
    # 平台侧订单 ID（幂等键）。平台同步写入时必须提供。
    platform_order_id: Optional[str] = Field(None, max_length=128)
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
    tracking_number: Optional[str] = Field(None, max_length=100)
    carrier: Optional[str] = Field(None, max_length=50)
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
    tracking_number: Optional[str] = None
    carrier: Optional[str] = None
    notes: Optional[str] = None
    payment_status: str
    platform: Optional[str] = None
    platform_order_id: Optional[str] = None
    data_source: str = "real"
    created_at: datetime
    updated_at: datetime
    items: list[OrderItemResponse] = []
    model_config = {"from_attributes": True}


class OrderDetailResponse(OrderResponse):
    """Schema for order data including line items."""
    items: list[OrderItemResponse] = []
