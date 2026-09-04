"""Nexora - Agent Experience Model.

电商 Agent 经验库：沉淀「建议 → 执行 → 回访结果」的可复用知识资产。
独立于 ai_insights（洞察流水），只收录走完闭环且有结果的案例，
供后续 AI 生成建议时检索参考——系统越用越聪明，形成差异化数据资产。
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AgentExperience(Base):
    """One closed-loop experience: an executed suggestion + its real outcome."""

    __tablename__ = "agent_experiences"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    workspace_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # 溯源：来自哪条 AI 洞察
    insight_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("ai_insights.id", ondelete="SET NULL"), nullable=True
    )
    insight_type: Mapped[str] = mapped_column(String(50), nullable=False)
    action_type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    # 上下文快照（执行时指标 + action params），供未来相似场景比对
    context: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 主指标前后对比：>0 且 outcome=improved 表示该动作确实改善经营
    result_before: Mapped[float | None] = mapped_column(Float, nullable=True)
    result_after: Mapped[float | None] = mapped_column(Float, nullable=True)
    outcome: Mapped[str] = mapped_column(  # improved | not_improved | uncertain
        String(20), nullable=False, default="uncertain"
    )
    # 可复用教训（AI 提炼或规则模板）
    lesson: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 执行到回访的间隔天数
    delta_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    feedback_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    def __repr__(self) -> str:
        return f"<AgentExperience(id={self.id!r}, {self.insight_type}/{self.action_type}, {self.outcome})>"
