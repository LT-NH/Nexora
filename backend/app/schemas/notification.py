"""Nexora - Notification Schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class NotificationResponse(BaseModel):
    """Schema for notification data returned in API responses."""
    id: str
    title: str
    message: str
    notification_type: str
    link: Optional[str] = None
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationCreate(BaseModel):
    """Schema for creating a notification."""
    user_id: str = Field(..., description="Target user ID")
    title: str = Field(..., min_length=1, max_length=255)
    message: str = Field(..., min_length=1, max_length=1000)
    notification_type: str = Field(default="info", description="info, success, warning, error")
    link: Optional[str] = Field(None, max_length=512)


class NotificationCount(BaseModel):
    """Schema for unread notification count."""
    unread_count: int