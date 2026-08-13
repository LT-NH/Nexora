"""Nexora - Authentication Middleware.

Provides FastAPI dependencies for JWT-based and API key-based authentication.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
import json
from typing import Annotated, Optional

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.apikey import ApiKey
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember, WorkspaceRole
from app.utils.security import decode_token, hash_api_key

# Security scheme for OpenAPI docs
security_scheme = HTTPBearer(
    scheme_name="JWT",
    description="Enter your JWT access token",
    auto_error=False,
)


async def get_current_user(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(security_scheme),
    ] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> User:
    """Extract and validate the current user from the JWT Bearer token.

    Args:
        credentials: HTTP Bearer credentials from the request.
        db: Async database session.

    Returns:
        The authenticated User model instance.

    Raises:
        HTTPException 401: If no token is provided or the token is invalid.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. Please provide a valid Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    payload = decode_token(token)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type. Expected an access token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id: str | None = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated.",
        )

    return user


async def get_current_active_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Dependency that ensures the current user is active.

    Args:
        current_user: The authenticated user from get_current_user.

    Returns:
        The authenticated active User.

    Raises:
        HTTPException 403: If the user account is deactivated.
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated.",
        )
    return current_user


async def require_superadmin(
    current_user: Annotated[User, Depends(get_current_active_user)],
) -> User:
    """Dependency that requires the user to be a superadmin.

    Args:
        current_user: The authenticated active user.

    Returns:
        The authenticated superadmin User.

    Raises:
        HTTPException 403: If the user is not a superadmin.
    """
    if not current_user.is_superadmin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superadmin privileges required.",
        )
    return current_user


def require_workspace_member(
    minimum_role: WorkspaceRole = WorkspaceRole.VIEWER,
) -> callable:
    """Factory that creates a dependency for workspace membership and role checks.

    Args:
        minimum_role: The minimum role required to access the endpoint.

    Returns:
        A dependency callable that validates workspace membership and role.
    """

    async def _dependency(
        slug: str,
        current_user: Annotated[User, Depends(get_current_active_user)],
        db: Annotated[AsyncSession, Depends(get_db)],
    ) -> tuple[Workspace, WorkspaceMember]:
        """Validate that the current user is a member of the workspace.

        Args:
            slug: Workspace slug from the path parameter.
            current_user: The authenticated user.
            db: Async database session.

        Returns:
            A tuple of (Workspace, WorkspaceMember).

        Raises:
            HTTPException 404: If the workspace is not found.
            HTTPException 403: If the user is not a member or lacks sufficient role.
        """
        result = await db.execute(
            select(Workspace).where(Workspace.slug == slug)
        )
        workspace = result.scalar_one_or_none()

        if workspace is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Workspace '{slug}' not found.",
            )

        member_result = await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace.id,
                WorkspaceMember.user_id == current_user.id,
            )
        )
        membership = member_result.scalar_one_or_none()

        if membership is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of this workspace.",
            )

        # Role hierarchy: owner > admin > member > viewer
        role_hierarchy = {
            WorkspaceRole.OWNER: 4,
            WorkspaceRole.ADMIN: 3,
            WorkspaceRole.MEMBER: 2,
            WorkspaceRole.VIEWER: 1,
        }

        if role_hierarchy.get(membership.role, 0) < role_hierarchy.get(minimum_role, 0):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Your role '{membership.role.value}' does not have "
                f"sufficient permissions (minimum: '{minimum_role.value}').",
            )

        return workspace, membership

    return _dependency


# ===========================================================================
# Dual Auth: JWT + API Key
# ===========================================================================

# Scope → role mapping for API key authorization
_SCOPE_ROLE_MAP: dict[str, WorkspaceRole] = {
    "read": WorkspaceRole.VIEWER,
    "write": WorkspaceRole.MEMBER,
    "admin": WorkspaceRole.ADMIN,
}


@dataclass
class AuthContext:
    """Unified authentication context supporting JWT and API key.

    For JWT auth: ``user`` is set, ``api_key`` is None.
    For API key auth: ``api_key`` is set, ``user`` may be the key creator.
    """

    user: User | None = None
    api_key: ApiKey | None = None

    @property
    def is_api_key(self) -> bool:
        """True if authenticated via API key."""
        return self.api_key is not None

    @property
    def user_id(self) -> str:
        """User ID for audit logging. Falls back to 'api-key:{prefix}'."""
        if self.api_key and not self.user:
            return f"api-key:{self.api_key.key_prefix}"
        return self.user.id if self.user else "unknown"

    @property
    def workspace_id(self) -> str | None:
        """Workspace ID bound to the API key, if applicable."""
        return self.api_key.workspace_id if self.api_key else None

    @property
    def max_role(self) -> WorkspaceRole:
        """Maximum role implied by this auth context."""
        if self.api_key:
            scopes = _parse_scopes(self.api_key.scopes)
            if not scopes:
                # No scopes specified → read-only by default
                return WorkspaceRole.VIEWER
            best = WorkspaceRole.VIEWER
            for s in scopes:
                mapped = _SCOPE_ROLE_MAP.get(s)
                if mapped and _role_level(mapped) > _role_level(best):
                    best = mapped
            return best
        # JWT users are full members — role is checked via WorkspaceMember
        return WorkspaceRole.OWNER


def _parse_scopes(raw: str | None) -> list[str]:
    """Parse scopes from a JSON array string, returning a list of scope strings."""
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [s for s in parsed if isinstance(s, str)]
    except (json.JSONDecodeError, TypeError):
        pass
    return []


def _role_level(role: WorkspaceRole) -> int:
    """Return numeric hierarchy level for a role."""
    return {
        WorkspaceRole.OWNER: 4,
        WorkspaceRole.ADMIN: 3,
        WorkspaceRole.MEMBER: 2,
        WorkspaceRole.VIEWER: 1,
    }.get(role, 0)


async def get_principal(
    request: Request,
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(security_scheme),
    ] = None,
    x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None,
    api_key_query: Annotated[str | None, None] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> AuthContext:
    """Unified authentication dependency supporting both JWT and API key.

    Tries API key (X-API-Key header, ?api_key= query param, or sf_-prefixed
    Bearer token) first, then falls back to JWT Bearer token.

    Returns:
        AuthContext with either ``user`` or ``api_key`` populated.

    Raises:
        HTTPException 401: If no valid credential is provided.
    """
    # --- Try API Key ---
    raw_key: str | None = None

    # ?api_key= query parameter
    if not x_api_key:
        api_key_query = request.query_params.get("api_key")
    if api_key_query and isinstance(api_key_query, str):
        raw_key = api_key_query.strip()

    # X-API-Key header
    if not raw_key and x_api_key:
        raw_key = x_api_key.strip()

    # Bearer token that looks like an API key (starts with "sf_")
    if not raw_key and credentials:
        token = credentials.credentials
        if token.startswith("sf_"):
            raw_key = token

    if raw_key:
        key_hash = hash_api_key(raw_key)
        result = await db.execute(
            select(ApiKey).where(
                ApiKey.key_hash == key_hash,
                ApiKey.is_active.is_(True),
            )
        )
        api_key = result.scalar_one_or_none()

        if api_key is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid API key.",
            )

        # Check expiration
        if api_key.expires_at is not None:
            now = datetime.now(timezone.utc)
            expires = api_key.expires_at
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            if now > expires:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="API key has expired.",
                )

        # Update last_used_at (non-blocking, best-effort)
        api_key.last_used_at = datetime.now(timezone.utc)
        await db.flush()

        # Optionally load the creator user
        user: User | None = None
        if api_key.created_by:
            user_result = await db.execute(
                select(User).where(User.id == api_key.created_by)
            )
            user = user_result.scalar_one_or_none()

        return AuthContext(user=user, api_key=api_key)

    # --- Fall back to JWT ---
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. Provide a JWT Bearer token or X-API-Key header.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    payload = decode_token(token)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type. Expected an access token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id: str | None = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated.",
        )

    return AuthContext(user=user)