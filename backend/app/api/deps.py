"""Nexora - Shared API Dependencies.

Provides reusable FastAPI dependencies and helpers used across multiple
API routers, including workspace membership validation and audit logging.
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Union

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.auth import AuthContext
from app.middleware.auth import get_principal
from app.models.audit import AuditLog
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember, WorkspaceRole

from app.database import get_db


# Role hierarchy helper
_ROLE_HIERARCHY = {
    WorkspaceRole.OWNER: 4,
    WorkspaceRole.ADMIN: 3,
    WorkspaceRole.MEMBER: 2,
    WorkspaceRole.VIEWER: 1,
}


async def _require_member(
    slug: str,
    principal: Union[User, AuthContext],
    db: AsyncSession,
    min_role: WorkspaceRole,
) -> tuple[Workspace, WorkspaceMember | None]:
    """Validate that the caller has access to the workspace with sufficient role.

    Accepts either a ``User`` (JWT auth, legacy) or an ``AuthContext``
    (dual JWT + API key auth).

    Args:
        slug: Workspace slug from the URL path.
        principal: Authenticated user or auth context.
        db: Async database session.
        min_role: Minimum role required to pass the check.

    Returns:
        A tuple of (Workspace, WorkspaceMember or None).
        For API key auth, membership may be None.

    Raises:
        HTTPException 404: If the workspace is not found.
        HTTPException 403: If access is denied or role is insufficient.
    """
    # Normalize to AuthContext
    if isinstance(principal, AuthContext):
        ctx = principal
    else:
        ctx = AuthContext(user=principal)

    result = await db.execute(
        select(Workspace).where(Workspace.slug == slug.lower())
    )
    workspace = result.scalar_one_or_none()

    if workspace is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Workspace '{slug}' not found.",
        )

    # --- API Key auth path ---
    if ctx.is_api_key:
        # Verify the key's workspace matches the requested slug
        if ctx.api_key.workspace_id != workspace.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="API key is not valid for this workspace.",
            )
        # Check scope-based role
        if _ROLE_HIERARCHY.get(ctx.max_role, 0) < _ROLE_HIERARCHY.get(min_role, 0):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"API key scopes do not grant sufficient permissions "
                f"(need: '{min_role.value}', have: '{ctx.max_role.value}').",
            )
        # Return a synthetic membership for compatibility
        synth_membership = WorkspaceMember(
            workspace_id=workspace.id,
            user_id=ctx.user_id,
            role=ctx.max_role,
        )
        return workspace, synth_membership

    # --- JWT auth path (original logic) ---
    if ctx.user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated.",
        )

    member_result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace.id,
            WorkspaceMember.user_id == ctx.user.id,
        )
    )
    membership = member_result.scalar_one_or_none()

    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this workspace.",
        )

    if _ROLE_HIERARCHY.get(membership.role, 0) < _ROLE_HIERARCHY.get(min_role, 0):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Your role '{membership.role.value}' does not have "
            f"sufficient permissions (minimum: '{min_role.value}').",
        )

    return workspace, membership


async def get_current_workspace(
    workspace_slug: str,
    db: AsyncSession = Depends(get_db),
    principal: AuthContext = Depends(get_principal),
) -> Workspace:
    """Dependency that resolves the workspace and validates membership."""
    workspace, _ = await _require_member(
        workspace_slug, principal, db, WorkspaceRole.VIEWER
    )
    return workspace


from app.utils.audit import create_audit_log  # noqa: F401 — re-exported for backward compat
