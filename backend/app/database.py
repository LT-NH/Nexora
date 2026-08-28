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