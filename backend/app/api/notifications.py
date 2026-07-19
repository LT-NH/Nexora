"""Nexora - Notification API Routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import _require_member, create_audit_log
from app.database import get_db
from app.middleware.auth import get_current_active_user
from app.models.notification import Notification
from app.models.user import User
from app.models.workspace import WorkspaceRole
from app.schemas.notification import (
    NotificationCount,
    NotificationCreate,
    NotificationResponse,
)
from app.utils.logging import get_logger

router = APIRouter(prefix="/workspaces/{slug}/notifications")
logger = get_logger(__name__)


@router.get("", response_model=list[NotificationResponse], summary="Get user notifications")
async def get_notifications(
    slug: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    unread_only: bool = False,
    limit: int = 50,
) -> list[NotificationResponse]:
    """Get notifications for the current user in this workspace."""
    workspace, _ = await _require_member(slug, current_user, db, WorkspaceRole.MEMBER)
    
    query = select(Notification).where(
        Notification.workspace_id == workspace.id,
        Notification.user_id == current_user.id,
    )
    if unread_only:
        query = query.where(Notification.is_read == False)
    
    query = query.order_by(Notification.created_at.desc()).limit(limit)
    result = await db.execute(query)
    notifications = result.scalars().all()
    
    return [NotificationResponse.model_validate(n) for n in notifications]


@router.get("/count", response_model=NotificationCount, summary="Get unread notification count")
async def get_unread_count(
    slug: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> NotificationCount:
    """Get count of unread notifications."""
    workspace, _ = await _require_member(slug, current_user, db, WorkspaceRole.MEMBER)
    
    result = await db.execute(
        select(func.count(Notification.id)).where(
            Notification.workspace_id == workspace.id,
            Notification.user_id == current_user.id,
            Notification.is_read == False,
        )
    )
    count = result.scalar_one()
    return NotificationCount(unread_count=count)


@router.post("/mark-read", summary="Mark all notifications as read")
async def mark_all_read(
    slug: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Mark all notifications as read for the current user."""
    workspace, _ = await _require_member(slug, current_user, db, WorkspaceRole.MEMBER)
    
    await db.execute(
        update(Notification)
        .where(
            Notification.workspace_id == workspace.id,
            Notification.user_id == current_user.id,
            Notification.is_read == False,
        )
        .values(is_read=True)
    )
    await db.flush()
    return {"message": "All notifications marked as read."}


@router.post("/{notification_id}/read", summary="Mark a notification as read")
async def mark_as_read(
    slug: str,
    notification_id: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Mark a single notification as read."""
    workspace, _ = await _require_member(slug, current_user, db, WorkspaceRole.MEMBER)
    
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.workspace_id == workspace.id,
            Notification.user_id == current_user.id,
        )
    )
    notification = result.scalar_one_or_none()
    
    if notification is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found.")
    
    notification.is_read = True
    await db.flush()
    return {"message": "Notification marked as read."}