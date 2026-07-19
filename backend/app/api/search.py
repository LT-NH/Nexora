from fastapi import APIRouter, Depends, Query
from app.api.deps import get_current_workspace
from app.db.session import get_session
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.models import Product, Order, Customer

router = APIRouter(prefix="/workspaces/{workspace_slug}/search", tags=["search"])

@router.get("")
async def global_search(
    workspace_slug: str,
    q: str = Query(..., min_length=1),
    workspace=Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    results = {"products": [], "orders": [], "customers": []}
    # Search products by name or SKU
    r = await session.execute(
        select(Product).where(
            Product.workspace_id == workspace.id,
            or_(Product.name.ilike(f"%{q}%"), Product.sku.ilike(f"%{q}%"))
        ).limit(10)
    )
    for p in r.scalars().all():
        results["products"].append({"id": p.id, "name": p.name, "sku": p.sku})

    # Search customers by name/email
    r = await session.execute(
        select(Customer).where(
            Customer.workspace_id == workspace.id,
            or_(Customer.name.ilike(f"%{q}%"), Customer.email.ilike(f"%{q}%"))
        ).limit(10)
    )
    for c in r.scalars().all():
        results["customers"].append({"id": c.id, "name": getattr(c,'name',''), "email": getattr(c,'email','')})

    # Search orders by order_number
    r = await session.execute(
        select(Order).where(
            Order.workspace_id == workspace.id,
            Order.order_number.ilike(f"%{q}%")
        ).limit(10)
    )
    for o in r.scalars().all():
        results["orders"].append({"id": o.id, "status": o.status.value if hasattr(o.status, 'value') else str(o.status), "total": float(o.total or 0)})

    return results
