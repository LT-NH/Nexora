"""Integration tests for Store CRUD, connection test, and sync.

Uses the sandbox platform adapter which requires no real credentials
and generates deterministic product/order/customer data.
"""

import pytest


API_PREFIX = "/api/v1/workspaces/test-workspace"


class TestStoreCRUD:
    """Store create, list, test-connection, and sync tests."""

    async def test_create_store(self, async_client, auth_headers):
        """POST /stores should return 201 with store data."""
        resp = await async_client.post(
            f"{API_PREFIX}/stores",
            json={
                "name": "My Sandbox Store",
                "platform": "sandbox",
                "store_url": "https://sandbox.example.com",
                "api_key": "sk-test-12345",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["name"] == "My Sandbox Store"
        assert data["platform"] == "sandbox"
        assert data["store_url"] == "https://sandbox.example.com"
        assert data["status"] == "disconnected"
        assert "id" in data
        assert "created_at" in data

    async def test_list_stores(self, async_client, auth_headers):
        """GET /stores should return paginated store list."""
        # Create 2 stores
        for i in range(2):
            resp = await async_client.post(
                f"{API_PREFIX}/stores",
                json={
                    "name": f"Store {i}",
                    "platform": "sandbox",
                    "api_key": f"sk-test-{i}",
                },
                headers=auth_headers,
            )
            assert resp.status_code == 201, resp.text

        resp = await async_client.get(
            f"{API_PREFIX}/stores?page=1&page_size=10",
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "items" in data
        assert data["total"] == 2
        assert len(data["items"]) == 2

    async def test_test_connection(self, async_client, auth_headers):
        """POST /stores/{id}/test should succeed for sandbox platform."""
        create_resp = await async_client.post(
            f"{API_PREFIX}/stores",
            json={
                "name": "Connection Test Store",
                "platform": "sandbox",
                "api_key": "sk-conn-test",
            },
            headers=auth_headers,
        )
        assert create_resp.status_code == 201, create_resp.text
        sid = create_resp.json()["id"]

        resp = await async_client.post(
            f"{API_PREFIX}/stores/{sid}/test",
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["store_id"] == sid
        assert data["ok"] is True
        assert "message" in data

    async def test_sync_store_sandbox(self, async_client, auth_headers):
        """POST /stores/{id}/sync should pull sandbox data into the workspace."""
        create_resp = await async_client.post(
            f"{API_PREFIX}/stores",
            json={
                "name": "Sandbox Sync Store",
                "platform": "sandbox",
                "api_key": "sk-sync-test",
            },
            headers=auth_headers,
        )
        assert create_resp.status_code == 201, create_resp.text
        sid = create_resp.json()["id"]

        resp = await async_client.post(
            f"{API_PREFIX}/stores/{sid}/sync",
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["store_id"] == sid
        assert "sandbox" in str(data["platform"]).lower()
        assert "created" in data
        assert "updated" in data
        assert "errors" in data

        # Sandbox generates 15 products, 30 orders, 15 customers
        assert data["created"]["products"] == 15
        assert data["created"]["orders"] == 30
        assert data["created"]["customers"] == 15
        assert len(data["errors"]) == 0
