"""Nexora - 京东 POP（宙斯 JOS / 京东商家开放平台）对接.

网关：``https://api.jd.com/routerjson``

**接入入口变更（时效性）**：原宙斯开发者中心 ``jos.jd.com`` 已于
2026-08-30 关闭，新应用请从 **京东商家开放平台** ``https://open.jd.com`` 接入。

凭证（存于 Store 表）:
  - api_key      → AppKey
  - api_secret   → AppSecret
  - access_token → 店铺 OAuth2.0 授权令牌（有效期通常 30 天，需刷新）

**关于接口权限的现实约束（重要）**
订单、库存、价格等「商家私有数据接口」**个人开发者账号申请不到**，
调用会返回权限不足（``code:2001``）或「应用不存在」。本适配器会把这类
响应归类为 ``NO_API_PERMISSION`` / ``PERMISSION_NEEDED``，而不是
「凭证无效」——否则商家会反复重填 AppKey，实际是自己没有企业资质。

**关于签名（联调校准点）**
宙斯 ``jingdong.*`` 接口的签名为
``MD5(app_secret + ASCII升序的 k+v 拼接 + app_secret)`` 转大写，且
**空值参数必须剔除**。网上流传的另外两种变体（尾部单侧拼接 secret、
``k=v&k=v&app_secret=`` 形式）属于京东联盟/开放平台 2.0 的 ``jd.*`` 接口，
与本适配器面向的宙斯接口不同。若首次联调报签名错误，先核对此项。

**关于业务参数**
宙斯把业务参数整体序列化进 ``360buy_param_json``（不是平铺）。
"""

import json
from datetime import datetime
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

PAGE_SIZE = 50  # JD 单页上限 50（订单接口为 100）
MAX_PAGES = 100  # JD 分页超过 100 页会返回空数据

# 上架状态值（京东口径）：8=上架，2=自主下架，4=系统下架
WARE_STATUS_ONSALE = 8

# 京东订单状态 → 本地订单状态
ORDER_STATE_MAP: dict[str, OrderStatus] = {
    "WAIT_SELLER_STOCK_OUT": OrderStatus.CONFIRMED,
    "WAIT_SELLER_DELIVERY": OrderStatus.PROCESSING,
    "WAIT_GOODS_RECEIVE_CONFIRM": OrderStatus.SHIPPED,
    "RECEIPT_CONFIRM": OrderStatus.DELIVERED,
    "FINISHED_L": OrderStatus.DELIVERED,
    "TRADE_CANCELED": OrderStatus.CANCELLED,
    "TRADE_CLOSED": OrderStatus.CANCELLED,
    "TRADE_REFUNDED": OrderStatus.REFUNDED,
}

# 常用物流公司 ID（京东 ``jingdong.pop.order.shipment`` 要数字 ID，
# 不是公司名）。商家可在京麦后台「我的配送」查看自己的签约承运商。
CARRIER_ID_MAP: dict[str, str] = {
    "中通快递": "1499",
    "韵达快递": "1327",
    "申通快递": "470",
    "圆通速递": "463",
    "顺丰速运": "467",
    "邮政EMS": "465",
    "德邦快递": "3046",
    "京东快递": "2087",
    "厂家自送": "1274",
}

# 商品搜索可选返回字段
WARE_FIELDS = ["wareId", "title", "wareStatus", "jdPrice", "stockNum", "modified"]


def _first_list(payload: Any, keys: tuple[str, ...]) -> list[dict]:
    """在嵌套结构里找到第一个命中候选键的列表（京东字段命名不稳定）。"""
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if not isinstance(payload, dict):
        return []
    for key in keys:
        node = payload.get(key)
        if isinstance(node, list):
            return [x for x in node if isinstance(x, dict)]
        if isinstance(node, dict):
            for sub in ("wareList", "ware_list", "itemList", "list", "resultList"):
                if isinstance(node.get(sub), list):
                    return [x for x in node[sub] if isinstance(x, dict)]
    # 兜底：递归找第一个列表值
    for value in payload.values():
        if isinstance(value, list) and value and isinstance(value[0], dict):
            return value
        if isinstance(value, dict):
            found = _first_list(value, keys)
            if found:
                return found
    return []


def _first_int(payload: Any, keys: tuple[str, ...]) -> int:
    if isinstance(payload, dict):
        for key in keys:
            if key in payload:
                try:
                    return int(payload[key])
                except (TypeError, ValueError):
                    pass
        for value in payload.values():
            if isinstance(value, dict):
                found = _first_int(value, keys)
                if found:
                    return found
    return 0


def _jd_slug(title: str, fallback: str) -> str:
    cleaned = "".join(
        ch if (ch.isalnum() or ch in "-_") else "-" for ch in (title or "")
    ).strip("-")
    return f"{(cleaned[:80] or 'item')}-{fallback}"


class JdIntegration(RpcSignedIntegration):
    """京东 POP 店铺对接。"""

    platform_name = "jd"

    gateway_prod = "https://api.jd.com/routerjson"
    gateway_sandbox = ""  # 宙斯沙箱未开放公开地址，保留占位

    method_field = "method"
    app_key_field = "app_key"
    token_field = "access_token"
    business_param_style = "json_wrapped"
    business_wrapper_key = "360buy_param_json"
    timestamp_style = "datetime"

    # 注意：宙斯公共参数里**没有** sign_method，不要加
    common_params = {
        "v": "2.0",
        "format": "json",
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
        """两级校验：先验签名/AppKey（公共地址库），再验授权链路。

        分开验的好处：AppKey 填错 与 店铺没授权 是两种完全不同的
        排查方向，合并成一次调用会让商家分不清是哪个问题。
        """
        try:
            # 1) 公共接口：只校验 AppKey / AppSecret / 签名
            await self.call(config, "jingdong.areas.province.get", {})
        except PlatformCallError as exc:
            logger.warning("JD signature validation failed: %s", exc.raw)
            return False

        # 2) 私有接口：校验 access_token 是否有效（无 token 直接判失败）
        if not (config.get("access_token") or "").strip():
            return False
        try:
            await self.call(
                config,
                "jingdong.ware.read.searchWare4Valid",
                {"pageNo": 1, "pageSize": 1, "field": ["wareId"]},
            )
        except PlatformCallError as exc:
            logger.warning("JD token validation failed: %s", exc.raw)
            return False
        return True

    # ==================================================================
    # 商品
    # ==================================================================

    async def sync_products(
        self,
        config: dict[str, Any],
        workspace_id: str,
        updated_at_min: Any = None,
    ) -> SyncResult:
        """同步商品 —— ``jingdong.ware.read.searchWare4Valid``（POP 有效商品）。

        支持 ``startModifiedTime`` 增量；上限 10 万条、单页最大 50 条。
        """
        result = SyncResult()
        async with async_session_factory() as db:
            page_no = 1
            while page_no <= MAX_PAGES:
                biz: dict[str, Any] = {
                    "pageNo": page_no,
                    "pageSize": PAGE_SIZE,
                    "field": WARE_FIELDS,
                }
                if updated_at_min is not None:
                    biz["startModifiedTime"] = _fmt_jd_dt(updated_at_min)

                try:
                    payload = await self.call(
                        config, "jingdong.ware.read.searchWare4Valid", biz
                    )
                except PlatformCallError as exc:
                    result.errors.append(f"京东商品同步失败：{exc.friendly}")
                    break

                rows = _first_list(
                    payload, ("wareList", "ware_list", "page", "result")
                )
                if not rows:
                    break

                for raw in rows:
                    ware_id = str(raw.get("wareId") or raw.get("ware_id") or "")
                    if not ware_id:
                        continue
                    try:
                        is_new = await self._upsert_product(db, workspace_id, raw)
                        if is_new:
                            result.created += 1
                        else:
                            result.updated += 1
                    except Exception as exc:  # noqa: BLE001
                        result.errors.append(f"商品 {ware_id}: {exc}")

                total = _first_int(payload, ("totalItem", "total", "totalCount"))
                if len(rows) < PAGE_SIZE:
                    break
                if total and page_no * PAGE_SIZE >= total:
                    break
                page_no += 1

            try:
                await db.commit()
            except Exception as exc:  # noqa: BLE001
                result.errors.append(f"写入失败：{exc}")

        logger.info(
            "JD products synced: %d created, %d updated, %d errors",
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
        """同步订单 —— ``jingdong.pop.order.search``。

        ``dateType``：1 = 按订单创建时间；其它 = 按修改时间（默认）。
        与淘宝不同的是，京东**同一个接口**就能切增量口径，无需换接口。
        """
        result = SyncResult()
        async with async_session_factory() as db:
            page = 1
            while page <= MAX_PAGES:
                biz: dict[str, Any] = {
                    "page": str(page),
                    "pageSize": str(PAGE_SIZE),
                    "sortType": 1,
                    "dateType": 0 if updated_at_min is not None else 1,
                    "optionalFields": (
                        "orderId,orderState,orderAmount,orderTotalPrice,"
                        "freightPrice,sellerDiscount,itemInfoList,"
                        "consigneeInfo,orderStartTime,paymentConfirmTime"
                    ),
                }
                if updated_at_min is not None:
                    biz["startDate"] = _fmt_jd_dt(updated_at_min)
                biz["endDate"] = _fmt_jd_dt(datetime.now())

                try:
                    payload = await self.call(
                        config, "jingdong.pop.order.search", biz
                    )
                except PlatformCallError as exc:
                    result.errors.append(f"京东订单同步失败：{exc.friendly}")
                    break

                rows = _first_list(
                    payload,
                    ("orderInfoList", "order_info_list", "searchorderinfo_result"),
                )
                if not rows:
                    break

                for raw in rows:
                    order_id = str(raw.get("orderId") or raw.get("order_id") or "")
                    if not order_id:
                        continue
                    try:
                        is_new = await self._upsert_order(db, workspace_id, raw)
                        if is_new:
                            result.created += 1
                        else:
                            result.updated += 1
                        await self._upsert_customer(db, workspace_id, raw)
                    except Exception as exc:  # noqa: BLE001
                        result.errors.append(f"订单 {order_id}: {exc}")

                if len(rows) < PAGE_SIZE:
                    break
                page += 1

            try:
                await db.commit()
            except Exception as exc:  # noqa: BLE001
                result.errors.append(f"写入失败：{exc}")

        logger.info(
            "JD orders synced: %d created, %d updated, %d errors",
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
        """京东没有独立的买家列表接口，客户从订单派生（见 :meth:`sync_orders`）。"""
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
        """库存回写 —— ``jingdong.ware.stock.sku.set``。

        ⚠️ 官方已标注 ``jingdong.stock.write.updateSkuStock`` **推下线**，
        其替代接口即本方法使用的 ``jingdong.ware.stock.sku.set``（全量设置）。
        """
        result = WriteResult(operation="库存回写")
        async with async_session_factory() as db:
            for entry in items:
                sku = str(entry.get("sku") or "")
                stock = entry.get("stock")
                sku_id = _sku_id_from_sku(sku)
                if not sku_id or stock is None:
                    result.failed += 1
                    result.errors.append(f"{sku}: 缺少 sku_id 或库存值")
                    continue
                try:
                    await self.call(
                        config,
                        "jingdong.ware.stock.sku.set",
                        {"skuId": int(sku_id), "stockNum": int(stock)},
                    )
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
        """价格回写 —— ``jingdong.price.write.updateSkuJdPrice``（SKU 京东价）。"""
        result = WriteResult(operation="价格回写")
        async with async_session_factory() as db:
            for entry in items:
                sku = str(entry.get("sku") or "")
                price = entry.get("price")
                sku_id = _sku_id_from_sku(sku)
                if not sku_id or price is None:
                    result.failed += 1
                    result.errors.append(f"{sku}: 缺少 sku_id 或价格")
                    continue
                try:
                    await self.call(
                        config,
                        "jingdong.price.write.updateSkuJdPrice",
                        {
                            "skuId": int(sku_id),
                            "jdPrice": f"{float(price):.2f}",
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
        """发货回填 —— ``jingdong.pop.order.shipment``（SOP 出库发货）。

        京东要求 ``logiCoprId`` 是**物流公司数字 ID**，不是公司名。
        传中文名时会自动查映射表；查不到则直接报错，避免发错物流。
        """
        result = WriteResult(operation="发货回填")
        order_id = _order_id_from_number(order_number)
        if not order_id:
            result.failed += 1
            result.errors.append(
                f"{order_number}: 不是京东订单号（应为 JD-<orderId>）"
            )
            return result
        if not tracking_number:
            result.failed += 1
            result.errors.append("缺少运单号")
            return result

        carrier_id = CARRIER_ID_MAP.get(carrier, carrier if carrier.isdigit() else "")
        if not carrier_id:
            result.failed += 1
            result.errors.append(
                f"无法识别物流公司「{carrier}」。京东需要物流公司数字 ID，"
                "可先用 GET /stores/jd/carriers 查映射，或直接传入数字 ID。"
            )
            return result

        try:
            payload = await self.call(
                config,
                "jingdong.pop.order.shipment",
                {
                    "orderId": int(order_id),
                    "logiCoprId": carrier_id,
                    "logiNo": tracking_number,
                },
            )
            # 京东发货接口把成败放在业务体里（success 是字符串 "true"/"false"）
            inner = (
                payload.get("sopjosshipment_result")
                if isinstance(payload, dict)
                else None
            )
            if isinstance(inner, dict):
                success = str(inner.get("success", "")).lower()
                if success not in ("true", "1"):
                    msg = (
                        inner.get("chineseErrCode")
                        or inner.get("errorMessage")
                        or inner.get("englishErrCode")
                        or "发货失败"
                    )
                    result.failed += 1
                    result.errors.append(f"{order_number}: {msg}")
                    return result
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
        ware_id = str(raw.get("wareId") or raw.get("ware_id") or "")
        sku_code = f"jd-{ware_id}"
        title = (raw.get("title") or "").strip() or f"京东商品 {ware_id}"

        existing = await db.execute(
            select(Product).where(
                Product.workspace_id == workspace_id,
                Product.sku == sku_code,
            )
        )
        product = existing.scalar_one_or_none()
        is_new = product is None

        price = self.to_float(raw.get("jdPrice") or raw.get("jd_price"))
        stock = self.to_int(raw.get("stockNum") or raw.get("stock_num"))
        status_value = self.to_int(
            raw.get("wareStatus") or raw.get("ware_status"), default=WARE_STATUS_ONSALE
        )
        status = (
            ProductStatus.ACTIVE
            if status_value == WARE_STATUS_ONSALE
            else ProductStatus.ARCHIVED
        )

        if product is None:
            product = Product(
                workspace_id=workspace_id,
                name=title,
                slug=_jd_slug(title, ware_id),
                description="",
                category=str(raw.get("categoryId") or ""),
                price=price,
                sku=sku_code,
                stock=stock,
                status=status,
                images=[],
                tags=["jd"],
            )
            db.add(product)
        else:
            product.name = title
            product.price = price
            product.stock = stock
            product.status = status
        return is_new

    async def _upsert_order(
        self,
        db: AsyncSession,
        workspace_id: str,
        raw: dict[str, Any],
    ) -> bool:
        order_id = str(raw.get("orderId") or raw.get("order_id") or "")
        order_number = f"JD-{order_id}"

        existing = await db.execute(
            select(Order).where(
                Order.workspace_id == workspace_id,
                Order.order_number == order_number,
            )
        )
        order = existing.scalar_one_or_none()
        is_new = order is None

        status = ORDER_STATE_MAP.get(
            str(raw.get("orderState") or ""), OrderStatus.PENDING
        )
        total = self.to_float(
            raw.get("orderAmount") or raw.get("orderTotalPrice")
        )
        shipping = self.to_float(raw.get("freightPrice"))
        discount = self.to_float(raw.get("sellerDiscount"))
        consignee = raw.get("consigneeInfo") or raw.get("consignee_info") or {}

        address = None
        if isinstance(consignee, dict) and consignee:
            address = {
                "name": str(consignee.get("fullname") or ""),
                "phone": str(
                    consignee.get("mobile") or consignee.get("telephone") or ""
                ),
                "province": str(consignee.get("province") or ""),
                "city": str(consignee.get("city") or ""),
                "district": str(consignee.get("county") or ""),
                "detail": str(consignee.get("fullAddress") or ""),
            }

        if order is None:
            order = Order(
                workspace_id=workspace_id,
                order_number=order_number,
                status=status,
                customer_name=(address or {}).get("name") or None,
                customer_email=None,
                total=total,
                shipping=shipping,
                discount=discount,
                subtotal=round(total - shipping + discount, 2),
                payment_status=(
                    PaymentStatus.PAID
                    if raw.get("paymentConfirmTime")
                    else PaymentStatus.UNPAID
                ),
                platform="jd",
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

        for li in _first_list(raw, ("itemInfoList", "item_info_list")):
            db.add(
                OrderItem(
                    order_id=order.id,
                    product_name=str(li.get("skuName") or li.get("name") or "")[:255],
                    sku=str(li.get("skuId") or li.get("outerSkuId") or ""),
                    quantity=self.to_int(li.get("itemTotal") or li.get("num"), 1),
                    unit_price=self.to_float(li.get("jdPrice") or li.get("price")),
                    total_price=self.to_float(
                        li.get("estimateCosPrice") or li.get("price")
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
        """京东买家以 ``pin``（脱敏后的账号）标识。"""
        consignee = raw.get("consigneeInfo") or raw.get("consignee_info") or {}
        name = ""
        if isinstance(consignee, dict):
            name = str(consignee.get("fullname") or "")
        name = name or str(raw.get("pin") or raw.get("buyerPin") or "")
        if not name:
            return False

        existing = await db.execute(
            select(Customer).where(
                Customer.workspace_id == workspace_id,
                Customer.name == name,
                Customer.source == "jd",
            )
        )
        customer = existing.scalar_one_or_none()
        is_new = customer is None
        amount = self.to_float(raw.get("orderAmount") or raw.get("orderTotalPrice"))

        if customer is None:
            db.add(
                Customer(
                    workspace_id=workspace_id,
                    name=name,
                    email=None,
                    phone=str(consignee.get("mobile") or "") or None
                    if isinstance(consignee, dict)
                    else None,
                    tags=["jd"],
                    total_orders=1,
                    total_spent=amount,
                    source="jd",
                )
            )
        else:
            customer.total_orders = max(customer.total_orders, 1)
            customer.total_spent = max(customer.total_spent, amount)
        return is_new


# ----------------------------------------------------------------------
# 模块级工具
# ----------------------------------------------------------------------

def _fmt_jd_dt(value: Any) -> str:
    """京东要求 ``yyyy-MM-dd HH:mm:ss``。"""
    if hasattr(value, "strftime"):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    return str(value)


def _sku_id_from_sku(sku: str) -> str | None:
    """``jd-123456`` → ``123456``；非数字返回 None（避免后续 int() 崩溃）。"""
    return digits_after_prefix(sku, "jd-")


def _order_id_from_number(order_number: str) -> str | None:
    return digits_after_prefix(order_number, "JD-")


def jd_optional_fields() -> str:
    """调试用：打印默认 optionalFields。"""
    return (
        "orderId,orderState,orderAmount,orderTotalPrice,freightPrice,"
        "sellerDiscount,itemInfoList,consigneeInfo,orderStartTime,"
        "paymentConfirmTime"
    )


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


def dump_biz(params: dict[str, Any]) -> str:
    """调试辅助：把业务参数序列化成 ``360buy_param_json`` 的样子。"""
    return json.dumps(params, separators=(",", ":"), ensure_ascii=False)
