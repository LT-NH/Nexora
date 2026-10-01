"""进程内 TTL 缓存（轻量，无外部依赖）。

## 为什么不用 Redis

部署形态是「单进程 uvicorn + SQLite」，Redis 不是必装件 —— `app/utils/redis.py`
里的 `cache_get/cache_set` 因此一直是零调用。但有几类计算确实不该每次请求都重跑：

* 经营体检：一次请求 7 次 DB 读 + 1 次千问调用，实测 10~35s（且前端每次切 tab
  回来都会重跑一遍）
* AI 今日摘要：一次千问调用（约 1500 token），每次「执行/反馈」后前端都会重新拉

本模块只解决「同一进程内、短时间内的重复请求」这一个场景：

* 协程/线程安全（一把锁；取值不做 I/O，锁持有时间极短）
* 容量上限（写入超限时按插入顺序淘汰最旧项）
* 支持按前缀失效（写操作后主动作废相关缓存）

多进程部署下每个进程各存一份，不一致的最坏后果是「多算一次」而不是「算错」——
这些缓存都只用于派生展示数据，不参与任何写入决策。

## 使用

    from app.utils.memory_cache import cache

    hit = cache.get(f"health:{ws_id}:{ai}")
    if hit is None:
        hit = await compute()
        cache.set(f"health:{ws_id}:{ai}", hit, ttl=300)
    return hit

返回值是**深拷贝**，调用方随便改，不会污染缓存里的那份。
"""

from __future__ import annotations

import copy
import time
from collections import OrderedDict
from threading import Lock
from typing import Any


class TTLCache:
    """最小的 TTL 缓存：够用就好，不引入第三个依赖。"""

    def __init__(self, maxsize: int = 256) -> None:
        self._data: OrderedDict[str, tuple[float, Any]] = OrderedDict()
        self._lock = Lock()
        self.maxsize = maxsize
        self.hits = 0
        self.misses = 0

    def get(self, key: str) -> Any | None:
        """取缓存（未命中或已过期返回 None）。返回深拷贝，避免调用方改动回流。"""
        now = time.monotonic()
        with self._lock:
            item = self._data.get(key)
            if item is None:
                self.misses += 1
                return None
            expire_at, value = item
            if expire_at <= now:
                self._data.pop(key, None)
                self.misses += 1
                return None
            self._data.move_to_end(key)
            self.hits += 1
        return copy.deepcopy(value)

    def set(self, key: str, value: Any, ttl: float) -> None:
        """写入缓存（ttl 单位为秒）。超过容量时淘汰最久未使用的一项。"""
        with self._lock:
            self._data[key] = (time.monotonic() + ttl, value)
            self._data.move_to_end(key)
            while len(self._data) > self.maxsize:
                self._data.popitem(last=False)

    def invalidate(self, prefix: str = "") -> int:
        """按前缀作废（prefix 为空则清空）。返回作废条数。"""
        with self._lock:
            if not prefix:
                count = len(self._data)
                self._data.clear()
                return count
            keys = [k for k in self._data if k.startswith(prefix)]
            for key in keys:
                self._data.pop(key, None)
            return len(keys)

    def stats(self) -> dict:
        """命中率观测（供 /metrics 或排查用）。"""
        with self._lock:
            total = self.hits + self.misses
            return {
                "size": len(self._data),
                "maxsize": self.maxsize,
                "hits": self.hits,
                "misses": self.misses,
                "hit_rate": round(self.hits / total, 3) if total else 0.0,
            }


# 全局单例：key 约定 `<namespace>:<workspace_id>[:<variant>]`
cache = TTLCache()
