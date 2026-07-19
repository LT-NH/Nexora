"""Nexora - E-commerce Platform Integrations.

Each platform module provides sync_product, sync_orders, sync_customers
entry points that conform to the abstract base class.
"""

from app.services.platforms.base import PlatformIntegration
from app.services.platforms.shopify import ShopifyIntegration
from app.services.platforms.douyin import DouyinIntegration
from app.services.platforms.sandbox import SandboxIntegration
from app.services.platforms.generic import GenericIntegration

# Registry: maps StorePlatform values to integration classes
PLATFORM_REGISTRY: dict[str, type[PlatformIntegration]] = {
    "shopify": ShopifyIntegration,
    "douyin": DouyinIntegration,
    "sandbox": SandboxIntegration,
    "taobao": GenericIntegration,
    "jd": GenericIntegration,
    "pdd": GenericIntegration,
    "amazon": GenericIntegration,
    "other": GenericIntegration,
}

__all__ = [
    "PlatformIntegration",
    "ShopifyIntegration",
    "DouyinIntegration",
    "SandboxIntegration",
    "GenericIntegration",
    "PLATFORM_REGISTRY",
]