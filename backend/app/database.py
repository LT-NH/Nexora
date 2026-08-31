"""Nexora - Database Setup.

Provides async SQLAlchemy engine, session factory, and a shared declarative base.
"""

import os

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
    ]
    for name, ddl in columns:
        try:
            await conn.execute(text(f"ALTER TABLE stores ADD COLUMN {name} {ddl}"))
        except Exception:
            # 列已存在（或库不可写）→ 忽略；真正的建表错误由 create_all 负责
            pass