"""Nexora - Subscription Order Model.

订阅购买订单（独立于电商 Payment 域）：记录一次「开通/升级套餐」的收款单，
支持微信 Native 扫码（凭据就绪走真实微信 v3，未配置时进入 sandbox 模式演示）。
支付成功后由 billing 服务激活对应工作空间的 Subscription。
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SubscriptionOrder(Base):
    """One checkout order for subscribing/upgrading a workspace plan."""

    __tablename__ = "subscription_orders"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    workspace_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(String(36), nullable=False)
    plan_slug: Mapped[str] = mapped_column(String(100), nullable=False)
    plan_name: Mapped[str] = mapped_column(String(255), nullable=False)
    period: Mapped[str] = mapped_column(String(10), nullable=False)  # month | year
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    method: Mapped[str] = mapped_column(String(30), nullable=False, default="wechat_native")
    # pending | paid | expired | failed
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    # 微信 Native 下单返回的 code_url（二维码内容）；sandbox 模式为 weixin://wxpay/sandbox-*
    code_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    out_trade_no: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    provider_trade_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sandbox: Mapped[bool] = mapped_column(nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    def __repr__(self) -> str:
        return f"<SubscriptionOrder(id={self.id!r}, {self.plan_slug}/{self.period}, {self.status})>"
