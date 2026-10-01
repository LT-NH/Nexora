"""Nexora - 时间归一化工具。

统一跨数据库的时间比较口径：SQLite 不保存时区信息（取回 naive datetime），
PostgreSQL 可能返回 aware datetime，两者直接比较会抛 ``TypeError``。
所有「当前时间 vs 订阅周期」的判断都应先经过 :func:`to_naive_utc`。
"""

from datetime import datetime, timezone


def to_naive_utc(value: datetime | None) -> datetime | None:
    """把可能带时区的 datetime 归一化为 naive UTC；``None`` 原样返回。"""
    if value is None:
        return None
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value
