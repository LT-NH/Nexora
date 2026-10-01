"""Nexora - 上传文件校验。

只信任**文件内容**（magic bytes），不信任客户端提供的 ``Content-Type`` 和文件名。
这样即便上传的是 ``x.html``，落盘时用的也是服务端白名单里的扩展名，
不会被同源的 ``/uploads`` 静态服务当作 HTML 执行
（存储型 XSS 的根因：上传目录公开且扩展名取自用户文件名）。
"""

import os

# 允许的图片类型：magic bytes 前缀 → 服务端决定的扩展名
IMAGE_SIGNATURES: tuple[tuple[bytes, str], ...] = (
    (b"\x89PNG\r\n\x1a\n", "png"),
    (b"\xff\xd8\xff", "jpg"),
    (b"GIF87a", "gif"),
    (b"GIF89a", "gif"),
)

# WebP 头部结构特殊：0-3 字节为 "RIFF"，8-11 字节为 "WEBP"
_RIFF = b"RIFF"
_WEBP = b"WEBP"


def detect_image_extension(contents: bytes) -> str | None:
    """根据文件内容判断图片扩展名。

    Args:
        contents: 上传文件的原始字节。

    Returns:
        白名单内的扩展名（``png`` / ``jpg`` / ``gif`` / ``webp``）；
        内容不是可识别的图片时返回 ``None`` —— 调用方应当据此拒绝上传。
    """
    if len(contents) < 12:
        return None
    for signature, ext in IMAGE_SIGNATURES:
        if contents.startswith(signature):
            return ext
    if contents[0:4] == _RIFF and contents[8:12] == _WEBP:
        return "webp"
    return None


def safe_upload_name(prefix: str, extension: str) -> str:
    """构造服务端可控的上传文件名（不拼接任何用户输入）。"""
    return f"{prefix}.{extension}"


def ensure_upload_dir(*parts: str) -> str:
    """创建并返回上传子目录（相对进程工作目录，与既有约定一致）。"""
    upload_dir = os.path.join("uploads", *parts)
    os.makedirs(upload_dir, exist_ok=True)
    return upload_dir
