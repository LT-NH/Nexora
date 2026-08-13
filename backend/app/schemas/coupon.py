"""Nexora - Coupon Schemas (Pydantic v2)."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class CouponCreate(BaseModel):
    """Schema for creating a new coupon."""

    code: str = Field(..., min_length=3, max_length=50)
    type: str = Field(..., pattern=r"^(percent|fixed|free_shipping)$")
    value: float = Field(..., gt=0)
    min_order_amount: float = Field(0, ge=0)
    max_uses: int = Field(100, ge=1)
    expires_at: datetime


class CouponUpdate(BaseModel):
    """Schema for updating an existing coupon."""

    code: Optional[str] = Field(None, min_length=3, max_length=50)
    type: Optional[str] = Field(None, pattern=r"^(percent|fixed|free_shipping)$")
    value: Optional[float] = Field(None, gt=0)
    min_order_amount: Optional[float] = Field(None, ge=0)
    max_uses: Optional[int] = Field(None, ge=1)
    is_active: Optional[bool] = None
    expires_at: Optional[datetime] = None


class CouponResponse(BaseModel):
    """Schema for coupon data returned in API responses."""

    id: str
    workspace_id: str
    code: str
    type: str
    value: float
    min_order_amount: float
    max_uses: int
    used_count: int
    is_active: bool
    starts_at: datetime
    expires_at: datetime
    created_at: datetime
    model_config = {"from_attributes": True}


class CouponValidateRequest(BaseModel):
    """Schema for validating a coupon code at checkout."""

    code: str = Field(..., min_length=1, max_length=50)
    order_amount: float = Field(..., gt=0)


class CouponValidateResponse(BaseModel):
    """Schema for coupon validation result."""

    valid: bool
    coupon_id: Optional[str] = None
    code: Optional[str] = None
    type: Optional[str] = None
    discount_amount: float = 0.0
    message: Optional[str] = None
