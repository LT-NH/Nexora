"""Nexora - 拼多多（拼多多开放平台）对接.

网关：``https://gw-api.pinduoduo.com/api/router``
（拼多多**没有独立沙箱网关**，测试靠「测试店铺 + 测试 AppKey 预发权限」）

凭证（存于 Store 表）:
  - api_key      → client_id
  - api_secret   → client_secret
  - access_token → 店铺授权令牌

参数约定与淘宝/京东的差异（容易踩坑，已在类属性里声明）:
  - 业务方法名的字段名是 ``type``（不是 ``method``）
  - AppKey 的字段名是 ``client_id``（不是 ``app_key``）
  - 时间戳是 **Unix 秒**（不是 ``yyyy-MM-dd HH:mm:ss``）
  - 必须带 ``data_type=JSON``
  - 业务参数**平铺**在顶层（不像京东包进 JSON）

**金额单位是「分」**（淘宝/京东是元），落库时已统一换算成元。

**关于收件人信息（重要）**
拼多多对收件人姓名/电话/地址做了**加密**，需要单独申请「订单加解密」权限
并完成解密改造才能拿到明文。未开通时这几个字段会缺失或为密文，
本适配器会照常落库，但**不会伪造明文**。

**关于错误分类**
``error_response.error_code`` 仅作兜底。真正的判定以报错文本语义为准，
见 :mod:`app.services.platforms.errors`。个人开发者调用订单接口会被拒，
该场景归类为 ``NO_API_PERMISSION`` 而非「凭证无效」。
"""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models.customer import Customer
from app.models.order import Order, OrderItem, OrderStatus, PaymentStatus
from app.models.product import Product, ProductStatus
from app.services.platforms.base import (
    PlatformCapability,
    SyncResult,
    WriteResult,
)
from app.services.platforms.errors import PlatformCallError
from app.services.platforms.rpc_signed import RpcSignedIntegration, digits_after_prefix
from app.utils.logging import get_logger

logger = get_logger(__name__)

PAGE_SIZE = 50
MAX_PAGES = 100

# 拼多多订单状态 → 本地订单状态（数值口径）
# 说明：拼多多的 order_status 数值语义以开放平台文档为准，此处覆盖
# 最常见的几档；未知值一律落到 PENDING，不会丢单。
PDD_ORDER_STATUS_MAP: dict[str, OrderStatus] = {
    "1": OrderStatus.CONFIRMED,   # 待发货（已支付）
    "2": OrderStatus.SHIPPED,     # 已发货
    "3": OrderStatus.DELIVERED,   # 已收货
    "4": OrderStatus.REFUNDED,    # 退款中/已退款
    "5": OrderStatus.REFUNDED,
    "6": OrderStatus.CANCELLED,
}


def _pdd_list(payload: Any, key: str) -> list[dict]:
    """拼多多的列表字段是 ``<x>_list``，取不到就兜底递归找。"""
    if not isinstance(payload, dict):
        return []
    node = payload.get(key)
    if isinstance(node, list):
        return [x for x in node if isinstance(x, dict)]
    for value in payload.values():
        if isinstance(value, list) and value and isinstance(value[0], dict):
            return [x for x in value if isinstance(x, dict)]
        if isinstance(value, dict):
            found = _pdd_list(value, key)
            if found:
                return found
    return []


def _pdd_total(payload: Any) -> int:
    if isinstance(payload, dict):
        for key in ("total_count", "total", "totalCount"):
            if key in payload:
                try:
                    return int(payload[key])
                except (TypeError, ValueError):
                    pass
        for value in payload.values():
            if isinstance(value, dict):
                found = _pdd_total(value)
                if found:
                    return found
    return 0


def _pdd_slug(title: str, fallback: str) -> str:
    cleaned = "".join(
        ch if (ch.isalnum() or ch in "-_") else "-" for ch in (title or "")
    ).strip("-")
    return f"{(cleaned[:80] or 'item')}-{fallback}"


def _to_unix(value: Any) -> int:
    """把 datetime / 字符串转成 Unix 秒（拼多多要秒级，不是毫秒）。"""
    if isinstance(value, datetime):
        dt = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    if isinstance(value, (int, float)):
        return int(value)
    try:
        parsed = datetime.fromisoformat(str(value))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return int(parsed.timestamp())
    except (TypeError, ValueError):
        return int(datetime.now(timezone.utc).timestamp())


class PddIntegration(RpcSignedIntegration):
    """拼多多店铺对接。"""

    platform_name = "pdd"

    gateway_prod = "https://gw-api.pinduoduo.com/api/router"
    gateway_sandbox = ""  # 拼多多无独立沙箱网关

    method_field = "type"
    app_key_field = "client_id"
    token_field = "access_token"
    business_param_style = "flat"
    timestamp_style = "unix"

    common_params = {
        "data_type": "JSON",
        "version": "V1",
    }

    capabilities = frozenset(
        {
            PlatformCapability.READ.value,
            PlatformCapability.WRITE_INVENTORY.value,
            PlatformCapability.WRITE_PRICE.value,
            PlatformCapability.SHIP_ORDER.value,
        }
    )

    # ==================================================================
    # 凭证校验
    # ==================================================================

    async def validate_credentials(self, config: dict[str, Any]) -> bool:
        """调 ``pdd.goods.list.get`` 做一次最小读取，验证整条授权链路。"""
        try:
            payload = await self.call(
                config,
                "pdd.goods.list.get",
                {"page": 1, "page_size": 1},
            )
        except PlatformCallError as exc:
            logger.warning("PDD credential validation failed: %s", exc.raw)
            return False
        return "goods_list" in payload or _pdd_total(payload) >= 0

    # ==================================================================
    # 商品
    # ==================================================================

    async def sync_products(
        self,
        config: dict[str, Any],
        workspace_id: str,
    ) -> SyncResult:
        """同步商品 —— ``pdd.goods.list.get``（分页拉取全量）。"""
        result = SyncResult()
        async with async_session_factory() as db:
            page = 1
            while page <= MAX_PAGES:
                try:
                    payload = await self.call(
                        config,
                        "pdd.goods.list.get",
                        {"page": page, "page_size": PAGE_SIZE},
                    )
                except PlatformCallError as exc:
                    result.errors.append(f"拼多多商品同步失败：{exc.friendly}")
                    break

                rows = _pdd_list(payload, "goods_list")
                if not rows:
                    break

                for raw in rows:
                    goods_id = str(raw.get("goods_id") or raw.get("goodsId") or "")
                    if not goods_id:
                        continue
                    try:
                        is_new = await self._upsert_product(db, workspace_id, raw)
                        if is_new:
                            result.created += 1
                        else:
                            result.updated += 1
                    except Exception as exc:  # noqa: BLE001
                        result.errors.append(f"商品 {goods_id}: {exc}")

                total = _pdd_total(payload)
                if len(rows) < PAGE_SIZE:
                    break
                if total and page * PAGE_SIZE >= total:
                    break
                page += 1

            try:
                await db.commit()
            except Exception as exc:  # noqa: BLE001
                result.errors.append(f"写入失败：{exc}")

        logger.info(
            "PDD products synced: %d created, %d updated, %d errors",
            result.created,
            result.updated,
            len(result.errors),
        )
        return result

    # ==================================================================
    # 订单
    # ==================================================================

    async def sync_orders(
        self,
        config: dict[str, Any],
        workspace_id: str,
        updated_at_min: Any = None,
    ) -> SyncResult:
        """同步订单 —— ``pdd.order.list.get``。

        该接口按**成团时间**查询，单次时间跨度建议 ≤24 小时。
        传 ``updated_at_min`` 时收紧起始时间做增量。

        说明：拼多多另有 ``pdd.order.number.list.increment.get`` 增量接口，
        但它只返回订单号、需再逐单调详情（两步流程）。本适配器先用
        ``order.list.get`` 的时间窗口实现，避免引入 N+1 调用。
        """
        result = SyncResult()
        async with async_session_factory() as db:
            page = 1
            while page <= MAX_PAGES:
                biz: dict[str, Any] = {"page": page, "page_size": PAGE_SIZE}
                if updated_at_min is not None:
                    biz["start_confirm_at"] = _to_unix(updated_at_min)
                    biz["end_confirm_at"] = _to_unix(datetime.now(timezone.utc))

                try:
                    payload = await self.call(
                        config, "pdd.order.list.get", biz
                    )
                except PlatformCallError as exc:
                    result.errors.append(f"拼多多订单同步失败：{exc.friendly}")
                    break

                rows = _pdd_list(payload, "order_list")
                if not rows:
                    break

                for raw in rows:
                    sn = str(raw.get("order_sn") or raw.get("orderSn") or "")
                    if not sn:
                        continue
                    try:
                        is_new = await self._upsert_order(db, workspace_id, raw)
                        if is_new:
                            result.created += 1
                        else:
                            result.updated += 1
                        await self._upsert_customer(db, workspace_id, raw)
                    except Exception as exc:  # noqa: BLE001
                        result.errors.append(f"订单 {sn}: {exc}")

                total = _pdd_total(payload)
                if len(rows) < PAGE_SIZE:
                    break
                if total and page * PAGE_SIZE >= total:
                    break
                page += 1

            try:
                await db.commit()
            except Exception as exc:  # noqa: BLE001
                result.errors.append(f"写入失败：{exc}")

        logger.info(
            "PDD orders synced: %d created, %d updated, %d errors",
            result.created,
            result.updated,
            len(result.errors),
        )
        return result

    # ==================================================================
    # 客户
    # ==================================================================

    async def sync_customers(
        self,
        config: dict[str, Any],
        workspace_id: str,
    ) -> SyncResult:
        """拼多多无买家列表接口，客户从订单派生（见 :meth:`sync_orders`）。"""
        return SyncResult()

    # ==================================================================
    # 双向写
    # ==================================================================

    async def update_inventory(
        self,
        config: dict[str, Any],
        workspace_id: str,
        items: list[dict[str, Any]],
    ) -> WriteResult:
        """库存回写 —— ``pdd.goods.quantity.update``。

        注意：**在资源位上的商品不能减少库存**，平台会直接拒绝。
        """
        result = WriteResult(operation="库存回写")
        async with async_session_factory() as db:
            for entry in items:
                sku = str(entry.get("sku") or "")
                stock = entry.get("stock")
                goods_id = _goods_id_from_sku(sku)
                if not goods_id or stock is None:
                    result.failed += 1
                    result.errors.append(f"{sku}: 缺少 goods_id 或库存值")
                    continue
                try:
                    biz: dict[str, Any] = {
                        "goods_id": int(goods_id),
                        "quantity": int(stock),
                    }
                    sku_id = entry.get("sku_id")
                    if sku_id:
                        biz["sku_id"] = int(sku_id)
                    await self.call(config, "pdd.goods.quantity.update", biz)
                    result.succeeded += 1
                    await _sync_local_stock(db, workspace_id, sku, int(stock))
                except PlatformCallError as exc:
                    result.failed += 1
                    result.errors.append(f"{sku}: {exc.friendly}")
            await db.commit()
        return result

    async def update_price(
        self,
        config: dict[str, Any],
        workspace_id: str,
        items: list[dict[str, Any]],
    ) -> WriteResult:
        """价格回写 —— ``pdd.goods.sku.price.update``（SKU 价格，单位**分**）。"""
        result = WriteResult(operation="价格回写")
        async with async_session_factory() as db:
            for entry in items:
                sku = str(entry.get("sku") or "")
                price = entry.get("price")
                goods_id = _goods_id_from_sku(sku)
                sku_id = entry.get("sku_id")
                if not goods_id or price is None:
                    result.failed += 1
                    result.errors.append(f"{sku}: 缺少 goods_id 或价格")
                    continue
                if not sku_id:
                    result.failed += 1
                    result.errors.append(
                        f"{sku}: 拼多多价格回写需按 SKU 操作，请提供 sku_id"
                    )
                    continue
                try:
                    await self.call(
                        config,
                        "pdd.goods.sku.price.update",
                        {
                            "goods_id": int(goods_id),
                            "sku_id": int(sku_id),
                            # 拼多多价格单位是分
                            "price": int(round(float(price) * 100)),
                        },
                    )
                    result.succeeded += 1
                    await _sync_local_price(db, workspace_id, sku, float(price))
                except PlatformCallError as exc:
                    result.failed += 1
                    result.errors.append(f"{sku}: {exc.friendly}")
            await db.commit()
        return result

    async def ship_order(
        self,
        config: dict[str, Any],
        workspace_id: str,
        order_number: str,
        tracking_number: str,
        carrier: str = "",
    ) -> WriteResult:
        """发货 —— ``pdd.logistics.online.send``（``logistics_id`` 为数字 ID）。"""
        result = WriteResult(operation="发货回填")
        order_sn = _order_sn_from_number(order_number)
        if not order_sn:
            result.failed += 1
            result.errors.append(f"{order_number}: 不是拼多多订单号（应为 PDD-<sn>）")
            return result
        if not tracking_number:
            result.failed += 1
            result.errors.append("缺少运单号")
            return result
        if not carrier:
            result.failed += 1
            result.errors.append(
                "拼多多发货需要物流公司数字 ID（logistics_id），"
                "可用 pdd.logistics.companies.get 查询后传入"
            )
            return result

        try:
            await self.call(
                config,
                "pdd.logistics.online.send",
                {
                    "order_sn": order_sn,
                    "logistics_id": int(carrier),
                    "tracking_number": tracking_number,
                },
            )
            result.succeeded += 1
            result.details.append(
                {"order": order_number, "tracking": tracking_number}
            )
        except PlatformCallError as exc:
            result.failed += 1
            result.errors.append(f"{order_number}: {exc.friendly}")
        return result

    # ==================================================================
    # 落库
    # ==================================================================

    async def _upsert_product(
        self,
        db: AsyncSession,
        workspace_id: str,
        raw: dict[str, Any],
    ) -> bool:
        goods_id = str(raw.get("goods_id") or raw.get("goodsId") or "")
        sku_code = f"pdd-{goods_id}"
        title = (raw.get("goods_name") or raw.get("goodsName") or "").strip()
        title = title or f"拼多多商品 {goods_id}"

        existing = await db.execute(
            select(Product).where(
                Product.workspace_id == workspace_id,
                Product.sku == sku_code,
            )
        )
        product = existing.scalar_one_or_none()
        is_new = product is None

        # 拼多多金额单位是分 → 转元
        price = self.to_cents(raw.get("price") or raw.get("min_group_price"))
        stock = self.to_int(raw.get("quantity") or raw.get("goods_quantity"))

        images: list[str] = []
        for key in ("thumb_url", "image_url", "hd_thumb_url"):
            url = raw.get(key)
            if url and url not in images:
                images.append(str(url))
        gallery = raw.get("goods_gallery_urls")
        if isinstance(gallery, list):
            for url in gallery:
                if url and url not in images:
                    images.append(str(url))

        if product is None:
            product = Product(
                workspace_id=workspace_id,
                name=title,
                slug=_pdd_slug(title, goods_id),
                description=str(raw.get("goods_desc") or ""),
                category=str(raw.get("cat_id") or ""),
                price=price,
                sku=sku_code,
                stock=stock,
                status=ProductStatus.ACTIVE,
                images=images,
                tags=["pdd"],
            )
            db.add(product)
        else:
            product.name = title
            product.price = price
            product.stock = stock
            product.images = images
        return is_new

    async def _upsert_order(
        self,
        db: AsyncSession,
        workspace_id: str,
        raw: dict[str, Any],
    ) -> bool:
        sn = str(raw.get("order_sn") or raw.get("orderSn") or "")
        order_number = f"PDD-{sn}"

        existing = await db.execute(
            select(Order).where(
                Order.workspace_id == workspace_id,
                Order.order_number == order_number,
            )
        )
        order = existing.scalar_one_or_none()
        is_new = order is None

        status = PDD_ORDER_STATUS_MAP.get(
            str(raw.get("order_status") or ""), OrderStatus.PENDING
        )
        # 拼多多金额单位是分
        total = self.to_cents(raw.get("pay_amount") or raw.get("goods_amount"))
        shipping = self.to_cents(raw.get("postage"))
        discount = self.to_cents(raw.get("discount_amount"))
        receiver = raw.get("receiver_name") or None
        address_text = raw.get("receiver_address") or ""
        province = raw.get("province") or ""
        city = raw.get("city") or ""
        district = raw.get("district") or ""

        address = None
        if receiver or address_text:
            address = {
                "name": str(receiver or ""),
                "phone": str(raw.get("receiver_phone") or ""),
                "province": str(province),
                "city": str(city),
                "district": str(district),
                "detail": str(address_text),
            }

        if order is None:
            order = Order(
                workspace_id=workspace_id,
                order_number=order_number,
                status=status,
                customer_name=str(receiver) if receiver else None,
                customer_email=None,
                total=total,
                shipping=shipping,
                discount=discount,
                subtotal=round(total - shipping + discount, 2),
                payment_status=(
                    PaymentStatus.PAID
                    if raw.get("pay_time") or raw.get("order_status") not in ("0",)
                    else PaymentStatus.UNPAID
                ),
                platform="pdd",
                shipping_address=address,
            )
            db.add(order)
            await db.flush()
        else:
            order.status = status
            order.total = total
            order.shipping = shipping
            order.discount = discount
            order.shipping_address = address
            await db.flush()
            await db.execute(delete(OrderItem).where(OrderItem.order_id == order.id))

        for li in _pdd_list(raw, "item_list"):
            db.add(
                OrderItem(
                    order_id=order.id,
                    product_name=str(
                        li.get("goods_name") or li.get("goodsName") or ""
                    )[:255],
                    sku=str(li.get("sku_id") or li.get("outer_id") or ""),
                    quantity=self.to_int(li.get("goods_count") or li.get("quantity"), 1),
                    unit_price=self.to_cents(
                        li.get("goods_price") or li.get("price")
                    ),
                    total_price=self.to_cents(
                        li.get("goods_amount") or li.get("pay_amount")
                    ),
                )
            )
        return is_new

    async def _upsert_customer(
        self,
        db: AsyncSession,
        workspace_id: str,
        raw: dict[str, Any],
    ) -> bool:
        """拼多多收件人信息默认加密 —— 拿不到明文时用订单号兜底建匿名客户。

        **不伪造明文**：拿不到就是拿不到，避免把密文当姓名存进库里。
        """
        name = str(raw.get("receiver_name") or "").strip()
        if not name:
            return False

        existing = await db.execute(
            select(Customer).where(
                Customer.workspace_id == workspace_id,
                Customer.name == name,
                Customer.source == "pdd",
            )
        )
        customer = existing.scalar_one_or_none()
        is_new = customer is None
        amount = self.to_cents(raw.get("pay_amount") or raw.get("goods_amount"))

        if customer is None:
            db.add(
                Customer(
                    workspace_id=workspace_id,
                    name=name,
                    email=None,
                    phone=str(raw.get("receiver_phone") or "") or None,
                    tags=["pdd"],
                    total_orders=1,
                    total_spent=amount,
                    source="pdd",
                )
            )
        else:
            customer.total_orders = max(customer.total_orders, 1)
            customer.total_spent = max(customer.total_spent, amount)
        return is_new


# ----------------------------------------------------------------------
# 模块级工具
# ----------------------------------------------------------------------

def _goods_id_from_sku(sku: str) -> str | None:
    """``pdd-123456`` → ``123456``；非数字返回 None（避免后续 int() 崩溃）。"""
    return digits_after_prefix(sku, "pdd-")


def _order_sn_from_number(order_number: str) -> str | None:
    """拼多多订单号是**字母数字混合**（如 PDD20260917001），不能强转 int。"""
    raw = (order_number or "").strip()
    if raw.startswith("PDD-"):
        raw = raw[4:].strip()
    return raw or None


async def _sync_local_stock(
    db: AsyncSession,
    workspace_id: str,
    sku: str,
    stock: int,
) -> None:
    res = await db.execute(
        select(Product).where(
            Product.workspace_id == workspace_id,
            Product.sku == sku,
        )
    )
    product = res.scalar_one_or_none()
    if product is not None:
        product.stock = stock


async def _sync_local_price(
    db: AsyncSession,
    workspace_id: str,
    sku: str,
    price: float,
) -> None:
    res = await db.execute(
        select(Product).where(
            Product.workspace_id == workspace_id,
            Product.sku == sku,
        )
    )
    product = res.scalar_one_or_none()
    if product is not None:
        product.price = price
