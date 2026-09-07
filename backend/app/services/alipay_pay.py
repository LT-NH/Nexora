"""Nexora - Alipay Page Pay service (支付宝 AI 网页应用收款 / 电脑网站支付).

实现 alipay.trade.page.pay 服务端下单（返回自动提交的 HTML 表单）与异步通知 RSA2 验签。
- 生产凭据：ALIPAY_APP_ID / ALIPAY_APP_PRIVATE_KEY(PKCS#1 PEM) / ALIPAY_PUBLIC_KEY
- 可选沙箱：ALIPAY_GATEWAY 覆盖为 openapi-sandbox.dl.alipaydev.com + 沙箱密钥
- 凭据齐备（enabled）时走真实支付宝；否则保持 sandbox 模式（由 billing 统一降级模拟确认）。
签名算法 RSA2(SHA256withRSA)，与微信同用 cryptography，不引入额外依赖。
"""

import base64
import json
import time
import urllib.parse
from datetime import datetime
from pathlib import Path

from app.config import settings
from app.utils.logging import get_logger

logger = get_logger(__name__)

_GATEWAY_PRODUCT = "https://openapi.alipay.com/gateway.do"
_GATEWAY_SANDBOX = "https://openapi-sandbox.dl.alipaydev.com/gateway.do"


def alipay_enabled() -> bool:
    return bool(
        getattr(settings, "ALIPAY_APP_ID", "")
        and getattr(settings, "ALIPAY_APP_PRIVATE_KEY", "")
        and getattr(settings, "ALIPAY_PUBLIC_KEY", "")
    )


def _private_key_pem() -> bytes:
    key = str(settings.ALIPAY_APP_PRIVATE_KEY)
    # 支持直接 PEM 文本或文件路径
    if "-----BEGIN" in key:
        return key.encode("utf-8")
    return Path(key).read_bytes()


def _sign(params: dict) -> str:
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

    content = "&".join(f"{k}={v}" for k, v in sorted(params.items()) if v not in ("", None))
    key = serialization.load_pem_private_key(_private_key_pem(), password=None)
    sig = key.sign(content.encode("utf-8"), padding.PKCS1v15(), hashes.SHA256())
    return base64.b64encode(sig).decode("utf-8")


def verify_notify_sign(params: dict) -> bool:
    """异步通知验签：剔除 sign/sign_type 后按序拼接，用支付宝公钥 RSA2 验签。"""
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

    sign = params.get("sign", "")
    content = "&".join(
        f"{k}={v}" for k, v in sorted(params.items()) if v not in ("", None) and k != "sign"
    )
    pub_pem = str(settings.ALIPAY_PUBLIC_KEY)
    if "-----BEGIN" not in pub_pem:
        pub_pem = Path(pub_pem).read_text(encoding="utf-8")
    try:
        pub = serialization.load_pem_public_key(pub_pem.encode("utf-8"))
        pub.verify(
            base64.b64decode(sign), content.encode("utf-8"), padding.PKCS1v15(), hashes.SHA256(),
        )
        return True
    except (InvalidSignature, Exception):  # noqa: BLE001
        return False


def build_page_pay_form(out_trade_no: str, amount_yuan: float, subject: str, notify_url: str) -> str:
    """alipay.trade.page.pay 下单 → 返回自动提交的 HTML 表单（后端直返前端渲染）。"""
    gateway = str(getattr(settings, "ALIPAY_GATEWAY", "") or _GATEWAY_PRODUCT)
    params = {
        "app_id": str(settings.ALIPAY_APP_ID),
        "method": "alipay.trade.page.pay",
        "format": "JSON",
        "charset": "utf-8",
        "sign_type": "RSA2",
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "version": "1.0",
        "notify_url": notify_url,
        "return_url": notify_url.replace("/notify", "/return"),
        "biz_content": json.dumps({
            "out_trade_no": out_trade_no,
            "total_amount": f"{amount_yuan:.2f}",
            "subject": subject[:255],
            "product_code": "FAST_INSTANT_TRADE_PAY",
        }, ensure_ascii=False, separators=(",", ":")),
    }
    params["sign"] = _sign(params)
    inputs = "".join(
        f'<input type="hidden" name="{k}" value="{urllib.parse.quote(str(v), safe="")}"/>'
        for k, v in params.items()
    )
    return (
        '<form id="alipay_submit" name="punchout_form" method="post" '
        f'action="{gateway}?charset=utf-8">' + inputs +
        '<input type="submit" value="立即支付" style="display:none">'
        '</form><script>document.forms["punchout_form"].submit();</script>'
    )
