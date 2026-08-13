"""Nexora - Workspace Service.

Handles workspace CRUD, membership management, and role management.
"""

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

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


class WorkspaceService:
    """Service for workspace-related business logic."""

    @staticmethod
    async def create_workspace(
        db: AsyncSession,
        user: User,
        workspace_data: WorkspaceCreate,
    ) -> WorkspaceResponse:
        """Create a new workspace and add the creator as owner.

        Args:
            db: Async database session.
            user: The authenticated user creating the workspace.
            workspace_data: Workspace creation data.

        Returns:
            The created workspace as a WorkspaceResponse.

        Raises:
            HTTPException 409: If the slug is already taken.
        """
        # Check slug uniqueness
        result = await db.execute(
            select(Workspace).where(Workspace.slug == workspace_data.slug.lower())
        )
        existing = result.scalar_one_or_none()
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Workspace slug '{workspace_data.slug}' is already taken.",
            )

        workspace = Workspace(
            name=workspace_data.name.strip(),
            slug=workspace_data.slug.lower().strip(),
            logo_url=workspace_data.logo_url,
        )
        db.add(workspace)
        await db.flush()

        # Add creator as owner
        membership = WorkspaceMember(
            workspace_id=workspace.id,
            user_id=user.id,
            role=WorkspaceRole.OWNER,
            joined_at=datetime.now(timezone.utc),
        )
        db.add(membership)

        # Auto-subscribe to Free plan
        from app.models.subscription import Subscription, SubscriptionPlan, SubscriptionStatus, PaymentStatus
        plan_result = await db.execute(
            select(SubscriptionPlan).where(SubscriptionPlan.slug == 'free')
        )
        free_plan = plan_result.scalar_one_or_none()
        if free_plan:
            now = datetime.now(timezone.utc)
            sub = Subscription(
                workspace_id=workspace.id,
                plan_id=free_plan.id,
                status=SubscriptionStatus.ACTIVE,
                payment_status=PaymentStatus.VERIFIED,
                current_period_start=now,
                current_period_end=now.replace(year=now.year + 10),
            )
            db.add(sub)

        await db.flush()
        await db.refresh(workspace)

        return WorkspaceResponse.model_validate(workspace)

    @staticmethod
    async def get_user_workspaces(
        db: AsyncSession,
        user: User,
    ) -> list[WorkspaceResponse]:
        """Get all workspaces the user is a member of.

        Args:
            db: Async database session.
            user: The authenticated user.

        Returns:
            List of WorkspaceResponse objects.
        """
        result = await db.execute(
            select(Workspace)
            .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
            .where(WorkspaceMember.user_id == user.id)
            .order_by(Workspace.created_at.desc())
        )
        workspaces = result.scalars().all()
        return [WorkspaceResponse.model_validate(w) for w in workspaces]

    @staticmethod
    async def get_workspace_by_slug(
        db: AsyncSession,
        slug: str,
    ) -> WorkspaceResponse:
        """Get a workspace by its slug.

        Args:
            db: Async database session.
            slug: The workspace slug.

        Returns:
            WorkspaceResponse for the requested workspace.

        Raises:
            HTTPException 404: If the workspace is not found.
        """
        result = await db.execute(
            select(Workspace).where(Workspace.slug == slug.lower())
        )
        workspace = result.scalar_one_or_none()

        if workspace is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Workspace '{slug}' not found.",
            )

        return WorkspaceResponse.model_validate(workspace)

    @staticmethod
    async def update_workspace(
        db: AsyncSession,
        workspace: Workspace,
        update_data: WorkspaceUpdate,
    ) -> WorkspaceResponse:
        """Update workspace details.

        Args:
            db: Async database session.
            workspace: The workspace to update.
            update_data: Fields to update.

        Returns:
            Updated WorkspaceResponse.
        """
        if update_data.name is not None:
            workspace.name = update_data.name.strip()
        if update_data.logo_url is not None:
            workspace.logo_url = update_data.logo_url

        # White-label brand customization
        if update_data.brand_name is not None:
            workspace.brand_name = update_data.brand_name.strip()
        if update_data.brand_logo_url is not None:
            workspace.brand_logo_url = update_data.brand_logo_url
        if update_data.brand_color is not None:
            workspace.brand_color = update_data.brand_color
        if update_data.brand_dark_mode is not None:
            workspace.brand_dark_mode = update_data.brand_dark_mode

        workspace.updated_at = datetime.now(timezone.utc)
        await db.flush()
        await db.refresh(workspace)

        return WorkspaceResponse.model_validate(workspace)

    @staticmethod
    async def delete_workspace(
        db: AsyncSession,
        workspace: Workspace,
    ) -> None:
        """Delete a workspace.

        Args:
            db: Async database session.
            workspace: The workspace to delete.
        """
        await db.delete(workspace)
        await db.flush()

    @staticmethod
    async def get_workspace_members(
        db: AsyncSession,
        workspace: Workspace,
    ) -> list[MemberResponse]:
        """Get all members of a workspace with user details.

        Args:
            db: Async database session.
            workspace: The workspace.

        Returns:
            List of MemberResponse objects with user info.
        """
        result = await db.execute(
            select(WorkspaceMember, User)
            .join(User, User.id == WorkspaceMember.user_id)
            .where(WorkspaceMember.workspace_id == workspace.id)
            .order_by(WorkspaceMember.invited_at)
        )
        rows = result.all()

        return [
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

    @staticmethod
    async def invite_member(
        db: AsyncSession,
        workspace: Workspace,
        invite_data: InviteMember,
    ) -> MemberResponse:
        """Invite a user to a workspace by email.

        Args:
            db: Async database session.
            workspace: The workspace to invite to.
            invite_data: Invitation details including email and role.

        Returns:
            MemberResponse for the new member.

        Raises:
            HTTPException 404: If the user is not found.
            HTTPException 409: If the user is already a member.
        """
        # Find the user by email
        result = await db.execute(
            select(User).where(User.email == invite_data.email.lower().strip())
        )
        user = result.scalar_one_or_none()

        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User with email '{invite_data.email}' not found.",
            )

        # Check if already a member
        existing = await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace.id,
                WorkspaceMember.user_id == user.id,
            )
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User is already a member of this workspace.",
            )

        role = WorkspaceRole(invite_data.role)
        membership = WorkspaceMember(
            workspace_id=workspace.id,
            user_id=user.id,
            role=role,
            joined_at=datetime.now(timezone.utc),
        )
        db.add(membership)
        await db.flush()
        await db.refresh(membership)

        return MemberResponse(
            id=membership.id,
            user_id=membership.user_id,
            workspace_id=membership.workspace_id,
            role=membership.role.value,
            email=user.email,
            full_name=user.full_name,
            avatar_url=user.avatar_url,
            invited_at=membership.invited_at,
            joined_at=membership.joined_at,
        )

    @staticmethod
    async def remove_member(
        db: AsyncSession,
        workspace: Workspace,
        user_id: str,
    ) -> None:
        """Remove a member from a workspace.

        Args:
            db: Async database session.
            workspace: The workspace.
            user_id: The user ID to remove.

        Raises:
            HTTPException 404: If the member is not found.
            HTTPException 400: If trying to remove the owner.
        """
        result = await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace.id,
                WorkspaceMember.user_id == user_id,
            )
        )
        membership = result.scalar_one_or_none()

        if membership is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Member not found in this workspace.",
            )

        if membership.role == WorkspaceRole.OWNER:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove the workspace owner.",
            )

        await db.delete(membership)
        await db.flush()

    @staticmethod
    async def change_member_role(
        db: AsyncSession,
        workspace: Workspace,
        user_id: str,
        role_data: ChangeRole,
    ) -> MemberResponse:
        """Change a member's role in the workspace.

        Args:
            db: Async database session.
            workspace: The workspace.
            user_id: The user ID whose role to change.
            role_data: The new role.

        Returns:
            Updated MemberResponse.

        Raises:
            HTTPException 404: If the member is not found.
            HTTPException 400: If trying to change the owner's role.
        """
        result = await db.execute(
            select(WorkspaceMember, User)
            .join(User, User.id == WorkspaceMember.user_id)
            .where(
                WorkspaceMember.workspace_id == workspace.id,
                WorkspaceMember.user_id == user_id,
            )
        )
        row = result.one_or_none()

        if row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Member not found in this workspace.",
            )

        membership, user = row

        if membership.role == WorkspaceRole.OWNER:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot change the workspace owner's role.",
            )

        membership.role = WorkspaceRole(role_data.role)
        await db.flush()
        await db.refresh(membership)

        return MemberResponse(
            id=membership.id,
            user_id=membership.user_id,
            workspace_id=membership.workspace_id,
            role=membership.role.value,
            email=user.email,
            full_name=user.full_name,
            avatar_url=user.avatar_url,
            invited_at=membership.invited_at,
            joined_at=membership.joined_at,
        )