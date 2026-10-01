"""Nexora - Webhook Routes.

Two sets of endpoints:
1. Inbound webhook receivers (public, unauthenticated) — external platforms
   push events here, authenticated by platform-specific signatures.
2. Outbound webhook management (workspace-scoped, authenticated) — users
   configure where Nexora sends events.
"""

import asyncio
import json
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.services.webhooks import handle_shopify_webhook, verify_shopify_hmac
from app.utils.logging import get_logger
from app.utils.urls import UnsafeUrlError, validate_outbound_url

# ── Inbound webhook router (shared) ──────────────────────────────────────
router = APIRouter(prefix="/webhooks")
logger = get_logger(__name__)

# ── Outbound webhook management router ───────────────────────────────────
outbound = APIRouter(prefix="/workspaces/{slug}/webhooks", tags=["Outbound Webhooks"])


# =========================================================================
# INBOUND: External platform webhook receivers (public)
# =========================================================================


@router.post(
    "/shopify",
    summary="Receive a Shopify webhook",
    tags=["Webhooks"],
)
async def shopify_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Accept and process a Shopify webhook.

    Shopify signs every webhook with an HMAC-SHA256 of the raw body using
    the app's webhook secret. We verify that signature first; an invalid or
    missing signature is rejected with 401. Supported topics (orders/*) are
    then applied to the matching workspace.
    """
    raw_body = await request.body()

    header_sig = request.headers.get("X-Shopify-Hmac-Sha256", "")
    topic = request.headers.get("X-Shopify-Topic", "")
    shop_domain = request.headers.get("X-Shopify-Shop-Domain", "")

    if not settings.SHOPIFY_WEBHOOK_SECRET:
        logger.error("SHOPIFY_WEBHOOK_SECRET is not configured; rejecting webhook.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Webhook secret not configured on server.",
        )

    if not verify_shopify_hmac(raw_body, header_sig, settings.SHOPIFY_WEBHOOK_SECRET):
        logger.warning("Shopify webhook signature verification failed.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature.",
        )

    try:
        payload = json.loads(raw_body) if raw_body else {}
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON body.",
        )

    result = await handle_shopify_webhook(topic, shop_domain, payload)

    return {
        "ok": result.ok,
        "topic": topic,
        "created": result.created,
        "updated": result.updated,
        "errors": result.errors,
    }


# =========================================================================
# OUTBOUND: Workspace webhook management (authenticated)
# =========================================================================


@outbound.get("", summary="List outbound webhooks")
async def list_webhooks(
    slug: str,
    current_user: Annotated = Depends(
        __import__("app.middleware.auth", fromlist=["get_current_active_user"]).get_current_active_user
    ),
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> list[dict]:
    """Return all outbound webhooks for the workspace."""
    from app.api.deps import _require_member
    from app.models.workspace import WorkspaceRole
    from app.models.webhook import Webhook

    workspace, _ = await _require_member(slug, current_user, db, WorkspaceRole.ADMIN)

    result = await db.execute(
        select(Webhook)
        .where(Webhook.workspace_id == workspace.id)
        .order_by(Webhook.created_at.desc())
    )
    hooks = result.scalars().all()
    return [_webhook_to_dict(h) for h in hooks]


@outbound.post("", status_code=status.HTTP_201_CREATED, summary="Create an outbound webhook")
async def create_webhook(
    slug: str,
    data: dict,
    current_user: Annotated = Depends(
        __import__("app.middleware.auth", fromlist=["get_current_active_user"]).get_current_active_user
    ),
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> dict:
    """Create a new outbound webhook for the workspace.

    Body fields: name (required), url (required), events (list of strings),
    secret (optional HMAC key), is_active (bool, default true).
    """
    from app.api.deps import _require_member
    from app.models.workspace import WorkspaceRole
    from app.models.webhook import Webhook
    from app.utils.audit import create_audit_log as _create_audit

    workspace, _ = await _require_member(slug, current_user, db, WorkspaceRole.ADMIN)

    name = data.get("name", "").strip()
    url = data.get("url", "").strip()
    if not name or not url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="'name' and 'url' are required.",
        )

    # SSRF 防护：URL 完全由租户配置，必须拒绝内网 / 环回 / 保留地址。
    # DNS 解析是阻塞调用，放进线程避免卡住事件循环。
    try:
        url = await asyncio.to_thread(validate_outbound_url, url)
    except UnsafeUrlError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    webhook = Webhook(
        workspace_id=workspace.id,
        name=name,
        url=url,
        events=json.dumps(data.get("events", [])),
        secret=data.get("secret"),
        is_active=data.get("is_active", True),
    )
    db.add(webhook)
    await db.flush()
    await db.refresh(webhook)

    await _create_audit(
        db=db,
        workspace_id=workspace.id,
        user_id=current_user.id,
        action="webhook.created",
        resource_type="webhook",
        resource_id=webhook.id,
        details={"name": webhook.name, "url": webhook.url},
    )

    logger.info("Outbound webhook created: %s -> %s", webhook.name, webhook.url)
    return _webhook_to_dict(webhook)


@outbound.patch("/{hook_id}", summary="Update an outbound webhook")
async def update_webhook(
    slug: str,
    hook_id: str,
    data: dict,
    current_user: Annotated = Depends(
        __import__("app.middleware.auth", fromlist=["get_current_active_user"]).get_current_active_user
    ),
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> dict:
    """Toggle webhook active state or update fields."""
    from app.api.deps import _require_member
    from app.models.workspace import WorkspaceRole
    from app.models.webhook import Webhook

    workspace, _ = await _require_member(slug, current_user, db, WorkspaceRole.ADMIN)

    result = await db.execute(
        select(Webhook).where(
            Webhook.id == hook_id,
            Webhook.workspace_id == workspace.id,
        )
    )
    webhook = result.scalar_one_or_none()
    if webhook is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook not found.",
        )

    if "name" in data:
        webhook.name = data["name"].strip()
    if "url" in data:
        # 与创建端点同样的 SSRF 校验 —— 否则可以先建一个合法 URL、
        # 再 PATCH 成内网地址来绕过。
        try:
            webhook.url = await asyncio.to_thread(
                validate_outbound_url, data["url"].strip()
            )
        except UnsafeUrlError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    if "events" in data:
        webhook.events = json.dumps(data["events"])
    if "secret" in data:
        webhook.secret = data["secret"]
    if "is_active" in data:
        webhook.is_active = bool(data["is_active"])

    await db.flush()
    await db.refresh(webhook)

    logger.info("Outbound webhook updated: %s", webhook.name)
    return _webhook_to_dict(webhook)


@outbound.delete("/{hook_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete an outbound webhook")
async def delete_webhook(
    slug: str,
    hook_id: str,
    current_user: Annotated = Depends(
        __import__("app.middleware.auth", fromlist=["get_current_active_user"]).get_current_active_user
    ),
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> None:
    """Delete an outbound webhook."""
    from app.api.deps import _require_member
    from app.models.workspace import WorkspaceRole
    from app.models.webhook import Webhook
    from app.utils.audit import create_audit_log as _create_audit

    workspace, _ = await _require_member(slug, current_user, db, WorkspaceRole.ADMIN)

    result = await db.execute(
        select(Webhook).where(
            Webhook.id == hook_id,
            Webhook.workspace_id == workspace.id,
        )
    )
    webhook = result.scalar_one_or_none()
    if webhook is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook not found.",
        )

    await _create_audit(
        db=db,
        workspace_id=workspace.id,
        user_id=current_user.id,
        action="webhook.deleted",
        resource_type="webhook",
        resource_id=webhook.id,
        details={"name": webhook.name},
    )

    await db.delete(webhook)
    await db.flush()

    logger.info("Outbound webhook deleted: %s", webhook.name)


@outbound.post("/{hook_id}/test", summary="Send a test payload")
async def test_webhook(
    slug: str,
    hook_id: str,
    current_user: Annotated = Depends(
        __import__("app.middleware.auth", fromlist=["get_current_active_user"]).get_current_active_user
    ),
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> dict:
    """Send a test ping to the webhook URL."""
    from app.api.deps import _require_member
    from app.models.workspace import WorkspaceRole
    from app.models.webhook import Webhook

    workspace, _ = await _require_member(slug, current_user, db, WorkspaceRole.ADMIN)

    result = await db.execute(
        select(Webhook).where(
            Webhook.id == hook_id,
            Webhook.workspace_id == workspace.id,
        )
    )
    webhook = result.scalar_one_or_none()
    if webhook is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook not found.",
        )

    # Send test payload
    import hashlib as _hashlib
    import hmac as _hmac

    import httpx as _httpx

    body_obj = {
        "event": "test",
        "data": {"message": "This is a test payload from Nexora."},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    body = json.dumps(body_obj)

    headers = {
        "Content-Type": "application/json",
        "X-Nexora-Event": "test",
    }
    if webhook.secret:
        headers["X-Nexora-Signature"] = _hmac.new(
            webhook.secret.encode("utf-8"),
            body.encode("utf-8"),
            _hashlib.sha256,
        ).hexdigest()

    # 发送前再校验一次（防止这是加校验之前写入的历史数据）；
    # follow_redirects=False 阻断「公网地址 302 跳内网」的绕过，
    # trust_env=False 避免走环境里的 HTTP 代理。
    try:
        await asyncio.to_thread(validate_outbound_url, webhook.url)
    except UnsafeUrlError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    try:
        async with _httpx.AsyncClient(
            timeout=10, follow_redirects=False, trust_env=False
        ) as client:
            resp = await client.post(webhook.url, content=body, headers=headers)
            webhook.last_triggered_at = datetime.now(timezone.utc)
            await db.flush()
            # 不回显响应体：否则任何 OWNER 都能把这个端点当成「内网服务读取器」
            # （填入内网地址 → 点测试 → 从 response_body 读结果）。
            return {
                "status": "sent",
                "response_status": resp.status_code,
            }
    except Exception as exc:
        logger.warning("Webhook test failed for '%s': %s", webhook.name, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to reach webhook URL: {exc}",
        )


# ── Helpers ──────────────────────────────────────────────────────────────


def _webhook_to_dict(wh) -> dict:
    """Convert a Webhook ORM model to a dictionary for JSON responses."""
    try:
        events = json.loads(wh.events or "[]")
    except (json.JSONDecodeError, TypeError):
        events = []
    return {
        "id": wh.id,
        "workspace_id": wh.workspace_id,
        "name": wh.name,
        "url": wh.url,
        "events": events,
        "secret_set": bool(wh.secret),
        "is_active": wh.is_active,
        "last_triggered_at": wh.last_triggered_at.isoformat() if wh.last_triggered_at else None,
        "created_at": wh.created_at.isoformat() if wh.created_at else None,
    }
