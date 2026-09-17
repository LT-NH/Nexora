"""Nexora - 淘宝/天猫（淘宝开放平台 TOP）对接.

网关：``https://eco.taobao.com/router/rest``
沙箱：``https://gw.api.tbsandbox.com/router/rest``

凭证（存于 Store 表）:
  - api_key     → AppKey
  - api_secret  → AppSecret
  - access_token→ session（卖家授权后获得，TOP 里叫 SessionKey）
  - sandbox     → 是否走沙箱网关

授权流程：卖家在 TOP 控制台授权应用 → 回跳地址带 code → 用
``taobao.top.auth.token.create`` 换 session（本适配器不含换取逻辑，
授权由卖家在开放平台侧完成后把 session 填进来）。

**关于接口权限的现实约束（重要）**
订单类接口（``taobao.trades.sold.get`` 等）个人开发者默认无权限，
调用会返回「无接口权限」。这类错误会被 :mod:`errors` 归到
``NO_API_PERMISSION``，而不是「凭证无效」——避免商家误以为是自己填错 Key。

**关于价格回写**
TOP 官方已明确 ``taobao.item.price.update`` **不再支持**。现行口径：
  - 有 SKU 的商品 → ``taobao.item.sku.price.update``
  - 单品一口价 → 需走 schema 增量编辑 ``alibaba.item.edit.fastupdate``（本适配器未实现）
"""

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

# 每次分页条数（TOP 商品/订单接口单页上限通常是 100）
PAGE_SIZE = 50

ITEM_FIELDS = (
    "num_iid,title,price,num,quantity,outer_id,pic_url,item_img,"
    "cid,created,modified,approve_status,detail_url,sku"
)

TRADE_FIELDS = (
    "tid,status,payment,post_fee,discount_fee,total_fee,created,modified,"
    "buyer_nick,receiver_name,receiver_state,receiver_city,receiver_district,"
    "receiver_address,receiver_mobile,orders,pay_time,type"
)

# 淘宝交易状态 → 本地订单状态
TRADE_STATUS_MAP: dict[str, OrderStatus] = {
    "WAIT_BUYER_PAY": OrderStatus.PENDING,
    "WAIT_SELLER_SEND_GOODS": OrderStatus.PROCESSING,
    "WAIT_BUYER_CONFIRM_GOODS": OrderStatus.SHIPPED,
    "TRADE_BUYER_SIGNED": OrderStatus.DELIVERED,
    "TRADE_FINISHED": OrderStatus.DELIVERED,
    "TRADE_CLOSED": OrderStatus.CANCELLED,
    "TRADE_CLOSED_BY_TAOBAO": OrderStatus.CANCELLED,
    "TRADE_REFUNDED": OrderStatus.REFUNDED,
}


def _as_items(container: Any, key: str) -> list[dict]:
    """淘宝把列表包成 ``{"item": [...]}``（单条时可能直接是 dict）。"""
    if not container:
        return []
    node = container.get(key) if isinstance(container, dict) else container
    if node is None:
        return []
    if isinstance(node, dict):
        return [node]
    if isinstance(node, list):
        return [x for x in node if isinstance(x, dict)]
    return []


def _taobao_slug(title: str, fallback: str) -> str:
    """生成商品 slug（保留中文，仅去掉 URL 不安全字符）。"""
    cleaned = "".join(
        ch if (ch.isalnum() or ch in "-_") else "-" for ch in (title or "")
    ).strip("-")
    cleaned = cleaned[:80] or "item"
    return f"{cleaned}-{fallback}"


class TaobaoIntegration(RpcSignedIntegration):
    """淘宝/天猫开放平台对接。"""

    platform_name = "taobao"

    gateway_prod = "https://eco.taobao.com/router/rest"
    gateway_sandbox = "https://gw.api.tbsandbox.com/router/rest"

    method_field = "method"
    app_key_field = "app_key"
    token_field = "session"
    business_param_style = "flat"
    timestamp_style = "datetime"

    common_params = {
        "v": "2.0",
        "format": "json",
        "sign_method": "md5",
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
        """调 ``taobao.user.seller.get`` 验证 AppKey + session 是否可用。"""
        try:
            payload = await self.call(
                config,
                "taobao.user.seller.get",
                {"fields": "nick,user_id,shop_name"},
            )
        except PlatformCallError as exc:
            logger.warning("Taobao credential validation failed: %s", exc.raw)
            return False
        # 能拿到 user 节点即视为通过
        return bool(payload.get("user") or payload.get("nick"))

    # ==================================================================
    # 商品
    # ==================================================================

    async def sync_products(
        self,
        config: dict[str, Any],
        workspace_id: str,
        updated_at_min: Any = None,
    ) -> SyncResult:
        """同步商品。

        官方指引：``onsale``（出售中）+ ``inventory``（仓库中）**两个接口合起来**
        才是店铺全量商品，所以这里两路都拉、按 ``num_iid`` 去重。
        """
        result = SyncResult()
        seen: set[str] = set()

        # 两路商品来源（出售中 / 仓库中），后者支持按修改时间增量
        sources = [
            ("taobao.items.onsale.get", "items_onsale_get_response", False),
            ("taobao.items.inventory.get", "items_inventory_get_response", True),
        ]

        async with async_session_factory() as db:
            for method, _resp_key, supports_incremental in sources:
                page_no = 1
                while True:
                    biz: dict[str, Any] = {
                        "fields": ITEM_FIELDS,
                        "page_no": str(page_no),
                        "page_size": str(PAGE_SIZE),
                    }
                    if supports_incremental and updated_at_min is not None:
                        # inventory 支持按修改时间增量
                        biz["start_modified"] = _fmt_taobao_dt(updated_at_min)

                    try:
                        payload = await self.call(config, method, biz)
                    except PlatformCallError as exc:
                        result.errors.append(f"{method}: {exc.friendly}")
                        break

                    rows = _as_items(payload.get("items"), "item")
                    if not rows:
                        break

                    for raw in rows:
                        num_iid = str(raw.get("num_iid") or "").strip()
                        if not num_iid or num_iid in seen:
                            continue
                        seen.add(num_iid)
                        try:
                            is_new = await self._upsert_product(
                                db, workspace_id, raw
                            )
                            if is_new:
                                result.created += 1
                            else:
                                result.updated += 1
                        except Exception as exc:  # noqa: BLE001 - 单条失败不中断整批
                            result.errors.append(
                                f"商品 {raw.get('title', num_iid)}: {exc}"
                            )

                    if len(rows) < PAGE_SIZE:
                        break
                    page_no += 1

            try:
                await db.commit()
            except Exception as exc:  # noqa: BLE001
                result.errors.append(f"写入失败：{exc}")

        logger.info(
            "Taobao products synced: %d created, %d updated, %d errors",
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
        """同步订单。

        传 ``updated_at_min`` 时改用官方增量接口
        ``taobao.trades.sold.increment.get``（按**修改时间**取增量），
        否则按创建时间全量拉取。
        """
        result = SyncResult()
        incremental = updated_at_min is not None
        method = (
            "taobao.trades.sold.increment.get"
            if incremental
            else "taobao.trades.sold.get"
        )

        async with async_session_factory() as db:
            page_no = 1
            while True:
                biz: dict[str, Any] = {
                    "fields": TRADE_FIELDS,
                    "page_no": str(page_no),
                    "page_size": str(PAGE_SIZE),
                }
                if incremental:
                    biz["start_modified"] = _fmt_taobao_dt(updated_at_min)
                # 全量时限制在近 90 天，避免首同步拉爆
                biz.setdefault("status", "ALL")

                try:
                    payload = await self.call(config, method, biz)
                except PlatformCallError as exc:
                    result.errors.append(f"{method}: {exc.friendly}")
                    break

                rows = _as_items(payload.get("trades"), "trade")
                if not rows:
                    break

                for raw in rows:
                    tid = str(raw.get("tid") or "").strip()
                    if not tid:
                        continue
                    try:
                        is_new = await self._upsert_order(db, workspace_id, raw)
                        if is_new:
                            result.created += 1
                        else:
                            result.updated += 1
                        await self._upsert_customer(db, workspace_id, raw)
                    except Exception as exc:  # noqa: BLE001
                        result.errors.append(f"订单 {tid}: {exc}")

                if len(rows) < PAGE_SIZE:
                    break
                page_no += 1
                # 官方建议翻页别太深，超过 100 页改用时间滚动
                if page_no > 100:
                    result.errors.append(
                        "订单页数超过 100 页已停止，请缩小时间范围后重试"
                    )
                    break

            try:
                await db.commit()
            except Exception as exc:  # noqa: BLE001
                result.errors.append(f"写入失败：{exc}")

        logger.info(
            "Taobao orders synced: %d created, %d updated, %d errors",
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
        """淘宝**没有**买家列表接口（买家信息脱敏）。

        客户数据只能从订单里派生，已在 :meth:`sync_orders` 内顺带写入，
        这里不重复拉取，返回空结果并说明原因。
        """
        return SyncResult(
            skipped=0,
            errors=[],
        )

    # ==================================================================
    # 双向写：库存 / 价格 / 发货
    # ==================================================================

    async def update_inventory(
        self,
        config: dict[str, Any],
        workspace_id: str,
        items: list[dict[str, Any]],
    ) -> WriteResult:
        """库存回写 —— ``taobao.item.quantity.update``（全量覆盖 type=1）。"""
        result = WriteResult(operation="库存回写")
        async with async_session_factory() as db:
            for entry in items:
                sku = str(entry.get("sku") or "")
                stock = entry.get("stock")
                num_iid = _num_iid_from_sku(sku)
                if not num_iid or stock is None:
                    result.failed += 1
                    result.errors.append(f"{sku}: 缺少 num_iid 或库存值")
                    continue
                try:
                    await self.call(
                        config,
                        "taobao.item.quantity.update",
                        {
                            "num_iid": num_iid,
                            "quantity": str(int(stock)),
                            "type": "1",  # 1=全量更新
                        },
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
        """价格回写 —— ``taobao.item.sku.price.update``。

        仅适用于**带 SKU** 的商品（需同时给出 ``sku_id``）。
        单品一口价 TOP 已不支持 ``taobao.item.price.update``，
        必须走 schema 增量编辑，本适配器不实现，会返回明确提示。
        """
        result = WriteResult(operation="价格回写")
        async with async_session_factory() as db:
            for entry in items:
                sku = str(entry.get("sku") or "")
                price = entry.get("price")
                num_iid = _num_iid_from_sku(sku)
                sku_id = entry.get("sku_id")
                if not num_iid or price is None:
                    result.failed += 1
                    result.errors.append(f"{sku}: 缺少 num_iid 或价格")
                    continue
                if not sku_id:
                    result.failed += 1
                    result.errors.append(
                        f"{sku}: 单品一口价回写需走 schema 增量编辑接口，"
                        "当前仅支持带 SKU 的商品（需提供 sku_id）"
                    )
                    continue
                try:
                    await self.call(
                        config,
                        "taobao.item.sku.price.update",
                        {
                            "num_iid": num_iid,
                            "sku_id": str(sku_id),
                            "price": f"{float(price):.2f}",
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
        """发货回填 —— ``taobao.logistics.online.send``。"""
        result = WriteResult(operation="发货回填")
        tid = _tid_from_order_number(order_number)
        if not tid:
            result.failed += 1
            result.errors.append(f"{order_number}: 不是淘宝订单号（应为 TB-<tid>）")
            return result
        if not tracking_number:
            result.failed += 1
            result.errors.append("缺少运单号")
            return result

        try:
            await self.call(
                config,
                "taobao.logistics.online.send",
                {
                    "tid": tid,
                    "out_sid": tracking_number,
                    "company_code": carrier or "",
                },
            )
            result.succeeded += 1
            result.details.append({"order": order_number, "tracking": tracking_number})
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
        num_iid = str(raw.get("num_iid") or "")
        sku_code = f"tb-{num_iid}"
        title = (raw.get("title") or "").strip() or f"淘宝商品 {num_iid}"

        existing = await db.execute(
            select(Product).where(
                Product.workspace_id == workspace_id,
                Product.sku == sku_code,
            )
        )
        product = existing.scalar_one_or_none()
        is_new = product is None

        price = self.to_float(raw.get("price"))
        stock = self.to_int(raw.get("num", raw.get("quantity")))
        images = _collect_images(raw)
        approve = str(raw.get("approve_status") or "")
        status = (
            ProductStatus.ACTIVE
            if approve == "onsale"
            else ProductStatus.ARCHIVED
        )

        if product is None:
            product = Product(
                workspace_id=workspace_id,
                name=title,
                slug=_taobao_slug(title, num_iid),
                description="",
                category=str(raw.get("cid") or ""),
                price=price,
                sku=sku_code,
                stock=stock,
                status=status,
                images=images,
                tags=["taobao"],
            )
            db.add(product)
        else:
            product.name = title
            product.price = price
            product.stock = stock
            product.status = status
            product.images = images
        return is_new

    async def _upsert_order(
        self,
        db: AsyncSession,
        workspace_id: str,
        raw: dict[str, Any],
    ) -> bool:
        tid = str(raw.get("tid") or "")
        order_number = f"TB-{tid}"

        existing = await db.execute(
            select(Order).where(
                Order.workspace_id == workspace_id,
                Order.order_number == order_number,
            )
        )
        order = existing.scalar_one_or_none()
        is_new = order is None

        status = TRADE_STATUS_MAP.get(
            str(raw.get("status") or ""), OrderStatus.PENDING
        )
        total = self.to_float(raw.get("payment", raw.get("total_fee")))
        shipping = self.to_float(raw.get("post_fee"))
        discount = self.to_float(raw.get("discount_fee"))
        buyer_nick = raw.get("buyer_nick") or None

        address = _collect_address(raw)
        payment_status = (
            PaymentStatus.PAID
            if raw.get("pay_time") or total > 0
            else PaymentStatus.UNPAID
        )

        if order is None:
            order = Order(
                workspace_id=workspace_id,
                order_number=order_number,
                status=status,
                customer_name=raw.get("receiver_name") or buyer_nick,
                customer_email=None,
                total=total,
                shipping=shipping,
                discount=discount,
                subtotal=round(total - shipping + discount, 2),
                payment_status=payment_status,
                platform="taobao",
                shipping_address=address,
            )
            db.add(order)
            await db.flush()
        else:
            order.status = status
            order.total = total
            order.shipping = shipping
            order.discount = discount
            order.payment_status = payment_status
            order.shipping_address = address
            await db.flush()
            # 重新同步时替换明细，保证幂等
            await db.execute(delete(OrderItem).where(OrderItem.order_id == order.id))

        for li in _as_items(raw.get("orders"), "order"):
            db.add(
                OrderItem(
                    order_id=order.id,
                    product_name=(li.get("title") or "")[:255],
                    sku=str(li.get("outer_sku_id") or li.get("num_iid") or ""),
                    quantity=self.to_int(li.get("num"), 1),
                    unit_price=self.to_float(li.get("price")),
                    total_price=self.to_float(
                        li.get("total_fee", li.get("payment"))
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
        """淘宝买家信息脱敏 —— 只能用 ``buyer_nick`` 作为客户标识。"""
        nick = (raw.get("buyer_nick") or "").strip()
        if not nick:
            return False

        existing = await db.execute(
            select(Customer).where(
                Customer.workspace_id == workspace_id,
                Customer.name == nick,
                Customer.source == "taobao",
            )
        )
        customer = existing.scalar_one_or_none()
        is_new = customer is None
        amount = self.to_float(raw.get("payment", raw.get("total_fee")))

        if customer is None:
            db.add(
                Customer(
                    workspace_id=workspace_id,
                    name=nick,
                    email=None,
                    phone=raw.get("receiver_mobile") or None,
                    tags=["taobao"],
                    total_orders=1,
                    total_spent=amount,
                    source="taobao",
                )
            )
        else:
            customer.total_orders = max(customer.total_orders, 1)
            customer.total_spent = max(customer.total_spent, amount)
            if raw.get("receiver_mobile"):
                customer.phone = raw["receiver_mobile"]
        return is_new


# ----------------------------------------------------------------------
# 模块级工具
# ----------------------------------------------------------------------

def _fmt_taobao_dt(value: Any) -> str:
    """把 datetime 转成 TOP 要的 ``yyyy-MM-dd HH:mm:ss``。"""
    if hasattr(value, "strftime"):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    return str(value)


def _collect_images(raw: dict[str, Any]) -> list[str]:
    """淘宝主图：``pic_url`` 单图 + ``item_img`` 列表。"""
    images: list[str] = []
    if raw.get("pic_url"):
        images.append(str(raw["pic_url"]))
    for img in _as_items(raw.get("item_img"), "item_img"):
        url = img.get("url")
        if url and url not in images:
            images.append(str(url))
    return images


def _collect_address(raw: dict[str, Any]) -> dict[str, str] | None:
    """收货地址（淘宝默认脱敏，拿不到就是 None）。"""
    name = raw.get("receiver_name")
    detail = raw.get("receiver_address")
    if not name and not detail:
        return None
    return {
        "name": str(name or ""),
        "phone": str(raw.get("receiver_mobile") or ""),
        "province": str(raw.get("receiver_state") or ""),
        "city": str(raw.get("receiver_city") or ""),
        "district": str(raw.get("receiver_district") or ""),
        "detail": str(detail or ""),
    }


def _num_iid_from_sku(sku: str) -> str | None:
    """``tb-123456`` → ``123456``；非数字返回 None（避免后续 int() 崩溃）。"""
    return digits_after_prefix(sku, "tb-")


def _tid_from_order_number(order_number: str) -> str | None:
    return digits_after_prefix(order_number, "TB-")


async def _sync_local_stock(
    db: AsyncSession,
    workspace_id: str,
    sku: str,
    stock: int,
) -> None:
    """回写成功后同步本地库存，保持两边一致。"""
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
