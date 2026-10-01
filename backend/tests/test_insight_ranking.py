"""insight_ranking 单元测试。

这层是「把 61 条收敛成 1 条」的业务判断，直接决定用户打开产品第一眼看到什么，
因此行为必须有测试锁定。
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta

import pytest

from app.services.insight_ranking import (
    DEFAULT_WEIGHT,
    IMPACT_WEIGHT,
    impact_score,
    pick_top,
    rank_insights,
)


@dataclass
class FakeInsight:
    """只带排序所需字段的替身，避免测试依赖完整 ORM 模型。"""

    insight_type: str = "stockout"
    action_type: str = "restock"
    confidence: float | None = 0.9
    action_params: dict = field(default_factory=dict)
    suggested_at: datetime = field(default_factory=datetime.utcnow)


def test_impact_score_is_weight_times_confidence():
    row = FakeInsight(action_type="restock", confidence=0.8)
    assert impact_score(row) == pytest.approx(IMPACT_WEIGHT["restock"] * 0.8)


def test_stockout_outranks_clearance_even_with_lower_confidence():
    """断货（正在流失成交）应压过积压（占用资金），即便后者置信度更高。"""
    stockout = FakeInsight(action_type="restock", confidence=0.70)
    clearance = FakeInsight(action_type="clearance", confidence=0.99)
    top, hidden = pick_top([clearance, stockout])
    assert top is stockout
    assert hidden == 1


def test_deduplicates_same_type_and_product():
    """同一商品出现在多条建议里，对用户来说是同一件事。"""
    pid = "p-1"
    rows = [
        FakeInsight(action_type="restock", confidence=0.98, action_params={"product_id": pid}),
        FakeInsight(action_type="restock", confidence=0.92, action_params={"product_id": pid}),
        FakeInsight(action_type="restock", confidence=0.88, action_params={"product_id": pid}),
    ]
    ranked = rank_insights(rows)
    assert len(ranked) == 1
    # 保留同组内分数最高的那条
    assert ranked[0].confidence == 0.98


def test_keeps_distinct_products_separate():
    rows = [
        FakeInsight(action_type="restock", confidence=0.9, action_params={"product_id": "a"}),
        FakeInsight(action_type="restock", confidence=0.9, action_params={"product_id": "b"}),
    ]
    assert len(rank_insights(rows)) == 2


def test_rows_without_product_id_are_treated_as_one_group():
    """没有对象标识的同类建议（如 refund_check 的 action_params 为空）视为一组。"""
    rows = [
        FakeInsight(insight_type="refund", action_type="refund_check", confidence=0.9, action_params={}),
        FakeInsight(insight_type="refund", action_type="refund_check", confidence=0.8, action_params={}),
    ]
    assert len(rank_insights(rows)) == 1


def test_unknown_action_type_does_not_top_the_list():
    """新类型尚未评估业务影响，不该霸占榜首。"""
    known = FakeInsight(action_type="clearance", confidence=0.70)
    unknown = FakeInsight(action_type="brand_new_thing", confidence=1.0)
    assert rank_insights([unknown, known])[0] is known

    # 兜底权重应低于所有「需要行动」的类型。
    # keep 是「无需行动」，本身就该是最低的，不参与这个比较。
    actionable = {k: w for k, w in IMPACT_WEIGHT.items() if k != "keep"}
    assert DEFAULT_WEIGHT < min(actionable.values())


def test_missing_confidence_falls_back_to_half():
    row = FakeInsight(action_type="restock", confidence=None)
    assert impact_score(row) == pytest.approx(IMPACT_WEIGHT["restock"] * 0.5)


def test_empty_input():
    assert pick_top([]) == (None, 0)


def test_hidden_count_excludes_the_top_one():
    rows = [
        FakeInsight(action_type="restock", confidence=0.9, action_params={"product_id": str(i)})
        for i in range(5)
    ]
    top, hidden = pick_top(rows)
    assert top is not None
    assert hidden == 4


def test_tie_broken_by_recency():
    old = FakeInsight(
        action_type="restock",
        confidence=0.9,
        action_params={"product_id": "x"},
        suggested_at=datetime.utcnow() - timedelta(days=2),
    )
    new = FakeInsight(
        action_type="restock",
        confidence=0.9,
        action_params={"product_id": "x"},
        suggested_at=datetime.utcnow(),
    )
    assert rank_insights([old, new])[0] is new
