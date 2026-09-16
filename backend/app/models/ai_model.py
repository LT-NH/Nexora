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

from sqlalchemy import Boolean, DateTime, Integer, String, Text
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
    supports_tools: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        comment=(
            "是否支持 function calling —— 巡店 Agent 依赖它。"
            "切到不支持工具的模型会让 Agent 报错，因此管理台要显式提示"
        ),
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
    # ---- 免费额度核算（官方没有查询剩余额度的 API，见下方说明）----
    #
    # 实测：百炼**没有**任何官方接口能查「剩余免费额度」（`/models/quota` 一律 404，
    # 控制台页面是分钟级异步更新）。所以这里用「记账」的方式给实时数字：
    #
    #     剩余 = quota_total - quota_used_base - tokens_used
    #
    #   - quota_total      该模型免费额度总量（官方文档：每个模型独立 100 万 tokens）
    #   - quota_used_base  校准时刻「本工具上线之前」的历史已用量（用户从控制台读入一次）
    #   - tokens_used      自校准之后本机累计的消耗（每次调用后落库，精确）
    #
    # 只做一次校准，之后就是实时的。校准前 quota_used_base=0，数字是**上限估算**，
    # 界面会明确标注，不做"假实时"。
    quota_total: Mapped[int] = mapped_column(
        Integer,
        default=1_000_000,
        nullable=False,
        comment="该模型的免费额度总量（默认 100 万，可改）",
    )
    quota_used_base: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="校准时刻的历史已用量（控制台读入），校准后本机只累加增量",
    )
    tokens_used: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="自校准之后本机累计消耗的 tokens（每次调用后落库）",
    )
    calls_used: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="自校准之后本机累计调用次数",
    )
    quota_calibrated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="上次校准时间；NULL 表示尚未校准（数字为上限估算）",
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
