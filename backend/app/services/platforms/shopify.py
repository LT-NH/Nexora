"""Nexora - Shopify Platform Integration.

Connects to a Shopify store via the Admin REST API and syncs products,
orders, and customers into the local workspace.

Credentials:
  - store_url: e.g. https://my-store.myshopify.com
  - api_key: Admin API access token (shpat_xxx or shpca_xxx)
  - api_secret: (unused for REST API custom apps, kept for compatibility)

Setup guide for merchants:
  1. Go to Shopify Admin → Settings → Apps and sales channels
  2. Click "Develop apps" → "Create an app"
  3. Configure Admin API scopes: read_products, read_orders, read_customers
  4. Install the app and copy the Admin API access token
  5. Paste the token and your .myshopify.com URL into Nexora
"""

import uuid
from datetime import datetime, timezone, timedelta
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

SHOPIFY_API_VERSION = "2024-01"


class ShopifyIntegration(PlatformIntegration):
    """Shopify Admin REST API integration."""

    platform_name = "shopify"

    # ------------------------------------------------------------------
    # Credential validation
    # ------------------------------------------------------------------

    async def validate_credentials(self, config: dict[str, Any]) -> bool:
        """Ping the Shopify shop endpoint to verify the token."""
        store_url = _normalize_store_url(config.get("store_url"))
        access_token = (config.get("api_key") or config.get("access_token") or "")

        if not store_url or not access_token:
            return False

        url = f"{store_url}/admin/api/{SHOPIFY_API_VERSION}/shop.json"
        headers = {
            "X-Shopify-Access-Token": access_token,
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=15, trust_env=False) as client:
                resp = await client.get(url, headers=headers)
                return resp.status_code == 200
        except Exception as exc:
            logger.warning("Shopify credential validation failed: %s", exc)
            return False

    # ------------------------------------------------------------------
    # Products
    # ------------------------------------------------------------------

    async def sync_products(
        self,
        config: dict[str, Any],
        workspace_id: str,
        updated_at_min: datetime | None = None,
    ) -> SyncResult:
        """Sync products from Shopify into the workspace.

        传 ``updated_at_min`` 时只拉取该时间之后有变更的商品（增量同步）。
        """
        result = SyncResult()
        store_url = _normalize_store_url(config.get("store_url"))
        access_token = (config.get("api_key") or config.get("access_token") or "")

        if not store_url or not access_token:
            result.errors.append("Missing store_url or api_key in store config")
            return result

        headers = {
            "X-Shopify-Access-Token": access_token,
            "Content-Type": "application/json",
        }

        async with async_session_factory() as db:
            try:
                incremental_params: dict[str, Any] = {}
                if updated_at_min is not None:
                    incremental_params["updated_at_min"] = _to_shopify_utc(updated_at_min)
                products = await self._fetch_all_pages(
                    f"{store_url}/admin/api/{SHOPIFY_API_VERSION}/products.json",
                    headers,
                    "products",
                    params=incremental_params or None,
                )

                for shopify_product in products:
                    try:
                        is_new = await self._upsert_product(db, workspace_id, shopify_product)
                        if is_new:
                            result.created += 1
                        else:
                            result.updated += 1
                    except Exception as exc:
                        result.errors.append(
                            f"Product '{shopify_product.get('title', '?')}': {exc}"
                        )

                await db.commit()
                logger.info(
                    "Shopify products synced: %d created, %d updated, %d errors",
                    result.created,
                    result.updated,
                    len(result.errors),
                )
            except Exception as exc:
                result.errors.append(f"Sync failed: {exc}")
                logger.error("Shopify products sync failed: %s", exc)

        return result

    # ------------------------------------------------------------------
    # Orders
    # ------------------------------------------------------------------

    async def sync_orders(
        self,
        config: dict[str, Any],
        workspace_id: str,
        updated_at_min: datetime | None = None,
    ) -> SyncResult:
        """Sync orders from Shopify into the workspace.

        传 ``updated_at_min`` 时只拉取该时间之后有变更的订单（增量同步）。
        """
        result = SyncResult()
        store_url = _normalize_store_url(config.get("store_url"))
        access_token = (config.get("api_key") or config.get("access_token") or "")

        if not store_url or not access_token:
            result.errors.append("Missing store_url or api_key")
            return result

        headers = {
            "X-Shopify-Access-Token": access_token,
            "Content-Type": "application/json",
        }

        async with async_session_factory() as db:
            try:
                incremental_params: dict[str, Any] = {"status": "any", "limit": 250}
                if updated_at_min is not None:
                    incremental_params["updated_at_min"] = _to_shopify_utc(updated_at_min)
                orders = await self._fetch_all_pages(
                    f"{store_url}/admin/api/{SHOPIFY_API_VERSION}/orders.json",
                    headers,
                    "orders",
                    params=incremental_params,
                )

                from app.models.refund import Refund, RefundReason, RefundStatus

                for shopify_order in orders:
                    try:
                        is_new = await self._upsert_order(db, workspace_id, shopify_order)
                        if is_new:
                            result.created += 1
                        else:
                            result.updated += 1

                        # 同步订单退款 → 退款售后表
                        local_order = await db.scalar(
                            select(Order).where(
                                Order.workspace_id == workspace_id,
                                Order.order_number == f"SP-{shopify_order.get('order_number') or ''}",
                            )
                        )
                        shopify_refunds = shopify_order.get("refunds") or []
                        for rf in shopify_refunds:
                            # Shopify refunds 无 total_refunded 字段 → 从 transactions(kind=refund) 汇总
                            txns = rf.get("transactions") or []
                            amount = sum(
                                float(t.get("amount") or 0)
                                for t in txns
                                if (t.get("kind") or "") == "refund"
                            )
                            if amount <= 0:
                                # 无金额明细的退款（API 批量创建）→ 用订单总额作为展示金额
                                amount = float(shopify_order.get("total_price") or 0)
                            if amount <= 0 or local_order is None:
                                continue
                            rf_created = _parse_iso_dt(rf.get("created_at"))
                            exists = await db.scalar(
                                select(Refund).where(
                                    Refund.order_id == local_order.id,
                                    Refund.amount == amount,
                                    Refund.created_at == rf_created,
                                )
                            )
                            if exists:
                                continue
                            note = (rf.get("note") or "").strip()
                            reason = RefundReason.OTHER
                            nl = note.lower()
                            if "damag" in nl:
                                reason = RefundReason.DAMAGED
                            elif "quality" in nl or "defect" in nl:
                                reason = RefundReason.QUALITY
                            elif "wrong" in nl or "incorrect" in nl:
                                reason = RefundReason.WRONG_ITEM
                            elif "not as described" in nl or "different" in nl:
                                reason = RefundReason.NOT_AS_DESCRIBED
                            db.add(
                                Refund(
                                    workspace_id=workspace_id,
                                    order_id=local_order.id,
                                    amount=amount,
                                    reason=reason,
                                    reason_detail=note or None,
                                    status=RefundStatus.COMPLETED,
                                    created_at=rf_created or datetime.utcnow(),
                                )
                            )
                    except Exception as exc:
                        result.errors.append(
                            f"Order '{shopify_order.get('name', '?')}': {exc}"
                        )

                await db.commit()
                logger.info(
                    "Shopify orders synced: %d created, %d updated, %d errors",
                    result.created,
                    result.updated,
                    len(result.errors),
                )
            except Exception as exc:
                result.errors.append(f"Sync failed: {exc}")
                logger.error("Shopify orders sync failed: %s", exc)

        return result

    # ------------------------------------------------------------------
    # Customers
    # ------------------------------------------------------------------

    async def sync_customers(
        self,
        config: dict[str, Any],
        workspace_id: str,
        updated_at_min: datetime | None = None,
    ) -> SyncResult:
        """Sync customers from Shopify into the workspace.

        传 ``updated_at_min`` 时只拉取该时间之后有变更的客户（增量同步）。
        """
        result = SyncResult()
        store_url = _normalize_store_url(config.get("store_url"))
        access_token = (config.get("api_key") or config.get("access_token") or "")

        if not store_url or not access_token:
            result.errors.append("Missing store_url or api_key")
            return result

        headers = {
            "X-Shopify-Access-Token": access_token,
            "Content-Type": "application/json",
        }

        async with async_session_factory() as db:
            try:
                incremental_params: dict[str, Any] = {}
                if updated_at_min is not None:
                    incremental_params["updated_at_min"] = _to_shopify_utc(updated_at_min)
                customers = await self._fetch_all_pages(
                    f"{store_url}/admin/api/{SHOPIFY_API_VERSION}/customers.json",
                    headers,
                    "customers",
                    params=incremental_params or None,
                )

                for shopify_customer in customers:
                    try:
                        is_new = await self._upsert_customer(db, workspace_id, shopify_customer)
                        if is_new:
                            result.created += 1
                        else:
                            result.updated += 1
                    except Exception as exc:
                        result.errors.append(
                            f"Customer '{shopify_customer.get('email', '?')}': {exc}"
                        )

                await db.commit()
                logger.info(
                    "Shopify customers synced: %d created, %d updated, %d errors",
                    result.created,
                    result.updated,
                    len(result.errors),
                )
            except Exception as exc:
                result.errors.append(f"Sync failed: {exc}")
                logger.error("Shopify customers sync failed: %s", exc)

        return result

    # ------------------------------------------------------------------
    # Webhook support — upsert a single order from a webhook payload
    # ------------------------------------------------------------------

    async def upsert_order_from_payload(
        self,
        config: dict[str, Any],
        workspace_id: str,
        payload: dict[str, Any],
        db: AsyncSession | None = None,
    ) -> SyncResult:
        """Upsert a single order received via a Shopify webhook.

        Used by the inbound webhook receiver so order changes pushed by
        Shopify are reflected in the workspace in (near) real time.

        If ``db`` is provided it is reused (avoids opening a nested session,
        which matters for single-connection SQLite setups); otherwise a new
        session is opened and committed.
        """
        if db is None:
            async with async_session_factory() as session:
                return await self._upsert_order_payload(session, workspace_id, payload)
        return await self._upsert_order_payload(db, workspace_id, payload)

    async def upsert_product_from_payload(
        self,
        config: dict[str, Any],
        workspace_id: str,
        payload: dict[str, Any],
        db: AsyncSession | None = None,
    ) -> SyncResult:
        """Upsert a single product received via a products/* webhook."""
        if db is None:
            async with async_session_factory() as session:
                return await self._upsert_product_payload(session, workspace_id, payload)
        return await self._upsert_product_payload(db, workspace_id, payload)

    async def upsert_customer_from_payload(
        self,
        config: dict[str, Any],
        workspace_id: str,
        payload: dict[str, Any],
        db: AsyncSession | None = None,
    ) -> SyncResult:
        """Upsert a single customer received via a customers/* webhook."""
        if db is None:
            async with async_session_factory() as session:
                return await self._upsert_customer_payload(session, workspace_id, payload)
        return await self._upsert_customer_payload(db, workspace_id, payload)

    async def _upsert_order_payload(
        self,
        db: AsyncSession,
        workspace_id: str,
        payload: dict[str, Any],
    ) -> SyncResult:
        result = SyncResult()
        try:
            is_new = await self._upsert_order(db, workspace_id, payload)
            if is_new:
                result.created += 1
            else:
                result.updated += 1
            await db.flush()
            await db.commit()
        except Exception as exc:
            result.errors.append(f"Webhook order upsert failed: {exc}")
            logger.error("Shopify webhook order upsert failed: %s", exc)
        return result

    async def _upsert_product_payload(
        self,
        db: AsyncSession,
        workspace_id: str,
        payload: dict[str, Any],
    ) -> SyncResult:
        result = SyncResult()
        try:
            is_new = await self._upsert_product(db, workspace_id, payload)
            if is_new:
                result.created += 1
            else:
                result.updated += 1
            await db.flush()
            await db.commit()
        except Exception as exc:
            result.errors.append(f"Webhook product upsert failed: {exc}")
            logger.error("Shopify webhook product upsert failed: %s", exc)
        return result

    async def _upsert_customer_payload(
        self,
        db: AsyncSession,
        workspace_id: str,
        payload: dict[str, Any],
    ) -> SyncResult:
        result = SyncResult()
        try:
            is_new = await self._upsert_customer(db, workspace_id, payload)
            if is_new:
                result.created += 1
            else:
                result.updated += 1
            await db.flush()
            await db.commit()
        except Exception as exc:
            result.errors.append(f"Webhook customer upsert failed: {exc}")
            logger.error("Shopify webhook customer upsert failed: %s", exc)
        return result

    # ==================================================================
    # Internal helpers
    # ==================================================================

    async def _fetch_all_pages(
        self,
        base_url: str,
        headers: dict,
        list_key: str,
        params: dict | None = None,
    ) -> list[dict]:
        """Fetch all pages of a paginated Shopify REST endpoint."""
        items: list[dict] = []
        url = base_url
        default_params = {"limit": 250, **(params or {})}

        async with httpx.AsyncClient(timeout=30, trust_env=False) as client:
            while url:
                resp = await client.get(
                    url,
                    headers=headers,
                    params=default_params if url == base_url else None,
                )
                if resp.status_code != 200:
                    logger.error("Shopify API error %d: %s", resp.status_code, resp.text[:500])
                    break

                data = resp.json()
                batch = data.get(list_key, [])
                items.extend(batch)

                # Shopify pagination: check Link header for next page
                link_header = resp.headers.get("Link", "")
                url = ""
                if 'rel="next"' in link_header:
                    for part in link_header.split(","):
                        if 'rel="next"' in part:
                            url = part.split(";")[0].strip("<> ")
                            break

                # Stop early if the platform returned a short final page.
                if len(batch) < default_params["limit"]:
                    break

        return items

    async def _upsert_product(
        self,
        db: AsyncSession,
        workspace_id: str,
        sp: dict,
    ) -> bool:
        """Create or update a local Product from Shopify data.

        Returns True if a new product was created, False if an existing
        one was updated.
        """
        shopify_id = str(sp.get("id", ""))
        title = sp.get("title", "") or "Untitled"
        slug = _slugify(title)

        existing = await db.execute(
            select(Product).where(
                Product.workspace_id == workspace_id,
                Product.sku == f"shopify-{shopify_id}",
            )
        )
        product = existing.scalar_one_or_none()
        is_new = product is None

        # Extract variants
        variants = sp.get("variants", [])
        first_variant = variants[0] if variants else {}

        price = float(first_variant.get("price", 0) or 0)
        compare_at = first_variant.get("compare_at_price")
        compare_at = float(compare_at) if compare_at else None
        # 真实库存：Shopify variant 的 inventory_quantity
        stock = int(first_variant.get("inventory_quantity") or 0)

        # Extract images
        images = [img.get("src", "") for img in sp.get("images", []) if img.get("src")]

        # Extract tags
        raw_tags = sp.get("tags", "")
        tags = [t.strip() for t in raw_tags.split(",") if t.strip()] if raw_tags else []

        if product is None:
            product = Product(
                id=str(uuid.uuid4()),
                workspace_id=workspace_id,
                name=title,
                slug=slug,
                description=sp.get("body_html") or "",
                category=sp.get("product_type") or "",
                brand=sp.get("vendor") or "",
                price=price,
                compare_at_price=compare_at,
                cost_price=None,
                sku=f"shopify-{shopify_id}",
                barcode=first_variant.get("barcode") or "",
                weight=float(first_variant.get("weight", 0) or 0),
                status=ProductStatus.ACTIVE,
                images=images,
                tags=tags,
                stock=stock,
                has_variants=len(variants) > 1,
            )
            db.add(product)
        else:
            product.name = title
            product.slug = slug
            product.description = sp.get("body_html") or ""
            product.category = sp.get("product_type") or ""
            product.brand = sp.get("vendor") or ""
            product.price = price
            product.compare_at_price = compare_at
            product.images = images
            product.tags = tags
            product.weight = float(first_variant.get("weight", 0) or 0)
            product.barcode = first_variant.get("barcode") or ""
            product.stock = stock

        return is_new

    async def _upsert_order(
        self,
        db: AsyncSession,
        workspace_id: str,
        so: dict,
    ) -> bool:
        """Create or update a local Order from Shopify data.

        Returns True if a new order was created, False if an existing one
        was updated.

        IMPORTANT: on update, existing line items are replaced (not
        appended) so re-syncing the same order never duplicates items.
        """
        order_number = str(so.get("order_number", so.get("name", "")))
        shopify_order_id = str(so.get("id", ""))

        # Load the order together with its line items so we can replace them.
        existing = await db.execute(
            select(Order).where(
                Order.workspace_id == workspace_id,
                Order.order_number == f"SP-{order_number}",
            )
        )
        order = existing.scalar_one_or_none()
        is_new = order is None

        # Map status
        financial_status = so.get("financial_status", "")
        fulfillment_status = so.get("fulfillment_status") or ""
        status_map = {
            "pending": OrderStatus.PENDING,
            "authorized": OrderStatus.PENDING,
            "paid": OrderStatus.CONFIRMED,
            "partially_paid": OrderStatus.CONFIRMED,
            "refunded": OrderStatus.REFUNDED,
            "partially_refunded": OrderStatus.REFUNDED,
            "voided": OrderStatus.CANCELLED,
        }
        status = status_map.get(financial_status, OrderStatus.PENDING)
        if fulfillment_status == "fulfilled" and status == OrderStatus.CONFIRMED:
            status = OrderStatus.DELIVERED

        # Customer info
        customer_data = so.get("customer", {}) or {}
        customer_name = (
            f"{customer_data.get('first_name', '')} {customer_data.get('last_name', '')}"
        ).strip()

        # 关联本地客户：优先 Shopify customer id（存在 notes 里），email 兜底
        customer_id = None
        if customer_data.get("id"):
            local_c = await db.scalar(
                select(Customer).where(
                    Customer.workspace_id == workspace_id,
                    Customer.notes == f"Shopify ID: {customer_data['id']}",
                )
            )
            if local_c is not None:
                customer_id = local_c.id
        if customer_id is None and customer_data.get("email"):
            local_c = await db.scalar(
                select(Customer).where(
                    Customer.workspace_id == workspace_id,
                    Customer.email == customer_data["email"],
                )
            )
            if local_c is not None:
                customer_id = local_c.id

        shipping_addr = so.get("shipping_address", {}) or {}
        shipping_address = {
            "name": shipping_addr.get("name", ""),
            "phone": shipping_addr.get("phone", ""),
            "province": shipping_addr.get("province", ""),
            "city": shipping_addr.get("city", ""),
            "district": shipping_addr.get("address2", ""),
            "detail": shipping_addr.get("address1", ""),
            "zip_code": shipping_addr.get("zip", ""),
        } if shipping_addr else None

        total = float(so.get("total_price", 0) or 0)
        subtotal = float(so.get("subtotal_price", 0) or 0)
        shipping = float(so.get("total_shipping_price_set", {}).get("shop_money", {}).get("amount", 0) or 0)
        tax = float(so.get("total_tax", 0) or 0)
        discount = float(so.get("total_discounts", 0) or 0)

        if order is None:
            order = Order(
                id=str(uuid.uuid4()),
                workspace_id=workspace_id,
                order_number=f"SP-{order_number}",
                status=status,
                customer_id=customer_id,
                customer_name=customer_name or None,
                customer_email=customer_data.get("email") or None,
                subtotal=subtotal,
                tax=tax,
                shipping=shipping,
                discount=discount,
                total=total,
                payment_status="paid" if financial_status == "paid" else "unpaid",
                platform="shopify",
                shipping_address=shipping_address,
                notes=so.get("note") or None,
                created_at=datetime.fromisoformat(
                    so.get("created_at", datetime.now(timezone.utc).isoformat()).replace("Z", "+00:00")
                ),
            )
            db.add(order)
            await db.flush()
        else:
            order.status = status
            order.total = total
            order.subtotal = subtotal
            order.shipping = shipping
            order.tax = tax
            order.discount = discount
            order.customer_name = customer_name or order.customer_name
            order.customer_email = customer_data.get("email") or order.customer_email
            if customer_id is not None:
                order.customer_id = customer_id
            order.shipping_address = shipping_address
            order.notes = so.get("note") or order.notes
            await db.flush()
            # Replace line items to keep the order idempotent on re-sync.
            await db.execute(delete(OrderItem).where(OrderItem.order_id == order.id))

        # Insert (or re-insert) line items
        line_items = so.get("line_items", [])
        for li in line_items:
            # 关联本地商品（Shopify line_item.product_id → 本地 sku=shopify-{id}）
            product_id = None
            if li.get("product_id"):
                local_p = await db.scalar(
                    select(Product).where(
                        Product.workspace_id == workspace_id,
                        Product.sku == f"shopify-{li['product_id']}",
                    )
                )
                if local_p is not None:
                    product_id = local_p.id
            item = OrderItem(
                id=str(uuid.uuid4()),
                order_id=order.id,
                product_id=product_id,
                product_name=li.get("title", "") or li.get("name", ""),
                sku=li.get("sku") or None,
                quantity=int(li.get("quantity", 1)),
                unit_price=float(li.get("price", 0) or 0),
                total_price=float(li.get("price", 0) or 0) * int(li.get("quantity", 1)),
            )
            db.add(item)

        return is_new

    async def _upsert_customer(
        self,
        db: AsyncSession,
        workspace_id: str,
        sc: dict,
    ) -> bool:
        """Create or update a local Customer from Shopify data.

        Returns True if a new customer was created, False if an existing
        one was updated.
        """
        email = sc.get("email") or ""
        shopify_customer_id = str(sc.get("id", ""))

        existing = await db.execute(
            select(Customer).where(
                Customer.workspace_id == workspace_id,
                Customer.email == email,
            )
        )
        customer = existing.scalar_one_or_none()
        is_new = customer is None

        first_name = sc.get("first_name", "") or ""
        last_name = sc.get("last_name", "") or ""
        name = f"{first_name} {last_name}".strip() or email

        phone = sc.get("phone") or sc.get("default_address", {}).get("phone") or ""

        tags = []
        raw_tags = sc.get("tags", "")
        if raw_tags:
            tags = [t.strip() for t in raw_tags.split(",") if t.strip()]

        total_orders = int(sc.get("orders_count", 0) or 0)
        total_spent = float(sc.get("total_spent", 0) or 0)

        if customer is None:
            customer = Customer(
                id=str(uuid.uuid4()),
                workspace_id=workspace_id,
                name=name,
                email=email or None,
                phone=phone or None,
                tags=tags,
                total_orders=total_orders,
                total_spent=total_spent,
                source="shopify",
                notes=f"Shopify ID: {shopify_customer_id}",
            )
            db.add(customer)
        else:
            customer.name = name
            customer.phone = phone or customer.phone
            customer.tags = tags
            customer.total_orders = total_orders
            customer.total_spent = total_spent
            customer.notes = f"Shopify ID: {shopify_customer_id}"

        return is_new

    # ------------------------------------------------------------------
    # Discounts / Coupons
    # ------------------------------------------------------------------

    async def sync_discounts(
        self,
        config: dict[str, Any],
        workspace_id: str,
    ) -> SyncResult:
        """Sync price rules + discount codes from Shopify into local coupons.

        Requires the read_price_rules scope on the Admin API token.
        """
        from app.models.coupon import Coupon, CouponType

        result = SyncResult()
        store_url = _normalize_store_url(config.get("store_url"))
        access_token = (config.get("api_key") or config.get("access_token") or "")

        if not store_url or not access_token:
            result.errors.append("Missing store_url or api_key in store config")
            return result

        def _parse_dt(value: Any):
            """Shopify 返回带时区 ISO 字符串 → 转 naive UTC datetime（SQLite 兼容）"""
            if not value:
                return None
            try:
                d = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
                if d.tzinfo is not None:
                    d = d.astimezone(timezone.utc).replace(tzinfo=None)
                return d
            except Exception:
                return None

        headers = {
            "X-Shopify-Access-Token": access_token,
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=30, trust_env=False) as client:
                rules = await self._fetch_all_pages(
                    f"{store_url}/admin/api/{SHOPIFY_API_VERSION}/price_rules.json",
                    headers,
                    "price_rules",
                )
                coupons_to_add: list[Coupon] = []
                for rule in rules:
                    rule_id = rule.get("id")
                    value_type = rule.get("value_type")
                    target_type = rule.get("target_type")
                    title = (rule.get("title") or "").strip()

                    codes: list[str] = []
                    if rule_id is not None:
                        try:
                            code_payload = await self._fetch_all_pages(
                                f"{store_url}/admin/api/{SHOPIFY_API_VERSION}/price_rules/{rule_id}/discount_codes.json",
                                headers,
                                "discount_codes",
                            )
                            codes = [str(c.get("code", "")).strip() for c in code_payload if c.get("code")]
                        except Exception:
                            codes = []
                    if not codes and title.startswith("CODE_"):
                        codes = [title[len("CODE_"):].strip()]
                    if not codes:
                        continue

                    if target_type == "shipping_line":
                        ctype = CouponType.FREE_SHIPPING
                        value = 0.0
                    elif value_type == "percentage":
                        ctype = CouponType.PERCENT
                        value = abs(float(rule.get("value") or 0))
                    else:
                        ctype = CouponType.FIXED
                        value = abs(float(rule.get("value") or 0))

                    starts_at = _parse_dt(rule.get("starts_at"))
                    ends_at = _parse_dt(rule.get("ends_at"))
                    pre = rule.get("prerequisite_subtotal_range") or {}
                    min_amount = float(pre.get("greater_than_or_equal_to")) if pre.get("greater_than_or_equal_to") else 0.0
                    max_uses = int(rule.get("usage_limit") or 100)

                    for code in codes:
                        coupons_to_add.append(
                            Coupon(
                                workspace_id=workspace_id,
                                code=code.upper(),
                                type=ctype,
                                value=value,
                                min_order_amount=min_amount,
                                max_uses=max_uses,
                                is_active=True,
                                starts_at=starts_at,
                                expires_at=ends_at,
                            )
                        )

            async with async_session_factory() as db:
                existing = (
                    await db.execute(select(Coupon).where(Coupon.workspace_id == workspace_id))
                ).scalars().all()
                by_code = {c.code: c for c in existing}
                for coupon in coupons_to_add:
                    hit = by_code.get(coupon.code)
                    if hit is not None:
                        hit.value = coupon.value
                        hit.type = coupon.type
                        hit.min_order_amount = coupon.min_order_amount
                        hit.max_uses = coupon.max_uses
                        hit.starts_at = coupon.starts_at
                        hit.expires_at = coupon.expires_at
                        result.updated += 1
                    else:
                        db.add(coupon)
                        by_code[coupon.code] = coupon
                        result.created += 1
                await db.commit()
        except Exception as exc:
            logger.warning("Shopify discount sync failed: %s", exc)
            result.errors.append(str(exc)[:200])

        return result



    # ------------------------------------------------------------------
    # 反向写入 Shopify（网站操作 → 真实店铺）
    # ------------------------------------------------------------------

    async def update_product_price(
        self,
        config: dict[str, Any],
        shopify_product_id: str,
        new_price: float | None = None,
        discount_pct: float | None = None,
    ) -> bool:
        """把商品价格写回 Shopify（清仓降价等），作用于【全部变体】。

        - discount_pct: 每个变体按各自原价 × (1 - discount_pct/100) 更新（如 15 = 降 15%）
        - new_price: 所有变体统一设为该价格
        两者至少传一个；传了 discount_pct 则忽略 new_price。
        Requires write_products scope.
        """
        store_url = _normalize_store_url(config.get("store_url"))
        access_token = (config.get("api_key") or config.get("access_token") or "")
        if not store_url or not access_token:
            return False
        headers = {
            "X-Shopify-Access-Token": access_token,
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=30, trust_env=False) as client:
                # 1) 查全部 variants
                vr = await client.get(
                    f"{store_url}/admin/api/{SHOPIFY_API_VERSION}/products/{shopify_product_id}/variants.json",
                    headers=headers,
                )
                if vr.status_code != 200:
                    logger.warning("Shopify variants fetch failed: %d", vr.status_code)
                    return False
                variants = vr.json().get("variants", [])
                if not variants:
                    return False
                # 2) 计算每个变体的目标价
                targets: list[tuple[int, float]] = []
                for v in variants:
                    vid = v["id"]
                    if discount_pct is not None:
                        old = float(v.get("price") or 0)
                        targets.append((vid, round(old * (1 - discount_pct / 100.0), 2)))
                    else:
                        targets.append((vid, round(new_price or 0, 2)))
                # 3) 逐个 PUT（Shopify 无批量 variant 更新）
                ok_count = 0
                for vid, price in targets:
                    ur = await client.put(
                        f"{store_url}/admin/api/{SHOPIFY_API_VERSION}/variants/{vid}.json",
                        headers=headers,
                        json={"variant": {"id": vid, "price": f"{price:.2f}"}},
                    )
                    if ur.status_code == 200:
                        ok_count += 1
                    else:
                        logger.warning(
                            "Shopify variant %s price update failed: %d %s",
                            vid, ur.status_code, ur.text[:200],
                        )
                logger.info(
                    "Shopify price updated: product %s, %d/%d variants",
                    shopify_product_id, ok_count, len(targets),
                )
                return ok_count == len(targets)
        except Exception as exc:
            logger.warning("Shopify price update error: %s", exc)
            return False


    async def sync_product_to_shopify(
        self,
        config: dict[str, Any],
        shopify_product_id: str,
        updates: dict[str, Any],
    ) -> tuple[bool, list[str]]:
        """把商品管理页的编辑字段写回 Shopify（双向同步）。

        字段映射（只更新 updates 中出现的键）：
          name → title, description → body_html, category → product_type,
          brand → vendor, tags → tags, status → status (active/draft/archived)
          price / compare_at_price / sku / weight / barcode → 第一个变体
          stock → inventory_levels (需 location_id)
        返回 (是否全部成功, 错误信息列表)。
        """
        store_url = _normalize_store_url(config.get("store_url"))
        access_token = (config.get("api_key") or config.get("access_token") or "")
        if not store_url or not access_token:
            return False, ["未配置 Shopify 店铺凭据"]
        headers = {
            "X-Shopify-Access-Token": access_token,
            "Content-Type": "application/json",
        }
        errors: list[str] = []
        try:
            async with httpx.AsyncClient(timeout=30, trust_env=False) as client:
                # 1) product 级字段
                product_payload: dict[str, Any] = {}
                if "name" in updates:
                    product_payload["title"] = str(updates["name"])
                if "description" in updates:
                    product_payload["body_html"] = updates["description"] or ""
                if "category" in updates:
                    product_payload["product_type"] = updates["category"] or ""
                if "brand" in updates:
                    product_payload["vendor"] = updates["brand"] or ""
                if "tags" in updates:
                    tg = updates["tags"] or []
                    product_payload["tags"] = ", ".join(
                        t if isinstance(t, str) else str(t.get("name", t))
                        for t in tg
                    ) if tg else ""
                if "status" in updates:
                    product_payload["status"] = str(updates["status"])
                if product_payload:
                    pr = await client.put(
                        f"{store_url}/admin/api/{SHOPIFY_API_VERSION}/products/{shopify_product_id}.json",
                        headers=headers,
                        json={"product": product_payload},
                    )
                    if pr.status_code != 200:
                        errors.append(f"商品信息同步失败: {pr.text[:150]}")

                # 2) 变体级字段（price/compare_at_price/sku/weight/barcode）
                variant_keys = {
                    "price": "price",
                    "compare_at_price": "compare_at_price",
                    "sku": "sku",
                    "weight": "weight",
                    "barcode": "barcode",
                }
                variant_updates = {
                    sk: updates[k] for k, sk in variant_keys.items() if k in updates
                }
                if variant_updates:
                    vr = await client.get(
                        f"{store_url}/admin/api/{SHOPIFY_API_VERSION}/products/{shopify_product_id}/variants.json",
                        headers=headers,
                    )
                    if vr.status_code == 200:
                        variants = vr.json().get("variants", [])
                        if variants:
                            vid = variants[0]["id"]
                            vpayload = {"variant": {"id": vid, **variant_updates}}
                            ur = await client.put(
                                f"{store_url}/admin/api/{SHOPIFY_API_VERSION}/variants/{vid}.json",
                                headers=headers,
                                json=vpayload,
                            )
                            if ur.status_code != 200:
                                errors.append(f"价格/规格同步失败: {ur.text[:150]}")
                        else:
                            errors.append("Shopify 商品无变体")
                    else:
                        errors.append(f"变体查询失败: {vr.status_code}")

                # 3) 库存 → inventory_levels（需 location_id）
                if "stock" in updates:
                    vr2 = await client.get(
                        f"{store_url}/admin/api/{SHOPIFY_API_VERSION}/products/{shopify_product_id}/variants.json",
                        headers=headers,
                    )
                    if vr2.status_code == 200:
                        variants = vr2.json().get("variants", [])
                        if variants:
                            iid = variants[0].get("inventory_item_id")
                            if iid:
                                lr = await client.get(
                                    f"{store_url}/admin/api/{SHOPIFY_API_VERSION}/inventory_levels.json",
                                    params={"inventory_item_ids": str(iid)},
                                    headers=headers,
                                )
                                levels = lr.json().get("inventory_levels", []) if lr.status_code == 200 else []
                                if levels:
                                    loc_id = levels[0]["location_id"]
                                    sr = await client.post(
                                        f"{store_url}/admin/api/{SHOPIFY_API_VERSION}/inventory_levels/set.json",
                                        headers=headers,
                                        json={
                                            "location_id": loc_id,
                                            "inventory_item_id": iid,
                                            "available": int(updates["stock"]),
                                        },
                                    )
                                    if sr.status_code not in (200, 201):
                                        errors.append(f"库存同步失败: {sr.text[:150]}")
                                else:
                                    errors.append("未找到库存位置（location）")
                            else:
                                errors.append("变体无 inventory_item_id")
                        else:
                            errors.append("Shopify 商品无变体（库存）")
                    else:
                        errors.append(f"变体查询失败(库存): {vr2.status_code}")

                return len(errors) == 0, errors
        except Exception as exc:
            logger.warning("Shopify product sync error: %s", exc)
            return False, [str(exc)[:150]]

    async def create_coupon_on_shopify(
        self,
        config: dict[str, Any],
        code: str,
        value: float,
        min_amount: float = 0.0,
        max_uses: int = 200,
        expires_in_days: int = 14,
    ) -> bool:
        """在 Shopify 创建真实优惠券（price rule + discount code）。

        Requires write_discount_codes + write_price_rules scopes.
        """
        store_url = _normalize_store_url(config.get("store_url"))
        access_token = (config.get("api_key") or config.get("access_token") or "")
        if not store_url or not access_token:
            return False
        headers = {
            "X-Shopify-Access-Token": access_token,
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=20, trust_env=False) as client:
                starts_at = datetime.utcnow().isoformat() + "Z"
                ends_at = (
                    datetime.utcnow() + timedelta(days=expires_in_days)
                ).isoformat() + "Z"
                rule_payload = {
                    "price_rule": {
                        "title": f"Nexora 唤醒券 {code}",
                        "value_type": "fixed_amount",
                        "value": f"-{value:.2f}",
                        "target_type": "line_item",
                        "target_selection": "all",
                        "allocation_method": "across",
                        "customer_selection": "all",
                        "once_per_customer": True,
                        "usage_limit": max_uses,
                        "starts_at": starts_at,
                        "ends_at": ends_at,
                        "prerequisite_subtotal_range": {
                            "greater_than_or_equal_to": str(min_amount)
                        },
                    }
                }
                rr = await client.post(
                    f"{store_url}/admin/api/{SHOPIFY_API_VERSION}/price_rules.json",
                    headers=headers,
                    json=rule_payload,
                )
                if rr.status_code not in (200, 201):
                    logger.warning("Shopify price rule create failed: %d %s", rr.status_code, rr.text[:250])
                    return False
                rule_id = rr.json()["price_rule"]["id"]
                # 2) 创建 discount code
                cr = await client.post(
                    f"{store_url}/admin/api/{SHOPIFY_API_VERSION}/price_rules/{rule_id}/discount_codes.json",
                    headers=headers,
                    json={"discount_code": {"code": code}},
                )
                if cr.status_code not in (200, 201):
                    logger.warning("Shopify discount code create failed: %d %s", cr.status_code, cr.text[:250])
                    return False
                logger.info("Shopify coupon created: %s (rule %s)", code, rule_id)
                return True
        except Exception as exc:
            logger.warning("Shopify coupon create error: %s", exc)
            return False



def _to_shopify_utc(value: datetime) -> str:
    """本地/朴素 datetime → Shopify API 需要的 UTC ISO 字符串。"""
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value.isoformat() + "Z"


def _normalize_store_url(url: str | None) -> str:
    """把用户可能填写的 Shopify 后台地址转成 API 域名。

    https://admin.shopify.com/store/nexora-store-xxx
        → https://nexora-store-xxx.myshopify.com
    """
    url = (url or "").strip().rstrip("/")
    if "admin.shopify.com" in url and "/store/" in url:
        name = url.split("/store/")[-1].split("/")[0].strip()
        if name:
            return f"https://{name}.myshopify.com"
    return url


def _parse_iso_dt(value: Any):
    """解析 Shopify ISO 时间 → naive UTC datetime（SQLite 兼容）"""
    if not value:
        return None
    try:
        d = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if d.tzinfo is not None:
            d = d.astimezone(timezone.utc).replace(tzinfo=None)
        return d
    except Exception:
        return None


def _slugify(text: str) -> str:
    """Simple slug generator."""
    import re
    slug = text.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    return slug[:200] or "product"
