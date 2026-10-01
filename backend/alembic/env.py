"""Alembic environment configuration for async SQLAlchemy."""
import asyncio
from logging.config import fileConfig
from sqlalchemy.ext.asyncio import async_engine_from_config
from sqlalchemy import pool
from alembic import context

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Import all models so they are registered with Base.metadata
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.config import settings
from app.database import Base

# ── 用应用配置覆盖 alembic.ini 里硬编码的 sqlalchemy.url ──────────────────
# 不这样做的话：容器里 DATABASE_URL 指向 PostgreSQL 时，alembic 会去连
# alembic.ini 写死的 `sqlite+aiosqlite:///./data/nexora.db`（容器内一个无关的
# 空文件），于是生产库**一个迁移都不会执行** —— 而 entrypoint 又把失败吞掉，
# 表面上"迁移成功"。这正是本项目 schema 一直靠 create_all + 手写 ALTER
# 撑着、三套机制并存的原因。
#
# 驱动无需转换：env.py 用的是 async_engine_from_config，DATABASE_URL 里的
# asyncpg / aiosqlite 驱动本身就能跑迁移。
# 注意 configparser 会对值做 %-插值，URL 中出现的 % 必须转义成 %%。
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL.replace("%", "%%"))

# Import all model modules to ensure they are loaded
from app.models import (user, workspace, product, order, customer, store, 
                        subscription, apikey, coupon, refund, review, 
                        notification, feedback, permission, audit, webhook,
                        payment, ai_insight, inventory_movement, agent_task,
                        agent_experience)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True, dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
