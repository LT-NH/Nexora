"""Integration tests for Product and Category CRUD endpoints.

All tests require a workspace member (OWNER role) with valid JWT auth.
The ``auth_headers`` fixture from conftest handles user registration,
login, and workspace membership.
"""

import pytest


API_PREFIX = "/api/v1/workspaces/test-workspace"


class TestProductCRUD:
    """Product create, read, update, delete tests."""

    async def test_create_product(self, async_client, auth_headers):
        """POST /products should return 201 with product data."""
        resp = await async_client.post(
            f"{API_PREFIX}/products",
            json={
                "name": "Test Product",
                "slug": "test-product-1",
                "price": 99.99,
                "sku": "SKU-001",
                "status": "draft",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["name"] == "Test Product"
        assert data["slug"] == "test-product-1"
        assert data["price"] == 99.99
        assert data["sku"] == "SKU-001"
        assert data["status"] == "draft"
        assert "id" in data
        assert "created_at" in data

    async def test_list_products(self, async_client, auth_headers):
        """GET /products should return paginated list."""
        # Create 3 products
        for i in range(3):
            resp = await async_client.post(
                f"{API_PREFIX}/products",
                json={
                    "name": f"List Product {i}",
                    "slug": f"list-product-{i}",
                    "price": 10.0 + i,
                },
                headers=auth_headers,
            )
            assert resp.status_code == 201, resp.text

        # List with pagination
        resp = await async_client.get(
            f"{API_PREFIX}/products?page=1&page_size=2",
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "items" in data
        assert data["total"] == 3
        assert data["page"] == 1
        assert data["page_size"] == 2
        assert data["total_pages"] == 2
        assert len(data["items"]) == 2

    async def test_get_product(self, async_client, auth_headers):
        """GET /products/{id} should return product detail."""
        # Create first
        create_resp = await async_client.post(
            f"{API_PREFIX}/products",
            json={
                "name": "Get Me",
                "slug": "get-me",
                "price": 49.99,
            },
            headers=auth_headers,
        )
        assert create_resp.status_code == 201, create_resp.text
        pid = create_resp.json()["id"]

        resp = await async_client.get(
            f"{API_PREFIX}/products/{pid}",
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["id"] == pid
        assert data["name"] == "Get Me"
        assert data["price"] == 49.99

    async def test_update_product(self, async_client, auth_headers):
        """PUT /products/{id} should update product fields."""
        create_resp = await async_client.post(
            f"{API_PREFIX}/products",
            json={
                "name": "Before Update",
                "slug": "before-update",
                "price": 10.00,
            },
            headers=auth_headers,
        )
        assert create_resp.status_code == 201, create_resp.text
        pid = create_resp.json()["id"]

        resp = await async_client.put(
            f"{API_PREFIX}/products/{pid}",
            json={
                "name": "After Update",
                "price": 29.99,
                "status": "active",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["name"] == "After Update"
        assert data["price"] == 29.99
        assert data["status"] == "active"

    async def test_delete_product(self, async_client, auth_headers):
        """DELETE /products/{id} should return 204 and remove product."""
        create_resp = await async_client.post(
            f"{API_PREFIX}/products",
            json={
                "name": "To Delete",
                "slug": "to-delete",
                "price": 5.00,
            },
            headers=auth_headers,
        )
        assert create_resp.status_code == 201, create_resp.text
        pid = create_resp.json()["id"]

        resp = await async_client.delete(
            f"{API_PREFIX}/products/{pid}",
            headers=auth_headers,
        )
        assert resp.status_code == 204, resp.text

        # Verify it's gone
        get_resp = await async_client.get(
            f"{API_PREFIX}/products/{pid}",
            headers=auth_headers,
        )
        assert get_resp.status_code == 404


class TestCategoryCRUD:
    """Product category create and list tests."""

    async def test_create_category(self, async_client, auth_headers):
        """POST /products/categories should return 201."""
        resp = await async_client.post(
            f"{API_PREFIX}/products/categories",
            json={
                "name": "Electronics",
                "slug": "electronics",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["name"] == "Electronics"
        assert data["slug"] == "electronics"
        assert "id" in data
        assert "created_at" in data

    async def test_list_categories(self, async_client, auth_headers):
        """GET /products/categories should return all categories."""
        # Create 2 categories
        for name in ("Clothing", "Books"):
            resp = await async_client.post(
                f"{API_PREFIX}/products/categories",
                json={"name": name, "slug": name.lower()},
                headers=auth_headers,
            )
            assert resp.status_code == 201, resp.text

        resp = await async_client.get(
            f"{API_PREFIX}/products/categories",
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 2
        names = {c["name"] for c in data}
        assert names == {"Clothing", "Books"}
