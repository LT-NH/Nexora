"""Nexora - Customer Schemas (Pydantic v2)."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class CustomerCreate(BaseModel):
    """Schema for creating a new customer."""
    name: str = Field(..., min_length=1, max_length=255)
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)
    tags: Optional[list[Any]] = Field(default=None)
    notes: Optional[str] = Field(None, max_length=2000)
    source: Optional[str] = Field(None, max_length=100)


class CustomerUpdate(BaseModel):
    """Schema for updating an existing customer."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)
    tags: Optional[list[Any]] = None
    notes: Optional[str] = Field(None, max_length=2000)
    source: Optional[str] = Field(None, max_length=100)


class CustomerResponse(BaseModel):
    """Schema for customer data returned in API responses."""
    id: str
    workspace_id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    tags: list[Any] = []
    total_orders: int
    total_spent: float
    last_order_at: Optional[datetime] = None
    membership_level: Optional[str] = None
    membership_points: int = 0
    notes: Optional[str] = None
    source: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class RFMSegment(BaseModel):
    """Schema for RFM analysis segment."""
    segment: str = Field(...)
    r_score: int = Field(..., ge=1, le=5)
    f_score: int = Field(..., ge=1, le=5)
    m_score: int = Field(..., ge=1, le=5)
    rfm_score: float = Field(...)
    customer_count: int = Field(..., ge=0)
    average_total_spent: float = Field(..., ge=0)


class RFMAnalysisResponse(BaseModel):
    """Schema for full RFM analysis response."""
    workspace_id: str
    total_customers: int
    segments: list[RFMSegment]
    analyzed_at: datetime
