"""Nexora 自主巡店 Agent (Store Sentinel).

与"对话式指挥"(用户发指令→Agent 执行)不同，本模块是**自主型经营 Agent**：
每天/随时自行"上班"——主动感知店铺实时状态 → 让千问基于真实数据自主决策 →
低风险动作直接处理，破坏性动作(改价/建券，真实写库+Shopify 同步)默认挂起请店主确认
(或 auto=True 自主执行) → 每次巡店沉淀 AgentTask 审计 + 结论通知 + 经验。

工作方式不是"人指挥它"，而是"它当班巡店，把搞不定的呈给你，把每次判断记进经验库"。
"""

import json
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import _require_member
from app.database import get_db
from app.middleware.auth import AuthContext, get_principal
from app.models.agent_task import AgentTask
from app.models.workspace import Workspace, WorkspaceRole
from app.utils.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/workspaces/{slug}/ai/agent", tags=["AI - Store Sentinel Agent"])

MAX_PLAN = 3

# Agent 可决策的动作集（与后端执行能力一一对应）
VALID_ACTIONS = {"restock", "refund_check", "price_adjust", "create_coupon", "keep"}


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
        "     action_type: 字符串，只能是 price_adjust | create_coupon | restock | refund_check | keep\n"
        "     params: 对象（price_adjust 需 product_id+target_price；create_coupon 需 value+min_amount；"
        "restock 需 product_id；refund_check 留空）\n"
        "     reason: 字符串，≤60 字，引用快照数字说明依据\n"
        "     risk: 字符串，改价/建券填 high，其余 low\n"
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
    if action_type == "refund_check":
        return "refund_check_guide", {}
    return None


async def run_store_check(
    db: AsyncSession, workspace: Workspace, user_id: str, auto: bool = False,
) -> dict:
    """自主巡店一次：感知 → 决策 → 分级处理 → 审计落库 → 返回报告。"""
    from app.api.ai import _collect_biz_snapshot
    from app.models.notification import Notification
    from app.models.workspace import WorkspaceMember
    from app.services.agent_orchestrator import _tool_create_coupon, _tool_update_price

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

    # 2) 分级执行
    guidance: list[dict] = []     # low：restock/refund_check 引导（不写库）
    pending_steps: list[dict] = []  # high：改价/建券 → 真实执行前挂确认（或 auto 直接执行）
    executed: list[dict] = []
    for item in plan:
        if item["action_type"] == "keep":
            continue
        mapped = await _to_tool_args(item["action_type"], item["params"])
        if mapped is None:
            continue
        tool, args = mapped
        if tool in ("restock_guide", "refund_check_guide"):
            guidance.append({"action": item["action_type"], "args": args, "reason": item["reason"]})
            continue
        # 破坏性工具
        step = {"tool": tool, "args": args, "reason": item["reason"], "auto": auto}
        if not auto:
            step["status"] = "pending"
            pending_steps.append(step)
            continue
        # auto 模式：Agent 自主执行（真实写库 + Shopify 同步）
        try:
            if tool == "update_product_price":
                result = await _tool_update_price(db, workspace, args, user_id)
            else:
                result = await _tool_create_coupon(db, workspace, args)
            executed.append({"tool": tool, "args": args, "result": result, "reason": item["reason"]})
        except Exception as e:  # noqa: BLE001
            executed.append({"tool": tool, "args": args, "result": {"ok": False, "error": str(e)[:200]}, "reason": item["reason"]})

    # 3) 审计落库：AgentTask（pending_steps 供 confirm_pending 复用执行）
    steps_json = {
        "conclusion": conclusion,
        "guidance": guidance,
        "executed": executed,
        "pending": pending_steps,
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

    # 4) 通知成员（巡店结论 + 待确认数）
    member_ids = (
        await db.execute(select(WorkspaceMember.user_id).where(WorkspaceMember.workspace_id == workspace.id))
    ).scalars().all()
    note_title = f"🤖 Agent 巡店：{len(pending_steps)} 项待你确认"
    note_msg = conclusion + (
        f"。其中 {len(guidance)} 项引导建议（补货/退款核查），{len(executed)} 项已自主执行，"
        f"{len(pending_steps)} 项改价/建券操作需要你确认后执行。"
        if (guidance or executed or pending_steps) else "今日无需紧急干预。"
    )
    for uid in member_ids:
        db.add(Notification(
            workspace_id=workspace.id,
            user_id=uid,
            notification_type="agent_report",
            title=note_title if pending_steps else "🤖 Agent 巡店完成",
            message=note_msg[:900],
            is_read=False,
        ))
    await db.commit()

    # 5) 经验：auto 自主执行的动作沉淀为"待观察经验"（供后续对比）
    if auto and executed:
        try:
            from app.models.agent_experience import AgentExperience
            for ex in executed:
                if not (ex.get("result") or {}).get("ok"):
                    continue
                db.add(AgentExperience(
                    workspace_id=workspace.id,
                    action_type="price_adjust" if ex["tool"] == "update_product_price" else "create_coupon",
                    insight_type="agent_auto",
                    title=f"Agent 自主执行：{ex.get('args', {}).get('product_id') or '发放优惠券'}",
                    context=json.dumps(ex["args"], ensure_ascii=False),
                    outcome="uncertain",
                    lesson="Agent 自主执行动作，待观察后续经营指标判断效果。",
                ))
            await db.commit()
        except Exception:  # noqa: BLE001
            pass

    logger.info("store agent run done ws=%s pending=%d auto_exec=%d", workspace.id, len(pending_steps), len(executed))
    return {
        "conclusion": conclusion,
        "guidance": guidance,
        "executed": executed,
        "pending": pending_steps,
        "task_id": task.id,
        "mode": "auto" if auto else "confirm",
    }


@router.post("/run-store-check", summary="让巡店 Agent 自主当班一次（auto=true 自主执行改价/建券）")
async def api_run_store_check(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
    auto: int = 0,
) -> dict:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.ADMIN)
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


async def run_daily_store_agents() -> None:
    """每日定时任务：让每个工作空间的巡店 Agent 自主当班（confirm 模式，改价/建券需店主确认）。

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
                try:
                    await run_store_check(db, ws, owner_id, auto=False)
                except Exception as e:  # noqa: BLE001
                    logger.warning("sentinel ws %s failed: %s", ws.id, str(e)[:150])
    except Exception as e:  # noqa: BLE001
        logger.error("store sentinel daily run crashed: %s", str(e)[:200])
