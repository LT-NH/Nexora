"""套餐能力矩阵与默认套餐种子。

从 app/main.py 抽出（原先占 140 行，让 main 混杂了业务常量与种子逻辑）。

电商 AI 能力的语义开关集中在这里；**价格与上限仍在数据库里独立可调**，
本模块只负责能力档位，发版时按需刷新（幂等，不覆盖价格）。
"""

import uuid

from sqlalchemy import select

from app.database import async_session_factory
from app.models.subscription import SubscriptionPlan
from app.utils.logging import get_logger

logger = get_logger(__name__)


# ── 套餐能力矩阵（电商 AI 能力语义键；价格/上限在 DB 独立可调） ────────────────
_PLAN_FEATURES = {
    "free": {
        "description": "个人起步：电商管理 + 六维健康体检",
        "ai_health": True,        # 经营健康引擎（六维诊断 + AI 总结）
        "ai_advisor": False,      # AI 决策助手（千问开处方）
        "store_sentinel": False,  # 自主巡店 Agent（旗舰专属）
        "experience_base": False, # 经验库沉淀
        "profit_analysis": False, # 利润健康/单品毛利归因
        "api_keys": 1,
        "support": "community",
    },
    "pro": {
        "description": "成长商家：AI 决策助手开处方 + 利润归因",
        "ai_health": True,
        "ai_advisor": True,
        "store_sentinel": False,  # 巡店 Agent 归 Enterprise
        "experience_base": True,
        "profit_analysis": True,
        "api_keys": 10,
        "support": "email",
    },
    "enterprise": {
        "description": "旗舰：雇一位每天自主上班的 AI 运营员工",
        "ai_health": True,
        "ai_advisor": True,
        "store_sentinel": True,   # 每日自主巡店 Agent（本档专属）
        "experience_base": True,
        "profit_analysis": True,
        "api_keys": 50,
        "support": "priority",
        "custom_domain": True,
        "audit_logs": True,
    },
}


def _plan_feature_matrix(slug: str) -> dict:
    return dict(_PLAN_FEATURES.get(slug, {}))


async def seed_default_plans() -> None:
    """Seed the database with default subscription plans if they don't exist."""
    try:
        async with async_session_factory() as session:
            # Check if plans already exist
            result = await session.execute(
                select(SubscriptionPlan).limit(1)
            )
            if result.scalar_one_or_none() is not None:
                # 已存在 → 幂等同步能力矩阵（不覆盖价格/上限，仅刷新功能档位）
                for _slug in _PLAN_FEATURES:
                    _p = (
                        await session.execute(
                            select(SubscriptionPlan).where(SubscriptionPlan.slug == _slug).limit(1)
                        )
                    ).scalar_one_or_none()
                    if _p is not None:
                        _p.features = _plan_feature_matrix(_slug)
                await session.commit()
                return

            plans = [
                SubscriptionPlan(
                    id=str(uuid.uuid4()),
                    name="Free",
                    slug="free",
                    price_monthly=0.0,
                    price_yearly=0.0,
                    max_members=5,
                    max_workspaces=1,
                    features={
                        "description": "Basic features for individuals and small teams.",
                        "api_access": True,
                        "storage_gb": 1,
                        "support": "community",
                        "custom_domain": False,
                        "audit_logs": False,
                        "api_keys": 1,
                        "priority_support": False,
                    },
                    is_active=True,
                ),
                SubscriptionPlan(
                    id=str(uuid.uuid4()),
                    name="Pro",
                    slug="pro",
                    price_monthly=29.0,
                    price_yearly=290.0,
                    max_members=20,
                    max_workspaces=5,
                    features={
                        "description": "Advanced features for growing teams.",
                        "api_access": True,
                        "storage_gb": 50,
                        "support": "email",
                        "custom_domain": True,
                        "audit_logs": True,
                        "api_keys": 10,
                        "priority_support": False,
                    },
                    is_active=True,
                ),
                SubscriptionPlan(
                    id=str(uuid.uuid4()),
                    name="Enterprise",
                    slug="enterprise",
                    price_monthly=99.0,
                    price_yearly=990.0,
                    max_members=999,
                    max_workspaces=999,
                    features={
                        "description": "Full-featured plan for large organizations.",
                        "api_access": True,
                        "storage_gb": 500,
                        "support": "priority",
                        "custom_domain": True,
                        "audit_logs": True,
                        "api_keys": 100,
                        "priority_support": True,
                        "sso": True,
                        "white_label": True,
                        "dedicated_support": True,
                    },
                    is_active=True,
                ),
            ]

            for plan in plans:
                plan.features = _plan_feature_matrix(plan.slug)
                session.add(plan)

            await session.commit()
    except Exception:
        logger.exception("Error seeding default subscription plans.")
        raise
