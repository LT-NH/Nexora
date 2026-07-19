"""Integration test for the Shopify adapter using a mocked HTTP client.

No real network calls — ``httpx.AsyncClient`` is replaced with a fake that
returns canned Shopify JSON. This verifies:
  - credential validation (real URL + token passes, empty fails)
  - products / orders / customers are created on first sync
  - re-sync updates in place and NEVER duplicates order line items
"""

import json

import pytest
from sqlalchemy import func, select

from app.models.customer import Customer
from app.models.order import Order, OrderItem
from app.models.product import Product
from app.services.platforms.shopify import ShopifyIntegration


class _Resp:
    def __init__(self, status_code: int, data: dict, headers: dict | None = None):
        self.status_code = status_code
        self._data = data
        self.text = json.dumps(data)
        self.headers = headers or {}

    def json(self):
        return self._data


class FakeShopifyClient:
    """Minimal stand-in for httpx.AsyncClient returning canned Shopify data."""

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, url, headers=None, params=None):
        if "shop.json" in url:
            return _Resp(200, {"shop": {"name": "Test Shop"}})
        if "products.json" in url:
            return _Resp(
                200,
                {
                    "products": [
                        {
                            "id": 123,
                            "title": "Test Product",
                            "body_html": "A great product",
                            "product_type": "Digital",
                            "vendor": "Acme",
                            "tags": "a,b",
                            "images": [{"src": "http://img/1.png"}],
                            "variants": [
                                {
                                    "price": "19.90",
                                    "compare_at_price": "29.90",
                                    "barcode": "x",
                                    "weight": "1.2",
                                }
                            ],
                        }
                    ]
                },
                headers={},
            )
        if "orders.json" in url:
            return _Resp(
                200,
                {
                    "orders": [
                        {
                            "id": 555,
                            "order_number": 1001,
                            "name": "#1001",
                            "financial_status": "paid",
                            "fulfillment_status": None,
                            "total_price": "39.80",
                            "subtotal_price": "39.80",
                            "total_tax": "0.00",
                            "total_discounts": "0.00",
                            "customer": {
                                "first_name": "Jane",
                                "last_name": "Doe",
                                "email": "jane@example.com",
                            },
                            "line_items": [
                                {"title": "Test Product", "sku": "SKU1", "quantity": 2, "price": "19.90"},
                                {"title": "Add-on", "sku": "SKU2", "quantity": 1, "price": "0.00"},
                            ],
                            "created_at": "2024-01-01T00:00:00Z",
                        }
                    ]
                },
                headers={},
            )
        if "customers.json" in url:
            return _Resp(
                200,
                {
                    "customers": [
                        {
                            "id": 777,
                            "email": "jane@example.com",
                            "first_name": "Jane",
                            "last_name": "Doe",
                            "tags": "vip",
                            "orders_count": 3,
                            "total_spent": "120.00",
                        }
                    ]
                },
                headers={},
            )
        return _Resp(404, {"errors": "not found"})


@pytest.fixture
def patch_httpx(monkeypatch):
    import app.services.platforms.shopify as shopify_mod

    monkeypatch.setattr(shopify_mod.httpx, "AsyncClient", FakeShopifyClient)
    yield


async def test_shopify_validate_credentials(patch_httpx):
    integration = ShopifyIntegration()
    assert (
        await integration.validate_credentials(
            {"store_url": "https://x.myshopify.com", "api_key": "tok"}
        )
        is True
    )
    assert await integration.validate_credentials({"store_url": "", "api_key": ""}) is False


async def test_shopify_sync_creates_and_is_idempotent(
    workspace_id, session_factory, patch_httpx
):
    integration = ShopifyIntegration()
    cfg = {"store_url": "https://x.myshopify.com", "api_key": "tok"}

    r1 = await integration.full_sync(cfg, workspace_id)
    assert not r1.all_errors, r1.all_errors

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
        order = (
            await db.execute(
                select(Order).where(Order.workspace_id == workspace_id)
            )
        ).scalar_one()
        licount = (
            await db.execute(
                select(func.count(OrderItem.id)).where(OrderItem.order_id == order.id)
            )
        ).scalar()
        ccount = (
            await db.execute(
                select(func.count(Customer.id)).where(Customer.workspace_id == workspace_id)
            )
        ).scalar()

    assert pcount == 1
    assert ocount == 1
    assert ccount == 1
    assert licount == 2  # two line items in the fixture

    # Re-sync: must UPDATE, not CREATE, and keep exactly 2 line items.
    r2 = await integration.full_sync(cfg, workspace_id)
    assert r2.products.created == 0 and r2.products.updated == 1
    assert r2.orders.created == 0 and r2.orders.updated == 1
    assert r2.customers.created == 0 and r2.customers.updated == 1

    async with session_factory() as db:
        order = (
            await db.execute(
                select(Order).where(Order.workspace_id == workspace_id)
            )
        ).scalar_one()
        licount2 = (
            await db.execute(
                select(func.count(OrderItem.id)).where(OrderItem.order_id == order.id)
            )
        ).scalar()

    assert licount2 == 2
