"""Nexora - Webhook Receiver Routes.

Public, unauthenticated endpoints that external platforms call to push
events. Each request is authenticated by a platform-specific signature
(e.g. Shopify's HMAC) rather than by a user token.
"""

import json

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.services.webhooks import handle_shopify_webhook, verify_shopify_hmac
from app.utils.logging import get_logger

router = APIRouter(prefix="/webhooks")
logger = get_logger(__name__)


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
