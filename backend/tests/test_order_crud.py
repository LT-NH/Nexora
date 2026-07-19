"""Integration tests for Order CRUD and statistics endpoints.

Orders reference products via line items.  Each test can create product
records inline through the product API before constructing order payloads.
"""

import pytest


API_PREFIX = "/api/v1/workspaces/test-workspace"


class TestOrderCRUD:
    """Order create, list, read, update tests."""

    async def test_create_order(self, async_client, auth_headers):
        """POST /orders with line items should return 201 with order detail."""
        resp = await async_client.post(
            f"{API_PREFIX}/orders",
            json={
                "customer_name": "Alice",
                "customer_email": "alice@example.com",
                "items": [
                    {"product_name": "Widget A", "quantity": 2, "unit_price": 10.50},
                    {"product_name": "Widget B", "quantity": 1, "unit_price": 25.00},
                ],
            },
            headers=auth_headers,
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["customer_name"] == "Alice"
        assert data["customer_email"] == "alice@example.com"
        assert data["status"] == "pending"
        assert data["payment_status"] == "unpaid"
        assert "order_number" in data
        assert "id" in data
        assert "items" in data
        assert len(data["items"]) == 2

        # Verify computed values
        names = {i["product_name"] for i in data["items"]}
        assert names == {"Widget A", "Widget B"}

        # Check total was computed from items
        item_totals = sum(i["total_price"] for i in data["items"])
        assert data["subtotal"] == item_totals

    async def test_list_orders(self, async_client, auth_headers):
        """GET /orders should return paginated order list."""
        # Create 2 orders
        for i in range(2):
            resp = await async_client.post(
                f"{API_PREFIX}/orders",
                json={
                    "customer_name": f"Customer {i}",
                    "items": [
                        {"product_name": f"Item {i}", "quantity": 1, "unit_price": 5.0},
                    ],
                },
                headers=auth_headers,
            )
            assert resp.status_code == 201, resp.text

        resp = await async_client.get(
            f"{API_PREFIX}/orders?page=1&page_size=10",
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "items" in data
        assert data["total"] == 2
        assert len(data["items"]) == 2

    async def test_get_order(self, async_client, auth_headers):
        """GET /orders/{id} should return order detail with items."""
        create_resp = await async_client.post(
            f"{API_PREFIX}/orders",
            json={
                "customer_name": "Bob",
                "customer_email": "bob@example.com",
                "items": [
                    {"product_name": "Gadget", "quantity": 3, "unit_price": 15.99},
                ],
            },
            headers=auth_headers,
        )
        assert create_resp.status_code == 201, create_resp.text
        oid = create_resp.json()["id"]

        resp = await async_client.get(
            f"{API_PREFIX}/orders/{oid}",
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["id"] == oid
        assert data["customer_name"] == "Bob"
        assert data["customer_email"] == "bob@example.com"
        assert len(data["items"]) == 1
        assert data["items"][0]["product_name"] == "Gadget"

    async def test_update_order_status(self, async_client, auth_headers):
        """PUT /orders/{id}/status should transition order status."""
        create_resp = await async_client.post(
            f"{API_PREFIX}/orders",
            json={
                "customer_name": "Charlie",
                "items": [
                    {"product_name": "Thing", "quantity": 1, "unit_price": 100.00},
                ],
            },
            headers=auth_headers,
        )
        assert create_resp.status_code == 201, create_resp.text
        oid = create_resp.json()["id"]

        resp = await async_client.put(
            f"{API_PREFIX}/orders/{oid}/status",
            json={"status": "confirmed"},
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["status"] == "confirmed"

    async def test_get_order_stats(self, async_client, auth_headers):
        """GET /orders/stats should return workspace order statistics."""
        # Create a couple of orders with different statuses
        await async_client.post(
            f"{API_PREFIX}/orders",
            json={
                "customer_name": "Stats User",
                "status": "pending",
                "items": [
                    {"product_name": "Item 1", "quantity": 2, "unit_price": 50.00},
                    {"product_name": "Item 2", "quantity": 1, "unit_price": 100.00},
                ],
            },
            headers=auth_headers,
        )
        await async_client.post(
            f"{API_PREFIX}/orders",
            json={
                "customer_name": "Stats User 2",
                "status": "delivered",
                "items": [
                    {"product_name": "Item 3", "quantity": 1, "unit_price": 200.00},
                ],
            },
            headers=auth_headers,
        )

        resp = await async_client.get(
            f"{API_PREFIX}/orders/stats",
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert isinstance(data, dict)
        # Should contain some form of stats
        assert "total_orders" in data or "total_revenue" in data or "status_counts" in data
