"""Nexora - API Keys Routes.

Endpoints for managing workspace API keys.
"""

import json
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import _require_member, create_audit_log
from app.database import get_db
from app.middleware.auth import get_current_active_user
from app.models.apikey import ApiKey
from app.models.user import User
from app.models.workspace import WorkspaceRole
from app.schemas.apikey import (
    ApiKeyCreate,
    ApiKeyCreatedResponse,
    ApiKeyResponse,
)
from app.utils.exceptions import NotFoundException
from app.utils.logging import get_logger
from app.utils.pagination import PaginatedResponse, PaginationParams
from app.utils.security import generate_api_key, hash_api_key

router = APIRouter(prefix="/workspaces/{slug}/api-keys")
logger = get_logger(__name__)


@router.get(
    "",
    response_model=PaginatedResponse[ApiKeyResponse],
    summary="List API keys for workspace",
)
async def list_api_keys(
    slug: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    pagination: Annotated[PaginationParams, Depends()],
) -> PaginatedResponse[ApiKeyResponse]:
    """Return all API keys for the workspace. Requires admin or owner role."""
    workspace, _ = await _require_member(slug, current_user, db, WorkspaceRole.ADMIN)

    # Count total
    count_result = await db.execute(
        select(func.count(ApiKey.id)).where(ApiKey.workspace_id == workspace.id)
    )
    total = count_result.scalar_one()

    # Fetch page
    result = await db.execute(
        select(ApiKey)
        .where(ApiKey.workspace_id == workspace.id)
        .order_by(ApiKey.created_at.desc())
        .offset(pagination.offset)
        .limit(pagination.limit)
    )
    keys = result.scalars().all()
    items = [_api_key_to_response(k) for k in keys]
    return PaginatedResponse.create(items=items, total=total, params=pagination)


@router.post(
    "/",
    response_model=ApiKeyCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new API key",
)
async def create_api_key(
    slug: str,
    key_data: ApiKeyCreate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ApiKeyCreatedResponse:
    """Create a new API key for the workspace. Requires admin or owner role.

    The full API key is returned only once at creation time. Store it securely.

    - **name**: A label to identify the key.
    - **scopes**: Optional list of permission scopes (e.g. ["read","write","admin"]).
    - **expires_in_days**: Optional expiration in days (max 10 years).
    """
    workspace, _ = await _require_member(slug, current_user, db, WorkspaceRole.ADMIN)

    raw_key = generate_api_key()

    expires_at = None
    if key_data.expires_in_days is not None:
        expires_at = datetime.now(timezone.utc) + timedelta(
            days=key_data.expires_in_days
        )

    # Convert scopes list to JSON string
    scopes_str = json.dumps(key_data.scopes) if key_data.scopes else None

    api_key = ApiKey(
        workspace_id=workspace.id,
        created_by=current_user.id,
        name=key_data.name.strip(),
        key_hash=hash_api_key(raw_key),
        key_prefix=raw_key[:8],
        last_4=raw_key[-4:],
        scopes=scopes_str,
        expires_at=expires_at,
    )
    db.add(api_key)
    await db.flush()
    await db.refresh(api_key)

    # Audit log: API key created
    await create_audit_log(
        db=db,
        workspace_id=workspace.id,
        user_id=current_user.id,
        action="api_key.created",
        resource_type="api_key",
        resource_id=api_key.id,
        details={"name": api_key.name, "prefix": api_key.key_prefix},
    )

    logger.info(
        "API key created in workspace %s: %s (prefix=%s)",
        workspace.slug,
        api_key.name,
        api_key.key_prefix,
    )

    return ApiKeyCreatedResponse(
        api_key=_api_key_to_response(api_key),
        raw_key=raw_key,
    )


@router.delete(
    "/{key_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an API key",
)
async def delete_api_key(
    slug: str,
    key_id: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Delete an API key. Requires admin or owner role."""
    workspace, _ = await _require_member(slug, current_user, db, WorkspaceRole.ADMIN)

    result = await db.execute(
        select(ApiKey).where(
            ApiKey.id == key_id,
            ApiKey.workspace_id == workspace.id,
        )
    )
    key = result.scalar_one_or_none()

    if key is None:
        raise NotFoundException("API key not found in this workspace.")

    # Audit log: API key revoked
    await create_audit_log(
        db=db,
        workspace_id=workspace.id,
        user_id=current_user.id,
        action="api_key.revoked",
        resource_type="api_key",
        resource_id=key.id,
        details={"name": key.name, "prefix": key.key_prefix},
    )

    await db.delete(key)
    await db.flush()

    logger.info(
        "API key revoked in workspace %s: %s (prefix=%s)",
        workspace.slug,
        key.name,
        key.key_prefix,
    )


def _api_key_to_response(key: ApiKey) -> ApiKeyResponse:
    """Convert an ApiKey ORM model to an ApiKeyResponse, parsing scopes from JSON."""
    scopes_list = None
    if key.scopes:
        try:
            scopes_list = json.loads(key.scopes)
        except (json.JSONDecodeError, TypeError):
            scopes_list = []
    return ApiKeyResponse(
        id=key.id,
        workspace_id=key.workspace_id,
        name=key.name,
        key_prefix=key.key_prefix,
        last_4=key.last_4,
        scopes=scopes_list,
        is_active=key.is_active,
        last_used_at=key.last_used_at,
        expires_at=key.expires_at,
        created_at=key.created_at,
    )