"""Nexora - AI Decision Loop API.

闭环四段：主动摘要 → 点击执行 → 回访验证（命中率）→ 前置预测。

职责切分（v7）：决策助手 = 行动层（开处方）。消费健康引擎（health_snapshots）
已完成的诊断结论，生成可执行处方；每条处方通过 snapshot_id 溯源到具体体检，
与健康引擎的"诊断层"彻底错开——同一问题不再被两套规则重复发现。

  体检(health_snapshots) → 诊断 → 处方(ai_insights) → 执行 → 经验(agent_experiences)
"""
import json
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import _require_member
from app.database import get_db
from app.middleware.auth import AuthContext, get_principal
from app.models.ai_insight import AiInsight
from app.models.agent_experience import AgentExperience
from app.models.customer import Customer
from app.models.health_snapshot import HealthSnapshot
from app.models.order import Order, OrderItem
from app.models.product import Product
from app.models.workspace import Workspace, WorkspaceRole
from app.services import metrics
from app.services.insight_ranking import rank_insights
from app.utils.logging import get_logger
from app.utils.memory_cache import cache

logger = get_logger(__name__)

router = APIRouter(prefix="/workspaces/{slug}/ai", tags=["AI Decision Loop"])

# 今日摘要缓存时长（秒）：挡掉「页面重载 / 执行后 reload / 反馈后 reload」引起的
# 重复千问调用；执行与反馈端点会主动作废缓存，不会让用户看到过期的待办状态。
AI_SUMMARY_CACHE_TTL = 180

# ── AI 能力套餐档位门控 ────────────────────────────────────────────────
# 能力矩阵（见 app/main.py _PLAN_FEATURES）：
#   free       = 仅 ai_health（六维健康体检/AI 总结）
#   pro        = + ai_advisor（决策助手/洞察/问答/周报/定价/销售分析/经验库）
#   enterprise = + store_sentinel（自主巡店 Agent，见 store_agent.py 门控）
# 未订阅 / 非对应档位 → 403 并提示升级（超管 is_superadmin 恒放行）。


async def _ensure_ai_tier(db: AsyncSession, principal, workspace_id: str, need: str = "pro") -> None:
    """校验工作空间套餐档位；不达标抛 403。need: pro | enterprise。

    超管与周期过期都交由 billing.resolve_workspace_tier 统一处理：
    超管直通 enterprise，过期订阅不计入档位（此前 trial_ends_at 从未被读取，
    导致试用到期后仍可无限期使用付费功能）。
    """
    try:
        from app.api.billing import resolve_workspace_tier
        tier = await resolve_workspace_tier(db, workspace_id, principal)
        _ok = (need == "pro" and tier in ("pro", "enterprise")) or (need == "enterprise" and tier == "enterprise")
        if not _ok:
            raise HTTPException(
                status_code=403,
                detail=("该 AI 功能为 Pro 及以上套餐专属，请前往「计费与方案」升级解锁"
                        if need == "pro"
                        else "自主巡店 Agent 为 Enterprise 套餐专属，请升级后使用"),
            )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        # fail-closed：门控查询异常时按最低档处理，与 store_agent.py 的策略对齐。
        # 原实现是「保守放行」—— 订阅表迁移失败 / 查询超时 / 字段缺失时，
        # 全部 Pro 专属端点会无条件开放。计费系统故障不该变成免费赠送。
        logger.warning("AI 套餐门控查询失败，按最低档拒绝: %s", exc)
        raise HTTPException(
            status_code=403,
            detail="订阅状态暂时无法确认，请稍后重试；如持续失败请联系支持。",
        ) from exc



def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


async def _compute_indicators(db: AsyncSession, ws_id: str):
    """采集决策所需的真实业务指标（与健康引擎同源）。

    口径统一在 app/services/metrics.py：订单量只算有效订单（排除取消/退款单），
    退款率分母用有效订单。此前这里的订单数不过滤、退款率分母用全部订单，
    与体检卡上的同一指标对不上（用户会看到两个都自称真实的数字）。
    顺带把原先 3 次 count 查询合并为 2 次聚合（少一次数据库往返）。
    """
    now = metrics.utcnow()
    products = (await db.execute(select(Product).where(Product.workspace_id == ws_id))).scalars().all()
    customers = (await db.execute(select(Customer).where(Customer.workspace_id == ws_id))).scalars().all()

    # 近 7 天有效订单数 → 换算日均销量（决定库存还能撑几天）
    counts7 = await metrics.order_counts(db, ws_id, days=7, now=now)
    daily_sales = metrics.daily_sales_per_product(counts7["valid_orders"], 7, len(products))

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

    # 退款率（近 30 天）：分子含部分退款，分母用有效订单 —— 与体检卡同口径
    counts30 = await metrics.order_counts(db, ws_id, days=30, now=now)
    refund_rate = metrics.refund_rate(counts30["refunded_orders"], counts30["valid_orders"])

    # 客户流失
    churn_risk: list[dict] = []
    for c in customers:
        if c.last_order_at is not None:
            days_since = (now - c.last_order_at.replace(tzinfo=None)).days
            if days_since > 30:
                churn_risk.append({
                    "customer_id": c.id,
                    "name": c.name or c.email or f"#{str(c.id)[:6]}",
                    "last_order_days": days_since,
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


async def _qwen_enhance(prompt: str) -> str | None:
    """直调千问（30s 超时、中文、提取 content），失败返回 None。"""
    import httpx as _httpx
    try:
        from app.services.ai import _get_qwen_config
        key, model, base_url = _get_qwen_config()
        if not key:
            return None
        async with _httpx.AsyncClient(timeout=30, trust_env=False) as _client:
            _resp = await _client.post(
                f"{base_url}/chat/completions",
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "你是店主信任的电商经营搭档，全程使用中文，只返回要求的内容。"
                                "面向不懂运营术语的小店主说人话：不要用「环比、同比、SKU、归因、置信度、"
                                "转化率、履约、动销、客单价、GMV、ROI、处方、闭环」这类词，"
                                "改用日常说法（比上一周多了多少 / 哪几款商品 / 钱花在哪了 / 每卖 100 元赚多少）。"
                            ),
                        },
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.5,
                    "max_tokens": 1500,
                },
            )
        if _resp.status_code != 200:
            return None
        return _resp.json()["choices"][0]["message"]["content"]
    except Exception:
        return None


def _build_insights(ws_id: str, ind: dict) -> list[dict]:
    """基于指标生成今日 3 条决策结论（主动推送）。

    文案要求：说人话 —— 面向不懂运营术语的小店主，避开「SKU / 动销 / 断货流失 /
    阈值 / 排查」这类词，换成「款商品 / 卖不动 / 卖断货 / 警戒线 / 查一下」。
    这里是 AI 不可用时的兜底，一定会被用户看到，所以不能只在 prompt 里做约束。
    """
    out: list[dict] = []

    # 1) 库存：断货风险最高的一条
    if ind["stockout_risk"]:
        s = sorted(ind["stockout_risk"], key=lambda x: x["days"])[0]
        out.append({
            "insight_type": "stockout",
            "title": f"{s['name']} 快卖断了，今天补货",
            "detail": f"现在只剩 {s['stock']} 件，按最近的卖货速度还能撑 {s['days']} 天（少于 14 天就该补了）。今天就安排补货，别等卖光才想起来。",
            "confidence": round(_clamp(0.95 - min(s["days"], 14) * 0.03), 2),
            "action_type": "restock",
            "action_params": json.dumps({"product_id": s["product_id"]}),
        })

    # 2) 退款率偏高 → 排查
    if ind["refund_rate"] >= 8 and len(out) < 3:
        out.append({
            "insight_type": "refund",
            "title": "最近一个月退货有点多，查一下",
            "detail": f"最近 30 天每 100 单里有 {ind['refund_rate']:.1f} 单退款（超过 8 单就该留意了）。先翻翻退得最多的那几单，多半是物流慢或者和描述不一样。",
            "confidence": round(_clamp(0.9 - (ind["refund_rate"] - 8) * 0.02), 2),
            "action_type": "refund_check",
            "action_params": "{}",
        })

    # 3) 滞销 → 清仓/停售
    if ind["overstock"] and len(out) < 3:
        o = sorted(ind["overstock"], key=lambda x: -x["days"])[0]
        out.append({
            "insight_type": "overstock",
            "title": f"{o['name']} 压货了，考虑降价清一批",
            "detail": f"仓库里还有 {o['stock']} 件，按最近的卖货速度要 {o['days']} 天才卖得完（超过 120 天就算压货）。降 15% 先清一批，把钱腾出来进新品。",
            "confidence": round(_clamp(0.9 - min(o["days"] - 120, 100) * 0.002), 2),
            "action_type": "clearance",
            "action_params": json.dumps({"product_id": o["product_id"]}),
        })

    # 4) 客户流失预警
    if ind["churn_risk"] and len(out) < 3:
        c = sorted(ind["churn_risk"], key=lambda x: -x["last_order_days"])[0]
        out.append({
            "insight_type": "churn",
            "title": f"老客户 {c['name']} 很久没来了，发张券试试",
            "detail": f"{c['name']} 已经 {c['last_order_days']} 天没下单（之前买过 {c['total_orders']} 次）。发一张满减券提醒一下，老客户回头比拉新便宜得多。",
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
    refresh: int = Query(0, description="传 1 强制重新生成（跳过缓存）"),
) -> dict:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    await _ensure_ai_tier(db, principal, workspace.id, "pro")

    # 缓存：这个接口里有一次 1500 token 的千问调用，而前端在「页面重载 / 每次执行 /
    # 每次反馈」后都会重新拉它。3 分钟内直接复用（执行与反馈端点会主动作废缓存，
    # 所以用户不会看到过期的待办状态）。
    ai_cache_key = f"ai-daily:{workspace.id}"
    if not refresh:
        cached = cache.get(ai_cache_key)
        if cached is not None:
            return cached

    ind = await _compute_indicators(db, workspace.id)

    # ── 消费健康引擎诊断（单向流：体检 → 诊断 → 处方）────────────────────
    # 决策助手不重复诊断，而是读取健康引擎最近一次体检结论作为处方依据，
    # 并通过 snapshot_id 把每条处方溯源到该次体检。
    latest_snap = (
        await db.execute(
            select(HealthSnapshot)
            .where(HealthSnapshot.workspace_id == workspace.id)
            .order_by(HealthSnapshot.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    diagnosis: dict | None = None
    if latest_snap is not None:
        try:
            _dims = json.loads(latest_snap.dimensions)
        except Exception:
            _dims = []
        _weakest = min(_dims, key=lambda d: d.get("score", 100)) if _dims else None
        diagnosis = {
            "snapshot_id": latest_snap.id,
            "score": latest_snap.score,
            "level": latest_snap.level,
            "weakest": (
                {"name": _weakest.get("name"), "score": _weakest.get("score")}
                if _weakest else None
            ),
            "computed_at": latest_snap.created_at.isoformat() if latest_snap.created_at else None,
        }

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

    # ────────────────────────────────────────────────────────────────
    # 职能切分（v7）：决策助手 = 处方层。
    # 健康引擎已完成诊断（体检快照），千问消费诊断结论【开可执行处方】：
    # 聚焦"怎么做"（动作 + 对象 + 预期效果），不复述诊断、不重复发现问题。
    # 千问不可用/解析失败时降级到规则模板 _build_insights 兜底，服务不中断。
    # ────────────────────────────────────────────────────────────────
    _diag_text = ""
    if diagnosis:
        _w = diagnosis.get("weakest") or {}
        _diag_text = (
            "\n系统已完成体检（结论如下，你不用重复分析）：综合分 "
            f"{diagnosis['score']:.0f}/100（{diagnosis['level']}）"
            + (f"，最弱的一项是「{_w.get('name')}」{_w.get('score'):.0f} 分" if _w.get("name") else "")
            + "。你的任务：针对体检结论和下面的数据，给出今天最值得做的 2~3 件事，"
            "重点是「该怎么做」（做什么 / 对谁做 / 做完会怎样），不要复述体检结论。\n"
        )
    try:
        from app.services.ai import _extract_json
        _snapshot = {
            "refund_rate_30d": round(ind["refund_rate"], 1),
            "stockout_risk": [
                {"name": s["name"], "days_left": s["days"], "stock": s["stock"], "product_id": s["product_id"]}
                for s in ind["stockout_risk"][:6]
            ],
            "overstock": [
                {"name": o["name"], "days_to_sell": o["days"], "stock": o["stock"], "product_id": o["product_id"]}
                for o in ind["overstock"][:6]
            ],
            "churn_risk": [
                {"name": c["name"], "inactive_days": c["last_order_days"], "orders": c["total_orders"]}
                for c in ind["churn_risk"][:6]
            ],
        }
        # 经验库注入：从 agent_experiences 检索最近闭环经验（含真实结果与教训），
        # 让 AI 参考"上次同样动作到底有没有用"再决定本次建议
        _exp_rows = (
            await db.execute(
                select(AgentExperience).where(
                    AgentExperience.workspace_id == workspace.id,
                ).order_by(AgentExperience.feedback_at.desc().nulls_last()).limit(4)
            )
        ).scalars().all()
        _exp_text = ""
        if _exp_rows:
            _parts = []
            for _e in _exp_rows:
                _fb = "上次这么做有效果" if _e.outcome == "improved" else (
                    "上次这么做没效果" if _e.outcome == "not_improved" else "效果待观察"
                )
                _delta = ""
                if _e.result_before is not None and _e.result_after is not None:
                    _d = round(float(_e.result_after) - float(_e.result_before), 2)
                    _delta = f"，相关数字 {_e.result_before}→{_e.result_after}（{_d:+.2f}）"
                _lesson = f"。当时的教训：{_e.lesson}" if _e.lesson else ""
                _parts.append(f"「{_e.title}」[{_e.action_type}] 执行后：{_fb}{_delta}{_lesson}")
            _exp_text = "\n以前做过类似事情的结果（供你参考真实效果，别重复无效的做法）：\n- " + "\n- ".join(_parts)
        _prompt = (
            "你是店主信得过的经营助手。下面是系统从真实数据库取到的店铺数据（JSON）。\n"
            + _diag_text
            + "请给出【今天最值得做的 2~3 件事】。\n"
            "要求：每件事都必须是具体动作（做什么 + 对谁做 + 做完会怎样），不能只是描述现象；"
            "标题和内容都要落到「该做什么」上。\n"
            "【说人话】读者是不懂运营术语的小店主：不要出现「环比、同比、SKU、归因、置信度、转化率、"
            "履约、动销、客单价、GMV、ROI、处方、主指标」这类词，同一件事换日常说法"
            "（「6 个 SKU 滞销」→「6 款商品卖不动」）。\n"
            "每条输出字段：\n"
            "  insight_type ∈ stockout|refund|overstock|churn|profit|growth（问题类型）\n"
            "  action_type ∈ restock|clearance|retention|refund_check|price_adjust|keep（动作类型，keep=只观察不用动手）\n"
            "  title：≤26 字、动词开头、直接有力（如「今天补货 XX：还能撑 9 天」）\n"
            "  detail：≤100 字，数据证据 + 具体动作 + 预期效果\n"
            "  confidence：0.3~0.99 这件事值得做的把握\n"
            "  params：{product_id?} 或 {customer?}，尽量引用快照里的具体商品/客户\n"
            "只输出 JSON 数组，不要任何解释文字。\n快照：" + json.dumps(_snapshot, ensure_ascii=False)
            + _exp_text
        )
        _raw = await _qwen_enhance(_prompt)
        _parsed = _extract_json(_raw) if _raw else None
        _valid_types = {"stockout", "refund", "overstock", "churn", "profit", "growth"}
        _valid_actions = {"restock", "clearance", "retention", "refund_check", "price_adjust", "keep"}
        if isinstance(_parsed, list):
            for _it in _parsed:
                if not isinstance(_it, dict):
                    continue
                _itype = str(_it.get("insight_type", "")).lower()
                if _itype not in _valid_types:
                    continue
                if not _it.get("title") or not _it.get("detail"):
                    continue
                _atype = str(_it.get("action_type", "keep")).lower()
                _params = _it.get("params")
                new_insights.append({
                    "insight_type": _itype,
                    "action_type": _atype if _atype in _valid_actions else "keep",
                    "title": str(_it["title"])[:60],
                    "detail": str(_it["detail"])[:220],
                    "confidence": round(_clamp(float(_it.get("confidence", 0.7)), 0.3, 0.99), 2),
                    "action_params": json.dumps(_params if isinstance(_params, dict) else {}, ensure_ascii=False),
                })
    except Exception:
        pass
    # 降级：千问不可用/解析失败 → 规则模板兜底（保证每日摘要总有产出）
    if not new_insights:
        new_insights = _build_insights(workspace.id, ind)

    # 落库（AI 洞察去重：24h 内同类不重复）
    _stored: list[dict] = []
    for ins in new_insights[:3]:
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
            snapshot_id=diagnosis["snapshot_id"] if diagnosis else None,
        )
        db.add(row)
        await db.flush()  # 立即生成 id，前端拿到即可执行
        existing_types.add(ins["insight_type"])
        ins["id"] = row.id
        ins["status"] = "pending"
        ins["snapshot_id"] = row.snapshot_id
        _stored.append(ins)

    await db.commit()

    # 今日可见：本次生成的 + 24h 内已有未完成的
    visible = _stored + [
        {
            "id": e.id, "insight_type": e.insight_type, "title": e.title, "detail": e.detail,
            "confidence": e.confidence, "action_type": e.action_type, "action_params": e.action_params,
            "status": e.status, "snapshot_id": e.snapshot_id,
        }
        for e in existing
        if e.status in ("pending", "executed")
    ]

    result = {
        "date": ind["now"].date().isoformat(),
        "insights": visible[:3],
        "diagnosis": diagnosis,
        "metrics": {
            "refund_rate": round(ind["refund_rate"], 1),
            "stockout_count": len(ind["stockout_risk"]),
            "overstock_count": len(ind["overstock"]),
            "churn_risk_count": len(ind["churn_risk"]),
        },
    }
    cache.set(ai_cache_key, result, ttl=AI_SUMMARY_CACHE_TTL)
    return result


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
    await _ensure_ai_tier(db, principal, workspace.id, "pro")
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
                "snapshot_id": r.snapshot_id,
            }
            for r in rows
        ],
        "total": len(rows),
    }


async def _metric_snapshot(db: AsyncSession, ws_id: str) -> dict:
    """执行/回访时的经营指标快照（轻量，供经验库记录 result_before/after）。"""
    ind = await _compute_indicators(db, ws_id)
    return {
        "refund_rate": round(ind["refund_rate"], 2),
        "stockout": len(ind["stockout_risk"]),
        "overstock": len(ind["overstock"]),
        "churn": len(ind["churn_risk"]),
    }


def _primary_metric(action_type: str, snap: dict) -> float | None:
    """该建议针对的主要指标（用于前后对比，判断是否改善）。"""
    return {
        "refund_check": snap["refund_rate"],
        "restock": snap["stockout"],
        "clearance": snap["overstock"],
        "retention": snap["churn"],
    }.get(action_type)


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
        return "已帮你跳到补货：去「商品管理」把要补的数量填上就行。" if pid else "请选择要补货的商品。"

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
        return "已帮你跳到退款页：看看最近 30 天退款最多的那几单。"

    if action == "price_adjust":
        # AI 定价建议执行：真实调整本地商品价格（可配 Shopify 反向同步）
        pid = params.get("product_id")
        product = await db.get(Product, pid) if pid else None
        if product is None:
            return "商品不存在，无法执行定价调整。"
        old_price = float(product.price or 0)
        delta_pct = float(params.get("change_pct", params.get("discount_pct", -10)))
        new_price = round(old_price * (1 + delta_pct / 100.0), 2)
        if new_price <= 0:
            return "目标价格无效（≤0），未执行定价调整。"
        written = False
        # 仅降价场景反向同步 Shopify（其 API 语义为 discount_pct>0）
        if delta_pct < 0 and shopify_cfg and integ and product.sku and product.sku.startswith("shopify-"):
            try:
                written = await integ.update_product_price(shopify_cfg, product.sku[8:], discount_pct=abs(delta_pct))
            except Exception:
                written = False
        if written or shopify_cfg is None:
            product.price = new_price
            await db.commit()
            return f"已调整价格 {delta_pct:+.0f}%：¥{old_price:.2f} → ¥{new_price:.2f}" + ("（已同步 Shopify）" if written else "")
        return f"Shopify 写入失败，未调整价格（¥{old_price:.2f} 保持不变）"

    return "该动作已引导至对应页面处理。"


@router.post("/insights/{insight_id}/execute", summary="执行一条 AI 建议")
async def execute_insight(
    slug: str,
    insight_id: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)
    await _ensure_ai_tier(db, principal, workspace.id, "pro")
    ins = await db.get(AiInsight, insight_id)
    if ins is None or ins.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="建议不存在")

    message = await _execute_insight_action(db, workspace, ins, principal)
    ins.status = "executed"
    ins.executed_at = datetime.utcnow()
    # 经验库：执行前记录主要指标基线（供回访对比该建议是否真的改善）
    _metric_before = _primary_metric(ins.action_type, await _metric_snapshot(db, workspace.id))
    if _metric_before is not None:
        ins.result_before = _metric_before
    await db.commit()
    # 待办状态已变 → 作废今日摘要缓存，下次拉取重新生成（避免看到刚执行完的旧状态）
    cache.invalidate(f"ai-daily:{workspace.id}")
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
    await _ensure_ai_tier(db, principal, workspace.id, "pro")
    ins = await db.get(AiInsight, insight_id)
    if ins is None or ins.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="建议不存在")

    improved = bool(body.get("improved"))
    ins.feedback = "improved" if improved else "not_improved"
    ins.feedback_note = body.get("note")
    ins.feedback_at = datetime.utcnow()
    # 经验库：回访时记录执行后指标 → result_after 与 result_before 对比可得"改善幅度"
    _metric_after = _primary_metric(ins.action_type, await _metric_snapshot(db, workspace.id))
    if _metric_after is not None:
        ins.result_after = _metric_after

    # ── 经验库沉淀：走完闭环（executed + 回访）→ 写入 agent_experiences ──
    if ins.status == "executed":
        # SQLite 存 naive UTC —— executed_at 读回为 naive，统一用 naive 计算间隔
        _exec = ins.executed_at or datetime.utcnow()
        if _exec.tzinfo is not None:
            _exec = _exec.replace(tzinfo=None)
        _delta = max((datetime.utcnow() - _exec).days, 0)
        _feedback_now = datetime.utcnow()
        _lesson = None
        if improved and ins.result_before is not None and _metric_after is not None:
            _d = round(float(_metric_after) - float(ins.result_before), 2)
            _lesson = (
                f"做完后相关数字从 {ins.result_before} 变成 {_metric_after}（{_d:+.2f}），确实有效果。"
                "下次遇到同类问题可以优先这么做。"
            )
        elif ins.feedback == "not_improved":
            _lesson = "试过了没起效果——同类问题下次换个做法（比如换个渠道或换个动作）。"
        db.add(AgentExperience(
            workspace_id=workspace.id,
            insight_id=ins.id,
            insight_type=ins.insight_type,
            action_type=ins.action_type,
            title=ins.title,
            context=ins.action_params,
            result_before=ins.result_before,
            result_after=_metric_after,
            outcome=ins.feedback,
            lesson=_lesson,
            delta_days=_delta,
            feedback_at=_feedback_now,
        ))

    await db.commit()
    # 反馈会写经验、可能改变待办展示 → 一并作废摘要缓存
    cache.invalidate(f"ai-daily:{workspace.id}")
    return {"saved": True, "feedback": ins.feedback}


# ----------------------------------------------------------------------
# 3. 建议命中率（闭环指标）
# ----------------------------------------------------------------------

@router.get("/insights/top", summary="今天最该做的一件事（含可翻看的完整列表）")
async def top_insight(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 10,
) -> dict:
    """把所有待处理建议去重排序后返回，前端以「可翻看的卡片堆」呈现。

    背景：实测单个工作空间会堆 61 条建议（同类问题多达 23 条），全部平铺的结果是
    用户「连看的欲望都没有」—— 125 条建议里只有 5 条被执行、4 条有反馈。
    判断哪条最重要本就是 AI 该做的事，不该把取舍丢回给用户。

    返回**多条**而不是只返回第一条：用户仍然需要一个「翻一下看看还有什么」的出口，
    否则只是把信息藏起来。列表按影响力降序，默认取前 10 条 —— 再多就不会有人翻了。

    排序依据见 ``app.services.insight_ranking``。
    """
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    await _ensure_ai_tier(db, principal, workspace.id, "pro")

    rows = (
        await db.execute(
            select(AiInsight)
            .where(
                AiInsight.workspace_id == workspace.id,
                AiInsight.status == "pending",
            )
            .order_by(AiInsight.suggested_at.desc())
            .limit(200)
        )
    ).scalars().all()

    ranked_all = rank_insights(rows)
    ranked = ranked_all[: max(1, min(limit, 20))]

    return {
        "items": [
            {
                "id": r.id,
                "insight_type": r.insight_type,
                "title": r.title,
                "detail": r.detail,
                "confidence": r.confidence,
                "action_type": r.action_type,
                "action_params": r.action_params,
                "suggested_at": r.suggested_at.isoformat() if r.suggested_at else None,
            }
            for r in ranked
        ],
        # 去重后的待办条数（≠ items 长度：列表被 limit 截断时两者不同）
        "total_todos": len(ranked_all),
        # 去重前的原始建议条数，用于向用户交代「一堆建议被合并了多少」
        "total_pending": len(rows),
    }


@router.get("/insights/stats", summary="建议命中率统计")
async def insight_stats(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    await _ensure_ai_tier(db, principal, workspace.id, "pro")
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


@router.get("/experiences", summary="Agent 经验库列表（闭环沉淀的知识资产）")
async def list_experiences(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 50,
) -> dict:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    await _ensure_ai_tier(db, principal, workspace.id, "pro")
    rows = (
        await db.execute(
            select(AgentExperience)
            .where(AgentExperience.workspace_id == workspace.id)
            .order_by(AgentExperience.feedback_at.desc().nulls_last(), AgentExperience.created_at.desc())
            .limit(min(limit, 200))
        )
    ).scalars().all()
    total = (
        await db.execute(
            select(func.count(AgentExperience.id)).where(AgentExperience.workspace_id == workspace.id)
        )
    ).scalar_one()
    improved = sum(1 for r in rows if r.outcome == "improved")
    return {
        "total": total,
        "recent_improved": improved,
        "items": [
            {
                "id": r.id,
                "insight_type": r.insight_type,
                "action_type": r.action_type,
                "title": r.title,
                "result_before": r.result_before,
                "result_after": r.result_after,
                "outcome": r.outcome,
                "lesson": r.lesson,
                "delta_days": r.delta_days,
                "feedback_at": r.feedback_at.isoformat() if r.feedback_at else None,
            }
            for r in rows
        ],
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
    await _ensure_ai_tier(db, principal, workspace.id, "pro")
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
                    "customer_id": c.id,
                    "name": c.name or c.email or f"#{str(c.id)[:6]}",
                    "days_since_last": days, "total_orders": c.total_orders or 0,
                    "risk": "high" if days >= 45 else "medium",
                })
    churn_predictions = sorted(churn_predictions, key=lambda x: -x["days_since_last"])[:6]

    # 千问解读未来 7 天风险（失败则保留通用说明）
    forecast_note = "按最近 7 天的卖货速度和老客户回购间隔推算，仅供参考"
    try:
        _prompt = (
            "未来 7 天缺货风险商品：" + (json.dumps(stockout_predictions[:3], ensure_ascii=False) if stockout_predictions else "无")
            + "；客户流失风险：" + (json.dumps(churn_predictions[:3], ensure_ascii=False) if churn_predictions else "无")
            + "\n\n请用一句话解读最需要优先处理的风险（80 字内），直接输出。"
        )
        _raw = await _qwen_enhance(_prompt)
        if _raw:
            forecast_note = _raw.strip()
    except Exception:
        pass

    return {
        "generated_at": now.isoformat(),
        "stockout_7d": stockout_predictions,
        "churn_risk": churn_predictions,
        "note": forecast_note,
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
    """生成店铺数据快照文本（供千问回答使用）。

    口径与体检 / AI 助手统一（见 app/services/metrics.py）：只统计有效订单
    （排除取消与退款单），退款率分母用有效订单，低库存用每个商品自己的预警线。
    此前这里完全不过滤状态、阈值还硬编码成 5 —— AI 报出的营收比页面上的数字大，
    用户会直接看到「AI 说的和我看到的不一样」。
    """
    now = metrics.utcnow()
    since7 = metrics.since_days(7, now)
    since30 = metrics.since_days(30, now)
    _valid = Order.status.notin_(metrics.EXCLUDED_STATUSES)

    rev7 = (
        await db.execute(
            select(func.coalesce(func.sum(Order.total), 0)).where(
                Order.workspace_id == ws_id, Order.created_at >= since7, _valid,
            )
        )
    ).scalar_one() or 0
    rev30 = (
        await db.execute(
            select(func.coalesce(func.sum(Order.total), 0)).where(
                Order.workspace_id == ws_id, Order.created_at >= since30, _valid,
            )
        )
    ).scalar_one() or 0
    counts30 = await metrics.order_counts(db, ws_id, days=30, now=now)
    # 商品 Top5（按订单明细聚合，只算有效订单）
    top_rows = (
        await db.execute(
            select(OrderItem.product_name, func.sum(OrderItem.total_price))
            .join(Order, Order.id == OrderItem.order_id)
            .where(Order.workspace_id == ws_id, _valid)
            .group_by(OrderItem.product_name)
            .order_by(func.sum(OrderItem.total_price).desc())
            .limit(5)
        )
    ).all()
    top_text = "、".join(f"{r[0]}(¥{float(r[1] or 0):,.0f})" for r in top_rows) or "暂无"
    # 库存偏少：用商品自己的预警线（此前硬编码 stock <= 5，与商品管理页不一致）
    products = (await db.execute(select(Product).where(Product.workspace_id == ws_id))).scalars().all()
    low_stock = [
        p.name for p in products if (p.stock or 0) <= (p.low_stock_threshold or 10)
    ][:5]
    low_text = "、".join(low_stock) or "无"
    refund_rate = metrics.refund_rate(counts30["refunded_orders"], counts30["valid_orders"])

    return (
        f"店铺数据快照（真实数据）：近 7 天营收 ¥{float(rev7):,.0f}；"
        f"近 30 天营收 ¥{float(rev30):,.0f}、有效订单 {counts30['valid_orders']} 笔、"
        f"每 100 单退款 {refund_rate} 单。"
        f"卖得最好的商品：{top_text}。库存偏少的商品：{low_text}。"
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
    await _ensure_ai_tier(db, principal, workspace.id, "pro")
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
                "你是店主信得过的经营助手，基于店铺真实数据回答，中文回复，说人话。"
                "不要用「环比、同比、SKU、归因、置信度、转化率、履约、动销、客单价、GMV、ROI」"
                "这类词，换成日常说法（比上一周多了多少 / 哪几款商品 / 每卖 100 元赚多少）。"
                "先给结论，再给 1-2 条今天就能做的事。"
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


@router.get("/weekly-summary", summary="AI 周报摘要（千问真实分析）")
async def ai_weekly_summary(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    await _ensure_ai_tier(db, principal, workspace.id, "pro")
    snapshot = await _collect_biz_snapshot(db, workspace.id)

    # 千问基于真实数据生成周报摘要（趋势/亮点/风险/下周建议）
    summary = snapshot
    try:
        _raw = await _qwen_enhance(
            "以下是店铺本周真实数据快照：\n" + snapshot
            + "\n\n请生成一份简洁的周报摘要（120 字内），包含：本周经营表现、1 个亮点、1 个风险、1 条下周行动建议。直接输出正文，不要标题。"
        )
        if _raw:
            summary = _raw.strip()
    except Exception:
        pass

    return {
        "summary": summary,
        "report_data": {"source": "real_data+qwen", "generated_at": datetime.utcnow().isoformat()},
    }


@router.get("/pricing", summary="AI 定价建议（千问真实分析）")
async def ai_pricing(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    from app.services.ai import _get_qwen_config, _extract_json
    import httpx as _httpx

    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    await _ensure_ai_tier(db, principal, workspace.id, "pro")
    products = (
        await db.execute(
            select(Product).where(Product.workspace_id == workspace.id).order_by(Product.stock.asc()).limit(6)
        )
    ).scalars().all()
    items = []
    if not products:
        return {"items": []}

    # 商品数据快照（真实数据：名称/价格/成本/库存/销量）
    prod_snapshot = []
    for p in products:
        price = float(p.price or 0)
        prod_snapshot.append({
            "name": p.name,
            "price": price,
            "cost": float(p.cost_price or 0),
            "stock": p.stock or 0,
            "low_stock_threshold": p.low_stock_threshold or 10,
            "category": p.category or "",
        })

    # 千问逐个商品生成差异化定价建议（直调 API，30s 超时，避免 6s 超时降级）
    try:
        key, model, base_url = _get_qwen_config()
        if not key:
            raise RuntimeError("no qwen key")
        prompt = f"""你是资深电商定价分析师。请基于以下商品的真实数据，对每个商品给出定价建议。

商品数据（JSON）：
{json.dumps(prod_snapshot, ensure_ascii=False)}

规则背景：
- 库存 > 120 且成本 < 售价 60%：可降价清仓，建议具体降幅百分比
- 库存 <= 低库存阈值：不建议降价，建议提价或维持并补货
- 毛利（售价-成本）过低：建议提价
- 每个商品必须给出不同的、有依据的建议

返回严格 JSON 数组（不要 markdown），每个元素格式：
{{"name": "商品名", "suggestion": "建议动作，如：降价 15% 至 ¥399 清仓", "reason": "一句话依据，引用具体数据"}}
必须覆盖所有 {len(prod_snapshot)} 个商品。"""

        async with _httpx.AsyncClient(timeout=30, trust_env=False) as _client:
            _resp = await _client.post(
                f"{base_url}/chat/completions",
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": "你是电商定价分析师，只返回 JSON 数组，全程使用中文。"},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.4,
                    "max_tokens": 2000,
                },
            )
        if _resp.status_code == 200:
            _data = _resp.json()
            raw = _data["choices"][0]["message"]["content"]
        else:
            raw = ""
        ai_items = _extract_json(raw)
        if isinstance(ai_items, list):
            ai_map = {str(i.get("name", "")).strip(): i for i in ai_items if isinstance(i, dict)}
            for p in products:
                ai = ai_map.get(str(p.name).strip())
                items.append({
                    "product_id": p.id,
                    "name": p.name,
                    "current_price": float(p.price or 0),
                    "suggestion": (ai or {}).get("suggestion") or "维持现价",
                    "reason": (ai or {}).get("reason") or f"当前库存 {p.stock or 0} 件",
                })
    except Exception:
        # 降级：规则兜底（千问不可用时）
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
    await _ensure_ai_tier(db, principal, workspace.id, "pro")
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
    await _ensure_ai_tier(db, principal, workspace.id, "pro")
    period = str(body.get("period") or "30d")
    days_map = {"7d": 7, "30d": 30, "90d": 90}
    days = days_map.get(period, 30)
    since = metrics.since_days(days)

    # 只喂有效订单（排除取消/退款单）：含废单会让趋势和金额偏高，
    # 与页面上看到的数字对不上（口径见 app/services/metrics.py）
    rows = (
        await db.execute(
            select(Order.total, Order.created_at).where(
                Order.workspace_id == workspace.id,
                Order.created_at >= since,
                Order.status.notin_(metrics.EXCLUDED_STATUSES),
            )
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


# ----------------------------------------------------------------------
# 单品毛利归因（profit-thinking 核心：谁在赚钱、谁在偷利润）
# ----------------------------------------------------------------------

@router.get("/profit-by-product", summary="单品毛利归因榜（真实成本×销量）")
async def profit_by_product(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
    period: str = "30d",
    top: int = 5,
) -> dict:
    """按 SKU 归因真实毛利：营收 - (成本价 × 销量)，输出盈利 Top 与亏损 Bottom 榜。

    数据来源全部为真实订单行（order_items）与商品成本价（products.cost_price）；
    未录入成本的商品单独计数（不计入毛利率，避免假数据）。
    """
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    await _ensure_ai_tier(db, principal, workspace.id, "pro")

    days = {"7d": 7, "30d": 30, "90d": 90}.get(str(period), 30)
    since = datetime.utcnow() - timedelta(days=days)

    rows = (
        await db.execute(
            select(
                OrderItem.product_id,
                func.coalesce(Product.name, OrderItem.product_id).label("name"),
                Product.cost_price,
                func.sum(OrderItem.quantity).label("qty"),
                func.sum(OrderItem.total_price).label("revenue"),
            )
            .join(Order, OrderItem.order_id == Order.id)
            .join(Product, Product.id == OrderItem.product_id, isouter=True)
            .where(
                Order.workspace_id == workspace.id,
                Order.created_at >= since,
                Order.status.notin_(["cancelled", "refunded"]),
            )
            .group_by(OrderItem.product_id, Product.name, Product.cost_price)
        )
    ).all()

    items: list[dict] = []
    total_rev = 0.0
    total_cost = 0.0
    with_cost = 0
    without_cost = 0
    for r in rows:
        qty = float(r.qty or 0)
        rev = float(r.revenue or 0)
        total_rev += rev
        if r.cost_price is None:
            without_cost += 1
            items.append({
                "product_id": r.product_id, "name": (r.name or "")[:40], "qty": qty,
                "revenue": round(rev, 2), "cost": None, "gross": None, "margin_pct": None,
            })
            continue
        with_cost += 1
        cost = float(r.cost_price) * qty
        gross = rev - cost
        total_cost += cost
        items.append({
            "product_id": r.product_id, "name": (r.name or "")[:40], "qty": qty,
            "revenue": round(rev, 2), "cost": round(cost, 2), "gross": round(gross, 2),
            "margin_pct": round((gross / rev * 100), 1) if rev > 0 else None,
        })

    ranked = [i for i in items if i["margin_pct"] is not None]
    top_list = sorted(ranked, key=lambda x: (x["margin_pct"], x["gross"]), reverse=True)[:top]
    bottom_list = sorted(ranked, key=lambda x: (x["margin_pct"], x["gross"]))[:top]
    loss = [i for i in ranked if (i["gross"] or 0) < 0]

    gross_total = total_rev - total_cost
    advice: list[str] = []
    for i in loss[:3]:
        advice.append(
            f"「{i['name']}」在亏钱（每卖 100 元倒贴 {abs(i['margin_pct']):.0f} 元，共亏 ¥{abs(i['gross']):.0f}）：建议提价，或者先下架。"
        )
    low = [i for i in bottom_list if (i["margin_pct"] or 0) >= 0 and (i["margin_pct"] or 0) < 15][:2]
    for i in low:
        advice.append(f"「{i['name']}」每卖 100 元只赚 {i['margin_pct']:.0f} 元，偏薄，建议谈谈进货价或适当提价。")
    if top_list:
        best = top_list[0]
        advice.append(f"「{best['name']}」最赚钱（每卖 100 元赚 {best['margin_pct']:.0f} 元），可以多推、多备些货。")
    if without_cost > 0:
        advice.append(f"有 {without_cost} 款在卖的商品还没填成本价，算不出到底赚不赚 —— 补上成本价就能看到真实利润。")

    return {
        "period": period,
        "days": days,
        "summary": {
            "revenue": round(total_rev, 2),
            "cost": round(total_cost, 2),
            "gross_profit": round(gross_total, 2),
            "margin_pct": round(gross_total / total_rev * 100, 1) if total_rev > 0 else None,
            "sku_with_cost": with_cost,
            "sku_without_cost": without_cost,
            "loss_sku_count": len(loss),
            "loss_amount": round(sum(abs(i["gross"]) for i in loss), 2),
        },
        "top": top_list,
        "bottom": bottom_list,
        "advice": advice,
    }


# ----------------------------------------------------------------------
# Agent 对话式指挥（一句话 → 工具执行 → 审计）
# ----------------------------------------------------------------------

@router.post("/agent/command", summary="Agent 执行自然语言经营指令")
async def agent_command(
    slug: str,
    body: dict,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    from app.services.agent_orchestrator import run_command

    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)
    await _ensure_ai_tier(db, principal, workspace.id, "pro")
    instruction = str(body.get("instruction") or "").strip()
    if not instruction:
        raise HTTPException(status_code=400, detail="指令不能为空")
    auto = bool(body.get("auto", False))
    task = await run_command(db, workspace, principal.user_id, instruction, auto=auto)
    return {
        "task_id": task.id,
        "status": task.status,
        "steps": json.loads(task.steps_json or "[]"),
        "reply": task.reply,
    }


@router.get("/agent/tasks", summary="Agent 任务历史")
async def agent_tasks(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 10,
) -> dict:
    from sqlalchemy import select as _select
    from app.models.agent_task import AgentTask

    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    await _ensure_ai_tier(db, principal, workspace.id, "pro")
    rows = (
        await db.execute(
            _select(AgentTask)
            .where(AgentTask.workspace_id == workspace.id)
            .order_by(AgentTask.created_at.desc())
            .limit(min(limit, 50))
        )
    ).scalars().all()
    return {
        "tasks": [
            {
                "id": r.id,
                "instruction": r.instruction,
                "status": r.status,
                "steps": json.loads(r.steps_json or "[]"),
                "reply": r.reply,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    }


@router.post("/agent/tasks/{task_id}/confirm", summary="确认执行挂起的破坏性步骤")
async def agent_confirm(
    slug: str,
    task_id: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    from app.services.agent_orchestrator import confirm_pending

    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)
    await _ensure_ai_tier(db, principal, workspace.id, "pro")
    task = await confirm_pending(db, workspace, principal.user_id, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    return {"task_id": task.id, "status": task.status, "reply": task.reply}
