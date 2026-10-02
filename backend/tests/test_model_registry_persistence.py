"""模型额度状态**持久化**的回归测试。

历史 bug（2026-10-02 修复）：`mark_ok()` 依据**内存缓存**判断是否需要写库 ——
进程刚启动时缓存为空（`prev is None`）就直接 return，成功状态**永不落库**。
症状：管理台「一键检测全部」跑完，真实可用的模型仍显示「未检测」，
汇总给出「可用 1/25」的错误结论。

本文件锁定的不变量：**成功与失败两条路径都必须落库**。
"""

import pytest
from sqlalchemy import select

from app.models.ai_model import AIModel
from app.services import model_registry


@pytest.fixture(autouse=True)
def _cold_start_cache():
    """模拟进程刚启动：内存额度缓存为空 —— 这正是触发原 bug 的前提。"""
    model_registry._quota.clear()
    yield
    model_registry._quota.clear()


async def _seed_one(session_factory, model_id: str) -> None:
    async with session_factory() as db:
        db.add(
            AIModel(
                id=model_id,
                model_id=model_id,
                label=model_id,
                family="core",
                is_custom=False,
                is_active=False,
                supports_tools=True,
                quota_status="unknown",
            )
        )
        await db.commit()


async def test_mark_ok_persists_on_cold_cache(patch_session, session_factory):
    """冷启动（内存缓存为空）时，mark_ok 也必须把 ok 写入数据库。

    这条用例在修复前会失败：状态只更新到内存，库里仍是 unknown。
    """
    await _seed_one(session_factory, "qwen-plus")

    await model_registry.mark_ok("qwen-plus")

    async with session_factory() as db:
        row = (
            await db.execute(select(AIModel).where(AIModel.model_id == "qwen-plus"))
        ).scalars().first()
    assert row is not None
    assert row.quota_status == "ok", "成功状态未落库（回归：冷启动早退）"
    assert row.quota_checked_at is not None, "检测时间未落库"
    assert row.last_used_at is not None


async def test_mark_ok_clears_previous_failure(patch_session, session_factory):
    """从失败态恢复为可用时，必须清掉报错文案（否则页面仍显示旧错误）。"""
    await _seed_one(session_factory, "qwen-max")
    await model_registry.record_quota_state("qwen-max", "exhausted", "Free quota exhausted")

    async with session_factory() as db:
        row = (
            await db.execute(select(AIModel).where(AIModel.model_id == "qwen-max"))
        ).scalars().first()
    assert row.quota_status == "exhausted"

    await model_registry.mark_ok("qwen-max")

    async with session_factory() as db:
        row = (
            await db.execute(select(AIModel).where(AIModel.model_id == "qwen-max"))
        ).scalars().first()
    assert row.quota_status == "ok"
    assert row.quota_message is None


async def test_both_paths_agree_on_persistence(patch_session, session_factory):
    """失败与成功**两条路径的落库行为必须一致** —— 不一致正是原 bug 的成因。"""
    await _seed_one(session_factory, "qwen-flash")

    await model_registry.record_quota_state("qwen-flash", "exhausted", "quota")
    async with session_factory() as db:
        after_fail = (
            await db.execute(select(AIModel).where(AIModel.model_id == "qwen-flash"))
        ).scalars().first()
    assert after_fail.quota_status == "exhausted"

    await model_registry.mark_ok("qwen-flash")
    async with session_factory() as db:
        after_ok = (
            await db.execute(select(AIModel).where(AIModel.model_id == "qwen-flash"))
        ).scalars().first()
    assert after_ok.quota_status == "ok"
