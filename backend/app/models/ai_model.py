"""Nexora - AI Model Registry Model.

阿里百炼的免费额度是**按模型分别计算**的，一个模型的额度用完后需要换到
另一个模型继续跑。本表是「运行时可切换的模型注册表」：

  - 内置目录（MODEL_CATALOG）在启动时幂等写入，作为初始数据
  - 超管可在管理台新增自定义模型（is_custom=True）
  - `is_active=True` 的那一行即为**当前全局调用的模型**（同一时刻唯一）
  - 记录额度状态（quota_status），在调用失败时自动更新，
    让管理台能直接看到「哪个模型额度已经耗尽，该换哪个」

设计取舍：模型名需要被**每次 AI 调用**读取，因此不在这里做热路径查询——
真正的运行时读取走 `app.services.model_registry` 的进程内缓存，本表只负责
持久化事实与跨重启一致性。
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AIModel(Base):
    """A switchable DashScope (百炼) model entry."""

    __tablename__ = "ai_models"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    # 传给 OpenAI 兼容接口的 model 字段，如 "qwen-plus"
    model_id: Mapped[str] = mapped_column(
        String(80),
        unique=True,
        index=True,
        nullable=False,
        comment="DashScope model name sent in the `model` field",
    )
    label: Mapped[str] = mapped_column(
        String(80),
        nullable=False,
        comment="Show name in the admin console",
    )
    note: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="Positioning / characteristics shown in the admin console",
    )
    family: Mapped[str] = mapped_column(
        String(20),
        default="commercial",
        nullable=False,
        comment="commercial | opensource | reasoning | vision | long | custom",
    )
    is_custom: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        comment="Added manually by a superadmin",
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        index=True,
        comment="The single globally-active model",
    )
    # ---- 额度状态：调用失败时自动写入，管理台据此提示「该换哪个」----
    quota_status: Mapped[str] = mapped_column(
        String(16),
        default="unknown",
        nullable=False,
        comment=(
            "unknown | ok | exhausted | throttled | denied | stream_only "
            "| unauthorized | not_found | error"
        ),
    )
    quota_message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="Raw upstream error message (truncated)",
    )
    quota_checked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Last successful call time",
    )
    # ---- 切换留痕 ----
    activated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="When it was last made the active model",
    )
    activated_by: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        comment="Operator email",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<AIModel(model_id={self.model_id!r}, active={self.is_active!r}, "
            f"quota={self.quota_status!r})>"
        )
