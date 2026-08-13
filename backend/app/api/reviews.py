"""Nexora - Reviews API Routes.

Thin routes that delegate to ReviewService.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, status, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import _require_member
from app.database import get_db
from app.middleware.auth import get_principal, AuthContext
from app.models.workspace import WorkspaceRole
from app.schemas.review import ReviewCreate, ReviewReply, ReviewResponse, ReviewStatsResponse
from app.services.review import ReviewService

router = APIRouter(prefix="/workspaces/{slug}")


@router.get(
    "/products/{product_id}/reviews",
    response_model=list[ReviewResponse],
    summary="List reviews for a product",
)
async def list_reviews(
    slug: str,
    product_id: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ReviewResponse]:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    return await ReviewService.list_reviews(db, workspace, product_id)


@router.post(
    "/products/{product_id}/reviews",
    response_model=ReviewResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a review for a product",
)
async def create_review(
    slug: str,
    product_id: str,
    data: ReviewCreate,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ReviewResponse:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)
    return await ReviewService.create_review(
        db, workspace, product_id, data, user_id=principal.user_id,
    )


@router.patch(
    "/reviews/{review_id}/reply",
    response_model=ReviewResponse,
    summary="Seller replies to a review",
)
async def reply_review(
    slug: str,
    review_id: str,
    data: ReviewReply,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ReviewResponse:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.ADMIN)
    return await ReviewService.reply_review(db, workspace, review_id, data)


@router.patch(
    "/reviews/{review_id}/toggle-approval",
    response_model=ReviewResponse,
    summary="Toggle review visibility",
)
async def toggle_approval(
    slug: str,
    review_id: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ReviewResponse:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.ADMIN)
    return await ReviewService.toggle_approval(db, workspace, review_id)


@router.post(
    "/reviews/{review_id}/image",
    response_model=ReviewResponse,
    summary="Upload review image",
)
async def upload_review_image(
    slug: str,
    review_id: str,
    file: Annotated[UploadFile, File(...)],
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ReviewResponse:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)
    return await ReviewService.upload_review_image(db, workspace, review_id, file)


@router.get(
    "/reviews/stats",
    response_model=ReviewStatsResponse,
    summary="Get workspace review statistics",
)
async def get_review_stats(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ReviewStatsResponse:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    return await ReviewService.get_review_stats(db, workspace)


@router.get(
    "/products/{product_id}/reviews/stats",
    response_model=ReviewStatsResponse,
    summary="Get product review statistics",
)
async def get_product_review_stats(
    slug: str,
    product_id: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ReviewStatsResponse:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    return await ReviewService.get_product_review_stats(db, workspace, product_id)
