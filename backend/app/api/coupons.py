"""Nexora - Coupons API Routes.

Thin routes that delegate to CouponService.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import _require_member
from app.database import get_db
from app.middleware.auth import get_principal, AuthContext
from app.models.workspace import WorkspaceRole
from app.schemas.coupon import (
    CouponCreate,
    CouponResponse,
    CouponUpdate,
    CouponValidateRequest,
    CouponValidateResponse,
)
from app.services.coupon import CouponService

router = APIRouter(prefix="/workspaces/{slug}/coupons")


@router.get("", response_model=list[CouponResponse], summary="List all coupons")
async def list_coupons(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[CouponResponse]:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    return await CouponService.list_coupons(db, workspace)


@router.post(
    "",
    response_model=CouponResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a coupon",
)
async def create_coupon(
    slug: str,
    data: CouponCreate,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CouponResponse:
    workspace, membership = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)
    from app.services.permission import check_permission
    can_manage = await check_permission(db, workspace.id, principal.user_id, "manage_coupons", member=membership)
    if not can_manage:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "无权限管理优惠券")
    return await CouponService.create_coupon(db, workspace, data, user_id=principal.user_id)


@router.patch(
    "/{coupon_id}",
    response_model=CouponResponse,
    summary="Toggle coupon active/inactive",
)
async def toggle_coupon(
    slug: str,
    coupon_id: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CouponResponse:
    workspace, membership = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)
    from app.services.permission import check_permission
    can_manage = await check_permission(db, workspace.id, principal.user_id, "manage_coupons", member=membership)
    if not can_manage:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "无权限管理优惠券")
    return await CouponService.toggle_coupon(db, workspace, coupon_id, user_id=principal.user_id)


@router.delete(
    "/{coupon_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a coupon",
)
async def delete_coupon(
    slug: str,
    coupon_id: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    workspace, membership = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)
    from app.services.permission import check_permission
    can_manage = await check_permission(db, workspace.id, principal.user_id, "manage_coupons", member=membership)
    if not can_manage:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "无权限管理优惠券")
    await CouponService.delete_coupon(db, workspace, coupon_id, user_id=principal.user_id)


@router.post(
    "/validate",
    response_model=CouponValidateResponse,
    summary="Validate a coupon code for checkout",
)
async def validate_coupon(
    slug: str,
    data: CouponValidateRequest,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CouponValidateResponse:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    return await CouponService.validate_coupon(db, workspace, data.code, data.order_amount)
