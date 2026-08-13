"""Nexora - Payment Service.

Sandbox payment flow for 支付宝 / 微信 scan-to-pay simulation. All queries are
scoped to a workspace. ``provider_trade_no`` is the mock provider transaction
number (also used as the ``trade_no`` in the QR payload).
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order, OrderStatus, PaymentStatus as OrderPaymentStatus
from app.models.payment import Payment, PaymentStatus
from app.models.workspace import Workspace
from app.schemas.payment import (
    PaymentCreateResponse,
    PaymentResponse,
)
from app.utils.exceptions import NotFoundException, ValidationException
from app.utils.logging import get_logger

logger = get_logger(__name__)

# Mock payment gateway (QR generation service).
_QR_BASE_URL = "https://api.qrserver.com/v1/create-qr-code/"


class PaymentService:
    """Service for sandbox payment business logic."""

    @staticmethod
    async def create_payment(
        db: AsyncSession,
        workspace: Workspace,
        order_id: str,
        method: str,
    ) -> PaymentCreateResponse:
        """Create a PENDING sandbox payment for an unpaid order.

        Args:
            db: Async database session.
            workspace: The workspace the payment belongs to.
            order_id: The ID of the order being paid for.
            method: ``'alipay'`` or ``'wechat'``.

        Returns:
            A ``PaymentCreateResponse`` with the payment record plus the mock
            QR payload (``qr`` URL and ``trade_no``).

        Raises:
            NotFoundException: If the order does not exist in this workspace.
            ValidationException: If the order is already paid, or the method
                is invalid.
        """
        # Validate method
        if method not in ("alipay", "wechat"):
            raise ValidationException(
                f"Invalid payment method: '{method}'. Valid values: alipay, wechat.",
            )

        # Validate order exists & belongs to workspace
        result = await db.execute(
            select(Order).where(
                Order.id == order_id,
                Order.workspace_id == workspace.id,
            )
        )
        order = result.scalar_one_or_none()
        if order is None:
            raise NotFoundException("Order not found in this workspace.")

        # Validate order is unpaid
        if order.payment_status != OrderPaymentStatus.UNPAID:
            raise ValidationException(
                f"Order is not unpaid (current payment status: "
                f"'{order.payment_status.value}').",
            )

        # Generate mock provider trade no, e.g. mockali1a2b3c4d5e6f
        provider_trade_no = f"mock{method[:3]}{uuid.uuid4().hex[:12]}"

        payment = Payment(
            workspace_id=workspace.id,
            order_id=order.id,
            method=method,
            amount=float(order.total or 0.0),
            status=PaymentStatus.PENDING,
            provider_trade_no=provider_trade_no,
        )
        db.add(payment)
        await db.flush()
        await db.refresh(payment)

        qr = (
            f"{_QR_BASE_URL}?data=nexora:{provider_trade_no}&size=200x200"
        )

        logger.info(
            "Sandbox payment created: %s (method=%s, amount=%.2f)",
            provider_trade_no,
            method,
            float(payment.amount),
        )

        return PaymentCreateResponse(
            id=payment.id,
            workspace_id=payment.workspace_id,
            order_id=payment.order_id,
            method=payment.method,
            amount=float(payment.amount),
            status=payment.status.value,
            provider_trade_no=payment.provider_trade_no,
            paid_at=payment.paid_at,
            created_at=payment.created_at,
            updated_at=payment.updated_at,
            qr=qr,
            trade_no=provider_trade_no,
        )

    @staticmethod
    async def confirm_payment(
        db: AsyncSession,
        workspace: Workspace,
        trade_no: str,
    ) -> PaymentResponse:
        """Mark a PENDING payment as PAID and confirm the linked order.

        Only transitions from PENDING. On success the order's
        ``payment_status`` becomes ``paid`` and its ``status`` becomes
        ``confirmed``.

        Args:
            db: Async database session.
            workspace: The workspace the payment belongs to.
            trade_no: The provider trade number to confirm.

        Returns:
            The updated ``PaymentResponse``.

        Raises:
            NotFoundException: If no matching payment exists.
            ValidationException: If the payment is not in PENDING state.
        """
        result = await db.execute(
            select(Payment).where(
                Payment.provider_trade_no == trade_no,
                Payment.workspace_id == workspace.id,
            )
        )
        payment = result.scalar_one_or_none()
        if payment is None:
            raise NotFoundException(
                f"Payment with trade no '{trade_no}' not found in this workspace.",
            )

        if payment.status != PaymentStatus.PENDING:
            raise ValidationException(
                f"Payment is not in pending status (current: "
                f"'{payment.status.value}').",
            )

        payment.status = PaymentStatus.PAID
        payment.paid_at = datetime.now(timezone.utc)

        # Confirm the linked order (only if it was still pending)
        order_result = await db.execute(
            select(Order).where(
                Order.id == payment.order_id,
                Order.workspace_id == workspace.id,
            )
        )
        order = order_result.scalar_one_or_none()
        if order is not None and order.status == OrderStatus.PENDING:
            order.payment_status = OrderPaymentStatus.PAID
            order.status = OrderStatus.CONFIRMED

        await db.flush()
        await db.refresh(payment)

        logger.info(
            "Sandbox payment confirmed: %s (order=%s)",
            payment.provider_trade_no,
            payment.order_id,
        )

        return _build_payment_response(payment)

    @staticmethod
    async def list_payments(
        db: AsyncSession,
        workspace: Workspace,
    ) -> list[PaymentResponse]:
        """List all payments in the workspace, newest first."""
        result = await db.execute(
            select(Payment)
            .where(Payment.workspace_id == workspace.id)
            .order_by(Payment.created_at.desc())
        )
        payments = result.scalars().all()
        return [_build_payment_response(p) for p in payments]


# ── Helpers ─────────────────────────────────────────────────────────────────


def _build_payment_response(payment: Payment) -> PaymentResponse:
    """Build a PaymentResponse from a Payment model instance."""
    return PaymentResponse(
        id=payment.id,
        workspace_id=payment.workspace_id,
        order_id=payment.order_id,
        method=payment.method,
        amount=float(payment.amount),
        status=payment.status.value if hasattr(payment.status, "value") else str(payment.status),
        provider_trade_no=payment.provider_trade_no,
        paid_at=payment.paid_at,
        created_at=payment.created_at,
        updated_at=payment.updated_at,
    )
