"""支付宝网关端到端验签（权威验证）。

用 alipay.trade.query 查询一个不存在的订单号：
- 支付宝用「支付宝私钥」对响应签名 → 我们用配置的「支付宝公钥」验签
- 同时验证「应用私钥」签名是否被支付宝接受

判定：
- sub_code = ACQ.TRADE_NOT_EXIST 且响应验签通过 → AppID/应用私钥/支付宝公钥 三件套全部正确
- 返回 INVALID_SIGNATURE / 验签失败 → 私钥或公钥有问题
"""

import json
import re
import sys
import urllib.parse
from datetime import datetime
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402
from app.services.alipay_pay import _sign, _private_key_pem, _pem_or_path  # noqa: E402

GATEWAY = str(getattr(settings, "ALIPAY_GATEWAY", "") or "https://openapi.alipay.com/gateway.do")


def main() -> int:
    print("=== 支付宝网关端到端验证 ===")
    print("网关:", GATEWAY)
    biz = {"out_trade_no": f"VERIFY{datetime.now().strftime('%Y%m%d%H%M%S')}"}
    params = {
        "app_id": str(settings.ALIPAY_APP_ID),
        "method": "alipay.trade.query",
        "format": "JSON",
        "charset": "utf-8",
        "sign_type": "RSA2",
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "version": "1.0",
        "biz_content": json.dumps(biz, separators=(",", ":")),
    }
    params["sign"] = _sign(params)
    try:
        r = httpx.post(GATEWAY, data=params, timeout=20, trust_env=False)
        raw = r.text
    except Exception as e:  # noqa: BLE001
        print("❌ 请求失败:", str(e)[:200])
        return 1

    # 提取 xxx_response 原文 + sign
    m = re.search(r'"alipay_trade_query_response":(.*?),"sign":"(.*?)"', raw, re.S)
    if not m:
        print("❌ 响应无签名（可能 AppID 无效或参数被拒）:", raw[:300])
        return 1
    resp_text, sign = m.group(1), m.group(2)

    # 用支付宝公钥验签响应
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

    pub = serialization.load_pem_public_key(_pem_or_path(str(settings.ALIPAY_PUBLIC_KEY), "public"))
    try:
        pub.verify(__import__("base64").b64decode(sign), resp_text.encode("utf-8"), padding.PKCS1v15(), hashes.SHA256())
        verified = True
    except Exception:  # noqa: BLE001
        verified = False

    resp = json.loads(resp_text)
    code, sub_code = resp.get("code"), resp.get("sub_code")
    sub_msg = resp.get("sub_msg", "")
    print(f"响应: code={code} sub_code={sub_code} sub_msg={sub_msg}")
    print("响应验签（支付宝公钥）:", "✅ 通过" if verified else "❌ 失败")

    if verified and sub_code == "ACQ.TRADE_NOT_EXIST":
        print("\n✅ 权威验证通过：AppID 有效、应用私钥签名被支付宝接受、支付宝公钥可验签其响应")
        print("   → 凭据三件套全部正确，通道可切真实收款")
        return 0
    if sub_code in ("INVALID_SIGNATURE", "ISV_INVALID_SIGNATURE"):
        print("\n❌ 支付宝判定签名无效：应用私钥与上传的应用公钥不匹配（请到开放平台核对「接口加签方式」）")
        return 1
    if not verified:
        print("\n❌ 响应验签失败：配置的 ALIPAY_PUBLIC_KEY 不是该应用对应的「支付宝公钥」")
        print("   → 到开放平台 → 应用详情 → 接口加签方式 → 复制「支付宝公钥」")
        return 1
    print(f"\n⚠️ 其他响应（code={code}）：{sub_msg or resp}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
