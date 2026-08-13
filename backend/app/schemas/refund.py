"""Nexora - Refund Schemas (Pydantic v2)."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class RefundCreate(BaseModel):
    """Schema for creating a new refund request."""
    order_id: str
    amount: float = Field(..., gt=0)
    reason: str
    reason_detail: Optional[str] = None


class RefundUpdate(BaseModel):
    """Schema for processing (approving/rejecting) a refund request."""
    status: Optional[str] = None
    reviewer_note: Optional[str] = None


class RefundResponse(BaseModel):
    """Schema for refund data returned in API responses."""
    id: str
    workspace_id: str
    order_id: str
    amount: float
    reason: str
    reason_detail: Optional[str] = None
    status: str
    reviewer_note: Optional[str] = None
    reviewed_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
