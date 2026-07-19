"""Nexora - Rate Limiter Middleware.

Async-safe in-memory rate limiter that limits requests per IP address.
Includes periodic cleanup of stale entries and Retry-After headers.
"""

import asyncio
import time
from collections import defaultdict
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.config import settings

# How often to clean up stale entries (seconds)
_CLEANUP_INTERVAL_SECONDS = 300  # 5 minutes
# Remove entries inactive for longer than this (seconds)
_STALE_THRESHOLD_SECONDS = 600  # 10 minutes


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Async-safe in-memory rate limiter middleware.

    Limits requests per IP address within a configurable time window.
    Automatically cleans up stale entries every 5 minutes.
    """

    def __init__(
        self,
        app,
        max_requests: int | None = None,
        window_seconds: int | None = None,
    ):
        """Initialize the rate limiter.

        Args:
            app: The ASGI application.
            max_requests: Maximum requests allowed per window. Defaults to settings.
            window_seconds: Time window in seconds. Defaults to settings.
        """
        super().__init__(app)
        self.max_requests = max_requests or settings.RATE_LIMIT_REQUESTS
        self.window_seconds = window_seconds or settings.RATE_LIMIT_WINDOW_SECONDS
        # {ip: [timestamp, timestamp, ...]}
        self._requests: dict[str, list[float]] = defaultdict(list)
        self._lock = asyncio.Lock()
        self._last_cleanup = time.time()

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process the request through the rate limiter.

        Args:
            request: The incoming HTTP request.
            call_next: The next middleware/handler in the chain.

        Returns:
            The HTTP response, or a 429 if rate limit exceeded.
        """
        # Skip rate limiting for health check, docs, and localhost (dev/seed)
        path = request.url.path
        if path in ("/health", "/docs", "/openapi.json", "/redoc"):
            return await call_next(request)

        client_ip = self._get_client_ip(request)
        if client_ip in ("127.0.0.1", "::1", "unknown"):
            return await call_next(request)
        now = time.time()

        # Periodic cleanup of stale entries (every 5 minutes)
        async with self._lock:
            if now - self._last_cleanup > _CLEANUP_INTERVAL_SECONDS:
                self._cleanup_stale_entries(now)
                self._last_cleanup = now

            # Clean old entries for this specific IP
            cutoff = now - self.window_seconds
            self._requests[client_ip] = [
                ts for ts in self._requests[client_ip] if ts > cutoff
            ]

            # Check rate limit
            if len(self._requests[client_ip]) >= self.max_requests:
                retry_after = self._compute_retry_after(client_ip, now)
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": "Too many requests. Please try again later.",
                        "retry_after_seconds": retry_after,
                    },
                    headers={"Retry-After": str(retry_after)},
                )

            # Record this request
            self._requests[client_ip].append(now)

        return await call_next(request)

    def _cleanup_stale_entries(self, now: float) -> None:
        """Remove entries for IPs that have been inactive for too long.

        Must be called while holding ``self._lock``.

        Args:
            now: Current timestamp.
        """
        stale_threshold = now - _STALE_THRESHOLD_SECONDS
        stale_ips = [
            ip
            for ip, timestamps in self._requests.items()
            if not timestamps or max(timestamps) < stale_threshold
        ]
        for ip in stale_ips:
            del self._requests[ip]

    def _compute_retry_after(self, client_ip: str, now: float) -> int:
        """Compute how many seconds until the client can make another request.

        Must be called while holding ``self._lock``.

        Args:
            client_ip: The client IP address.
            now: Current timestamp.

        Returns:
            Number of seconds to wait, at least 1.
        """
        timestamps = self._requests[client_ip]
        if not timestamps:
            return self.window_seconds
        oldest = min(timestamps)
        return max(1, int(self.window_seconds - (now - oldest)))

    @staticmethod
    def _get_client_ip(request: Request) -> str:
        """Extract the client IP address from the request.

        Handles X-Forwarded-For and X-Real-IP headers for proxy support.

        Args:
            request: The incoming HTTP request.

        Returns:
            The client IP address string.
        """
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()

        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip.strip()

        client = request.client
        if client:
            return client.host

        return "unknown"