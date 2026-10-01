"""Nexora - 订单数据来源人工修正工具。

迁移 `c2e8f1a45d67` 回填历史订单来源时采用**保守基线**：无法证明是真实同步的
一律标为 `simulated`（理由见该迁移的 docstring —— 两个方向的误判代价不对称）。

这个脚本是配套的修正途径：当你人工确认某个工作空间的某批订单确实是真实经营
数据时，用它把标记改回 `real`。

用法：
    python reclassify_orders.py --list
        列出所有工作空间的来源分布

    python reclassify_orders.py --workspace <slug> --to real
        把该工作空间的订单重新标记为 real

    python reclassify_orders.py --workspace <slug> --to real --platform shopify
        只改该平台的行

    python reclassify_orders.py --workspace <slug> --to real --dry-run
        只预览将影响多少行，不写入
"""

import argparse
import asyncio
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import func, select, update  # noqa: E402

from app.database import async_session_factory  # noqa: E402
from app.models.order import Order, OrderDataSource  # noqa: E402
from app.models.workspace import Workspace  # noqa: E402

VALID_SOURCES = {s.value for s in OrderDataSource}


async def list_distribution() -> None:
    """打印各工作空间的来源分布。"""
    async with async_session_factory() as db:
        ws_rows = (await db.execute(select(Workspace.id, Workspace.name, Workspace.slug))).all()
        names = {w.id: f"{w.name} ({w.slug})" for w in ws_rows}

        rows = (
            await db.execute(
                select(
                    Order.workspace_id,
                    Order.data_source,
                    func.count(Order.id),
                ).group_by(Order.workspace_id, Order.data_source)
            )
        ).all()

    if not rows:
        print("库内没有任何订单。")
        return

    grouped: dict[str, dict[str, int]] = {}
    for ws_id, source, count in rows:
        src = source.value if hasattr(source, "value") else str(source)
        grouped.setdefault(ws_id, {})[src] = count

    print(f"{'工作空间':<44} {'real':>7} {'sandbox':>8} {'simulated':>10} {'合计':>7}")
    print("-" * 80)
    for ws_id, dist in sorted(grouped.items(), key=lambda kv: -sum(kv[1].values())):
        label = names.get(ws_id, ws_id)
        total = sum(dist.values())
        print(
            f"{label[:43]:<44} {dist.get('real', 0):>7} "
            f"{dist.get('sandbox', 0):>8} {dist.get('simulated', 0):>10} {total:>7}"
        )


async def reclassify(
    slug: str, target: str, platform: str | None, dry_run: bool
) -> None:
    if target not in VALID_SOURCES:
        print(f"无效的目标来源 {target!r}，可选：{sorted(VALID_SOURCES)}")
        return

    async with async_session_factory() as db:
        ws = (
            await db.execute(select(Workspace).where(Workspace.slug == slug))
        ).scalar_one_or_none()
        if ws is None:
            print(f"找不到工作空间 slug={slug!r}")
            return

        stmt = select(func.count(Order.id)).where(Order.workspace_id == ws.id)
        if platform:
            stmt = stmt.where(Order.platform == platform)
        affected = (await db.execute(stmt)).scalar_one()

        if dry_run:
            print(f"[dry-run] 将把 {ws.name} 的 {affected} 笔订单标记为 {target}"
                  + (f"（仅 platform={platform}）" if platform else ""))
            return

        upd = update(Order).where(Order.workspace_id == ws.id)
        if platform:
            upd = upd.where(Order.platform == platform)
        await db.execute(upd.values(data_source=OrderDataSource(target)))
        await db.commit()

    print(f"已把 {ws.name} 的 {affected} 笔订单标记为 {target}"
          + (f"（仅 platform={platform}）" if platform else ""))


def main() -> None:
    parser = argparse.ArgumentParser(description="订单数据来源人工修正工具")
    parser.add_argument("--list", action="store_true", help="列出各工作空间来源分布")
    parser.add_argument("--workspace", help="工作空间 slug")
    parser.add_argument("--to", dest="target", help=f"目标来源：{sorted(VALID_SOURCES)}")
    parser.add_argument("--platform", help="只处理指定平台的行")
    parser.add_argument("--dry-run", action="store_true", help="只预览，不写入")
    args = parser.parse_args()

    if args.list or not args.workspace:
        asyncio.run(list_distribution())
        return

    if not args.target:
        print("请用 --to 指定目标来源，例如 --to real")
        return

    asyncio.run(reclassify(args.workspace, args.target, args.platform, args.dry_run))


if __name__ == "__main__":
    main()
