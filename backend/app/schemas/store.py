"""Nexora - Store Schemas (Pydantic v2)."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.store import StoreStatus


class StoreCreate(BaseModel):
    """Schema for creating a new store connection."""
    name: str = Field(..., min_length=1, max_length=255)
    platform: str = Field(..., pattern=r"^(taobao|jd|pdd|douyin|shopify|amazon|sandbox|other)$")
    store_url: Optional[str] = Field(None, max_length=512)
    api_key: Optional[str] = Field(None, max_length=512)
    api_secret: Optional[str] = Field(None, max_length=512)
    access_token: Optional[str] = Field(None, max_length=2048)
    # 平台沙箱环境（淘宝 TOP 有独立沙箱网关；京东/拼多多暂无公开沙箱）
    sandbox: bool = False
    auto_sync_enabled: bool = False
    sync_interval_minutes: int = Field(60, ge=15, le=1440)


class StoreUpdate(BaseModel):
    """Schema for updating a store."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    store_url: Optional[str] = Field(None, max_length=512)
    api_key: Optional[str] = Field(None, max_length=512)
    api_secret: Optional[str] = Field(None, max_length=512)
    access_token: Optional[str] = Field(None, max_length=2048)
    sandbox: Optional[bool] = None
    status: Optional[str] = Field(None, pattern=r"^(connected|disconnected|error)$")
    auto_sync_enabled: Optional[bool] = None
    sync_interval_minutes: Optional[int] = Field(None, ge=15, le=1440)


class StoreResponse(BaseModel):
    """Schema for store data returned in API responses."""
    id: str
    workspace_id: str
    name: str
    platform: str
    store_url: Optional[str] = None
    api_key: Optional[str] = None
    access_token: Optional[str] = None
    sandbox: bool = False
    status: StoreStatus
    last_sync_at: Optional[datetime] = None
    auto_sync_enabled: bool = False
    sync_interval_minutes: int = 60
    last_sync_status: Optional[str] = None
    last_sync_errors: Optional[str] = None
    created_at: datetime
    model_config = {"from_attributes": True}


class PlatformCapabilityInfo(BaseModel):
    """某平台的能力与凭证要求 —— 前端据此渲染表单与操作入口。

    目的：**只读平台不显示写按钮**，避免用户点了才发现「无接口权限」。
    """

    platform: str
    label: str
    implemented: bool
    capabilities: list[str]
    sandbox_supported: bool
    # 需要用户填写的凭证字段（顺序即表单顺序）
    credential_fields: list[str]
    # 各字段在该平台下的叫法（AppKey / ClientID / SessionKey …）
    credential_labels: dict[str, str] = {}
    # 该平台要拿到订单类接口所需的资质门槛（如实告知，不粉饰）
    qualification_note: str


# ===========================================================================
# 双向同步 —— 写操作请求体
# ===========================================================================


class InventoryItem(BaseModel):
    """单条库存回写：本地 SKU + 目标库存。"""

    sku: str = Field(..., min_length=1)
    stock: int = Field(..., ge=0)
    # 部分平台按 SKU 维度操作（淘宝/京东/拼多多都需要）
    sku_id: Optional[str] = None


class InventoryWriteRequest(BaseModel):
    items: list[InventoryItem] = Field(..., min_length=1, max_length=200)


class PriceItem(BaseModel):
    """单条价格回写：本地 SKU + 目标价格（元）。"""

    sku: str = Field(..., min_length=1)
    price: float = Field(..., gt=0)
    sku_id: Optional[str] = None


class PriceWriteRequest(BaseModel):
    items: list[PriceItem] = Field(..., min_length=1, max_length=200)


class ShipRequest(BaseModel):
    """发货回填。``carrier`` 传物流公司名或平台数字 ID 均可。"""

    tracking_number: str = Field(..., min_length=1, max_length=128)
    carrier: str = Field("", max_length=64)


class WriteOpResponse(BaseModel):
    """写操作结果 —— 逐条可见成败，不糊成一个「成功」."""

    operation: str
    ok: bool
    succeeded: int
    failed: int
    total: int
    errors: list[str] = []
    details: list[dict] = []
