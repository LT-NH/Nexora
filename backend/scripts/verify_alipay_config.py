"""支付宝通道配置自检。

用法：
    python scripts/verify_alipay_config.py

检查项：
1) AppID / 应用私钥 / 支付宝公钥是否齐备（决定通道是真实还是 sandbox）
2) 私钥格式（PKCS#1「BEGIN RSA PRIVATE KEY」为支付宝 Python 推荐格式）
3) **密钥配对校验**：用应用私钥签名 → 用支付宝公钥验签（最常见的错误是公私钥匙不是一对）
4) 下单表单能否生成（签名链路端到端）
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402
from app.services.alipay_pay import (  # noqa: E402
    _sign,
    alipay_enabled,
    build_page_pay_form,
    verify_notify_sign,
)
from app.utils.logging import get_logger  # noqa: E402

logger = get_logger(__name__)

OK = "✅"
NO = "❌"


def main() -> int:
    print("=== 支付宝通道配置自检 ===")
    app_id = str(settings.ALIPAY_APP_ID or "")
    priv = str(settings.ALIPAY_APP_PRIVATE_KEY or "")
    pub = str(settings.ALIPAY_PUBLIC_KEY or "")
    gw = str(getattr(settings, "ALIPAY_GATEWAY", "") or "生产网关(默认)")

    print(f"1) AppID        : {app_id or '(空)'} " + (OK if app_id and app_id.isdigit() and len(app_id) == 16 else NO))
    print(f"2) 应用私钥     : {'已配置' if priv else '(空)'} " + (OK if priv else NO))
    print(f"3) 支付宝公钥   : {'已配置' if pub else '(空)'} " + (OK if pub else NO))
    print(f"4) 网关         : {gw}")

    if not (app_id and priv and pub):
        print(f"\n结果：{NO} 凭据不齐 → 通道处于 sandbox 模式（可用模拟确认走通演示流程）")
        print("补齐方式：编辑 backend/.env 填入 ALIPAY_APP_PRIVATE_KEY 与 ALIPAY_PUBLIC_KEY（勿提交仓库）")
        return 1

    # 私钥格式
    pkcs1 = "BEGIN RSA PRIVATE KEY" in priv
    print(f"5) 私钥格式     : {'PKCS#1' if pkcs1 else 'PKCS#8（建议用官方密钥工具转 PKCS#1）'} " + (OK if pkcs1 else "⚠️"))

    # 密钥配对校验：私钥签名 → 支付宝公钥验签
    probe = {
        "trade_status": "TRADE_SUCCESS",
        "out_trade_no": "SELFCHECK0001",
        "app_id": app_id,
        "total_amount": "0.01",
        "charset": "utf-8",
        "sign_type": "RSA2",
    }
    try:
        probe["sign"] = _sign(probe)
        paired = verify_notify_sign(probe)
    except Exception as e:  # noqa: BLE001
        print(f"6) 密钥配对     : {NO} 签名/验签异常：{str(e)[:120]}")
        return 1
    print(f"6) 密钥配对     : {'通过（公私钥为同一对）' if paired else '不通过（公钥与私钥不匹配！）'} " + (OK if paired else NO))
    if not paired:
        print("   → 请确认：支付宝公钥取自同一应用的「接口加签方式」页面，且与本地私钥配对")
        return 1

    # 下单表单端到端
    try:
        form = build_page_pay_form("SELFCHECK0002", 0.01, "配置自检", "https://example.com/api/v1/billing/alipay/notify")
        ok_form = 'punchout_form' in form and 'alipay.trade.page.pay' in form and 'sign=' in form
    except Exception as e:  # noqa: BLE001
        print(f"7) 下单表单     : {NO} {str(e)[:120]}")
        return 1
    print(f"7) 下单表单     : {'生成成功（含 RSA2 签名）' if ok_form else '异常'} " + (OK if ok_form else NO))

    print(f"\n结果：{OK} 凭据齐备且自检通过 → alipay_enabled={alipay_enabled()}，通道为真实支付宝")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
