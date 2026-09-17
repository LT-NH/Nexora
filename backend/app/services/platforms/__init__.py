"""Nexora - E-commerce Platform Integrations.

Each platform module provides sync_products / sync_orders / sync_customers
entry points that conform to the abstract base class.
"""

from app.services.platforms.base import (
    PlatformCapability,
    PlatformIntegration,
    SyncResult,
    WriteResult,
)
from app.services.platforms.shopify import ShopifyIntegration
from app.services.platforms.douyin import DouyinIntegration
from app.services.platforms.sandbox import SandboxIntegration
from app.services.platforms.generic import GenericIntegration
from app.services.platforms.taobao import TaobaoIntegration
from app.services.platforms.jd import JdIntegration
from app.services.platforms.pdd import PddIntegration

# Registry: maps StorePlatform values to integration classes
PLATFORM_REGISTRY: dict[str, type[PlatformIntegration]] = {
    "shopify": ShopifyIntegration,
    "douyin": DouyinIntegration,
    "taobao": TaobaoIntegration,
    "jd": JdIntegration,
    "pdd": PddIntegration,
    "sandbox": SandboxIntegration,
    "amazon": GenericIntegration,
    "other": GenericIntegration,
}


def get_integration(platform: str) -> PlatformIntegration | None:
    """按平台标识取适配器实例（未知平台返回 None）。"""
    cls = PLATFORM_REGISTRY.get(platform)
    return cls() if cls else None


def platform_capabilities(platform: str) -> list[str]:
    """返回某平台声明的能力列表（供前端决定显示哪些写操作入口）。"""
    integration = get_integration(platform)
    if integration is None:
        return [PlatformCapability.READ.value]
    return integration.capability_list()


def all_platform_capabilities() -> dict[str, list[str]]:
    """全平台能力表，用于一次性下发给前端。"""
    return {
        name: platform_capabilities(name) for name in PLATFORM_REGISTRY
    }


__all__ = [
    "PlatformIntegration",
    "PlatformCapability",
    "SyncResult",
    "WriteResult",
    "ShopifyIntegration",
    "DouyinIntegration",
    "TaobaoIntegration",
    "JdIntegration",
    "PddIntegration",
    "SandboxIntegration",
    "GenericIntegration",
    "PLATFORM_REGISTRY",
    "get_integration",
    "platform_capabilities",
    "all_platform_capabilities",
]
