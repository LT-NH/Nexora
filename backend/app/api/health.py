"""Nexora - 经营健康引擎 (Operational Health Engine).

定位（v7 职责切分）：健康引擎 = 纯诊断层——体检、六维评分、归因、异常雷达、
历史趋势沉淀；**不开处方**。可执行处方由 AI 决策助手（/ai/daily-summary）
消费本引擎的诊断结果后生成，两引擎单向串联、零重复：

  体检(health_snapshots) → 诊断 → 处方(ai_insights) → 执行 → 经验(agent_experiences)

GET /workspaces/{slug}/health 返回：
  score:      0-100 加权健康分
  level:      green / yellow / red
  summary:    AI 经营总结（默认千问生成，失败回落规则模板）
  dimensions: 六维（现金流/库存/客户/渠道/增长/利润）分数 + 红黄绿 + 归因
  anomalies:  异常雷达（显著偏离事件）
  prev:       上一次体检快照（供前端雷达图叠影对比）

GET /workspaces/{slug}/health/history 返回持久化的体检趋势（真实历史，
刷新/重登不丢失）。
"""

import json
from datetime import datetime, timezone, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import _require_member
from app.database import get_db
from app.middleware.auth import AuthContext, get_principal
from app.models.customer import Customer
from app.models.health_snapshot import HealthSnapshot
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


@router.get("", summary="经营健康诊断：六维评分 + AI 总结（纯诊断，不含处方）")
async def workspace_health(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
    ai: int = Query(1, description="默认 1：千问基于六维画像生成 AI 经营总结（失败自动回落规则总结）；传 0 强制规则版"),
) -> dict:
    """Compute the workspace health diagnosis and persist a snapshot (real data)."""
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
        summary = f"整体健康，但「{worst['name']}」维度正在拖累评分，可前往 AI 决策助手查看对应处方。"
    else:
        summary = f"「{worst['name']}」健康度偏低，建议尽快在 AI 决策助手中执行处置处方，避免风险扩大。"

    anomalies = _scan_anomalies(daily_ord, daily_rev, order_rows, stockout_risk, platform_rev, platform_prev, now)

    # AI 经营总结（默认启用）：千问基于六维画像与异常雷达写个性化总结，失败回落规则 summary
    ai_generated = False
    if ai:
        _ai_text = await _ai_health_summary(score, dims, anomalies, summary)
        if _ai_text:
            summary = _ai_text
            ai_generated = True

    # ------------------------------------------------------------------
    # 5. 体检持久化（health_snapshots）+ 上期对比
    #    去重：距上次 <30 分钟且总分变化 <1 时不重复落库（避免刷新污染趋势）；
    #    分数变化 / 首次 AI 总结升级 则立即生成新快照，趋势真实可追溯。
    # ------------------------------------------------------------------
    prev_rows = (
        await db.execute(
            select(HealthSnapshot)
            .where(HealthSnapshot.workspace_id == ws_id)
            .order_by(HealthSnapshot.created_at.desc())
            .limit(2)
        )
    ).scalars().all()
    latest = prev_rows[0] if prev_rows else None
    should_save = (
        latest is None
        or (now - latest.created_at).total_seconds() > 1800
        or abs(latest.score - score) >= 1
        or (ai_generated and not latest.ai_generated)
    )
    if should_save:
        db.add(HealthSnapshot(
            workspace_id=ws_id,
            score=float(score),
            level=level,
            dimensions=json.dumps(dims, ensure_ascii=False),
            anomalies=json.dumps(anomalies, ensure_ascii=False) if anomalies else None,
            ai_generated=ai_generated,
        ))
        await db.commit()
        prev_snap = latest  # 本次成为最新，上一期即原最新
    else:
        prev_snap = prev_rows[1] if len(prev_rows) > 1 else None

    prev_block = None
    if prev_snap is not None:
        try:
            prev_dims = json.loads(prev_snap.dimensions)
        except Exception:
            prev_dims = []
        prev_block = {
            "score": prev_snap.score,
            "level": prev_snap.level,
            "dimensions": prev_dims,
            "computed_at": prev_snap.created_at.isoformat() if prev_snap.created_at else None,
        }

    return {
        "workspace_id": ws_id,
        "score": score,
        "level": level,
        "summary": summary,
        "dimensions": dims,
        "anomalies": anomalies,
        "ai_generated": ai_generated,
        "prev": prev_block,
        "computed_at": now.isoformat(),
    }


@router.get("/history", summary="体检历史趋势（持久化快照，刷新不丢）")
async def health_history(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(30, ge=1, le=200),
) -> dict:
    """最近 N 次体检快照（时间升序），支撑真实趋势图与本期 vs 上期对比。"""
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    rows = (
        await db.execute(
            select(HealthSnapshot)
            .where(HealthSnapshot.workspace_id == workspace.id)
            .order_by(HealthSnapshot.created_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    # 防御：created_at 可能混入异构格式（迁移/手工修复数据），归一后按时间排序
    def _ts(r: HealthSnapshot) -> str:
        ca = r.created_at
        s = ca.isoformat() if hasattr(ca, "isoformat") else str(ca or "")
        return s.replace("T", " ")

    items = []
    for r in sorted(rows, key=_ts):  # 升序：旧 → 新
        try:
            dims = json.loads(r.dimensions)
        except Exception:
            dims = []
        items.append({
            "id": r.id,
            "score": r.score,
            "level": r.level,
            "dimensions": dims,
            "ai_generated": bool(r.ai_generated),
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })
    return {"items": items, "total": len(items)}


async def _ai_health_summary(score: float, dims: list[dict], anomalies: list[dict], rule_summary: str) -> str | None:
    """千问生成个性化经营总结（基于六维画像 + 异常雷达）。失败返回 None 由调用方回落规则。"""
    import httpx as _httpx
    try:
        from app.services.ai import _get_qwen_config
        key, model, base_url = _get_qwen_config()
        if not key:
            return None
        payload = {
            "score": score,
            "dimensions": [
                {"name": d["name"], "score": d["score"], "level": d["level"], "reasons": d["reasons"]}
                for d in dims
            ],
            "anomalies": [
                {"title": a.get("title"), "detail": a.get("detail"), "severity": a.get("severity")}
                for a in (anomalies or [])
            ][:6],
            "rule_summary": rule_summary,
        }
        prompt = (
            "你是资深电商运营专家。下面是店铺『经营健康六维画像』与『异常雷达』（真实数据，score 0-100，"
            "level: green健康/yellow需关注/red需干预）。\n"
            + json.dumps(payload, ensure_ascii=False)
            + "\n请写一段 3~4 句的『今日经营总结』：①整体状态一句话（结合总分与最突出维度）；"
            "②指出最需要优先处理的 1~2 个薄弱维度，用数据说明为什么是短板；③给一条最优先的可执行行动建议。"
            "语气专业务实，不要空话套话，只输出总结正文，不要标题与 Markdown。"
        )
        async with _httpx.AsyncClient(timeout=30, trust_env=False) as _client:
            _resp = await _client.post(
                f"{base_url}/chat/completions",
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": "你是资深电商运营专家，全程使用中文，直接输出结果。"},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.5,
                    "max_tokens": 700,
                },
            )
        if _resp.status_code != 200:
            return None
        text = _resp.json()["choices"][0]["message"]["content"].strip()
        return text[:600] if text else None
    except Exception:
        return None


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


# ----------------------------------------------------------------------
# 异常雷达
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

    # ---- 下周 3 件事（取自 AI 决策助手待处理处方——职责切分后，处方唯一来源）----
    from app.models.ai_insight import AiInsight
    pending = (
        await db.execute(
            select(AiInsight)
            .where(
                AiInsight.workspace_id == workspace.id,
                AiInsight.status == "pending",
            )
            .order_by(AiInsight.suggested_at.desc())
            .limit(3)
        )
    ).scalars().all()
    next_actions = [
        {"type": p.action_type or "keep", "title": p.title, "impact": (p.detail or "")[:60]}
        for p in pending
    ]
    if not next_actions:
        next_actions = [{
            "type": "keep",
            "title": "保持当前节奏",
            "impact": "经营各项指标健康，持续关注复购与库存周转",
        }]

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
