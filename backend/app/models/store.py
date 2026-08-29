"""Nexora - Store Model."""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class StorePlatform(str, enum.Enum):
    """Supported e-commerce platforms."""

    TAOBAO = "taobao"
    JD = "jd"
    PDD = "pdd"
    DOUYIN = "douyin"
    SHOPIFY = "shopify"
    AMAZON = "amazon"
    SANDBOX = "sandbox"
    OTHER = "other"


class StoreStatus(str, enum.Enum):
    """Store connection status."""

    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    ERROR = "error"


class Store(Base):
    """External e-commerce platform store connection."""

    __tablename__ = "stores"

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
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    platform: Mapped[StorePlatform] = mapped_column(
        Enum(StorePlatform),
        nullable=False,
    )
    store_url: Mapped[str | None] = mapped_column(
        String(512),
        nullable=True,
        default=None,
    )
    api_key: Mapped[str | None] = mapped_column(
        String(512),
        nullable=True,
        default=None,
    )
    api_secret: Mapped[str | None] = mapped_column(
        String(512),
        nullable=True,
        default=None,
    )
    access_token: Mapped[str | None] = mapped_column(
        String(2048),
        nullable=True,
        default=None,
    )
    status: Mapped[StoreStatus] = mapped_column(
        Enum(StoreStatus),
        default=StoreStatus.DISCONNECTED,
        nullable=False,
    )
    last_sync_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )
    # ── 自动同步（调度器每 5 分钟扫描到期店铺） ──
    auto_sync_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )
    sync_interval_minutes: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=60,
    )
    # ── 最近一次同步结果（可观测性） ──
    last_sync_status: Mapped[str | None] = mapped_column(
        String(16),
        nullable=True,
        default=None,
    )
    last_sync_errors: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        default=None,
    )
    # ── 增量同步游标（Shopify updated_at_min） ──
    last_incremental_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<Store(id={self.id!r}, name={self.name!r}, "
            f"platform={self.platform!r}, status={self.status!r})>"
        )
