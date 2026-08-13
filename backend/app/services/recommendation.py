"""Nexora - Product Recommendation Engine.

Implements collaborative filtering via a product co-occurrence matrix
derived from order history.  Suitable for small datasets (< 200 orders).
"""

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order
from app.models.product import Product


async def get_recommendations(
    db: AsyncSession, workspace_id: str, limit: int = 6
) -> list[dict]:
    """Return product recommendations based on co-occurrence in orders.

    Algorithm:
      1. Load all orders (with items) for the workspace.
      2. Build a product co-occurrence map: for every product ever bought
         together with another product in the same order, record the pair.
      3. Use the top-selling products as "seeds" and score candidate
         products by how often they co-occur with those seeds.
      4. Fall back to best-selling products when there are fewer than 5
         orders.
    """

    # 1. Load orders with their line items
    orders_result = await db.execute(
        select(Order).where(Order.workspace_id == workspace_id)
    )
    orders = orders_result.scalars().all()

    if len(orders) < 5:
        # Not enough data — return best-selling products as fallback
        products_result = await db.execute(
            select(Product)
            .where(Product.workspace_id == workspace_id, Product.status == "active")
            .limit(limit)
        )
        return [
            {
                "id": p.id,
                "name": p.name,
                "price": float(p.price),
                "reason": "热销推荐",
            }
            for p in products_result.scalars().all()
        ]

    # 2. Build product co-occurrence pairs from orders
    order_products: dict[str, set[str]] = defaultdict(set)
    for order in orders:
        items = order.items if hasattr(order, "items") else []
        product_ids = {item.product_id for item in items if item.product_id}
        for pid in product_ids:
            order_products[pid].update(product_ids - {pid})

    # 3. Find top-selling products as seeds
    product_sales: dict[str, int] = defaultdict(int)
    for order in orders:
        for item in order.items if hasattr(order, "items") else []:
            if item.product_id:
                product_sales[item.product_id] += item.quantity if hasattr(item, "quantity") else 1

    top_seeds = sorted(product_sales.items(), key=lambda x: x[1], reverse=True)[:3]

    # 4. Score candidate products by co-occurrence with seeds
    rec_scores: dict[str, float] = defaultdict(float)
    for seed_id, _seed_sales in top_seeds:
        related = order_products.get(seed_id, set())
        for rel_id in related:
            rec_scores[rel_id] += 1

    # 5. Load recommended products from database
    sorted_recs = sorted(rec_scores.items(), key=lambda x: x[1], reverse=True)[:limit]
    rec_ids = [r[0] for r in sorted_recs]

    if rec_ids:
        products_result = await db.execute(
            select(Product).where(Product.id.in_(rec_ids))
        )
        products = {p.id: p for p in products_result.scalars().all()}

        return [
            {
                "id": pid,
                "name": products[pid].name,
                "price": float(products[pid].price),
                "score": score,
                "reason": "买过相似商品",
            }
            for pid, score in sorted_recs
            if pid in products
        ]

    return []
