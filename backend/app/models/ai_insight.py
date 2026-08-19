"""Nexora - AI Insight (decision loop) model.

把 AI 从"单点问答"升级为闭环：主动推送结论 → 点击执行 → 回访验证命中率。
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class AiInsightStatus(str):
    PENDING = "pending"      # 待处理
    EXECUTED = "executed"    # 已执行
    DISMISSED = "dismissed"  # 已忽略
    EXPIRED = "expired"      # 已过期


class AiInsight(Base):
    """一条 AI 决策建议（主动推送 / 可执行 / 可回访）。"""

    __tablename__ = "ai_insights"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)

    # 建议内容
    insight_type = Column(String(50), nullable=False, index=True)  # stockout | refund | churn | overstock | growth | restock
    title = Column(String(200), nullable=False)
    detail = Column(Text, nullable=True)
    confidence = Column(Float, default=0.8, nullable=False)  # 置信度 0-1

    # 可执行动作
    action_type = Column(String(50), nullable=True)  # restock | clearance | stop_sale | retention | refund_check
    action_params = Column(Text, nullable=True)      # JSON 字符串，如 {"product_id": "..."}

    # 生命周期
    status = Column(String(20), default=AiInsightStatus.PENDING, nullable=False, index=True)
    suggested_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    executed_at = Column(DateTime(timezone=True), nullable=True)

    # 回访验证（闭环）
    feedback = Column(String(20), nullable=True)      # improved | not_improved | no_feedback
    feedback_note = Column(Text, nullable=True)
    feedback_at = Column(DateTime(timezone=True), nullable=True)
    follow_up_days = Column(Integer, default=30, nullable=False)  # 建议回访间隔（天）

    # 结果指标（执行后自动采集）
    result_before = Column(Float, nullable=True)  # 执行前指标（如销量/库存天数）
    result_after = Column(Float, nullable=True)   # 回访时指标

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    workspace = relationship("Workspace", backref="ai_insights", lazy="selectin")

    def __repr__(self) -> str:
        return f"<AiInsight({self.insight_type}, {self.status}, {self.title[:30]})>"
