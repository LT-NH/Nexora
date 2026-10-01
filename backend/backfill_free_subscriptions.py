"""给没有订阅记录的工作空间补一条 Free 订阅。

## 为什么需要

``services/workspace.py`` 里有「创建工作空间时自动订阅 Free 套餐」的逻辑，
但那段是后加的 —— 存量工作空间没有补上。实测库里 38 个工作空间只有 3 条订阅。

后果：档位判断（``billing.get_ws_plan_tier``）拿不到订阅记录，返回 free，
而老用户如果原本是付费档位、或依赖订阅信息做展示，就会出现异常。

## 超管如何处理

超管工作空间**不补订阅**：超管走 ``resolve_workspace_tier`` 直通 enterprise，
本来就不需要订阅记录；给它建一条 Free 反而会让后台统计出现假的免费用户。

## 用法

    python backfill_free_subscriptions.py --dry-run   # 只列出将要改动的，不写库
    python backfill_free_subscriptions.py             # 实际执行

脚本是幂等的：重复运行只会处理仍然缺订阅的工作空间。
"""
import argparse
import asyncio
import sys
from datetime import datetime

sys.path.insert(0, ".")

from sqlalchemy import select  # noqa: E402

from app.database import async_session_factory  # noqa: E402
from app.models.subscription import (  # noqa: E402
    PaymentStatus,
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
)
from app.models.workspace import Workspace  # noqa: E402
from app.services.subscription import SubscriptionService  # noqa: E402


async def main(dry_run: bool) -> None:
    async with async_session_factory() as db:
        free_plan = (
            await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.slug == "free"))
        ).scalar_one_or_none()
        if free_plan is None:
            print("✗ 找不到 slug=free 的套餐，请先运行 seed_default_plans")
            return

        all_ws = (await db.execute(select(Workspace.id, Workspace.name))).all()
        have_sub = set(
            (await db.execute(select(Subscription.workspace_id))).scalars().all()
        )
        superadmin_ws = await SubscriptionService._superadmin_workspace_ids(db)

        missing = [(wid, name) for wid, name in all_ws if wid not in have_sub]
        to_create = [(wid, name) for wid, name in missing if wid not in superadmin_ws]
        admin_missing = [x for x in missing if x[0] in superadmin_ws]

        print(f"工作空间总数        : {len(all_ws)}")
        print(f"已有订阅            : {len(have_sub)}")
        print(f"超管工作空间(全部豁免): {len(superadmin_ws)}"
              + (f"  ← 其中 {len(admin_missing)} 个缺订阅但不补" if admin_missing else "  （均有订阅，无需处理）"))
        print(f"缺订阅              : {len(missing)}")
        print(f"  需要回填 Free     : {len(to_create)}")
        for wid, name in to_create[:10]:
            print(f"    · {name}  ({wid[:8]})")
        if len(to_create) > 10:
            print(f"    ... 另有 {len(to_create) - 10} 个")

        if dry_run:
            print("\n[dry-run] 未写入任何数据。去掉 --dry-run 实际执行。")
            return

        now = datetime.utcnow()
        for wid, _name in to_create:
            db.add(
                Subscription(
                    workspace_id=wid,
                    plan_id=free_plan.id,
                    status=SubscriptionStatus.ACTIVE,
                    payment_status=PaymentStatus.VERIFIED,
                    current_period_start=now,
                    # Free 没有到期概念 —— 必须显式 None。
                    # 此前写死 now + 10 年，计费逻辑把「未过期」当作「可顺延」的依据，
                    # 导致首次购买把 10 年虚假周期叠加到付费周期上（付一次 ¥99 拿 10 年）。
                    current_period_end=None,
                    trial_ends_at=None,
                )
            )
        await db.commit()
        print(f"\n✓ 已为 {len(to_create)} 个工作空间创建 Free 订阅")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="回填缺失的 Free 订阅")
    parser.add_argument("--dry-run", action="store_true", help="只预览，不写库")
    args = parser.parse_args()
    asyncio.run(main(args.dry_run))
