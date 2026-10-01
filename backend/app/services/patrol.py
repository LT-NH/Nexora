"""AI 自动巡检：每天定时为每个工作空间做轻量经营体检并写入通知。

用真实数据（订单/商品）做规则判断，发现异常（退款率超标 / 库存告急 / 压货）
时写入 notifications 表，让「问题主动找你」。

## 口径

统一在 app/services/metrics.py：近 30 天窗口、只算有效订单（排除取消/退款单）、
退款率分母用有效订单。此前这里把**全部历史订单**和**全部退款记录**拉进内存，
既没有时间过滤（注释写「近 30 天」但代码里没有这个条件），分母还含取消单 ——
与体检卡上的同一个指标对不上。

## 性能

此前是「单 session 串行跑 200 个空间」，每个空间全表加载订单/退款/商品，
合计 600~1000 次串行查询，且与线上请求共用事件循环（09:00 整点）。
现在改为：SQL 侧 count 聚合 + 时间窗 + 按空间并发（信号量限流）。
"""

import asyncio
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models.notification import Notification
from app.models.product import Product
from app.models.workspace import Workspace, WorkspaceMember
from app.services import metrics
from app.utils.logging import get_logger

logger = get_logger(__name__)

# 并发上限：巡检是「顺手看一眼」，不该与线上请求抢连接池与事件循环
PATROL_CONCURRENCY = 5


async def run_ai_patrol() -> None:
    """巡检所有工作空间：发现异常 → 写入通知。"""
    logger.info("AI patrol started")
    try:
        async with async_session_factory() as db:
            ws_ids = (await db.execute(select(Workspace.id).limit(200))).scalars().all()

        sem = asyncio.Semaphore(PATROL_CONCURRENCY)

        async def _run_one(workspace_id: str) -> None:
            async with sem:
                try:
                    # 每个任务独立 session —— 并发共享一个 AsyncSession 是明确禁忌
                    # （原实现串行共用一个 session，改成并发必须拆开）
                    async with async_session_factory() as task_db:
                        await _patrol_workspace(task_db, workspace_id)
                except Exception as e:  # noqa: BLE001
                    logger.warning("patrol ws %s failed: %s", workspace_id, str(e)[:120])

        await asyncio.gather(*(_run_one(wid) for wid in ws_ids))
    except Exception as e:  # noqa: BLE001
        logger.error("AI patrol crashed: %s", str(e)[:200])


async def _patrol_workspace(db: AsyncSession, workspace_id: str) -> None:
    """单个工作空间的巡检（近 30 天窗口，口径见 app/services/metrics.py）。"""
    alerts: list[str] = []

    # 1. 退款率（近 30 天）：SQL 聚合，不把订单明细拉进内存
    counts = await metrics.order_counts(db, workspace_id, days=30)
    if counts["valid_orders"] >= 5:
        rate = metrics.refund_rate(counts["refunded_orders"], counts["valid_orders"])
        if rate >= 8:
            alerts.append(f"每 100 单退了 {rate:.0f} 单，偏高，建议查一下售后")

    # 2. 库存告急 / 压货：只取需要的三列（原来整行 ORM 实例化）
    rows = (
        await db.execute(
            select(Product.name, Product.stock, Product.low_stock_threshold).where(
                Product.workspace_id == workspace_id
            )
        )
    ).all()
    low = [r for r in rows if (r.stock or 0) <= (r.low_stock_threshold or 10)]
    if low:
        alerts.append(f"{len(low)} 款商品快没货了（{low[0].name} 等）")
    over = [r for r in rows if (r.stock or 0) > 120]
    if over:
        alerts.append(f"{len(over)} 款商品压着卖不动（库存超 120 件），可以考虑降价清一批")

    if not alerts:
        return

    # 写入通知（去重：同一天同标题只写一次）
    today = datetime.utcnow().date()
    title = f"每日巡检：发现 {len(alerts)} 项要留意"
    exists = (
        await db.execute(
            select(func.count(Notification.id)).where(
                Notification.workspace_id == workspace_id,
                Notification.title == title,
                # 只查今天的通知（created_at >= 当天 00:00:00）
                Notification.created_at >= datetime(today.year, today.month, today.day),
            )
        )
    ).scalar_one()
    if exists:
        return

    # 写给工作空间所有成员（复用 admin_ops 的通知投递模式）
    member_ids = (
        await db.execute(
            select(WorkspaceMember.user_id).where(WorkspaceMember.workspace_id == workspace_id)
        )
    ).scalars().all()
    if not member_ids:
        return
    for uid in member_ids:
        db.add(Notification(
            workspace_id=workspace_id,
            user_id=uid,
            notification_type="ai_patrol",
            title=title,
            message="；".join(alerts),
            is_read=False,
            created_at=datetime.utcnow(),
        ))
    await db.commit()
    logger.info("patrol ws %s: %s (%d 个成员)", workspace_id, title, len(member_ids))
