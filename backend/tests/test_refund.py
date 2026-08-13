"""Tests for the refund / after-sales service.

Covers:
  - creating a refund links it to the workspace and records the reason
  - refund stats aggregate correctly across statuses
  - approving a refund transitions the status
"""

import uuid

from sqlalchemy import select

from app.models.order import Order, OrderStatus
from app.models.refund import Refund, RefundReason, RefundStatus
from app.models.workspace import Workspace
from app.schemas.refund import RefundCreate, RefundUpdate
from app.services.refund import RefundService


async def test_create_refund(workspace_id, session_factory):
    async with session_factory() as db:
        order = Order(
            id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            customer_name="退款测试客户",
            order_number=str(uuid.uuid4())[:8].upper(),
            subtotal=199.0,
            total=199.0,
            status=OrderStatus.DELIVERED,
        )
        db.add(order)
        await db.flush()

        ws = (await db.execute(select(Workspace).where(Workspace.id == workspace_id))).scalar_one()
        service = RefundService()
        refund = await service.create_refund(
            db=db,
            workspace=ws,
            refund_data=RefundCreate(
                order_id=order.id,
                amount=99.5,
                reason="quality",
                reason_detail="收到货有破损",
            ),
            user_id=workspace_id,
        )

        stored = (await db.execute(select(Refund).where(Refund.id == refund.id))).scalar_one()
        assert stored.workspace_id == workspace_id
        assert stored.order_id == order.id
        assert stored.amount == 99.5
        assert stored.status == RefundStatus.PENDING


async def test_refund_stats(workspace_id, session_factory):
    async with session_factory() as db:
        for amount, status in [
            (50.0, RefundStatus.PENDING),
            (30.0, RefundStatus.COMPLETED),
            (20.0, RefundStatus.PENDING),
        ]:
            db.add(Refund(
                id=str(uuid.uuid4()),
                workspace_id=workspace_id,
                order_id=str(uuid.uuid4()),
                amount=amount,
                reason=RefundReason.OTHER,
                status=status,
            ))
        await db.flush()

        ws = (await db.execute(select(Workspace).where(Workspace.id == workspace_id))).scalar_one()
        service = RefundService()
        stats = await service.get_refund_stats(db, ws)
        assert stats["pending"] == 2
        assert stats["completed"] == 1
        assert stats["total"] == 3
        assert stats["total_refunded"] == 30.0


async def test_process_refund_approves(workspace_id, session_factory):
    async with session_factory() as db:
        refund = Refund(
            id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            order_id=str(uuid.uuid4()),
            amount=80.0,
            reason=RefundReason.WRONG_ITEM,
            status=RefundStatus.PENDING,
        )
        db.add(refund)
        await db.flush()

        ws = (await db.execute(select(Workspace).where(Workspace.id == workspace_id))).scalar_one()
        service = RefundService()
        updated = await service.process_refund(
            db=db,
            workspace=ws,
            refund_id=refund.id,
            update_data=RefundUpdate(status="approved", reviewer_note="同意退款"),
            user_id=workspace_id,
        )
        assert updated.status == "approved"
