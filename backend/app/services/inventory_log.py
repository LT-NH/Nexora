"""库存流水记录工具：任何库存变动点调用 record_movement()。"""
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory_movement import InventoryMovement


async def record_movement(
    db: AsyncSession,
    workspace_id: str,
    product_id: str,
    change: int,
    stock_after: int,
    movement_type: str,
    reason: str | None = None,
    note: str | None = None,
    created_by: str | None = None,
) -> None:
    db.add(InventoryMovement(
        workspace_id=workspace_id,
        product_id=product_id,
        change=change,
        stock_after=stock_after,
        movement_type=movement_type,
        reason=reason,
        note=note,
        created_by=created_by,
    ))
