"""Nexora - 平台接入元数据目录.

集中描述「每个平台要填什么凭证、能做到什么、资质门槛在哪」，
供 API 与前端共同消费。放在这里而不是散落在前端硬编码，
是为了让**前端的表单与操作入口自动跟随后端适配器能力变化**——
后端新增一个写能力，前端不必改代码就能显示对应按钮。
"""

from app.services.platforms import PLATFORM_REGISTRY, get_integration
from app.services.platforms.base import PlatformCapability

# 凭证字段的展示顺序（前端按此顺序渲染表单）
CREDENTIAL_FIELD_ORDER = ["store_url", "api_key", "api_secret", "access_token"]

# 各平台的资质门槛说明 —— **如实告知**，不让商家白填一遍才发现拿不到权限。
QUALIFICATION_NOTES: dict[str, str] = {
    "taobao": (
        "订单、退款等高阶接口需要**企业开发者资质**（营业执照 + 企业支付宝）。"
        "个人账号调用订单接口会返回「无接口权限」。"
        "回调地址必须 HTTPS 且完成 ICP 备案。"
    ),
    "jd": (
        "订单、库存、价格等商家私有接口**仅对企业开发者开放**，个人账号在控制台"
        "申请不到，调用返回「权限不足（code:2001）」。"
        "需完成企业认证并走店铺 OAuth2.0 授权。"
    ),
    "pdd": (
        "需**企业实名认证**、创建商用应用并申请权限包。"
        "订单收件人信息默认加密，需单独申请「订单加解密」权限才能拿到明文。"
    ),
    "douyin": (
        "需抖店开放平台开发者资质，商家在抖店后台授权应用后获取 access_token。"
    ),
    "shopify": "在 Shopify 后台创建自定义应用，授予 Admin API 权限后获取访问令牌。",
    "amazon": "需卖家账号并完成 SP-API 开发者注册（LWA + AWS SigV4 签名）。适配器尚未实现。",
    "sandbox": "离线测试环境，不需要任何平台凭证，用于演示与联调。",
    "other": "通用占位平台，请选择具体平台。",
}

# 平台中文名
PLATFORM_LABELS: dict[str, str] = {
    "taobao": "淘宝 / 天猫",
    "jd": "京东",
    "pdd": "拼多多",
    "douyin": "抖音（抖店）",
    "shopify": "Shopify",
    "amazon": "Amazon",
    "sandbox": "沙盒测试",
    "other": "其他",
}

# 需要填写的凭证字段（按平台差异裁剪，避免让人填无用字段）
_REQUIRED_FIELDS: dict[str, list[str]] = {
    "taobao": ["api_key", "api_secret", "access_token"],
    "jd": ["api_key", "api_secret", "access_token"],
    "pdd": ["api_key", "api_secret", "access_token"],
    "douyin": ["store_url", "api_key", "api_secret", "access_token"],
    "shopify": ["store_url", "access_token"],
    "sandbox": [],
    "amazon": ["api_key", "api_secret", "access_token"],
    "other": [],
}

# 页面上的凭证字段标签（不同平台叫法不同）
CREDENTIAL_LABELS: dict[str, dict[str, str]] = {
    "taobao": {
        "api_key": "AppKey",
        "api_secret": "AppSecret",
        "access_token": "SessionKey（卖家授权后获得）",
        "store_url": "店铺地址",
    },
    "jd": {
        "api_key": "AppKey",
        "api_secret": "AppSecret",
        "access_token": "AccessToken（店铺 OAuth 授权令牌）",
        "store_url": "店铺地址",
    },
    "pdd": {
        "api_key": "ClientID",
        "api_secret": "ClientSecret",
        "access_token": "AccessToken（店铺授权令牌）",
        "store_url": "店铺地址",
    },
}


def _is_implemented(platform: str) -> bool:
    """有专属适配器（非 GenericIntegration 桩）才算已实现。"""
    from app.services.platforms.generic import GenericIntegration

    cls = PLATFORM_REGISTRY.get(platform)
    return cls is not None and cls is not GenericIntegration


def _sandbox_supported(platform: str) -> bool:
    cls = PLATFORM_REGISTRY.get(platform)
    if cls is None:
        return False
    gateway = getattr(cls, "gateway_sandbox", "")
    return bool(gateway)


def platform_catalog() -> list[dict]:
    """返回全部平台的接入元数据（顺序稳定，供前端渲染下拉框）。"""
    order = ["taobao", "jd", "pdd", "douyin", "shopify", "sandbox", "amazon", "other"]
    catalog: list[dict] = []

    for platform in order:
        if platform not in PLATFORM_REGISTRY:
            continue
        integration = get_integration(platform)
        capabilities = (
            integration.capability_list()
            if integration
            else [PlatformCapability.READ.value]
        )
        fields = _REQUIRED_FIELDS.get(
            platform,
            [f for f in CREDENTIAL_FIELD_ORDER if f != "store_url"],
        )
        catalog.append(
            {
                "platform": platform,
                "label": PLATFORM_LABELS.get(platform, platform),
                "implemented": _is_implemented(platform),
                "capabilities": capabilities,
                "sandbox_supported": _sandbox_supported(platform),
                "credential_fields": fields,
                "credential_labels": CREDENTIAL_LABELS.get(platform, {}),
                "qualification_note": QUALIFICATION_NOTES.get(platform, ""),
            }
        )
    return catalog


def platform_metadata(platform: str) -> dict:
    """取单个平台的元数据（找不到返回空壳，不抛异常）。"""
    for item in platform_catalog():
        if item["platform"] == platform:
            return item
    return {}
