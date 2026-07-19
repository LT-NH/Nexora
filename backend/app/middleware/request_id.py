"""Global middleware: Request ID + Response Time + Error handler."""
import time, uuid
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from app.utils.errors import AppError
from fastapi.responses import JSONResponse

class RequestMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("X-Request-ID", str(uuid.uuid4())[:8])
        start = time.time()
        try:
            response: Response = await call_next(request)
        except AppError as e:
            return JSONResponse(
                status_code=e.status_code,
                content={"error": e.detail, "request_id": rid}
            )
        elapsed = int((time.time() - start) * 1000)
        response.headers["X-Request-ID"] = rid
        response.headers["X-Response-Time-Ms"] = str(elapsed)
        return response
