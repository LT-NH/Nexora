"""Nexora - Workspace Schemas (Pydantic v2)."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class WorkspaceCreate(BaseModel):
    """Schema for creating a new workspace."""

    name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Workspace name",
    )
    slug: str = Field(
        ...,
        min_length=1,
        max_length=100,
        pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$",
        description="URL-friendly slug (lowercase, hyphens allowed)",
    )
    logo_url: Optional[str] = Field(None, max_length=512)


class WorkspaceUpdate(BaseModel):
    """Schema for updating an existing workspace."""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    logo_url: Optional[str] = Field(None, max_length=512)


class WorkspaceResponse(BaseModel):
    """Schema for workspace data returned in API responses."""

    id: str
    name: str
    slug: str
    logo_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MemberResponse(BaseModel):
    """Schema for workspace member data."""

    id: str
    user_id: str
    workspace_id: str
    role: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    invited_at: datetime
    joined_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class InviteMember(BaseModel):
    """Schema for inviting a user to a workspace."""

    email: str = Field(..., description="Email of the user to invite")
    role: str = Field(
        default="member",
        pattern=r"^(admin|member|viewer)$",
        description="Role: admin, member, or viewer",
    )


class ChangeRole(BaseModel):
    """Schema for changing a member's role."""

    role: str = Field(
        ...,
        pattern=r"^(admin|member|viewer)$",
        description="New role: admin, member, or viewer",
    )