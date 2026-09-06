"""Nexora - Health Snapshot Model.

经营健康快照：每次体检把六维评分持久化，支撑真实的历史趋势与
「本期 vs 上期」对比。健康引擎只负责诊断（score/dimensions/anomalies），
可执行处方由 AI 决策助手（ai_insights）消费诊断后生成——两引擎分工单向：
  体检(health_snapshots) → 诊断 → 处方(ai_insights) → 执行 → 经验(agent_experiences)
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class HealthSnapshot(Base):
    """One health check-up record: total score + six-dimension scores."""

    __tablename__ = "health_snapshots"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    workspace_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    score: Mapped[float] = mapped_column(Float, nullable=False)
    level: Mapped[str] = mapped_column(String(10), nullable=False)  # green/yellow/red
    # 六维明细 JSON：[{key, name, score, level, reasons}]
    dimensions: Mapped[str] = mapped_column(Text, nullable=False)
    # 异常雷达摘要 JSON（可选，便于历史回看）
    anomalies: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 本次总结是否由 AI 生成（区别于规则模板）
    ai_generated: Mapped[bool] = mapped_column(default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False, index=True
    )

    def __repr__(self) -> str:
        return f"<HealthSnapshot(ws={self.workspace_id!r}, score={self.score}, {self.created_at})>"
