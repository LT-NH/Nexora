"""CSV batch import endpoints."""
import csv
import io
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import _require_member
from app.database import get_db
from app.models.product import Product
from app.models.user import User
from app.models.workspace import WorkspaceRole

router = APIRouter(prefix="/workspaces/{workspace_slug}/import", tags=["import"])


@router.post("/products")
async def import_products_csv(
    workspace_slug: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(),
):
    """Import products from a CSV file.

    Requires ADMIN role. The CSV must have headers matching:
    \u5546\u54c1\u540d\u79f0/name/Name, \u4ef7\u683c/price/Price,
    SKU/sku, \u5e93\u5b58/stock/Stock, \u5206\u7c7b/category, etc.
    """
    workspace, _ = await _require_member(
        workspace_slug, current_user, db, WorkspaceRole.ADMIN
    )

    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="\u4ec5\u652f\u6301 CSV \u683c\u5f0f")

    content = await file.read()
    reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig")))
    imported = 0
    skipped = 0
    errors = []

    for row_num, row in enumerate(reader, 2):
        name = row.get("\u5546\u54c1\u540d\u79f0") or row.get("name") or row.get("Name")
        if not name:
            skipped += 1
            continue
        try:
            price = float(
                row.get("\u4ef7\u683c") or row.get("price") or row.get("Price") or 0
            )
            stock = int(
                row.get("\u5e93\u5b58") or row.get("stock") or row.get("Stock") or 0
            )
            sku = row.get("SKU") or row.get("sku") or None
            category = row.get("\u5206\u7c7b") or row.get("category") or None

            product = Product(
                id=str(uuid.uuid4()),
                workspace_id=workspace.id,
                name=name.strip(),
                slug=name.strip().lower().replace(" ", "-")[:255],
                price=price,
                stock=stock,
                sku=sku,
                category=category,
                low_stock_threshold=10,
            )
            db.add(product)
            imported += 1
        except Exception as e:
            errors.append(f"\u7b2c{row_num}\u884c: {str(e)}")

    await db.flush()
    return {
        "imported": imported,
        "skipped": skipped,
        "errors": errors,
        "total": imported + skipped,
    }
