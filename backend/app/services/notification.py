"""Nexora - Notification Service."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.utils.logging import get_logger

logger = get_logger(__name__)


class NotificationService:
    """Service for creating and managing notifications."""

    @staticmethod
    async def create_notification(
        db: AsyncSession,
        workspace_id: str,
        user_id: str,
        title: str,
        message: str,
        notification_type: str = "info",
        link: str | None = None,
    ) -> Notification:
        """Create a notification for a user in a workspace."""
        notification = Notification(
            workspace_id=workspace_id,
            user_id=user_id,
            title=title,
            message=message,
            notification_type=notification_type,
            link=link,
        )
        db.add(notification)
        await db.flush()
        logger.info("Notification created for user %s: %s", user_id, title)
        return notification

    @staticmethod
    async def notify_workspace_members(
        db: AsyncSession,
        workspace_id: str,
        user_ids: list[str],
        title: str,
        message: str,
        notification_type: str = "info",
        link: str | None = None,
    ) -> None:
        """Create notifications for multiple workspace members."""
        for user_id in user_ids:
            await NotificationService.create_notification(
                db=db,
                workspace_id=workspace_id,
                user_id=user_id,
                title=title,
                message=message,
                notification_type=notification_type,
                link=link,
            )