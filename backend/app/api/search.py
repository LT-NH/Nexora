"""Nexora - Unified Search API.

Search across products, orders, and customers with fuzzy matching.
"""

from fastapi import APIRouter, Depends, Query
from app.api.deps import get_current_workspace
from app.database import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.models import Product, Order, Customer

router = APIRouter(prefix="/workspaces/{workspace_slug}/search", tags=["search"])


@router.get("")
async def unified_search(
    workspace_slug: str,
    q: str = Query("", min_length=0),
    type: str = Query("all", description="Filter by type: all, products, orders, customers"),
    workspace=Depends(get_current_workspace),
    session: AsyncSession = Depends(get_db),
):
    """Search across products, orders, customers. Supports fuzzy matching."""
    results: dict = {"products": [], "orders": [], "customers": []}
    if not q or len(q) < 1:
        return results
    search_term = f"%{q}%"

    if type in ("all", "products"):
        r = await session.execute(
            select(Product)
            .where(
                Product.workspace_id == workspace.id,
                or_(
                    Product.name.ilike(search_term),
                    Product.sku.ilike(search_term),
                    Product.barcode.ilike(search_term),
                ),
            )
            .limit(8)
        )
        for p in r.scalars().all():
            results["products"].append({
                "id": p.id,
                "name": p.name,
                "sku": p.sku,
                "price": float(p.price),
                "stock": p.stock,
            })

    if type in ("all", "orders"):
        r = await session.execute(
            select(Order)
            .where(
                Order.workspace_id == workspace.id,
                or_(
                    Order.id.ilike(search_term),
                    Order.customer_name.ilike(search_term),
                    Order.order_number.ilike(search_term),
                ),
            )
            .limit(8)
        )
        for o in r.scalars().all():
            results["orders"].append({
                "id": o.id,
                "order_number": o.order_number,
                "customer_name": o.customer_name,
                "total": float(o.total or 0),
                "status": o.status.value,
            })

    if type in ("all", "customers"):
        r = await session.execute(
            select(Customer)
            .where(
                Customer.workspace_id == workspace.id,
                or_(
                    Customer.name.ilike(search_term),
                    Customer.email.ilike(search_term),
                    Customer.phone.ilike(search_term),
                ),
            )
            .limit(8)
        )
        for c in r.scalars().all():
            results["customers"].append({
                "id": c.id,
                "name": c.name,
                "email": c.email,
                "phone": c.phone,
            })

    return results
