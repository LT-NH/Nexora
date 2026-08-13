"""Nexora - Outbound Webhook Service.

Dispatches events to user-configured webhook URLs. Each webhook request
is signed with an optional HMAC-SHA256 secret for verification at the
receiving end.

Since v2 the service also acts as the event-bus subscriber registry:
``order.*`` events published on :mod:`app.services.events` are routed
back through :func:`trigger_webhooks` here, preserving the existing
outbound webhook behaviour while decoupling order handling from webhook
delivery.
"""

import hashlib
import hmac
import json
from datetime import datetime, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.webhook import Webhook
from app.services.events import subscribe
from app.utils.logging import get_logger

logger = get_logger(__name__)


async def trigger_webhooks(
    db: AsyncSession,
    workspace_id: str,
    event: str,
    payload: dict,
) -> None:
    """Trigger all active webhooks matching the given event type.

    Args:
        db: Async database session.
        workspace_id: The workspace that owns the webhooks.
        event: Event type string, e.g. ``"order.created"``.
        payload: Arbitrary data to include in the webhook body.
    """
    result = await db.execute(
        select(Webhook).where(
            Webhook.workspace_id == workspace_id,
            Webhook.is_active.is_(True),
        )
    )
    webhooks = result.scalars().all()

    if not webhooks:
        return

    for wh in webhooks:
        try:
            events = json.loads(wh.events or "[]")
        except (json.JSONDecodeError, TypeError):
            events = []

        # Skip if this webhook isn't subscribed to the event.
        # "all" is a wildcard that matches every event.
        if event not in events and "all" not in events:
            continue

        body_obj = {
            "event": event,
            "data": payload,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        body = json.dumps(body_obj)

        headers = {
            "Content-Type": "application/json",
            "X-Nexora-Event": event,
        }

        if wh.secret:
            signature = hmac.new(
                wh.secret.encode("utf-8"),
                body.encode("utf-8"),
                hashlib.sha256,
            ).hexdigest()
            headers["X-Nexora-Signature"] = signature

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(wh.url, content=body, headers=headers)
                if resp.status_code >= 400:
                    logger.warning(
                        "Webhook '%s' returned %d for event '%s'",
                        wh.name,
                        resp.status_code,
                        event,
                    )
        except Exception as exc:
            logger.warning(
                "[Webhook] Failed to deliver '%s' to '%s': %s",
                event,
                wh.url,
                exc,
            )
            continue

        wh.last_triggered_at = datetime.now(timezone.utc)

    await db.flush()


# ── Event-bus integration ──────────────────────────────────────────────────

async def trigger_webhooks_on_event(payload: dict) -> None:
    """Event-bus subscriber: dispatch outbound webhooks for a published event.

    ``payload`` is the dict published on the event bus:
    ``{"workspace_id": ..., "event": ..., "data": {...}}``.  A fresh DB
    session is opened because subscribers run fire-and-forget after the
    publishing request may already have returned.
    """
    workspace_id = payload.get("workspace_id")
    event = payload.get("event")
    data = payload.get("data", {})
    if not workspace_id or not event:
        return
    try:
        from app.database import async_session_factory
        async with async_session_factory() as db:
            await trigger_webhooks(db, workspace_id, event, data)
            await db.commit()
    except Exception:
        logger.exception("[webhook] event subscriber failed for %s", event)


async def notify_workspace_admins_on_order_created(payload: dict) -> None:
    """Event-bus subscriber: notify workspace admins when an order is created."""
    workspace_id = payload.get("workspace_id")
    if not workspace_id:
        return
    data = payload.get("data", {})
    try:
        from sqlalchemy import select as _select

        from app.database import async_session_factory
        from app.models.user import User
        from app.models.workspace import WorkspaceMember, WorkspaceRole
        from app.services.notification import NotificationService

        async with async_session_factory() as db:
            result = await db.execute(
                _select(User)
                .join(
                    WorkspaceMember,
                    WorkspaceMember.user_id == User.id,
                )
                .where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.role.in_(
                        [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]
                    ),
                )
            )
            admins = result.scalars().all()
            if not admins:
                return

            order_number = data.get("order_number") or "N/A"
            total = data.get("total") or 0
            await NotificationService.notify_workspace_members(
                db=db,
                workspace_id=workspace_id,
                user_ids=[u.id for u in admins],
                title="新订单通知",
                message=f"收到新订单 {order_number}，金额 ¥{total}",
                notification_type="order",
                link="/orders",
            )
            await db.commit()
    except Exception:
        logger.exception("[webhook] order.created notification subscriber failed")


def _register_event_subscribers() -> None:
    """Register event-bus subscribers at import time.

    Order events are routed back to :func:`trigger_webhooks` so existing
    webhook configurations keep working without order handling needing to
    know about them.
    """
    subscribe("order.created", trigger_webhooks_on_event)
    subscribe("order.updated", trigger_webhooks_on_event)
    subscribe("order.status_updated", trigger_webhooks_on_event)
    subscribe("order.created", notify_workspace_admins_on_order_created)


_register_event_subscribers()
