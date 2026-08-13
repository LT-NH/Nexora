#!/usr/bin/env python3
"""Nexora 演示数据种子脚本（独立运行，仿照 simulator.py）。

用法：
    python seed_demo.py            # 在默认数据库（./data/nexora.db）生成演示数据
    python seed_demo.py --force    # 清空已生成订单后重新生成
    DATABASE_URL=sqlite+aiosqlite:///path/to/tmp.db python seed_demo.py  # 指向其它数据库

数据规模（默认 90 天）：
    - demo 用户（demo@nexora.com / Demo1234!）+ 工作空间（不存在则创建）
    - 8 个商品、30 个客户（不存在则创建）
    - 每天随机 20~60 笔订单（周末加成），状态混合（含 cancelled / refunded）
    - 订单行扣减商品库存；退款订单同时生成 Refund 记录
    - 结束时打印汇总：users / workspaces / products / customers / orders / refunds
"""

import argparse
import asyncio
import os
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# ── 数据库连接：优先取环境变量，其次 .env，最后默认值（与应用同库） ────────────
DEFAULT_DB_URL = "sqlite+aiosqlite:///./data/nexora.db"
if "DATABASE_URL" not in os.environ:
    env_file = BACKEND_DIR / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("DATABASE_URL="):
                os.environ["DATABASE_URL"] = line.split("=", 1)[1].strip().strip('"').strip("'")
                break
    os.environ.setdefault("DATABASE_URL", DEFAULT_DB_URL)

# 必须在使用 app.database 之前设置好 DATABASE_URL，确保全局 engine 指向正确库
import app.models  # noqa: F401   # 注册所有表到 Base.metadata
from app.database import Base, async_session_factory, engine  # noqa: E402
from sqlalchemy import delete, func, select  # noqa: E402
from app.models.customer import Customer  # noqa: E402
from app.models.order import (  # noqa: E402
    Order,
    OrderItem,
    OrderStatus,
    PaymentStatus,
)
from app.models.product import Product, ProductStatus  # noqa: E402
from app.models.refund import Refund, RefundReason, RefundStatus  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.workspace import (  # noqa: E402
    Workspace,
    WorkspaceMember,
    WorkspaceRole,
)
from app.utils.security import hash_password  # noqa: E402

# ── 与 simulator.py 相同的演示账号 ────────────────────────────────────────────
EMAIL = "demo@nexora.com"
PASSWORD = "Demo1234!"
FULL_NAME = "Demo Merchant"
WORKSPACE_NAME = "Demo Merchant的工作空间"

# ── 演示商品目录（slug 用于幂等匹配与 --force 时的库存重置） ──────────────────
PRODUCT_CATALOG = [
    dict(name="云感棉T恤", slug="cloud-cotton-tee", category="服饰", brand="Nexora",
         price=59.00, compare_at_price=89.00, cost_price=25.00, sku="NX-TEE-001",
         stock=2000, low_stock_threshold=30, status="active", tags=["夏季新品", "纯棉"]),
    dict(name="轻薄防晒外套", slug="light-uv-jacket", category="服饰", brand="Nexora",
         price=129.00, compare_at_price=199.00, cost_price=60.00, sku="NX-JKT-002",
         stock=1200, low_stock_threshold=25, status="active", tags=["防晒", "户外"]),
    dict(name="简约双肩背包", slug="minimal-backpack", category="箱包", brand="Nexora",
         price=169.00, compare_at_price=259.00, cost_price=80.00, sku="NX-BAG-003",
         stock=800, low_stock_threshold=20, status="active", tags=["通勤", "大容量"]),
    dict(name="无线蓝牙耳机", slug="wireless-earbuds", category="数码", brand="Nexora",
         price=199.00, compare_at_price=299.00, cost_price=95.00, sku="NX-AUD-004",
         stock=1500, low_stock_threshold=40, status="active", tags=["降噪", "无线"]),
    dict(name="智能保温杯", slug="smart-thermos", category="生活", brand="Nexora",
         price=89.00, compare_at_price=139.00, cost_price=40.00, sku="NX-CUP-005",
         stock=1800, low_stock_threshold=35, status="active", tags=["保温", "智能"]),
    dict(name="机械键盘87键", slug="mech-keyboard-87", category="数码", brand="Nexora",
         price=299.00, compare_at_price=399.00, cost_price=140.00, sku="NX-KBD-006",
         stock=600, low_stock_threshold=15, status="active", tags=["机械", "RGB"]),
    dict(name="天然乳胶枕", slug="latex-pillow", category="家居", brand="Nexora",
         price=159.00, compare_at_price=219.00, cost_price=70.00, sku="NX-PIL-007",
         stock=900, low_stock_threshold=20, status="active", tags=["睡眠", "护颈"]),
    dict(name="便携榨汁杯", slug="portable-blender", category="生活", brand="Nexora",
         price=119.00, compare_at_price=169.00, cost_price=55.00, sku="NX-BLD-008",
         stock=1100, low_stock_threshold=25, status="active", tags=["便携", "健康"]),
]

CUSTOMER_NAMES = [
    "周瑞", "吴悠", "郑浩", "钱佳", "沈逸", "韩雨", "冯乐", "曹阳", "蒋凡", "余悦",
    "杜然", "戴莹", "夏琪", "钟鸣", "汪蕊", "田雨", "董亮", "潘琪", "袁波", "于飞",
    "林静", "徐帆", "何欣", "胡俊", "朱琳", "高翔", "罗曦", "梁倩", "宋伟", "唐悦",
]

CARRIERS = ["SF", "YT", "ZTO", "STO"]
NOTES = ["", "", "", "请放快递柜", "联系我取件", "加急", "工作日送货"]
PLATFORMS = ["manual", "manual", "manual", "manual", "douyin", "taobao", "wechat"]


def _pick_status(age_days: int) -> OrderStatus:
    """按订单年龄返回合理状态分布。"""
    if age_days <= 1:
        return random.choice(["pending", "confirmed", "processing", "processing", "shipped"])
    if age_days <= 3:
        return random.choice(
            ["processing", "processing", "shipped", "shipped", "delivered", "cancelled"]
        )
    r = random.random()
    if r < 0.78:
        return "delivered"
    if r < 0.86:
        return "shipped"
    if r < 0.92:
        return "cancelled"
    if r < 0.98:
        return "refunded"
    return "processing"


async def get_or_create_demo_user(db) -> tuple[User, Workspace, bool, bool]:
    """返回 (user, workspace, user_created, ws_created)。"""
    from sqlalchemy import select

    result = await db.execute(select(User).where(User.email == EMAIL))
    user = result.scalar_one_or_none()
    user_created = user is None
    if user is None:
        user = User(
            email=EMAIL,
            password_hash=hash_password(PASSWORD),
            full_name=FULL_NAME,
            email_verified=True,
            is_active=True,
            is_superadmin=True,  # 演示账号即平台管理员（可一键重置演示数据/管理备份）
        )
        db.add(user)
        await db.flush()

    # 找到用户的第一个工作空间（按成员关系）；不存在则创建
    result = await db.execute(
        select(Workspace)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == user.id)
        .order_by(Workspace.created_at.asc())
        .limit(1)
    )
    workspace = result.scalar_one_or_none()
    ws_created = workspace is None
    if workspace is None:
        workspace = Workspace(
            name=WORKSPACE_NAME,
            slug=f"my-workspace-{user.id[:8]}",
        )
        db.add(workspace)
        await db.flush()
        db.add(
            WorkspaceMember(
                workspace_id=workspace.id,
                user_id=user.id,
                role=WorkspaceRole.OWNER,
                joined_at=datetime.now(timezone.utc),
            )
        )
        await db.flush()
    return user, workspace, user_created, ws_created


async def seed_products(db, workspace: Workspace) -> int:
    """创建目录商品（若该工作空间已有商品则跳过）。返回新建数量。"""
    from sqlalchemy import select

    result = await db.execute(
        select(Product.id).where(Product.workspace_id == workspace.id).limit(1)
    )
    if result.scalar_one_or_none() is not None:
        return 0

    created = 0
    for p in PRODUCT_CATALOG:
        db.add(
            Product(
                workspace_id=workspace.id,
                name=p["name"],
                slug=p["slug"],
                category=p["category"],
                brand=p["brand"],
                price=p["price"],
                compare_at_price=p["compare_at_price"],
                cost_price=p["cost_price"],
                sku=p["sku"],
                stock=p["stock"],
                low_stock_threshold=p["low_stock_threshold"],
                status=ProductStatus(p["status"]),
                tags=list(p["tags"]),
                images=[],
            )
        )
        created += 1
    await db.flush()
    return created


async def seed_customers(db, workspace: Workspace) -> int:
    """创建演示客户（不足 30 个时补足到 30）。返回新建数量。"""
    from sqlalchemy import select

    result = await db.execute(
        select(Customer.id).where(Customer.workspace_id == workspace.id)
    )
    existing_ids = {row[0] for row in result.fetchall()}
    existing_count = len(existing_ids)

    created = 0
    for i in range(existing_count, len(CUSTOMER_NAMES)):
        name = CUSTOMER_NAMES[i]
        level = ["bronze", "bronze", "silver", "gold", "silver", "bronze", "diamond"][i % 7]
        db.add(
            Customer(
                workspace_id=workspace.id,
                name=name,
                email=f"c{i + 1001}@qq.com",
                phone=f"138{random.randint(10000000, 99999999)}",
                tags=random.choice([[], ["老客户"], ["新客"], ["高价值"]]),
                membership_level=level,
                membership_points=0,
                source=random.choice(["manual", "douyin", "taobao", "wechat", "seed"]),
            )
        )
        created += 1
    await db.flush()
    return created


async def generate_orders(db, workspace: Workspace, products, customers, days: int) -> tuple[int, int]:
    """生成 days 天历史订单与退款。返回 (订单数, 退款数)。

    每个订单行扣减对应商品库存；refunded 订单额外生成 Refund 记录；
    结束后回写客户聚合统计（total_orders / total_spent / last_order_at）。
    """
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    products = list(products)
    customers = list(customers)
    customer_stats: dict[str, dict] = {
        c.id: {"orders": 0, "spent": 0.0, "last": None} for c in customers
    }

    created_orders = 0
    created_refunds = 0
    for day_offset in range(days, -1, -1):  # 从最旧到今天（含今天，保证昨日/今日有数据）
        day = today - timedelta(days=day_offset)
        is_weekend = day.weekday() >= 5  # 周六、周日加成
        count = random.randint(35, 60) if is_weekend else random.randint(20, 45)
        age_days = (today - day).days

        for seq in range(count):
            product = random.choice(products)
            qty = 1 if random.random() < 0.75 else 2
            status = OrderStatus(_pick_status(age_days))
            unit_price = float(product.price)
            total_price = round(qty * unit_price, 2)
            subtotal = total_price
            shipping = 0.0 if subtotal > 39 else round(random.uniform(5, 10), 2)
            discount = 0.0
            if random.random() < 0.2 and subtotal > 30:
                discount = round(subtotal * random.uniform(0.05, 0.15), 2)
            total = round(subtotal + shipping - discount, 2)

            customer = random.choice(customers) if customers and random.random() < 0.9 else None
            created_at = day + timedelta(
                hours=random.randint(8, 22), minutes=random.randint(0, 59)
            )

            payment_status = PaymentStatus.PAID
            if status in (OrderStatus.REFUNDED,):
                payment_status = PaymentStatus.REFUNDED
            elif status == OrderStatus.CANCELLED:
                payment_status = PaymentStatus.PAID if random.random() < 0.5 else PaymentStatus.UNPAID
            elif status == OrderStatus.PENDING and age_days <= 2 and random.random() < 0.8:
                # 近两天的 pending 订单保持"待支付"，供收款管理演示
                payment_status = PaymentStatus.UNPAID

            order = Order(
                workspace_id=workspace.id,
                customer_id=customer.id if customer else None,
                customer_name=customer.name if customer else "Walk-in",
                customer_email=customer.email if customer else f"{random.randint(100, 999)}@qq.com",
                order_number=f"SO-{day:%Y%m%d}-{seq + 1:04d}",
                status=status,
                subtotal=subtotal,
                tax=0.0,
                shipping=shipping,
                discount=discount,
                total=total,
                shipping_address={},
                shipped_at=created_at + timedelta(days=1) if status == OrderStatus.SHIPPED else None,
                delivered_at=created_at + timedelta(days=3) if status == OrderStatus.DELIVERED else None,
                tracking_number=f"{random.choice(CARRIERS)}{random.randint(1000000000, 9999999999)}" if status in (
                    OrderStatus.SHIPPED, OrderStatus.DELIVERED
                ) else None,
                carrier=random.choice(CARRIERS) if status in (
                    OrderStatus.SHIPPED, OrderStatus.DELIVERED
                ) else None,
                notes=random.choice(NOTES) or None,
                payment_status=payment_status,
                platform=random.choice(PLATFORMS),
                created_at=created_at,
            )
            db.add(order)
            # 必须逐单 flush：OrderItem 需要 order.id（批量 flush 会导致外键为空）
            await db.flush()

            db.add(
                OrderItem(
                    order_id=order.id,
                    product_id=product.id,
                    product_name=product.name,
                    sku=product.sku,
                    quantity=qty,
                    unit_price=unit_price,
                    total_price=total_price,
                )
            )

            # 订单行扣减库存（保证库存不为负）
            if product.stock >= qty:
                product.stock -= qty

            # 退款订单生成 Refund 记录
            if status == OrderStatus.REFUNDED:
                db.add(
                    Refund(
                        workspace_id=workspace.id,
                        order_id=order.id,
                        amount=total,
                        reason=random.choice(
                            [
                                RefundReason.QUALITY,
                                RefundReason.WRONG_ITEM,
                                RefundReason.DAMAGED,
                                RefundReason.NOT_AS_DESCRIBED,
                                RefundReason.OTHER,
                            ]
                        ),
                        reason_detail=random.choice(["", "与描述不符", "运输破损", "质量问题"]),
                        status=random.choice(
                            [
                                RefundStatus.COMPLETED,
                                RefundStatus.COMPLETED,
                                RefundStatus.APPROVED,
                                RefundStatus.PROCESSING,
                            ]
                        ),
                        created_at=created_at + timedelta(days=2),
                    )
                )
                created_refunds += 1

            # 客户聚合统计（cancelled / refunded 不计入消费额）
            if customer:
                stats = customer_stats[customer.id]
                stats["orders"] += 1
                if status not in (OrderStatus.CANCELLED, OrderStatus.REFUNDED):
                    stats["spent"] += total
                if stats["last"] is None or created_at > stats["last"]:
                    stats["last"] = created_at

            created_orders += 1

        await db.flush()  # 分批落盘，避免一次性占用过大事务

    # 回写客户聚合统计
    for cid, stats in customer_stats.items():
        if stats["orders"] == 0:
            continue
        customer = next((c for c in customers if c.id == cid), None)
        if customer is None:
            continue
        customer.total_orders += stats["orders"]
        customer.total_spent = float(customer.total_spent or 0) + round(stats["spent"], 2)
        if stats["last"] and (customer.last_order_at is None or stats["last"] > customer.last_order_at):
            customer.last_order_at = stats["last"]
        from app.services.membership import calculate_level  # noqa: PLC0415

        customer.membership_level = calculate_level(float(customer.total_spent))

    # 模拟 3 位流失客户（45-60 天未下单），让"流失预警"有真实名单可演示
    churn_candidates = [c for c in customers if c.total_orders >= 2][:3]
    for c in churn_candidates:
        c.last_order_at = today - timedelta(days=random.randint(45, 60))

    await db.flush()
    return created_orders, created_refunds


async def run(days: int = 90, force: bool = False) -> int:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    created = {"users": 0, "workspaces": 0, "products": 0, "customers": 0,
               "orders": 0, "refunds": 0}

    async with async_session_factory() as db:
        user, workspace, user_created, ws_created = await get_or_create_demo_user(db)
        created["users"] = 1 if user_created else 0
        created["workspaces"] = 1 if ws_created else 0
        print(f"[demo] 用户: {user.email} (id={user.id[:8]}...)")
        print(f"[demo] 工作空间: {workspace.name} (slug={workspace.slug})")

        created["products"] = await seed_products(db, workspace)
        created["customers"] = await seed_customers(db, workspace)
        await db.commit()
        print(f"[demo] 商品: 新增 {created['products']}（已存在则跳过）")
        print(f"[demo] 客户: 新增 {created['customers']}（已存在则跳过）")

        # 加载已存在的商品与客户
        products = (
            await db.execute(select(Product).where(Product.workspace_id == workspace.id))
        ).scalars().all()
        customers = (
            await db.execute(select(Customer).where(Customer.workspace_id == workspace.id))
        ).scalars().all()

        # 检查是否已有订单
        existing = (
            await db.execute(
                select(func.count(Order.id)).where(Order.workspace_id == workspace.id)
            )
        ).scalar_one()

        if force:
            print(f"[demo] --force: 清空工作空间 {workspace.slug} 的已有订单与退款…")
            await db.execute(
                delete(Refund).where(Refund.workspace_id == workspace.id)
            )
            await db.execute(
                delete(OrderItem)
                .where(OrderItem.order_id.in_(
                    select(Order.id).where(Order.workspace_id == workspace.id)
                ))
            )
            await db.execute(delete(Order).where(Order.workspace_id == workspace.id))
            # 重置种子商品库存，避免重复扣减
            for product in products:
                for cat in PRODUCT_CATALOG:
                    if cat["slug"] == product.slug:
                        product.stock = cat["stock"]
                        break
            # 重置客户聚合统计
            for customer in customers:
                customer.total_orders = 0
                customer.total_spent = 0.0
                customer.last_order_at = None
            await db.commit()
            existing = 0

        if existing > 0 and not force:
            print(f"[demo] 已存在 {existing} 笔订单，跳过订单生成（使用 --force 可重新生成）")
        else:
            orders_n, refunds_n = await generate_orders(db, workspace, products, customers, days)
            created["orders"] = orders_n
            created["refunds"] = refunds_n
            await db.commit()

        # 汇总统计
        total_users = (await db.execute(select(func.count(User.id)))).scalar_one()
        total_ws = (await db.execute(select(func.count(Workspace.id)))).scalar_one()
        total_prods = (
            await db.execute(select(func.count(Product.id)).where(Product.workspace_id == workspace.id))
        ).scalar_one()
        total_custs = (
            await db.execute(select(func.count(Customer.id)).where(Customer.workspace_id == workspace.id))
        ).scalar_one()
        total_orders = (
            await db.execute(select(func.count(Order.id)).where(Order.workspace_id == workspace.id))
        ).scalar_one()
        total_refunds = (
            await db.execute(select(func.count(Refund.id)).where(Refund.workspace_id == workspace.id))
        ).scalar_one()

        print()
        print("=" * 56)
        print("  Nexora 演示数据播种完成")
        print("=" * 56)
        print(f"  users      : 总计 {total_users:<4} 本次新增 {created['users']}")
        print(f"  workspaces : 总计 {total_ws:<4} 本次新增 {created['workspaces']}")
        print(f"  products   : 总计 {total_prods:<4} 本次新增 {created['products']}")
        print(f"  customers  : 总计 {total_custs:<4} 本次新增 {created['customers']}")
        print(f"  orders     : 总计 {total_orders:<4} 本次新增 {created['orders']}")
        print(f"  refunds    : 总计 {total_refunds:<4} 本次新增 {created['refunds']}")
        print("=" * 56)
        print(f"  数据库     : {engine.url}")
        return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Nexora 演示数据种子脚本")
    parser.add_argument("--days", type=int, default=90, help="生成历史订单的天数（默认 90）")
    parser.add_argument(
        "--force",
        action="store_true",
        help="清空已生成订单/退款并重新生成（不影响商品与客户）",
    )
    args = parser.parse_args()

    try:
        asyncio.run(run(days=args.days, force=args.force))
    except KeyboardInterrupt:
        print("\n  [interrupted]")
        sys.exit(130)


if __name__ == "__main__":
    main()
