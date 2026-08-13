"""Nexora - Database Backup Utility.

Creates timestamped backups of the SQLite database and prunes old backups.
Can be run standalone (`python backup.py`) or scheduled via APScheduler.
"""

import shutil
import os
import time
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "nexora.db"
BACKUP_DIR = Path(__file__).parent / "backup"
MAX_BACKUPS = 7


def get_last_backup_time() -> str | None:
    """Return ISO timestamp of the most recent backup, or None."""
    if not BACKUP_DIR.exists():
        return None
    backups = sorted(BACKUP_DIR.glob("nexora_*.db"), key=os.path.getmtime, reverse=True)
    if not backups:
        return None
    mtime = os.path.getmtime(str(backups[0]))
    return datetime.fromtimestamp(mtime).isoformat()


def backup() -> str | None:
    """Create a database backup, keeping at most MAX_BACKUPS copies.

    Returns the path of the created backup file, or None if the source
    database does not exist.
    """
    BACKUP_DIR.mkdir(exist_ok=True)
    if not DB_PATH.exists():
        print(f"[Backup] Source database not found: {DB_PATH}")
        return None

    now = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = BACKUP_DIR / f"nexora_{now}.db"
    shutil.copy2(str(DB_PATH), str(dest))

    # Prune old backups (keep only the most recent MAX_BACKUPS)
    backups = sorted(BACKUP_DIR.glob("nexora_*.db"), key=os.path.getmtime, reverse=True)
    for old in backups[MAX_BACKUPS:]:
        old.unlink()
        print(f"[Backup] Removed old backup: {old}")

    print(f"[Backup] Saved to {dest}")
    return str(dest)


if __name__ == "__main__":
    backup()
