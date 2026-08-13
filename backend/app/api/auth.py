"""Nexora - Authentication API Routes.

Endpoints for user registration, login, token refresh, and profile.
"""

import os
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_active_user
from app.models.user import User
from app.schemas.user import (
    UserCreate,
    UserLogin,
    UserResponse,
    UserUpdate,
    TokenResponse,
    TokenRefreshRequest,
    PasswordReset,
    PasswordResetConfirm,
)
from app.services.auth import AuthService
from app.utils.security import hash_password, verify_password

router = APIRouter(prefix="/auth")


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
)
async def register(
    user_data: UserCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserResponse:
    """Register a new user account.

    - **email**: Must be a valid email address and not already registered.
    - **password**: 8-128 characters, must contain uppercase, lowercase, digit, and special character.
    - **full_name**: Display name for the user.
    """
    return await AuthService.register_user(db, user_data)


@router.post(
    "/login",
    summary="Login and get access tokens",
)
async def login(
    login_data: UserLogin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Any:
    """Authenticate with email and password to receive JWT tokens.

    - **access_token**: Short-lived token for API requests (Bearer).
    - **refresh_token**: Long-lived token to obtain new access tokens.
    - If 2FA is enabled and no totp_code provided, returns ``{"requires_2fa": true, "user_id": "..."}``.
    """
    return await AuthService.authenticate_user(db, login_data)


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh access token",
)
async def refresh_token(
    refresh_request: TokenRefreshRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    """Exchange a valid refresh token for a new access token and refresh token pair.

    - **refresh_token**: The refresh token received from login or previous refresh.
    """
    return await AuthService.refresh_access_token(db, refresh_request.refresh_token)


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current user profile",
)
async def get_me(
    current_user: Annotated[User, Depends(get_current_active_user)],
) -> UserResponse:
    """Return the profile of the currently authenticated user."""
    return UserResponse.model_validate(current_user)


@router.patch(
    "/me",
    response_model=UserResponse,
    summary="Update current user profile",
)
async def update_me(
    update_data: UserUpdate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserResponse:
    """Update the profile of the currently authenticated user."""
    return await AuthService.update_profile(db, current_user.id, update_data)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Logout (client-side)",
)
async def logout(
    current_user: Annotated[User, Depends(get_current_active_user)],
) -> None:
    """Logout endpoint.

    Note: JWT tokens are stateless. The client should discard the tokens.
    This endpoint exists for API completeness and audit logging purposes.
    """
    return None


@router.post(
    "/forgot-password",
    summary="Request password reset",
)
async def forgot_password(
    reset_data: PasswordReset,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Request a password reset link.

    In production, sends an email with the reset token.
    In development, returns the token directly.
    """
    return await AuthService.request_password_reset(db, reset_data.email)


@router.post(
    "/reset-password",
    summary="Confirm password reset",
)
async def reset_password(
    reset_data: PasswordResetConfirm,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Reset password using the token from the reset email."""
    return await AuthService.confirm_password_reset(
        db, reset_data.token, reset_data.new_password
    )


@router.post(
    "/upload-avatar",
    response_model=UserResponse,
    summary="Upload user avatar",
)
async def upload_avatar(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
) -> UserResponse:
    """Upload a profile avatar image. Max 2MB, PNG/JPG/WebP/GIF only."""
    # Validate file type
    allowed_types = {"image/png", "image/jpeg", "image/webp", "image/gif"}
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="仅支持 PNG、JPEG、WebP 和 GIF 格式的图片。",
        )

    # Validate file size (max 2MB)
    contents = await file.read()
    if len(contents) > 2 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="文件大小不能超过 2MB。",
        )

    # Save file
    try:
        upload_dir = os.path.join("uploads", "avatars", current_user.id)
        os.makedirs(upload_dir, exist_ok=True)

        ext = file.filename.split(".")[-1] if file.filename else "png"
        filename = f"avatar.{ext}"
        filepath = os.path.join(upload_dir, filename)

        with open(filepath, "wb") as f:
            f.write(contents)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"文件保存失败: {str(e)}")

    avatar_url = f"/uploads/avatars/{current_user.id}/{filename}"
    current_user.avatar_url = avatar_url
    await db.flush()
    await db.refresh(current_user)

    return UserResponse.model_validate(current_user)


@router.patch("/me/password", summary="Change password")
async def change_password(
    body: dict,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Change the password of the currently authenticated user."""
    current_pw = body.get("current_password")
    new_pw = body.get("new_password")
    if not current_pw or not new_pw:
        raise HTTPException(status_code=400, detail="需要当前密码和新密码")
    if not verify_password(current_pw, current_user.password_hash):
        raise HTTPException(status_code=400, detail="当前密码不正确")
    if len(new_pw) < 8:
        raise HTTPException(status_code=400, detail="新密码至少8位")
    current_user.password_hash = hash_password(new_pw)
    await db.flush()
    return {"message": "密码已更新"}


# ── 2FA Endpoints ────────────────────────────────────────────────────────

@router.get("/me/2fa/setup")
async def setup_2fa(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Generate TOTP secret and QR code for 2FA setup."""
    from app.services.totp import generate_totp_secret, get_totp_uri, generate_qr_code

    secret = generate_totp_secret(current_user)
    current_user.totp_secret = secret
    await db.flush()
    uri = get_totp_uri(current_user)
    qr = generate_qr_code(uri)
    return {"secret": secret, "qr_code": f"data:image/png;base64,{qr}", "uri": uri}


@router.post("/me/2fa/verify")
async def verify_2fa_endpoint(
    body: dict,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Verify TOTP code and enable 2FA."""
    from app.services.totp import verify_totp

    code = body.get("code", "")
    if verify_totp(current_user, code):
        current_user.totp_enabled = True
        await db.flush()
        return {"success": True, "message": "2FA已启用"}
    raise HTTPException(400, "验证码错误")


@router.post("/me/2fa/disable")
async def disable_2fa(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Disable 2FA for current user."""
    current_user.totp_enabled = False
    current_user.totp_secret = None
    await db.flush()
    return {"success": True}