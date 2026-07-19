"""Nexora - Stores API Routes.

Endpoints for e-commerce store integration management.
"""

import json
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import _require_member, create_audit_log
from app.database import get_db
from app.middleware.auth import get_principal, AuthContext
from app.models.store import Store, StorePlatform, StoreStatus
from app.models.user import User
from app.models.workspace import WorkspaceRole
from app.schemas.store import (
    StoreCreate,
    StoreResponse,
    StoreUpdate,
)
from app.services.store import StoreService
from app.utils.logging import get_logger
from app.utils.pagination import PaginatedResponse, PaginationParams

router = APIRouter(prefix="/workspaces/{slug}/stores")
logger = get_logger(__name__)


# ===========================================================================
# Store CRUD
# ===========================================================================


@router.get(
    "",
    response_model=PaginatedResponse[StoreResponse],
    summary="List stores",
)
async def list_stores(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
    pagination: Annotated[PaginationParams, Depends()],
) -> PaginatedResponse[StoreResponse]:
    """Return all stores for the workspace."""
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)

    count_result = await db.execute(
        select(func.count(Store.id)).where(Store.workspace_id == workspace.id)
    )
    total = count_result.scalar_one()

    result = await db.execute(
        select(Store)
        .where(Store.workspace_id == workspace.id)
        .order_by(Store.created_at.desc())
        .offset(pagination.offset)
        .limit(pagination.limit)
    )
    stores = result.scalars().all()

    items = [_build_store_response(s) for s in stores]
    return PaginatedResponse.create(items=items, total=total, params=pagination)


@router.post(
    "",
    response_model=StoreResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a store",
)
async def create_store(
    slug: str,
    store_data: StoreCreate,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StoreResponse:
    """Add a new e-commerce store integration to the workspace."""
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)

    store = Store(
        id=str(uuid.uuid4()),
        workspace_id=workspace.id,
        name=store_data.name,
        platform=store_data.platform,
        store_url=store_data.store_url,
        api_key=store_data.api_key,
        api_secret=store_data.api_secret,
        access_token=store_data.access_token,
        status=StoreStatus.DISCONNECTED,
    )
    db.add(store)
    await db.flush()

    await create_audit_log(
        db=db,
        workspace_id=workspace.id,
        user_id=principal.user_id,
        action="store.created",
        resource_type="store",
        resource_id=store.id,
        details={"name": store.name, "platform": store.platform},
    )

    logger.info("Store created: %s (platform=%s)", store.name, store.platform)
    return _build_store_response(store)


@router.get(
    "/{store_id}",
    response_model=StoreResponse,
    summary="Get store detail",
)
async def get_store(
    slug: str,
    store_id: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StoreResponse:
    """Return store details by ID."""
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.VIEWER)

    result = await db.execute(
        select(Store).where(
            Store.id == store_id,
            Store.workspace_id == workspace.id,
        )
    )
    store = result.scalar_one_or_none()
    if store is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Store not found.",
        )

    return _build_store_response(store)


@router.put(
    "/{store_id}",
    response_model=StoreResponse,
    summary="Update store",
)
async def update_store(
    slug: str,
    store_id: str,
    update_data: StoreUpdate,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StoreResponse:
    """Update store configuration. Only provided fields are updated."""
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)

    result = await db.execute(
        select(Store).where(
            Store.id == store_id,
            Store.workspace_id == workspace.id,
        )
    )
    store = result.scalar_one_or_none()
    if store is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Store not found.",
        )

    update_dict = update_data.model_dump(exclude_unset=True)
    # Map status field to StoreStatus enum if provided
    if "status" in update_dict:
        status_val = update_dict.pop("status")
        if status_val == "connected":
            update_dict["status"] = StoreStatus.CONNECTED
        elif status_val == "error":
            update_dict["status"] = StoreStatus.ERROR
        else:
            update_dict["status"] = StoreStatus.DISCONNECTED

    for field, value in update_dict.items():
        setattr(store, field, value)

    await db.flush()
    await db.refresh(store)
    await create_audit_log(
        db=db,
        workspace_id=workspace.id,
        user_id=principal.user_id,
        action="store.updated",
        resource_type="store",
        resource_id=store.id,
        details={"name": store.name, "platform": store.platform},
    )

    logger.info("Store updated: %s (id=%s)", store.name, store.id)
    return _build_store_response(store)


@router.delete(
    "/{store_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete store",
)
async def delete_store(
    slug: str,
    store_id: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Delete a store integration from the workspace."""
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)

    result = await db.execute(
        select(Store).where(
            Store.id == store_id,
            Store.workspace_id == workspace.id,
        )
    )
    store = result.scalar_one_or_none()
    if store is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Store not found.",
        )

    await create_audit_log(
        db=db,
        workspace_id=workspace.id,
        user_id=principal.user_id,
        action="store.deleted",
        resource_type="store",
        resource_id=store.id,
        details={"name": store.name, "platform": store.platform},
    )

    await db.delete(store)
    await db.flush()
    logger.info("Store deleted: %s (id=%s)", store.name, store.id)


# ===========================================================================
# Store Sync
# ===========================================================================


@router.post(
    "/{store_id}/sync",
    summary="Sync store data from platform",
)
async def sync_store(
    slug: str,
    store_id: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Trigger a full data sync from the connected e-commerce platform.

    Pulls products, orders, and customers from the platform API into the
    workspace. Supports Shopify, Douyin, and other platforms via the
    platform integration registry.
    """
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)

    result = await db.execute(
        select(Store).where(
            Store.id == store_id,
            Store.workspace_id == workspace.id,
        )
    )
    store = result.scalar_one_or_none()
    if store is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Store not found.",
        )

    # Build config with decrypted credentials
    config = await StoreService.get_plain_credentials(store)

    # Get the integration class from the registry
    from app.services.platforms import PLATFORM_REGISTRY
    integration_cls = PLATFORM_REGISTRY.get(store.platform.value if hasattr(store.platform, 'value') else str(store.platform))
    if integration_cls is None:
        integration_cls = PLATFORM_REGISTRY["other"]

    integration = integration_cls()

    # Validate credentials first
    creds_ok = await integration.validate_credentials(config)
    if not creds_ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"无法连接到 {store.platform} 平台，请检查 API 凭证是否正确。",
        )

    # Run full sync
    try:
        sync_result = await integration.full_sync(config, workspace.id)

        # Update store sync timestamp
        store.last_sync_at = sync_result.finished_at or datetime.now(timezone.utc)
        if store.status == StoreStatus.DISCONNECTED:
            store.status = StoreStatus.CONNECTED
        await db.flush()

        await create_audit_log(
            db=db,
            workspace_id=workspace.id,
            user_id=principal.user_id,
            action="store.synced",
            resource_type="store",
            resource_id=store.id,
            details={
                "name": store.name,
                "platform": store.platform.value if hasattr(store.platform, 'value') else str(store.platform),
                "created": {
                    "products": sync_result.products.created,
                    "orders": sync_result.orders.created,
                    "customers": sync_result.customers.created,
                },
                "updated": {
                    "products": sync_result.products.updated,
                    "orders": sync_result.orders.updated,
                    "customers": sync_result.customers.updated,
                },
                "errors": sync_result.all_errors,
            },
        )

        logger.info(
            "Store synced: %s (products=%d/%d, orders=%d/%d, customers=%d/%d, errors=%d)",
            store.name,
            sync_result.products.created,
            sync_result.products.updated,
            sync_result.orders.created,
            sync_result.orders.updated,
            sync_result.customers.created,
            sync_result.customers.updated,
            len(sync_result.all_errors),
        )
    except Exception as e:
        logger.error("Sync failed for store %s: %s", store.id, str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"同步失败: {str(e)}",
        )

    return {
        "store_id": store.id,
        "platform": str(store.platform),
        "created": {
            "products": sync_result.products.created,
            "orders": sync_result.orders.created,
            "customers": sync_result.customers.created,
        },
        "updated": {
            "products": sync_result.products.updated,
            "orders": sync_result.orders.updated,
            "customers": sync_result.customers.updated,
        },
        "errors": sync_result.all_errors,
    }


@router.post(
    "/{store_id}/test",
    summary="Test store connection",
)
async def test_store_connection(
    slug: str,
    store_id: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Validate the store's API credentials against the platform.

    Unlike ``sync``, this does NOT pull any data. It only verifies that the
    configured credentials are accepted by the platform, and updates the
    store's connection status accordingly. Useful as a pre-flight check
    before a full sync, and as a "Test connection" button in the UI.
    """
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.MEMBER)

    result = await db.execute(
        select(Store).where(
            Store.id == store_id,
            Store.workspace_id == workspace.id,
        )
    )
    store = result.scalar_one_or_none()
    if store is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Store not found.",
        )

    config = await StoreService.get_plain_credentials(store)

    from app.services.platforms import PLATFORM_REGISTRY
    integration_cls = PLATFORM_REGISTRY.get(
        store.platform.value if hasattr(store.platform, "value") else str(store.platform)
    )
    if integration_cls is None:
        integration_cls = PLATFORM_REGISTRY["other"]

    integration = integration_cls()

    try:
        ok = await integration.validate_credentials(config)
    except Exception as exc:
        logger.error("Connection test failed for store %s: %s", store.id, str(exc))
        ok = False
        message = f"连接测试异常: {str(exc)}"
    else:
        message = (
            "连接成功，凭证有效。" if ok else "无法连接到平台，请检查 API 凭证。"
        )

    # Reflect the result in the store's connection status.
    store.status = StoreStatus.CONNECTED if ok else StoreStatus.ERROR
    await db.flush()

    await create_audit_log(
        db=db,
        workspace_id=workspace.id,
        user_id=principal.user_id,
        action="store.tested",
        resource_type="store",
        resource_id=store.id,
        details={
            "name": store.name,
            "platform": store.platform.value if hasattr(store.platform, "value") else str(store.platform),
            "ok": ok,
        },
    )

    return {
        "store_id": store.id,
        "platform": str(store.platform),
        "ok": ok,
        "message": message,
    }


# ===========================================================================
# Helper builders
# ===========================================================================


def _build_store_response(store: Store) -> StoreResponse:
    """Build a StoreResponse from a Store model instance."""
    status_val = store.status.value if hasattr(store.status, "value") else store.status
    # Mask access_token for security
    masked_token = _mask_value(store.access_token) if store.access_token else None
    return StoreResponse(
        id=store.id,
        workspace_id=store.workspace_id,
        name=store.name,
        platform=store.platform,
        store_url=store.store_url,
        api_key=store.api_key,
        access_token=masked_token,
        status=status_val,
        last_sync_at=store.last_sync_at,
        created_at=store.created_at,
    )


def _mask_value(value: str) -> str:
    """Mask a sensitive value, showing only first 4 and last 4 characters."""
    if len(value) <= 8:
        return "****"
    return value[:4] + "****" + value[-4:]