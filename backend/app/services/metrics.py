"""统一统计口径（Single source of truth for business metrics）。

## 为什么需要它

同一个指标（营收 / 订单量 / 退款率 / 日均销量 / 流失客户）此前在 health、ai、
report、patrol、admin_ops 里各写一份实现，差异集中在三处：

  1. **哪些订单算数** —— 有的过滤 cancelled/refunded，有的完全不过滤
  2. **时间窗怎么切** —— 滚动 7×24h / UTC 自然日 / 自然周 三种混用
  3. **分母是谁** —— 退款率有的用全部订单（含取消），有的用有效订单

结果是「体检卡说退款率 8%，AI 助手说 6%」，两个数都自称来自真实数据。

本模块只做一件事：把这三件事定义一次，其它地方 import 使用。
**改这里 = 改全站口径**，不要再在业务文件里另写一份。

## 口径约定

* 有效订单：``status NOT IN (cancelled, refunded)``
  营收、订单量、日均销量、客户行为统计均以此为准。
* 退款率分母：**有效订单数** —— 退款单本身不是成交，不该进分母。
* 时间窗：滚动窗口 ``now - N 天``；``now`` 统一取 **naive UTC**
  （SQLite 存的就是 naive UTC，用 aware 时间比较会直接抛 TypeError）。
* 日粒度分桶：按 UTC 自然日（``created_at.date()``），与存储时区一致。

## 使用方式

    from app.services.metrics import EXCLUDED_STATUSES, since_days, order_counts

    counts = await order_counts(db, ws_id, days=30)
    # {"total_orders": 120, "refunded_orders": 9, "valid_orders": 111, "days": 30}

    stmt = select(...).where(Order.workspace_id == ws_id, valid_orders_where(Order))
"""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import case, func, select

from app.models.order import Order

# ⚠️ 唯一事实来源：有效订单的排除集合。
# 值与 OrderStatus 枚举保持一致；此处不 import OrderStatus 是为了让本模块零业务
# 依赖 —— 它会被 API 层、服务层、定时任务同时引用，避免任何循环导入风险。
EXCLUDED_STATUSES: tuple[str, ...] = ("cancelled", "refunded")

# 退款类订单（退款率分子）：partially_refunded 也算「退过款」
REFUND_STATUSES: tuple[str, ...] = ("refunded", "partially_refunded")


def utcnow() -> datetime:
    """统一「现在」：naive UTC。"""
    return datetime.utcnow()


def since_days(days: int, now: datetime | None = None) -> datetime:
    """滚动窗口起点：近 N 天（now - N 天）。"""
    return (now or utcnow()) - timedelta(days=days)


def valid_orders_where(model):
    """有效订单的 SQL 过滤条件（配合 select(...).where(...) 使用）。"""
    return model.status.notin_(EXCLUDED_STATUSES)


def refund_rate(refunded: int, valid_orders: int) -> float:
    """退款率（%）= 退款订单数 / 有效订单数。分母为 0 时返回 0。"""
    return (refunded / valid_orders * 100.0) if valid_orders else 0.0


async def order_counts(
    db,
    workspace_id: str,
    days: int,
    now: datetime | None = None,
) -> dict:
    """一次查询拿到窗口内的 全部订单数 / 退款订单数 / 有效订单数。

    同一页面上「订单量」「退款率」「日均销量」必须共用这一份计数 ——
    否则又会出现三个数字各自成立、互相打架的情况。
    """
    end = now or utcnow()
    start = end - timedelta(days=days)
    stmt = select(
        func.count(Order.id),
        func.sum(case((Order.status.in_(REFUND_STATUSES), 1), else_=0)),
        func.sum(case((Order.status.notin_(EXCLUDED_STATUSES), 1), else_=0)),
    ).where(
        Order.workspace_id == workspace_id,
        Order.created_at >= start,
    )
    total, refunded, valid = (await db.execute(stmt)).one()
    return {
        "total_orders": int(total or 0),
        "refunded_orders": int(refunded or 0),
        "valid_orders": int(valid or 0),
        "days": days,
    }


def daily_sales_per_product(valid_orders: int, days: int, product_count: int) -> float:
    """日均单量近似（每款商品每天大约几单），用于换算「库存还能撑几天」。

    必须传入**有效订单数**且与 ``days`` 同窗 —— 历史上这里踩过两个坑：
    · health 用 14 天累计去除以 7（销量被放大一倍 → 库存天数被低估一半）
    · ai 的订单数没有过滤取消/退款单（销量被高估）
    """
    if days <= 0 or product_count <= 0:
        return 0.0
    return valid_orders / days / product_count
