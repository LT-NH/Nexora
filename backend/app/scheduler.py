"""常驻定时任务：备份 / 周报 / AI 巡检 / 巡店 Agent / 店铺自动同步。

从 app/main.py 的 lifespan 中抽出。抽取时保留了原有的「失败只告警不阻断
启动」语义 —— 调度器起不来不应该让整个服务起不来。
"""

import os
import sys

from app.utils.logging import get_logger

logger = get_logger(__name__)

_scheduler = None  # type: ignore[var-annotated]


def _ensure_backend_on_path() -> None:
    """让 `backup` 顶层模块可被导入（它与 app/ 同级）。"""
    backend_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if backend_path not in sys.path:
        sys.path.insert(0, backend_path)


def start_scheduler():
    """注册并启动全部定时任务。失败时只告警，返回 None。"""
    global _scheduler
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler

        _ensure_backend_on_path()

        from backup import backup as backup_func
        from app.services.report import send_all_weekly_reports
        from app.services.patrol import run_ai_patrol
        from app.api.store_agent import run_daily_store_agents
        from app.services.store_sync import run_due_store_syncs

        sched = AsyncIOScheduler()
        # 每日 03:00 数据库备份
        sched.add_job(backup_func, "cron", hour=3, minute=0, id="daily_backup")
        # 每周一 08:00 周报
        sched.add_job(
            send_all_weekly_reports,
            "cron",
            day_of_week="mon",
            hour=8,
            minute=0,
            id="weekly_reports",
        )
        # 每日 09:00 AI 自动巡检（生成经营体检结论）
        sched.add_job(run_ai_patrol, "cron", hour=9, minute=0, id="ai_patrol")
        # 每日 09:30 巡店 Agent 自主当班（感知 → 决策 → 分级处理 → 审计）
        sched.add_job(
            run_daily_store_agents, "cron", hour=9, minute=30, id="store_sentinel"
        )
        # 每 5 分钟扫描到期店铺执行增量同步
        sched.add_job(
            run_due_store_syncs, "interval", minutes=5, id="store_autosync"
        )
        sched.start()
        _scheduler = sched
        logger.info(
            "Scheduled daily backup 03:00, weekly reports Mon 08:00, "
            "AI patrol 09:00, store sentinel 09:30, store auto-sync every 5min."
        )
    except Exception as e:  # noqa: BLE001
        logger.warning("Failed to start scheduler: %s", str(e))
    return _scheduler


def shutdown_scheduler() -> None:
    """关闭调度器（应用退出时调用）。"""
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None


def get_scheduler():
    """返回当前调度器实例（供测试/诊断使用）。"""
    return _scheduler
