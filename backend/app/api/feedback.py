"""Nexora - Feedback API Routes."""

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import _require_member
from app.database import get_db
from app.middleware.auth import get_principal, AuthContext
from app.models.workspace import WorkspaceRole
from app.schemas.feedback import FeedbackCreate, FeedbackResponse
from app.services.feedback import FeedbackService

router = APIRouter(prefix="/workspaces/{slug}")


@router.post(
    "/feedback",
    response_model=FeedbackResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit feedback or NPS score",
)
async def create_feedback(
    slug: str,
    data: FeedbackCreate,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FeedbackResponse:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    return await FeedbackService.create_feedback(
        db, workspace, data, user_id=principal.user_id,
    )


@router.get(
    "/feedback",
    response_model=list[FeedbackResponse],
    summary="List feedbacks",
)
async def list_feedbacks(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
    type: Annotated[Optional[str], Query(description="Filter by type: nps or feedback")] = None,
) -> list[FeedbackResponse]:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    return await FeedbackService.list_feedbacks(db, workspace, feedback_type=type)
