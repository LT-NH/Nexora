"""Prometheus metrics middleware."""

import time

from prometheus_client import (
    Counter,
    Histogram,
    generate_latest,
    CONTENT_TYPE_LATEST,
)
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

REQUEST_COUNT = Counter(
    'nexora_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status']
)
REQUEST_LATENCY = Histogram(
    'nexora_request_duration_seconds',
    'HTTP request latency in seconds',
    ['method', 'endpoint']
)
ERROR_COUNT = Counter(
    'nexora_errors_total',
    'Total HTTP errors (5xx)',
    ['endpoint']
)


class MetricsMiddleware(BaseHTTPMiddleware):
    """ASGI middleware that records Prometheus counters/histograms per request."""

    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        duration = time.perf_counter() - start
        endpoint = request.url.path
        method = request.method
        status = str(response.status_code)
        REQUEST_COUNT.labels(method=method, endpoint=endpoint, status=status).inc()
        REQUEST_LATENCY.labels(method=method, endpoint=endpoint).observe(duration)
        if response.status_code >= 500:
            ERROR_COUNT.labels(endpoint=endpoint).inc()
        return response


def metrics_response() -> Response:
    """Return Prometheus-format metrics."""
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
