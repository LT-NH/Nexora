"""Nexora - Inbound Webhook Handling.

Turns passive "pull-only" integrations into a live two-way connection by
accepting events pushed by external platforms.

Currently supports Shopify webhooks:
  - Verifies the ``X-Shopify-Hmac-Sha256`` signature so we never trust an
    unauthenticated request.
  - Routes order / product / customer events to the Shopify integration,
    which upserts the affected entity into the correct workspace (resolved
    from the shop domain in the headers).
"""

import base64
import hmac
import hashlib
from typing import Any

from sqlalchemy import select

from app.database import async_session_factory
from app.models.store import Store, StorePlatform
from app.services.platforms.base import SyncResult
from app.services.platforms.shopify import ShopifyIntegration
from app.utils.logging import get_logger

logger = get_logger(__name__)

# Shopify webhook topics we know how to handle today, grouped by entity.
_HANDLED_TOPICS = {
    "orders/create",
    "orders/updated",
    "orders/paid",
    "orders/partially_updated",
    "products/create",
    "products/update",
    "customers/create",
    "customers/update",
}


def verify_shopify_hmac(raw_body: bytes, header_signature: str, secret: str) -> bool:
    """Verify a Shopify webhook using its HMAC-SHA256 signature.

    Shopify computes the signature as Base64(HMAC-SHA256(raw_body, secret))
    and sends it in the ``X-Shopify-Hmac-Sha256`` header. We recompute it
    and compare in constant time.
    """
    if not secret or not header_signature:
        return False
    try:
        digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
        computed = base64.b64encode(digest).decode("utf-8")
        return hmac.compare_digest(computed, header_signature)
    except Exception as exc:
        logger.warning("Shopify HMAC verification error: %s", exc)
        return False


async def handle_shopify_webhook(
    topic: str,
    shop_domain: str,
    payload: dict[str, Any],
) -> SyncResult:
    """Process a verified Shopify webhook event.

    Resolves the local store(s) for the given shop domain, then applies the
    event. Only order events are handled for now; other topics are accepted
    but reported as "not handled" so callers can see them.

    Args:
        topic: Shopify webhook topic, e.g. ``orders/create``.
        shop_domain: Shop domain from the ``X-Shopify-Shop-Domain`` header.
        payload: Parsed JSON body of the webhook.

    Returns:
        An aggregated SyncResult across all matching stores.
    """
    result = SyncResult()

    if not topic:
        result.errors.append("Missing webhook topic.")
        return result

    if topic not in _HANDLED_TOPICS:
        # Accepted but not yet handled — keep connection resilient.
        logger.info("Shopify webhook topic '%s' received but not handled yet.", topic)
        return result

    if not shop_domain:
        result.errors.append("Missing shop domain; cannot resolve workspace.")
        return result

    async with async_session_factory() as db:
        stores = (
            await db.execute(
                select(Store).where(Store.platform == StorePlatform.SHOPIFY)
            )
        ).scalars().all()

        matched = [
            s for s in stores
            if s.store_url and shop_domain in s.store_url
        ]

        if not matched:
            result.errors.append(
                f"No Shopify store configured for domain '{shop_domain}'."
            )
            return result

        integration = ShopifyIntegration()

        # 按主题前缀选择对应的单实体 upsert
        if topic.startswith("products/"):
            upsert = integration.upsert_product_from_payload
        elif topic.startswith("customers/"):
            upsert = integration.upsert_customer_from_payload
        else:
            upsert = integration.upsert_order_from_payload

        for store in matched:
            config = {
                "store_url": store.store_url,
                "api_key": store.api_key,
                "api_secret": store.api_secret,
                "access_token": store.access_token,
            }
            try:
                # Reuse the open session to avoid a nested checkout on a
                # single-connection (SQLite) pool.
                single = await upsert(config, store.workspace_id, payload, db=db)
                result.created += single.created
                result.updated += single.updated
                result.errors.extend(single.errors)
            except Exception as exc:
                result.errors.append(f"Store '{store.name}': {exc}")

    return result
