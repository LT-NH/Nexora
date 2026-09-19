"""SQLite 并发写保护回归测试（2026-09-19）。

背景：SQLite 默认 `journal_mode=delete` + `busy_timeout=0`，第二个写入者
遇到写锁会**立刻**失败（`database is locked`）。本项目有 5 个常驻定时任务
（含每 5 分钟的店铺同步），并发写是常态 —— 因此必须显式配置 WAL 与
busy_timeout。这里锁定该配置，防止日后被误删。
"""

import asyncio
import os
import tempfile

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.database import SQLITE_PRAGMAS, apply_sqlite_pragmas


@pytest_asyncio.fixture
async def file_engine():
    """文件型 SQLite 引擎（WAL 是库文件属性，不能用 :memory: 验证）。"""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    engine = create_async_engine(f"sqlite+aiosqlite:///{path}")
    apply_sqlite_pragmas(engine.sync_engine)
    yield engine, path
    await engine.dispose()
    for suffix in ("", "-wal", "-shm"):
        try:
            os.remove(path + suffix)
        except OSError:
            pass


async def test_pragmas_are_applied(file_engine):
    """PRAGMA 必须真的作用到连接上，而不是"写了没生效"。"""
    engine, _ = file_engine
    async with engine.connect() as conn:
        journal = (await conn.execute(text("PRAGMA journal_mode"))).scalar()
        busy = (await conn.execute(text("PRAGMA busy_timeout"))).scalar()
        sync = (await conn.execute(text("PRAGMA synchronous"))).scalar()

    assert str(journal).lower() == "wal", f"journal_mode 应为 wal，实际 {journal}"
    assert int(busy) == 5000, f"busy_timeout 应为 5000ms，实际 {busy}"
    assert int(sync) == 1, f"WAL 下 synchronous 应为 NORMAL(1)，实际 {sync}"


async def test_baseline_journal_mode_is_delete():
    """对照组：未配置时 journal_mode 是 delete（读写互斥）—— 说明 WAL 的必要性。

    注意 busy_timeout 的基线**不是 0**：aiosqlite 驱动默认就给 5s。
    真正的隐患是 journal_mode，不是 busy_timeout（实测纠正）。
    """
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    engine = create_async_engine(f"sqlite+aiosqlite:///{path}")
    try:
        async with engine.connect() as conn:
            journal = (await conn.execute(text("PRAGMA journal_mode"))).scalar()
        assert str(journal).lower() == "delete"
    finally:
        await engine.dispose()
        for suffix in ("", "-wal", "-shm"):
            try:
                os.remove(path + suffix)
            except OSError:
                pass


async def test_concurrent_writes_all_succeed(file_engine):
    """20 个并发写入者全部成功 —— 这是"定时任务 + 用户操作"并发的真实形状。

    没有 WAL + busy_timeout 时，这里会抛 OperationalError: database is locked。
    """
    engine, _ = file_engine
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.execute(text("CREATE TABLE probe (id INTEGER PRIMARY KEY, tag TEXT)"))

    concurrency = 20

    async def write(i: int) -> None:
        async with factory() as s:
            await s.execute(
                text("INSERT INTO probe (tag) VALUES (:t)"), {"t": f"w{i}"}
            )
            await s.commit()

    results = await asyncio.gather(
        *(write(i) for i in range(concurrency)), return_exceptions=True
    )

    failures = [r for r in results if isinstance(r, Exception)]
    assert not failures, f"并发写出现失败：{failures[:3]}"

    async with engine.connect() as conn:
        count = (await conn.execute(text("SELECT COUNT(*) FROM probe"))).scalar()
    assert int(count) == concurrency


async def test_concurrent_mixed_read_write(file_engine):
    """读写混合不互斥：WAL 下读者不被写者阻塞。"""
    engine, _ = file_engine
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.execute(text("CREATE TABLE probe2 (id INTEGER PRIMARY KEY, v INT)"))

    async def writer():
        for i in range(10):
            async with factory() as s:
                await s.execute(text("INSERT INTO probe2 (v) VALUES (:v)"), {"v": i})
                await s.commit()

    async def reader():
        for _ in range(10):
            async with factory() as s:
                await s.execute(text("SELECT COUNT(*) FROM probe2"))

    results = await asyncio.gather(
        writer(), writer(), reader(), reader(), return_exceptions=True
    )
    failures = [r for r in results if isinstance(r, Exception)]
    assert not failures, f"读写混合出现失败：{failures[:3]}"


def test_pragma_recipe_is_documented():
    """配方内容锁定：不允许悄悄去掉 WAL 或 busy_timeout。"""
    joined = " ".join(SQLITE_PRAGMAS).lower()
    assert "journal_mode=wal" in joined
    assert "busy_timeout=5000" in joined


def test_foreign_keys_deliberately_not_enabled():
    """守卫：**不要**顺手打开 foreign_keys=ON。

    现有库存在 10 处外键违规（演示数据残留，引用不存在的 workspace）。
    SQLite 打开外键强制不会回溯清理旧数据，但会让后续涉及这些行的写入
    直接报错 —— 等于用「更严谨」的配置引入线上故障。

    要开启请先清理孤儿数据，并同步修改本测试与本文件的说明。
    """
    joined = " ".join(SQLITE_PRAGMAS).lower()
    assert "foreign_keys" not in joined, (
        "开启 foreign_keys 前必须先清理孤儿数据（见 SQLITE_FOREIGN_KEYS_PENDING_REASON）"
    )
