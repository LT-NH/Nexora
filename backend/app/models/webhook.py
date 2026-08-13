"""Nexora - Outbound Webhook Model."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.sqlite import CHAR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Webhook(Base):
    """Outbound webhook configuration for a workspace.

    Stores URL, subscribed events, optional HMAC secret, and
    last-triggered timestamp.
    """

    __tablename__ = "webhooks"

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
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    url: Mapped[str] = mapped_column(
        String(1024),
        nullable=False,
    )
    events: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="[]",
        comment="JSON array of event strings, e.g. [\"order.created\",\"order.updated\"]",
    )
    secret: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        comment="HMAC signing secret for webhook verification",
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
    last_triggered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship(
        "Workspace",
        backref="webhooks",
    )

    def __repr__(self) -> str:
        return (
            f"<Webhook(id={self.id!r}, name={self.name!r}, "
            f"url={self.url!r})>"
        )
