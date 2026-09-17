"""Nexora - Platform Integration Abstract Base.

Defines the contract that every e-commerce platform integration must fulfill.
"""

import enum
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

# 平台中文名 —— 用于面向用户的报错文案（不要把 slug 直接抛给商家看）。
PLATFORM_LABELS: dict[str, str] = {
    "taobao": "淘宝",
    "jd": "京东",
    "pdd": "拼多多",
    "douyin": "抖音",
    "shopify": "Shopify",
    "amazon": "Amazon",
    "sandbox": "沙盒",
    "other": "其他平台",
}


class PlatformCapability(str, enum.Enum):
    """平台能力标记 —— 前端据此决定显示哪些操作入口。

    只读平台（如淘宝个人账号）不会出现写操作按钮，避免用户点了才发现
    「无接口权限」。
    """

    READ = "read"                      # 拉取商品/订单/客户
    WRITE_INVENTORY = "write_inventory"  # 库存回写
    WRITE_PRICE = "write_price"          # 价格回写
    SHIP_ORDER = "ship_order"            # 发货回填（运单号）


@dataclass
class WriteResult:
    """双向同步中「写操作」的结果。

    与 SyncResult 的区别：写操作是逐条命令，成败需逐条可见
    （一条凭证错误不能让整批看起来「成功 0 条」却看不出原因）。
    """

    operation: str = ""
    succeeded: int = 0
    failed: int = 0
    errors: list[str] = field(default_factory=list)
    details: list[dict[str, Any]] = field(default_factory=list)

    @property
    def total(self) -> int:
        return self.succeeded + self.failed

    @property
    def ok(self) -> bool:
        return self.failed == 0 and not self.errors


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


def _unsupported(operation: str, platform: str) -> WriteResult:
    """构造「该平台未声明此写能力」的统一结果。"""
    label = PLATFORM_LABELS.get(platform, platform)
    return WriteResult(
        operation=operation,
        failed=0,
        errors=[f"{label}（{platform}）暂不支持{operation}。"],
    )


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

    # 能力声明 —— 子类按实际支持的接口覆盖。
    # 默认只读：未声明写能力的平台，前端不显示回写入口。
    capabilities: frozenset[str] = frozenset({PlatformCapability.READ.value})

    def supports(self, capability: PlatformCapability | str) -> bool:
        """该平台是否支持某项能力。"""
        value = (
            capability.value
            if isinstance(capability, PlatformCapability)
            else str(capability)
        )
        return value in self.capabilities

    def capability_list(self) -> list[str]:
        """稳定排序的能力列表（供 API 序列化，避免前端渲染顺序抖动）。"""
        order = [c.value for c in PlatformCapability]
        return [c for c in order if c in self.capabilities]

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

    # ------------------------------------------------------------------
    # 双向同步 —— 写操作（默认不支持，具备能力的子类覆盖）
    # ------------------------------------------------------------------

    async def update_inventory(
        self,
        config: dict[str, Any],
        workspace_id: str,
        items: list[dict[str, Any]],
    ) -> WriteResult:
        """回写库存。``items`` = ``[{"sku": "tb-123", "stock": 100}, ...]``"""
        return _unsupported("库存回写", self.platform_name)

    async def update_price(
        self,
        config: dict[str, Any],
        workspace_id: str,
        items: list[dict[str, Any]],
    ) -> WriteResult:
        """回写价格。``items`` = ``[{"sku": "tb-123", "price": 99.0}, ...]``"""
        return _unsupported("价格回写", self.platform_name)

    async def ship_order(
        self,
        config: dict[str, Any],
        workspace_id: str,
        order_number: str,
        tracking_number: str,
        carrier: str = "",
    ) -> WriteResult:
        """发货回填（运单号 + 物流公司）。"""
        return _unsupported("发货回填", self.platform_name)

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