"""Nexora - Authentication API Routes.

Endpoints for user registration, login, token refresh, and profile.
"""

import os
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_active_user, security_scheme
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
from app.utils.logging import get_logger
from app.utils.redis import blacklist_token
from app.utils.security import get_token_jti, hash_password, verify_password
from app.utils.uploads import detect_image_extension, ensure_upload_dir, safe_upload_name

logger = get_logger(__name__)

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
    summary="Logout and revoke the current access token",
)
async def logout(
    current_user: Annotated[User, Depends(get_current_active_user)],
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(security_scheme)
    ] = None,
) -> None:
    """Logout endpoint.

    把当前 access token 的 jti 写入黑名单（TTL = 令牌剩余寿命），鉴权中间件
    据此立即拒绝该令牌。此前这里是空实现（仅注明「客户端自行丢弃」），
    配合 remember_me 曾签发的 30 天长寿命 token，等于一张不可撤销的全权凭证。

    注意：只吊销当前这一个令牌。若需要「全设备登出」，要引入用户级 token
    版本号（改动模型 + 迁移），已记入后续事项。
    """
    if credentials is not None:
        jti, ttl = get_token_jti(credentials.credentials)
        if jti and ttl > 0:
            await blacklist_token(jti, ttl)
            logger.info("Access token revoked for user %s (ttl=%ss)", current_user.id, ttl)
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
    # 第一层：快速拒绝「声明类型」明显不对的请求。它只用于早退，
    # 不作为安全依据 —— Content-Type 完全由客户端控制。
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

    # 第二层（权威判定）：按 magic bytes 识别类型，扩展名由服务端白名单决定。
    # 原实现取 `file.filename.split(".")[-1]` —— 上传 avatar.html 并把
    # Content-Type 伪造成 image/png，即可在同源 /uploads 下托管 HTML，
    # 用于钓鱼或窃取同域 localStorage 中的 access token。
    detected_ext = detect_image_extension(contents)
    if detected_ext is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="文件内容不是有效的 PNG/JPEG/WebP/GIF 图片。",
        )

    # Save file
    try:
        upload_dir = ensure_upload_dir("avatars", current_user.id)
        filename = safe_upload_name("avatar", detected_ext)
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