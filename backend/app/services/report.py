"""Nexora - Weekly Report Service.

Generates and sends weekly business summary emails to workspace owners.
"""

import asyncio
import json
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app.config import settings
from app.database import async_session_factory
from app.models.order import Order, OrderItem, OrderStatus
from app.models.product import Product
from app.models.refund import Refund
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember, WorkspaceRole
from app.utils.logging import get_logger

logger = get_logger(__name__)


async def generate_weekly_report(workspace_id: str, workspace_name: str) -> str:
    """Generate HTML weekly report for a workspace."""
    async with async_session_factory() as db:
        week_ago = datetime.now(timezone.utc) - timedelta(days=7)

        # Total revenue and orders
        rev_result = await db.execute(
            select(func.sum(Order.total), func.count(Order.id)).where(
                Order.workspace_id == workspace_id,
                Order.created_at >= week_ago,
            )
        )
        total_revenue, total_orders = rev_result.one()
        total_revenue = float(total_revenue or 0)

        # Top products
        top_products_result = await db.execute(
            select(Product.name, func.count(OrderItem.id))
            .join(OrderItem, OrderItem.product_id == Product.id)
            .join(Order, Order.id == OrderItem.order_id)
            .where(
                Order.workspace_id == workspace_id,
                Order.created_at >= week_ago,
            )
            .group_by(Product.id)
            .order_by(func.count(OrderItem.id).desc())
            .limit(5)
        )
        top_products = top_products_result.all()

        # Low stock products
        low_stock_result = await db.execute(
            select(Product)
            .where(
                Product.workspace_id == workspace_id,
                Product.stock <= Product.low_stock_threshold,
            )
            .limit(5)
        )
        low_stock = low_stock_result.scalars().all()

        # Build HTML email
        top_items_html = "".join(
            f"<li>{name} — {cnt}件</li>" for name, cnt in top_products
        ) if top_products else "<li>暂无数据</li>"

        low_stock_html = "".join(
            f"<li>{p.name} — 仅剩{p.stock}件</li>" for p in low_stock
        ) if low_stock else "<li>库存充足</li>"

        html = f"""
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:#2560eb;">Nexora 周报 — {workspace_name}</h2>
          <p>{datetime.now(timezone.utc).strftime('%Y年%m月%d日')} | 过去7天汇总</p>

          <div style="background:#f8fafc;border-radius:12px;padding:16px;margin:16px 0;">
            <div style="display:flex;gap:24px;">
              <div><span style="font-size:12px;color:#64748b;">总营收</span><br><span style="font-size:20px;font-weight:bold;color:#2560eb;">¥{total_revenue:,.0f}</span></div>
              <div><span style="font-size:12px;color:#64748b;">订单数</span><br><span style="font-size:20px;font-weight:bold;color:#2560eb;">{total_orders}</span></div>
            </div>
          </div>

          <h3 style="color:#1e293b;">热销商品 Top 5</h3>
          <ol>{top_items_html}</ol>

          <h3 style="color:#ef4444;">库存预警</h3>
          <ul>{low_stock_html}</ul>

          <p style="margin-top:24px;"><a href="http://localhost:3000/dashboard" style="background:#2560eb;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">查看完整仪表盘</a></p>
        </div>
        """
        return html


async def send_weekly_report(workspace_id: str, workspace_name: str, owner_email: str) -> bool:
    """Generate and send weekly report email."""
    try:
        html = await generate_weekly_report(workspace_id, workspace_name)
        from app.services.email import send_email
        send_email(owner_email, f"周报 — {workspace_name}", html)
        logger.info("Weekly report sent to %s for workspace %s", owner_email, workspace_name)
        return True
    except Exception as e:
        logger.error("Failed to send weekly report: %s", str(e))
        return False


async def send_all_weekly_reports() -> None:
    """Send weekly reports to all workspace owners."""
    async with async_session_factory() as db:
        workspaces_result = await db.execute(select(Workspace))
        workspaces = workspaces_result.scalars().all()

        for ws in workspaces:
            owner_result = await db.execute(
                select(User)
                .join(WorkspaceMember, WorkspaceMember.user_id == User.id)
                .where(
                    WorkspaceMember.workspace_id == ws.id,
                    WorkspaceMember.role == WorkspaceRole.OWNER,
                )
                .limit(1)
            )
            owner = owner_result.scalar_one_or_none()
            if owner and owner.email:
                await send_weekly_report(ws.id, ws.name, owner.email)

    logger.info("All weekly reports processed.")


async def collect_weekly_report_data(db, workspace_id: str) -> dict:
    """Collect structured data for the AI weekly report.

    Computes current-week revenue/orders, previous-week revenue for a
    week-over-week comparison, top products by revenue, refund count/rate,
    and low-stock products.

    Args:
        db: Async database session.
        workspace_id: Target workspace.

    Returns:
        A JSON-serializable dict of weekly metrics.
    """
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    prev_week_ago = now - timedelta(days=14)
    valid_exclude = [OrderStatus.CANCELLED, OrderStatus.REFUNDED]

    # Current week revenue & order count
    rev_result = await db.execute(
        select(func.sum(Order.total), func.count(Order.id)).where(
            Order.workspace_id == workspace_id,
            Order.created_at >= week_ago,
            Order.status.notin_(valid_exclude),
        )
    )
    total_revenue, total_orders = rev_result.one()
    total_revenue = float(total_revenue or 0)

    # Previous week revenue (for MoM comparison)
    prev_result = await db.execute(
        select(func.sum(Order.total)).where(
            Order.workspace_id == workspace_id,
            Order.created_at >= prev_week_ago,
            Order.created_at < week_ago,
            Order.status.notin_(valid_exclude),
        )
    )
    prev_revenue = float(prev_result.scalar() or 0)

    # Top products by revenue
    top_result = await db.execute(
        select(Product.name, func.sum(OrderItem.total_price), func.sum(OrderItem.quantity))
        .join(OrderItem, OrderItem.product_id == Product.id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(
            Order.workspace_id == workspace_id,
            Order.created_at >= week_ago,
            Order.status.notin_(valid_exclude),
        )
        .group_by(Product.id, Product.name)
        .order_by(func.sum(OrderItem.total_price).desc())
        .limit(5)
    )
    top_products = [
        {"name": name, "revenue": float(rev or 0), "quantity": int(qty or 0)}
        for name, rev, qty in top_result.all()
    ]

    # Refunds created this week
    refund_count = int(
        await db.scalar(
            select(func.count(Refund.id)).where(
                Refund.workspace_id == workspace_id,
                Refund.created_at >= week_ago,
            )
        )
        or 0
    )
    refund_rate = round(refund_count / total_orders * 100, 1) if total_orders else 0.0

    # Low stock products
    low_stock_result = await db.execute(
        select(Product)
        .where(
            Product.workspace_id == workspace_id,
            Product.stock <= Product.low_stock_threshold,
        )
        .order_by(Product.stock.asc())
        .limit(10)
    )
    low_stock_products = [
        {"name": p.name, "stock": p.stock, "threshold": p.low_stock_threshold}
        for p in low_stock_result.scalars().all()
    ]

    mom_change = (
        round((total_revenue - prev_revenue) / prev_revenue * 100, 1)
        if prev_revenue
        else None
    )

    return {
        "week_start": week_ago.date().isoformat(),
        "week_end": now.date().isoformat(),
        "total_revenue": round(total_revenue, 2),
        "total_orders": total_orders,
        "prev_revenue": round(prev_revenue, 2),
        "mom_change_pct": mom_change,
        "top_products": top_products,
        "refund_count": refund_count,
        "refund_rate_pct": refund_rate,
        "low_stock_count": len(low_stock_products),
        "low_stock_products": low_stock_products,
    }


def _rule_based_ai_summary(report_data: dict) -> str:
    """Compose a deterministic Chinese summary: 3 highlights + 1 risk + 1 suggestion."""
    total_revenue = float(report_data.get("total_revenue", 0))
    total_orders = int(report_data.get("total_orders", 0))
    mom_change_pct = report_data.get("mom_change_pct")
    top_products = report_data.get("top_products", [])
    refund_rate_pct = report_data.get("refund_rate_pct", 0.0)
    low_stock_count = int(report_data.get("low_stock_count", 0))
    refund_count = int(report_data.get("refund_count", 0))

    top = top_products[0] if top_products else None
    mom_text = f"{mom_change_pct:+.1f}%" if mom_change_pct is not None else "暂无上周对比数据"

    # ── 3 highlights ──
    highlights = [
        f"本周营收 ¥{total_revenue:,.2f}，较上周{mom_text}，共 {total_orders} 笔有效订单。",
    ]
    if top:
        highlights.append(
            f"热销榜首「{top['name']}」贡献 ¥{top['revenue']:,.2f}，售出 {top['quantity']} 件。"
        )
    else:
        highlights.append("本周暂无销售数据，建议加强引流与推广。")
    highlights.append(f"本周发生退款 {refund_count} 笔，退款率 {refund_rate_pct}%。")

    # ── 1 risk ──
    if refund_rate_pct > 5:
        risk = f"退款率 {refund_rate_pct}% 偏高，需重点关注商品质量与售后体验。"
    elif low_stock_count > 0:
        risk = f"{low_stock_count} 个商品库存低于预警线，存在断货风险。"
    elif mom_change_pct is not None and mom_change_pct < 0:
        risk = "本周营收环比下滑，需警惕销售走弱趋势。"
    else:
        risk = "本周经营整体平稳，暂无明显风险。"

    # ── 1 suggestion ──
    if low_stock_count > 0:
        suggestion = f"尽快为 {low_stock_count} 个低库存商品安排补货，优先保障热销款不断货。"
    elif top:
        suggestion = f"围绕热销款「{top['name']}」策划组合促销，提升客单价与连带销售。"
    else:
        suggestion = "建议增加引流活动并优化商品详情页，拉动首单转化。"

    return (
        "【本周亮点】\n"
        + "\n".join(f"· {h}" for h in highlights)
        + "\n\n【风险提示】\n"
        + f"· {risk}"
        + "\n\n【运营建议】\n"
        + f"· {suggestion}"
    )


async def generate_ai_summary(db, workspace_id: str, report_data: dict) -> str:
    """Generate a natural-language weekly report summary in Chinese.

    Uses a rule-based template (3 highlights + 1 risk + 1 suggestion) by
    default. When ``settings.QWEN_API_KEY`` is configured, asks Qwen to
    rephrase the summary over the serialized ``report_data`` (truncated to
    ~2000 chars); any Qwen failure falls back to the rule-based text.

    Args:
        db: Async database session (kept for API consistency / future use).
        workspace_id: Target workspace.
        report_data: Dict from :func:`collect_weekly_report_data`.
    """
    rule_text = _rule_based_ai_summary(report_data)
    if not settings.QWEN_API_KEY:
        return rule_text

    try:
        from app.services.ai_agent import _call_qwen_generation  # noqa: PLC0415
        payload = json.dumps(report_data, ensure_ascii=False)[:2000]
        prompt = (
            "以下是系统采集到的本周经营数据（JSON）：\n"
            f"{payload}\n\n"
            "请生成一份简洁、自然的周报摘要，包含 3 个亮点、1 个风险提示和 1 条运营建议。"
        )
        ai_text = await _call_qwen_generation(
            "你是一位专业的电商运营分析助手，输出要简洁、准确、易读。",
            prompt,
            temperature=0.5,
        )
        if ai_text:
            return ai_text
    except Exception as e:  # noqa: BLE001 - deliberate fallback
        logger.warning("Qwen weekly summary failed, using rule-based: %s", e)

    return rule_text
