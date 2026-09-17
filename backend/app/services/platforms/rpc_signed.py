"""Nexora - 国内电商开放平台共用基类（RPC 风格 + 签名鉴权）.

淘宝 TOP / 京东宙斯 JOS / 拼多多开放平台，三家的接口形态高度同构：

  - 单一网关 URL，POST **表单编码**（不是 REST JSON）
  - 用「业务方法名」区分接口（淘宝/京东叫 ``method``，拼多多叫 ``type``）
  - 签名算法一致：``MD5(secret + ASCII升序拼接 + secret).upper()``
    （淘宝另支持 ``HMAC-SHA256(key=secret, msg=拼接串)``）
  - 公共参数：app_key / 时间戳 / 格式 / 签名方式
  - 业务参数要么平铺在同一层，要么包成一个 JSON 字符串字段

差异点全部由类属性声明，子类只需「填表 + 写字段映射」。
"""

import asyncio
import hashlib
import hmac
import json
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import httpx

from app.services.platforms.base import PlatformIntegration
from app.services.platforms.errors import (
    PlatformCallError,
    PlatformErrorKind,
    classify_platform_error,
    extract_error,
    looks_like_html,
    sanitize_message,
)
from app.utils.logging import get_logger

logger = get_logger(__name__)

# 淘宝/京东要求时间戳用北京时间（GMT+8），不是 UTC。
CST = timezone(timedelta(hours=8))

DEFAULT_TIMEOUT = 15.0
MAX_NETWORK_RETRIES = 2


# ----------------------------------------------------------------------
# 签名
# ----------------------------------------------------------------------

def build_sign_base(params: dict[str, Any]) -> str:
    """把参数按 ASCII 升序拼成 ``k1v1k2v2...``（``sign`` 自身不参与）。"""
    parts: list[str] = []
    for key in sorted(params.keys()):
        if key == "sign":
            continue
        value = params[key]
        if value is None:
            continue
        text = value if isinstance(value, str) else str(value)
        if text == "":
            continue
        parts.append(f"{key}{text}")
    return "".join(parts)


def sign_params(
    params: dict[str, Any],
    secret: str,
    method: str = "md5",
) -> str:
    """按平台规则生成大写十六进制签名。

    - ``md5``：``MD5(secret + 拼接串 + secret)``
    - ``hmac-sha256``：``HMAC-SHA256(key=secret, msg=拼接串)``
    """
    base = build_sign_base(params)
    normalized = (method or "md5").lower().replace("_", "-")

    if normalized in ("hmac-sha256", "hmacsha256", "hmac"):
        digest = hmac.new(
            secret.encode("utf-8"),
            base.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
    else:
        digest = hashlib.md5(
            (secret + base + secret).encode("utf-8")
        ).hexdigest()

    return digest.upper()


# ----------------------------------------------------------------------
# 共用基类
# ----------------------------------------------------------------------

class RpcSignedIntegration(PlatformIntegration):
    """国内电商开放平台共用实现。"""

    platform_name = "rpc"

    # ── 网关注册表（子类必须覆盖） ──
    gateway_prod: str = ""
    gateway_sandbox: str = ""

    # ── 签名与时间戳 ──
    default_sign_method: str = "md5"
    timestamp_style: str = "datetime"  # datetime(GMT+8) | unix

    # ── 参数命名（各平台叫法不同） ──
    method_field: str = "method"
    app_key_field: str = "app_key"
    token_field: str = "session"

    # 业务参数放置方式：flat（平铺）| json_wrapped（包成 JSON 字符串）
    business_param_style: str = "flat"
    business_wrapper_key: str = ""

    # 平台固定公共参数（如淘宝的 v / format / sign_method）
    common_params: dict[str, str] = {}

    # ── 网关选择 ──

    def _gateway(self, config: dict[str, Any]) -> str:
        """按配置选择生产/沙箱网关。"""
        if config.get("sandbox") and self.gateway_sandbox:
            return self.gateway_sandbox
        return self.gateway_prod

    # ── 凭证读取 ──

    def _credentials(self, config: dict[str, Any]) -> tuple[str, str, str]:
        """返回 (app_key, app_secret, token)。"""
        return (
            (config.get("api_key") or "").strip(),
            (config.get("api_secret") or "").strip(),
            (config.get("access_token") or "").strip(),
        )

    def _timestamp(self) -> str:
        if self.timestamp_style == "unix":
            return str(int(time.time()))
        return datetime.now(CST).strftime("%Y-%m-%d %H:%M:%S")

    # ── 请求构造 ──

    def build_request_params(
        self,
        config: dict[str, Any],
        method: str,
        biz_params: dict[str, Any] | None = None,
        *,
        sign_method: str | None = None,
    ) -> dict[str, Any]:
        """构造含签名的完整请求参数。"""
        app_key, app_secret, token = self._credentials(config)
        biz_params = biz_params or {}

        # 签名方式可能被店铺配置覆盖（淘宝支持 md5 与 hmac-sha256）。
        # 它是**参与签名**的公共参数，必须与最终使用的算法保持一致，
        # 否则服务端会按参数里写的方式校验，结果签名不匹配。
        resolved_sign = (
            sign_method
            or config.get("sign_method")
            or self.common_params.get("sign_method")
            or self.default_sign_method
        )

        params: dict[str, Any] = dict(self.common_params)
        if "sign_method" in params:
            params["sign_method"] = resolved_sign

        params[self.method_field] = method
        params[self.app_key_field] = app_key

        if self.token_field and token:
            params[self.token_field] = token

        params["timestamp"] = self._timestamp()

        if self.business_param_style == "json_wrapped":
            # 京东：业务参数整体序列化后作为一个参数值参与签名。
            # 允许按店铺覆盖字段名 —— 宙斯用 360buy_param_json，
            # 开放平台 2.0 用 param_json，靠配置切换而不改代码。
            wrapper = (
                config.get("business_wrapper_key") or self.business_wrapper_key
            )
            params[wrapper] = json.dumps(
                biz_params, separators=(",", ":"), ensure_ascii=False
            )
        else:
            for key, value in biz_params.items():
                if value is None:
                    continue
                params[key] = value

        params["sign"] = sign_params(params, app_secret, resolved_sign)
        return params

    # ── 调用 ──

    async def call(
        self,
        config: dict[str, Any],
        method: str,
        biz_params: dict[str, Any] | None = None,
        *,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> dict[str, Any]:
        """发起一次签名调用，返回**成功响应体的内层 payload**。

        业务失败会抛 :class:`PlatformCallError`（已带语义分类）。
        """
        app_key, app_secret, _ = self._credentials(config)
        if not app_key or not app_secret:
            raise PlatformCallError(
                PlatformErrorKind.AUTH_INVALID,
                "缺少 AppKey / AppSecret",
            )

        url = self._gateway(config)
        params = self.build_request_params(config, method, biz_params)

        # 表单编码：签名基于原始值计算，因此编码只影响传输层
        body = urlencode(params, encoding="utf-8")

        last_transport_error: Exception | None = None
        for attempt in range(MAX_NETWORK_RETRIES + 1):
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    resp = await client.post(
                        url,
                        content=body,
                        headers={
                            "Content-Type": (
                                "application/x-www-form-urlencoded;charset=utf-8"
                            ),
                        },
                    )
                break
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last_transport_error = exc
                if attempt >= MAX_NETWORK_RETRIES:
                    raise PlatformCallError(
                        PlatformErrorKind.UNKNOWN,
                        f"网络请求失败：{exc}",
                    ) from exc
                # 指数退避，避免瞬时抖动被当成平台故障
                await asyncio.sleep(0.5 * (2**attempt))
        else:  # pragma: no cover - 循环必然 break 或 raise
            raise PlatformCallError(
                PlatformErrorKind.UNKNOWN, f"网络请求失败：{last_transport_error}"
            )

        text = resp.text or ""

        if resp.status_code >= 500:
            raise PlatformCallError(
                PlatformErrorKind.UNKNOWN,
                f"平台网关返回 HTTP {resp.status_code}",
            )

        if looks_like_html(text):
            # WAF / 网关拦截时返回页面，不是 JSON
            raise PlatformCallError(
                PlatformErrorKind.UNKNOWN,
                f"网关返回了非 JSON 响应（HTTP {resp.status_code}），"
                "可能是请求被拦截或网关地址有误",
            )

        try:
            payload = resp.json()
        except Exception as exc:
            raise PlatformCallError(
                PlatformErrorKind.UNKNOWN,
                f"响应不是合法 JSON：{sanitize_message(text[:200])}",
            ) from exc

        return self.unwrap(payload, method)

    # ── 响应解包 ──

    def unwrap(self, payload: dict[str, Any], method: str = "") -> dict[str, Any]:
        """校验错误并取出内层 payload。

        成功响应的外层 key 各平台不同（且京东拼写为 ``_responce``），
        所以统一取「第一个形如 ``*_response`` / ``*_responce`` 的键」。
        """
        err = extract_error(payload)
        if err is not None:
            code, message, sub_code, sub_message = err
            kind = classify_platform_error(
                platform=self.platform_name,
                code=code,
                message=message,
                sub_code=sub_code,
                sub_message=sub_message,
            )
            raw = " | ".join(
                x for x in (code, sub_code, message, sub_message) if x
            )
            logger.warning(
                "%s API error [%s] method=%s: %s",
                self.platform_name,
                kind.value,
                method,
                sanitize_message(raw),
            )
            raise PlatformCallError(kind, raw, code=str(code))

        for key, value in payload.items():
            if key.endswith("_response") or key.endswith("_responce"):
                return value if isinstance(value, dict) else {"data": value}

        # 没有包装层（部分接口直接返回业务体）
        return payload

    # ── 单据字段工具 ──

    @staticmethod
    def to_cents(amount: Any) -> float:
        """把「分」转成「元」。无法解析时返回 0.0。"""
        try:
            return round(float(amount or 0) / 100, 2)
        except (TypeError, ValueError):
            return 0.0

    @staticmethod
    def to_int(value: Any, default: int = 0) -> int:
        try:
            return int(float(value))
        except (TypeError, ValueError):
            return default

    @staticmethod
    def to_float(value: Any, default: float = 0.0) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return default


def digits_after_prefix(value: str, prefix: str) -> str | None:
    """从 ``<prefix><数字>`` 里取出数字部分；不是数字则返回 None。

    三平台的写操作都要把本地 SKU / 订单号还原成平台的**数字 ID**，
    而这些 ID 随后会被塞进 ``int()``。若这里不做校验，一个格式不对的
    SKU（例如用户手填的编码）会直接让 ``int()`` 抛 ValueError，
    把一次可解释的参数错误变成 500。宁可在入口返回 None，
    让上层给出「不是该平台订单号」的明确提示。
    """
    raw = value or ""
    if prefix and raw.startswith(prefix):
        raw = raw[len(prefix):]
    raw = raw.strip()
    return raw if raw.isdigit() else None
