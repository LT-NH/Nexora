"""Nexora - Review Schemas (Pydantic v2)."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ReviewCreate(BaseModel):
    """Schema for creating a new review."""

    customer_name: str = Field(..., min_length=1, max_length=255)
    rating: int = Field(..., ge=1, le=5)
    content: Optional[str] = Field(None, max_length=5000)
    image_urls: Optional[list[str]] = Field(None, max_length=10)
    is_verified: bool = Field(default=False)


class ReviewUpdate(BaseModel):
    """Schema for updating an existing review."""

    customer_name: Optional[str] = Field(None, min_length=1, max_length=255)
    rating: Optional[int] = Field(None, ge=1, le=5)
    content: Optional[str] = Field(None, max_length=5000)
    image_urls: Optional[list[str]] = Field(None, max_length=10)
    is_verified: Optional[bool] = None
    is_approved: Optional[bool] = None


class ReviewReply(BaseModel):
    """Schema for seller reply to a review."""

    reply: str = Field(..., min_length=1, max_length=5000)


class ReviewResponse(BaseModel):
    """Schema for review data returned in API responses."""

    id: str
    workspace_id: str
    product_id: str
    customer_name: str
    rating: int
    content: Optional[str] = None
    image_urls: Optional[list[str]] = None
    reply: Optional[str] = None
    replied_at: Optional[datetime] = None
    is_approved: bool = True
    is_verified: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class ReviewStatsResponse(BaseModel):
    """Schema for aggregated review statistics."""

    average_rating: float = 0.0
    total_reviews: int = 0
    rating_distribution: dict[str, int] = Field(default_factory=dict)
