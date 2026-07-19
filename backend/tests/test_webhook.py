"""Tests for the inbound Shopify webhook handling.

Covers:
  - HMAC signature verification (valid / invalid / missing secret)
  - a verified ``orders/create`` webhook upserts the order into the right
    workspace (resolved from the shop domain)
  - a repeat ``orders/updated`` webhook updates rather than duplicates
"""

import base64
import hashlib
import hmac
import uuid

from sqlalchemy import func, select

from app.models.order import Order, OrderItem
from app.models.store import Store, StorePlatform, StoreStatus
from app.services.webhooks import handle_shopify_webhook, verify_shopify_hmac

SECRET = "test-secret"


async def test_verify_hmac_valid_and_invalid():
    body = b'{"id": 1}'
    sig = base64.b64encode(
        hmac.new(SECRET.encode(), body, hashlib.sha256).digest()
    ).decode()

    assert verify_shopify_hmac(body, sig, SECRET) is True
    assert verify_shopify_hmac(body, "wrong", SECRET) is False
    # Missing secret must never validate.
    assert verify_shopify_hmac(body, sig, "") is False


async def test_webhook_upserts_order(workspace_id, session_factory):
    # Seed a Shopify store bound to a shop domain.
    async with session_factory() as db:
        store = Store(
            id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            name="My Shopify",
            platform=StorePlatform.SHOPIFY,
            store_url="https://my-test-store.myshopify.com",
            api_key="tok",
            status=StoreStatus.DISCONNECTED,
        )
        db.add(store)
        await db.commit()

    order_payload = {
        "id": 999,
        "order_number": 2002,
        "name": "#2002",
        "financial_status": "paid",
        "fulfillment_status": "fulfilled",
        "total_price": "59.70",
        "subtotal_price": "59.70",
        "total_tax": "0.00",
        "total_discounts": "0.00",
        "customer": {"first_name": "A", "last_name": "B", "email": "a@example.com"},
        "line_items": [
            {"title": "Item1", "sku": "S1", "quantity": 3, "price": "19.90"},
        ],
        "created_at": "2024-02-01T00:00:00Z",
    }

    result = await handle_shopify_webhook(
        "orders/create", "my-test-store.myshopify.com", order_payload
    )
    assert result.ok, result.errors
    assert result.created == 1

    async with session_factory() as db:
        order = (
            await db.execute(
                select(Order).where(
                    Order.workspace_id == workspace_id,
                    Order.order_number == "SP-2002",
                )
            )
        ).scalar_one()
        licount = (
            await db.execute(
                select(func.count(OrderItem.id)).where(OrderItem.order_id == order.id)
            )
        ).scalar()
    assert licount == 1

    # A follow-up update event must UPDATE, not duplicate.
    result2 = await handle_shopify_webhook(
        "orders/updated", "my-test-store.myshopify.com", order_payload
    )
    assert result2.updated == 1

    async with session_factory() as db:
        order = (
            await db.execute(
                select(Order).where(Order.order_number == "SP-2002")
            )
        ).scalar_one()
        licount2 = (
            await db.execute(
                select(func.count(OrderItem.id)).where(OrderItem.order_id == order.id)
            )
        ).scalar()
    assert licount2 == 1
