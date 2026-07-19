"""Nexora - Generic Platform Integration.

Fallback for platforms that don't have a dedicated implementation yet.
Returns informative messages guiding the user to set up the integration.
"""

from typing import Any

from app.services.platforms.base import PlatformIntegration, SyncResult
from app.utils.logging import get_logger

logger = get_logger(__name__)


class GenericIntegration(PlatformIntegration):
    """Generic / not-yet-implemented platform integration.

    Does not sync real data; returns a helpful message about how to
    configure the platform.
    """

    platform_name = "generic"

    async def validate_credentials(self, config: dict[str, Any]) -> bool:
        """Always returns True — no real validation for generic platforms."""
        return True

    async def sync_products(
        self,
        config: dict[str, Any],
        workspace_id: str,
    ) -> SyncResult:
        return SyncResult(
            errors=[
                "此平台尚未实现真实商品同步。"
                "请配置 API 凭证后联系管理员启用对接。"
            ],
        )

    async def sync_orders(
        self,
        config: dict[str, Any],
        workspace_id: str,
    ) -> SyncResult:
        return SyncResult(
            errors=[
                "此平台尚未实现真实订单同步。"
                "请配置 API 凭证后联系管理员启用对接。"
            ],
        )

    async def sync_customers(
        self,
        config: dict[str, Any],
        workspace_id: str,
    ) -> SyncResult:
        return SyncResult(
            errors=[
                "此平台尚未实现真实客户同步。"
                "请配置 API 凭证后联系管理员启用对接。"
            ],
        )