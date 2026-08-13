"""Nexora - Refunds API Routes.

Provides endpoints for creating, listing, and processing refund/after-sales
requests within a workspace.
"""

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import _require_member
from app.database import get_db
from app.middleware.auth import get_principal, AuthContext
from app.models.workspace import WorkspaceRole
from app.schemas.refund import RefundCreate, RefundResponse, RefundUpdate
from app.services.refund import RefundService
from app.utils.pagination import PaginatedResponse, PaginationParams

router = APIRouter(prefix="/workspaces/{slug}/refunds")


# ===========================================================================
# Refund CRUD
# ===========================================================================


@router.get(
    "",
    response_model=PaginatedResponse[RefundResponse],
    summary="List refunds (paginated)",
)
async def list_refunds(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
    pagination: Annotated[PaginationParams, Depends()],
    status: Optional[str] = Query(None, description="Filter by refund status"),
) -> PaginatedResponse[RefundResponse]:
    """List refund/after-sales requests with optional status filtering."""
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    items, total = await RefundService.list_refunds(
        db,
        workspace,
        status_filter=status,
        skip=pagination.offset,
        limit=pagination.limit,
    )
    return PaginatedResponse.create(items=items, total=total, params=pagination)


@router.post(
    "",
    response_model=RefundResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a refund request",
)
async def create_refund(
    slug: str,
    refund_data: RefundCreate,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RefundResponse:
    """Submit a new refund/after-sales request for an order."""
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)
    return await RefundService.create_refund(
        db, workspace, refund_data, user_id=principal.user_id,
    )


@router.get(
    "/stats",
    summary="Get refund statistics",
)
async def get_refund_stats(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Return refund statistics for the workspace."""
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    return await RefundService.get_refund_stats(db, workspace)


@router.get(
    "/{refund_id}",
    response_model=RefundResponse,
    summary="Get a refund by ID",
)
async def get_refund(
    slug: str,
    refund_id: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RefundResponse:
    """Retrieve a single refund/after-sales request."""
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    return await RefundService.get_refund(db, workspace, refund_id)


@router.patch(
    "/{refund_id}",
    response_model=RefundResponse,
    summary="Process a refund (approve/reject)",
)
async def process_refund(
    slug: str,
    refund_id: str,
    update_data: RefundUpdate,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RefundResponse:
    """Approve or reject a pending refund request. Requires admin/owner role."""
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.ADMIN)
    return await RefundService.process_refund(
        db, workspace, refund_id, update_data, user_id=principal.user_id,
    )
