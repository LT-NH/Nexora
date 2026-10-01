"""Nexora - Security Utilities.

Provides password hashing, JWT token management, and API key generation.
"""

import asyncio
import hashlib
import secrets
import string
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from app.config import settings


def hash_password(password: str) -> str:
    """Hash a plain-text password using bcrypt.

    Args:
        password: The plain-text password to hash.

    Returns:
        The bcrypt hashed password string.
    """
    password_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain-text password against a bcrypt hash.

    Args:
        plain_password: The plain-text password to verify.
        hashed_password: The bcrypt hash to compare against.

    Returns:
        True if the password matches, False otherwise.
    """
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8"),
    )


async def hash_password_async(password: str) -> str:
    """Hash a password without blocking the event loop.

    Wraps the synchronous :func:`hash_password` (bcrypt) in a worker
    thread via :func:`asyncio.to_thread`.
    """
    return await asyncio.to_thread(hash_password, password)


async def verify_password_async(plain: str, hashed: str) -> bool:
    """Verify a password without blocking the event loop.

    Wraps the synchronous :func:`verify_password` (bcrypt) in a worker
    thread via :func:`asyncio.to_thread`.
    """
    return await asyncio.to_thread(verify_password, plain, hashed)


def create_access_token(
    subject: str,
    extra_claims: dict | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    """Create a JWT access token.

    Args:
        subject: The subject claim (typically user ID).
        extra_claims: Additional claims to include in the token.
        expires_delta: Custom expiration delta. Defaults to settings value.

    Returns:
        Encoded JWT access token string.
    """
    if expires_delta is None:
        expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    now = datetime.now(timezone.utc)
    to_encode: dict = {
        "sub": subject,
        "iat": now,
        "exp": now + expires_delta,
        "type": "access",
        # jti 是吊销机制的锚点：登出 / 改密时把 jti 写入 Redis 黑名单，
        # 鉴权中间件据此拒绝仍在有效期内的旧令牌。
        "jti": uuid.uuid4().hex,
    }
    if extra_claims:
        to_encode.update(extra_claims)

    return jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def create_refresh_token(
    subject: str,
    expires_delta: timedelta | None = None,
) -> str:
    """Create a JWT refresh token.

    Args:
        subject: The subject claim (typically user ID).
        expires_delta: Custom expiration delta. Defaults to settings value.

    Returns:
        Encoded JWT refresh token string.
    """
    if expires_delta is None:
        expires_delta = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    now = datetime.now(timezone.utc)
    to_encode: dict = {
        "sub": subject,
        "iat": now,
        "exp": now + expires_delta,
        "type": "refresh",
        "jti": uuid.uuid4().hex,
    }

    return jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def decode_token(token: str) -> dict | None:
    """Decode and validate a JWT token.

    Args:
        token: The JWT token string to decode.

    Returns:
        The decoded token payload as a dict, or None if invalid/expired.
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return payload
    except JWTError:
        return None


def get_token_jti(token: str) -> tuple[str | None, int]:
    """Extract the JWT ID and its remaining lifetime from an encoded token.

    Args:
        token: The encoded JWT string.

    Returns:
        ``(jti, ttl_seconds)``；令牌无效/已过期或没有 ``jti`` 声明时返回
        ``(None, 0)``。TTL 用于决定黑名单条目的存活时间 —— 令牌本身过期后
        就无需再吊销了。
    """
    payload = decode_token(token)
    if not payload:
        return None, 0
    jti = payload.get("jti")
    if not isinstance(jti, str) or not jti:
        return None, 0
    exp = payload.get("exp")
    ttl = 0
    if isinstance(exp, (int, float)):
        ttl = max(0, int(exp - datetime.now(timezone.utc).timestamp()))
    return jti, ttl


def generate_api_key() -> str:
    """Generate a cryptographically secure API key.

    Returns a 48-character alphanumeric string prefixed with 'sf_'.

    Returns:
        A raw API key string (e.g., 'sf_a1b2c3...').
    """
    alphabet = string.ascii_letters + string.digits
    random_part = "".join(secrets.choice(alphabet) for _ in range(48))
    return f"sf_{random_part}"


def hash_api_key(api_key: str) -> str:
    """Hash an API key using SHA-256.

    Args:
        api_key: The raw API key string.

    Returns:
        The SHA-256 hex digest of the API key.
    """
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()