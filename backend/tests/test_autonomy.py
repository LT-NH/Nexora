"""Nexora - Agent Autonomy Policy 单元测试.

覆盖自主执行策略表的关键安全属性：
  1) 高风险动作（price_adjust）永不进入自动执行白名单——即使模型谎报 risk=low
  2) 中风险动作在日限额内可自动执行，超限被拒
  3) 未知动作走最保守兜底（禁止自动执行）
  4) 计划分级不采信模型自报的 risk 字段
"""

import pytest

from app.services.autonomy import (
    MAX_AUTO_ACTIONS_PER_RUN,
    RISK_HIGH,
    RISK_LOW,
    RISK_MEDIUM,
    auto_exec_budget,
    can_auto_execute,
    describe_policy_table,
    get_policy,
    risk_rank,
    split_plan_by_risk,
)


class TestPolicyTable:
    """策略表本身的完整性。"""

    def test_high_risk_actions_never_auto(self):
        """高风险动作永远不能自动执行。"""
        assert can_auto_execute("price_adjust") is False
        assert get_policy("price_adjust").risk == RISK_HIGH
        assert get_policy("price_adjust").daily_cap == 0

    def test_low_risk_readonly_actions_auto(self):
        """只读低风险动作可自动执行。"""
        for act in ("refund_check", "restock"):
            p = get_policy(act)
            assert p.risk == RISK_LOW
            assert p.auto_allowed is True
            assert p.side_effect is False

    def test_medium_risk_has_daily_cap(self):
        """中风险动作必须配置日限额（防止 Agent 无限发券/降价）。"""
        for act in ("create_coupon", "clearance"):
            p = get_policy(act)
            assert p.risk == RISK_MEDIUM
            assert p.auto_allowed is True
            assert p.side_effect is True
            assert isinstance(p.daily_cap, int) and p.daily_cap > 0

    def test_unknown_action_falls_back_to_deny(self):
        """未知动作 → 兜底策略：高风险、不可自动执行。"""
        p = get_policy("totally_unknown_action")
        assert p.auto_allowed is False
        assert p.risk == RISK_HIGH

    def test_keep_is_not_executable(self):
        """keep 是"不干预"，不应被当作可执行动作。"""
        assert can_auto_execute("keep") is False

    def test_risk_rank_ordering(self):
        assert risk_rank(RISK_LOW) < risk_rank(RISK_MEDIUM) < risk_rank(RISK_HIGH)
        assert risk_rank("nonexistent") == 99

    def test_policy_table_serializable(self):
        rows = describe_policy_table()
        assert len(rows) > 0
        for r in rows:
            assert set(r.keys()) >= {
                "action_type", "risk", "auto_allowed", "side_effect", "daily_cap", "note",
            }


class TestSplitPlanByRisk:
    """计划分级：权限判断以策略表为准，不采信模型。"""

    def test_price_adjust_blocked_even_if_model_claims_low(self):
        """关键安全测试：模型把 price_adjust 标成 low，也必须进"需确认"。"""
        plan = [{
            "action_type": "price_adjust",
            "params": {"product_id": "p1", "target_price": 9.9},
            "reason": "clearance",
            "risk": "low",  # 模型谎报
        }]
        auto, confirm = split_plan_by_risk(plan)
        assert auto == []
        assert len(confirm) == 1
        assert confirm[0]["action_type"] == "price_adjust"

    def test_create_coupon_auto_even_if_model_claims_high(self):
        """模型把可自主动作标成 high，策略表仍应允许自动执行。"""
        plan = [{
            "action_type": "create_coupon",
            "params": {"value": 20},
            "reason": "r",
            "risk": "high",  # 模型保守
        }]
        auto, confirm = split_plan_by_risk(plan)
        assert len(auto) == 1
        assert confirm == []

    def test_keep_is_dropped_from_both_groups(self):
        """keep 不应出现在任何一组里。"""
        plan = [{"action_type": "keep", "params": {}, "reason": "", "risk": "low"}]
        auto, confirm = split_plan_by_risk(plan)
        assert auto == [] and confirm == []

    def test_mixed_plan(self):
        plan = [
            {"action_type": "refund_check", "params": {}},
            {"action_type": "clearance", "params": {"product_id": "p"}},
            {"action_type": "price_adjust", "params": {"product_id": "p", "target_price": 1}},
        ]
        auto, confirm = split_plan_by_risk(plan)
        assert {i["action_type"] for i in auto} == {"refund_check", "clearance"}
        assert {i["action_type"] for i in confirm} == {"price_adjust"}

    def test_enriched_with_policy_risk(self):
        """分组结果应带上策略表判定的 risk（而非模型的）。"""
        auto, _ = split_plan_by_risk([{"action_type": "create_coupon", "params": {}, "risk": "high"}])
        assert auto[0]["policy_risk"] == RISK_MEDIUM
        assert auto[0]["auto_allowed"] is True


class TestAutoExecBudget:
    """日限额闸门。"""

    def test_coupon_cap_enforced(self):
        cap = get_policy("create_coupon").daily_cap
        ok, _ = auto_exec_budget("create_coupon", cap - 1)
        assert ok is True
        ok2, why2 = auto_exec_budget("create_coupon", cap)
        assert ok2 is False
        assert "上限" in why2

    def test_clearance_cap_enforced(self):
        cap = get_policy("clearance").daily_cap
        assert auto_exec_budget("clearance", cap - 1)[0] is True
        assert auto_exec_budget("clearance", cap)[0] is False

    def test_high_risk_rejected_at_any_usage(self):
        for used in (0, 1, 5, 100):
            ok, why = auto_exec_budget("price_adjust", used)
            assert ok is False
            assert "白名单" in why

    def test_unlimited_actions_always_ok(self):
        for used in (0, 10, 1000):
            assert auto_exec_budget("refund_check", used)[0] is True

    def test_max_actions_per_run_is_bounded(self):
        """单次巡店自动执行总数必须有限，防止 Agent 一次做太多。"""
        assert isinstance(MAX_AUTO_ACTIONS_PER_RUN, int)
        assert 1 <= MAX_AUTO_ACTIONS_PER_RUN <= 10
