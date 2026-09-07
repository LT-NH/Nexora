"""Nexora - Application Configuration.

Uses pydantic-settings to load configuration from environment variables
with sensible defaults for local development.
"""

import secrets
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Environment
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Database
    # SQLite for local development; PostgreSQL for production.
    # For production, use: postgresql+asyncpg://user:pass@host:5432/dbname
    DATABASE_URL: str = "sqlite+aiosqlite:///./data/nexora.db"

    # Security
    SECRET_KEY: str = "change-me-in-production-use-a-strong-random-secret-key"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # WeChat Pay Native v3（可选）。凭据齐备 = 真实微信通道；未配置 = sandbox 模式。
    WXPAY_APPID: str = ""
    WXPAY_MCHID: str = ""
    WXPAY_MCH_SERIAL_NO: str = ""
    WXPAY_APIV3_KEY: str = ""
    WXPAY_PRIVATE_KEY_PATH: str = ""
    WXPAY_NOTIFY_URL: str = ""  # 回调地址；空则用 PUBLIC_BASE_URL 拼装
    # Alipay Page Pay（电脑网站支付 / AI 网页应用收款）。凭据齐备走真实支付宝；否则 sandbox 演示。
    ALIPAY_APP_ID: str = ""
    ALIPAY_APP_PRIVATE_KEY: str = ""  # PKCS#1 PEM 文本或文件路径
    ALIPAY_PUBLIC_KEY: str = ""       # 支付宝公钥 PEM 文本或文件路径
    ALIPAY_GATEWAY: str = ""          # 空=生产网关；沙箱可指 openapi-sandbox.dl.alipaydev.com
    ALIPAY_NOTIFY_URL: str = ""       # 异步通知；空则用 PUBLIC_BASE_URL 拼装
    PUBLIC_BASE_URL: str = "http://127.0.0.1:8000"  # 公网基址（回调/二维码拼装用）

    # Metrics endpoint auth. When set, the Prometheus /metrics endpoint
    # requires `Authorization: Bearer <METRICS_TOKEN>`. Empty = open (dev).
    METRICS_TOKEN: str = ""

    # Field-level encryption key for sensitive database columns
    # (store api_secret, access_token, etc.).
    # When empty, a derived key is computed from SECRET_KEY — acceptable
    # for development, but production MUST set a dedicated value.
    ENCRYPTION_KEY: str = ""

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8000",
    ]

    # Public site URL used for building absolute links in emails/reports.
    SITE_URL: str = "http://localhost:3000"

    # Email notifications (SMTP)
    SMTP_SERVER: str = "smtp.qq.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    FROM_EMAIL: str = ""

    # Logging
    LOG_LEVEL: str = "INFO"

    # Redis (caching, rate limiting, token blacklist)
    REDIS_URL: str = "redis://localhost:6379/0"

    # Rate Limiting
    RATE_LIMIT_REQUESTS: int = 100
    RATE_LIMIT_WINDOW_SECONDS: int = 60

    # Inbound webhooks
    # Shared secret used to verify Shopify webhook signatures
    # (X-Shopify-Hmac-Sha256). Configure this to match the secret set in
    # your Shopify app's webhook settings.
    SHOPIFY_WEBHOOK_SECRET: str = ""

    # Qwen (通义千问) AI API
    # Get a free key at https://dashscope.console.aliyun.com
    QWEN_API_KEY: str = ""
    QWEN_MODEL: str = "qwen-plus"
    QWEN_BASE_URL: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"

    @property
    def cors_origins_list(self) -> List[str]:
        """Return CORS origins as a list, handling comma-separated env var."""
        return self.CORS_ORIGINS

    @property
    def encryption_key(self) -> str:
        """Return the effective encryption key.

        When ENCRYPTION_KEY is not explicitly configured, derive a
        deterministic key from SECRET_KEY.  This ensures development
        works out of the box, while production deployments should set a
        dedicated ENCRYPTION_KEY.
        """
        if self.ENCRYPTION_KEY:
            return self.ENCRYPTION_KEY
        # Derive from SECRET_KEY for zero-config dev experience
        return f"nexora-fernet-{self.SECRET_KEY}"

    def validate_critical_secrets(self) -> List[str]:
        """Return a list of warnings about weak / default secrets.

        Called during application startup to surface configuration
        issues before they cause security problems in production.
        """
        warnings: List[str] = []
        weak_keys = (
            "change-me",
            "change_me",
            "your-secret-key",
            "<your",
            "please-change",
        )
        if any(marker in self.SECRET_KEY.lower() for marker in weak_keys):
            warnings.append(
                "SECRET_KEY is using a weak / default value. "
                "Generate a strong random key for production."
            )
        if len(self.SECRET_KEY) < 32:
            warnings.append(
                "SECRET_KEY is too short (minimum 32 characters recommended)."
            )
        return warnings


settings = Settings()