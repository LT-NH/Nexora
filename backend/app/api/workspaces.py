"""Nexora - Workspaces API Routes.

Endpoints for workspace CRUD, membership management, and role changes.
"""

import os
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import _require_member, create_audit_log
from app.database import get_db
from app.middleware.auth import (
    get_current_active_user,
)
from app.models.audit import AuditLog
from app.models.customer import Customer
from app.models.order import Order
from app.models.product import Product
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember, WorkspaceRole
from app.schemas.workspace import (
    WorkspaceCreate,
    WorkspaceResponse,
    WorkspaceUpdate,
    MemberResponse,
    InviteMember,
    ChangeRole,
)
from app.services.workspace import WorkspaceService
from app.utils.logging import get_logger
from app.utils.pagination import PaginatedResponse, PaginationParams

router = APIRouter(prefix="/workspaces")
logger = get_logger(__name__)


class AuditLogUserResponse(BaseModel):
    id: str
    full_name: str


class AuditLogResponse(BaseModel):
    id: str
    action: str
    resource_type: str
    details: str | None = None
    user: AuditLogUserResponse
    created_at: str


@router.get(
    "",
    response_model=PaginatedResponse[WorkspaceResponse],
    summary="List user workspaces",
)
async def list_workspaces(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    pagination: Annotated[PaginationParams, Depends()],
) -> PaginatedResponse[WorkspaceResponse]:
    """Return all workspaces the current user is a member of."""
    # Count total
    count_result = await db.execute(
        select(func.count(Workspace.id))
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == current_user.id)
    )
    total = count_result.scalar_one()

    # Fetch page
    result = await db.execute(
        select(Workspace)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == current_user.id)
        .order_by(Workspace.created_at.desc())
        .offset(pagination.offset)
        .limit(pagination.limit)
    )
    workspaces = result.scalars().all()
    items = [WorkspaceResponse.model_validate(w) for w in workspaces]
    return PaginatedResponse.create(items=items, total=total, params=pagination)


@router.post(
    "",
    response_model=WorkspaceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new workspace",
)
async def create_workspace(
    workspace_data: WorkspaceCreate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WorkspaceResponse:
    """Create a new workspace. The creator becomes the workspace owner.

    - **name**: Display name for the workspace.
    - **slug**: URL-friendly identifier (lowercase letters, numbers, hyphens).
    - **logo_url**: Optional URL to a logo image.
    """
    result = await WorkspaceService.create_workspace(db, current_user, workspace_data)

    # Audit log: workspace created
    await create_audit_log(
        db=db,
        workspace_id=result.id,
        user_id=current_user.id,
        action="workspace.created",
        resource_type="workspace",
        resource_id=result.id,
        details={"name": result.name, "slug": result.slug},
    )

    logger.info(
        "Workspace created: %s by user %s", result.slug, current_user.email
    )
    return result


@router.get(
    "/{slug}",
    response_model=WorkspaceResponse,
    summary="Get workspace by slug",
)
async def get_workspace(
    slug: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WorkspaceResponse:
    """Return workspace details by its slug."""
    _ = await _require_member(slug, current_user, db, WorkspaceRole.VIEWER)
    return await WorkspaceService.get_workspace_by_slug(db, slug)


@router.put(
    "/{slug}",
    response_model=WorkspaceResponse,
    summary="Update workspace",
)
async def update_workspace(
    slug: str,
    update_data: WorkspaceUpdate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WorkspaceResponse:
    """Update workspace name or logo. Requires admin or owner role."""
    workspace, _ = await _require_member(slug, current_user, db, WorkspaceRole.ADMIN)
    return await WorkspaceService.update_workspace(db, workspace, update_data)


@router.delete(
    "/{slug}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete workspace",
)
async def delete_workspace(
    slug: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Delete a workspace. Requires owner role."""
    workspace, _ = await _require_member(slug, current_user, db, WorkspaceRole.OWNER)

    # Audit log before deletion
    await create_audit_log(
        db=db,
        workspace_id=workspace.id,
        user_id=current_user.id,
        action="workspace.deleted",
        resource_type="workspace",
        resource_id=workspace.id,
        details={"name": workspace.name, "slug": workspace.slug},
    )

    await WorkspaceService.delete_workspace(db, workspace)
    logger.info(
        "Workspace deleted: %s by user %s", workspace.slug, current_user.email
    )


@router.post(
    "/{slug}/members",
    response_model=MemberResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Invite a member to workspace",
)
async def invite_member(
    slug: str,
    invite_data: InviteMember,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MemberResponse:
    """Invite a user to the workspace by email. Requires admin or owner role."""
    workspace, _ = await _require_member(slug, current_user, db, WorkspaceRole.ADMIN)
    result = await WorkspaceService.invite_member(db, workspace, invite_data)

    # Audit log: member invited
    await create_audit_log(
        db=db,
        workspace_id=workspace.id,
        user_id=current_user.id,
        action="member.invited",
        resource_type="workspace_member",
        resource_id=result.user_id,
        details={
            "email": result.email,
            "role": result.role,
            "invited_by": current_user.email,
        },
    )

    logger.info(
        "Member invited to workspace %s: %s (role=%s)",
        workspace.slug,
        result.email,
        result.role,
    )
    return result


@router.get(
    "/{slug}/members",
    response_model=PaginatedResponse[MemberResponse],
    summary="List workspace members",
)
async def list_members(
    slug: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    pagination: Annotated[PaginationParams, Depends()],
) -> PaginatedResponse[MemberResponse]:
    """Return all members of the workspace. Requires viewer or higher role."""
    workspace, _ = await _require_member(slug, current_user, db, WorkspaceRole.VIEWER)

    # Count total
    count_result = await db.execute(
        select(func.count(WorkspaceMember.id)).where(
            WorkspaceMember.workspace_id == workspace.id
        )
    )
    total = count_result.scalar_one()

    # Fetch page
    result = await db.execute(
        select(WorkspaceMember, User)
        .join(User, User.id == WorkspaceMember.user_id)
        .where(WorkspaceMember.workspace_id == workspace.id)
        .order_by(WorkspaceMember.invited_at)
        .offset(pagination.offset)
        .limit(pagination.limit)
    )
    rows = result.all()

    items = [
        MemberResponse(
            id=member.id,
            user_id=member.user_id,
            workspace_id=member.workspace_id,
            role=member.role.value,
            email=user.email,
            full_name=user.full_name,
            avatar_url=user.avatar_url,
            invited_at=member.invited_at,
            joined_at=member.joined_at,
        )
        for member, user in rows
    ]
    return PaginatedResponse.create(items=items, total=total, params=pagination)


@router.delete(
    "/{slug}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a member from workspace",
)
async def remove_member(
    slug: str,
    user_id: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Remove a member from the workspace. Requires admin or owner role."""
    workspace, _ = await _require_member(slug, current_user, db, WorkspaceRole.ADMIN)

    await WorkspaceService.remove_member(db, workspace, user_id)

    # Audit log: member removed
    await create_audit_log(
        db=db,
        workspace_id=workspace.id,
        user_id=current_user.id,
        action="member.removed",
        resource_type="workspace_member",
        resource_id=user_id,
        details={"removed_by": current_user.email},
    )

    logger.info(
        "Member removed from workspace %s: user_id=%s",
        workspace.slug,
        user_id,
    )


@router.put(
    "/{slug}/members/{user_id}/role",
    response_model=MemberResponse,
    summary="Change a member's role",
)
async def change_member_role(
    slug: str,
    user_id: str,
    role_data: ChangeRole,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MemberResponse:
    """Change a member's role in the workspace. Requires admin or owner role."""
    workspace, _ = await _require_member(slug, current_user, db, WorkspaceRole.ADMIN)
    result = await WorkspaceService.change_member_role(db, workspace, user_id, role_data)

    # Audit log: role changed
    await create_audit_log(
        db=db,
        workspace_id=workspace.id,
        user_id=current_user.id,
        action="member.role_changed",
        resource_type="workspace_member",
        resource_id=user_id,
        details={
            "new_role": result.role,
            "changed_by": current_user.email,
        },
    )

    logger.info(
        "Member role changed in workspace %s: user_id=%s, new_role=%s",
        workspace.slug,
        user_id,
        result.role,
    )
    return result


@router.get(
    "/{slug}/audit-logs",
    response_model=PaginatedResponse[AuditLogResponse],
    summary="Get workspace audit logs for dashboard",
)
async def get_audit_logs(
    slug: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    pagination: Annotated[PaginationParams, Depends()],
    limit: int = Query(20, ge=1, le=100, description="Number of recent logs"),
) -> PaginatedResponse[AuditLogResponse]:
    """Get recent audit logs for the workspace, used in dashboard recent activity."""
    workspace, _ = await _require_member(slug, current_user, db, WorkspaceRole.MEMBER)

    count_result = await db.execute(
        select(func.count(AuditLog.id)).where(AuditLog.workspace_id == workspace.id)
    )
    total = count_result.scalar_one()

    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.workspace_id == workspace.id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    )
    logs = result.scalars().all()

    # Build response with user info
    items = []
    for log in logs:
        # Get user name
        user_result = await db.execute(select(User).where(User.id == log.user_id))
        log_user = user_result.scalar_one_or_none()
        items.append(AuditLogResponse(
            id=log.id,
            action=log.action,
            resource_type=log.resource_type,
            details=log.details.get("description") or log.action if log.details else log.action,
            user=AuditLogUserResponse(
                id=log.user_id or "",
                full_name=log_user.full_name if log_user else "System",
            ),
            created_at=log.created_at.isoformat() if log.created_at else "",
        ))

    return PaginatedResponse.create(items=items, total=total, params=pagination)


@router.post(
    "/{slug}/upload-logo",
    summary="Upload workspace logo",
)
async def upload_workspace_logo(
    slug: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
) -> dict:
    """Upload a logo image for the workspace. Max 2MB, PNG/JPG/WebP only."""
    workspace, _ = await _require_member(slug, current_user, db, WorkspaceRole.ADMIN)

    # Validate file type
    allowed_types = {"image/png", "image/jpeg", "image/webp", "image/gif"}
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PNG, JPEG, WebP, and GIF images are allowed.",
        )

    # Validate file size (max 2MB)
    contents = await file.read()
    if len(contents) > 2 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size must be under 2MB.",
        )

    # Save file
    upload_dir = os.path.join("uploads", "workspaces", workspace.id)
    os.makedirs(upload_dir, exist_ok=True)

    ext = file.filename.split(".")[-1] if file.filename else "png"
    filename = f"logo.{ext}"
    filepath = os.path.join(upload_dir, filename)

    with open(filepath, "wb") as f:
        f.write(contents)

    logo_url = f"/uploads/workspaces/{workspace.id}/{filename}"
    workspace.logo_url = logo_url
    await db.flush()

    return {"logo_url": logo_url}


@router.get(
    "/{slug}/search",
    summary="Global search across workspace resources",
)
async def global_search(
    slug: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    q: str = Query(..., min_length=1, description="Search query"),
) -> dict:
    """Search across products, orders, and customers in the workspace."""
    workspace, _ = await _require_member(slug, current_user, db, WorkspaceRole.MEMBER)

    search_term = f"%{q}%"
    results = {"products": [], "orders": [], "customers": []}

    # Search products
    product_result = await db.execute(
        select(Product)
        .where(Product.workspace_id == workspace.id)
        .where(
            (Product.name.ilike(search_term)) |
            (Product.sku.ilike(search_term))
        )
        .limit(5)
    )
    results["products"] = [
        {"id": p.id, "name": p.name, "sku": p.sku, "type": "product"}
        for p in product_result.scalars().all()
    ]

    # Search orders
    order_result = await db.execute(
        select(Order)
        .where(Order.workspace_id == workspace.id)
        .where(Order.order_number.ilike(search_term))
        .limit(5)
    )
    results["orders"] = [
        {"id": o.id, "order_number": o.order_number, "type": "order"}
        for o in order_result.scalars().all()
    ]

    # Search customers
    customer_result = await db.execute(
        select(Customer)
        .where(Customer.workspace_id == workspace.id)
        .where(
            (Customer.name.ilike(search_term)) |
            (Customer.email.ilike(search_term))
        )
        .limit(5)
    )
    results["customers"] = [
        {"id": c.id, "name": c.name, "email": c.email, "type": "customer"}
        for c in customer_result.scalars().all()
    ]


@router.post("/{slug}/test-email", summary="发送测试邮件（验证 SMTP 配置）")
async def send_test_email(
    slug: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """向当前登录用户邮箱发送一封测试邮件，用于验证工作空间的 SMTP 邮件设置。

    SMTP 未配置或发送失败时返回 502，前端据此提示检查邮件服务器配置。
    """
    from app.services.email import send_email_async

    # 需要工作空间管理权限（workspace 设置页操作）
    await _require_member(slug, current_user, db, WorkspaceRole.ADMIN)

    html = f"""
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #eee;border-radius:12px;">
      <h2 style="color:#2560eb;margin:0 0 12px;">✅ Nexora 邮件配置测试</h2>
      <p style="color:#374151;line-height:1.6;">如果你收到了这封邮件，说明工作空间
      <strong>{slug}</strong> 的 SMTP 设置正确，邮件通知可以正常送达。</p>
      <p style="color:#6b7280;font-size:13px;">发送时间：{__import__('datetime').datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}</p>
    </div>
    """
    ok = await send_email_async(
        current_user.email,
        f"SMTP 配置测试 · {slug}",
        html,
    )
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="SMTP 未配置或发送失败，请检查邮件服务器设置",
        )
    return {"sent": True, "to": current_user.email}

    return results