"""Nexora - 出站 URL 安全校验（防 SSRF）。

出站 Webhook 的 URL 完全由租户自行配置。若不加限制，任何自注册用户
（建工作空间即 OWNER）都能填 ``http://169.254.169.254/latest/meta-data/``
并在「测试」时读到云厂商元数据或内网服务的响应 —— 这是本项目最容易
被利用的高危项。

校验策略：解析主机名的**全部** A/AAAA 记录，任一落到内网/环回/链路本地/
保留地址即拒绝（避免「公网域名解析到内网 IP」这类绕过）。
"""

import ipaddress
import socket
from urllib.parse import urlparse

ALLOWED_SCHEMES = ("http", "https")


class UnsafeUrlError(ValueError):
    """URL 指向内网 / 使用了非法协议 / 无法解析。"""


def _is_blocked_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """私网、环回、链路本地、保留、组播、未指定地址一律拒绝。"""
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
        or getattr(ip, "is_site_local", False)
    )


def validate_outbound_url(url: str) -> str:
    """校验出站 URL，返回去空格后的原串；不安全时抛 :class:`UnsafeUrlError`。

    Args:
        url: 用户提交的目标地址。

    Returns:
        规范化（去首尾空格）后的 URL。

    Raises:
        UnsafeUrlError: scheme 非 http/https、缺主机名、主机名解析失败，
            或解析结果落在受限网段。
    """
    if not url or not isinstance(url, str):
        raise UnsafeUrlError("URL 不能为空")

    raw = url.strip()
    parsed = urlparse(raw)

    if parsed.scheme.lower() not in ALLOWED_SCHEMES:
        raise UnsafeUrlError("仅支持 http / https 协议")

    host = parsed.hostname
    if not host:
        raise UnsafeUrlError("URL 缺少主机名")

    # 显式 IP 直接判定
    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        literal = None

    if literal is not None:
        if _is_blocked_ip(literal):
            raise UnsafeUrlError("不允许指向内网 / 环回 / 保留地址")
        return raw

    # 域名：解析全部记录后逐个判定
    port = parsed.port or (443 if parsed.scheme.lower() == "https" else 80)
    try:
        infos = socket.getaddrinfo(host, port)
    except socket.gaierror as exc:
        raise UnsafeUrlError(f"主机名无法解析：{host}") from exc

    for info in infos:
        addr = info[4][0]
        try:
            resolved = ipaddress.ip_address(addr)
        except ValueError:
            continue
        if _is_blocked_ip(resolved):
            raise UnsafeUrlError(f"主机名 {host} 解析到受限地址 {addr}")

    return raw
