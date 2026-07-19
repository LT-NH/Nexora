"""Nexora - Orders API Routes (thin).

Every route follows the same pattern:
  1. Extract params from request
  2. Get principal / workspace from dependency helpers
  3. Call OrderService static method
  4. Return response
"""

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import _require_member
from app.database import get_db
from app.middleware.auth import get_principal, AuthContext
from app.models.workspace import WorkspaceRole
from app.schemas.order import (
    OrderCreate,
    OrderDetailResponse,
    OrderResponse,
    OrderUpdate,
)
from app.services.order import OrderService
from app.utils.pagination import PaginatedResponse, PaginationParams

router = APIRouter(prefix="/workspaces/{slug}/orders")


# ===========================================================================
# Order CRUD
# ===========================================================================


@router.get(
    "",
    response_model=PaginatedResponse[OrderResponse],
    summary="List orders (paginated)",
)
async def list_orders(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
    pagination: Annotated[PaginationParams, Depends()],
    status: Optional[str] = Query(None, description="Filter by order status"),
    search: Optional[str] = Query(None, description="Search by order number"),
    date_from: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    customer_id: Optional[str] = Query(None, description="Filter by customer ID"),
) -> PaginatedResponse[OrderResponse]:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    items, total = await OrderService.list_orders(
        db, workspace,
        status_filter=status,
        search=search,
        date_from=date_from,
        date_to=date_to,
        customer_id=customer_id,
        skip=pagination.offset,
        limit=pagination.limit,
    )
    return PaginatedResponse.create(items=items, total=total, params=pagination)


@router.post(
    "",
    response_model=OrderDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an order",
)
async def create_order(
    slug: str,
    order_data: OrderCreate,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrderDetailResponse:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)
    return await OrderService.create_order(
        db, workspace, order_data, user_id=principal.user_id,
    )


@router.get(
    "/stats",
    summary="Get order statistics",
)
async def get_order_stats(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    return await OrderService.get_order_stats(db, workspace)


@router.get(
    "/{order_id}",
    response_model=OrderDetailResponse,
    summary="Get order detail",
)
async def get_order(
    slug: str,
    order_id: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrderDetailResponse:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    return await OrderService.get_order(db, workspace, order_id)


@router.put(
    "/{order_id}/status",
    response_model=OrderResponse,
    summary="Update order status",
)
async def update_order_status(
    slug: str,
    order_id: str,
    status_data: OrderUpdate,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrderResponse:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)
    return await OrderService.update_order_status(
        db, workspace, order_id, status_data, user_id=principal.user_id,
    )


@router.put(
    "/{order_id}",
    response_model=OrderResponse,
    summary="Update order",
)
async def update_order(
    slug: str,
    order_id: str,
    update_data: OrderUpdate,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrderResponse:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)
    return await OrderService.update_order(
        db, workspace, order_id, update_data, user_id=principal.user_id,
    )


@router.delete(
    "/{order_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete order",
)
async def delete_order(
    slug: str,
    order_id: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)
    await OrderService.delete_order(
        db, workspace, order_id, user_id=principal.user_id,
    )
