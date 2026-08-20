"""Nexora - Inventory Movement (库存操作流水) model.

记录每个商品的库存"何进何出"轨迹：补货/销售/退货/手动调整/清仓等，
为库存审计与 AI 预测提供数据基础。
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, ForeignKey, Index, Integer, String, Text

from app.database import Base


class InventoryMovement(Base):
    __tablename__ = "inventory_movements"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(String(36), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)

    # 变动量：正数=入库（补货/退货/调增），负数=出库（销售/调整减少）
    change = Column(Integer, nullable=False)
    # 变动后库存
    stock_after = Column(Integer, nullable=False)
    # 类型：restock(补货) | sale(销售) | return(退货) | adjustment(手动调整) | clearance(清仓) | sync(同步)
    movement_type = Column(String(20), nullable=False, index=True)
    reason = Column(String(200), nullable=True)
    note = Column(Text, nullable=True)
    created_by = Column(String(36), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)

    __table_args__ = (
        Index("ix_inventory_product_time", "product_id", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<InventoryMovement({self.product_id}, {self.change:+d}, {self.movement_type})>"
