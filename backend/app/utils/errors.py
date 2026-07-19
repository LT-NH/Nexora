"""Unified error response and global exception handlers."""

class AppError(Exception):
    status_code = 500
    detail = "Internal Server Error"
    def __init__(self, detail=None, status_code=None):
        if detail: self.detail = detail
        if status_code: self.status_code = status_code

class NotFoundError(AppError): status_code = 404; detail = "Not Found"
class BadRequestError(AppError): status_code = 400; detail = "Bad Request"
class UnauthorizedError(AppError): status_code = 401; detail = "Unauthorized"
class ForbiddenError(AppError): status_code = 403; detail = "Forbidden"
class ConflictError(AppError): status_code = 409; detail = "Conflict"
