"""Nexora - 数据库备份工具。

按 ``DATABASE_URL`` 自动分派后端：

  * SQLite     —— 文件拷贝（先做一次 WAL checkpoint，避免漏掉尚未落盘的事务）
  * PostgreSQL —— 调用 ``pg_dump -Fc``（自定义格式，支持 pg_restore 选择性恢复）

此前这里**硬编码了 SQLite 路径**，而生产用的是 PostgreSQL —— 也就是说
README 宣称的「数据自动备份」在生产环境其实从未生效过。

可以独立运行（``python backup.py``），也由 APScheduler 定时调度。
"""

import os
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

from app.config import settings

BACKEND_DIR = Path(__file__).parent
BACKUP_DIR = BACKEND_DIR / "backup"
MAX_BACKUPS = 7

# pg_dump 超时（秒）。大库首次备份会久一些，但不能无限等。
_PG_DUMP_TIMEOUT = 900


def _sqlite_path() -> Path | None:
    """从 DATABASE_URL 解析 SQLite 文件路径；不是 SQLite 则返回 None。"""
    url = settings.DATABASE_URL or ""
    if not url.startswith("sqlite"):
        return None
    # sqlite+aiosqlite:///./data/nexora.db  →  ./data/nexora.db
    _, _, raw = url.partition("///")
    raw = raw or ""
    if not raw or raw == ":memory:":
        return None
    p = Path(raw)
    return p if p.is_absolute() else (BACKEND_DIR / p).resolve()


def _is_postgres() -> bool:
    url = settings.DATABASE_URL or ""
    return url.startswith("postgresql") or url.startswith("postgres")


def get_last_backup_time() -> str | None:
    """返回最近一次备份的时间（ISO 字符串），没有则返回 None。"""
    if not BACKUP_DIR.exists():
        return None
    backups = sorted(BACKUP_DIR.glob("nexora_*.*"), key=os.path.getmtime, reverse=True)
    if not backups:
        return None
    return datetime.fromtimestamp(os.path.getmtime(str(backups[0]))).isoformat()


def _prune(keep: int = MAX_BACKUPS) -> list[str]:
    """只保留最近 keep 份备份，返回被删除的文件名。"""
    if not BACKUP_DIR.exists():
        return []
    backups = sorted(BACKUP_DIR.glob("nexora_*.*"), key=os.path.getmtime, reverse=True)
    removed: list[str] = []
    for old in backups[keep:]:
        try:
            old.unlink()
            removed.append(old.name)
        except OSError:
            pass
    return removed


def _backup_sqlite(db_path: Path, dest: Path) -> None:
    """SQLite：先 WAL checkpoint 再拷贝，保证拿到一致的快照。"""
    import sqlite3

    if not db_path.exists():
        raise FileNotFoundError(f"SQLite 数据库不存在: {db_path}")

    try:
        # 把 WAL 里的内容合并回主库，否则直接 copy 会丢掉最近的写入
        with sqlite3.connect(str(db_path)) as conn:
            conn.execute("PRAGMA wal_checkpoint(FULL)")
    except sqlite3.Error:
        # 拿不到锁或本来就不是 WAL 模式：退化为直接拷贝（等同原行为）
        pass

    shutil.copy2(str(db_path), str(dest))


def _verify_postgres_dump(dest: Path) -> None:
    """用 ``pg_restore --list`` 校验 dump 结构完整。

    否则「备份成功但恢复不了」要等到真出事才会发现。
    """
    try:
        proc = subprocess.run(
            ["pg_restore", "--list", str(dest)],
            capture_output=True, text=True, timeout=120,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return  # 环境里没有 pg_restore 时跳过校验，不因此让备份失败
    if proc.returncode != 0:
        raise RuntimeError(
            f"备份文件校验失败（pg_restore --list）：{(proc.stderr or '')[:200]}"
        )


def _backup_postgres(dest: Path) -> None:
    """PostgreSQL：pg_dump -Fc。

    需要本机存在 pg_dump（容器镜像里需安装 postgresql-client）。
    """
    from sqlalchemy.engine import make_url

    url = make_url(settings.DATABASE_URL)
    env = dict(os.environ)
    if url.password:
        env["PGPASSWORD"] = url.password

    cmd = [
        "pg_dump",
        "-h", url.host or "localhost",
        "-p", str(url.port or 5432),
        "-U", url.username or "postgres",
        "-d", url.database or "postgres",
        "-Fc",  # 自定义格式：自带压缩，且支持 pg_restore 做选择性恢复
        "-f", str(dest),
    ]

    try:
        proc = subprocess.run(
            cmd, env=env, capture_output=True, text=True, timeout=_PG_DUMP_TIMEOUT
        )
    except FileNotFoundError as exc:
        raise RuntimeError(
            "未找到 pg_dump —— 请安装 postgresql-client（备份 PostgreSQL 必需）"
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"pg_dump 超时（>{_PG_DUMP_TIMEOUT}s）") from exc

    if proc.returncode != 0:
        raise RuntimeError(
            f"pg_dump 失败（exit {proc.returncode}）：{(proc.stderr or '')[:300]}"
        )

    _verify_postgres_dump(dest)


def backup() -> str | None:
    """创建一次数据库备份，最多保留 MAX_BACKUPS 份。

    Returns:
        备份文件路径；数据源不存在或不是受支持的后端时返回 None。
    """
    BACKUP_DIR.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    if _is_postgres():
        dest = BACKUP_DIR / f"nexora_{stamp}.dump"
        _backup_postgres(dest)
    else:
        db_path = _sqlite_path()
        if db_path is None:
            print("[Backup] 未识别的 DATABASE_URL，跳过备份")
            return None
        dest = BACKUP_DIR / f"nexora_{stamp}.db"
        _backup_sqlite(db_path, dest)

    for name in _prune():
        print(f"[Backup] 已清理旧备份: {name}")

    size_kb = dest.stat().st_size / 1024
    print(f"[Backup] 已保存 {dest.name}（{size_kb:.1f} KB）")
    return str(dest)


if __name__ == "__main__":
    backup()
