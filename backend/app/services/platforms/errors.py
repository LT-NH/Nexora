"""Nexora - 电商平台错误分类.

国内电商开放平台的报错形态高度相似：业务失败时返回一层 ``error_response``，
里面塞着平台自己的 code / msg / sub_code / sub_msg。但**同一个 HTTP 200**
下可能藏着完全不同的业务结果，直接按 code 分类会把商家引向错误的排查方向。

核心原则（与 AI 模型侧的 classify_error 一致）：**先看报错文本语义，
最后才退回错误码**。这里是真实踩坑的延伸：

  - 个人开发者账号调订单接口 → 返回「无接口权限」。
    若把它归成「凭证无效」，商家会反复重填 app_key，实际是他**没资质**。
  - access_token 过期 → 返回「会话失效」。
    若归成「凭证无效」，商家会重建应用，实际只需重新授权。

所以「无接口权限」和「会话过期」必须是**独立分类**。
"""

import enum
import re


class PlatformErrorKind(str, enum.Enum):
    """平台错误的语义分类（面向商家的可操作结论）。"""

    NO_API_PERMISSION = "no_api_permission"        # 应用未获该接口权限（个人账号典型）
    SESSION_EXPIRED = "session_expired"            # session / access_token 失效
    AUTH_INVALID = "auth_invalid"                  # app_key / 签名 本身有问题
    SHOP_NOT_AUTHORIZED = "shop_not_authorized"    # 店铺未授权/已解除授权
    RATE_LIMITED = "rate_limited"                  # 触发限流
    QUOTA_EXHAUSTED = "quota_exhausted"            # 调用量/额度用尽
    PARAM_INVALID = "param_invalid"                # 请求参数不合法
    PERMISSION_NEEDED = "permission_needed"        # 资质不足（需企业认证）
    UNKNOWN = "unknown"


# 顺序即优先级 —— 越靠前越具体，必须先匹配。
# 注意：不要把 "exceed" 这类宽泛词放进 QUOTA_EXHAUSTED，
# 否则 "rate limit exceeded" 会被误判成额度耗尽。
_KEYWORD_RULES: list[tuple[PlatformErrorKind, tuple[str, ...]]] = [
    (
        PlatformErrorKind.NO_API_PERMISSION,
        (
            "no permission", "permission denied", "permission-api-package",
            "api-package-limit", "api权限", "接口权限", "无权调用", "无权限调用",
            "没有权限", "接口未授权", "not subscribe", "isv-not-subscribe",
            "app-not-subscribe", "api not exist", "接口不存在", "api不存在",
            "no api access", "无权访问该接口", "insufficient permission",
            # 官方：isv.permission-ip-whitelist-limit（IP 白名单未配置）
            "ip-whitelist", "ip 白名单", "ip白名单",
        ),
    ),
    (
        PlatformErrorKind.SESSION_EXPIRED,
        (
            "session-expired", "session expired", "invalid session",
            "session check failed", "sessionkey", "session-key",
            "token expired", "token失效", "token 失效", "令牌", "授权已过期",
            "重新授权", "need login", "missing session", "access_token无效",
            "invalid access token", "expired access token", "请重新登录",
        ),
    ),
    (
        PlatformErrorKind.SHOP_NOT_AUTHORIZED,
        (
            "shop not authorized", "店铺未授权", "未绑定店铺", "绑定店铺",
            "店铺授权已失效", "not bind", "unbind",
        ),
    ),
    (
        PlatformErrorKind.RATE_LIMITED,
        (
            "rate limit", "ratelimit", "throttl", "too many requests",
            "限流", "调用频率", "调用次数超限", "qps", "请求过于频繁",
            # 官方：code 7 / msg "App Call Limited" / sub_code accesscontrol.limited-by-*
            "app call limited", "limited-by",
        ),
    ),
    (
        PlatformErrorKind.QUOTA_EXHAUSTED,
        (
            "quota exhausted", "quota exceeded", "额度不足", "额度已用完",
            "余额不足", "调用量已用完", "套餐已过期", "resource exhausted",
        ),
    ),
    (
        PlatformErrorKind.PERMISSION_NEEDED,
        (
            "企业认证", "企业资质", "need enterprise", "real-name",
            "开发者认证", "未认证", "资质",
        ),
    ),
    (
        PlatformErrorKind.AUTH_INVALID,
        (
            "invalid-app-key", "invalid app key", "invalid app_key",
            "appkey-not-exists", "app key not exist", "invalid-signature",
            "invalid signature", "invalid sign", "signature error",
            "签名错误", "签名验证失败", "clientid", "client_id 不正确",
            "client下线", "client 下线", "信息无效", "应用不存在",
            "app not exist", "appkey", "app key", "app_key",
        ),
    ),
    (
        PlatformErrorKind.PARAM_INVALID,
        (
            "missing-parameter", "missing parameter", "invalid parameter",
            "invalid-parameter", "参数错误", "参数不合法", "参数格式",
            "param error", "illegal argument", "格式错误",
        ),
    ),
]


# 错误码兜底表 —— **必须按平台隔离**。
# 踩坑实证（2026-09-18 真实网关探测 + 官方文档核对）：
# 京东与淘宝的 code 会撞车，但**含义完全不同**：
#   淘宝 ``21`` = Missing Method（缺少方法名参数），京东 ``21`` = AppKey 无效。
# 若共用一张表，京东的「Key 填错」会被误报成「参数缺失」。
# 淘宝一侧的码值以官方文档「常见平台级错误码」为准（更新于 2026-04-24）。
_CODE_RULES: dict[str, dict[str, PlatformErrorKind]] = {
    "taobao": {
        # 实测：{"code":1,"sub_code":"isp.get-app-error",
        #      "msg":"Platform System error:获取第三方APP信息失败,AppKey: null"}
        # —— AppKey 在平台上根本不存在（连查 App 信息都失败）
        "1": PlatformErrorKind.AUTH_INVALID,
        # 官方：App Call Limited（sub_code=accesscontrol.limited-by-*）
        "7": PlatformErrorKind.RATE_LIMITED,
        # 官方：Insufficient ISV Permissions —— **个人开发者调订单类接口就是撞这个码**，
        # 必须与「Key 填错」区分开，否则商家会反复重填凭证而实际问题是没有企业资质
        "11": PlatformErrorKind.NO_API_PERMISSION,
        "15": PlatformErrorKind.UNKNOWN,          # Remote service error
        "21": PlatformErrorKind.PARAM_INVALID,    # 官方：Missing Method（缺方法名）
        "22": PlatformErrorKind.PARAM_INVALID,    # 官方：Invalid Method（方法名不存在）
        "24": PlatformErrorKind.PARAM_INVALID,    # 官方：Missing Signature（缺 sign）
        "25": PlatformErrorKind.AUTH_INVALID,     # 官方：Invalid Signature（验签失败）
        "26": PlatformErrorKind.SESSION_EXPIRED,  # 官方：Missing SessionKey
        "27": PlatformErrorKind.SESSION_EXPIRED,  # 官方：Invalid SessionKey
        "28": PlatformErrorKind.AUTH_INVALID,     # 官方：Missing App Key
        "29": PlatformErrorKind.AUTH_INVALID,     # 官方：Invalid App Key
    },
    "jd": {
        # 实测：HTTP 200 + {"code":"21","en_desc":"Invalid app_key"}
        "21": PlatformErrorKind.AUTH_INVALID,
        # 京东对个人开发者调私有接口返回「权限不足」
        "2001": PlatformErrorKind.NO_API_PERMISSION,
    },
    "pdd": {
        "10001": PlatformErrorKind.PARAM_INVALID,   # 公共参数错误
        "10002": PlatformErrorKind.PARAM_INVALID,   # 业务参数错误
        "10016": PlatformErrorKind.AUTH_INVALID,    # clientId 不正确（实测）
        "20001": PlatformErrorKind.AUTH_INVALID,    # 授权码无效
        "52001": PlatformErrorKind.UNKNOWN,         # 系统异常
    },
}


def classify_platform_error(
    platform: str = "",
    code: str | int | None = None,
    message: str = "",
    sub_code: str = "",
    sub_message: str = "",
) -> PlatformErrorKind:
    """把平台报错归类到面向商家的语义桶。

    判定顺序为「关键词 → 该平台的错误码 → UNKNOWN」。
    ``platform`` 用于查平台专属错误码表；不传则跳过错误码兜底。
    """
    haystack = " ".join(
        str(x).lower()
        for x in (sub_code, sub_message, message, code)
        if x is not None and str(x) != ""
    )

    for kind, keywords in _KEYWORD_RULES:
        if any(kw in haystack for kw in keywords):
            return kind

    if code is not None:
        mapped = _CODE_RULES.get(platform, {}).get(str(code).strip())
        if mapped is not None:
            return mapped

    return PlatformErrorKind.UNKNOWN


_FRIENDLY: dict[PlatformErrorKind, str] = {
    PlatformErrorKind.NO_API_PERMISSION: (
        "应用未获得该接口的调用权限。个人开发者账号通常拿不到订单类接口"
        "（需企业资质 + 营业执照），请到开放平台控制台申请对应接口权限。"
    ),
    PlatformErrorKind.SESSION_EXPIRED: (
        "登录会话（access_token / session）已失效，请让店铺管理员重新授权后更新凭证。"
    ),
    PlatformErrorKind.AUTH_INVALID: (
        "应用凭证无效（AppKey / AppSecret / 签名校验失败），请核对后重新填写。"
    ),
    PlatformErrorKind.SHOP_NOT_AUTHORIZED: (
        "店铺尚未授权该应用，或授权已被解除，请重新走一次店铺授权流程。"
    ),
    PlatformErrorKind.RATE_LIMITED: "触发平台调用频率限制，请稍后重试或降低同步频率。",
    PlatformErrorKind.QUOTA_EXHAUSTED: "接口调用额度已用尽，请到开放平台控制台查看套餐。",
    PlatformErrorKind.PARAM_INVALID: "请求参数不合法，请检查店铺配置与同步范围。",
    PlatformErrorKind.PERMISSION_NEEDED: (
        "该接口需要企业开发者资质（营业执照 / 企业支付宝），个人账号无法申请。"
    ),
    PlatformErrorKind.UNKNOWN: "平台返回了未识别的错误。",
}


def friendly_error(kind: PlatformErrorKind, raw: str = "") -> str:
    """把分类结果转成面向商家的中文说明（附带原始报错便于排查）。"""
    base = _FRIENDLY.get(kind, _FRIENDLY[PlatformErrorKind.UNKNOWN])
    raw = (raw or "").strip()
    if not raw:
        return base
    # 原始报错可能很长，截断避免刷屏
    if len(raw) > 200:
        raw = raw[:197] + "..."
    return f"{base}原始报错：{raw}"


class PlatformCallError(Exception):
    """平台业务调用失败 —— 携带语义化分类，供上层转成中文提示。

    定义在 errors 模块而非 rpc_signed：错误类型与错误分类属于同一层，
    且 rpc_signed 已依赖本模块，反向导入会形成循环。
    """

    def __init__(
        self,
        kind: PlatformErrorKind,
        raw: str,
        code: str = "",
    ) -> None:
        self.kind = kind
        self.raw = sanitize_message(raw)
        self.code = code
        self.friendly = friendly_error(kind, self.raw)
        super().__init__(self.friendly)

    def __str__(self) -> str:  # pragma: no cover - 简单透传
        return self.friendly


def extract_error(payload: dict) -> tuple[str, str, str, str] | None:
    """从平台响应里抽出 (code, message, sub_code, sub_message)。

    三家平台的失败响应都长这样，只是字段名不同（均为实测）：
      - 淘宝 TOP: ``{"error_response":{"code":29,"msg":"Invalid app Key",
        "sub_code":"isv.appkey-not-exists"}}``
      - 京东 JOS: ``{"error_response":{"code":"21",
        "zh_desc":"key=xxx 信息无效","en_desc":"Invalid app_key"}}``
        —— 注意京东用 ``zh_desc`` / ``en_desc``，**没有** ``msg`` 字段。
        漏读这两个字段会让报错文本整条丢失，只剩个裸错误码。
      - 拼多多: ``{"error_response":{"error_code":10016,
        "error_msg":"client下线或者clientId不正确","sub_code":"10016",
        "sub_msg":"..."}}``

    返回 None 表示这不是一个错误响应（即调用成功）。
    """
    if not isinstance(payload, dict):
        return None
    err = payload.get("error_response")
    if not isinstance(err, dict):
        # 少数平台把错误放在 error 字段
        err = payload.get("error") if isinstance(payload.get("error"), dict) else None
    if err is None:
        return None

    code = err.get("code", err.get("error_code", ""))

    # 报错文案分散在多个可能的字段里，按可读性优先挑中文描述
    message = (
        err.get("msg")
        or err.get("error_msg")
        or err.get("zh_desc")
        or err.get("message")
        or err.get("en_desc")
        or ""
    )
    sub_code = err.get("sub_code", "")
    sub_message = err.get("sub_msg", err.get("sub_message", ""))
    # 京东的英文描述往往比中文更有辨识度（如 Invalid app_key），
    # 中文描述缺失时兜底拼进去，保证关键词分类有料可判。
    if not message:
        message = err.get("en_desc", "")

    return str(code), str(message), str(sub_code), str(sub_message)


def looks_like_html(text: str) -> bool:
    """判断响应体是不是 HTML（网关/WAF 拦截时会返回页面而不是 JSON）。"""
    head = (text or "").lstrip()[:200].lower()
    return head.startswith("<!doctype") or head.startswith("<html") or "<html" in head


_IP_RE = re.compile(r"\b\d{1,3}(?:\.\d{1,3}){3}\b")


def sanitize_message(text: str) -> str:
    """脱掉报错里可能带出的内网 IP，避免泄露基础设施信息。"""
    return _IP_RE.sub("<ip>", text or "")
