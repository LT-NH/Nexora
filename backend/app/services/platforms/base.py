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
    ) -> FullSyncResult:
        """Run all three sync methods and return an aggregated result."""
        result = FullSyncResult(
            started_at=datetime.now(timezone.utc),
            platform=self.platform_name,
        )

        result.products = await self.sync_products(config, workspace_id)
        result.orders = await self.sync_orders(config, workspace_id)
        result.customers = await self.sync_customers(config, workspace_id)

        result.finished_at = datetime.now(timezone.utc)
        return result