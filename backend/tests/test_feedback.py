"""Tests for the user feedback collection service.

Covers:
  - NPS feedback persists with score and workspace linkage
  - free-text feedback persists without a score
  - listing returns all feedback for a workspace
"""

import uuid

from sqlalchemy import select

from app.models.feedback import Feedback
from app.models.workspace import Workspace
from app.schemas.feedback import FeedbackCreate
from app.services.feedback import FeedbackService


async def _workspace(session_factory, workspace_id) -> Workspace:
    async with session_factory() as db:
        result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
        return result.scalar_one()


async def test_create_nps_feedback(workspace_id, session_factory):
    async with session_factory() as db:
        ws = await _workspace(session_factory, workspace_id)
        service = FeedbackService()
        result = await service.create_feedback(
            db=db,
            workspace=ws,
            data=FeedbackCreate(type="nps", nps_score=9, content="很好用"),
            user_id=str(uuid.uuid4()),
        )
        stored = await db.execute(select(Feedback).where(Feedback.id == result.id))
        fb = stored.scalar_one()
        assert fb.workspace_id == workspace_id
        assert fb.type == "nps"
        assert fb.nps_score == 9


async def test_create_text_feedback_without_score(workspace_id, session_factory):
    async with session_factory() as db:
        ws = await _workspace(session_factory, workspace_id)
        service = FeedbackService()
        result = await service.create_feedback(
            db=db,
            workspace=ws,
            data=FeedbackCreate(type="feedback", content="希望能支持微信支付"),
            user_id=str(uuid.uuid4()),
        )
        stored = await db.execute(select(Feedback).where(Feedback.id == result.id))
        fb = stored.scalar_one()
        assert fb.type == "feedback"
        assert fb.nps_score is None
        assert fb.content == "希望能支持微信支付"


async def test_list_feedbacks(workspace_id, session_factory):
    async with session_factory() as db:
        ws = await _workspace(session_factory, workspace_id)
        service = FeedbackService()
        for i in range(3):
            await service.create_feedback(
                db=db,
                workspace=ws,
                data=FeedbackCreate(type="nps", nps_score=8 + i),
                user_id=str(uuid.uuid4()),
            )
        items = await service.list_feedbacks(db, ws)
        assert len(items) == 3
