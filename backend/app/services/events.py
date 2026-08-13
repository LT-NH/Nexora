"""In-process event bus. Subscribers are async callables; publish is fire-and-forget."""
import asyncio, logging
logger = logging.getLogger(__name__)
_SUBSCRIBERS: dict[str, list] = {}


def subscribe(event: str, handler) -> None:
    _SUBSCRIBERS.setdefault(event, []).append(handler)


def publish(event: str, payload: dict) -> None:
    for h in _SUBSCRIBERS.get(event, []):
        try:
            asyncio.get_event_loop().create_task(h(payload))
        except Exception:
            logger.exception("event handler failed")
