"""Integration tests for authentication endpoints.

All tests use the ``async_client`` fixture which wraps the FastAPI app
via ASGITransport with an in-memory SQLite test database.
"""

import pytest


class TestAuth:
    """Authentication endpoint tests."""

    async def test_register_user(self, async_client):
        """POST /auth/register should return 201 with user data."""
        resp = await async_client.post("/api/v1/auth/register", json={
            "email": "test@example.com",
            "password": "Test1234!",
            "full_name": "Test User",
        })
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["email"] == "test@example.com"
        assert data["full_name"] == "Test User"
        assert "id" in data
        assert data["is_active"] is True

    async def test_register_duplicate(self, async_client):
        """Second register with same email should return 409."""
        payload = {
            "email": "dup@example.com",
            "password": "Test1234!",
            "full_name": "Dup User",
        }
        resp1 = await async_client.post("/api/v1/auth/register", json=payload)
        assert resp1.status_code == 201, resp1.text

        resp2 = await async_client.post("/api/v1/auth/register", json=payload)
        assert resp2.status_code == 409, resp2.text

    async def test_login_user(self, async_client):
        """POST /auth/login should return 200 with access_token and refresh_token."""
        # Register first
        reg = await async_client.post("/api/v1/auth/register", json={
            "email": "login@example.com",
            "password": "Test1234!",
            "full_name": "Login User",
        })
        assert reg.status_code == 201, reg.text

        resp = await async_client.post("/api/v1/auth/login", json={
            "email": "login@example.com",
            "password": "Test1234!",
        })
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
        assert "expires_in" in data

    async def test_login_wrong_password(self, async_client):
        """Login with wrong password should return 401."""
        reg = await async_client.post("/api/v1/auth/register", json={
            "email": "wrongpw@example.com",
            "password": "Test1234!",
            "full_name": "Wrong PW",
        })
        assert reg.status_code == 201, reg.text

        resp = await async_client.post("/api/v1/auth/login", json={
            "email": "wrongpw@example.com",
            "password": "WrongPass1!",
        })
        assert resp.status_code == 401, resp.text

    async def test_get_me(self, async_client):
        """GET /auth/me with valid token should return user data."""
        reg = await async_client.post("/api/v1/auth/register", json={
            "email": "me@example.com",
            "password": "Test1234!",
            "full_name": "Me User",
        })
        assert reg.status_code == 201, reg.text

        login_resp = await async_client.post("/api/v1/auth/login", json={
            "email": "me@example.com",
            "password": "Test1234!",
        })
        tokens = login_resp.json()

        resp = await async_client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["email"] == "me@example.com"
        assert data["full_name"] == "Me User"

    async def test_refresh_token(self, async_client):
        """POST /auth/refresh should return a new access_token."""
        reg = await async_client.post("/api/v1/auth/register", json={
            "email": "refresh@example.com",
            "password": "Test1234!",
            "full_name": "Refresh User",
        })
        assert reg.status_code == 201, reg.text

        login_resp = await async_client.post("/api/v1/auth/login", json={
            "email": "refresh@example.com",
            "password": "Test1234!",
        })
        tokens = login_resp.json()
        refresh_tok = tokens["refresh_token"]

        resp = await async_client.post("/api/v1/auth/refresh", json={
            "refresh_token": refresh_tok,
        })
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
        assert "expires_in" in data
