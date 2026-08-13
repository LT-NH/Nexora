"""Lightweight async task queue. Uses Redis if available, else in-process."""
import asyncio, json, logging
from app.utils.redis import get_redis

logger = logging.getLogger(__name__)
_tasks: set[asyncio.Task] = set()


def enqueue(coro_factory, *, name: str = "task") -> None:
    """Schedule a coroutine in the background with error logging."""
    async def runner():
        try:
            await coro_factory()
        except Exception:
            logger.exception("[queue] %s failed", name)
    task = asyncio.create_task(runner())
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


async def enqueue_redis(channel: str, payload: dict) -> None:
    """Publish to Redis channel if available (fire-and-forget)."""
    try:
        client = await get_redis()
        await client.publish(channel, json.dumps(payload))
    except Exception:
        pass  # in-memory fallback: nothing to do
