"""Nexora - Review Model."""

import uuid
import json
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Review(Base):
    """Product review scoped to a workspace."""

    __tablename__ = "reviews"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    product_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    customer_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    rating: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Rating from 1 to 5 stars",
    )
    content: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        default=None,
    )
    image_urls: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="JSON array of image URLs",
    )
    reply: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="Seller reply",
    )
    replied_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    is_approved: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        comment="Review moderation",
    )
    is_verified: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        comment="Verified purchase",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    @property
    def image_urls_list(self) -> list[str]:
        """Parse image_urls JSON string into a list."""
        if not self.image_urls:
            return []
        try:
            return json.loads(self.image_urls)
        except (json.JSONDecodeError, TypeError):
            return []

    @image_urls_list.setter
    def image_urls_list(self, urls: list[str]) -> None:
        """Set image_urls from a list of URLs."""
        self.image_urls = json.dumps(urls) if urls else None

    def __repr__(self) -> str:
        return (
            f"<Review(id={self.id!r}, product_id={self.product_id!r}, "
            f"rating={self.rating!r}, customer_name={self.customer_name!r})>"
        )
