"""Nexora - Products API Routes (thin).

Every route follows the same pattern:
  1. Extract params from request
  2. Get principal / workspace from dependency helpers
  3. Call ProductService static method
  4. Return response
"""

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
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
    return await ProductService.update_product(
        db, workspace, product_id, update_data, user_id=principal.user_id,
    )


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
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)
    await ProductService.delete_product(
        db, workspace, product_id, user_id=principal.user_id,
    )


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
