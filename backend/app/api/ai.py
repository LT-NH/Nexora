"""Nexora - AI Decision Loop API.

闭环四段：主动摘要 → 点击执行 → 回访验证（命中率）→ 前置预测。
"""
import json
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import _require_member
from app.database import get_db
from app.middleware.auth import AuthContext, get_principal
from app.models.ai_insight import AiInsight
from app.models.customer import Customer
from app.models.order import Order, OrderItem
from app.models.product import Product
from app.models.workspace import Workspace, WorkspaceRole

router = APIRouter(prefix="/workspaces/{slug}/ai", tags=["AI Decision Loop"])


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


async def _compute_indicators(db: AsyncSession, ws_id: str):
    """采集决策所需的真实业务指标（与健康引擎同源）。"""
    now = datetime.utcnow()
    products = (await db.execute(select(Product).where(Product.workspace_id == ws_id))).scalars().all()
    customers = (await db.execute(select(Customer).where(Customer.workspace_id == ws_id))).scalars().all()

    # 近 7 天订单数（近似日均销量）
    since7 = now - timedelta(days=7)
    orders7 = (
        await db.execute(
            select(func.count(Order.id)).where(
                Order.workspace_id == ws_id,
                Order.created_at >= since7,
            )
        )
    ).scalar_one()
    daily_sales = orders7 / 7.0 / max(len(products), 1) if orders7 else 0.0

    # 库存风险
    overstock: list[dict] = []
    stockout_risk: list[dict] = []
    for p in products:
        stock = p.stock or 0
        if stock <= 0:
            stockout_risk.append({"product_id": p.id, "name": p.name, "stock": 0, "days": 0, "price": float(p.price or 0)})
        elif daily_sales > 0:
            days = stock / daily_sales
            if days > 120:
                overstock.append({"product_id": p.id, "name": p.name, "stock": stock, "days": round(days), "price": float(p.price or 0)})
            elif days < 14:
                stockout_risk.append({"product_id": p.id, "name": p.name, "stock": stock, "days": round(days), "price": float(p.price or 0)})

    # 退款率（近 30 天）
    since30 = now - timedelta(days=30)
    total30 = (
        await db.execute(
            select(func.count(Order.id)).where(
                Order.workspace_id == ws_id,
                Order.created_at >= since30,
            )
        )
    ).scalar_one()
    refund30 = (
        await db.execute(
            select(func.count(Order.id)).where(
                Order.workspace_id == ws_id,
                Order.created_at >= since30,
                Order.status.in_(["refunded", "partially_refunded"]),
            )
        )
    ).scalar_one()
    refund_rate = refund30 / total30 * 100.0 if total30 else 0.0

    # 客户流失
    churn_risk: list[dict] = []
    for c in customers:
        if c.last_order_at is not None:
            days_since = (now - c.last_order_at.replace(tzinfo=None)).days
            if days_since > 30:
                churn_risk.append({
                    "customer_id": c.id, "name": c.name or c.email, "last_order_days": days_since,
                    "total_orders": c.total_orders or 0,
                })

    return {
        "products": products, "customers": customers,
        "daily_sales": daily_sales,
        "overstock": overstock, "stockout_risk": stockout_risk,
        "refund_rate": refund_rate,
        "churn_risk": churn_risk,
        "now": now,
    }


def _build_insights(ws_id: str, ind: dict) -> list[dict]:
    """基于指标生成今日 3 条决策结论（主动推送）。"""
    out: list[dict] = []
    now = ind["now"]

    # 1) 库存：断货风险最高的一条
    if ind["stockout_risk"]:
        s = sorted(ind["stockout_risk"], key=lambda x: x["days"])[0]
        out.append({
            "insight_type": "stockout",
            "title": f"{s['name']} 库存告急，建议补货",
            "detail": f"当前库存 {s['stock']} 件，按近 7 天日均销量仅够支撑 {s['days']} 天（<14 天预警线）。建议立即补货避免断货流失。",
            "confidence": round(_clamp(0.95 - min(s["days"], 14) * 0.03), 2),
            "action_type": "restock",
            "action_params": json.dumps({"product_id": s["product_id"]}),
        })

    # 2) 退款率偏高 → 排查
    if ind["refund_rate"] >= 8 and len(out) < 3:
        out.append({
            "insight_type": "refund",
            "title": "近 30 天退款率偏高，建议排查",
            "detail": f"近 30 天退款率 {ind['refund_rate']:.1f}%（阈值 8%）。建议优先核查高频退款订单的物流与品质问题。",
            "confidence": round(_clamp(0.9 - (ind["refund_rate"] - 8) * 0.02), 2),
            "action_type": "refund_check",
            "action_params": "{}",
        })

    # 3) 滞销 → 清仓/停售
    if ind["overstock"] and len(out) < 3:
        o = sorted(ind["overstock"], key=lambda x: -x["days"])[0]
        out.append({
            "insight_type": "overstock",
            "title": f"{o['name']} 库存积压，建议清仓或停售",
            "detail": f"库存 {o['stock']} 件，按当前动销需 {o['days']} 天售罄（>120 天积压线）。建议降价 15% 清仓或停售释放资金。",
            "confidence": round(_clamp(0.9 - min(o["days"] - 120, 100) * 0.002), 2),
            "action_type": "clearance",
            "action_params": json.dumps({"product_id": o["product_id"]}),
        })

    # 4) 客户流失预警
    if ind["churn_risk"] and len(out) < 3:
        c = sorted(ind["churn_risk"], key=lambda x: -x["last_order_days"])[0]
        out.append({
            "insight_type": "churn",
            "title": f"客户 {c['name']} 流失风险高，建议唤醒",
            "detail": f"{c['name']} 已 {c['last_order_days']} 天未下单（累计 {c['total_orders']} 单）。建议发送满减唤醒券挽回。",
            "confidence": round(_clamp(0.8 + min(c["last_order_days"], 60) * 0.003), 2),
            "action_type": "retention",
            "action_params": "{}",
        })

    return out[:3]


# ----------------------------------------------------------------------
# 1. 今日 AI 运营摘要（主动推送）
# ----------------------------------------------------------------------

@router.get("/daily-summary", summary="今日 AI 运营摘要（主动推送 3 条结论）")
async def daily_summary(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    ind = await _compute_indicators(db, workspace.id)

    # 去重：相同 insight_type 且 24h 内已有 pending/executed 的，不再重复生成
    cutoff = ind["now"] - timedelta(hours=24)
    existing = (
        await db.execute(
            select(AiInsight).where(
                AiInsight.workspace_id == workspace.id,
                AiInsight.suggested_at >= cutoff,
            )
        )
    ).scalars().all()
    existing_types = {e.insight_type for e in existing}

    new_insights: list[dict] = []
    for ins in _build_insights(workspace.id, ind):
        if ins["insight_type"] in existing_types:
            continue
        row = AiInsight(
            workspace_id=workspace.id,
            user_id=principal.user_id,
            insight_type=ins["insight_type"],
            title=ins["title"],
            detail=ins["detail"],
            confidence=ins["confidence"],
            action_type=ins["action_type"],
            action_params=ins["action_params"],
            status="pending",
            suggested_at=ind["now"],
            follow_up_days=30,
        )
        db.add(row)
        existing_types.add(ins["insight_type"])
        ins["id"] = row.id
        ins["status"] = "pending"
        new_insights.append(ins)
    await db.commit()

    # 今日可见：本次生成的 + 24h 内已有未完成的
    visible = new_insights + [
        {
            "id": e.id, "insight_type": e.insight_type, "title": e.title, "detail": e.detail,
            "confidence": e.confidence, "action_type": e.action_type, "action_params": e.action_params,
            "status": e.status,
        }
        for e in existing
        if e.status in ("pending", "executed")
    ]

    return {
        "date": ind["now"].date().isoformat(),
        "insights": visible[:3],
        "metrics": {
            "refund_rate": round(ind["refund_rate"], 1),
            "stockout_count": len(ind["stockout_risk"]),
            "overstock_count": len(ind["overstock"]),
            "churn_risk_count": len(ind["churn_risk"]),
        },
    }


# ----------------------------------------------------------------------
# 2. 洞察列表 / 执行 / 回访
# ----------------------------------------------------------------------

@router.get("/insights", summary="AI 决策建议列表")
async def list_insights(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status: str | None = None,
    limit: int = 20,
) -> dict:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    q = select(AiInsight).where(AiInsight.workspace_id == workspace.id)
    if status:
        q = q.where(AiInsight.status == status)
    rows = (await db.execute(q.order_by(AiInsight.suggested_at.desc()).limit(min(limit, 100)))).scalars().all()
    return {
        "items": [
            {
                "id": r.id, "insight_type": r.insight_type, "title": r.title, "detail": r.detail,
                "confidence": r.confidence, "action_type": r.action_type, "action_params": r.action_params,
                "status": r.status, "suggested_at": r.suggested_at.isoformat() if r.suggested_at else None,
                "executed_at": r.executed_at.isoformat() if r.executed_at else None,
                "feedback": r.feedback, "feedback_at": r.feedback_at.isoformat() if r.feedback_at else None,
            }
            for r in rows
        ],
        "total": len(rows),
    }


async def _execute_insight_action(
    db: AsyncSession, workspace: Workspace, ins: AiInsight, principal: AuthContext,
) -> str:
    """执行建议动作（真实写入本地 + Shopify 反向同步）。"""
    from app.models.coupon import Coupon
    from app.models.store import Store
    from app.services.store import StoreService
    from app.services.platforms import PLATFORM_REGISTRY

    params = json.loads(ins.action_params or "{}")
    action = ins.action_type

    # 找 Shopify 连接（用于反向写）
    shopify_cfg = None
    integ = None
    try:
        store_row = (
            await db.execute(
                select(Store).where(
                    Store.workspace_id == workspace.id, Store.platform == "shopify",
                ).order_by(Store.created_at.desc()).limit(1)
            )
        ).scalar_one_or_none()
        if store_row is not None:
            shopify_cfg = await StoreService.get_plain_credentials(store_row)
            cls = PLATFORM_REGISTRY.get("shopify")
            if cls is not None:
                integ = cls()
    except Exception:
        pass

    if action == "restock":
        pid = params.get("product_id")
        return "已引导至补货流程：请在商品管理确认该 SKU 补货数量。" if pid else "请选择需补货的商品。"

    if action == "clearance":
        pid = params.get("product_id")
        product = await db.get(Product, pid) if pid else None
        if product is None:
            return "商品不存在，无法执行清仓。"
        old_price = float(product.price or 0)
        new_price = round(old_price * 0.85, 2)
        written = False
        if shopify_cfg and integ and product.sku and product.sku.startswith("shopify-"):
            written = await integ.update_product_price(shopify_cfg, product.sku[8:], discount_pct=15.0)
        if written or shopify_cfg is None:
            product.price = new_price
            product.compare_at_price = product.compare_at_price or old_price
            await db.commit()
            return f"已清仓降价 15%：¥{old_price:.2f} → ¥{new_price:.2f}" + ("（已同步 Shopify 全部变体）" if written else "")
        return f"Shopify 写入失败，未执行降价（¥{old_price:.2f} 保持不变）"

    if action == "retention":
        import random
        from datetime import datetime as _dt, timedelta as _td
        code = f"WAKE{random.randint(1000, 9999)}"
        written = False
        if shopify_cfg and integ:
            written = await integ.create_coupon_on_shopify(shopify_cfg, code=code, value=20.0, min_amount=99.0, max_uses=200, expires_in_days=14)
        if written or shopify_cfg is None:
            db.add(Coupon(
                workspace_id=workspace.id, code=code, type="fixed", value=20.0,
                min_order_amount=99.0, max_uses=200, expires_at=_dt.utcnow() + _td(days=14),
            ))
            await db.commit()
            return f"已创建唤醒券 {code}（满 99 减 20，14 天有效）" + ("（已同步 Shopify 真实优惠券）" if written else "")
        return "Shopify 优惠券创建失败，未生成唤醒券"

    if action == "refund_check":
        return "已引导至退款售后页：请核查近 30 天高频退款订单。"

    return "该动作已引导至对应页面处理。"


@router.post("/insights/{insight_id}/execute", summary="执行一条 AI 建议")
async def execute_insight(
    slug: str,
    insight_id: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)
    ins = await db.get(AiInsight, insight_id)
    if ins is None or ins.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="建议不存在")

    message = await _execute_insight_action(db, workspace, ins, principal)
    ins.status = "executed"
    ins.executed_at = datetime.now(timezone.utc)
    await db.commit()
    return {"executed": True, "message": message, "insight_id": ins.id}


@router.post("/insights/{insight_id}/feedback", summary="回访：反馈建议是否命中")
async def feedback_insight(
    slug: str,
    insight_id: str,
    body: dict,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)
    ins = await db.get(AiInsight, insight_id)
    if ins is None or ins.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="建议不存在")

    improved = bool(body.get("improved"))
    ins.feedback = "improved" if improved else "not_improved"
    ins.feedback_note = body.get("note")
    ins.feedback_at = datetime.now(timezone.utc)
    await db.commit()
    return {"saved": True, "feedback": ins.feedback}


# ----------------------------------------------------------------------
# 3. 建议命中率（闭环指标）
# ----------------------------------------------------------------------

@router.get("/insights/stats", summary="建议命中率统计")
async def insight_stats(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    rows = (
        await db.execute(
            select(AiInsight).where(
                AiInsight.workspace_id == workspace.id,
                AiInsight.feedback.isnot(None),
            )
        )
    ).scalars().all()
    improved = sum(1 for r in rows if r.feedback == "improved")
    total = len(rows)
    return {
        "total_executed": (
            await db.execute(
                select(func.count(AiInsight.id)).where(
                    AiInsight.workspace_id == workspace.id,
                    AiInsight.status == "executed",
                )
            )
        ).scalar_one(),
        "feedback_total": total,
        "improved": improved,
        "hit_rate": round(improved / total * 100, 1) if total else None,
    }


# ----------------------------------------------------------------------
# 4. 异常预测前置（未来将发生，而非已发生）
# ----------------------------------------------------------------------

@router.get("/predictions", summary="前置预测：未来 7 天缺货 / 客户流失风险")
async def predictions(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    ind = await _compute_indicators(db, workspace.id)
    now = ind["now"]

    # 未来 7 天缺货预测
    stockout_predictions = []
    for p in ind["products"]:
        stock = p.stock or 0
        if ind["daily_sales"] > 0 and stock > 0:
            days_left = stock / ind["daily_sales"]
            if days_left < 7:
                stockout_predictions.append({
                    "product_id": p.id, "name": p.name,
                    "stock": stock, "days_left": round(days_left, 1),
                    "eta": (now + timedelta(days=days_left)).date().isoformat(),
                    "severity": "high" if days_left < 3 else "medium",
                })
        elif stock == 0:
            stockout_predictions.append({
                "product_id": p.id, "name": p.name,
                "stock": 0, "days_left": 0,
                "eta": now.date().isoformat(),
                "severity": "critical",
            })
    stockout_predictions = sorted(stockout_predictions, key=lambda x: x["days_left"])[:6]

    # 客户流失风险（复购间隔拉长）
    churn_predictions = []
    for c in ind["customers"]:
        if c.last_order_at is not None and (c.total_orders or 0) >= 2:
            days = (now - c.last_order_at.replace(tzinfo=None)).days
            if days >= 21:
                churn_predictions.append({
                    "customer_id": c.id, "name": c.name or c.email,
                    "days_since_last": days, "total_orders": c.total_orders or 0,
                    "risk": "high" if days >= 45 else "medium",
                })
    churn_predictions = sorted(churn_predictions, key=lambda x: -x["days_since_last"])[:6]

    return {
        "generated_at": now.isoformat(),
        "stockout_7d": stockout_predictions,
        "churn_risk": churn_predictions,
        "note": "基于近 7 天订单动销与复购间隔预测，仅供参考",
    }


# ----------------------------------------------------------------------
# 5. 自然语言 BI 问答（千问）
# ----------------------------------------------------------------------

def _detect_intent(q: str) -> str:
    q = q.lower()
    if any(k in q for k in ["营收", "销售", "收入", "revenue", "sales", "卖了多少", "赚"]):
        return "revenue"
    if any(k in q for k in ["排行", "top", "最好", "冠军", "卖得好", "最畅销"]):
        return "ranking"
    if any(k in q for k in ["库存", "缺货", "补货", "stock", "积压"]):
        return "stock"
    if any(k in q for k in ["退款", "退货", "refund", "售后"]):
        return "refund"
    if any(k in q for k in ["客户", "流失", "复购", "customer", "churn"]):
        return "customer"
    return "general"


async def _collect_biz_snapshot(db: AsyncSession, ws_id: str) -> str:
    """生成店铺数据快照文本（供千问回答使用）。"""
    now = datetime.utcnow()
    since7 = now - timedelta(days=7)
    since30 = now - timedelta(days=30)

    rev7 = (
        await db.execute(
            select(func.coalesce(func.sum(Order.total), 0)).where(
                Order.workspace_id == ws_id, Order.created_at >= since7,
            )
        )
    ).scalar_one() or 0
    rev30 = (
        await db.execute(
            select(func.coalesce(func.sum(Order.total), 0)).where(
                Order.workspace_id == ws_id, Order.created_at >= since30,
            )
        )
    ).scalar_one() or 0
    orders30 = (
        await db.execute(
            select(func.count(Order.id)).where(
                Order.workspace_id == ws_id, Order.created_at >= since30,
            )
        )
    ).scalar_one()
    # 商品 Top5（按订单明细聚合）
    top_rows = (
        await db.execute(
            select(OrderItem.product_name, func.sum(OrderItem.total_price))
            .join(Order, Order.id == OrderItem.order_id)
            .where(Order.workspace_id == ws_id)
            .group_by(OrderItem.product_name)
            .order_by(func.sum(OrderItem.total_price).desc())
            .limit(5)
        )
    ).all()
    top_text = "、".join(f"{r[0]}(¥{float(r[1] or 0):,.0f})" for r in top_rows) or "暂无"
    # 库存风险
    products = (await db.execute(select(Product).where(Product.workspace_id == ws_id))).scalars().all()
    low_stock = [p.name for p in products if (p.stock or 0) <= 5][:5]
    low_text = "、".join(low_stock) or "无"
    # 退款率
    refund30 = (
        await db.execute(
            select(func.count(Order.id)).where(
                Order.workspace_id == ws_id,
                Order.created_at >= since30,
                Order.status.in_(["refunded", "partially_refunded"]),
            )
        )
    ).scalar_one()
    refund_rate = round(refund30 / orders30 * 100, 1) if orders30 else 0.0

    return (
        f"店铺数据快照（真实数据）：近 7 天营收 ¥{float(rev7):,.0f}；"
        f"近 30 天营收 ¥{float(rev30):,.0f}、订单 {orders30} 笔、退款率 {refund_rate}%。"
        f"畅销商品 Top5：{top_text}。低库存商品：{low_text}。"
    )


@router.post("/chat", summary="自然语言 BI 问答（千问）")
async def ai_chat(
    slug: str,
    body: dict,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    from app.services.ai import _qwen_chat
    from app.models.order import OrderItem

    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    question = str(body.get("question") or body.get("message") or "")
    history = body.get("history") or []
    if not question:
        raise HTTPException(status_code=400, detail="问题不能为空")

    snapshot = await _collect_biz_snapshot(db, workspace.id)
    intent = _detect_intent(question)

    messages = [
        {
            "role": "system",
            "content": (
                "你是电商经营分析助手，基于店铺真实数据回答，简洁专业，中文回复。"
                "先给出结论，再给 1-2 条可执行建议。"
            ),
        },
        *history[-6:],
        {"role": "user", "content": f"{snapshot}\n\n问题：{question}"},
    ]

    answer_text = ""
    suggestion = ""
    chart_type: str | None = None
    try:
        raw = await _qwen_chat(messages)
        answer_text = raw
        suggestion = ""
    except Exception as exc:
        answer_text = (
            f"抱歉，AI 暂时不可用（{str(exc)[:80]}）。\n"
            f"基于数据快照：{snapshot}"
        )

    # 图表类型映射（前端展示）
    if intent == "ranking":
        chart_type = "bar"
    elif intent in ("revenue", "customer"):
        chart_type = "line"
    elif intent in ("stock", "refund"):
        chart_type = "list"

    data: list = []
    try:
        from app.models.order import OrderItem as _OI
        if intent == "ranking":
            rows = (
                await db.execute(
                    select(_OI.product_name, func.sum(_OI.total_price))
                    .join(Order, Order.id == _OI.order_id)
                    .where(Order.workspace_id == workspace.id)
                    .group_by(_OI.product_name)
                    .order_by(func.sum(_OI.total_price).desc())
                    .limit(8)
                )
            ).all()
            data = [{"商品": r[0] or "未知", "销售额": float(r[1] or 0)} for r in rows]
    except Exception:
        pass

    return {
        "intent": intent,
        "answer_text": answer_text,
        "data": data,
        "chart_type": chart_type,
        "suggestion": suggestion,
    }


@router.get("/weekly-summary", summary="AI 周报摘要")
async def ai_weekly_summary(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    snapshot = await _collect_biz_snapshot(db, workspace.id)
    return {
        "summary": snapshot,
        "report_data": {"source": "real_data", "generated_at": datetime.utcnow().isoformat()},
    }


@router.get("/pricing", summary="AI 定价建议")
async def ai_pricing(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    products = (
        await db.execute(
            select(Product).where(Product.workspace_id == workspace.id).order_by(Product.stock.asc()).limit(6)
        )
    ).scalars().all()
    items = []
    for p in products:
        price = float(p.price or 0)
        if (p.stock or 0) > 120:
            suggestion = "库存积压，建议降价 10-15% 清仓"
        elif (p.stock or 0) <= 5:
            suggestion = "库存偏低，维持现价并尽快补货"
        elif price <= 0:
            suggestion = "建议按成本价上浮 30-50% 定价"
        else:
            suggestion = "价格健康，可小幅提价 5% 测试"
        items.append({
            "product_id": p.id,
            "name": p.name,
            "current_price": price,
            "suggestion": suggestion,
            "reason": f"当前库存 {p.stock or 0} 件",
        })
    return {"items": items}


# ----------------------------------------------------------------------
# 6. 流式聊天（SSE，右下角悬浮 AI 助手）
# ----------------------------------------------------------------------

@router.post("/chat/stream", summary="流式聊天（SSE，悬浮 AI 助手）")
async def ai_chat_stream(
    slug: str,
    body: dict,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    from starlette.responses import StreamingResponse
    from app.services.ai import _qwen_chat

    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    prompt = str(body.get("prompt") or body.get("question") or "")
    history = body.get("messages") or body.get("history") or []
    if not prompt:
        raise HTTPException(status_code=400, detail="问题不能为空")

    snapshot = await _collect_biz_snapshot(db, workspace.id)
    messages = [
        {
            "role": "system",
            "content": (
                "你是电商经营分析助手，基于店铺真实数据回答，简洁专业，中文回复。"
                "先给结论，再给 1-2 条可执行建议。回答控制在 150 字内。"
            ),
        },
        *history[-6:],
        {"role": "user", "content": f"{snapshot}\n\n问题：{prompt}"},
    ]

    async def event_stream():
        try:
            full = await _qwen_chat(messages)
        except Exception as exc:
            full = f"抱歉，AI 暂时不可用（{str(exc)[:60]}）。\n数据快照：{snapshot}"
        # 分块推送（前端逐块拼接，效果等同流式）
        chunk_size = 24
        for i in range(0, len(full), chunk_size):
            piece = full[i : i + chunk_size]
            yield f"data: {json.dumps({'content': piece}, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ----------------------------------------------------------------------
# 7. 销售 AI 分析（趋势判断 + AI 分析覆盖）
# ----------------------------------------------------------------------

@router.post("/analyze-sales", summary="销售 AI 分析：趋势 / 预测 / 覆盖订单数")
async def ai_analyze_sales(
    slug: str,
    body: dict,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    from app.services.ai import AIService

    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    period = str(body.get("period") or "30d")
    days_map = {"7d": 7, "30d": 30, "90d": 90}
    days = days_map.get(period, 30)
    since = datetime.utcnow() - timedelta(days=days)

    rows = (
        await db.execute(
            select(Order.total, Order.created_at)
            .where(Order.workspace_id == workspace.id, Order.created_at >= since)
        )
    ).all()

    # 喂给 analyze_sales_trend 所需字段（total_amount + created_at）
    orders_for_ai = [
        {"total_amount": float(r[0] or 0), "created_at": r[1].isoformat() if r[1] else None}
        for r in rows
    ]

    result = await AIService.analyze_sales_trend(orders_for_ai)
    # 前端 Enterprise 面板需要的字段：总参与订单数
    result["total_orders_analyzed"] = len(orders_for_ai)
    result["period"] = period
    return result
