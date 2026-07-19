"""Nexora - Store Schemas (Pydantic v2)."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.store import StoreStatus


class StoreCreate(BaseModel):
    """Schema for creating a new store connection."""
    name: str = Field(..., min_length=1, max_length=255)
    platform: str = Field(..., pattern=r"^(taobao|jd|pdd|douyin|shopify|amazon|sandbox|other)$")
    store_url: Optional[str] = Field(None, max_length=512)
    api_key: Optional[str] = Field(None, max_length=512)
    api_secret: Optional[str] = Field(None, max_length=512)
    access_token: Optional[str] = Field(None, max_length=2048)


class StoreUpdate(BaseModel):
    """Schema for updating a store."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    store_url: Optional[str] = Field(None, max_length=512)
    api_key: Optional[str] = Field(None, max_length=512)
    api_secret: Optional[str] = Field(None, max_length=512)
    access_token: Optional[str] = Field(None, max_length=2048)
    status: Optional[str] = Field(None, pattern=r"^(connected|disconnected|error)$")


class StoreResponse(BaseModel):
    """Schema for store data returned in API responses."""
    id: str
    workspace_id: str
    name: str
    platform: str
    store_url: Optional[str] = None
    api_key: Optional[str] = None
    access_token: Optional[str] = None
    status: StoreStatus
    last_sync_at: Optional[datetime] = None
    created_at: datetime
    model_config = {"from_attributes": True}
