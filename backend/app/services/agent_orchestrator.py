"""Nexora Agent Orchestrator — 对话式经营智能体编排层.

用户一句话指令 → 千问 function-call 循环 → 调用真实工具（查商品/改价/建券/快照）
→ 每步留审计 → 破坏性操作默认需确认（auto=False）。

安全设计：
- 只读工具（search_products / get_business_snapshot）直接执行
- 破坏性工具（update_product_price / create_coupon）在 auto=False 时挂起为 pending，
  前端确认后由 confirm_pending() 真实执行
- 所有步骤写入 AgentTask.steps_json 供审计
"""

import json
from datetime import datetime
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.agent_task import AgentTask
from app.models.product import Product
from app.services.ai import _get_qwen_config
from app.utils.logging import get_logger

logger = get_logger(__name__)

MAX_TOOL_ROUNDS = 5

# ----------------------------------------------------------------------
# 工具定义（OpenAI function-calling 格式）
# ----------------------------------------------------------------------

TOOLS_SPEC = [
    {
        "type": "function",
        "function": {
            "name": "search_products",
            "description": "搜索当前店铺商品。可按关键词搜索，或按条件筛选：低库存(stock<=阈值)、积压(stock>120)、全部。",
            "parameters": {
                "type": "object",
                "properties": {
                    "keyword": {"type": "string", "description": "商品名关键词（可选）"},
                    "filter": {"type": "string", "enum": ["low_stock", "overstock", "all"], "description": "筛选条件"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_product_price",
            "description": "修改指定商品售价（真实同步到 Shopify）。破坏性操作：auto 模式直接执行，confirm 模式挂起待用户确认。",
            "parameters": {
                "type": "object",
                "properties": {
                    "product_id": {"type": "string", "description": "商品 ID"},
                    "product_name": {"type": "string", "description": "商品名（用于展示）"},
                    "new_price": {"type": "number", "description": "新售价（元）"},
                    "reason": {"type": "string", "description": "调价理由"},
                },
                "required": ["product_id", "new_price"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_coupon",
            "description": "创建满减优惠券（真实同步 Shopify）。破坏性操作。",
            "parameters": {
                "type": "object",
                "properties": {
                    "value": {"type": "number", "description": "减免金额（元）"},
                    "min_amount": {"type": "number", "description": "使用门槛（元）"},
                    "reason": {"type": "string", "description": "创建理由"},
                },
                "required": ["value"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_business_snapshot",
            "description": "获取经营快照：营收/订单数/退款率/库存概况等真实数据。",
            "parameters": {"type": "object", "properties": {}},
        },
    },
]

SYSTEM_PROMPT = (
    "你是 Nexora 电商经营智能体。用户会用自然语言下达经营指令。"
    "你可以调用工具查询数据、修改商品价格（同步 Shopify）、创建优惠券。"
    "规则：1) 先用只读工具了解现状，再决定动作；2) 调价/建券前必须先 search_products 确认目标商品存在；"
    "3) 数字要具体（降幅/金额），不要模糊；4) 全程中文；5) 完成后简洁汇报每一步结果。"
)


# ----------------------------------------------------------------------
# 工具执行器（真实操作）
# ----------------------------------------------------------------------

async def _get_shopify_ctx(db: AsyncSession, workspace) -> tuple[Any, Any]:
    """返回 (integ, shopify_cfg)，未连接返回 (None, None)。"""
    from app.models.store import Store
    from app.services.platforms import PLATFORM_REGISTRY
    from app.services.store import StoreService

    store_row = (
        await db.execute(
            select(Store).where(
                Store.workspace_id == workspace.id, Store.platform == "shopify",
            ).order_by(Store.created_at.desc()).limit(1)
        )
    ).scalar_one_or_none()
    if store_row is None:
        return None, None
    cfg = await StoreService.get_plain_credentials(store_row)
    integ_cls = PLATFORM_REGISTRY.get("shopify")
    if integ_cls is None:
        return None, None
    return integ_cls(), cfg


async def _tool_search_products(db: AsyncSession, workspace, args: dict) -> dict:
    keyword = (args.get("keyword") or "").strip()
    flt = args.get("filter") or "all"
    q = select(Product).where(Product.workspace_id == workspace.id)
    rows = (await db.execute(q.limit(500))).scalars().all()
    out = []
    for p in rows:
        if keyword and keyword.lower() not in (p.name or "").lower():
            continue
        stock = p.stock or 0
        threshold = p.low_stock_threshold or 10
        if flt == "low_stock" and stock > threshold:
            continue
        if flt == "overstock" and stock <= 120:
            continue
        out.append({
            "id": p.id, "name": p.name, "price": float(p.price or 0),
            "cost": float(p.cost_price or 0), "stock": stock,
        })
    return {"ok": True, "count": len(out), "products": out[:20]}


async def _tool_update_price(db: AsyncSession, workspace, args: dict, user_id: str) -> dict:
    pid = args.get("product_id")
    new_price = float(args.get("new_price") or 0)
    p = await db.get(Product, pid) if pid else None
    if (p is None or p.workspace_id != workspace.id) and args.get("product_name"):
        # 容错：按商品名反查
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
    p.price = new_price
    # Shopify 真实同步
    shopify_ok = None
    integ, cfg = await _get_shopify_ctx(db, workspace)
    if integ and cfg and p.sku and p.sku.startswith("shopify-"):
        ok, errs = await integ.sync_product_to_shopify(cfg, p.sku[len("shopify-"):], {"price": new_price})
        shopify_ok = ok
        if not ok:
            logger.warning("agent price sync failed: %s", errs)
    await db.commit()
    return {
        "ok": True,
        "product": p.name,
        "old_price": old_price,
        "new_price": new_price,
        "shopify_synced": shopify_ok,
        "reason": args.get("reason", ""),
    }


async def _tool_create_coupon(db: AsyncSession, workspace, args: dict) -> dict:
    import random
    from datetime import timedelta
    from app.models.coupon import Coupon

    value = float(args.get("value") or 20)
    min_amount = float(args.get("min_amount") or 99)
    code = f"AGENT{random.randint(1000, 9999)}"
    integ, cfg = await _get_shopify_ctx(db, workspace)
    shopify_ok = False
    if integ and cfg:
        try:
            shopify_ok = await integ.create_coupon_on_shopify(
                cfg, code=code, value=value, min_amount=min_amount, max_uses=500, expires_in_days=14,
            )
        except Exception:
            shopify_ok = False
    db.add(Coupon(
        workspace_id=workspace.id, code=code, type="fixed", value=value,
        min_order_amount=min_amount, max_uses=500,
        expires_at=datetime.utcnow() + timedelta(days=14),
    ))
    await db.commit()
    return {"ok": True, "code": code, "value": value, "min_amount": min_amount, "shopify_synced": shopify_ok}


async def _tool_snapshot(db: AsyncSession, workspace) -> dict:
    from app.api.ai import _collect_biz_snapshot
    return {"ok": True, "snapshot": await _collect_biz_snapshot(db, workspace.id)}


# ----------------------------------------------------------------------
# 千问 function-call 循环
# ----------------------------------------------------------------------

async def _qwen_tools_call(messages: list[dict]) -> dict:
    """调用千问（带 tools），返回完整 message dict。失败抛异常。"""
    key, model, base_url = _get_qwen_config()
    if not key:
        raise RuntimeError("no qwen key")
    async with httpx.AsyncClient(timeout=60, trust_env=False) as client:
        resp = await client.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={"model": model, "messages": messages, "tools": TOOLS_SPEC, "temperature": 0.3},
        )
    if resp.status_code != 200:
        raise RuntimeError(f"qwen http {resp.status_code}: {resp.text[:200]}")
    return resp.json()["choices"][0]["message"]


async def run_command(
    db: AsyncSession, workspace, user_id: str, instruction: str, auto: bool = False
) -> AgentTask:
    """执行一条自然语言经营指令，返回 AgentTask（含步骤审计）。"""
    task = AgentTask(
        workspace_id=workspace.id,
        user_id=user_id,
        instruction=instruction,
        status="running",
        steps_json="[]",
        reply="",
    )
    db.add(task)
    await db.commit()

    steps: list[dict] = []
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": instruction},
    ]
    reply = ""
    try:
        for _round in range(MAX_TOOL_ROUNDS):
            msg = await _qwen_tools_call(messages)
            tool_calls = msg.get("tool_calls") or []
            if not tool_calls:
                reply = msg.get("content") or ""
                break
            # assistant 消息（含 tool_calls）回传
            messages.append({"role": "assistant", "content": msg.get("content") or "", "tool_calls": tool_calls})
            for tc in tool_calls:
                _fnobj = tc.get("function") or {}
                fn = _fnobj.get("name", "")
                try:
                    _args_raw = _fnobj.get("arguments") or _fnobj.get("args") or "{}"
                    args = json.loads(_args_raw)
                except Exception:
                    args = {}
                destructive = fn in ("update_product_price", "create_coupon")
                step: dict[str, Any] = {"tool": fn, "args": args, "auto": auto, "destructive": destructive}
                if destructive and not auto:
                    # confirm 模式：挂起待确认
                    step["status"] = "pending"
                    step["result"] = {"pending": True, "note": "等待用户确认后执行"}
                    steps.append(step)
                    task.status = "awaiting_confirm"
                    task.steps_json = json.dumps(steps, ensure_ascii=False)
                    task.reply = "已生成执行计划，等待确认。"
                    await db.commit()
                    return task
                # 执行
                try:
                    if fn == "search_products":
                        result = await _tool_search_products(db, workspace, args)
                    elif fn == "update_product_price":
                        result = await _tool_update_price(db, workspace, args, user_id)
                    elif fn == "create_coupon":
                        result = await _tool_create_coupon(db, workspace, args)
                    elif fn == "get_business_snapshot":
                        result = await _tool_snapshot(db, workspace)
                    else:
                        result = {"ok": False, "error": f"未知工具 {fn}"}
                except Exception as e:  # noqa: BLE001
                    result = {"ok": False, "error": str(e)[:200]}
                step["status"] = "failed" if result.get("ok") is False else "done"
                step["result"] = result
                steps.append(step)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.get("id") or "",
                    "content": json.dumps(result, ensure_ascii=False)[:2000],
                })
        task.status = "done"
        task.steps_json = json.dumps(steps, ensure_ascii=False)
        task.reply = reply or "已完成。"
        await db.commit()
    except Exception as e:  # noqa: BLE001
        task.status = "failed"
        task.steps_json = json.dumps(steps, ensure_ascii=False)
        task.reply = f"执行失败：{str(e)[:200]}"
        await db.commit()
    return task


async def confirm_pending(db: AsyncSession, workspace, user_id: str, task_id: str) -> AgentTask | None:
    """执行挂起的破坏性步骤（用户已确认）。"""
    task = await db.get(AgentTask, task_id)
    if task is None or task.workspace_id != workspace.id:
        return None
    steps = json.loads(task.steps_json or "[]")
    results: list[dict] = []
    for step in steps:
        if step.get("status") != "pending":
            continue
        fn, args = step["tool"], step.get("args", {})
        try:
            if fn == "update_product_price":
                result = await _tool_update_price(db, workspace, args, user_id)
            elif fn == "create_coupon":
                result = await _tool_create_coupon(db, workspace, args)
            else:
                result = {"ok": False, "error": f"工具 {fn} 无需确认"}
        except Exception as e:  # noqa: BLE001
            result = {"ok": False, "error": str(e)[:200]}
        step["status"] = "done" if result.get("ok") else "failed"
        step["result"] = result
        results.append(result)
    task.status = "done"
    task.steps_json = json.dumps(steps, ensure_ascii=False)
    if results:
        ok_count = sum(1 for r in results if r.get("ok"))
        task.reply = f"已确认执行 {len(results)} 项操作，成功 {ok_count} 项。" + "; ".join(
            json.dumps(r, ensure_ascii=False)[:200] for r in results
        )
    await db.commit()
    return task
