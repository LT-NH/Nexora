"""CSV export endpoints."""
import csv, io
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from app.api.deps import get_current_workspace
from app.db.session import get_session
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Order, Customer, Product
from sqlalchemy import select

router = APIRouter(prefix="/workspaces/{workspace_slug}/export", tags=["export"])

@router.get("/orders")
async def export_orders(
    workspace_slug: str,
    workspace=Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Order).where(Order.workspace_id == workspace.id)
    )
    orders = result.scalars().all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID","Status","Total","Created At"])
    for o in orders:
        writer.writerow([o.id, o.status.value if hasattr(o.status, 'value') else str(o.status), o.total, o.created_at.isoformat()])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=orders_{workspace_slug}.csv"}
    )

@router.get("/customers")
async def export_customers(
    workspace_slug: str,
    workspace=Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Customer).where(Customer.workspace_id == workspace.id)
    )
    customers = result.scalars().all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID","Email","Name","Phone","Created At"])
    for c in customers:
        writer.writerow([c.id, getattr(c,'email',''), getattr(c,'name',''), getattr(c,'phone',''), c.created_at.isoformat()])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=customers_{workspace_slug}.csv"}
    )

@router.get("/products")
async def export_products(
    workspace_slug: str,
    workspace=Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Product).where(Product.workspace_id == workspace.id)
    )
    products = result.scalars().all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID","Name","SKU","Price","Status"])
    for p in products:
        writer.writerow([p.id, p.name, p.sku, p.price, getattr(p,'status','active')])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=products_{workspace_slug}.csv"}
    )
