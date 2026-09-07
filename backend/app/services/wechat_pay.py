"""Nexora - WeChat Pay Native (v3) service.

微信 Native 扫码支付。两种模式：
- 生产模式：WXPAY_* 凭据齐备时，走真实微信 v3 下单（RSA-SHA256 请求签名）与回调验签解密；
- sandbox 模式：凭据未配置时，生成 weixin://wxpay/sandbox-* 形式的 code_url，
  并允许 sandbox-confirm 端点模拟支付成功（仅用于开发/演示，生产凭据就绪即自动切换真实通道）。

凭据（全部走环境变量，不落代码）：
    WXPAY_APPID / WXPAY_MCHID / WXPAY_MCH_SERIAL_NO / WXPAY_APIV3_KEY / WXPAY_PRIVATE_KEY_PATH
    WXPAY_NOTIFY_URL（可选，默认按 public_base_url 拼装）
"""

import base64
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings
from app.utils.logging import get_logger

logger = get_logger(__name__)

_REQUIRED_KEYS = ("WXPAY_APPID", "WXPAY_MCHID", "WXPAY_MCH_SERIAL_NO", "WXPAY_APIV3_KEY", "WXPAY_PRIVATE_KEY_PATH")


def wechat_enabled() -> bool:
    """凭据是否齐备（齐备 = 真实微信通道；否则 sandbox）。"""
    return all(getattr(settings, k, None) for k in _REQUIRED_KEYS) and Path(
        str(settings.WXPAY_PRIVATE_KEY_PATH or "")
    ).exists()


def _new_out_trade_no() -> str:
    return f"NEX{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}{uuid.uuid4().hex[:8].upper()}"


def _rsa_sign(message: str, private_key_pem: bytes) -> str:
    """微信 v3 请求签名：SHA256withRSA → base64。"""
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

    key = serialization.load_pem_private_key(private_key_pem, password=None)
    sig = key.sign(message.encode("utf-8"), padding.PKCS1v15(), hashes.SHA256())
    return base64.b64encode(sig).decode()


async def create_native_order(amount_yuan: float, description: str, notify_url: str) -> dict:
    """创建 Native 支付订单，返回 {code_url, out_trade_no, sandbox}。"""
    out_trade_no = _new_out_trade_no()

    if not wechat_enabled():
        # sandbox 模式：不调微信，生成可识别的模拟 code_url
        code_url = f"weixin://wxpay/sandbox-{out_trade_no}"
        logger.warning("wxpay SANDBOX mode: order %s (no credentials configured)", out_trade_no)
        return {"code_url": code_url, "out_trade_no": out_trade_no, "sandbox": True}

    import httpx as _httpx

    appid = settings.WXPAY_APPID
    mchid = settings.WXPAY_MCHID
    serial = settings.WXPAY_MCH_SERIAL_NO
    key_path = Path(str(settings.WXPAY_PRIVATE_KEY_PATH))
    amount_fen = int(round(float(amount_yuan) * 100))

    body = {
        "appid": appid,
        "mchid": mchid,
        "description": description[:127],
        "out_trade_no": out_trade_no,
        "notify_url": notify_url,
        "amount": {"total": amount_fen, "currency": "CNY"},
    }
    url = "https://api.mch.weixin.qq.com/v3/pay/transactions/native"
    message = f"POST\n{url.split('https://api.mch.weixin.qq.com')[0]}\n{int(datetime.now(timezone.utc).timestamp())}\n{uuid.uuid4().hex}\n{json.dumps(body, ensure_ascii=False)}\n"
    signature = _rsa_sign(message, key_path.read_bytes())
    authorization = (
        f'WECHATPAY2-SHA256-RSA2048 mchid="{mchid}",nonce_str="{uuid.uuid4().hex}",'
        f'signature="{signature}",timestamp="{int(datetime.now(timezone.utc).timestamp())}",serial_no="{serial}"'
    )
    async with _httpx.AsyncClient(timeout=15, trust_env=False) as client:
        resp = await client.post(
            url,
            json=body,
            headers={"Authorization": authorization, "Content-Type": "application/json", "Accept": "application/json"},
        )
    if resp.status_code != 200:
        logger.error("wxpay native failed %s: %s", resp.status_code, resp.text[:300])
        raise RuntimeError(f"微信下单失败({resp.status_code})：{resp.text[:120]}")
    code_url = resp.json().get("code_url")
    if not code_url:
        raise RuntimeError("微信下单未返回 code_url")
    return {"code_url": code_url, "out_trade_no": out_trade_no, "sandbox": False}


def verify_and_decrypt_notify(headers_dict: dict, body: bytes) -> dict:
    """验签并解密支付回调（真实模式）。成功返回 {"out_trade_no":..., "transaction_id":...}。

    说明：完整平台证书验签需缓存微信平台证书（/v3/certificates 下载 + 轮换），
    当前实现先做 APIv3 key 的 AES-GCM 解密 + 必要字段校验；平台证书验签在
    凭据配置完整后补齐（sandbox→真实切换的 checklist 项）。
    """
    import os
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    api_v3_key = str(settings.WXPAY_APIV3_KEY or "")
    if not api_v3_key:
        raise RuntimeError("sandbox 模式无回调")
    payload = json.loads(body.decode("utf-8"))
    resource = payload.get("resource") or {}
    nonce = resource.get("nonce")
    ciphertext = resource.get("ciphertext")
    associated = resource.get("associated_data") or ""
    if not nonce or not ciphertext:
        raise RuntimeError("回调缺少 resource 字段")
    aes = AESGCM(api_v3_key.encode("utf-8"))
    plain = aes.decrypt(
        nonce.encode("utf-8"),
        base64.b64decode(ciphertext),
        associated.encode("utf-8") or None,
    )
    data = json.loads(plain.decode("utf-8"))
    if data.get("trade_state") != "SUCCESS":
        raise RuntimeError(f"trade_state={data.get('trade_state')}")
    return {"out_trade_no": data.get("out_trade_no"), "transaction_id": data.get("transaction_id")}
