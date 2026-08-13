"""Nexora - Permissions API Routes.

Manage fine-grained RBAC: permission groups and per-user custom permissions.
"""

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import _require_member
from app.database import get_db
from app.middleware.auth import AuthContext, get_principal
from app.models.permission import (
    PermissionGroup,
    PermissionGroupMember,
    WorkspacePermission,
)
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember, WorkspaceRole
from app.services.permission import ALL_ACTIONS, check_permission, delete_permission_for_user
from app.utils.pagination import PaginatedResponse, PaginationParams

router = APIRouter(prefix="/workspaces/{slug}/permissions")


# ---------------------------------------------------------------------------
# Schema models
# ---------------------------------------------------------------------------

class PermissionGroupResponse(BaseModel):
    id: str
    name: str
    member_count: int = 0


class PermissionGroupCreate(BaseModel):
    name: str


class GroupMemberAdd(BaseModel):
    user_id: str


class PermissionOverride(BaseModel):
    """A per-user custom permission set."""
    user_id: str
    email: str = ""
    full_name: str = ""
    group_name: Optional[str] = None
    can_view_revenue: bool = True
    can_edit_products: bool = False
    can_delete_products: bool = False
    can_manage_orders: bool = True
    can_view_customers: bool = True
    can_manage_coupons: bool = False
    can_manage_members: bool = False
    can_manage_settings: bool = False


class PermissionListResponse(BaseModel):
    groups: list[PermissionGroupResponse]
    overrides: list[PermissionOverride]
    members: list[dict]


# ---------------------------------------------------------------------------
# GET: list all permission groups and custom overrides
# ---------------------------------------------------------------------------


@router.get(
    "",
    summary="List permission groups and custom overrides",
)
async def list_permissions(
    slug: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PermissionListResponse:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.ADMIN)

    # Fetch permission groups with member count
    group_result = await db.execute(
        select(PermissionGroup).where(PermissionGroup.workspace_id == workspace.id)
    )
    groups = group_result.scalars().all()

    group_responses: list[PermissionGroupResponse] = []
    for g in groups:
        count_result = await db.execute(
            select(func.count(PermissionGroupMember.id)).where(
                PermissionGroupMember.group_id == g.id,
            )
        )
        count = count_result.scalar_one()
        group_responses.append(PermissionGroupResponse(id=g.id, name=g.name, member_count=count))

    # Fetch per-user permission overrides
    perm_result = await db.execute(
        select(WorkspacePermission).where(
            WorkspacePermission.workspace_id == workspace.id,
            WorkspacePermission.user_id.isnot(None),
        )
    )
    overrides_db = perm_result.scalars().all()

    overrides: list[PermissionOverride] = []
    for ov in overrides_db:
        user_result = await db.execute(select(User).where(User.id == ov.user_id))
        user = user_result.scalar_one_or_none()
        group_name = None
        if ov.group_id:
            grp_result = await db.execute(select(PermissionGroup).where(PermissionGroup.id == ov.group_id))
            grp = grp_result.scalar_one_or_none()
            if grp:
                group_name = grp.name
        overrides.append(PermissionOverride(
            user_id=ov.user_id or "",
            email=user.email if user else "",
            full_name=user.full_name if user else "",
            group_name=group_name,
            can_view_revenue=ov.can_view_revenue,
            can_edit_products=ov.can_edit_products,
            can_delete_products=ov.can_delete_products,
            can_manage_orders=ov.can_manage_orders,
            can_view_customers=ov.can_view_customers,
            can_manage_coupons=ov.can_manage_coupons,
            can_manage_members=ov.can_manage_members,
            can_manage_settings=ov.can_manage_settings,
        ))

    # Fetch all workspace members for group assignment UI
    member_result = await db.execute(
        select(WorkspaceMember, User)
        .join(User, User.id == WorkspaceMember.user_id)
        .where(WorkspaceMember.workspace_id == workspace.id)
    )
    member_rows = member_result.all()
    members = [
        {
            "user_id": m.user_id,
            "email": u.email,
            "full_name": u.full_name,
            "role": m.role.value,
        }
        for m, u in member_rows
    ]

    return PermissionListResponse(
        groups=group_responses,
        overrides=overrides,
        members=members,
    )


# ---------------------------------------------------------------------------
# POST: create a permission group or assign custom permission to a user
# ---------------------------------------------------------------------------


class CreatePermissionBody(BaseModel):
    type: str  # "group" or "override"
    # Group fields
    name: Optional[str] = None
    # Override fields
    user_id: Optional[str] = None
    group_id: Optional[str] = None
    can_view_revenue: Optional[bool] = None
    can_edit_products: Optional[bool] = None
    can_delete_products: Optional[bool] = None
    can_manage_orders: Optional[bool] = None
    can_view_customers: Optional[bool] = None
    can_manage_coupons: Optional[bool] = None
    can_manage_members: Optional[bool] = None
    can_manage_settings: Optional[bool] = None


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="Create permission group or user override",
)
async def create_permission(
    slug: str,
    body: CreatePermissionBody,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.ADMIN)

    if body.type == "group":
        if not body.name or not body.name.strip():
            raise HTTPException(status_code=400, detail="Group name is required")
        group = PermissionGroup(
            workspace_id=workspace.id,
            name=body.name.strip(),
        )
        db.add(group)
        await db.flush()
        return {"id": group.id, "name": group.name, "type": "group"}

    elif body.type == "override":
        if not body.user_id:
            raise HTTPException(status_code=400, detail="user_id is required for override")
        # Upsert: check if override exists for this user
        existing = await db.execute(
            select(WorkspacePermission).where(
                WorkspacePermission.workspace_id == workspace.id,
                WorkspacePermission.user_id == body.user_id,
            )
        )
        perm = existing.scalar_one_or_none()
        if perm is None:
            perm = WorkspacePermission(
                workspace_id=workspace.id,
                user_id=body.user_id,
                group_id=body.group_id,
                can_view_revenue=body.can_view_revenue if body.can_view_revenue is not None else True,
                can_edit_products=body.can_edit_products if body.can_edit_products is not None else False,
                can_delete_products=body.can_delete_products if body.can_delete_products is not None else False,
                can_manage_orders=body.can_manage_orders if body.can_manage_orders is not None else True,
                can_view_customers=body.can_view_customers if body.can_view_customers is not None else True,
                can_manage_coupons=body.can_manage_coupons if body.can_manage_coupons is not None else False,
                can_manage_members=body.can_manage_members if body.can_manage_members is not None else False,
                can_manage_settings=body.can_manage_settings if body.can_manage_settings is not None else False,
            )
            db.add(perm)
        else:
            if body.can_view_revenue is not None:
                perm.can_view_revenue = body.can_view_revenue
            if body.can_edit_products is not None:
                perm.can_edit_products = body.can_edit_products
            if body.can_delete_products is not None:
                perm.can_delete_products = body.can_delete_products
            if body.can_manage_orders is not None:
                perm.can_manage_orders = body.can_manage_orders
            if body.can_view_customers is not None:
                perm.can_view_customers = body.can_view_customers
            if body.can_manage_coupons is not None:
                perm.can_manage_coupons = body.can_manage_coupons
            if body.can_manage_members is not None:
                perm.can_manage_members = body.can_manage_members
            if body.can_manage_settings is not None:
                perm.can_manage_settings = body.can_manage_settings
        await db.flush()
        return {"id": perm.id, "type": "override"}

    else:
        raise HTTPException(status_code=400, detail="Invalid type. Must be 'group' or 'override'.")


# ---------------------------------------------------------------------------
# PATCH: update user custom permissions
# ---------------------------------------------------------------------------


class PatchPermissionBody(BaseModel):
    can_view_revenue: Optional[bool] = None
    can_edit_products: Optional[bool] = None
    can_delete_products: Optional[bool] = None
    can_manage_orders: Optional[bool] = None
    can_view_customers: Optional[bool] = None
    can_manage_coupons: Optional[bool] = None
    can_manage_members: Optional[bool] = None
    can_manage_settings: Optional[bool] = None


@router.patch(
    "/{user_id}",
    summary="Update user's custom permissions",
)
async def update_user_permission(
    slug: str,
    user_id: str,
    body: PatchPermissionBody,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.ADMIN)

    result = await db.execute(
        select(WorkspacePermission).where(
            WorkspacePermission.workspace_id == workspace.id,
            WorkspacePermission.user_id == user_id,
        )
    )
    perm = result.scalar_one_or_none()

    if perm is None:
        perm = WorkspacePermission(workspace_id=workspace.id, user_id=user_id)
        db.add(perm)

    if body.can_view_revenue is not None:
        perm.can_view_revenue = body.can_view_revenue
    if body.can_edit_products is not None:
        perm.can_edit_products = body.can_edit_products
    if body.can_delete_products is not None:
        perm.can_delete_products = body.can_delete_products
    if body.can_manage_orders is not None:
        perm.can_manage_orders = body.can_manage_orders
    if body.can_view_customers is not None:
        perm.can_view_customers = body.can_view_customers
    if body.can_manage_coupons is not None:
        perm.can_manage_coupons = body.can_manage_coupons
    if body.can_manage_members is not None:
        perm.can_manage_members = body.can_manage_members
    if body.can_manage_settings is not None:
        perm.can_manage_settings = body.can_manage_settings

    await db.flush()
    return {"status": "updated", "user_id": user_id}


# ---------------------------------------------------------------------------
# DELETE: remove custom permission for a user
# ---------------------------------------------------------------------------


@router.delete(
    "/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove custom permission override for user",
)
async def remove_user_permission(
    slug: str,
    user_id: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.ADMIN)
    await delete_permission_for_user(db, workspace.id, user_id)


# ---------------------------------------------------------------------------
# DELETE: delete a permission group
# ---------------------------------------------------------------------------


@router.delete(
    "/groups/{group_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a permission group",
)
async def delete_permission_group(
    slug: str,
    group_id: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.ADMIN)

    result = await db.execute(
        select(PermissionGroup).where(
            PermissionGroup.id == group_id,
            PermissionGroup.workspace_id == workspace.id,
        )
    )
    group = result.scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=404, detail="Permission group not found")

    await db.delete(group)
    await db.flush()


# ---------------------------------------------------------------------------
# POST: add member to group
# ---------------------------------------------------------------------------


@router.post(
    "/groups/{group_id}/members",
    status_code=status.HTTP_201_CREATED,
    summary="Add a user to a permission group",
)
async def add_group_member(
    slug: str,
    group_id: str,
    body: GroupMemberAdd,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.ADMIN)

    # Verify group exists
    grp_result = await db.execute(
        select(PermissionGroup).where(
            PermissionGroup.id == group_id,
            PermissionGroup.workspace_id == workspace.id,
        )
    )
    if grp_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Permission group not found")

    # Check if already a member
    existing = await db.execute(
        select(PermissionGroupMember).where(
            PermissionGroupMember.group_id == group_id,
            PermissionGroupMember.user_id == body.user_id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="User is already in this group")

    member = PermissionGroupMember(group_id=group_id, user_id=body.user_id)
    db.add(member)
    await db.flush()
    return {"id": member.id, "group_id": group_id, "user_id": body.user_id}


# ---------------------------------------------------------------------------
# DELETE: remove member from group
# ---------------------------------------------------------------------------


@router.delete(
    "/groups/{group_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a user from a permission group",
)
async def remove_group_member(
    slug: str,
    group_id: str,
    user_id: str,
    principal: Annotated[AuthContext, Depends(get_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    workspace, _ = await _require_member(slug, principal, db, WorkspaceRole.ADMIN)

    result = await db.execute(
        select(PermissionGroupMember).where(
            PermissionGroupMember.group_id == group_id,
            PermissionGroupMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if member:
        await db.delete(member)
        await db.flush()
