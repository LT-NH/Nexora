"""Redis utility for caching, rate limiting, and token blacklist.

All helpers are designed to degrade gracefully: when Redis is unreachable
they return ``None`` / ``False`` / no-op instead of raising, so callers
never hard-fail on a Redis outage.
"""

import json
from typing import Optional, Any

import redis.asyncio as redis

from app.config import settings

_redis_client: Optional[redis.Redis] = None


async def get_redis() -> redis.Redis:
    """Return a shared async Redis client (lazy-initialised singleton).

    A short socket timeout keeps failure detection fast so callers can
    fall back quickly when Redis is unavailable.
    """
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=0.3,
            socket_timeout=0.3,
        )
    return _redis_client


async def cache_get(key: str) -> Any:
    """Get a JSON-serialised value from the cache, or ``None`` if missing.

    Returns ``None`` on any failure (Redis unreachable, parse error, ...).
    """
    try:
        r = await get_redis()
        data = await r.get(key)
        return json.loads(data) if data else None
    except Exception:
        return None


async def cache_set(key: str, value: Any, ttl: int = 3600) -> None:
    """Set a JSON-serialised value in the cache with a TTL (seconds).

    No-op on any failure (Redis unreachable, ...).
    """
    try:
        r = await get_redis()
        await r.setex(key, ttl, json.dumps(value, default=str))
    except Exception:
        pass


async def cache_delete(key: str) -> None:
    """Delete a key from the cache (no-op if the key does not exist).

    No-op on any failure (Redis unreachable, ...).
    """
    try:
        r = await get_redis()
        await r.delete(key)
    except Exception:
        pass


async def blacklist_token(jti: str, ttl: int) -> None:
    """Add a JWT ID to the token blacklist for ``ttl`` seconds.

    No-op on any failure (Redis unreachable, ...).
    """
    try:
        r = await get_redis()
        await r.setex(f"blacklist:{jti}", ttl, "1")
    except Exception:
        pass


async def is_token_blacklisted(jti: str) -> bool:
    """Return ``True`` if the given JWT ID has been blacklisted.

    Returns ``False`` on any failure (Redis unreachable, ...) so an
    outage never locks users out.
    """
    try:
        r = await get_redis()
        return await r.exists(f"blacklist:{jti}") > 0
    except Exception:
        return False
