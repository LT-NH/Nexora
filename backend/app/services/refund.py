"""Nexora - Refund Service.

Handles refund/after-sales request CRUD and processing logic — all scoped
to a workspace.  Every write method accepts a ``user_id`` parameter for
audit logging.
"""

from datetime import datetime, timezone
from typing import List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order, OrderStatus
from app.models.product import Product
from app.models.refund import Refund, RefundReason, RefundStatus
from app.models.workspace import Workspace
from app.schemas.refund import RefundCreate, RefundResponse, RefundUpdate
from app.utils.audit import create_audit_log
from app.utils.logging import get_logger

logger = get_logger(__name__)


class RefundService:
    """Service for refund/after-sales business logic."""

    # ── Refund CRUD ─────────────────────────────────────────────────────────

    @staticmethod
    async def create_refund(
        db: AsyncSession,
        workspace: Workspace,
        refund_data: RefundCreate,
        *,
        user_id: str,
    ) -> RefundResponse:
        """Create a new refund request.

        Validates that the order exists, belongs to the workspace, and is
        not already cancelled or refunded.
        """
        # Check order exists and is in a valid state
        result = await db.execute(
            select(Order).where(
                Order.id == refund_data.order_id,
                Order.workspace_id == workspace.id,
            )
        )
        order = result.scalar_one_or_none()

        if order is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Order not found in this workspace.",
            )

        if order.status in (OrderStatus.CANCELLED, OrderStatus.REFUNDED):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot request a refund for an order with status '{order.status.value}'.",
            )

        # Validate refund amount does not exceed order total
        if refund_data.amount > float(order.total):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Refund amount cannot exceed the order total.",
            )

        # Validate reason
        try:
            reason = RefundReason(refund_data.reason)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid refund reason: '{refund_data.reason}'. "
                f"Valid values: {[r.value for r in RefundReason]}",
            )

        refund = Refund(
            workspace_id=workspace.id,
            order_id=refund_data.order_id,
            amount=refund_data.amount,
            reason=reason,
            reason_detail=refund_data.reason_detail,
            status=RefundStatus.PENDING,
        )
        db.add(refund)
        await db.flush()
        await db.refresh(refund)

        await create_audit_log(
            db=db,
            workspace_id=workspace.id,
            user_id=user_id,
            action="refund.created",
            resource_type="refund",
            resource_id=refund.id,
            details={
                "order_id": refund.order_id,
                "amount": float(refund.amount),
                "reason": refund.reason.value,
            },
        )

        logger.info(
            "Refund created: %s for order %s (amount=%.2f)",
            refund.id,
            refund.order_id,
            refund.amount,
        )

        return _build_refund_response(refund)

    @staticmethod
    async def process_refund(
        db: AsyncSession,
        workspace: Workspace,
        refund_id: str,
        update_data: RefundUpdate,
        *,
        user_id: str,
    ) -> RefundResponse:
        """Approve or reject a pending refund request.

        On approval: transitions to APPROVED -> PROCESSING -> COMPLETED
        automatically and reverts the associated order's product stock.
        """
        result = await db.execute(
            select(Refund).where(
                Refund.id == refund_id,
                Refund.workspace_id == workspace.id,
            )
        )
        refund = result.scalar_one_or_none()

        if refund is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Refund not found.",
            )

        if refund.status != RefundStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Refund is not in pending status (current: {refund.status.value}).",
            )

        # Update status
        new_status = update_data.status
        if new_status:
            try:
                refund.status = RefundStatus(new_status)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Invalid refund status: '{new_status}'. "
                    f"Valid values: {[s.value for s in RefundStatus]}",
                )

        if update_data.reviewer_note is not None:
            refund.reviewer_note = update_data.reviewer_note

        refund.reviewed_by = user_id
        refund.updated_at = datetime.now(timezone.utc)

        # On approval: update order status and revert stock
        if refund.status == RefundStatus.APPROVED or refund.status == RefundStatus.COMPLETED:
            # Mark the order as refunded
            order_result = await db.execute(
                select(Order).where(
                    Order.id == refund.order_id,
                    Order.workspace_id == workspace.id,
                )
            )
            order = order_result.scalar_one_or_none()
            if order:
                order.status = OrderStatus.REFUNDED
                order.updated_at = datetime.now(timezone.utc)

                # Revert stock for each order item
                from app.models.order import OrderItem
                items_result = await db.execute(
                    select(OrderItem).where(OrderItem.order_id == order.id)
                )
                items = items_result.scalars().all()
                for item in items:
                    if item.product_id:
                        product_result = await db.execute(
                            select(Product).where(Product.id == item.product_id)
                        )
                        product = product_result.scalar_one_or_none()
                        if product:
                            product.stock += item.quantity

        await db.flush()
        await db.refresh(refund)

        await create_audit_log(
            db=db,
            workspace_id=workspace.id,
            user_id=user_id,
            action="refund.processed",
            resource_type="refund",
            resource_id=refund.id,
            details={
                "order_id": refund.order_id,
                "status": refund.status.value,
                "reviewer_note": refund.reviewer_note,
            },
        )

        logger.info(
            "Refund processed: %s -> %s",
            refund.id,
            refund.status.value,
        )

        return _build_refund_response(refund)

    @staticmethod
    async def list_refunds(
        db: AsyncSession,
        workspace: Workspace,
        *,
        status_filter: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[RefundResponse], int]:
        """List refunds with optional status filtering and pagination."""
        conditions = [Refund.workspace_id == workspace.id]

        if status_filter:
            try:
                conditions.append(Refund.status == RefundStatus(status_filter))
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Invalid status filter: '{status_filter}'.",
                )

        count_result = await db.execute(
            select(func.count(Refund.id)).where(*conditions)
        )
        total = count_result.scalar_one()

        data_result = await db.execute(
            select(Refund)
            .where(*conditions)
            .order_by(Refund.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        refunds = data_result.scalars().all()

        return [_build_refund_response(r) for r in refunds], total

    @staticmethod
    async def get_refund_stats(
        db: AsyncSession,
        workspace: Workspace,
    ) -> dict:
        """Return refund statistics for the workspace."""
        # Count by status
        status_counts = {}
        for s in RefundStatus:
            result = await db.execute(
                select(func.count(Refund.id)).where(
                    Refund.workspace_id == workspace.id,
                    Refund.status == s,
                )
            )
            status_counts[s.value] = result.scalar_one() or 0

        # Total refunded amount (completed refunds)
        total_result = await db.execute(
            select(func.coalesce(func.sum(Refund.amount), 0.0)).where(
                Refund.workspace_id == workspace.id,
                Refund.status.in_([RefundStatus.APPROVED, RefundStatus.COMPLETED]),
            )
        )
        total_refunded = float(total_result.scalar_one() or 0.0)

        return {
            "pending": status_counts.get("pending", 0),
            "approved": status_counts.get("approved", 0),
            "rejected": status_counts.get("rejected", 0),
            "processing": status_counts.get("processing", 0),
            "completed": status_counts.get("completed", 0),
            "total": sum(status_counts.values()),
            "total_refunded": total_refunded,
        }

    @staticmethod
    async def get_refund(
        db: AsyncSession,
        workspace: Workspace,
        refund_id: str,
    ) -> RefundResponse:
        """Get a single refund by ID."""
        result = await db.execute(
            select(Refund).where(
                Refund.id == refund_id,
                Refund.workspace_id == workspace.id,
            )
        )
        refund = result.scalar_one_or_none()

        if refund is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Refund not found.",
            )

        return _build_refund_response(refund)


# ── Helpers ─────────────────────────────────────────────────────────────────

def _build_refund_response(refund: Refund) -> RefundResponse:
    """Build a RefundResponse from a Refund model instance."""
    return RefundResponse(
        id=refund.id,
        workspace_id=refund.workspace_id,
        order_id=refund.order_id,
        amount=round(refund.amount, 2),
        reason=refund.reason.value if hasattr(refund.reason, "value") else str(refund.reason),
        reason_detail=refund.reason_detail,
        status=refund.status.value if hasattr(refund.status, "value") else str(refund.status),
        reviewer_note=refund.reviewer_note,
        reviewed_by=refund.reviewed_by,
        created_at=refund.created_at,
        updated_at=refund.updated_at,
    )
