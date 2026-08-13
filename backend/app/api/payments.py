"""Nexora - Payments API Routes.

Endpoints for the sandbox (mock) payment flow — 支付宝 / 微信 scan-to-pay:

- ``GET``   /workspaces/{slug}/payments        — list payments
- ``POST``  /workspaces/{slug}/payments        — create payment + mock QR
- ``POST``  /workspaces/{slug}/payments/{trade_no}/confirm — simulate payment success
"""

from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import _require_member
from app.database import get_db
from app.middleware.auth import AuthContext, get_principal
from app.models.workspace import WorkspaceRole
from app.schemas.payment import (
    PaymentConfirm,
    PaymentCreate,
    PaymentCreateResponse,
    PaymentResponse,
)
from app.services.payment import PaymentService

router = APIRouter(prefix="/workspaces/{slug}/payments")


@router.get(
    "",
    response_model=list[PaymentResponse],
    summary="List payments",
)
async def list_payments(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[PaymentResponse]:
    """Return all payments for the workspace, newest first."""
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    return await PaymentService.list_payments(db, workspace)


@router.post(
    "",
    response_model=PaymentCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a sandbox payment (returns mock QR)",
)
async def create_payment(
    slug: str,
    payment_data: PaymentCreate,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PaymentCreateResponse:
    """Create a PENDING sandbox payment for an unpaid order.

    Returns the payment record plus a mock QR payload (``qr`` image URL and
    ``trade_no``). Use ``trade_no`` to simulate payment success.
    """
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)
    return await PaymentService.create_payment(
        db,
        workspace,
        order_id=payment_data.order_id,
        method=payment_data.method,
    )


@router.post(
    "/{trade_no}/confirm",
    response_model=PaymentConfirm,
    summary="Confirm a sandbox payment (simulate success)",
)
async def confirm_payment(
    slug: str,
    trade_no: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PaymentConfirm:
    """Simulate a successful payment for the given mock trade number.

    Marks the payment as PAID and confirms the linked order (if still
    pending).
    """
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)
    payment = await PaymentService.confirm_payment(db, workspace, trade_no)
    return PaymentConfirm(payment=payment)
