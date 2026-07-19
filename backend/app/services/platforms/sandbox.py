"""Nexora - Sandbox Platform Integration (offline / no credentials).

A self-contained mock platform used for development, demos, and tests.
It generates deterministic product / order / customer data so the full
sync pipeline can be exercised end-to-end without any real API keys.

Because the generated external IDs are stable, running the sync twice
behaves idempotently: the first run *creates* records and the second
run *updates* them (no duplicates). This makes it ideal for verifying
the integration layer offline and for writing reproducible tests.
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.models.order import Order, OrderItem, OrderStatus, PaymentStatus
from app.models.product import Product, ProductStatus
from app.database import async_session_factory
from app.services.platforms.base import PlatformIntegration, SyncResult
from app.utils.logging import get_logger

logger = get_logger(__name__)

# Deterministic sample catalogue. External IDs are fixed strings so that
# re-running a sync updates existing rows instead of duplicating them.
_PRODUCT_NAMES = [
    ("无线蓝牙耳机", "数码电子", "audio", 199.0, 299.0),
    ("智能手表 Pro", "数码电子", "wearable", 899.0, 1099.0),
    ("便携充电宝 20000mAh", "数码电子", "power", 129.0, 169.0),
    ("纯棉短袖 T 恤", "服饰", "apparel", 59.0, 89.0),
    ("运动跑步鞋", "服饰", "shoes", 329.0, 459.0),
    ("保温杯 500ml", "家居", "home", 89.0, 119.0),
    ("北欧风台灯", "家居", "home", 159.0, 199.0),
    ("婴儿纸尿裤 L 码", "母婴", "baby", 99.0, 129.0),
    ("儿童积木玩具", "母婴", "toy", 79.0, 109.0),
    ("蛋白粉 1kg", "运动健康", "sport", 259.0, 329.0),
    ("瑜伽垫 加厚", "运动健康", "sport", 69.0, 99.0),
    ("宠物自动喂食器", "宠物", "pet", 219.0, 279.0),
    ("猫粮 无谷 5kg", "宠物", "pet", 289.0, 359.0),
    ("精华面霜 50ml", "美妆个护", "beauty", 329.0, 399.0),
    ("氨基酸洗面奶", "美妆个护", "beauty", 79.0, 99.0),
]

_CUSTOMER_NAMES = [
    "张伟", "王芳", "李娜", "刘洋", "陈静", "杨帆", "赵磊", "黄敏",
    "周强", "吴婷", "徐杰", "孙丽", "马超", "朱琳", "胡军",
]

_ORDER_STATUSES = [
    OrderStatus.DELIVERED,
    OrderStatus.SHIPPED,
    OrderStatus.CONFIRMED,
    OrderStatus.PROCESSING,
    OrderStatus.PENDING,
    OrderStatus.CANCELLED,
]

_PRODUCT_COUNT = len(_PRODUCT_NAMES)
_CUSTOMER_COUNT = len(_CUSTOMER_NAMES)
_ORDER_COUNT = 30


class SandboxIntegration(PlatformIntegration):
    """Offline mock platform. No network calls, deterministic data."""

    platform_name = "sandbox"

    # ------------------------------------------------------------------
    # Credential validation — sandbox needs none.
    # ------------------------------------------------------------------

    async def validate_credentials(self, config: dict[str, Any]) -> bool:
        # The sandbox platform is always "connected"; it requires no keys.
        return True

    # ------------------------------------------------------------------
    # Products
    # ------------------------------------------------------------------

    async def sync_products(
        self, config: dict[str, Any], workspace_id: str
    ) -> SyncResult:
        result = SyncResult()
        async with async_session_factory() as db:
            try:
                for idx, (name, cat, tag, price, cmp) in enumerate(_PRODUCT_NAMES):
                    sku = f"sandbox-{idx}"
                    try:
                        is_new = await self._upsert_product(
                            db, workspace_id, idx, name, cat, tag, price, cmp, sku
                        )
                        if is_new:
                            result.created += 1
                        else:
                            result.updated += 1
                    except Exception as exc:
                        result.errors.append(f"Product '{name}': {exc}")
                await db.commit()
                logger.info(
                    "Sandbox products synced: %d created, %d updated",
                    result.created, result.updated,
                )
            except Exception as exc:
                result.errors.append(f"Sync failed: {exc}")
                logger.error("Sandbox products sync failed: %s", exc)
        return result

    # ------------------------------------------------------------------
    # Orders
    # ------------------------------------------------------------------

    async def sync_orders(
        self, config: dict[str, Any], workspace_id: str
    ) -> SyncResult:
        result = SyncResult()
        async with async_session_factory() as db:
            try:
                base_time = datetime.now(timezone.utc)
                for idx in range(_ORDER_COUNT):
                    try:
                        is_new = await self._upsert_order(db, workspace_id, idx, base_time)
                        if is_new:
                            result.created += 1
                        else:
                            result.updated += 1
                    except Exception as exc:
                        result.errors.append(f"Order #{idx}: {exc}")
                await db.commit()
                logger.info(
                    "Sandbox orders synced: %d created, %d updated",
                    result.created, result.updated,
                )
            except Exception as exc:
                result.errors.append(f"Sync failed: {exc}")
                logger.error("Sandbox orders sync failed: %s", exc)
        return result

    # ------------------------------------------------------------------
    # Customers
    # ------------------------------------------------------------------

    async def sync_customers(
        self, config: dict[str, Any], workspace_id: str
    ) -> SyncResult:
        result = SyncResult()
        async with async_session_factory() as db:
            try:
                for idx, name in enumerate(_CUSTOMER_NAMES):
                    email = f"buyer{idx}@sandbox.local"
                    try:
                        is_new = await self._upsert_customer(
                            db, workspace_id, idx, name, email
                        )
                        if is_new:
                            result.created += 1
                        else:
                            result.updated += 1
                    except Exception as exc:
                        result.errors.append(f"Customer '{email}': {exc}")
                await db.commit()
                logger.info(
                    "Sandbox customers synced: %d created, %d updated",
                    result.created, result.updated,
                )
            except Exception as exc:
                result.errors.append(f"Sync failed: {exc}")
                logger.error("Sandbox customers sync failed: %s", exc)
        return result

    # ==================================================================
    # Internal helpers
    # ==================================================================

    async def _upsert_product(
        self,
        db: AsyncSession,
        workspace_id: str,
        idx: int,
        name: str,
        category: str,
        tag: str,
        price: float,
        compare_at: float,
        sku: str,
    ) -> bool:
        existing = await db.execute(
            select(Product).where(
                Product.workspace_id == workspace_id,
                Product.sku == sku,
            )
        )
        product = existing.scalar_one_or_none()
        if product is None:
            product = Product(
                id=str(uuid.uuid4()),
                workspace_id=workspace_id,
                name=name,
                slug=f"sandbox-{idx}",
                description=f"Sandbox 示例商品：{name}",
                category=category,
                brand="Sandbox",
                price=price,
                compare_at_price=compare_at,
                cost_price=round(price * 0.6, 2),
                sku=sku,
                status=ProductStatus.ACTIVE,
                tags=[tag],
                images=[],
                has_variants=False,
            )
            db.add(product)
            return True

        product.price = price
        product.compare_at_price = compare_at
        product.category = category
        return False

    async def _upsert_order(
        self,
        db: AsyncSession,
        workspace_id: str,
        idx: int,
        base_time: datetime,
    ) -> bool:
        order_number = f"SB-{idx:04d}"
        existing = await db.execute(
            select(Order).where(
                Order.workspace_id == workspace_id,
                Order.order_number == order_number,
            )
        )
        order = existing.scalar_one_or_none()
        is_new = order is None

        # Deterministic but varied order details.
        customer_idx = idx % _CUSTOMER_COUNT
        customer_name = _CUSTOMER_NAMES[customer_idx]
        status = _ORDER_STATUSES[idx % len(_ORDER_STATUSES)]
        created = base_time - timedelta(days=idx % 45, hours=idx)

        # Pick 1-3 products for the line items.
        line_indices = [(idx + j) % _PRODUCT_COUNT for j in range(1 + (idx % 3))]
        items_meta = [_PRODUCT_NAMES[i] for i in line_indices]
        total = 0.0
        line_items = []
        for name, _cat, _tag, price, _cmp in items_meta:
            qty = 1 + ((idx + len(name)) % 3)
            unit = price
            line_total = round(unit * qty, 2)
            total += line_total
            line_items.append((name, qty, unit, line_total))

        if order is None:
            order = Order(
                id=str(uuid.uuid4()),
                workspace_id=workspace_id,
                order_number=order_number,
                status=status,
                customer_name=customer_name,
                customer_email=f"buyer{customer_idx}@sandbox.local",
                subtotal=round(total, 2),
                tax=round(total * 0.0, 2),
                shipping=0.0,
                discount=0.0,
                total=round(total, 2),
                payment_status=(
                    PaymentStatus.PAID
                    if status != OrderStatus.CANCELLED
                    else PaymentStatus.UNPAID
                ),
                platform="sandbox",
                shipping_address={"name": customer_name, "city": "深圳"},
                created_at=created,
            )
            db.add(order)
            await db.flush()
        else:
            order.status = status
            order.total = round(total, 2)
            order.subtotal = round(total, 2)
            order.customer_name = customer_name
            await db.flush()
            # Replace line items to keep the order idempotent on re-sync.
            await db.execute(delete(OrderItem).where(OrderItem.order_id == order.id))

        for name, qty, unit, line_total in line_items:
            db.add(
                OrderItem(
                    id=str(uuid.uuid4()),
                    order_id=order.id,
                    product_name=name,
                    sku=None,
                    quantity=qty,
                    unit_price=unit,
                    total_price=line_total,
                )
            )
        return is_new

    async def _upsert_customer(
        self,
        db: AsyncSession,
        workspace_id: str,
        idx: int,
        name: str,
        email: str,
    ) -> bool:
        existing = await db.execute(
            select(Customer).where(
                Customer.workspace_id == workspace_id,
                Customer.email == email,
            )
        )
        customer = existing.scalar_one_or_none()
        if customer is None:
            customer = Customer(
                id=str(uuid.uuid4()),
                workspace_id=workspace_id,
                name=name,
                email=email,
                phone=f"1380000{idx:04d}",
                tags=["sandbox"],
                total_orders=1 + (idx % 5),
                total_spent=round(99.0 * (1 + idx % 10), 2),
                source="sandbox",
            )
            db.add(customer)
            return True

        customer.name = name
        customer.tags = list(set(customer.tags + ["sandbox"]))
        return False
