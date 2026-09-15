"""Nexora Agent Autonomy Policy — 动作风险分级与自主执行策略.

把"Agent 能做什么"从代码里的 if/else 提升为**显式策略表**：
每个动作有风险等级、是否可自动执行、是否有副作用、每日执行上限。

这层是 Agent"自主"与"越权"之间的闸门：
  · low    —— 只读/幂等/可撤销（补货引导、退款核查）→ 直接执行
  · medium —— 有真实副作用但可逆（建券、清仓降价）→ 首次进审批，策略信任度足够后自动执行
  · high   —— 直接改价/删除等不可逆且影响营收 → 永远需人工确认

策略可在 workspace 级覆盖（见 AgentPolicyOverride 概念，当前用默认表 + 日限额实现）。
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta

# ── 风险等级 ──────────────────────────────────────────────────────────────
RISK_LOW = "low"
RISK_MEDIUM = "medium"
RISK_HIGH = "high"

# 风险等级排序（用于比较/门控）
_RISK_ORDER = {RISK_LOW: 0, RISK_MEDIUM: 1, RISK_HIGH: 2}


@dataclass(frozen=True)
class ActionPolicy:
    """单个动作的自主执行策略。"""

    action_type: str
    risk: str
    #: Agent 在无人值守时是否可以直接执行
    auto_allowed: bool
    #: 该动作是否有真实副作用（写库 / 同步外部平台）
    side_effect: bool
    #: 每日自动执行次数上限（None = 不限，但会被全局上限约束）
    daily_cap: int | None
    #: 人类可读说明（用于前端展示"Agent 为什么能做这个"）
    note: str


# ── 策略表（唯一事实来源）──────────────────────────────────────────────────
ACTION_POLICIES: dict[str, ActionPolicy] = {
    "refund_check": ActionPolicy(
        action_type="refund_check",
        risk=RISK_LOW,
        auto_allowed=True,
        side_effect=False,
        daily_cap=None,
        note="只读分析：定位高退款商品并生成核查清单，不改动任何数据。",
    ),
    "restock": ActionPolicy(
        action_type="restock",
        risk=RISK_LOW,
        auto_allowed=True,
        side_effect=False,
        daily_cap=None,
        note="只读引导：生成补货建议清单，实际补货仍由店主在商品页确认。",
    ),
    "create_coupon": ActionPolicy(
        action_type="create_coupon",
        risk=RISK_MEDIUM,
        auto_allowed=True,
        side_effect=True,
        daily_cap=2,
        note="可逆副作用：生成满减券并同步 Shopify，过期即失效，可手动停用。",
    ),
    "clearance": ActionPolicy(
        action_type="clearance",
        risk=RISK_MEDIUM,
        auto_allowed=True,
        side_effect=True,
        daily_cap=3,
        note="可逆副作用：滞销品降价 15% 清仓，价格可随时调回。",
    ),
    "price_adjust": ActionPolicy(
        action_type="price_adjust",
        risk=RISK_HIGH,
        auto_allowed=False,
        side_effect=True,
        daily_cap=0,
        note="不可逆影响营收：直接改动售价并同步线上店铺，必须人工确认。",
    ),
    "keep": ActionPolicy(
        action_type="keep",
        risk=RISK_LOW,
        auto_allowed=False,
        side_effect=False,
        daily_cap=0,
        note="无动作：Agent 判断当前无需干预。",
    ),
}

#: 兜底策略：未知动作一律视为高风险且不可自动执行
_FALLBACK_POLICY = ActionPolicy(
    action_type="unknown",
    risk=RISK_HIGH,
    auto_allowed=False,
    side_effect=True,
    daily_cap=0,
    note="未知动作，默认禁止自动执行。",
)

#: 单次巡店允许自动执行的动作总数上限（防止 Agent 一次做太多）
MAX_AUTO_ACTIONS_PER_RUN = 4


def get_policy(action_type: str) -> ActionPolicy:
    """取动作策略；未知动作返回最保守的兜底策略。"""
    return ACTION_POLICIES.get(action_type, _FALLBACK_POLICY)


def risk_rank(risk: str) -> int:
    """风险等级 → 可比较的序号。"""
    return _RISK_ORDER.get(risk, 99)


def can_auto_execute(action_type: str) -> bool:
    """该动作是否允许 Agent 无人值守直接执行。"""
    return get_policy(action_type).auto_allowed


def describe_policy_table() -> list[dict]:
    """策略表转为可序列化结构（供前端"Agent 权限"页展示）。"""
    out = []
    for p in ACTION_POLICIES.values():
        out.append({
            "action_type": p.action_type,
            "risk": p.risk,
            "auto_allowed": p.auto_allowed,
            "side_effect": p.side_effect,
            "daily_cap": p.daily_cap,
            "note": p.note,
        })
    out.sort(key=lambda x: risk_rank(x["risk"]))
    return out


def split_plan_by_risk(plan: list[dict]) -> tuple[list[dict], list[dict]]:
    """把 Agent 计划按策略表切成 (可自主执行, 需人工确认) 两组。

    注意：以**策略表**为准，而非模型自报的 risk 字段——
    模型可能误判风险等级，权限判断绝不能交给模型。
    """
    auto_items: list[dict] = []
    confirm_items: list[dict] = []
    for item in plan:
        action = str(item.get("action_type") or "keep").lower()
        policy = get_policy(action)
        enriched = {**item, "policy_risk": policy.risk, "auto_allowed": policy.auto_allowed}
        if policy.auto_allowed and action != "keep":
            auto_items.append(enriched)
        elif action != "keep":
            confirm_items.append(enriched)
    return auto_items, confirm_items


def auto_exec_budget(action_type: str, executed_today: int) -> tuple[bool, str]:
    """检查该动作今日自动执行额度是否还有余量。

    executed_today: 今日已自动执行的同动作次数（调用方查库提供）。
    返回 (是否可执行, 拒绝原因)。
    """
    policy = get_policy(action_type)
    if not policy.auto_allowed:
        return False, f"动作 {action_type} 不在自主执行白名单内"
    cap = policy.daily_cap
    if cap is None:
        return True, ""
    if cap <= 0:
        return False, f"动作 {action_type} 每日自主执行上限为 {cap}（已禁用）"
    if executed_today >= cap:
        return False, f"动作 {action_type} 今日自主执行已达上限 {cap} 次"
    return True, ""


async def count_auto_executed_today(db, workspace_id: str, action_type: str) -> int:
    """统计今日该 workspace 该动作已被 Agent 自主执行成功的次数。"""
    from sqlalchemy import func, select

    from app.models.agent_experience import AgentExperience

    since = datetime.utcnow() - timedelta(hours=24)
    row = (
        await db.execute(
            select(func.count(AgentExperience.id)).where(
                AgentExperience.workspace_id == workspace_id,
                AgentExperience.action_type == action_type,
                AgentExperience.insight_type == "agent_auto",
                AgentExperience.created_at >= since,
            )
        )
    ).scalar_one()
    return int(row or 0)
