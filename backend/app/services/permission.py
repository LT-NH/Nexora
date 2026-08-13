"""Nexora - Fine-grained RBAC Permission Service."""

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.permission import PermissionGroupMember, WorkspacePermission
from app.models.workspace import WorkspaceMember, WorkspaceRole

# All possible permission action names
ALL_ACTIONS = [
    "view_revenue",
    "edit_products",
    "delete_products",
    "manage_orders",
    "view_customers",
    "manage_coupons",
    "manage_members",
    "manage_settings",
]


async def check_permission(
    db: AsyncSession,
    workspace_id: str,
    user_id: str,
    action: str,
    member: Optional[WorkspaceMember] = None,
) -> bool:
    """Check if a user has permission for a specific action.

    Resolution order:
    1. Owner → always full access.
    2. Admin → full access (fallback).
    3. Custom per-user permission (workspace_permissions).
    4. Inherited via group (permission_group_members → workspace_permissions).
    5. Fallback: basic roles get default access (VIEWER: read-only, MEMBER: broad).

    Args:
        db: Async database session.
        workspace_id: Target workspace ID.
        user_id: ID of the user being checked.
        action: Action string (e.g., 'delete_products', 'view_revenue').
        member: Optional pre-fetched WorkspaceMember for the user.

    Returns:
        True if permitted, False otherwise.
    """
    # Lazy-load the member if not provided
    if member is None:
        result = await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == user_id,
            )
        )
        member = result.scalar_one_or_none()

    if member is None:
        return False

    # Owner: always full access
    if member.role == WorkspaceRole.OWNER:
        return True

    # Admin: full access
    if member.role == WorkspaceRole.ADMIN:
        return True

    # --- Check custom per-user permission ---
    perm_result = await db.execute(
        select(WorkspacePermission).where(
            WorkspacePermission.workspace_id == workspace_id,
            WorkspacePermission.user_id == user_id,
        )
    )
    perm = perm_result.scalar_one_or_none()

    action_map = {
        "view_revenue": "can_view_revenue",
        "edit_products": "can_edit_products",
        "delete_products": "can_delete_products",
        "manage_orders": "can_manage_orders",
        "view_customers": "can_view_customers",
        "manage_coupons": "can_manage_coupons",
        "manage_members": "can_manage_members",
        "manage_settings": "can_manage_settings",
    }

    attr_name = action_map.get(action)
    if attr_name is None:
        return False

    # If the user has a direct permission row, use it
    if perm is not None:
        value = getattr(perm, attr_name, None)
        if value is True:
            return True
        if value is False:
            # Explicit DENY takes precedence
            return False

    # --- Check group permissions ---
    group_perm_result = await db.execute(
        select(WorkspacePermission).where(
            WorkspacePermission.workspace_id == workspace_id,
            WorkspacePermission.group_id.in_(
                select(PermissionGroupMember.group_id).where(
                    PermissionGroupMember.user_id == user_id,
                )
            ),
        )
    )
    group_perms = group_perm_result.scalars().all()
    for gp in group_perms:
        if getattr(gp, attr_name, False) is True:
            return True
        if getattr(gp, attr_name, False) is False:
            # Explicit group DENY
            return False

    # --- Fallback: role-based defaults ---
    # VIEWER: can only view
    if member.role == WorkspaceRole.VIEWER:
        view_actions = {"view_revenue", "view_customers", "manage_orders"}
        return action in view_actions

    # MEMBER: default allow most except destructive
    member_default_deny = {
        "delete_products",
        "manage_coupons",
        "manage_members",
        "manage_settings",
    }
    if action in member_default_deny:
        return False

    return True


async def delete_permission_for_user(
    db: AsyncSession,
    workspace_id: str,
    user_id: str,
) -> None:
    """Remove custom permission overrides for a user in a workspace."""
    result = await db.execute(
        select(WorkspacePermission).where(
            WorkspacePermission.workspace_id == workspace_id,
            WorkspacePermission.user_id == user_id,
        )
    )
    perm = result.scalar_one_or_none()
    if perm:
        await db.delete(perm)
        await db.flush()
