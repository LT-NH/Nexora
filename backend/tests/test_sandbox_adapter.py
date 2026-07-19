"""Offline integration test for the Sandbox platform adapter.

The sandbox adapter needs no network or credentials, so it exercises the
full upsert pipeline and verifies idempotent re-syncs.
"""

from sqlalchemy import func, select

from app.models.customer import Customer
from app.models.order import Order, OrderItem
from app.models.product import Product
from app.services.platforms.sandbox import SandboxIntegration


async def test_sandbox_full_sync_creates_records(workspace_id, session_factory):
    integration = SandboxIntegration()
    result = await integration.full_sync({}, workspace_id)

    assert not result.all_errors, result.all_errors

    async with session_factory() as db:
        pcount = (
            await db.execute(
                select(func.count(Product.id)).where(Product.workspace_id == workspace_id)
            )
        ).scalar()
        ocount = (
            await db.execute(
                select(func.count(Order.id)).where(Order.workspace_id == workspace_id)
            )
        ).scalar()
        ccount = (
            await db.execute(
                select(func.count(Customer.id)).where(Customer.workspace_id == workspace_id)
            )
        ).scalar()

    assert pcount == 15
    assert ocount == 30
    assert ccount == 15
    assert result.products.created == 15
    assert result.orders.created == 30
    assert result.customers.created == 15


async def test_sandbox_resync_is_idempotent(workspace_id, session_factory):
    integration = SandboxIntegration()
    await integration.full_sync({}, workspace_id)
    result2 = await integration.full_sync({}, workspace_id)

    # Second run must UPDATE, not CREATE.
    assert result2.products.created == 0 and result2.products.updated == 15
    assert result2.orders.created == 0 and result2.orders.updated == 30
    assert result2.customers.created == 0 and result2.customers.updated == 15

    # Line items must not be duplicated across re-syncs.
    async with session_factory() as db:
        licount = (
            await db.execute(
                select(func.count(OrderItem.id))
                .join(Order)
                .where(Order.workspace_id == workspace_id)
            )
        ).scalar()

    result3 = await integration.full_sync({}, workspace_id)
    async with session_factory() as db:
        licount2 = (
            await db.execute(
                select(func.count(OrderItem.id))
                .join(Order)
                .where(Order.workspace_id == workspace_id)
            )
        ).scalar()

    assert licount > 0
    assert licount2 == licount
