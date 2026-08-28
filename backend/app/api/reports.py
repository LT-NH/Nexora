import asyncio

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from app.api.deps import get_current_workspace, _require_member
from app.middleware.auth import AuthContext, get_principal
from app.database import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Annotated
from app.models.workspace import WorkspaceRole
from app.utils.logging import get_logger

router = APIRouter(prefix="/workspaces/{workspace_slug}/reports", tags=["reports"])
logger = get_logger(__name__)

async def generate_report(workspace_id: str, report_type: str):
    """Simulate async report generation."""
    await asyncio.sleep(3)  # simulated heavy work
    # In production: write to DB, send email, etc.
    logger.info("Report %s generated for workspace %s", report_type, workspace_id)

@router.post("/generate/{report_type}")
async def request_report(
    workspace_slug: str,
    report_type: str,
    background_tasks: BackgroundTasks,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, membership = await _require_member(workspace_slug, principal, db, WorkspaceRole.VIEWER)
    from app.services.permission import check_permission
    can_view = await check_permission(db, workspace.id, principal.user_id, "view_revenue", member=membership)
    if not can_view:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "无权限查看营收数据")
    background_tasks.add_task(generate_report, str(workspace.id), report_type)
    return {"message": f"Report {report_type} generation started", "workspace": workspace_slug}


# ----------------------------------------------------------------------
# 利润分析（毛利看板）——卖家最关心的"钱"
# ----------------------------------------------------------------------

@router.get("/profit-analysis", summary="利润分析：毛利/毛利率/TOP利润/低毛利预警/分类毛利")
async def profit_analysis(
    workspace_slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 10,
) -> dict:
    from app.models.order import Order, OrderItem
    from app.models.product import Product

    workspace, _ = await _require_member(workspace_slug, principal, db, WorkspaceRole.VIEWER)
    from sqlalchemy import select as _select

    # 1. 该工作区所有订单明细
    items = (
        await db.execute(
            _select(OrderItem)
            .join(Order, OrderItem.order_id == Order.id)
            .where(Order.workspace_id == workspace.id)
        )
    ).scalars().all()

    # 2. 商品成本表（product_id -> cost_price）
    products = (
        await db.execute(
            _select(Product).where(Product.workspace_id == workspace.id)
        )
    ).scalars().all()
    cost_map = {p.id: float(p.cost_price or 0) for p in products}

    revenue = 0.0
    cost_total = 0.0
    product_profit: dict[str, dict] = {}
    cat_profit: dict[str, dict] = {}
    warnings: list[dict] = []
    missing_cost_ids: set[str] = set()

    for it in items:
        qty = it.quantity or 1
        rev = float(it.total_price or (it.unit_price or 0) * qty)
        revenue += rev
        cost = cost_map.get(it.product_id or "", 0.0) * qty
        cost_total += cost
        pid = it.product_id or it.sku or it.product_name
        name = it.product_name or "未知商品"
        if pid not in product_profit:
            product_profit[pid] = {"name": name, "revenue": 0.0, "cost": 0.0, "qty": 0, "category": ""}
        product_profit[pid]["revenue"] += rev
        product_profit[pid]["cost"] += cost
        product_profit[pid]["qty"] += qty
        # 分类（从商品表取）
        if it.product_id and it.product_id in cost_map:
            cat = next((p.category or "未分类" for p in products if p.id == it.product_id), "未分类")
        else:
            cat = "未分类"
        if cat not in cat_profit:
            cat_profit[cat] = {"revenue": 0.0, "cost": 0.0}
        cat_profit[cat]["revenue"] += rev
        cat_profit[cat]["cost"] += cost

    profit = revenue - cost_total
    margin = (profit / revenue * 100) if revenue > 0 else 0.0

    # TOP 利润商品 + 预警
    top_products = []
    for pid, d in product_profit.items():
        p = d["profit"] = d["revenue"] - d["cost"]
        d["margin"] = (p / d["revenue"] * 100) if d["revenue"] > 0 else 0.0
        if cost_map.get(str(pid), 0) <= 0 and d["revenue"] > 0:
            missing_cost_ids.add(str(pid))
        if d["margin"] < 10 and d["revenue"] > 0:
            warnings.append({"name": d["name"], "margin": round(d["margin"], 1), "revenue": round(d["revenue"], 2)})
    top_products = sorted(product_profit.values(), key=lambda x: x["profit"], reverse=True)[:limit]

    return {
        "revenue": round(revenue, 2),
        "cost": round(cost_total, 2),
        "profit": round(profit, 2),
        "margin": round(margin, 1),
        "order_items_count": len(items),
        "top_products": [
            {"name": d["name"], "revenue": round(d["revenue"], 2), "cost": round(d["cost"], 2),
             "profit": round(d["profit"], 2), "margin": round(d["margin"], 1), "qty": d["qty"]}
            for d in top_products
        ],
        "categories": [
            {"name": k, "revenue": round(v["revenue"], 2), "cost": round(v["cost"], 2),
             "profit": round(v["revenue"] - v["cost"], 2),
             "margin": round((v["revenue"] - v["cost"]) / v["revenue"] * 100, 1) if v["revenue"] > 0 else 0}
            for k, v in cat_profit.items()
        ],
        "low_margin_warnings": sorted(warnings, key=lambda x: x["margin"])[:8],
        "missing_cost_products": len(missing_cost_ids),
        "note": f"成本来自商品 cost_price 字段；{len(missing_cost_ids)} 个商品未设置成本价（按 0 计）",
    }
