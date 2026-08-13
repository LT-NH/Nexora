"""Nexora - Feedback Schemas (Pydantic v2)."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class FeedbackCreate(BaseModel):
    """Schema for creating a feedback / NPS entry."""

    type: str = Field(..., pattern="^(nps|feedback)$")
    nps_score: Optional[int] = Field(None, ge=0, le=10)
    content: Optional[str] = Field(None, max_length=5000)


class FeedbackResponse(BaseModel):
    """Schema for feedback data returned in API responses."""

    id: str
    workspace_id: str
    user_id: str
    type: str
    nps_score: Optional[int] = None
    content: Optional[str] = None
    created_at: datetime
    model_config = {"from_attributes": True}
