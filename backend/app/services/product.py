"""Nexora - Product Service.

Handles Product, ProductVariant, and ProductCategory CRUD operations
with workspace-scoped queries, audit logging, and validation.

All write operations accept a ``user_id`` parameter for audit trail
creation.  The service is entirely static — no instantiation required.
"""

from datetime import datetime, timezone
from typing import List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.utils.audit import create_audit_log
from app.models.product import (
    Product,
    ProductCategory,
    ProductStatus,
    ProductVariant,
)
from app.models.workspace import Workspace
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
from app.utils.logging import get_logger

logger = get_logger(__name__)


class ProductService:
    """Service for product-related business logic."""

    # ── Product CRUD ──────────────────────────────────────────────────────

    @staticmethod
    async def create_product(
        db: AsyncSession,
        workspace: Workspace,
        product_data: ProductCreate,
        *,
        user_id: str,
    ) -> ProductResponse:
        """Create a new product in a workspace.

        Validates slug and SKU uniqueness, creates the product, and
        records an audit log entry.
        """
        # Check slug uniqueness within workspace
        slug_check = await db.execute(
            select(Product).where(
                Product.workspace_id == workspace.id,
                Product.slug == product_data.slug.lower(),
            )
        )
        if slug_check.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Product slug '{product_data.slug}' is already taken in this workspace.",
            )

        # Check SKU uniqueness within workspace
        if product_data.sku:
            sku_check = await db.execute(
                select(Product).where(
                    Product.workspace_id == workspace.id,
                    Product.sku == product_data.sku,
                )
            )
            if sku_check.scalar_one_or_none() is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"SKU '{product_data.sku}' already exists in this workspace.",
                )

        product = Product(
            workspace_id=workspace.id,
            name=product_data.name.strip(),
            slug=product_data.slug.lower().strip(),
            description=product_data.description,
            category=product_data.category,
            brand=product_data.brand,
            price=product_data.price,
            compare_at_price=product_data.compare_at_price,
            cost_price=product_data.cost_price,
            sku=product_data.sku,
            stock=product_data.stock if product_data.stock is not None else 0,
            low_stock_threshold=product_data.low_stock_threshold if product_data.low_stock_threshold is not None else 10,
            barcode=product_data.barcode,
            weight=product_data.weight,
            status=ProductStatus(product_data.status),
            has_variants=product_data.has_variants,
            tags=product_data.tags or [],
            images=product_data.images or [],
        )
        db.add(product)
        await db.flush()
        await db.refresh(product)

        await create_audit_log(
            db=db,
            workspace_id=workspace.id,
            user_id=user_id,
            action="product.created",
            resource_type="product",
            resource_id=product.id,
            details={"name": product.name, "sku": product.sku},
        )

        logger.info(
            "Product created: %s (sku=%s) in workspace %s",
            product.name,
            product.sku,
            workspace.slug,
        )
        return ProductResponse.model_validate(product)

    @staticmethod
    async def get_product(
        db: AsyncSession,
        workspace: Workspace,
        product_id: str,
    ) -> ProductResponse:
        """Get a product by ID within a workspace, including its variants."""
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

        return ProductResponse.model_validate(product)

    @staticmethod
    async def list_products(
        db: AsyncSession,
        workspace: Workspace,
        *,
        search: Optional[str] = None,
        category_id: Optional[str] = None,
        status_filter: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[ProductResponse], int]:
        """List products in a workspace with optional filtering and pagination.

        Args:
            db: Async database session.
            workspace: The workspace context.
            search: Search by name or SKU (partial match).
            category_id: Filter by category ID.
            status_filter: Filter by product status value.
            skip: Pagination offset.
            limit: Max results per page.

        Returns:
            Tuple of (list of ProductResponse, total count).
        """
        conditions = [Product.workspace_id == workspace.id]

        if search:
            search_term = f"%{search}%"
            conditions.append(
                or_(
                    Product.name.ilike(search_term),
                    Product.sku.ilike(search_term),
                )
            )

        if category_id:
            conditions.append(Product.category == category_id)

        if status_filter:
            conditions.append(Product.status == ProductStatus(status_filter))

        # Count query
        count_result = await db.execute(
            select(func.count(Product.id)).where(*conditions)
        )
        total = count_result.scalar_one()

        # Data query
        data_query = (
            select(Product)
            .where(*conditions)
            .order_by(Product.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await db.execute(data_query)
        products = result.scalars().all()

        return [ProductResponse.model_validate(p) for p in products], total

    @staticmethod
    async def update_product(
        db: AsyncSession,
        workspace: Workspace,
        product_id: str,
        update_data: ProductUpdate,
        *,
        user_id: str,
    ) -> ProductResponse:
        """Update an existing product. Only provided fields are updated."""
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

        update_dict = update_data.model_dump(exclude_unset=True)

        # Check slug uniqueness if slug is being changed
        if update_data.slug is not None and update_data.slug != product.slug:
            slug_check = await db.execute(
                select(Product).where(
                    Product.workspace_id == workspace.id,
                    Product.slug == update_data.slug.lower(),
                    Product.id != product_id,
                )
            )
            if slug_check.scalar_one_or_none() is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Product slug '{update_data.slug}' is already taken.",
                )

        # Check SKU uniqueness if changing
        if "sku" in update_dict and update_dict["sku"]:
            sku_check = await db.execute(
                select(Product).where(
                    Product.workspace_id == workspace.id,
                    Product.sku == update_dict["sku"],
                    Product.id != product_id,
                )
            )
            if sku_check.scalar_one_or_none() is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"SKU '{update_dict['sku']}' already exists in this workspace.",
                )

        # 记录库存变化前的旧值（用于流水）
        _old_stock = product.stock or 0

        for field, value in update_dict.items():
            if field == "status" and value is not None:
                setattr(product, field, ProductStatus(value))
            elif field == "slug" and value is not None:
                setattr(product, field, value.lower().strip())
            elif field == "name" and value is not None:
                setattr(product, field, value.strip())
            else:
                setattr(product, field, value)

        # 库存流水：stock 有变化时记录"何进何出"
        if "stock" in update_dict and update_dict["stock"] is not None:
            from app.services.inventory_log import record_movement
            await record_movement(
                db=db,
                workspace_id=workspace.id,
                product_id=product.id,
                change=int(update_dict["stock"]) - _old_stock,
                stock_after=int(update_dict["stock"]),
                movement_type="adjustment",
                reason="商品管理手动调整库存",
                created_by=user_id,
            )

        product.updated_at = datetime.now(timezone.utc)
        await db.flush()
        await db.refresh(product)

        await create_audit_log(
            db=db,
            workspace_id=workspace.id,
            user_id=user_id,
            action="product.updated",
            resource_type="product",
            resource_id=product.id,
            details={"name": product.name, "sku": product.sku},
        )

        logger.info("Product updated: %s (id=%s)", product.name, product.id)
        return ProductResponse.model_validate(product)

    @staticmethod
    async def delete_product(
        db: AsyncSession,
        workspace: Workspace,
        product_id: str,
        *,
        user_id: str,
    ) -> None:
        """Delete a product from the workspace."""
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

        await create_audit_log(
            db=db,
            workspace_id=workspace.id,
            user_id=user_id,
            action="product.deleted",
            resource_type="product",
            resource_id=product.id,
            details={"name": product.name, "sku": product.sku},
        )

        await db.delete(product)
        await db.flush()

        logger.info("Product deleted: %s (id=%s)", product.name, product.id)

    # ── ProductCategory CRUD ───────────────────────────────────────────────

    @staticmethod
    async def create_category(
        db: AsyncSession,
        workspace: Workspace,
        category_data: ProductCategoryCreate,
        *,
        user_id: str,
    ) -> ProductCategoryResponse:
        """Create a new product category."""
        # Check slug uniqueness within workspace
        slug_check = await db.execute(
            select(ProductCategory).where(
                ProductCategory.workspace_id == workspace.id,
                ProductCategory.slug == category_data.slug.lower(),
            )
        )
        if slug_check.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Category slug '{category_data.slug}' already exists in this workspace.",
            )

        # Validate parent_id if provided
        if category_data.parent_id is not None:
            parent_check = await db.execute(
                select(ProductCategory).where(
                    ProductCategory.id == category_data.parent_id,
                    ProductCategory.workspace_id == workspace.id,
                )
            )
            if parent_check.scalar_one_or_none() is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Parent category '{category_data.parent_id}' not found.",
                )

        category = ProductCategory(
            workspace_id=workspace.id,
            name=category_data.name.strip(),
            slug=category_data.slug.lower().strip(),
            parent_id=category_data.parent_id,
            sort_order=category_data.sort_order,
            description=getattr(category_data, "description", None),
        )
        db.add(category)
        await db.flush()
        await db.refresh(category)

        await create_audit_log(
            db=db,
            workspace_id=workspace.id,
            user_id=user_id,
            action="category.created",
            resource_type="product_category",
            resource_id=category.id,
            details={"name": category.name, "slug": category.slug},
        )

        logger.info("Category created: %s (slug=%s)", category.name, category.slug)
        return ProductCategoryResponse.model_validate(category)

    @staticmethod
    async def list_categories(
        db: AsyncSession,
        workspace: Workspace,
    ) -> List[ProductCategoryResponse]:
        """List all categories in a workspace, returned as a tree structure."""
        result = await db.execute(
            select(ProductCategory)
            .where(ProductCategory.workspace_id == workspace.id)
            .order_by(ProductCategory.sort_order, ProductCategory.name)
        )
        categories = result.scalars().all()
        return ProductService._build_category_tree(categories)

    @staticmethod
    async def update_category(
        db: AsyncSession,
        workspace: Workspace,
        category_id: str,
        update_data: ProductCategoryUpdate,
        *,
        user_id: str,
    ) -> ProductCategoryResponse:
        """Update a product category."""
        result = await db.execute(
            select(ProductCategory).where(
                ProductCategory.id == category_id,
                ProductCategory.workspace_id == workspace.id,
            )
        )
        category = result.scalar_one_or_none()

        if category is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Category not found.",
            )

        # Check slug uniqueness if changing
        if update_data.slug is not None and update_data.slug != category.slug:
            slug_check = await db.execute(
                select(ProductCategory).where(
                    ProductCategory.workspace_id == workspace.id,
                    ProductCategory.slug == update_data.slug.lower(),
                    ProductCategory.id != category_id,
                )
            )
            if slug_check.scalar_one_or_none() is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Category slug '{update_data.slug}' is already taken.",
                )

        update_dict = update_data.model_dump(exclude_unset=True)
        for field, value in update_dict.items():
            if field == "name" and value is not None:
                setattr(category, field, value.strip())
            elif field == "slug" and value is not None:
                setattr(category, field, value.lower().strip())
            else:
                setattr(category, field, value)

        category.updated_at = datetime.now(timezone.utc)
        await db.flush()
        await db.refresh(category)

        await create_audit_log(
            db=db,
            workspace_id=workspace.id,
            user_id=user_id,
            action="category.updated",
            resource_type="product_category",
            resource_id=category.id,
            details={"name": category.name},
        )

        logger.info("Category updated: %s", category.id)
        return ProductCategoryResponse.model_validate(category)

    @staticmethod
    async def delete_category(
        db: AsyncSession,
        workspace: Workspace,
        category_id: str,
        *,
        user_id: str,
    ) -> None:
        """Delete a product category."""
        result = await db.execute(
            select(ProductCategory).where(
                ProductCategory.id == category_id,
                ProductCategory.workspace_id == workspace.id,
            )
        )
        category = result.scalar_one_or_none()

        if category is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Category not found.",
            )

        await create_audit_log(
            db=db,
            workspace_id=workspace.id,
            user_id=user_id,
            action="category.deleted",
            resource_type="product_category",
            resource_id=category.id,
            details={"name": category.name, "slug": category.slug},
        )

        await db.delete(category)
        await db.flush()

        logger.info("Category deleted: %s (id=%s)", category.name, category.id)

    # ── ProductVariant CRUD ────────────────────────────────────────────────

    @staticmethod
    async def add_variant(
        db: AsyncSession,
        workspace: Workspace,
        product_id: str,
        variant_data: ProductVariantCreate,
        *,
        user_id: str,
    ) -> ProductVariantResponse:
        """Add a variant (e.g. size, color) to an existing product."""
        # Verify the product exists and belongs to this workspace
        prod_check = await db.execute(
            select(Product).where(
                Product.id == product_id,
                Product.workspace_id == workspace.id,
            )
        )
        product = prod_check.scalar_one_or_none()

        if product is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Product not found.",
            )

        # Check variant SKU uniqueness within product
        if variant_data.sku:
            sku_check = await db.execute(
                select(ProductVariant).where(
                    ProductVariant.product_id == product_id,
                    ProductVariant.sku == variant_data.sku,
                )
            )
            if sku_check.scalar_one_or_none() is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Variant SKU '{variant_data.sku}' already exists for this product.",
                )

        variant = ProductVariant(
            product_id=product_id,
            name=variant_data.name.strip(),
            sku=variant_data.sku,
            price=variant_data.price,
            stock=variant_data.stock,
            attributes=variant_data.attributes or {},
        )
        db.add(variant)

        # Mark product as having variants
        if not product.has_variants:
            product.has_variants = True

        await db.flush()
        await db.refresh(variant)

        await create_audit_log(
            db=db,
            workspace_id=workspace.id,
            user_id=user_id,
            action="product.variant_added",
            resource_type="product_variant",
            resource_id=variant.id,
            details={
                "product_id": product_id,
                "variant_name": variant.name,
                "sku": variant.sku,
            },
        )

        logger.info(
            "Variant added to product %s: %s (sku=%s)",
            product_id,
            variant.name,
            variant.sku,
        )
        return ProductVariantResponse.model_validate(variant)

    @staticmethod
    async def list_variants(
        db: AsyncSession,
        workspace: Workspace,
        product_id: str,
    ) -> List[ProductVariantResponse]:
        """List all variants for a product."""
        # Verify product belongs to workspace
        prod_check = await db.execute(
            select(Product).where(
                Product.id == product_id,
                Product.workspace_id == workspace.id,
            )
        )
        if prod_check.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Product not found.",
            )

        result = await db.execute(
            select(ProductVariant)
            .where(ProductVariant.product_id == product_id)
            .order_by(ProductVariant.created_at)
        )
        variants = result.scalars().all()

        return [ProductVariantResponse.model_validate(v) for v in variants]

    @staticmethod
    async def update_variant(
        db: AsyncSession,
        workspace: Workspace,
        product_id: str,
        variant_id: str,
        update_data: ProductVariantUpdate,
        *,
        user_id: str,
    ) -> ProductVariantResponse:
        """Update a product variant."""
        result = await db.execute(
            select(ProductVariant)
            .join(Product, Product.id == ProductVariant.product_id)
            .where(
                ProductVariant.id == variant_id,
                ProductVariant.product_id == product_id,
                Product.workspace_id == workspace.id,
            )
        )
        variant = result.scalar_one_or_none()

        if variant is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Variant not found.",
            )

        update_dict = update_data.model_dump(exclude_unset=True)
        for field, value in update_dict.items():
            if field == "name" and value is not None:
                setattr(variant, field, value.strip())
            else:
                setattr(variant, field, value)

        variant.updated_at = datetime.now(timezone.utc)
        await db.flush()
        await db.refresh(variant)

        await create_audit_log(
            db=db,
            workspace_id=workspace.id,
            user_id=user_id,
            action="product.variant_updated",
            resource_type="product_variant",
            resource_id=variant.id,
            details={"variant_name": variant.name},
        )

        logger.info("Variant updated: %s", variant.id)
        return ProductVariantResponse.model_validate(variant)

    @staticmethod
    async def delete_variant(
        db: AsyncSession,
        workspace: Workspace,
        product_id: str,
        variant_id: str,
        *,
        user_id: str,
    ) -> None:
        """Delete a product variant."""
        result = await db.execute(
            select(ProductVariant)
            .join(Product, Product.id == ProductVariant.product_id)
            .where(
                ProductVariant.id == variant_id,
                ProductVariant.product_id == product_id,
                Product.workspace_id == workspace.id,
            )
        )
        variant = result.scalar_one_or_none()

        if variant is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Variant not found.",
            )

        await create_audit_log(
            db=db,
            workspace_id=workspace.id,
            user_id=user_id,
            action="product.variant_deleted",
            resource_type="product_variant",
            resource_id=variant.id,
            details={
                "product_id": variant.product_id,
                "variant_name": variant.name,
            },
        )

        await db.delete(variant)
        await db.flush()

        logger.info("Variant deleted: %s (id=%s)", variant.name, variant.id)

    # ── Helper: Category Tree ──────────────────────────────────────────────

    @staticmethod
    def _build_category_tree(
        categories: List[ProductCategory],
        parent_id: Optional[str] = None,
    ) -> List[ProductCategoryResponse]:
        """Recursively build a category tree from a flat list."""
        result_list: List[ProductCategoryResponse] = []
        for cat in categories:
            if cat.parent_id == parent_id:
                node = ProductCategoryResponse.model_validate(cat)
                result_list.append(node)
        return result_list
