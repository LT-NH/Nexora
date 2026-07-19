"""Nexora - Pagination Utilities.

Provides a reusable ``PaginationParams`` dependency and a generic
``PaginatedResponse`` model for consistent list endpoints.
"""

import math
from typing import Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class PaginationParams(BaseModel):
    """FastAPI dependency for extracting pagination query parameters.

    Usage:
        @router.get("/items")
        async def list_items(
            pagination: Annotated[PaginationParams, Depends()],
            ...
        ) -> PaginatedResponse[ItemResponse]:
            ...
    """

    page: int = Field(
        default=1,
        ge=1,
        description="Page number (1-indexed).",
    )
    page_size: int = Field(
        default=20,
        ge=1,
        le=100,
        description="Number of items per page (max 100).",
    )

    @property
    def offset(self) -> int:
        """Return the SQL offset for the current page."""
        return (self.page - 1) * self.page_size

    @property
    def limit(self) -> int:
        """Return the SQL limit for the current page."""
        return self.page_size


class PaginatedResponse(BaseModel, Generic[T]):
    """Generic paginated response wrapper.

    Attributes:
        items: The list of items for the current page.
        total: Total number of items across all pages.
        page: Current page number.
        page_size: Number of items per page.
        total_pages: Total number of pages.
    """

    items: list[T]
    total: int
    page: int
    page_size: int
    total_pages: int

    @classmethod
    def create(
        cls,
        items: list[T],
        total: int,
        params: PaginationParams,
    ) -> "PaginatedResponse[T]":
        """Factory method that computes ``total_pages`` from pagination params.

        Args:
            items: The items for the current page.
            total: Total count of items.
            params: The pagination parameters used for the query.

        Returns:
            A fully populated ``PaginatedResponse`` instance.
        """
        return cls(
            items=items,
            total=total,
            page=params.page,
            page_size=params.page_size,
            total_pages=math.ceil(total / params.page_size) if total > 0 else 0,
        )