"""Nexora - Application Configuration.

Uses pydantic-settings to load configuration from environment variables
with sensible defaults for local development.
"""

import secrets
from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict

from app.version import APP_VERSION as _APP_VERSION

# .env 必须用**绝对路径**解析。
# 默认值 ".env" 是相对**当前工作目录**的 —— 只要不是从 backend/ 目录启动
# （例如从仓库根启动 uvicorn、systemd 配了别的 WorkingDirectory、
# 或在别的目录跑脚本），.env 就**静默不加载**：AI Key 变空、base_url 回落
# 到默认值，表现为「模型全部不可用」而看不出原因。实测踩过这个坑。
_BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=str(_BACKEND_DIR / ".env"),
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

    # 是否在 /auth/forgot-password 响应里回显密码重置令牌。
    # 仅供本地联调（没有邮件通道时）使用，**默认关闭**。
    # 此前判断条件是 `DEBUG or ENVIRONMENT == "development"`，而这两个配置的默认值
    # 恰好都是宽松的 —— 部署时只要忘记显式设置，就会向任意邮箱泄露重置令牌，
    # 攻击者拿到即可直接接管账号。改为显式开关，让「忘记配置」落在安全的一侧。
    EXPOSE_RESET_TOKEN: bool = False

    # WeChat Pay Native v3（可选）。凭据齐备 = 真实微信通道；未配置 = sandbox 模式。
    WXPAY_APPID: str = ""
    WXPAY_MCHID: str = ""
    WXPAY_MCH_SERIAL_NO: str = ""
    WXPAY_APIV3_KEY: str = ""
    WXPAY_PRIVATE_KEY_PATH: str = ""
    # 微信平台证书（用于回调验签）。留空则自动调用 /v3/certificates 下载并缓存 12 小时；
    # 内网/离线部署可显式指定证书文件路径。
    WXPAY_PLATFORM_CERT_PATH: str = ""
    WXPAY_NOTIFY_URL: str = ""  # 回调地址；空则用 PUBLIC_BASE_URL 拼装
    # Alipay Page Pay（电脑网站支付 / AI 网页应用收款）。凭据齐备走真实支付宝；否则 sandbox 演示。
    ALIPAY_APP_ID: str = ""
    ALIPAY_APP_PRIVATE_KEY: str = ""  # PKCS#1 PEM 文本或文件路径
    ALIPAY_PUBLIC_KEY: str = ""       # 支付宝公钥 PEM 文本或文件路径
    ALIPAY_GATEWAY: str = ""          # 空=生产网关；沙箱可指 openapi-sandbox.dl.alipaydev.com
    ALIPAY_NOTIFY_URL: str = ""       # 异步通知；空则用 PUBLIC_BASE_URL 拼装

    # 错误监控（Sentry）：留空则不启用（本地开发零依赖无副作用）
    SENTRY_DSN: str = ""
    SENTRY_ENV: str = "development"
    SENTRY_TRACES_SAMPLE_RATE: float = 0.1

    # 产品版本：唯一来源是 app/version.py（它的权威来源又是前端 Changelog.tsx）。
    # 不要在这里写死字符串 —— 曾经三处硬编码全部漂移在旧版本上。
    APP_VERSION: str = _APP_VERSION
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