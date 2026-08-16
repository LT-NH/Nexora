"""Nexora - Refund Schemas (Pydantic v2)."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class RefundCreate(BaseModel):
    """Schema for creating a new refund request."""
    order_id: str
    amount: float = Field(..., gt=0)
    reason: Literal[
        "quality",
        "wrong_item",
        "damaged",
        "not_as_described",
        "other",
    ]
    reason_detail: Optional[str] = Field(None, max_length=500)


class RefundUpdate(BaseModel):
    """Schema for processing (approving/rejecting) a refund request."""
    status: Optional[
        Literal[
            "pending",
            "approved",
            "rejected",
            "processing",
            "completed",
            "cancelled",
        ]
    ] = None
    reviewer_note: Optional[str] = None


class RefundResponse(BaseModel):
    """Schema for refund data returned in API responses."""
    id: str
    workspace_id: str
    order_id: str
    order_number: Optional[str] = None
    amount: float
    reason: str
    reason_detail: Optional[str] = None
    status: str
    reviewer_note: Optional[str] = None
    reviewed_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
