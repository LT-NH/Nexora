"""Nexora - 抖音电商 (抖店) 平台对接.

通过抖店开放平台 API 同步商品、订单和客户数据。

接入流程：
  1. 注册抖店开放平台开发者 (https://op.jinritemai.com)
  2. 创建应用，获取 app_key 和 app_secret
  3. 商家在抖店后台授权你的应用，获取 access_token
  4. 将 access_token 和店铺 ID 填入 Nexora

Credentials:
  - store_url: 店铺 ID (shop_id)
  - api_key: app_key
  - api_secret: app_secret
  - 额外字段: access_token（通过授权流程获取）
"""

import hashlib
import json
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.models.order import Order, OrderItem, OrderStatus
from app.models.product import Product, ProductStatus
from app.database import async_session_factory
from app.services.platforms.base import PlatformIntegration, SyncResult
from app.utils.logging import get_logger

logger = get_logger(__name__)

DOUYIN_API_BASE = "https://openapi-fxg.jinritemai.com"


class DouyinIntegration(PlatformIntegration):
    """抖音电商 (抖店) 开放平台对接."""

    platform_name = "douyin"

    # ------------------------------------------------------------------
    # Credential validation
    # ------------------------------------------------------------------

    async def validate_credentials(self, config: dict[str, Any]) -> bool:
        """调用抖店 shop.getShopInfo 接口验证凭证."""
        app_key = config.get("api_key") or ""
        app_secret = config.get("api_secret") or ""
        access_token = config.get("access_token") or ""

        if not app_key or not access_token:
            return False

        try:
            result = await self._douyin_request(
                app_key, app_secret, access_token,
                "shop.getShopInfo", {},
            )
            return result.get("code") == 10000
        except Exception as exc:
            logger.warning("Douyin credential validation failed: %s", exc)
            return False

    # ------------------------------------------------------------------
    # Products
    # ------------------------------------------------------------------

    async def sync_products(
        self,
        config: dict[str, Any],
        workspace_id: str,
    ) -> SyncResult:
        """同步抖店商品."""
        result = SyncResult()
        app_key = config.get("api_key") or ""
        app_secret = config.get("api_secret") or ""
        access_token = config.get("access_token") or ""

        if not access_token or not app_key:
            result.errors.append("缺少抖店 API 凭证 (app_key / access_token)")
            return result

        async with async_session_factory() as db:
            try:
                page = 0
                page_size = 50
                while True:
                    resp = await self._douyin_request(
                        app_key, app_secret, access_token,
                        "product.list", {
                            "page": str(page),
                            "size": str(page_size),
                            "status": "0",  # all products
                        },
                    )
                    if resp.get("code") != 10000:
                        break

                    products = resp.get("data", {}).get("list", [])
                    if not products:
                        break

                    for dp in products:
                        try:
                            is_new = await self._upsert_product(db, workspace_id, dp)
                            if is_new:
                                result.created += 1
                            else:
                                result.updated += 1
                        except Exception as exc:
                            result.errors.append(
                                f"Product '{dp.get('name', '?')}': {exc}"
                            )

                    if len(products) < page_size:
                        break
                    page += 1

                await db.commit()
                logger.info(
                    "Douyin products synced: %d created, %d updated, %d errors",
                    result.created,
                    result.updated,
                    len(result.errors),
                )
            except Exception as exc:
                result.errors.append(f"Sync failed: {exc}")
                logger.error("Douyin products sync failed: %s", exc)

        return result

    # ------------------------------------------------------------------
    # Orders
    # ------------------------------------------------------------------

    async def sync_orders(
        self,
        config: dict[str, Any],
        workspace_id: str,
    ) -> SyncResult:
        """同步抖店订单."""
        result = SyncResult()
        app_key = config.get("api_key") or ""
        app_secret = config.get("api_secret") or ""
        access_token = config.get("access_token") or ""

        if not access_token or not app_key:
            result.errors.append("缺少抖店 API 凭证")
            return result

        async with async_session_factory() as db:
            try:
                page = 0
                page_size = 50
                while True:
                    resp = await self._douyin_request(
                        app_key, app_secret, access_token,
                        "order.list", {
                            "page": str(page),
                            "size": str(page_size),
                            "order_status": "1",  # pending
                            "start_time": _days_ago(30),
                            "end_time": _now_str(),
                        },
                    )
                    if resp.get("code") != 10000:
                        break

                    orders = resp.get("data", {}).get("list", [])
                    if not orders:
                        break

                    for do in orders:
                        try:
                            is_new = await self._upsert_order(db, workspace_id, do)
                            if is_new:
                                result.created += 1
                            else:
                                result.updated += 1
                        except Exception as exc:
                            result.errors.append(
                                f"Order '{do.get('order_id', '?')}': {exc}"
                            )

                    if len(orders) < page_size:
                        break
                    page += 1

                await db.commit()
                logger.info(
                    "Douyin orders synced: %d created, %d updated, %d errors",
                    result.created,
                    result.updated,
                    len(result.errors),
                )
            except Exception as exc:
                result.errors.append(f"Sync failed: {exc}")
                logger.error("Douyin orders sync failed: %s", exc)

        return result

    # ------------------------------------------------------------------
    # Customers
    # ------------------------------------------------------------------

    async def sync_customers(
        self,
        config: dict[str, Any],
        workspace_id: str,
    ) -> SyncResult:
        """抖店客户数据有限（平台不直接暴露买家信息），尝试从订单中提取."""
        result = SyncResult()
        app_key = config.get("api_key") or ""
        app_secret = config.get("api_secret") or ""
        access_token = config.get("access_token") or ""

        if not access_token or not app_key:
            result.errors.append("缺少抖店 API 凭证")
            return result

        async with async_session_factory() as db:
            try:
                # 抖店不直接提供客户列表，从订单中提取
                page = 0
                page_size = 50
                seen_emails: set[str] = set()

                while len(seen_emails) < 500:
                    resp = await self._douyin_request(
                        app_key, app_secret, access_token,
                        "order.list", {
                            "page": str(page),
                            "size": str(page_size),
                            "start_time": _days_ago(90),
                            "end_time": _now_str(),
                        },
                    )
                    if resp.get("code") != 10000:
                        break

                    orders = resp.get("data", {}).get("list", [])
                    if not orders:
                        break

                    for do in orders:
                        buyer_info = do.get("buyer", {}) or do.get("buyer_info", {}) or {}
                        email = buyer_info.get("email", "")
                        if not email or email in seen_emails:
                            continue
                        seen_emails.add(email)

                        try:
                            is_new = await self._upsert_customer(
                                db, workspace_id, buyer_info, do
                            )
                            if is_new:
                                result.created += 1
                            else:
                                result.updated += 1
                        except Exception as exc:
                            result.errors.append(
                                f"Customer '{email}': {exc}"
                            )

                    if len(orders) < page_size:
                        break
                    page += 1

                await db.commit()
                logger.info(
                    "Douyin customers synced: %d created, %d updated, %d errors",
                    result.created,
                    result.updated,
                    len(result.errors),
                )
            except Exception as exc:
                result.errors.append(f"Sync failed: {exc}")
                logger.error("Douyin customers sync failed: %s", exc)

        return result

    # ==================================================================
    # Internal helpers
    # ==================================================================

    async def _douyin_request(
        self,
        app_key: str,
        app_secret: str,
        access_token: str,
        method: str,
        params: dict,
    ) -> dict:
        """Send a signed request to the Douyin Open Platform."""
        timestamp = str(int(time.time()))
        sign = self._douyin_sign(app_key, app_secret, method, params, timestamp)

        url = f"{DOUYIN_API_BASE}/{method}"
        request_params = {
            "app_key": app_key,
            "access_token": access_token,
            "timestamp": timestamp,
            "sign": sign,
            "sign_method": "hmac-sha256",
            "param_json": json.dumps(params),
        }

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, params=request_params)
            if resp.status_code != 200:
                logger.error("Douyin API error %d: %s", resp.status_code, resp.text[:500])
                return {"code": -1, "msg": f"HTTP {resp.status_code}"}
            return resp.json()

    def _douyin_sign(
        self,
        app_key: str,
        app_secret: str,
        method: str,
        params: dict,
        timestamp: str,
    ) -> str:
        """Generate HMAC-SHA256 signature for Douyin API."""
        param_json = json.dumps(params, separators=(",", ":"), ensure_ascii=False)
        sign_str = f"{app_key}{method}{timestamp}{param_json}"
        return hashlib.sha256(
            (app_secret + sign_str + app_secret).encode("utf-8")
        ).hexdigest()

    async def _upsert_product(
        self,
        db: AsyncSession,
        workspace_id: str,
        dp: dict,
    ) -> bool:
        """Create or update a local Product from Douyin data.

        Returns True if a new product was created, False if updated.
        """
        product_id = str(dp.get("product_id", ""))
        title = dp.get("name", "") or "Untitled"

        existing = await db.execute(
            select(Product).where(
                Product.workspace_id == workspace_id,
                Product.sku == f"dy-{product_id}",
            )
        )
        product = existing.scalar_one_or_none()
        is_new = product is None

        price = float(dp.get("price", 0) or 0) / 100  # 分 → 元
        images = dp.get("pic_urls", []) or [dp.get("pic_url", "")]
        if isinstance(images, str):
            images = [images]

        if product is None:
            product = Product(
                id=str(uuid.uuid4()),
                workspace_id=workspace_id,
                name=title,
                slug=_douyin_slugify(title),
                description=dp.get("description", ""),
                category=dp.get("category_name", ""),
                price=price,
                sku=f"dy-{product_id}",
                status=ProductStatus.ACTIVE,
                images=images,
                tags=dp.get("tags", []) or [],
            )
            db.add(product)
        else:
            product.name = title
            product.price = price
            product.images = images
            product.description = dp.get("description", "")

        return is_new

    async def _upsert_order(
        self,
        db: AsyncSession,
        workspace_id: str,
        do: dict,
    ) -> bool:
        """Create or update a local Order from Douyin data.

        Returns True if a new order was created, False if updated.
        On update, line items are replaced (not appended) to avoid
        duplicating them on every re-sync.
        """
        order_id = str(do.get("order_id", ""))
        order_number = f"DY-{order_id}"

        existing = await db.execute(
            select(Order).where(
                Order.workspace_id == workspace_id,
                Order.order_number == order_number,
            )
        )
        order = existing.scalar_one_or_none()
        is_new = order is None

        # Map status
        status_map = {
            "1": OrderStatus.PENDING,
            "2": OrderStatus.CONFIRMED,
            "3": OrderStatus.PROCESSING,
            "4": OrderStatus.SHIPPED,
            "5": OrderStatus.DELIVERED,
            "6": OrderStatus.CANCELLED,
        }
        status = status_map.get(str(do.get("order_status", "1")), OrderStatus.PENDING)

        total = float(do.get("pay_amount", 0) or 0) / 100
        shipping = float(do.get("post_amount", 0) or 0) / 100

        buyer = do.get("buyer", {}) or {}
        shipping_addr = do.get("post_addr", {}) or {}

        if order is None:
            order = Order(
                id=str(uuid.uuid4()),
                workspace_id=workspace_id,
                order_number=order_number,
                status=status,
                customer_name=buyer.get("name") or None,
                customer_email=buyer.get("email") or None,
                total=total,
                shipping=shipping,
                payment_status="paid",
                platform="douyin",
                shipping_address={
                    "name": shipping_addr.get("name", ""),
                    "phone": shipping_addr.get("phone", ""),
                    "province": shipping_addr.get("province", ""),
                    "city": shipping_addr.get("city", ""),
                    "detail": shipping_addr.get("detail", ""),
                } if shipping_addr else None,
            )
            db.add(order)
            await db.flush()
        else:
            order.status = status
            order.total = total
            order.shipping = shipping
            order.customer_name = buyer.get("name") or order.customer_name
            order.customer_email = buyer.get("email") or order.customer_email
            await db.flush()
            # Replace line items to keep the order idempotent on re-sync.
            await db.execute(delete(OrderItem).where(OrderItem.order_id == order.id))

        # Line items
        items = do.get("items", []) or do.get("order_item", []) or []
        for li in items:
            item = OrderItem(
                id=str(uuid.uuid4()),
                order_id=order.id,
                product_name=li.get("product_name", "") or li.get("title", ""),
                sku=li.get("sku_id", ""),
                quantity=int(li.get("item_num", 1) or 1),
                unit_price=float(li.get("price", 0) or 0) / 100,
                total_price=float(li.get("pay_amount", 0) or 0) / 100,
            )
            db.add(item)

        return is_new

    async def _upsert_customer(
        self,
        db: AsyncSession,
        workspace_id: str,
        buyer_info: dict,
        order: dict,
    ) -> bool:
        """Create or update a local Customer from Douyin buyer info.

        Returns True if a new customer was created, False if updated.
        Totals are set idempotently from the current order (re-syncs do
        not keep accumulating).
        """
        email = buyer_info.get("email", "")
        name = buyer_info.get("name", "") or email

        existing = await db.execute(
            select(Customer).where(
                Customer.workspace_id == workspace_id,
                Customer.email == email,
            )
        )
        customer = existing.scalar_one_or_none()
        is_new = customer is None

        order_amount = float(order.get("pay_amount", 0) or 0) / 100

        if customer is None:
            customer = Customer(
                id=str(uuid.uuid4()),
                workspace_id=workspace_id,
                name=name,
                email=email or None,
                phone=buyer_info.get("phone") or None,
                tags=["douyin"],
                total_orders=1,
                total_spent=order_amount,
                source="douyin",
            )
            db.add(customer)
        else:
            customer.name = name
            customer.phone = buyer_info.get("phone") or customer.phone
            customer.tags = list(set(customer.tags + ["douyin"]))
            # Idempotent: reflect the most recent order rather than accumulate.
            customer.total_orders = max(customer.total_orders, 1)
            customer.total_spent = order_amount

        return is_new


def _douyin_slugify(text: str) -> str:
    """Generate a slug from Douyin product name."""
    import re
    slug = text.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    return slug[:200] or "product"


def _days_ago(n: int) -> str:
    """Return a timestamp string n days ago for Douyin API."""
    dt = datetime.now(timezone.utc) - timedelta(days=n)
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def _now_str() -> str:
    """Return current timestamp string."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
