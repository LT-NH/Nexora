"""Nexora 自主巡店 Agent (Store Sentinel).

与"对话式指挥"(用户发指令→Agent 执行)不同，本模块是**自主型经营 Agent**：
每天/随时自行"上班"——主动感知店铺实时状态 → 让千问基于真实数据自主决策 →
按**风险策略表**(services/autonomy.py)分级处理：
  · 低风险(refund_check/restock)  → 只读引导，直接产出
  · 中风险(create_coupon/clearance) → 在日限额内【自主执行】并留审计
  · 高风险(price_adjust)           → 永远挂起请店主确认
→ 每次巡店沉淀 AgentTask 审计 + 结论通知 + 经验，执行后自动回访判定命中/未命中。

工作方式不是"人指挥它"，而是"它当班巡店，能自己办的就办了，办不了的呈给你，
每次判断和结果都记进经验库"。权限判断以策略表为准，绝不采信模型自报的 risk 字段。
"""

import json
from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import _require_member
from app.database import get_db
from app.middleware.auth import AuthContext, get_principal
from app.models.agent_task import AgentTask
from app.models.workspace import Workspace, WorkspaceRole
from app.services.autonomy import (
    MAX_AUTO_ACTIONS_PER_RUN,
    auto_exec_budget,
    count_auto_executed_today,
    describe_policy_table,
    get_policy,
    split_plan_by_risk,
)
from app.utils.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/workspaces/{slug}/ai/agent", tags=["AI - Store Sentinel Agent"])

MAX_PLAN = 3

# Agent 可决策的动作集（与后端执行能力一一对应）
VALID_ACTIONS = {"restock", "refund_check", "price_adjust", "create_coupon", "clearance", "keep"}


async def _recent_experiences_text(db: AsyncSession, ws_id: str) -> str:
    """经验库最近闭环案例文本（让 Agent 参考真实历史效果）。"""
    try:
        from app.models.agent_experience import AgentExperience
        rows = (
            await db.execute(
                select(AgentExperience).where(AgentExperience.workspace_id == ws_id)
                .order_by(AgentExperience.feedback_at.desc().nulls_last())
                .limit(4)
            )
        ).scalars().all()
    except Exception:
        return ""
    if not rows:
        return ""
    parts = []
    for r in rows:
        fb = "命中改善" if r.outcome == "improved" else ("未命中" if r.outcome == "not_improved" else "待观察")
        metric = ""
        if r.result_before is not None and r.result_after is not None:
            metric = f"，主指标 {r.result_before}→{r.result_after}"
        parts.append(f"「{r.title}」[{r.action_type}] 反馈={fb}{metric}")
    return "\n- " + "\n- ".join(parts)


async def _risk_products_text(db: AsyncSession, ws_id: str) -> str:
    """风险商品清单（含真实 product_id），帮助 Agent 精准定位调价/补货对象。"""
    from app.models.product import Product
    products = (await db.execute(select(Product).where(Product.workspace_id == ws_id))).scalars().all()
    low = [p for p in products if (p.stock or 0) <= (p.low_stock_threshold or 10)]
    over = [p for p in products if (p.stock or 0) > 120]
    lines = []
    for tag, arr in (("缺货/低库存", sorted(low, key=lambda p: p.stock or 0)[:6]),
                     ("滞销积压", sorted(over, key=lambda p: -(p.stock or 0))[:6])):
        for p in arr:
            lines.append(f"- [{tag}] id={p.id} 名称={p.name} 库存={p.stock} 售价={p.price} 成本={p.cost_price}")
    return "\n".join(lines)


async def _qwen_plan(
    snapshot: str, exp_text: str, last_conclusion: str | None, products_text: str,
) -> str | None:
    """千问自主制定今日巡店决策计划（返回原始 JSON 文本，失败 None）。"""
    from app.api.ai import _qwen_enhance  # 复用真实千问调用（30s 超时，失败返回 None）

    prompt = (
        "你是 Nexora 的『自主巡店经营 Agent』，今天你独立当班。下面是系统采集的店铺真实经营快照。\n"
        "你的任务：像一位每天到店巡查的运营主管一样，自主判断今天最值得处理的经营问题，并制定巡店计划。\n\n"
        "【硬性要求】\n"
        "1. 结论与每条计划都必须【基于快照与风险清单中的真实数据】撰写——引用真实商品名、退款率、库存等数字；\n"
        "2. 需要指定商品时，product_id 必须使用风险清单里的真实 id（不要用商品名代替）；\n"
        "3. 不要复述本提示的任何模板文字，直接给出你对今天店铺的真实判断；\n"
        "4. 只输出一个 JSON 对象，不要任何其他文字。\n\n"
        "【JSON 结构】\n"
        "对象含两个键：\n"
        " - conclusion: 字符串，今日巡店结论（≤80 字，总结整体状态 + 最优先事项）\n"
        " - plan: 数组，0~3 条巡店动作，按优先级排序；每条动作是对象：\n"
        "     action_type: 字符串，只能是 price_adjust | create_coupon | clearance | restock | refund_check | keep\n"
        "     params: 对象（price_adjust 需 product_id+target_price；create_coupon 需 value+min_amount；"
        "clearance 需 product_id；restock 需 product_id；refund_check 留空）\n"
        "     reason: 字符串，≤60 字，引用快照数字说明依据\n"
        "\n"
        "【你可以自主执行的动作（无需店主确认，请积极使用）】\n"
        " - refund_check：定位高退款商品，产出核查清单（只读）\n"
        " - restock：为缺货商品生成补货建议（只读）\n"
        " - create_coupon：面向流失风险客户发放满减券（真实生效，可撤销，每日限 2 张）\n"
        " - clearance：对滞销积压商品降价 15% 清仓（真实改价，可调回，每日限 3 件）\n"
        "【你必须交还给店主确认的动作】\n"
        " - price_adjust：直接调整售价（影响营收，永远需人工确认）\n"
        "所以：如果问题可以用 clearance / create_coupon 解决，优先用它们——你能自己办掉。\n"
        "如果店铺没有值得干预的问题，plan 给空数组 []，conclusion 如实说明整体健康。\n\n"
        "【店铺真实快照】\n" + snapshot[:2600]
        + (("\n\n【风险商品清单（真实 id）】\n" + products_text) if products_text else "")
        + (("\n\n【经验库：同类动作历史效果（参考）】" + exp_text) if exp_text else "")
        + (f"\n\n【上次巡店结论】{last_conclusion}" if last_conclusion else "")
    )
    return await _qwen_enhance(prompt)


def _parse_plan(raw: str | None) -> tuple[str, list[dict]]:
    """解析千问计划 JSON；解析失败给保守空计划（不产生任何动作）。"""
    if not raw:
        return "巡店完成：AI 未返回有效计划（可能服务不可用），本次未产生动作。", []
    from app.services.ai import _extract_json
    data = _extract_json(raw)
    if not isinstance(data, dict):
        return "巡店完成：AI 计划格式异常，本次未产生动作。", []
    conclusion = str(data.get("conclusion") or "今日暂无需紧急干预。")[:200]
    plans = data.get("plan") or []
    plan = []
    for p in plans[:MAX_PLAN]:
        if not isinstance(p, dict):
            continue
        action = str(p.get("action_type") or "keep").lower()
        if action not in VALID_ACTIONS:
            action = "keep"
        params = p.get("params") if isinstance(p.get("params"), dict) else {}
        plan.append({
            "action_type": action,
            "params": params,
            "reason": str(p.get("reason") or "")[:120],
            "risk": "high" if str(p.get("risk")).lower() == "high" else "low",
        })
    return conclusion, plan




async def _ws_plan_tier(db: AsyncSession, ws_id: str) -> str:
    """当前订阅档位（free/pro/enterprise）；取生效中最高档（见 billing.get_ws_plan_tier）。"""
    try:
        from app.api.billing import get_ws_plan_tier
        return await get_ws_plan_tier(db, ws_id)
    except Exception:
        return "free"

async def _is_uuid(s: str) -> bool:
    return len(s) == 36 and s[8] == "-" and s[13] == "-"


async def _to_tool_args(action_type: str, params: dict) -> tuple[str, dict] | None:
    """把 Agent 计划动作映射到可执行工具 (tool_name, args)。无法映射返回 None。"""
    if action_type == "price_adjust":
        target = params.get("product_id") or params.get("product_name")
        price = params.get("target_price") or params.get("new_price")
        if not target or not price:
            return None
        args: dict = {"new_price": float(price), "reason": params.get("reason") or "自主巡店定价优化"}
        # 快照文本若只给商品名而非 uuid → 走工具的名称反查通道
        if await _is_uuid(str(target)):
            args["product_id"] = str(target)
        else:
            args["product_name"] = str(target)
        return "update_product_price", args
    if action_type == "create_coupon":
        return "create_coupon", {
            "value": float(params.get("value") or 20),
            "min_amount": float(params.get("min_amount") or 99),
        }
    if action_type == "restock":
        target = params.get("product_id") or params.get("product_name")
        if not target:
            return None
        return "restock_guide", {"product": str(target)}
    if action_type == "clearance":
        target = params.get("product_id") or params.get("product_name")
        if not target:
            return None
        # 清仓 = 降价 15%（可逆，价格随时可调回）
        args_c: dict = {"reason": params.get("reason") or "自主巡店：滞销积压清仓"}
        if await _is_uuid(str(target)):
            args_c["product_id"] = str(target)
        else:
            args_c["product_name"] = str(target)
        return "clearance_price", args_c
    if action_type == "refund_check":
        return "refund_check_guide", {}
    return None


async def _tool_clearance_price(db: AsyncSession, workspace, args: dict, user_id: str) -> dict:
    """滞销清仓：对指定商品降价 15%（真实写库 + Shopify 同步），价格可随时调回。"""
    from app.models.product import Product
    from app.services.agent_orchestrator import _get_shopify_ctx

    pid = args.get("product_id")
    p = await db.get(Product, pid) if pid else None
    if (p is None or p.workspace_id != workspace.id) and args.get("product_name"):
        p = (
            await db.execute(
                select(Product).where(
                    Product.workspace_id == workspace.id,
                    Product.name.ilike(f"%{args['product_name']}%"),
                )
            )
        ).scalars().first()
    if p is None or p.workspace_id != workspace.id:
        return {"ok": False, "error": f"商品不存在（id={pid}）"}

    old_price = float(p.price or 0)
    if old_price <= 0:
        return {"ok": False, "error": f"商品 {p.name} 售价为 0，无法清仓"}
    new_price = round(old_price * 0.85, 2)
    # 保护：不清到成本价以下（避免负毛利）
    cost = float(p.cost_price or 0)
    if cost > 0 and new_price < cost:
        new_price = round(cost * 1.02, 2)

    p.price = new_price
    shopify_ok = None
    integ, cfg = await _get_shopify_ctx(db, workspace)
    if integ and cfg and p.sku and p.sku.startswith("shopify-"):
        try:
            ok, errs = await integ.sync_product_to_shopify(
                cfg, p.sku[len("shopify-"):], {"price": new_price},
            )
            shopify_ok = ok
            if not ok:
                logger.warning("clearance price sync failed: %s", errs)
        except Exception as e:  # noqa: BLE001
            shopify_ok = False
            logger.warning("clearance price sync error: %s", str(e)[:150])
    await db.commit()
    return {
        "ok": True,
        "product": p.name,
        "product_id": p.id,
        "old_price": old_price,
        "new_price": new_price,
        "drop_pct": 15,
        "shopify_synced": shopify_ok,
        "reversible": True,
        "reason": args.get("reason", ""),
    }


# 自动回访：执行后多久可对比指标（小时）。演示时可临时调小。
_REVIEW_AFTER_HOURS = 1

# 指标语义与改善方向：所有指标均为「数值降低 = 改善」
_METRIC_META = {
    "refund_check": ("退款率(%)", "refund_rate"),
    "restock": ("断货风险商品数", "stockout"),
    "clearance": ("积压商品数", "overstock"),
    "retention": ("流失风险客户数", "churn"),
    "price_adjust": ("积压商品数", "overstock"),
    "create_coupon": ("流失风险客户数", "churn"),
}

# 动作 → 经验库基线指标键（执行时记录，供回访对比）
_ACTION_BASELINE_KEY = {
    "price_adjust": "overstock",
    "clearance": "overstock",
    "create_coupon": "churn",
    "refund_check": "refund_rate",
    "restock": "stockout",
}


async def _auto_review_pending(db: AsyncSession, workspace: Workspace) -> list[dict]:
    """自动回访闭环：把「执行过但未验证」的动作与当前经营指标对比，
    自动判定 命中/未命中 并写入经验库（lesson），让后续 AI 决策参考真实效果。

    覆盖两类来源：
      1) AI 决策助手处方（AiInsight，人工一键执行的）
      2) Agent 自主执行动作（AgentExperience，outcome=uncertain 的）
    判定规则：指标相对基线下降 = 命中；上升 = 未命中；持平 = 待观察。
    """
    from app.api.ai import _compute_indicators, _primary_metric
    from app.models.agent_experience import AgentExperience
    from app.models.ai_insight import AiInsight

    cutoff = datetime.utcnow() - timedelta(hours=_REVIEW_AFTER_HOURS)
    ind = await _compute_indicators(db, workspace.id)
    snap = {
        "refund_rate": round(float(ind.get("refund_rate") or 0), 2),
        "stockout": len(ind.get("stockout_risk") or []),
        "overstock": len(ind.get("overstock") or []),
        "churn": len(ind.get("churn_risk") or []),
    }
    reviews: list[dict] = []

    # —— 来源 1：决策助手处方 ——
    insights = (
        await db.execute(
            select(AiInsight).where(
                AiInsight.workspace_id == workspace.id,
                AiInsight.status == "executed",
                AiInsight.result_before.is_not(None),
                AiInsight.executed_at.is_not(None),
                AiInsight.executed_at <= cutoff,
                AiInsight.feedback.is_(None),
            ).order_by(AiInsight.executed_at).limit(10)
        )
    ).scalars().all()
    for ins in insights:
        after = _primary_metric(ins.action_type, snap)
        before = ins.result_before
        if after is None or before is None:
            continue
        reviews.append(await _record_review(
            db, workspace, before=float(before), after=float(after),
            action_type=ins.action_type, title=ins.title, insight_id=ins.id,
            insight_type=ins.insight_type, source="advisor",
            executed_at=ins.executed_at,
        ))
        ins.feedback = reviews[-1]["outcome"]
        ins.feedback_note = "auto-review"
        ins.feedback_at = datetime.utcnow()
        if ins.result_after is None:
            ins.result_after = float(after)

    # —— 来源 2：Agent 自主执行（经验库 pending） ——
    pendings = (
        await db.execute(
            select(AgentExperience).where(
                AgentExperience.workspace_id == workspace.id,
                AgentExperience.outcome == "uncertain",
                AgentExperience.result_before.is_not(None),
                AgentExperience.feedback_at.is_(None),
                AgentExperience.created_at <= cutoff,
                AgentExperience.insight_type == "agent_auto",
            ).order_by(AgentExperience.created_at).limit(10)
        )
    ).scalars().all()
    for exp in pendings:
        meta = _METRIC_META.get(exp.action_type)
        if not meta:
            continue
        metric_name, key = meta
        after = snap.get(key)
        before = exp.result_before
        if after is None or before is None:
            continue
        outcome = "improved" if after < before else ("not_improved" if after > before else "uncertain")
        verdict = {"improved": "命中", "not_improved": "未命中", "uncertain": "持平"}[outcome]
        exp.outcome = outcome
        exp.result_after = float(after)
        exp.feedback_at = datetime.utcnow()
        exp.lesson = (
            f"【自动回访】{exp.title[:40]} 执行后 {metric_name} {before:g} → {after:g}（{verdict}）。"
            + ("该动作方向有效，后续同类问题优先复用此策略。"
               if outcome == "improved"
               else ("该动作未改善指标，下次需调整执行力度或更换策略。"
                     if outcome == "not_improved" else "指标持平，效果待继续观察。"))
        )
        reviews.append({
            "source": "agent_auto", "title": exp.title, "outcome": outcome,
            "metric": metric_name, "before": before, "after": after, "lesson": exp.lesson,
        })

    if reviews:
        await db.commit()
    return reviews


async def _record_review(
    db: AsyncSession, workspace: Workspace, *, before: float, after: float,
    action_type: str, title: str, insight_id: str | None, insight_type: str,
    source: str, executed_at: datetime | None,
) -> dict:
    """写一条回访结论：更新/新建 AgentExperience（经验库）。"""
    from app.models.agent_experience import AgentExperience

    outcome = "improved" if after < before else ("not_improved" if after > before else "uncertain")
    verdict = {"improved": "命中", "not_improved": "未命中", "uncertain": "持平"}[outcome]
    metric_name = _METRIC_META.get(action_type, (action_type, ""))[0]
    lesson = (
        f"【自动回访】{title[:40]} 执行后 {metric_name} {before:g} → {after:g}（{verdict}）。"
        + ("该动作方向有效，后续同类问题优先复用此策略。"
           if outcome == "improved"
           else ("该动作未改善指标，下次需调整执行力度或更换策略。"
                 if outcome == "not_improved" else "指标持平，效果待继续观察。"))
    )
    now = datetime.utcnow()
    delta_days = max(0, (now - executed_at).days) if executed_at else 0
    exp = None
    if insight_id:
        exp = (
            await db.execute(
                select(AgentExperience).where(AgentExperience.insight_id == insight_id).limit(1)
            )
        ).scalar_one_or_none()
    if exp is None:
        db.add(AgentExperience(
            workspace_id=workspace.id, insight_id=insight_id, insight_type=insight_type,
            action_type=action_type, title=title, result_before=before, result_after=after,
            outcome=outcome, lesson=lesson, delta_days=delta_days, feedback_at=now,
        ))
    else:
        exp.result_after = after
        exp.outcome = outcome
        exp.lesson = lesson
        exp.feedback_at = now
        exp.delta_days = delta_days
    return {
        "source": source, "insight_id": insight_id, "title": title, "outcome": outcome,
        "metric": metric_name, "before": before, "after": after, "lesson": lesson,
    }


async def run_store_check(
    db: AsyncSession, workspace: Workspace, user_id: str, auto: bool = False,
) -> dict:
    """自主巡店一次：回访→感知 → 决策 → 分级处理 → 审计落库 → 返回报告。"""
    from app.api.ai import _collect_biz_snapshot
    from app.models.notification import Notification
    from app.models.workspace import WorkspaceMember
    from app.services.agent_orchestrator import _tool_create_coupon, _tool_update_price

    # 0) 自动回访：先把「执行过但未验证」的动作与当前指标对比，沉淀真实效果经验
    try:
        auto_reviews = await _auto_review_pending(db, workspace)
    except Exception as e:  # noqa: BLE001
        logger.warning("auto-review failed ws=%s: %s", workspace.id, str(e)[:150])
        auto_reviews = []

    # 1) AI 决策（快照 + 风险商品清单含真实 id + 经验）
    snapshot = await _collect_biz_snapshot(db, workspace.id)
    exp_text = await _recent_experiences_text(db, workspace.id)
    products_text = await _risk_products_text(db, workspace.id)
    last_task = (
        await db.execute(
            select(AgentTask).where(
                AgentTask.workspace_id == workspace.id,
                AgentTask.instruction.like("【自主巡店】%"),
            ).order_by(AgentTask.created_at.desc()).limit(1)
        )
    ).scalar_one_or_none()
    last_conclusion = last_task.reply[:150] if last_task and last_task.reply else None
    raw = await _qwen_plan(snapshot, exp_text, last_conclusion, products_text)
    conclusion, plan = _parse_plan(raw)

    # 2) 按【风险策略表】分级执行（权限判断以策略表为准，不采信模型自报的 risk）
    auto_items, confirm_items = split_plan_by_risk(plan)
    guidance: list[dict] = []      # 只读引导（restock/refund_check）
    executed: list[dict] = []      # 已真实执行（中风险，自动）
    pending_steps: list[dict] = []  # 需人工确认（高风险）
    skipped: list[dict] = []       # 因日限额/未知动作被拒
    auto_count = 0

    for item in auto_items:
        action = item["action_type"]
        mapped = await _to_tool_args(action, item["params"])
        if mapped is None:
            continue
        tool, args = mapped
        # 只读引导：不写库
        if tool in ("restock_guide", "refund_check_guide"):
            guidance.append({
                "action": action, "args": args, "reason": item["reason"],
                "risk": item["policy_risk"],
            })
            continue
        # 中风险真实动作：先检查全局与人次限额，再执行
        if auto_count >= MAX_AUTO_ACTIONS_PER_RUN:
            skipped.append({"action": action, "reason": f"单次巡店自主执行已达上限 {MAX_AUTO_ACTIONS_PER_RUN} 项"})
            continue
        try:
            used = await count_auto_executed_today(db, workspace.id, action)
        except Exception:  # noqa: BLE001
            used = 0
        allowed, why = auto_exec_budget(action, used)
        if not allowed:
            skipped.append({"action": action, "reason": why, "rate_limited": True})
            logger.info("auto-exec denied ws=%s action=%s: %s", workspace.id, action, why)
            continue
        try:
            if tool == "update_product_price":
                result = await _tool_update_price(db, workspace, args, user_id)
            elif tool == "clearance_price":
                result = await _tool_clearance_price(db, workspace, args, user_id)
            else:
                result = await _tool_create_coupon(db, workspace, args)
            executed.append({
                "tool": tool, "args": args, "result": result, "reason": item["reason"],
                "action_type": action, "risk": item["policy_risk"],
                "autonomous": True, "approved_by": "policy",
            })
            if result.get("ok"):
                auto_count += 1
        except Exception as e:  # noqa: BLE001
            executed.append({
                "tool": tool, "args": args, "action_type": action,
                "result": {"ok": False, "error": str(e)[:200]},
                "reason": item["reason"], "autonomous": True,
            })

    # 高风险动作 → 挂起待确认
    for item in confirm_items:
        action = item["action_type"]
        mapped = await _to_tool_args(action, item["params"])
        if mapped is None:
            continue
        tool, args = mapped
        pending_steps.append({
            "tool": tool, "args": args, "reason": item["reason"],
            "action_type": action, "status": "pending", "auto": False,
            "risk": item["policy_risk"],
            "why_confirm": get_policy(action).note,
        })

    # 3) 审计落库：AgentTask（pending_steps 供 confirm_pending 复用执行）
    steps_json = {
        "conclusion": conclusion,
        "guidance": guidance,
        "executed": executed,
        "pending": pending_steps,
        "skipped": skipped,
        "autonomy": {
            "auto_executed": len(executed),
            "awaiting_confirm": len(pending_steps),
            "rate_limited": sum(1 for s in skipped if s.get("rate_limited")),
            "policy_table": describe_policy_table(),
        },
        "generated_at": __import__("datetime").datetime.utcnow().isoformat(),
    }
    task = AgentTask(
        workspace_id=workspace.id,
        user_id=user_id,
        instruction="【自主巡店】" + conclusion,
        status="awaiting_confirm" if pending_steps else "done",
        steps_json=json.dumps(steps_json, ensure_ascii=False),
        reply=conclusion,
    )
    db.add(task)

    # 4) 通知成员（巡店结论 + 自主执行/待确认数）
    member_ids = (
        await db.execute(select(WorkspaceMember.user_id).where(WorkspaceMember.workspace_id == workspace.id))
    ).scalars().all()
    if executed and pending_steps:
        note_title = f"🤖 Agent 已自主处理 {len(executed)} 项，{len(pending_steps)} 项待你确认"
    elif executed:
        note_title = f"🤖 Agent 已自主处理 {len(executed)} 项"
    elif pending_steps:
        note_title = f"🤖 Agent 巡店：{len(pending_steps)} 项待你确认"
    else:
        note_title = "🤖 Agent 巡店完成"
    if guidance or executed or pending_steps or skipped:
        _exec_txt = ""
        if executed:
            names = "、".join(str((e.get("result") or {}).get("code") or (e.get("result") or {}).get("product") or e.get("action_type")) for e in executed[:3])
            _exec_txt = f"其中 {len(executed)} 项已由 Agent 自主执行（{names}），"
        _conf_txt = f"{len(pending_steps)} 项高风险操作需要你确认后执行。" if pending_steps else ""
        _skip_txt = f"另有 {len(skipped)} 项因日限额未执行。" if skipped else ""
        note_msg = (
            conclusion
            + f"。{len(guidance)} 项引导建议（补货/退款核查）。"
            + _exec_txt + _conf_txt + _skip_txt
        )
    else:
        note_msg = conclusion + "今日无需紧急干预。"
    for uid in member_ids:
        db.add(Notification(
            workspace_id=workspace.id,
            user_id=uid,
            notification_type="agent_report",
            title=note_title,
            message=note_msg[:900],
            is_read=False,
        ))
    await db.commit()

    # 5) 经验：自主执行的动作沉淀为"待观察经验"（含执行时指标基线，供自动回访对比）
    _baseline_snapshot: dict = {}
    if executed:
        try:
            from app.api.ai import _metric_snapshot as _ms
            _baseline_snapshot = await _ms(db, workspace.id)
        except Exception:  # noqa: BLE001
            _baseline_snapshot = {}
    if executed:
        try:
            from app.models.agent_experience import AgentExperience
            for ex in executed:
                if not (ex.get("result") or {}).get("ok"):
                    continue
                _action = ex.get("action_type") or (
                    "price_adjust" if ex["tool"] == "update_product_price" else "create_coupon"
                )
                # 记录执行时刻的指标基线，供后续「自动回访」对比判断命中与否
                _key = _ACTION_BASELINE_KEY.get(_action, "overstock")
                _r = ex.get("result") or {}
                _label = _r.get("code") or _r.get("product") or ex.get("args", {}).get("product_id") or _action
                db.add(AgentExperience(
                    workspace_id=workspace.id,
                    action_type=_action,
                    insight_type="agent_auto",
                    title=f"Agent 自主执行：{_label}"[:255],
                    context=json.dumps(
                        {"args": ex["args"], "result": _r, "policy_approved": True,
                         "risk": ex.get("risk")},
                        ensure_ascii=False,
                    ),
                    result_before=float(_baseline_snapshot.get(_key) or 0),
                    outcome="uncertain",
                    lesson="Agent 依据自主执行策略执行该动作，待观察后续经营指标判断效果。",
                ))
            await db.commit()
        except Exception:  # noqa: BLE001
            pass

    logger.info(
        "store agent run done ws=%s auto_exec=%d pending=%d skipped=%d",
        workspace.id, len(executed), len(pending_steps), len(skipped),
    )
    return {
        "conclusion": conclusion,
        "guidance": guidance,
        "executed": executed,
        "pending": pending_steps,
        "skipped": skipped,
        "auto_reviews": auto_reviews,
        "autonomy": steps_json["autonomy"],
        "task_id": task.id,
        "mode": "policy",
    }


@router.get("/policy", summary="Agent 自主执行策略表（哪些动作它自己能做）")
async def agent_policy(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """返回风险分级策略表 + 今日已用额度，让店主清楚 Agent 的权限边界。"""
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    rows = describe_policy_table()
    for r in rows:
        used = 0
        if r["auto_allowed"]:
            try:
                used = await count_auto_executed_today(db, workspace.id, r["action_type"])
            except Exception:  # noqa: BLE001
                used = 0
        r["used_today"] = used
        r["remaining_today"] = (
            None if r["daily_cap"] is None else max(0, r["daily_cap"] - used)
        )
    return {
        "max_auto_actions_per_run": MAX_AUTO_ACTIONS_PER_RUN,
        "policies": rows,
    }


@router.post("/run-store-check", summary="让巡店 Agent 自主当班一次（按策略表分级执行）")
async def api_run_store_check(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
    auto: int = 1,
) -> dict:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.ADMIN)
    # 巡店 Agent 为 Enterprise 专属（超管不受限）
    _is_admin = bool(getattr(getattr(principal, "user", None), "is_superadmin", False))
    if not _is_admin and await _ws_plan_tier(db, workspace.id) != "enterprise":
        raise HTTPException(status_code=403, detail="自主巡店 Agent 为 Enterprise 套餐专属，请升级后使用")
    # auto 参数保留兼容：策略表才是执行与否的真正闸门（高风险动作永远需确认）
    return await run_store_check(db, workspace, principal.user_id, auto=bool(auto))


@router.get("/report", summary="最近一次自主巡店报告")
async def last_report(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    task = (
        await db.execute(
            select(AgentTask).where(
                AgentTask.workspace_id == workspace.id,
                AgentTask.instruction.like("【自主巡店】%"),
            ).order_by(AgentTask.created_at.desc()).limit(1)
        )
    ).scalar_one_or_none()
    if task is None:
        return {"has_report": False}
    try:
        body = json.loads(task.steps_json or "{}")
    except Exception:
        body = {}
    return {
        "has_report": True,
        "task_id": task.id,
        "status": task.status,
        "conclusion": task.reply or body.get("conclusion", ""),
        "summary": body,
        "created_at": task.created_at.isoformat() if task.created_at else None,
    }


# ── Agent 决策回放（Replay）────────────────────────────────────────────────
# 把一次巡店还原成「感知 → 决策 → 执行 → 回访」四阶段时间线，
# 让 Agent 的思考过程成为可展示、可审计的资产。

_PHASE_META = [
    {"key": "perceive", "label_zh": "感知", "label_en": "Perceive",
     "desc_zh": "采集店铺真实经营快照", "desc_en": "Collect real business snapshot"},
    {"key": "decide", "label_zh": "决策", "label_en": "Decide",
     "desc_zh": "千问基于快照自主制定计划", "desc_en": "Qwen drafts the plan from data"},
    {"key": "act", "label_zh": "执行", "label_en": "Act",
     "desc_zh": "按风险策略分级处理", "desc_en": "Handle by risk policy"},
    {"key": "review", "label_zh": "回访", "label_en": "Review",
     "desc_zh": "对比指标判定命中/未命中", "desc_en": "Compare metrics, judge hit or miss"},
]


async def _build_replay(db: AsyncSession, workspace: Workspace, task: AgentTask) -> dict:
    """把单次巡店任务还原为四阶段时间线（含后续回访结果）。"""
    from app.models.agent_experience import AgentExperience

    try:
        body = json.loads(task.steps_json or "{}")
    except Exception:  # noqa: BLE001
        body = {}

    autonomy = body.get("autonomy") or {}
    executed = body.get("executed") or []
    pending = body.get("pending") or []
    guidance = body.get("guidance") or []
    skipped = body.get("skipped") or []
    conclusion = task.reply or body.get("conclusion") or ""
    created = task.created_at

    # 感知阶段：从 guidance/executed 的 reason 里提取 Agent 观测到的信号
    signals = []
    for g in guidance:
        if g.get("reason"):
            signals.append({"kind": "signal", "action": g.get("action"), "text": g["reason"]})
    for e in executed:
        if e.get("reason"):
            signals.append({"kind": "signal", "action": e.get("action_type"), "text": e["reason"]})
    for p in pending:
        if p.get("reason"):
            signals.append({"kind": "signal", "action": p.get("action_type"), "text": p["reason"]})
    if not signals and conclusion:
        signals.append({"kind": "summary", "action": None, "text": conclusion})

    # 决策阶段
    decision = {
        "conclusion": conclusion,
        "planned": len(guidance) + len(executed) + len(pending) + len(skipped),
        "distribution": {
            "guidance": len(guidance),
            "auto_executed": len(executed),
            "need_confirm": len(pending),
            "rate_limited": len(skipped),
        },
        "policy_table": autonomy.get("policy_table") or describe_policy_table(),
    }

    # 执行阶段
    actions = []
    for e in executed:
        r = e.get("result") or {}
        label = r.get("code") or r.get("product") or e.get("action_type")
        detail = ""
        if e.get("tool") == "update_product_price":
            detail = f"¥{r.get('old_price')} → ¥{r.get('new_price')}"
        elif e.get("tool") == "clearance_price":
            detail = f"¥{r.get('old_price')} → ¥{r.get('new_price')}（-{r.get('drop_pct')}%）"
        elif e.get("tool") == "create_coupon":
            detail = f"¥{r.get('value')} 满 ¥{r.get('min_amount')} 减"
        actions.append({
            "status": "auto_executed", "tool": e.get("tool"), "action_type": e.get("action_type"),
            "label": label, "detail": detail, "risk": e.get("risk"),
            "shopify_synced": r.get("shopify_synced"), "reason": e.get("reason"),
        })
    for p in pending:
        a = p.get("args") or {}
        actions.append({
            "status": "awaiting_confirm", "tool": p.get("tool"), "action_type": p.get("action_type"),
            "label": a.get("product_id") or a.get("product_name") or p.get("action_type"),
            "detail": f"目标价 ¥{a.get('target_price') or a.get('new_price')}" if a.get("target_price") or a.get("new_price") else "",
            "risk": p.get("risk"), "reason": p.get("reason"), "why_confirm": p.get("why_confirm"),
        })
    for g in guidance:
        a = g.get("args") or {}
        # 清洗 uuid 前缀：快照里补货目标是 "uuid: 商品名"，展示时只留可读部分
        raw = str(a.get("product") or "")
        import re as _re
        label = _re.sub(
            r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[:：]?\s*",
            "", raw, flags=_re.I,
        ).strip() or g.get("action")
        actions.append({
            "status": "guided", "tool": None, "action_type": g.get("action"),
            "label": label, "detail": "",
            "risk": g.get("risk"), "reason": g.get("reason"),
        })
    for s in skipped:
        actions.append({
            "status": "blocked", "tool": None, "action_type": s.get("action"),
            "label": s.get("action"), "detail": s.get("reason") or "",
            "risk": None, "reason": s.get("reason"), "rate_limited": True,
        })

    # 回访阶段：找该次巡店之后落地的经验
    reviews = []
    try:
        exp_rows = (
            await db.execute(
                select(AgentExperience).where(
                    AgentExperience.workspace_id == workspace.id,
                    AgentExperience.created_at >= created,
                ).order_by(AgentExperience.created_at)
            )
        ).scalars().all()
        for exp in exp_rows:
            reviews.append({
                "action_type": exp.action_type,
                "title": exp.title,
                "outcome": exp.outcome,
                "metric_before": exp.result_before,
                "metric_after": exp.result_after,
                "lesson": exp.lesson,
                "reviewed_at": exp.feedback_at.isoformat() if exp.feedback_at else None,
            })
    except Exception:  # noqa: BLE001
        pass

    phases = [
        {"key": "perceive", "items": signals},
        {"key": "decide", "detail": decision},
        {"key": "act", "items": actions},
        {"key": "review", "items": reviews},
    ]
    for meta, phase in zip(_PHASE_META, phases):
        phase.update({
            "label_zh": meta["label_zh"], "label_en": meta["label_en"],
            "desc_zh": meta["desc_zh"], "desc_en": meta["desc_en"],
        })

    return {
        "task_id": task.id,
        "created_at": created.isoformat() if created else None,
        "status": task.status,
        "conclusion": conclusion,
        "phases": phases,
        "totals": {
            "signals": len(signals),
            "planned": decision["planned"],
            "auto_executed": len(executed),
            "awaiting_confirm": len(pending),
            "guided": len(guidance),
            "blocked": len(skipped),
            "reviewed": len(reviews),
        },
    }


@router.get("/replay", summary="Agent 决策回放：最近 N 次巡店的完整时间线")
async def agent_replay(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 5,
) -> dict:
    """把 Agent 的历史巡店还原为「感知→决策→执行→回访」时间线，供审计与演示。"""
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    _is_admin = bool(getattr(getattr(principal, "user", None), "is_superadmin", False))
    if not _is_admin and await _ws_plan_tier(db, workspace.id) != "enterprise":
        raise HTTPException(status_code=403, detail="Agent 决策回放为 Enterprise 套餐专属，请升级后使用")
    tasks = (
        await db.execute(
            select(AgentTask).where(
                AgentTask.workspace_id == workspace.id,
                AgentTask.instruction.like("【自主巡店】%"),
            ).order_by(AgentTask.created_at.desc()).limit(max(1, min(limit, 20)))
        )
    ).scalars().all()
    runs = []
    for tk in tasks:
        try:
            runs.append(await _build_replay(db, workspace, tk))
        except Exception as e:  # noqa: BLE001
            logger.warning("replay build failed task=%s: %s", tk.id, str(e)[:150])
    return {"total": len(runs), "runs": runs}


async def run_daily_store_agents() -> None:
    """每日定时任务：让每个工作空间的巡店 Agent 自主当班。

    执行模式由 services/autonomy.py 的策略表决定——
    低/中风险动作 Agent 自己办掉（受日限额约束），高风险动作挂起等店主确认。
    由 main.py 的 AsyncIOScheduler 在每天 09:30 触发。独立开 session，逐空间执行，
    单空间失败不影响其它空间。
    """
    from app.database import async_session_factory
    from app.models.workspace import Workspace, WorkspaceMember, WorkspaceRole

    logger.info("store sentinel daily run started")
    try:
        async with async_session_factory() as db:
            wss = (await db.execute(select(Workspace).limit(100))).scalars().all()
            ws_ids = [ws.id for ws in wss]
        # 每个工作空间独立会话执行，避免单个空间异常污染共享会话
        for ws_id in ws_ids:
            async with async_session_factory() as db:
                ws = await db.get(Workspace, ws_id)
                if ws is None:
                    continue
                owner_id = (
                    await db.execute(
                        select(WorkspaceMember.user_id).where(
                            WorkspaceMember.workspace_id == ws.id,
                            WorkspaceMember.role.in_([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]),
                        ).limit(1)
                    )
                ).scalars().first()
                if not owner_id:
                    continue
                # Enterprise 专属：非 enterprise 工作空间跳过（超管 workspace 单独在端点手动巡店）
                try:
                    if await _ws_plan_tier(db, ws.id) != "enterprise":
                        continue
                except Exception:
                    continue
                try:
                    report = await run_store_check(db, ws, owner_id, auto=True)
                    logger.info(
                        "sentinel ws=%s auto_exec=%d pending=%d",
                        ws.id, len(report.get("executed") or []), len(report.get("pending") or []),
                    )
                except Exception as e:  # noqa: BLE001
                    logger.warning("sentinel ws %s failed: %s", ws.id, str(e)[:150])
    except Exception as e:  # noqa: BLE001
        logger.error("store sentinel daily run crashed: %s", str(e)[:200])
