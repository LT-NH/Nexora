"""Excel export endpoints using openpyxl."""
import io
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from app.api.deps import get_current_workspace
from app.db.session import get_session
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Order, Product
from sqlalchemy import select

router = APIRouter(prefix="/workspaces/{workspace_slug}/export", tags=["export"])

HEADER_FONT = Font(bold=True, color="FFFFFF")
HEADER_FILL = PatternFill(start_color="2560EB", end_color="2560EB", fill_type="solid")
HEADER_ALIGN = Alignment(horizontal="center")


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

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "\u5546\u54c1\u5217\u8868"
    headers = [
        "\u5546\u54c1\u540d\u79f0", "SKU", "\u5206\u7c7b",
        "\u4ef7\u683c", "\u5e93\u5b58", "\u4f4e\u5e93\u5b58\u9884\u8b66",
        "\u6761\u7801", "\u72b6\u6001",
    ]
    for col, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=h)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = HEADER_ALIGN

    for row, p in enumerate(products, 2):
        ws.cell(row=row, column=1, value=p.name)
        ws.cell(row=row, column=2, value=p.sku or "")
        ws.cell(row=row, column=3, value=getattr(p, "category", "") or "")
        ws.cell(row=row, column=4, value=float(p.price))
        ws.cell(row=row, column=5, value=getattr(p, "stock", 0))
        ws.cell(row=row, column=6, value=getattr(p, "low_stock_threshold", 10))
        ws.cell(row=row, column=7, value=getattr(p, "barcode", "") or "")
        ws.cell(row=row, column=8, value=p.status.value if hasattr(p.status, "value") else str(p.status))

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename=products_{workspace_slug}.xlsx",
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


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

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "\u8ba2\u5355\u5217\u8868"
    headers = [
        "\u8ba2\u5355\u53f7", "\u5ba2\u6237\u59d3\u540d", "\u91d1\u989d",
        "\u72b6\u6001", "\u7269\u6d41\u5355\u53f7", "\u627f\u8fd0\u5546",
        "\u521b\u5efa\u65f6\u95f4",
    ]
    for col, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=h)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = HEADER_ALIGN

    for row, o in enumerate(orders, 2):
        ws.cell(row=row, column=1, value=getattr(o, "order_number", o.id[:8]))
        ws.cell(row=row, column=2, value=getattr(o, "customer_name", "") or "")
        ws.cell(row=row, column=3, value=float(o.total))
        ws.cell(row=row, column=4, value=o.status.value if hasattr(o.status, "value") else str(o.status))
        ws.cell(row=row, column=5, value=getattr(o, "tracking_number", "") or "")
        ws.cell(row=row, column=6, value=getattr(o, "carrier", "") or "")
        ws.cell(row=row, column=7, value=str(o.created_at)[:10])

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename=orders_{workspace_slug}.xlsx",
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )
