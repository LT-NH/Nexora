"""Nexora - Store Auto-Sync Service.

调度器每 5 分钟扫描一次开启自动同步的店铺，到期的执行增量同步
（无历史同步记录时回退为全量），并把结果/错误写回店铺记录，
让"同步失败但没人发现"这件事不再可能。
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.database import async_session_factory
from app.models.store import Store, StoreStatus
from app.services.platforms import PLATFORM_REGISTRY
from app.services.store import StoreService
from app.utils.logging import get_logger

logger = get_logger(__name__)

# 错误详情最多保留的字符数（避免极端失败把数据库撑爆）
_MAX_ERROR_TEXT = 2000


def _derive_status(all_errors: list[str], exception: Exception | None) -> str:
    """根据结果推导同步状态：success / partial / error。"""
    if exception is not None:
        return "error"
    return "success" if not all_errors else "partial"


def _summarize_errors(all_errors: list[str], exception: Exception | None) -> str | None:
    parts = list(all_errors[:20])
    if exception is not None:
        parts.append(f"sync crashed: {exception}")
    if not parts:
        return None
    text = " | ".join(parts)
    if len(text) > _MAX_ERROR_TEXT:
        text = text[: _MAX_ERROR_TEXT - 3] + "..."
    return text


async def sync_store_once(store_id: str) -> dict | None:
    """同步单个店铺（供调度器与测试直接调用）。

    - 有 last_sync_at 时走增量（Shopify 支持 updated_at_min）
    - 更新 last_sync_at / last_sync_status / last_sync_errors / last_incremental_at
    - 店铺不存在或被删除时返回 None
    """
    async with async_session_factory() as db:
        result = await db.execute(select(Store).where(Store.id == store_id))
        store = result.scalar_one_or_none()
        if store is None:
            return None

        config = await StoreService.get_plain_credentials(store)
        platform_key = (
            store.platform.value if hasattr(store.platform, "value") else str(store.platform)
        )
        integration_cls = PLATFORM_REGISTRY.get(platform_key, PLATFORM_REGISTRY["other"])
        integration = integration_cls()

        incremental_since = store.last_sync_at
        exception: Exception | None = None
        sync_result = None
        started_at = datetime.now(timezone.utc)

        creds_ok = await integration.validate_credentials(config)
        if not creds_ok:
            exception = RuntimeError("credential validation failed")
        else:
            try:
                sync_result = await integration.full_sync(
                    config,
                    store.workspace_id,
                    updated_at_min=incremental_since,
                )
            except Exception as exc:  # 同步崩溃也要留下痕迹
                exception = exc
                logger.error("Auto-sync crashed for store %s: %s", store.id, exc)

        finished_at = sync_result.finished_at if sync_result and sync_result.finished_at else datetime.now(timezone.utc)
        all_errors = sync_result.all_errors if sync_result else []

        store.last_sync_at = finished_at
        store.last_sync_status = _derive_status(all_errors, exception)
        store.last_sync_errors = _summarize_errors(all_errors, exception)
        store.last_incremental_at = started_at
        if creds_ok and store.status in (StoreStatus.DISCONNECTED, StoreStatus.ERROR):
            store.status = StoreStatus.CONNECTED
        await db.commit()

        summary = {
            "store_id": store.id,
            "platform": platform_key,
            "incremental": incremental_since is not None,
            "created": sync_result.total_created if sync_result else 0,
            "updated": sync_result.total_updated if sync_result else 0,
            "errors": len(all_errors),
            "status": store.last_sync_status,
        }
        logger.info(
            "Store auto-sync done: %s (%s, created=%d, updated=%d, errors=%d)",
            store.name,
            summary["status"],
            summary["created"],
            summary["updated"],
            summary["errors"],
        )
        return summary


async def run_due_store_syncs() -> dict:
    """调度器入口：扫描开启自动同步且到期的店铺并逐一同步。

    单店铺失败不影响其他店铺；返回统计供日志/测试断言。
    """
    now = datetime.now(timezone.utc)
    due_ids: list[str] = []

    async with async_session_factory() as db:
        result = await db.execute(
            select(Store).where(
                Store.auto_sync_enabled.is_(True),
                Store.status == StoreStatus.CONNECTED,
            )
        )
        stores = result.scalars().all()
        for store in stores:
            anchor = store.last_sync_at
            if anchor is None:
                due_ids.append(store.id)
                continue
            anchor = (
                anchor.replace(tzinfo=timezone.utc) if anchor.tzinfo is None else anchor
            )
            if now - anchor >= timedelta(minutes=store.sync_interval_minutes):
                due_ids.append(store.id)

    ok = 0
    failed = 0
    for store_id in due_ids:
        try:
            summary = await sync_store_once(store_id)
            if summary is not None:
                ok += 1
        except Exception as exc:
            failed += 1
            logger.error("Auto-sync failed for store %s: %s", store_id, exc)

    if due_ids:
        logger.info("Auto-sync tick: %d due, %d ok, %d failed", len(due_ids), ok, failed)
    return {"due": len(due_ids), "ok": ok, "failed": failed}
