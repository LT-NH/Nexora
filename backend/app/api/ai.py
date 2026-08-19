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
from app.models.order import Order
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
