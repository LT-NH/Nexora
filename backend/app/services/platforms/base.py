"""Nexora - Platform Integration Abstract Base.

Defines the contract that every e-commerce platform integration must fulfill.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


@dataclass
class SyncResult:
    """Result of a single entity sync operation."""

    created: int = 0
    updated: int = 0
    skipped: int = 0
    errors: list[str] = field(default_factory=list)

    @property
    def total_synced(self) -> int:
        return self.created + self.updated

    @property
    def ok(self) -> bool:
        return len(self.errors) == 0


@dataclass
class FullSyncResult:
    """Aggregated result of a full sync (products + orders + customers)."""

    products: SyncResult = field(default_factory=SyncResult)
    orders: SyncResult = field(default_factory=SyncResult)
    customers: SyncResult = field(default_factory=SyncResult)
    discounts: SyncResult | None = None  # 仅支持折扣同步的平台填充
    started_at: datetime | None = None
    finished_at: datetime | None = None
    platform: str = ""

    @property
    def total_created(self) -> int:
        return self.products.created + self.orders.created + self.customers.created

    @property
    def total_updated(self) -> int:
        return self.products.updated + self.orders.updated + self.customers.updated

    @property
    def all_errors(self) -> list[str]:
        return self.products.errors + self.orders.errors + self.customers.errors


class PlatformIntegration(ABC):
    """Abstract base for e-commerce platform integrations.

    Each subclass must implement three methods:
      - sync_products
      - sync_orders
      - sync_customers

    The store configuration (api_key, api_secret, store_url, etc.) is passed
    to each method via the `config` dict.
    """

    platform_name: str = "generic"

    # ------------------------------------------------------------------
    # Abstract — subclasses MUST implement
    # ------------------------------------------------------------------

    @abstractmethod
    async def sync_products(
        self,
        config: dict[str, Any],
        workspace_id: str,
    ) -> SyncResult:
        """Pull products from the platform into the workspace."""
        ...

    @abstractmethod
    async def sync_orders(
        self,
        config: dict[str, Any],
        workspace_id: str,
    ) -> SyncResult:
        """Pull orders from the platform into the workspace."""
        ...

    @abstractmethod
    async def sync_customers(
        self,
        config: dict[str, Any],
        workspace_id: str,
    ) -> SyncResult:
        """Pull customers from the platform into the workspace."""
        ...

    # ------------------------------------------------------------------
    # Concrete — subclasses may override
    # ------------------------------------------------------------------

    async def validate_credentials(self, config: dict[str, Any]) -> bool:
        """Check whether the stored credentials are valid.

        Returns True if the platform API responds successfully.
        """
        return True

    async def full_sync(
        self,
        config: dict[str, Any],
        workspace_id: str,
        updated_at_min: datetime | None = None,
    ) -> FullSyncResult:
        """Run all three sync methods and return an aggregated result.

        传 ``updated_at_min`` 时执行增量同步；仅当适配器的方法签名支持该
        参数时才会透传（沙盒/未升级的适配器自动回退为全量）。
        """
        import inspect

        result = FullSyncResult(
            started_at=datetime.now(timezone.utc),
            platform=self.platform_name,
        )

        def _kwargs(method_name: str) -> dict[str, Any]:
            if updated_at_min is None:
                return {}
            try:
                sig = inspect.signature(getattr(self, method_name))
                if "updated_at_min" in sig.parameters:
                    return {"updated_at_min": updated_at_min}
            except (TypeError, ValueError):
                pass
            return {}

        result.products = await self.sync_products(
            config, workspace_id, **_kwargs("sync_products")
        )
        result.orders = await self.sync_orders(
            config, workspace_id, **_kwargs("sync_orders")
        )
        result.customers = await self.sync_customers(
            config, workspace_id, **_kwargs("sync_customers")
        )
        # 可选：优惠券/折扣同步（适配器实现了 sync_discounts 才执行）
        if hasattr(self, "sync_discounts"):
            result.discounts = await self.sync_discounts(config, workspace_id)

        result.finished_at = datetime.now(timezone.utc)
        return result