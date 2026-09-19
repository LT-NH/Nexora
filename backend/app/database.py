"""Nexora - Database Setup.

Provides async SQLAlchemy engine, session factory, and a shared declarative base.
"""

import os

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

# Resolve database URL to absolute path if using SQLite
_database_url = settings.DATABASE_URL
if _database_url.startswith("sqlite"):
    # Extract the path part after sqlite+aiosqlite:/// or sqlite:///
    _prefix = "sqlite+aiosqlite:///"
    if _database_url.startswith(_prefix):
        _db_path = _database_url[len(_prefix):]
    else:
        _prefix = "sqlite:///"
        _db_path = _database_url[len(_prefix):]
    # Convert relative path to absolute (relative to backend directory)
    if not os.path.isabs(_db_path):
        _backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        _db_path = os.path.join(_backend_dir, _db_path.lstrip("./"))
        _database_url = f"{_prefix}{_db_path}"
    # Ensure the data directory exists
    _db_dir = os.path.dirname(_db_path)
    if _db_dir:
        os.makedirs(_db_dir, exist_ok=True)

_engine_kwargs = {
    "echo": False,
    "future": True,
}
# Only apply pool settings for non-SQLite databases
if not _database_url.startswith("sqlite"):
    _engine_kwargs["pool_size"] = 10
    _engine_kwargs["max_overflow"] = 20
    _engine_kwargs["pool_pre_ping"] = True
    _engine_kwargs["pool_recycle"] = 3600

engine = create_async_engine(_database_url, **_engine_kwargs)

# ---------------------------------------------------------------------------
# SQLite 并发写保护
# ---------------------------------------------------------------------------
# 实测基线（2026-09-19，aiosqlite 驱动的真实默认值）：
#   journal_mode = delete      ← **真正的隐患**：读写互斥，写者阻塞读者
#   busy_timeout = 5000        ← 驱动已默认给 5s（不是 0）
#   synchronous  = 2 (FULL)
#   foreign_keys = 0           ← 外键未强制
#
# 本项目有 5 个常驻定时任务（含每 5 分钟的店铺同步），并发写是常态而非边缘
# 情况，因此显式配置：
#   journal_mode=WAL    读写不互斥（写者不再阻塞读者），锁粒度降到页级
#   synchronous=NORMAL  WAL 下的官方推荐档位：系统崩溃不会损坏库，
#                       仅在操作系统级崩溃时可能丢失最近事务
#   busy_timeout=5000   显式写出（驱动默认已是此值），防止日后被误改成 0
#
# ⚠️ 刻意**不**开启 `PRAGMA foreign_keys=ON`：
#   实测现有库存在 10 处外键违规（products 4 / customers 3 / orders 3，
#   均引用了不存在的 workspace_id —— 演示数据残留）。SQLite 打开外键强制
#   不会回溯清理旧数据，但会让**后续**涉及这些行的写入直接报错，等于用
#   「更严谨」的配置引入线上故障。
#   开启前置条件：先清理孤儿行（`PRAGMA foreign_key_check` 返回空），
#   届时再把 "PRAGMA foreign_keys=ON" 加回本配方。
SQLITE_PRAGMAS: tuple[str, ...] = (
    "PRAGMA journal_mode=WAL",
    "PRAGMA synchronous=NORMAL",
    "PRAGMA busy_timeout=5000",
)

# 记录待办：外键强制未启用的原因（供检测脚本与运维参考）
SQLITE_FOREIGN_KEYS_PENDING_REASON = (
    "存在历史孤儿数据（外键违规），清理完成后才可开启 foreign_keys=ON"
)


def apply_sqlite_pragmas(sync_engine) -> None:
    """为指定的 SQLAlchemy **同步** 引擎挂上 SQLite 调优 PRAGMA。

    抽成函数是为了让测试能对同一个配方做验证（而不是复制一份），
    生产与测试共用一份事实来源。
    """

    @event.listens_for(sync_engine, "connect")
    def _set_sqlite_pragmas(dbapi_connection, _connection_record) -> None:
        cursor = dbapi_connection.cursor()
        try:
            for pragma in SQLITE_PRAGMAS:
                cursor.execute(pragma)
        finally:
            cursor.close()


if _database_url.startswith("sqlite"):
    apply_sqlite_pragmas(engine.sync_engine)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy declarative models."""


async def get_db() -> AsyncSession:  # type: ignore[misc]
    """FastAPI dependency that yields an async database session.

    Yields:
        AsyncSession: An asynchronous SQLAlchemy session.
    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """Create all tables in the database. Safe to call on startup."""
    import app.models  # noqa: F401  — 确保所有模型注册到 metadata
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _ensure_store_columns(conn)
        await _ensure_light_migrations(conn)


async def _ensure_light_migrations(conn) -> None:
    """轻量列迁移：为已存在的表补新列（create_all 不会 ALTER 已有表）。

    与 _ensure_store_columns 同模式：逐列尝试 ALTER TABLE ADD COLUMN，
    列已存在则忽略。用于管理台新功能所需的 status 列。
    """
    from sqlalchemy import text

    migrations = [
        ("workspaces", "status", "VARCHAR(20) NOT NULL DEFAULT 'active'"),
        ("feedbacks", "status", "VARCHAR(20) NOT NULL DEFAULT 'new'"),
        # 决策助手 → 体检快照 溯源列（健康引擎诊断 → 决策助手处方 单向流）
        ("ai_insights", "snapshot_id", "VARCHAR(36)"),
        # 模型是否支持 function calling（巡店 Agent 依赖；管理台需据此提示）
        ("ai_models", "supports_tools", "BOOLEAN NOT NULL DEFAULT FALSE"),
        # 免费额度记账（官方无查询 API，用「总量 - 校准基数 - 本机累计」推算）
        ("ai_models", "quota_total", "INTEGER NOT NULL DEFAULT 1000000"),
        ("ai_models", "quota_used_base", "INTEGER NOT NULL DEFAULT 0"),
        ("ai_models", "tokens_used", "INTEGER NOT NULL DEFAULT 0"),
        ("ai_models", "calls_used", "INTEGER NOT NULL DEFAULT 0"),
        ("ai_models", "quota_calibrated_at", "TIMESTAMP"),
    ]
    for table, column, ddl in migrations:
        try:
            await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
        except Exception:
            # 列已存在（或库不可写）→ 忽略；真正的建表错误由 create_all 负责
            pass


async def _ensure_store_columns(conn) -> None:
    """轻量列迁移：create_all 不会给已存在的表补新列，这里为 stores 表
    逐个尝试 ALTER TABLE ADD COLUMN（已存在则忽略）。SQLite/PostgreSQL 兼容。
    """
    from sqlalchemy import text

    columns = [
        ("auto_sync_enabled", "BOOLEAN NOT NULL DEFAULT FALSE"),
        ("sync_interval_minutes", "INTEGER NOT NULL DEFAULT 60"),
        ("last_sync_status", "VARCHAR(16)"),
        ("last_sync_errors", "TEXT"),
        ("last_incremental_at", "TIMESTAMP"),
        # 平台沙箱开关（淘宝 TOP 有独立沙箱网关；京东/拼多多暂无公开沙箱）
        ("sandbox", "BOOLEAN NOT NULL DEFAULT 0"),
    ]
    for name, ddl in columns:
        try:
            await conn.execute(text(f"ALTER TABLE stores ADD COLUMN {name} {ddl}"))
        except Exception:
            # 列已存在（或库不可写）→ 忽略；真正的建表错误由 create_all 负责
            pass