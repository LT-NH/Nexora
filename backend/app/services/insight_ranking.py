"""把「一堆建议」收敛成「今天做这一件」。

## 为什么需要这个模块

实测：单个工作空间堆了 61 条 AI 建议（同类问题 23 条），全部平铺、按时间排序，
120 条 pending / 5 条执行 / 4 条有反馈 —— 96% 没有任何后续。

问题不在建议太少，而在于 **AI 没替用户做取舍**：它把「发现了 61 个问题」这件事
原样倒给用户，让用户自己去判断哪个重要。而判断重要性本来就是 AI 该干的活。

所以这里做两件事：
1. **去重** —— 同一类问题、同一个商品只保留一条（`restock` 50 条里有大量重复项）
2. **排序** —— 按业务影响力排出「最该先做的那一条」

## 排序依据

`IMPACT_WEIGHT` 是业务影响权重，不是置信度。判断标准是「这件事不做会损失什么」：

  restock       断货 —— 正在流失的成交，损失已经发生且在累积
  refund_check  退款 —— 已损失的金额 + 客诉与差评风险
  clearance     积压 —— 占用资金与仓储，但不产生即时损失
  retention     流失 —— 概率性的未来收入，时间窗口较宽

最终分数 = 业务权重 × 置信度。用乘法而非加法，是为了让「业务上重要但置信度低」
不至于压过「业务上次要但置信度极高」—— 前者应该退回让 AI 继续观察。

## 已知局限

这里排的是**相对优先级**，不是金额。真正的「影响 ¥X」需要结合商品售价、
日均销量、毛利来算，属于后续升级；当前先用可解释的启发式把取舍做出来。
"""

from typing import Any, Iterable, Sequence

# 业务影响权重 —— 见模块 docstring 的判断依据
IMPACT_WEIGHT: dict[str, float] = {
    "restock": 1.00,
    "refund_check": 0.85,
    "clearance": 0.60,
    "retention": 0.50,
    "price_adjust": 0.45,
    "keep": 0.10,
}

# 未知类型的兜底权重：给一个低于所有已知类型的值，
# 避免新类型（尚未评估业务影响）意外霸占榜首。
DEFAULT_WEIGHT = 0.30


def impact_score(row: Any) -> float:
    """单条建议的影响力分数 = 业务权重 × 置信度。

    置信度缺失时按 0.5 处理（不假设它更可信，也不完全否定）。
    """
    weight = IMPACT_WEIGHT.get(getattr(row, "action_type", None) or "", DEFAULT_WEIGHT)
    confidence = getattr(row, "confidence", None)
    conf = float(confidence) if isinstance(confidence, (int, float)) else 0.5
    return weight * max(0.0, min(1.0, conf))


def _dedupe_key(row: Any) -> tuple[str, str]:
    """去重键：同一动作 + 同一对象。

    同一个商品同时出现在 `立即补货 Gift Card` 和 `紧急补货 6 款零库存商品` 里，
    对用户来说是**一件事**，不该占两行。

    用 `action_type` 而不是 `insight_type` 作为键的一部分：前者决定「要做什么」，
    才是「是不是同一件事」的判据。用 insight_type 会把 restock 和 clearance
    这两类不同动作误合并成一条（同一个商品既可能待补货也可能待清仓）。
    """
    params = getattr(row, "action_params", None) or {}
    target = ""
    if isinstance(params, dict):
        # 不同 action_type 用的键名不同，按优先级取第一个非空值
        for key in ("product_id", "customer_id", "customer", "sku"):
            value = params.get(key)
            if value:
                target = str(value)
                break
    action = getattr(row, "action_type", None) or getattr(row, "insight_type", None) or ""
    return (str(action), target)


def rank_insights(rows: Iterable[Any]) -> list[Any]:
    """去重 + 按影响力降序返回。

    同组内保留分数最高的一条；分数相同时保留 suggested_at 较新的那条
    （用 id 做最终兜底以保证排序稳定）。
    """
    best: dict[tuple[str, str], Any] = {}
    for row in rows:
        key = _dedupe_key(row)
        current = best.get(key)
        if current is None:
            best[key] = row
            continue
        if impact_score(row) > impact_score(current):
            best[key] = row
            continue
        if impact_score(row) == impact_score(current):
            # 稳定排序：新的一条优先（suggested_at 通常是 datetime）
            new_at = getattr(row, "suggested_at", None)
            old_at = getattr(current, "suggested_at", None)
            if new_at and old_at and new_at > old_at:
                best[key] = row

    return sorted(
        best.values(),
        key=lambda r: (impact_score(r), getattr(r, "suggested_at", None) or ""),
        reverse=True,
    )


def pick_top(rows: Sequence[Any] | Iterable[Any]) -> tuple[Any | None, int]:
    """返回 (最该做的那一条, 被折叠的条数)。

    没有建议时返回 (None, 0)。
    """
    ranked = rank_insights(rows)
    if not ranked:
        return None, 0
    return ranked[0], len(ranked) - 1
