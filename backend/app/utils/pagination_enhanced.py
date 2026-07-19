# Ready for adoption in existing paginated endpoints.
"""Enhanced pagination utilities."""
from typing import TypeVar, Generic
from pydantic import BaseModel

T = TypeVar("T")

class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    has_next: bool
    has_prev: bool
    pages: int

def paginate(items: list, total: int, page: int, page_size: int) -> dict:
    pages = max(1, (total + page_size - 1) // page_size)
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_next": page < pages,
        "has_prev": page > 1,
        "pages": pages,
    }
