"""Nexora - Products API Routes (thin).

Every route follows the same pattern:
  1. Extract params from request
  2. Get principal / workspace from dependency helpers
  3. Call ProductService static method
  4. Return response
"""

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import _require_member
from app.database import get_db
from app.middleware.auth import get_principal, AuthContext
from app.models.workspace import WorkspaceRole
from app.schemas.product import (
    ProductCategoryCreate,
    ProductCategoryResponse,
    ProductCategoryUpdate,
    ProductCreate,
    ProductResponse,
    ProductUpdate,
    ProductVariantCreate,
    ProductVariantResponse,
    ProductVariantUpdate,
)
from app.services.product import ProductService
from app.utils.pagination import PaginatedResponse, PaginationParams

router = APIRouter(prefix="/workspaces/{slug}/products")


# ===========================================================================
# Product CRUD
# ===========================================================================


@router.get(
    "",
    response_model=PaginatedResponse[ProductResponse],
    summary="List products (paginated)",
)
async def list_products(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
    pagination: Annotated[PaginationParams, Depends()],
    search: Optional[str] = Query(None, description="Search by name or SKU"),
    category_id: Optional[str] = Query(None, description="Filter by category ID"),
    status: Optional[str] = Query(None, description="Filter by status (draft, active, archived, out_of_stock)"),
) -> PaginatedResponse[ProductResponse]:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    items, total = await ProductService.list_products(
        db, workspace,
        search=search,
        category_id=category_id,
        status_filter=status,
        skip=pagination.offset,
        limit=pagination.limit,
    )
    return PaginatedResponse.create(items=items, total=total, params=pagination)


@router.post(
    "",
    response_model=ProductResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a product",
)
async def create_product(
    slug: str,
    product_data: ProductCreate,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProductResponse:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)
    return await ProductService.create_product(
        db, workspace, product_data, user_id=principal.user_id,
    )


# ===========================================================================
# Product Categories
# ===========================================================================


@router.post(
    "/categories",
    response_model=ProductCategoryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a product category",
)
async def create_category(
    slug: str,
    category_data: ProductCategoryCreate,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProductCategoryResponse:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)
    return await ProductService.create_category(
        db, workspace, category_data, user_id=principal.user_id,
    )


@router.get(
    "/categories",
    response_model=list[ProductCategoryResponse],
    summary="List product categories",
)
async def list_categories(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ProductCategoryResponse]:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    return await ProductService.list_categories(db, workspace)


@router.put(
    "/categories/{category_id}",
    response_model=ProductCategoryResponse,
    summary="Update a category",
)
async def update_category(
    slug: str,
    category_id: str,
    category_data: ProductCategoryUpdate,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProductCategoryResponse:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)
    return await ProductService.update_category(
        db, workspace, category_id, category_data, user_id=principal.user_id,
    )


@router.delete(
    "/categories/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a category",
)
async def delete_category(
    slug: str,
    category_id: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)
    await ProductService.delete_category(
        db, workspace, category_id, user_id=principal.user_id,
    )


# ===========================================================================
# Recommendations
# ===========================================================================


@router.get(
    "/recommendations",
    summary="Get product recommendations based on order history",
)
async def get_recommendations(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict]:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    from app.services.recommendation import get_recommendations as _get_recs
    return await _get_recs(db, workspace.id)


@router.get(
    "/{product_id}",
    response_model=ProductResponse,
    summary="Get product detail",
)
async def get_product(
    slug: str,
    product_id: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProductResponse:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    return await ProductService.get_product(db, workspace, product_id)


@router.post(
    "/batch-edit",
    summary="批量编辑商品（改价 / 库存 / 分类），含 Shopify 反向同步",
)
async def batch_edit_products(
    slug: str,
    body: dict,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)
    ids = body.get("ids") or []
    if not ids:
        raise HTTPException(status_code=400, detail="请选择至少一个商品")
    updates: dict = {}
    if "price" in body:
        updates["price"] = float(body["price"])
    if "stock" in body:
        updates["stock"] = int(body["stock"])
    if "category" in body:
        updates["category"] = str(body["category"])
    if "status" in body:
        updates["status"] = str(body["status"])
    if not updates:
        raise HTTPException(status_code=400, detail="请提供要修改的字段（价格/库存/分类/状态）")

    # Shopify 反向同步配置
    from app.models.store import Store
    from app.services.store import StoreService
    from app.services.platforms import PLATFORM_REGISTRY

    shopify_cfg = None
    integ = None
    try:
        store_row = (
            await db.execute(
                select(Store).where(
                    Store.workspace_id == workspace.id,
                    Store.platform == "shopify",
                ).order_by(Store.created_at.desc()).limit(1)
            )
        ).scalar_one_or_none()
        if store_row is not None:
            shopify_cfg = await StoreService.get_plain_credentials(store_row)
            integ_cls = PLATFORM_REGISTRY.get("shopify")
            if integ_cls is not None:
                integ = integ_cls()
    except Exception:
        pass

    from app.models.product import Product
    updated = 0
    sync_failures: list[str] = []
    for pid in ids:
        product = await db.get(Product, pid)
        if product is None or product.workspace_id != workspace.id:
            continue
        _old_stock = product.stock or 0
        for k, v in updates.items():
            setattr(product, k, v)
        if "stock" in updates:
            from app.services.inventory_log import record_movement
            await record_movement(
                db=db, workspace_id=workspace.id, product_id=product.id,
                change=int(updates["stock"]) - _old_stock,
                stock_after=int(updates["stock"]),
                movement_type="adjustment",
                reason="批量编辑调整库存",
                created_by=principal.user_id,
            )
        await db.flush()
        # Shopify 反向同步（仅对 Shopify 来源商品）
        if integ and shopify_cfg and product.sku and product.sku.startswith("shopify-"):
            ok, _errs = await integ.sync_product_to_shopify(
                shopify_cfg, product.sku[len("shopify-"):], updates
            )
            if not ok:
                sync_failures.append(product.name)
        updated += 1
    await db.commit()

    return {
        "updated": updated,
        "sync_failures": sync_failures,
        "message": f"已批量更新 {updated} 个商品" + (f"，{len(sync_failures)} 个 Shopify 同步失败" if sync_failures else "（含 Shopify 真实同步）"),
    }


@router.get(
    "/{product_id}/movements",
    summary="库存操作流水（进/出/调整轨迹）",
)
async def get_inventory_movements(
    slug: str,
    product_id: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 30,
) -> dict:
    from app.models.inventory_movement import InventoryMovement
    from app.models.product import Product

    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    product = await db.get(Product, product_id)
    if product is None or product.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="商品不存在")
    rows = (
        await db.execute(
            select(InventoryMovement)
            .where(
                InventoryMovement.workspace_id == workspace.id,
                InventoryMovement.product_id == product_id,
            )
            .order_by(InventoryMovement.created_at.desc())
            .limit(min(limit, 100))
        )
    ).scalars().all()
    return {
        "items": [
            {
                "id": r.id,
                "change": r.change,
                "stock_after": r.stock_after,
                "movement_type": r.movement_type,
                "reason": r.reason,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
        "total": len(rows),
    }



@router.put(
    "/{product_id}",
    response_model=ProductResponse,
    summary="Update product",
)
async def update_product(
    slug: str,
    product_id: str,
    update_data: ProductUpdate,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProductResponse:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)
    resp = await ProductService.update_product(
        db, workspace, product_id, update_data, user_id=principal.user_id,
    )

    # 双向同步：编辑字段写回 Shopify（仅对 Shopify 来源商品 + 已连接店铺）
    try:
        from app.models.product import Product
        from app.models.store import Store
        from app.services.store import StoreService
        from app.services.platforms import PLATFORM_REGISTRY

        product = await db.get(Product, product_id)
        sync_keys = [
            "name", "description", "category", "brand", "tags", "status",
            "price", "compare_at_price", "sku", "weight", "barcode", "stock",
        ]
        if product is not None and product.sku and product.sku.startswith("shopify-")                 and any(k in update_data.model_dump(exclude_unset=True) for k in sync_keys):
            store_row = (
                await db.execute(
                    select(Store).where(
                        Store.workspace_id == workspace.id,
                        Store.platform == "shopify",
                    ).order_by(Store.created_at.desc()).limit(1)
                )
            ).scalar_one_or_none()
            if store_row is not None:
                cfg = await StoreService.get_plain_credentials(store_row)
                integ_cls = PLATFORM_REGISTRY.get("shopify")
                if integ_cls is not None:
                    shopify_pid = product.sku[len("shopify-"):]
                    ok, errors = await integ_cls().sync_product_to_shopify(
                        cfg, shopify_pid, update_data.model_dump(exclude_unset=True)
                    )
                    if not ok:
                        resp.shopify_sync_warning = "已保存本地，但 Shopify 同步失败：" + "; ".join(errors)
    except Exception as exc:
        resp.shopify_sync_warning = f"Shopify 同步异常: {str(exc)[:120]}"

    return resp



@router.delete(
    "/{product_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete product",
)
async def delete_product(
    slug: str,
    product_id: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    workspace, membership = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)
    from app.services.permission import check_permission
    can_delete = await check_permission(db, workspace.id, principal.user_id, "delete_products", member=membership)
    if not can_delete:
        raise HTTPException(403, "无权限删除商品")
    await ProductService.delete_product(
        db, workspace, product_id, user_id=principal.user_id,
    )


# ===========================================================================
# Inventory Management (stock query & adjustment)
# ===========================================================================


@router.get(
    "/{product_id}/inventory",
    summary="Get product inventory status",
)
async def get_product_inventory(
    slug: str,
    product_id: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    product = await ProductService.get_product(db, workspace, product_id)
    return {
        "stock": product.stock,
        "low_stock_threshold": product.low_stock_threshold,
        "is_low": product.stock <= product.low_stock_threshold,
    }


@router.patch(
    "/{product_id}/stock",
    summary="Adjust product stock",
)
async def adjust_stock(
    slug: str,
    product_id: str,
    body: dict,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Adjust stock quantity. ``quantity`` positive = restock, negative = deduct."""
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)
    from app.models.product import Product

    result = await db.execute(
        select(Product).where(
            Product.id == product_id,
            Product.workspace_id == workspace.id,
        )
    )
    product = result.scalar_one_or_none()
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found.",
        )
    product.stock = max(0, product.stock + body.get("quantity", 0))
    await db.flush()
    return {
        "stock": product.stock,
        "low_stock_threshold": product.low_stock_threshold,
        "is_low": product.stock <= product.low_stock_threshold,
    }


# ===========================================================================
# AI Product Description (delegates to AIService directly — no ProductService
# involvement because it is an AI call, not CRUD)
# ===========================================================================


@router.post(
    "/ai/generate-description",
    summary="AI generate product description",
)
async def ai_generate_description(
    slug: str,
    body: dict,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    from app.services.ai import AIService
    tone_map = {
        "professional": "professional", "casual": "casual",
        "lively": "casual", "premium": "luxury", "luxury": "luxury",
    }
    tone = tone_map.get(body.get("style", "professional"), "professional")
    selling_points = body.get("selling_points", "")
    features = [s.strip() for s in selling_points.split("\n") if s.strip()] if selling_points else []
    result = await AIService.generate_product_description(
        name=body.get("product_name", ""), category=body.get("category", ""),
        features=features, target_platform=body.get("platform", "general"), tone=tone,
    )
    return {
        "title": result.get("title", ""),
        "description": result.get("description", ""),
        "highlights": result.get("bullet_points", []),
        "tags": result.get("bullet_points", [])[:5],
    }


# ===========================================================================
# Product Variants
# ===========================================================================


@router.post(
    "/{product_id}/variants",
    response_model=ProductVariantResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a variant to a product",
)
async def add_variant(
    slug: str,
    product_id: str,
    variant_data: ProductVariantCreate,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProductVariantResponse:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)
    return await ProductService.add_variant(
        db, workspace, product_id, variant_data, user_id=principal.user_id,
    )


@router.get(
    "/{product_id}/variants",
    response_model=list[ProductVariantResponse],
    summary="List variants for a product",
)
async def list_variants(
    slug: str,
    product_id: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ProductVariantResponse]:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)
    return await ProductService.list_variants(db, workspace, product_id)


@router.put(
    "/{product_id}/variants/{variant_id}",
    response_model=ProductVariantResponse,
    summary="Update a variant",
)
async def update_variant(
    slug: str,
    product_id: str,
    variant_id: str,
    variant_data: ProductVariantUpdate,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProductVariantResponse:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)
    return await ProductService.update_variant(
        db, workspace, product_id, variant_id, variant_data, user_id=principal.user_id,
    )


@router.delete(
    "/{product_id}/variants/{variant_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a variant",
)
async def delete_variant(
    slug: str,
    product_id: str,
    variant_id: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)
    await ProductService.delete_variant(
        db, workspace, product_id, variant_id, user_id=principal.user_id,
    )
