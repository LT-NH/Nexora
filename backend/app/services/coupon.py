"""Nexora - Coupon Service.

Handles coupon CRUD and validation logic — all scoped to a workspace.
"""

from datetime import datetime, timezone
from typing import List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.coupon import Coupon, CouponType
from app.models.workspace import Workspace
from app.schemas.coupon import (
    CouponCreate,
    CouponResponse,
    CouponUpdate,
    CouponValidateResponse,
)
from app.utils.audit import create_audit_log
from app.utils.logging import get_logger

logger = get_logger(__name__)


class CouponService:
    """Service for coupon-related business logic."""

    @staticmethod
    async def create_coupon(
        db: AsyncSession,
        workspace: Workspace,
        data: CouponCreate,
        *,
        user_id: str,
    ) -> CouponResponse:
        """Create a new coupon in a workspace."""
        # Check code uniqueness within workspace
        existing = await db.execute(
            select(Coupon).where(
                Coupon.workspace_id == workspace.id,
                Coupon.code == data.code.upper().strip(),
            )
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Coupon code '{data.code}' already exists in this workspace.",
            )

        coupon = Coupon(
            workspace_id=workspace.id,
            code=data.code.upper().strip(),
            type=CouponType(data.type),
            value=data.value,
            min_order_amount=data.min_order_amount,
            max_uses=data.max_uses,
            expires_at=data.expires_at,
        )
        db.add(coupon)
        await db.flush()
        await db.refresh(coupon)

        await create_audit_log(
            db=db,
            workspace_id=workspace.id,
            user_id=user_id,
            action="coupon.created",
            resource_type="coupon",
            resource_id=coupon.id,
            details={"code": coupon.code, "type": coupon.type.value, "value": float(coupon.value)},
        )

        logger.info("Coupon created: %s (type=%s)", coupon.code, coupon.type.value)
        return CouponResponse.model_validate(coupon)

    @staticmethod
    async def list_coupons(
        db: AsyncSession,
        workspace: Workspace,
    ) -> List[CouponResponse]:
        """List all coupons in a workspace."""
        result = await db.execute(
            select(Coupon)
            .where(Coupon.workspace_id == workspace.id)
            .order_by(Coupon.created_at.desc())
        )
        coupons = result.scalars().all()
        return [CouponResponse.model_validate(c) for c in coupons]

    @staticmethod
    async def get_coupon(
        db: AsyncSession,
        workspace: Workspace,
        coupon_id: str,
    ) -> CouponResponse:
        """Get a coupon by ID."""
        result = await db.execute(
            select(Coupon).where(
                Coupon.id == coupon_id,
                Coupon.workspace_id == workspace.id,
            )
        )
        coupon = result.scalar_one_or_none()
        if coupon is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Coupon not found.",
            )
        return CouponResponse.model_validate(coupon)

    @staticmethod
    async def toggle_coupon(
        db: AsyncSession,
        workspace: Workspace,
        coupon_id: str,
        *,
        user_id: str,
    ) -> CouponResponse:
        """Toggle a coupon's active status."""
        result = await db.execute(
            select(Coupon).where(
                Coupon.id == coupon_id,
                Coupon.workspace_id == workspace.id,
            )
        )
        coupon = result.scalar_one_or_none()
        if coupon is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Coupon not found.",
            )

        coupon.is_active = not coupon.is_active
        await db.flush()
        await db.refresh(coupon)

        await create_audit_log(
            db=db,
            workspace_id=workspace.id,
            user_id=user_id,
            action="coupon.toggled",
            resource_type="coupon",
            resource_id=coupon.id,
            details={"code": coupon.code, "is_active": coupon.is_active},
        )

        logger.info("Coupon toggled: %s (active=%s)", coupon.code, coupon.is_active)
        return CouponResponse.model_validate(coupon)

    @staticmethod
    async def delete_coupon(
        db: AsyncSession,
        workspace: Workspace,
        coupon_id: str,
        *,
        user_id: str,
    ) -> None:
        """Delete a coupon."""
        result = await db.execute(
            select(Coupon).where(
                Coupon.id == coupon_id,
                Coupon.workspace_id == workspace.id,
            )
        )
        coupon = result.scalar_one_or_none()
        if coupon is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Coupon not found.",
            )

        await create_audit_log(
            db=db,
            workspace_id=workspace.id,
            user_id=user_id,
            action="coupon.deleted",
            resource_type="coupon",
            resource_id=coupon.id,
            details={"code": coupon.code},
        )

        await db.delete(coupon)
        await db.flush()

        logger.info("Coupon deleted: %s", coupon.code)

    @staticmethod
    async def validate_coupon(
        db: AsyncSession,
        workspace: Workspace,
        code: str,
        order_amount: float,
    ) -> CouponValidateResponse:
        """Validate a coupon code for a given order amount.

        Returns discount amount or an error message.
        """
        result = await db.execute(
            select(Coupon).where(
                Coupon.workspace_id == workspace.id,
                Coupon.code == code.upper().strip(),
            )
        )
        coupon = result.scalar_one_or_none()

        if coupon is None:
            return CouponValidateResponse(
                valid=False,
                message="优惠券不存在。",
            )

        if not coupon.is_active:
            return CouponValidateResponse(
                valid=False,
                code=coupon.code,
                message="该优惠券已失效。",
            )

        # SQLite 存 naive datetime —— 统一 naive UTC 比较
        now = datetime.utcnow()
        if now < coupon.starts_at:
            return CouponValidateResponse(
                valid=False,
                code=coupon.code,
                message="该优惠券尚未开始生效。",
            )

        if now > coupon.expires_at:
            return CouponValidateResponse(
                valid=False,
                code=coupon.code,
                message="该优惠券已过期。",
            )

        if coupon.used_count >= coupon.max_uses:
            return CouponValidateResponse(
                valid=False,
                code=coupon.code,
                message="该优惠券已被用完。",
            )

        if order_amount < coupon.min_order_amount:
            return CouponValidateResponse(
                valid=False,
                code=coupon.code,
                message=f"订单金额未达到最低消费 ¥{coupon.min_order_amount:.2f}。",
            )

        # Calculate discount
        discount_amount = 0.0
        if coupon.type == CouponType.PERCENT:
            discount_amount = order_amount * (coupon.value / 100)
        elif coupon.type == CouponType.FIXED:
            discount_amount = min(coupon.value, order_amount)
        elif coupon.type == CouponType.FREE_SHIPPING:
            discount_amount = 0.0  # Shipping discount handled separately

        return CouponValidateResponse(
            valid=True,
            coupon_id=coupon.id,
            code=coupon.code,
            type=coupon.type.value,
            discount_amount=round(discount_amount, 2),
            message=f"优惠券有效，可抵扣 ¥{discount_amount:.2f}。",
        )

    @staticmethod
    async def apply_coupon(
        db: AsyncSession,
        workspace: Workspace,
        coupon_id: str,
    ) -> None:
        """Increment the used_count of a coupon after successful order."""
        result = await db.execute(
            select(Coupon).where(
                Coupon.id == coupon_id,
                Coupon.workspace_id == workspace.id,
            )
        )
        coupon = result.scalar_one_or_none()
        if coupon is None:
            return

        coupon.used_count += 1
        await db.flush()
        logger.info("Coupon applied: %s (used_count=%d)", coupon.code, coupon.used_count)
