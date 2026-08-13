"""Nexora - Feedback Service."""

from typing import List

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.feedback import Feedback
from app.models.workspace import Workspace
from app.schemas.feedback import FeedbackCreate, FeedbackResponse
from app.utils.logging import get_logger

logger = get_logger(__name__)


class FeedbackService:
    """Service for feedback-related business logic."""

    @staticmethod
    async def create_feedback(
        db: AsyncSession,
        workspace: Workspace,
        data: FeedbackCreate,
        user_id: str,
    ) -> FeedbackResponse:
        """Create a new feedback / NPS entry."""
        feedback = Feedback(
            workspace_id=workspace.id,
            user_id=user_id,
            type=data.type,
            nps_score=data.nps_score,
            content=data.content,
        )
        db.add(feedback)
        await db.flush()
        await db.refresh(feedback)

        logger.info(
            "Feedback created: type=%s nps=%d user=%s",
            feedback.type,
            feedback.nps_score or -1,
            user_id,
        )
        return FeedbackResponse.model_validate(feedback)

    @staticmethod
    async def list_feedbacks(
        db: AsyncSession,
        workspace: Workspace,
        feedback_type: str | None = None,
    ) -> List[FeedbackResponse]:
        """List feedbacks for a workspace, optionally filtered by type."""
        stmt = select(Feedback).where(
            Feedback.workspace_id == workspace.id,
        )
        if feedback_type:
            stmt = stmt.where(Feedback.type == feedback_type)
        stmt = stmt.order_by(Feedback.created_at.desc()).limit(200)

        result = await db.execute(stmt)
        feedbacks = result.scalars().all()
        return [FeedbackResponse.model_validate(f) for f in feedbacks]
