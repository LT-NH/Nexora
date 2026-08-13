"""Nexora - Performance Monitoring Middleware.

Logs slow requests (>500ms) and injects an X-Response-Time header
into every response.
"""

import time
import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("performance")


class PerformanceMiddleware(BaseHTTPMiddleware):
    """ASGI middleware that measures request duration.

    Adds an ``X-Response-Time`` header (in milliseconds) to every response.
    Logs a warning when a request takes longer than 500 ms so operators
    can spot bottlenecks early.
    """

    async def dispatch(self, request: Request, call_next):
        start = time.time()
        response = await call_next(request)
        elapsed = (time.time() - start) * 1000
        if elapsed > 500:
            logger.warning(
                "SLOW %.0fms %s %s",
                elapsed,
                request.method,
                request.url.path,
            )
        response.headers["X-Response-Time"] = f"{elapsed:.0f}ms"
        return response
