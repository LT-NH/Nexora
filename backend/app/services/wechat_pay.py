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
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings
from app.utils.logging import get_logger

logger = get_logger(__name__)

_REQUIRED_KEYS = ("WXPAY_APPID", "WXPAY_MCHID", "WXPAY_MCH_SERIAL_NO", "WXPAY_APIV3_KEY", "WXPAY_PRIVATE_KEY_PATH")

# 回调验签参数
_NOTIFY_MAX_TIMESTAMP_DRIFT_SECONDS = 300   # 时间戳容忍漂移 ±5 分钟（防重放）
_NOTIFY_NONCE_TTL_SECONDS = 600             # nonce 去重窗口
_PLATFORM_CERT_TTL_SECONDS = 12 * 3600      # 平台证书缓存 12 小时

# 微信平台证书缓存：serial_no -> PEM 字节。回调验签必须用**平台证书公钥**，
# 不是商户私钥 —— 商户私钥只用于给请求签名。
_platform_certs: dict[str, bytes] = {}
_platform_certs_fetched_at: float = 0.0


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


def _build_authorization(method: str, url_path: str, body: str) -> str:
    """构造微信 v3 的 Authorization 头（WECHATPAY2-SHA256-RSA2048）。

    签名串恰好 5 行、每行以换行符结尾：method、url_path、timestamp、
    nonce_str、body。其中 ``url_path`` 必须是**不含域名**的路径（含 query）。
    """
    mchid = str(settings.WXPAY_MCHID)
    serial = str(settings.WXPAY_MCH_SERIAL_NO)
    key_path = Path(str(settings.WXPAY_PRIVATE_KEY_PATH))
    nonce = uuid.uuid4().hex
    timestamp = str(int(datetime.now(timezone.utc).timestamp()))
    message = f"{method}\n{url_path}\n{timestamp}\n{nonce}\n{body}\n"
    signature = _rsa_sign(message, key_path.read_bytes())
    return (
        f'WECHATPAY2-SHA256-RSA2048 mchid="{mchid}",nonce_str="{nonce}",'
        f'signature="{signature}",timestamp="{timestamp}",serial_no="{serial}"'
    )


def _aesgcm_decrypt(api_v3_key: str, nonce: str, ciphertext_b64: str, associated: str) -> bytes:
    """用 APIv3 key 做 AES-256-GCM 解密（回调 resource 与平台证书都用它）。"""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    aes = AESGCM(api_v3_key.encode("utf-8"))
    return aes.decrypt(
        nonce.encode("utf-8"),
        base64.b64decode(ciphertext_b64),
        associated.encode("utf-8") or None,
    )


def _verify_with_cert(cert_pem: bytes, message: str, signature_b64: str) -> bool:
    """用平台证书公钥验证 SHA256-RSA 签名。"""
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import padding

    try:
        public_key = x509.load_pem_x509_certificate(cert_pem).public_key()
        public_key.verify(
            base64.b64decode(signature_b64),
            message.encode("utf-8"),
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        return True
    except Exception:
        return False


async def _load_platform_certs(force: bool = False) -> dict[str, bytes]:
    """获取微信平台证书（serial_no -> PEM 字节）。

    优先使用显式配置的 ``WXPAY_PLATFORM_CERT_PATH``（便于内网 / 离线部署）；
    否则调用 ``GET /v3/certificates`` 下载，用 APIv3 key 解密后缓存 12 小时。
    """
    global _platform_certs, _platform_certs_fetched_at

    manual_path = str(getattr(settings, "WXPAY_PLATFORM_CERT_PATH", "") or "")
    if manual_path and Path(manual_path).exists():
        return {"manual": Path(manual_path).read_bytes()}

    if (
        not force
        and _platform_certs
        and (time.time() - _platform_certs_fetched_at) < _PLATFORM_CERT_TTL_SECONDS
    ):
        return _platform_certs

    import httpx as _httpx

    url_path = "/v3/certificates"
    authorization = _build_authorization("GET", url_path, "")
    async with _httpx.AsyncClient(timeout=15, trust_env=False) as client:
        resp = await client.get(
            f"https://api.mch.weixin.qq.com{url_path}",
            headers={"Authorization": authorization, "Accept": "application/json"},
        )
    if resp.status_code != 200:
        raise RuntimeError(f"获取微信平台证书失败({resp.status_code})：{resp.text[:120]}")

    api_v3_key = str(settings.WXPAY_APIV3_KEY or "")
    certs: dict[str, bytes] = {}
    for item in resp.json().get("data", []) or []:
        enc = item.get("encrypt_certificate") or {}
        try:
            plain = _aesgcm_decrypt(
                api_v3_key,
                str(enc.get("nonce") or ""),
                str(enc.get("ciphertext") or ""),
                str(enc.get("associated_data") or ""),
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("平台证书解密失败: %s", exc)
            continue
        serial = str(item.get("serial_no") or "")
        if serial:
            certs[serial] = plain

    if not certs:
        raise RuntimeError("微信平台证书为空")

    _platform_certs = certs
    _platform_certs_fetched_at = time.time()
    logger.info("已加载 %d 张微信平台证书用于回调验签", len(certs))
    return certs


async def _claim_notify_nonce(nonce: str) -> bool:
    """占用一个回调 nonce，返回 True 表示首次出现（未重放）。

    Redis 不可用时返回 True（放行）—— 与令牌黑名单同样的取舍：缓存故障
    不应阻断真实支付回调，代价是重放防护暂时退化。
    """
    from app.utils.redis import get_redis

    try:
        client = await get_redis()
        claimed = await client.set(
            f"wxnotify:{nonce}", "1", nx=True, ex=_NOTIFY_NONCE_TTL_SECONDS
        )
        return bool(claimed)
    except Exception:
        return True


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
    amount_fen = int(round(float(amount_yuan) * 100))

    body = {
        "appid": appid,
        "mchid": mchid,
        "description": description[:127],
        "out_trade_no": out_trade_no,
        "notify_url": notify_url,
        "amount": {"total": amount_fen, "currency": "CNY"},
    }
    url_path = "/v3/pay/transactions/native"
    url = f"https://api.mch.weixin.qq.com{url_path}"
    # 签名用的 body 必须与实际发出的字节完全一致：先序列化一次，再用 content=
    # 原样发送（原先用 json=body 让 httpx 再序列化一次，一旦分隔符或编码有差异
    # 就会签名不匹配）。
    body_str = json.dumps(body, ensure_ascii=False)
    # 注意：签名串第二行必须是「不含域名的 URL 路径」。原实现写作
    # url.split('https://api.mch.weixin.qq.com')[0]，取到的是空串 ——
    # 微信会一律判签名错误，真实微信通道其实从未跑通。
    authorization = _build_authorization("POST", url_path, body_str)
    async with _httpx.AsyncClient(timeout=15, trust_env=False) as client:
        resp = await client.post(
            url,
            content=body_str.encode("utf-8"),
            headers={"Authorization": authorization, "Content-Type": "application/json", "Accept": "application/json"},
        )
    if resp.status_code != 200:
        logger.error("wxpay native failed %s: %s", resp.status_code, resp.text[:300])
        raise RuntimeError(f"微信下单失败({resp.status_code})：{resp.text[:120]}")
    code_url = resp.json().get("code_url")
    if not code_url:
        raise RuntimeError("微信下单未返回 code_url")
    return {"code_url": code_url, "out_trade_no": out_trade_no, "sandbox": False}


async def verify_and_decrypt_notify(headers_dict: dict, body: bytes) -> dict:
    """验签并解密支付回调（真实模式）。

    成功返回 ``{"out_trade_no":..., "transaction_id":...}``。

    验签链（缺一不可）：
      1. 时间戳漂移 ±5 分钟 —— 防重放
      2. ``Wechatpay-Signature`` 用**微信平台证书公钥**验签（SHA256-RSA）
      3. nonce 去重（Redis，10 分钟窗口）
      4. APIv3 key 做 AES-256-GCM 解密 ``resource``

    此前只做了第 4 步：回调的真实性完全依赖 APIV3_KEY 的保密性，既无法识别
    伪造（拿到 key 即可构造 SUCCESS），也无法识别重放。
    """
    api_v3_key = str(settings.WXPAY_APIV3_KEY or "")
    if not api_v3_key:
        raise RuntimeError("sandbox 模式无回调")

    # 微信回调头的大小写不固定，统一按小写查找
    lowered = {str(k).lower(): v for k, v in (headers_dict or {}).items()}
    ts_raw = str(lowered.get("wechatpay-timestamp") or "")
    nonce_hdr = str(lowered.get("wechatpay-nonce") or "")
    signature = str(lowered.get("wechatpay-signature") or "")
    serial = str(lowered.get("wechatpay-serial") or "")
    if not ts_raw or not nonce_hdr or not signature:
        raise RuntimeError("回调缺少验签头（Wechatpay-Timestamp / Nonce / Signature）")

    # ── 1. 时间戳漂移 ──────────────────────────────────────────────
    try:
        ts = int(ts_raw)
    except (TypeError, ValueError) as exc:
        raise RuntimeError("回调时间戳非法") from exc
    drift = abs(int(datetime.now(timezone.utc).timestamp()) - ts)
    if drift > _NOTIFY_MAX_TIMESTAMP_DRIFT_SECONDS:
        raise RuntimeError(f"回调时间戳超出容忍范围（漂移 {drift}s）")

    # ── 2. 平台证书验签 ────────────────────────────────────────────
    certs = await _load_platform_certs()
    message = f"{ts_raw}\n{nonce_hdr}\n{body.decode('utf-8')}\n"
    candidates = [certs[serial]] if (serial and serial in certs) else list(certs.values())
    if not any(_verify_with_cert(c, message, signature) for c in candidates):
        raise RuntimeError("回调签名验证失败")

    # ── 3. nonce 去重 ─────────────────────────────────────────────
    if not await _claim_notify_nonce(nonce_hdr):
        raise RuntimeError("回调重放（nonce 已被使用）")

    # ── 4. 解密 resource ──────────────────────────────────────────
    payload = json.loads(body.decode("utf-8"))
    resource = payload.get("resource") or {}
    res_nonce = resource.get("nonce")
    ciphertext = resource.get("ciphertext")
    associated = resource.get("associated_data") or ""
    if not res_nonce or not ciphertext:
        raise RuntimeError("回调缺少 resource 字段")

    plain = _aesgcm_decrypt(api_v3_key, str(res_nonce), str(ciphertext), str(associated))
    data = json.loads(plain.decode("utf-8"))
    if data.get("trade_state") != "SUCCESS":
        raise RuntimeError(f"trade_state={data.get('trade_state')}")
    amount = data.get("amount") or {}
    return {
        "out_trade_no": data.get("out_trade_no"),
        "transaction_id": data.get("transaction_id"),
        # 回调中的实付金额（单位：分）。调用方必须拿它与订单金额比对 ——
        # 验签只证明报文来自微信，不证明金额正确。
        "amount_total": amount.get("total"),
    }
