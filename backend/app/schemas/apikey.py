"""Nexora - API Key Schemas (Pydantic v2)."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class ApiKeyCreate(BaseModel):
    """Schema for creating a new API key."""

    name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Name/label for the API key",
    )
    scopes: Optional[dict[str, Any]] = Field(
        default=None,
        description="Permission scopes for the key",
    )
    expires_in_days: Optional[int] = Field(
        default=None,
        ge=1,
        le=3650,
        description="Days until key expires (max 10 years)",
    )


class ApiKeyResponse(BaseModel):
    """Schema for API key data returned in responses.

    Note: The full key is only returned at creation time.
    """

    id: str
    workspace_id: str
    name: str
    key_prefix: str
    last_4: str
    scopes: dict[str, Any]
    is_active: bool
    last_used_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ApiKeyCreatedResponse(BaseModel):
    """Schema returned when an API key is first created - includes the raw key."""

    api_key: ApiKeyResponse
    raw_key: str = Field(
        ...,
        description="The full API key. Store it securely - it will not be shown again.",
    )