"""Nexora - Authentication Service.

Handles user registration, login, token refresh, and profile management.
"""

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember, WorkspaceRole
from app.schemas.user import UserCreate, UserLogin, UserResponse, UserUpdate, TokenResponse
from app.utils.logging import get_logger
from app.utils.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)

logger = get_logger(__name__)


class AuthService:
    """Service for authentication-related business logic."""

    @staticmethod
    async def register_user(
        db: AsyncSession,
        user_data: UserCreate,
    ) -> UserResponse:
        """Register a new user account.

        Args:
            db: Async database session.
            user_data: Registration data including email, password, and name.

        Returns:
            The created user as a UserResponse.

        Raises:
            HTTPException 409: If the email is already registered.
        """
        # Check if email already exists
        result = await db.execute(
            select(User).where(User.email == user_data.email.lower().strip())
        )
        existing = result.scalar_one_or_none()
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A user with this email already exists.",
            )

        user = User(
            email=user_data.email.lower().strip(),
            password_hash=hash_password(user_data.password),
            full_name=user_data.full_name.strip(),
        )
        db.add(user)
        await db.flush()
        await db.refresh(user)

        # Auto-create a default workspace for the new user (owner role)
        base_slug = f"my-workspace-{user.id[:8]}"
        slug = base_slug
        # Avoid slug collisions by appending a short suffix if needed
        slug_suffix = 1
        while True:
            existing_ws = await db.execute(
                select(Workspace).where(Workspace.slug == slug)
            )
            if existing_ws.scalar_one_or_none() is None:
                break
            slug = f"{base_slug}-{slug_suffix}"
            slug_suffix += 1

        workspace = Workspace(
            name=f"{user.full_name}的工作空间",
            slug=slug,
        )
        db.add(workspace)
        await db.flush()

        membership = WorkspaceMember(
            workspace_id=workspace.id,
            user_id=user.id,
            role=WorkspaceRole.OWNER,
            joined_at=datetime.now(timezone.utc),
        )
        db.add(membership)
        await db.flush()
        logger.info(
            "Default workspace created for user %s: %s", user.email, workspace.slug
        )

        # Audit log: user registered (global event, no workspace_id)
        from app.api.deps import create_audit_log

        await create_audit_log(
            db=db,
            workspace_id=None,
            user_id=user.id,
            action="user.registered",
            resource_type="user",
            resource_id=user.id,
            details={"email": user.email, "full_name": user.full_name},
        )

        logger.info("User registered: %s", user.email)
        return UserResponse.model_validate(user)

    @staticmethod
    async def authenticate_user(
        db: AsyncSession,
        login_data: UserLogin,
    ) -> TokenResponse:
        """Authenticate a user with email and password.

        Args:
            db: Async database session.
            login_data: Login credentials.

        Returns:
            TokenResponse with access and refresh tokens.

        Raises:
            HTTPException 401: If credentials are invalid.
        """
        result = await db.execute(
            select(User).where(User.email == login_data.email.lower().strip())
        )
        user = result.scalar_one_or_none()

        if user is None or not verify_password(login_data.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is deactivated.",
            )

        # Update last_login_at
        user.last_login_at = datetime.now(timezone.utc)
        await db.flush()

        # Audit log: user logged in (global event, no workspace_id)
        from app.api.deps import create_audit_log

        await create_audit_log(
            db=db,
            workspace_id=None,
            user_id=user.id,
            action="user.login",
            resource_type="user",
            resource_id=user.id,
            details={"email": user.email},
        )

        access_token = create_access_token(
            subject=user.id,
            expires_delta=timedelta(days=30) if login_data.remember_me else None,
        )
        refresh_token = create_refresh_token(
            subject=user.id,
            expires_delta=timedelta(days=90) if login_data.remember_me else None,
        )

        logger.info("User authenticated: %s", user.email)
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )

    @staticmethod
    async def refresh_access_token(
        db: AsyncSession,
        refresh_token_str: str,
    ) -> TokenResponse:
        """Refresh an access token using a valid refresh token.

        Args:
            db: Async database session.
            refresh_token_str: The refresh token string.

        Returns:
            TokenResponse with a new access token and refresh token.

        Raises:
            HTTPException 401: If the refresh token is invalid or expired.
        """
        payload = decode_token(refresh_token_str)

        if payload is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired refresh token.",
            )

        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type. Expected a refresh token.",
            )

        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload.",
            )

        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if user is None or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or deactivated.",
            )

        access_token = create_access_token(subject=user.id)
        new_refresh_token = create_refresh_token(subject=user.id)

        return TokenResponse(
            access_token=access_token,
            refresh_token=new_refresh_token,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )

    @staticmethod
    async def get_user_profile(
        db: AsyncSession,
        user_id: str,
    ) -> UserResponse:
        """Get a user's profile by ID.

        Args:
            db: Async database session.
            user_id: The user ID.

        Returns:
            UserResponse for the requested user.

        Raises:
            HTTPException 404: If the user is not found.
        """
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found.",
            )

        return UserResponse.model_validate(user)

    @staticmethod
    async def update_profile(
        db: AsyncSession,
        user_id: str,
        update_data: UserUpdate,
    ) -> UserResponse:
        """Update a user's profile information.

        Args:
            db: Async database session.
            user_id: The user ID.
            update_data: Fields to update.

        Returns:
            Updated UserResponse.

        Raises:
            HTTPException 404: If the user is not found.
        """
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found.",
            )

        if update_data.full_name is not None:
            user.full_name = update_data.full_name.strip()
        if update_data.avatar_url is not None:
            user.avatar_url = update_data.avatar_url
        if update_data.phone is not None:
            user.phone = update_data.phone
        if update_data.bio is not None:
            user.bio = update_data.bio

        await db.flush()
        await db.refresh(user)

        logger.info("User profile updated: %s", user.email)
        return UserResponse.model_validate(user)

    @staticmethod
    async def request_password_reset(
        db: AsyncSession,
        email: str,
    ) -> dict:
        """Request a password reset token.

        Returns a dict with message and (in dev) the token.
        """
        result = await db.execute(
            select(User).where(User.email == email.lower().strip())
        )
        user = result.scalar_one_or_none()

        if user is None:
            # Return success even if user not found (security best practice)
            return {"message": "If the email is registered, a reset link has been sent."}

        reset_token = create_access_token(
            subject=user.id,
            extra_claims={"type": "password_reset"},
            expires_delta=timedelta(minutes=30),
        )

        logger.info("Password reset requested for user: %s", user.email)
        response: dict = {
            "message": "If the email is registered, a reset link has been sent.",
        }
        # Only return the reset_token in development / debug mode.
        # In production, the token should be delivered via a secure channel (e.g. email).
        if settings.DEBUG or settings.ENVIRONMENT == "development":
            response["reset_token"] = reset_token
        return response

    @staticmethod
    async def confirm_password_reset(
        db: AsyncSession,
        token: str,
        new_password: str,
    ) -> dict:
        """Confirm password reset with token."""
        payload = decode_token(token)
        if payload is None or payload.get("type") != "password_reset":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired reset token.",
            )

        user_id = payload.get("sub")
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if user is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User not found.",
            )

        user.password_hash = hash_password(new_password)
        await db.flush()

        logger.info("Password reset completed for user: %s", user.email)
        return {"message": "Password has been reset successfully."}