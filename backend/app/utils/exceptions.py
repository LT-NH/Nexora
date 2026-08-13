"""Nexora - Unified Exception Classes.

Defines a hierarchy of application-specific exceptions and provides
a registration function to wire them into the FastAPI app.
"""

from typing import Any

from fastapi import FastAPI, HTTPException as FastAPIHTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class AppException(Exception):
    """Base application exception.

    All domain-level exceptions should inherit from this class so that
    a single global handler can produce consistent JSON error responses.

    Attributes:
        status_code: HTTP status code to return.
        detail: Human-readable error message.
        error_code: Machine-readable error code for client-side handling.
    """

    status_code: int = 500
    detail: str = "An internal error occurred."
    error_code: str = "internal_error"

    def __init__(
        self,
        detail: str | None = None,
        status_code: int | None = None,
        error_code: str | None = None,
    ) -> None:
        if detail is not None:
            self.detail = detail
        if status_code is not None:
            self.status_code = status_code
        if error_code is not None:
            self.error_code = error_code
        super().__init__(self.detail)


class NotFoundException(AppException):
    """Resource not found (HTTP 404)."""

    status_code: int = 404
    detail: str = "The requested resource was not found."
    error_code: str = "not_found"


class ValidationException(AppException):
    """Request validation failure (HTTP 422)."""

    status_code: int = 422
    detail: str = "Request validation failed."
    error_code: str = "validation_error"


class ForbiddenException(AppException):
    """Insufficient permissions (HTTP 403)."""

    status_code: int = 403
    detail: str = "You do not have permission to perform this action."
    error_code: str = "forbidden"


class UnauthorizedException(AppException):
    """Authentication required or failed (HTTP 401)."""

    status_code: int = 401
    detail: str = "Authentication is required."
    error_code: str = "unauthorized"


class ConflictException(AppException):
    """Resource conflict (HTTP 409)."""

    status_code: int = 409
    detail: str = "A conflict occurred with the current state of the resource."
    error_code: str = "conflict"


class RateLimitException(AppException):
    """Too many requests (HTTP 429)."""

    status_code: int = 429
    detail: str = "Too many requests. Please try again later."
    error_code: str = "rate_limit_exceeded"


def register_exception_handlers(app: FastAPI) -> None:
    """Register global exception handlers on the FastAPI application.

    Args:
        app: The FastAPI application instance.
    """

    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
        """Handle all AppException subclasses with a consistent JSON payload."""
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error_code": exc.error_code,
                "detail": exc.detail,
            },
        )

    @app.exception_handler(RequestValidationError)
    async def request_validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        """Handle Pydantic/FastAPI request validation errors (HTTP 422).

        Returns a unified error payload while preserving the structured
        validation details produced by FastAPI.
        """
        return JSONResponse(
            status_code=422,
            content={
                "error_code": "validation_error",
                "detail": "Request validation failed.",
                "errors": exc.errors(),
            },
        )

    @app.exception_handler(FastAPIHTTPException)
    async def http_exception_handler(
        request: Request, exc: FastAPIHTTPException
    ) -> JSONResponse:
        """Handle FastAPI HTTPException while preserving status_code and detail."""
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error_code": "http_error",
                "detail": exc.detail,
            },
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(404)
    async def not_found_handler(request: Request, exc: Exception) -> JSONResponse:
        """Handle 404s, preserving business-layer detail messages."""
        # 业务层 raise 的 HTTPException(404) 也走这里 —— 保留其 detail
        if isinstance(exc, FastAPIHTTPException) and getattr(exc, "detail", None):
            return JSONResponse(
                status_code=404,
                content={"error_code": "not_found", "detail": str(exc.detail)},
                headers=getattr(exc, "headers", None),
            )
        return JSONResponse(
            status_code=404,
            content={
                "error_code": "not_found",
                "detail": "The requested path was not found.",
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        """Catch-all handler for unexpected exceptions.

        Logs the full traceback and returns a generic 500 error so that
        internal details are never leaked to the client.
        """
        import logging
        import traceback

        logger = logging.getLogger("nexora")
        logger.error(
            "Unhandled exception: %s\n%s",
            str(exc),
            traceback.format_exc(),
        )
        return JSONResponse(
            status_code=500,
            content={
                "error_code": "internal_error",
                "detail": "An unexpected error occurred. Please try again later.",
            },
        )