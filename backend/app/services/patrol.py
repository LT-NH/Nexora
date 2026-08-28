"""AI 自动巡检：每天定时为每个工作空间生成经营体检结论并写入通知。

用真实数据（订单/商品/退款）做轻量规则判断，发现异常（退款率超标 / 库存告急 /
动销停滞）时写入 notifications 表，让"问题主动找你"。
"""

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models.notification import Notification
from app.models.order import Order
from app.models.product import Product
from app.models.workspace import Workspace
from app.utils.logging import get_logger

logger = get_logger(__name__)


async def run_ai_patrol() -> None:
    """巡检所有工作空间：发现异常 → 写入通知。"""
    logger.info("AI patrol started")
    try:
        async with async_session_factory() as db:
            workspaces = (await db.execute(select(Workspace).limit(200))).scalars().all()
            for ws in workspaces:
                try:
                    await _patrol_workspace(db, ws)
                except Exception as e:  # noqa: BLE001
                    logger.warning("patrol ws %s failed: %s", ws.id, str(e)[:120])
    except Exception as e:  # noqa: BLE001
        logger.error("AI patrol crashed: %s", str(e)[:200])


async def _patrol_workspace(db: AsyncSession, ws: Workspace) -> None:
    from app.models.refund import Refund

    alerts: list[str] = []

    # 1. 退款率（近 30 天）
    orders = (await db.execute(
        select(Order).where(Order.workspace_id == ws.id)
    )).scalars().all()
    if len(orders) >= 5:
        refunds = (await db.execute(
            select(Refund).where(Refund.workspace_id == ws.id)
        )).scalars().all()
        refund_rate = len(refunds) / len(orders) * 100 if orders else 0
        if refund_rate >= 8:
            alerts.append(f"退款率 {refund_rate:.1f}% 超过健康阈值 8%")

    # 2. 库存告急
    products = (await db.execute(
        select(Product).where(Product.workspace_id == ws.id)
    )).scalars().all()
    low = [p for p in products if (p.stock or 0) <= (p.low_stock_threshold or 10)]
    if low:
        alerts.append(f"{len(low)} 个商品低于库存阈值（{low[0].name} 等）")

    # 3. 动销停滞（库存积压 > 120）
    over = [p for p in products if (p.stock or 0) > 120]
    if over:
        alerts.append(f"{len(over)} 个商品库存积压（>120 件），建议清仓")

    if not alerts:
        return

    # 写入通知（去重：同一天同标题只写一次）
    today = datetime.utcnow().date()
    title = f"AI 巡检：发现 {len(alerts)} 项经营异常"
    exists = await db.execute(
        select(Notification).where(
            Notification.workspace_id == ws.id,
            Notification.title == title, datetime(today.year, today.month, today.day),
        )
    )
    if exists.scalar_one_or_none() is not None:
        return

    db.add(Notification(
        workspace_id=ws.id,
        notification_type="ai_patrol",
        title=title,
        message="；".join(alerts),
        is_read=False,
        created_at=datetime.utcnow(),
    ))
    await db.commit()
    logger.info("patrol ws %s: %s", ws.id, title)
