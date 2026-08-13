"""Nexora - Feedback Model."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.sqlite import CHAR
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Feedback(Base):
    """User feedback / NPS survey scoped to a workspace."""

    __tablename__ = "feedbacks"

    id: Mapped[str] = mapped_column(
        CHAR(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        CHAR(36),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[str] = mapped_column(
        CHAR(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment='"nps" or "feedback"',
    )
    nps_score: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="0-10 for NPS surveys",
    )
    content: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="Free-form feedback text",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<Feedback(id={self.id!r}, type={self.type!r}, "
            f"nps_score={self.nps_score!r})>"
        )
