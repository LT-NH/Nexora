"""Nexora - Membership API Routes.

Provides endpoints for membership tier summary and per-customer membership
detail.
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import _require_member
from app.database import get_db
from app.middleware.auth import get_principal, AuthContext
from app.models.workspace import WorkspaceRole
from app.services.membership import MembershipService

router = APIRouter(prefix="/workspaces/{slug}")


# ===========================================================================
# Membership Endpoints
# ===========================================================================


@router.get(
    "/membership",
    summary="Get membership level distribution summary",
)
async def get_membership_summary(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Return membership level distribution for the workspace."""
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    return await MembershipService.get_membership_summary(db, workspace)


@router.get(
    "/customers/{customer_id}/membership",
    summary="Get customer membership detail",
)
async def get_customer_membership(
    slug: str,
    customer_id: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Return detailed membership info for a single customer."""
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    return await MembershipService.get_customer_membership(db, workspace, customer_id)
