"""Nexora - 经营健康引擎 (Operational Health Engine).

核心卖点：从"照镜子"（展示数据）升级为"当医生"（体检 + 归因 + 处方）。

GET /workspaces/{slug}/health 返回：
  score:      0-100 加权健康分
  level:      green / yellow / red
  summary:    一句话总结
  dimensions: 5 大维度（现金流 / 库存 / 客户 / 渠道 / 增长）各带分数 + 红黄绿 + 归因
  actions:    今日行动清单（明确处方 + 预估影响），按严重度排序
"""

from datetime import datetime, timezone, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import _require_member
from app.database import get_db
from app.middleware.auth import AuthContext, get_principal
from app.models.customer import Customer
from app.models.order import Order, OrderItem, OrderStatus
from app.models.product import Product
from app.models.workspace import WorkspaceRole

router = APIRouter(prefix="/workspaces/{slug}/health", tags=["E-Commerce - Health"])

_EXCLUDED = (
    OrderStatus.CANCELLED,
    OrderStatus.REFUNDED,
)


def _level(score: float) -> str:
    return "green" if score >= 80 else ("yellow" if score >= 60 else "red")


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def _pct(a: float, b: float) -> float:
    return (a / b * 100.0) if b else 0.0


@router.get("", summary="经营健康评分 + 今日行动清单")
async def workspace_health(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Compute the workspace health score and today's action list (real data)."""
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    ws_id = workspace.id
    # SQLite 存 naive datetime —— 统一用 naive UTC 避免 aware/naive 比较错误
    now = datetime.utcnow()

    # ------------------------------------------------------------------
    # 1. 订单按天聚合（近 14 天）
    # ------------------------------------------------------------------
    since = now - timedelta(days=14)
    order_rows = (
        await db.execute(
            select(
                Order.id,
                Order.created_at,
                Order.total,
                Order.status,
                Order.platform,
            ).where(
                Order.workspace_id == ws_id,
                Order.created_at >= since,
            )
        )
    ).all()
    daily_rev: dict[str, float] = {}
    daily_ord: dict[str, int] = {}
    refund_cnt = 0
    refund_amt = 0.0
    recent_order_ids: list[str] = []
    total_orders = 0
    total_rev = 0.0
    platform_rev: dict[str, float] = {}
    platform_prev: dict[str, float] = {}
    for oid, created_at, total, status, platform in order_rows:
        if created_at is None:
            continue
        day = created_at.date().isoformat()
        is_excluded = status in _EXCLUDED
        total_orders += 1
        if status == OrderStatus.REFUNDED:
            refund_cnt += 1
            refund_amt += float(total or 0)
        if is_excluded:
            continue
        recent_order_ids.append(oid)
        amt = float(total or 0)
        daily_rev[day] = daily_rev.get(day, 0.0) + amt
        daily_ord[day] = daily_ord.get(day, 0) + 1
        total_rev += amt
        dt = created_at.date()
        key = platform or "manual"
        if dt >= (now - timedelta(days=7)).date():
            platform_rev[key] = platform_rev.get(key, 0.0) + amt
        else:
            platform_prev[key] = platform_prev.get(key, 0.0) + amt

    # 环比：近 7 天 vs 前 7 天
    last7 = sum(v for k, v in daily_rev.items() if k >= (now - timedelta(days=7)).date().isoformat())
    prev7 = sum(v for k, v in daily_rev.items() if k < (now - timedelta(days=7)).date().isoformat())
    growth = _pct(last7 - prev7, prev7) if prev7 > 0 else (100.0 if last7 > 0 else 0.0)
    refund_rate = _pct(refund_cnt, total_orders) if total_orders else 0.0

    # ------------------------------------------------------------------
    # 2. 商品库存
    # ------------------------------------------------------------------
    products = (
        await db.execute(
            select(Product).where(Product.workspace_id == ws_id)
        )
    ).scalars().all()
    # 日均销量按近 7 天订单量近似
    last7_orders = sum(daily_ord.values())
    daily_sales = last7_orders / 7.0 / max(len(products), 1) if last7_orders else 0.0
    overstock: list[dict] = []
    stockout_risk: list[dict] = []
    total_inventory_value = 0.0
    for p in products:
        stock = p.stock or 0
        price = float(p.price or 0)
        total_inventory_value += stock * price
        if stock <= 0:
            stockout_risk.append({"name": p.name, "product_id": p.id, "stock": 0, "days": 0})
        elif daily_sales > 0:
            days = stock / daily_sales
            if days > 120:
                overstock.append({"name": p.name, "product_id": p.id, "stock": stock, "days": round(days), "value": round(stock * price)})
            elif days < 14:
                stockout_risk.append({"name": p.name, "product_id": p.id, "stock": stock, "days": round(days)})

    # ------------------------------------------------------------------
    # 3. 客户
    # ------------------------------------------------------------------
    customers = (
        await db.execute(
            select(Customer).where(Customer.workspace_id == ws_id)
        )
    ).scalars().all()
    c_total = len(customers)
    c_repeat = sum(1 for c in customers if (c.total_orders or 0) >= 2)
    c_churn = sum(
        1
        for c in customers
        if c.last_order_at is not None and (now - c.last_order_at).days > 30
    )
    repeat_rate = _pct(c_repeat, c_total) if c_total else 0.0
    churn_rate = _pct(c_churn, c_total) if c_total else 0.0

    # ------------------------------------------------------------------
    # 3.5 利润健康（近 14 天毛利：收入 − 销售成本 − 退款损失）
    #     销售成本 = 订单行商品数量 × Product.cost_price（当前成本价近似）
    # ------------------------------------------------------------------
    cost_map: dict[str, float | None] = {p.id: (float(p.cost_price) if p.cost_price is not None else None) for p in products}
    sold_qty_by_product: dict[str, int] = {}
    item_revenue = 0.0
    item_cost = 0.0
    item_count = 0
    if recent_order_ids:
        order_items = (
            await db.execute(
                select(OrderItem.product_id, OrderItem.quantity, OrderItem.total_price)
                .where(OrderItem.order_id.in_(recent_order_ids))
            )
        ).all()
        for pid, qty, total_price in order_items:
            if pid is None or qty is None:
                continue
            item_revenue += float(total_price or 0)
            sold_qty_by_product[pid] = sold_qty_by_product.get(pid, 0) + qty
            item_count += 1
        # 有成本价的商品才计入毛利（无成本价的部分不计入成本基数，避免低估）
        for pid, qty in sold_qty_by_product.items():
            cost = cost_map.get(pid)
            if cost is not None:
                item_cost += cost * qty
    # 毛利率 = 1 − 可归属成本 / 可归属行收入（行收入为 0 时按整店收入兜底）
    if item_revenue > 0 and item_count > 0:
        attribution = item_revenue / max(total_rev, 1.0)
        effective_cost = item_cost * attribution  # 仅按归属比例摊派成本
        gross_margin = (total_rev - effective_cost - refund_amt) / total_rev * 100.0
        coverage = item_revenue / max(total_rev, 1.0)
    elif total_rev > 0:
        # 有收入但无订单行/成本价——利润无法可靠核算，给中性基线并明确标注
        gross_margin = 55.0
        coverage = 0.0
    else:
        gross_margin = 0.0
        coverage = 0.0
    refund_loss_rate = _pct(refund_amt, total_rev) if total_rev else 0.0

    # ------------------------------------------------------------------
    # 4. 维度评分（0-100，越高越健康）
    # ------------------------------------------------------------------
    # 现金流：基准 85，退款率每 1% 扣 4 分；营收环比上升加分
    cashflow = 85.0 - refund_rate * 4.0 + _clamp(growth * 0.3, -15, 15)
    cashflow = _clamp(cashflow)

    # 库存：滞销 SKU 占比 / 断货 SKU 占比
    n = max(len(products), 1)
    overstock_pct = _pct(len(overstock), n)
    stockout_pct = _pct(len(stockout_risk), n)
    inventory = _clamp(100.0 - overstock_pct * 1.5 - stockout_pct * 2.5)

    # 客户：复购率贡献 + 流失率惩罚
    customer = _clamp(_clamp(repeat_rate * 0.9 + 45.0) - churn_rate * 1.5)

    # 渠道：集中度（最大渠道占比）与各渠道环比最差
    ch_total = sum(platform_rev.values()) or 1.0
    max_share = max(platform_rev.values()) / ch_total if platform_rev else 0.0
    worst_growth = 0.0
    for key, cur in platform_rev.items():
        prev = platform_prev.get(key, 0.0)
        if prev > 0:
            worst_growth = min(worst_growth, (cur - prev) / prev * 100.0)
    channel = _clamp(92.0 - max(0.0, max_share - 0.6) * 100.0 - max(0.0, -worst_growth) * 0.5)

    # 增长：营收环比 + 订单量基础
    growth_score = _clamp(50.0 + growth * 1.0)

    # 利润健康：毛利率基准 45%（电商 SaaS 常见健康线），每 ±1% 调 2 分；
    # 退款损失每 1% 扣 1.5 分；行归因覆盖不足时轻微打折（数据口径警示）
    profit = _clamp(60.0 + (gross_margin - 45.0) * 2.0 - refund_loss_rate * 1.5 - (1.0 - coverage) * 8.0)

    dims = [
        {"key": "cashflow", "name": "现金流", "score": round(cashflow), "level": _level(cashflow),
         "reasons": _cashflow_reasons(refund_rate, growth)},
        {"key": "inventory", "name": "库存", "score": round(inventory), "level": _level(inventory),
         "reasons": _inventory_reasons(overstock, stockout_risk)},
        {"key": "customer", "name": "客户", "score": round(customer), "level": _level(customer),
         "reasons": _customer_reasons(repeat_rate, churn_rate, c_total, c_repeat, c_churn)},
        {"key": "channel", "name": "渠道", "score": round(channel), "level": _level(channel),
         "reasons": _channel_reasons(platform_rev, platform_prev)},
        {"key": "growth", "name": "增长", "score": round(growth_score), "level": _level(growth_score),
         "reasons": _growth_reasons(growth, last7, prev7)},
        {"key": "profit", "name": "利润", "score": round(profit), "level": _level(profit),
         "reasons": _profit_reasons(gross_margin, refund_loss_rate, item_count, coverage)},
    ]
    weights = {"cashflow": 0.2, "inventory": 0.2, "customer": 0.15, "channel": 0.1, "growth": 0.15, "profit": 0.2}
    score = round(sum(d["score"] * weights[d["key"]] for d in dims))
    level = _level(score)

    worst = min(dims, key=lambda d: d["score"])
    if score >= 80:
        summary = "经营状态良好，保持当前节奏，重点维护高复购客户。"
    elif score >= 60:
        summary = f"整体健康，但「{worst['name']}」维度正在拖累评分，建议优先处理今日行动。"
    else:
        summary = f"「{worst['name']}」健康度偏低，请立即处理今日行动清单，避免风险扩大。"

    actions = _build_actions(
        overstock=overstock,
        stockout_risk=stockout_risk,
        churn_count=c_churn,
        refund_rate=refund_rate,
        worst_growth=worst_growth,
        platform_rev=platform_rev,
        growth=growth,
        low_dim=worst,
    )

    anomalies = _scan_anomalies(daily_ord, daily_rev, order_rows, stockout_risk, platform_rev, platform_prev, now)

    return {
        "workspace_id": ws_id,
        "score": score,
        "level": level,
        "summary": summary,
        "dimensions": dims,
        "actions": actions,
        "anomalies": anomalies,
        "computed_at": now.isoformat(),
    }


# ----------------------------------------------------------------------
# 归因 & 动作生成
# ----------------------------------------------------------------------

def _cashflow_reasons(refund_rate: float, growth: float) -> list[str]:
    reasons = []
    if refund_rate >= 5:
        reasons.append(f"退款率 {refund_rate:.1f}% 偏高")
    if refund_rate < 3:
        reasons.append(f"退款率 {refund_rate:.1f}%，现金流稳健")
    if growth >= 10:
        reasons.append(f"近 7 天营收环比 +{growth:.0f}%")
    elif growth <= -15:
        reasons.append(f"近 7 天营收环比 {growth:.0f}%，回款承压")
    return reasons or ["近 14 天资金流入平稳"]


def _inventory_reasons(overstock: list[dict], stockout_risk: list[dict]) -> list[str]:
    reasons = []
    if overstock:
        reasons.append(f"{len(overstock)} 个 SKU 滞销（库存覆盖超 120 天）")
    if stockout_risk:
        reasons.append(f"{len(stockout_risk)} 个 SKU 有断货风险")
    if not overstock and not stockout_risk:
        reasons.append("库存结构合理，无滞销与断货风险")
    return reasons


def _customer_reasons(repeat_rate: float, churn_rate: float, total: int, repeat: int, churn: int) -> list[str]:
    reasons = []
    if total:
        reasons.append(f"复购率 {repeat_rate:.0f}%（{repeat}/{total} 人）")
    if churn_rate >= 10:
        reasons.append(f"{churn} 位客户超 30 天未复购")
    elif churn:
        reasons.append(f"{churn} 位客户需关注，流失率 {churn_rate:.0f}%")
    return reasons or ["客户基础待积累"]


def _channel_reasons(platform_rev: dict, platform_prev: dict) -> list[str]:
    reasons = []
    for key, cur in sorted(platform_rev.items(), key=lambda x: -x[1]):
        prev = platform_prev.get(key, 0.0)
        if prev > 0:
            g = (cur - prev) / prev * 100.0
            if g <= -20:
                reasons.append(f"{key} 渠道近 7 天营收 {g:.0f}%")
            elif g >= 10:
                reasons.append(f"{key} 渠道环比 +{g:.0f}%")
    return reasons or ["渠道分布暂无显著异常"]


def _growth_reasons(growth: float, last7: float, prev7: float) -> list[str]:
    if prev7 > 0:
        return [f"近 7 天营收 {last7:.0f} 元，环比 {growth:+.0f}%"]
    return [f"近 7 天营收 {last7:.0f} 元，需持续积累基线"]


def _profit_reasons(
    gross_margin: float, refund_loss_rate: float, item_count: int, coverage: float
) -> list[str]:
    """利润健康归因：毛利率 / 退款损耗 / 成本数据覆盖度。"""
    reasons = []
    if item_count:
        reasons.append(f"近 14 天毛利率 {gross_margin:.1f}%")
    else:
        reasons.append("近 14 天无订单行数据，利润按收入与退款估算")
    if refund_loss_rate >= 3:
        reasons.append(f"退款损耗占收入 {refund_loss_rate:.1f}%")
    if coverage < 0.8:
        reasons.append(f"成本归因覆盖 {coverage * 100:.0f}%（部分商品未设成本价）")
    if gross_margin >= 45 and refund_loss_rate < 3:
        reasons.append("毛利结构健康，定价有空间")
    elif gross_margin < 35:
        reasons.append("毛利率偏低，建议核查定价与成本价")
    return reasons or ["毛利结构未见明显异常"]


def _build_actions(
    overstock: list[dict],
    stockout_risk: list[dict],
    churn_count: int,
    refund_rate: float,
    worst_growth: float,
    platform_rev: dict,
    growth: float,
    low_dim: dict,
) -> list[dict]:
    actions: list[dict] = []

    for s in stockout_risk[:2]:
        actions.append({
            "type": "restock",
            "severity": 3,
            "product_id": s.get("product_id"),
            "title": f"补货：{s['name']}",
            "detail": f"库存仅剩 {s['stock']} 件，预计 {s['days']} 天后断货，建议尽快补货。",
            "impact": "避免断货造成的订单损失",
        })
    for o in overstock[:2]:
        actions.append({
            "type": "clearance",
            "severity": 2,
            "product_id": o.get("product_id"),
            "title": f"清仓：{o['name']}",
            "detail": f"库存覆盖 {o['days']} 天（滞销 ¥{o['value']:,}），建议降价 15% 促销清仓。",
            "impact": f"预计回笼约 ¥{round(o['value'] * 0.85):,}",
        })
    if churn_count:
        actions.append({
            "type": "retention",
            "severity": 2,
            "title": f"唤醒 {churn_count} 位流失客户",
            "detail": f"{churn_count} 位客户超 30 天未复购，建议发放满 99 减 20 唤醒券。",
            "impact": "预计挽回 20-30% 流失客户",
        })
    if refund_rate >= 5:
        actions.append({
            "type": "refund_check",
            "severity": 2,
            "title": "排查退款率",
            "detail": f"退款率 {refund_rate:.1f}% 偏高，建议检查最近退款订单集中的商品。",
            "impact": "每降低 1pp 退款率，约挽回 ¥{:.0f}".format(0),
        })
    if worst_growth <= -20:
        for key, cur in sorted(platform_rev.items(), key=lambda x: -x[1]):
            pass
        actions.append({
            "type": "channel_recovery",
            "severity": 1,
            "title": "修复渠道下滑",
            "detail": f"有渠道近 7 天营收环比 {worst_growth:.0f}%，建议核查流量与活动。",
            "impact": "稳住渠道基本盘",
        })
    if growth >= 15 and stockout_risk:
        pass  # 已包含补货动作，避免重复

    # 兜底：一切健康时给正向建议
    if not actions:
        actions.append({
            "type": "keep",
            "severity": 0,
            "title": "保持当前节奏",
            "detail": "经营各项指标健康，建议维持现有运营并持续关注客户复购。",
            "impact": "稳定增长",
        })

    actions.sort(key=lambda a: -a["severity"])
    return actions[:5]


# ----------------------------------------------------------------------
# 异常雷达 & 一键执行
# ----------------------------------------------------------------------

def _scan_anomalies(
    daily_ord: dict,
    daily_rev: dict,
    order_rows,
    stockout_risk: list,
    platform_rev: dict,
    platform_prev: dict,
    now,
) -> list[dict]:
    """自动扫描显著偏离，返回按严重度排序的异常列表。"""
    anomalies: list[dict] = []
    from datetime import date as _date

    today = now.date().isoformat()
    yesterday = (now - timedelta(days=1)).date().isoformat()

    # 1. 订单量突降/突增（昨日 vs 前 7 天日均）
    last7_days = [(now - timedelta(days=i)).date().isoformat() for i in range(1, 8)]
    prev_orders = [daily_ord.get(d, 0) for d in last7_days]
    base = sum(prev_orders) / 7.0
    y_orders = daily_ord.get(yesterday, 0)
    if base >= 5:
        diff = (y_orders - base) / base * 100.0
        if diff <= -30:
            anomalies.append({
                "severity": 3, "tag": "orders_drop",
                "title": f"昨日订单量 {y_orders} 单，环比 7 日均值下降 {abs(diff):.0f}%",
                "detail": "建议检查流量入口、活动是否结束或商品是否下架。",
            })
        elif diff >= 60:
            anomalies.append({
                "severity": 1, "tag": "orders_surge",
                "title": f"昨日订单量 {y_orders} 单，环比 7 日均值增长 {diff:.0f}%",
                "detail": "增长可能是活动或爆款带动，建议关注库存是否跟得上。",
            })

    # 2. 退款率异常（近 3 天 vs 近 30 天基线）
    refund_by_day: dict[str, int] = {}
    total_by_day: dict[str, int] = {}
    for _oid, created_at, total, status, _p in order_rows:
        if created_at is None:
            continue
        d = created_at.date().isoformat()
        total_by_day[d] = total_by_day.get(d, 0) + 1
        if status == OrderStatus.REFUNDED:
            refund_by_day[d] = refund_by_day.get(d, 0) + 1
    last3_days = [(now - timedelta(days=i)).date().isoformat() for i in range(0, 3)]
    r3 = sum(refund_by_day.get(d, 0) for d in last3_days)
    t3 = sum(total_by_day.get(d, 0) for d in last3_days)
    r30 = sum(refund_by_day.get(d, 0) for d in daily_ord if d >= (now - timedelta(days=30)).date().isoformat())
    t30 = sum(total_by_day.get(d, 0) for d in daily_ord if d >= (now - timedelta(days=30)).date().isoformat())
    rate3 = r3 / t3 * 100.0 if t3 else 0.0
    rate30 = r30 / t30 * 100.0 if t30 else 0.0
    if t3 >= 5 and rate3 - rate30 >= 5:
        anomalies.append({
            "severity": 2, "tag": "refund_spike",
            "title": f"近 3 天退款率 {rate3:.1f}%（基线 {rate30:.1f}%）",
            "detail": "退款率显著上升，建议检查最近发货商品质量与物流。",
        })

    # 3. 断货风险
    for so in stockout_risk[:2]:
        anomalies.append({
            "severity": 3, "tag": "stockout",
            "title": f"「{so['name']}」库存告急（剩 {so['stock']} 件）",
            "detail": f"预计 {so['days']} 天后断货，请尽快补货。",
        })

    # 4. 渠道单日大幅下滑（昨日 vs 前 7 天渠道日均）
    for key, cur in platform_rev.items():
        prev = platform_prev.get(key, 0.0)
        if prev <= 0:
            continue
        g = (cur - prev) / prev * 100.0
        if g <= -25:
            anomalies.append({
                "severity": 2, "tag": "channel_drop",
                "title": f"{key} 渠道近 7 天营收环比 {g:.0f}%",
                "detail": "该渠道流量或转化下滑，建议核查活动投放与商品排名。",
            })

    anomalies.sort(key=lambda a: -a["severity"])
    return anomalies[:5]


@router.post("/execute", summary="一键执行健康动作")
async def execute_action(
    slug: str,
    body: dict,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """执行今日行动中的一条动作，并重新计算健康分。

    body: {"type": "clearance"|"restock"|"retention", "product_id": "..."}
    - clearance: 商品降价 15%（真实更新 price）
    - restock:    跳转商品页（返回引导，不自动改库存）
    - retention:  创建"满 99 减 20"唤醒券（真实创建优惠券）
    """
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.ADMIN)
    action_type = str(body.get("type", ""))
    product_id = body.get("product_id")

    # 反向写入 Shopify：找到工作空间已连接的 Shopify 店铺
    from sqlalchemy import select as _select
    from app.models.store import Store
    from app.services.store import StoreService
    from app.services.platforms import PLATFORM_REGISTRY

    shopify_cfg: dict | None = None
    shopify_integration = None
    try:
        store_row = (
            await db.execute(
                _select(Store).where(
                    Store.workspace_id == workspace.id,
                    Store.platform == "shopify",
                ).order_by(Store.created_at.desc()).limit(1)
            )
        ).scalar_one_or_none()
        if store_row is not None:
            shopify_cfg = await StoreService.get_plain_credentials(store_row)
            cls = PLATFORM_REGISTRY.get("shopify")
            if cls is not None:
                shopify_integration = cls()
    except Exception:
        shopify_cfg = None

    message = ""
    shopify_written = False
    if action_type == "clearance" and product_id:
        product = await db.get(Product, product_id)
        if product is None or product.workspace_id != workspace.id:
            raise HTTPException(status_code=404, detail="商品不存在")
        old_price = float(product.price or 0)
        new_price = round(old_price * 0.85, 2)
        # 1) 先写真实 Shopify（成功才落地本地）
        shopify_pid = None
        if product.sku and product.sku.startswith("shopify-"):
            shopify_pid = product.sku[len("shopify-"):]
        if shopify_cfg and shopify_integration and shopify_pid:
            ok = await shopify_integration.update_product_price(
                shopify_cfg, shopify_pid, discount_pct=15.0
            )
            if ok:
                shopify_written = True
        if shopify_written or shopify_cfg is None:
            # 有 Shopify 连接时要求真实写入成功；无连接时仅本地（兼容纯本地环境）
            product.price = new_price
            product.compare_at_price = product.compare_at_price or old_price
            await db.commit()
            message = f"已降价 15%：¥{old_price:.2f} → ¥{new_price:.2f}"
            if shopify_written:
                message += "（已同步 Shopify 真实价格）"
        else:
            message = f"Shopify 写入失败，未执行降价（¥{old_price:.2f} 保持不变）"
    elif action_type == "retention":
        from datetime import datetime as _dt, timedelta as _td
        from app.models.coupon import Coupon
        import random as _r
        code = f"WAKE{_r.randint(1000, 9999)}"
        # 1) 先写真实 Shopify（price rule + discount code）
        if shopify_cfg and shopify_integration:
            ok = await shopify_integration.create_coupon_on_shopify(
                shopify_cfg,
                code=code,
                value=20.0,
                min_amount=99.0,
                max_uses=200,
                expires_in_days=14,
            )
            if ok:
                shopify_written = True
            else:
                message = "Shopify 优惠券创建失败，未在本地生成唤醒券"
        if shopify_written or shopify_cfg is None:
            coupon = Coupon(
                workspace_id=workspace.id,
                code=code,
                type="fixed",
                value=20.0,
                min_order_amount=99.0,
                max_uses=200,
                expires_at=_dt.utcnow() + _td(days=14),
            )
            db.add(coupon)
            await db.commit()
            message = f"已创建唤醒券 {code}（满 99 减 20，14 天有效）"
            if shopify_written:
                message += "（已同步 Shopify 真实优惠券）"
    else:
        message = "该动作已引导至对应页面处理。"

    # 重新计算健康分
    result = await workspace_health(slug, principal, db)
    return {
        "executed": True,
        "message": message,
        "health": result,
    }


@router.get("/weekly-review", summary="经营周会：一页结论")
async def weekly_review(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """每周一页经营结论：3 个关键变化 + 下周 3 件事 + 下周营收预测。"""
    from app.services.report import collect_weekly_report_data, _rule_based_ai_summary

    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    data = await collect_weekly_report_data(db, workspace.id)

    # ---- 关键变化（上周 vs 本周，最多 3 条）----
    changes: list[dict] = []
    mom = data.get("mom_change_pct")
    if mom is not None:
        changes.append({
            "tone": "good" if mom >= 0 else "bad",
            "title": f"周营收环比 {mom:+.1f}%",
            "detail": f"本周 ¥{data['total_revenue']:,.0f} vs 上周 ¥{data['prev_revenue']:,.0f}",
        })
    refund_rate = data.get("refund_rate_pct", 0.0)
    changes.append({
        "tone": "good" if refund_rate < 5 else "bad",
        "title": f"退款率 {refund_rate:.1f}%",
        "detail": f"本周退款 {data.get('refund_count', 0)} 笔（订单 {data['total_orders']} 笔）",
    })
    top = data.get("top_products", [])
    if top:
        t = top[0]
        changes.append({
            "tone": "good",
            "title": f"热销冠军：{t['name']}",
            "detail": f"贡献 ¥{t['revenue']:,.0f} · {t['quantity']} 件",
        })
    elif data.get("total_orders", 0) == 0:
        changes.append({"tone": "bad", "title": "本周暂无订单", "detail": "建议核查流量与商品上架状态"})

    # ---- 下周 3 件事（复用健康引擎今日行动，取前 3）----
    health = await workspace_health(slug, principal, db)
    next_actions = [
        {"type": a["type"], "title": a["title"], "impact": a.get("impact", "")}
        for a in health.get("actions", [])[:3]
    ]

    # ---- 下周营收预测（本周日均 × 7 × 增长半衰保守系数）----
    daily_avg = data["total_revenue"] / 7.0
    growth_factor = 1.0 + (max(mom or 0, -30) / 200.0)
    forecast = round(daily_avg * 7.0 * growth_factor)
    confidence = "high" if mom is not None and abs(mom) < 25 else "medium"

    # ---- 一句话总结（规则生成，稳定可靠；千问增强可选）----
    try:
        summary = _rule_based_ai_summary(data)
    except Exception:
        summary = (
            f"本周营收 ¥{data['total_revenue']:,.0f}（订单 {data['total_orders']} 笔），"
            f"下周预期 ¥{forecast:,.0f}。"
        )

    return {
        "workspace_id": workspace.id,
        "week_start": data["week_start"],
        "week_end": data["week_end"],
        "summary": summary,
        "changes": changes[:3],
        "next_actions": next_actions,
        "forecast": {
            "amount": forecast,
            "confidence": confidence,
            "base_revenue": data["total_revenue"],
        },
        "generated_at": datetime.utcnow().isoformat(),
    }
