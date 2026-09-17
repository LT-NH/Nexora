"""国内电商平台（淘宝/京东/拼多多）适配器测试.

覆盖三件容易出错的事：
  1. **签名算法** —— 三平台同构，但空值剔除 / HMAC 与 MD5 的差异很容易写错。
  2. **参数命名差异** —— 淘宝叫 ``method``、拼多多叫 ``type``；京东包 JSON、
     拼多多平铺；京东时间戳是北京时间、拼多多是 Unix 秒。
  3. **错误分类** —— 全部基于**真实网关探测到的报文**。

⚠️ 特别守护（真实踩坑回归，2026-09-17）：
  - 京东与淘宝的 ``code`` 会撞车：淘宝 ``21`` = 限流，京东 ``21`` = AppKey 无效。
    错误码表若不按平台隔离，京东的「Key 填错」会被报成「限流」。
  - 京东的报错文案在 ``zh_desc`` / ``en_desc`` 里，**没有** ``msg`` 字段。
    漏读会让报错整条丢失，只剩一个裸错误码。
  - 拼多多无效 client_id 的报文是「client下线或者clientId不正确」，
    缺关键词会落到 unknown。
"""

import json

import pytest
from sqlalchemy import func, select

from app.models.order import Order, OrderItem, OrderStatus
from app.models.product import Product
from app.services.platforms import (
    PLATFORM_REGISTRY,
    all_platform_capabilities,
    get_integration,
)
from app.services.platforms.base import PlatformCapability, WriteResult
from app.services.platforms.errors import (
    PlatformCallError,
    PlatformErrorKind,
    classify_platform_error,
    extract_error,
)
from app.services.platforms.jd import JdIntegration
from app.services.platforms.pdd import PddIntegration
from app.services.platforms.rpc_signed import build_sign_base, sign_params
from app.services.platforms.taobao import TaobaoIntegration

FAKE_CFG = {
    "api_key": "test-app-key",
    "api_secret": "test-app-secret",
    "access_token": "test-token",
}


# ======================================================================
# 1. 签名算法
# ======================================================================

def test_sign_base_sorts_ascii_and_skips_empty():
    """拼接串必须 ASCII 升序，且**剔除空值**（官方实现明确要求）。"""
    params = {"b": "2", "a": "1", "empty": "", "none": None, "sign": "IGNORED"}
    assert build_sign_base(params) == "a1b2"


def test_sign_ignores_sign_field_itself():
    """``sign`` 自身不能参与签名计算（否则会自指）。"""
    base = {"a": "1", "b": "2"}
    with_sign = dict(base, sign="WHATEVER")
    assert build_sign_base(base) == build_sign_base(with_sign)


def test_md5_sign_recipe():
    """``MD5(secret + 拼接串 + secret).upper()`` —— 三平台同构。"""
    import hashlib

    params = {"method": "taobao.trades.sold.get", "app_key": "123"}
    expected = hashlib.md5(
        ("SECRET" + "app_key123methodtaobao.trades.sold.get" + "SECRET").encode()
    ).hexdigest().upper()
    assert sign_params(params, "SECRET", "md5") == expected
    assert len(sign_params(params, "SECRET", "md5")) == 32


def test_hmac_sha256_sign_recipe():
    """HMAC 模式：key 是 secret，msg 是拼接串，**不**在两端加 secret。"""
    import hashlib
    import hmac

    params = {"a": "1", "b": "2"}
    expected = hmac.new(
        b"SECRET", b"a1b2", hashlib.sha256
    ).hexdigest().upper()
    assert sign_params(params, "SECRET", "hmac-sha256") == expected
    assert len(sign_params(params, "SECRET", "hmac-sha256")) == 64


def test_sign_method_aliases_normalized():
    """``hmac_sha256`` / ``hmac-sha256`` / ``hmac`` 应等价。"""
    params = {"a": "1"}
    variants = [
        sign_params(params, "S", m)
        for m in ("hmac-sha256", "hmac_sha256", "hmac", "HMAC-SHA256")
    ]
    assert len(set(variants)) == 1


def test_sign_changes_with_secret():
    params = {"a": "1"}
    assert sign_params(params, "S1", "md5") != sign_params(params, "S2", "md5")


# ======================================================================
# 2. 请求参数构造（三平台差异）
# ======================================================================

def test_taobao_request_shape_and_gateway():
    integ = TaobaoIntegration()
    params = integ.build_request_params(
        FAKE_CFG, "taobao.items.onsale.get", {"page_no": "1"}
    )
    assert integ._gateway(FAKE_CFG) == "https://eco.taobao.com/router/rest"
    assert params["method"] == "taobao.items.onsale.get"
    assert params["app_key"] == "test-app-key"
    assert params["session"] == "test-token"       # TOP 里 token 叫 session
    assert params["sign_method"] == "md5"
    assert params["v"] == "2.0"
    assert params["format"] == "json"
    assert "page_no" in params                      # 业务参数平铺
    assert params["sign"] == params["sign"].upper()


def test_taobao_timestamp_is_beijing_time():
    """淘宝时间戳是 GMT+8（不是 UTC），格式 ``yyyy-MM-dd HH:mm:ss``。"""
    from datetime import datetime, timedelta, timezone

    integ = TaobaoIntegration()
    params = integ.build_request_params(FAKE_CFG, "taobao.user.seller.get", {})
    parsed = datetime.strptime(params["timestamp"], "%Y-%m-%d %H:%M:%S")
    now_cst = datetime.now(timezone(timedelta(hours=8))).replace(tzinfo=None)
    assert abs((now_cst - parsed).total_seconds()) < 60


def test_jd_request_shape_and_no_sign_method():
    """京东把业务参数包进 ``360buy_param_json``，且公共参数**没有** sign_method。"""
    integ = JdIntegration()
    params = integ.build_request_params(
        FAKE_CFG, "jingdong.pop.order.search", {"page": "1", "pageSize": "50"}
    )
    assert integ._gateway(FAKE_CFG) == "https://api.jd.com/routerjson"
    assert params["method"] == "jingdong.pop.order.search"
    assert params["app_key"] == "test-app-key"
    assert params["access_token"] == "test-token"
    assert "sign_method" not in params              # 宙斯公共参数里没有它
    # 业务参数被序列化成一个 JSON 字符串
    wrapped = json.loads(params["360buy_param_json"])
    assert wrapped == {"page": "1", "pageSize": "50"}
    assert "page" not in params                     # 不能同时又平铺一份


def test_jd_wrapper_key_is_overridable():
    """宙斯用 360buy_param_json，开放平台 2.0 用 param_json → 可配置切换。"""
    integ = JdIntegration()
    params = integ.build_request_params(
        {**FAKE_CFG, "business_wrapper_key": "param_json"},
        "jingdong.pop.order.search",
        {"page": "1"},
    )
    assert "param_json" in params
    assert "360buy_param_json" not in params


def test_pdd_request_shape_and_unix_timestamp():
    """拼多多：``type`` / ``client_id`` / Unix 秒 / data_type=JSON / 业务参数平铺。"""
    integ = PddIntegration()
    params = integ.build_request_params(
        FAKE_CFG, "pdd.order.list.get", {"page": 1, "page_size": 50}
    )
    assert integ._gateway(FAKE_CFG) == "https://gw-api.pinduoduo.com/api/router"
    assert params["type"] == "pdd.order.list.get"
    assert params["client_id"] == "test-app-key"
    assert params["access_token"] == "test-token"
    assert params["data_type"] == "JSON"
    assert "method" not in params                   # 拼多多不用 method
    assert "app_key" not in params                  # 也不用 app_key
    assert params["timestamp"].isdigit()            # Unix 秒
    assert len(params["timestamp"]) == 10
    assert params["page"] == 1                      # 平铺，不是 JSON 包装


def test_sandbox_gateway_switch():
    """淘宝有独立沙箱网关；京东/拼多多无公开沙箱，开关不生效。"""
    tb = TaobaoIntegration()
    assert tb._gateway({**FAKE_CFG, "sandbox": True}) == (
        "https://gw.api.tbsandbox.com/router/rest"
    )
    assert tb._gateway({**FAKE_CFG, "sandbox": False}) == (
        "https://eco.taobao.com/router/rest"
    )
    pdd = PddIntegration()
    assert pdd._gateway({**FAKE_CFG, "sandbox": True}) == pdd.gateway_prod


async def test_missing_appkey_raises_before_network():
    """缺 AppKey 应当直接抛错，不发请求。"""
    integ = TaobaoIntegration()
    with pytest.raises(PlatformCallError) as exc:
        await integ.call({"api_key": "", "api_secret": ""}, "taobao.user.seller.get")
    assert exc.value.kind == PlatformErrorKind.AUTH_INVALID


# ======================================================================
# 3. 错误分类（报文均来自真实网关探测）
# ======================================================================

def test_classify_taobao_invalid_appkey():
    """实测：{"code":29,"msg":"Invalid app Key","sub_code":"isv.appkey-not-exists"}"""
    kind = classify_platform_error(
        platform="taobao",
        code=29,
        message="Invalid app Key",
        sub_code="isv.appkey-not-exists",
    )
    assert kind == PlatformErrorKind.AUTH_INVALID


def test_classify_jd_code21_is_auth_not_rate_limited():
    """回归：京东 ``21`` 是 AppKey 无效，**不能**按淘宝的 ``21``（限流）判。

    实测报文：{"code":"21","zh_desc":"key=xxx 信息无效","en_desc":"Invalid app_key"}
    """
    jd_kind = classify_platform_error(
        platform="jd", code=21, message="key=12345678 信息无效"
    )
    assert jd_kind == PlatformErrorKind.AUTH_INVALID

    # 同一个 code 在淘宝是限流 —— 证明平台隔离是必要的
    taobao_kind = classify_platform_error(platform="taobao", code=21, message="")
    assert taobao_kind == PlatformErrorKind.RATE_LIMITED
    assert jd_kind != taobao_kind


def test_classify_jd_2001_is_no_permission():
    """京东对个人开发者调私有接口返回「权限不足 code:2001」。"""
    kind = classify_platform_error(platform="jd", code="2001", message="权限不足")
    assert kind == PlatformErrorKind.NO_API_PERMISSION


def test_classify_pdd_invalid_client_id():
    """回归：实测「client下线或者clientId不正确」→ 凭证无效（原缺关键词）。"""
    kind = classify_platform_error(
        platform="pdd",
        code=10016,
        message="client下线或者clientId不正确",
        sub_code="10016",
    )
    assert kind == PlatformErrorKind.AUTH_INVALID


def test_no_permission_is_distinct_from_auth_invalid():
    """核心区分：没资质 ≠ Key 填错。混在一起会误导商家反复重填 Key。"""
    no_perm = classify_platform_error(
        message="Insufficient permission: api not authorized"
    )
    assert no_perm == PlatformErrorKind.NO_API_PERMISSION
    assert no_perm != PlatformErrorKind.AUTH_INVALID

    # 淘宝口径的权限拒绝
    assert classify_platform_error(
        message="isv.permission-api-package-limit"
    ) == PlatformErrorKind.NO_API_PERMISSION


def test_session_expired_not_auth_invalid():
    """access_token 过期 ≠ AppKey 无效：前者重新授权即可，后者要改凭证。"""
    kind = classify_platform_error(
        message="Invalid session", sub_code="isv.session-expired"
    )
    assert kind == PlatformErrorKind.SESSION_EXPIRED
    assert kind != PlatformErrorKind.AUTH_INVALID


def test_rate_limit_not_misclassified_as_quota():
    """``rate limit exceeded`` 是限流，不能因为出现 exceed 就判成额度耗尽。"""
    assert classify_platform_error(
        message="rate limit exceeded, please retry later"
    ) == PlatformErrorKind.RATE_LIMITED


def test_quota_exhausted_detected():
    assert classify_platform_error(
        message="quota exhausted"
    ) == PlatformErrorKind.QUOTA_EXHAUSTED
    assert classify_platform_error(
        message="接口调用量已用完"
    ) == PlatformErrorKind.QUOTA_EXHAUSTED


def test_permission_needed_for_enterprise():
    """企业资质不足要单独成档，提示商家去认证而不是改代码。"""
    assert classify_platform_error(
        message="该接口需要企业认证后申请"
    ) == PlatformErrorKind.PERMISSION_NEEDED


def test_unknown_falls_back_gracefully():
    assert classify_platform_error(
        message="something totally unexpected"
    ) == PlatformErrorKind.UNKNOWN
    # 不传 platform 时不做错误码兜底，避免跨平台误判
    assert classify_platform_error(code=21, message="") == PlatformErrorKind.UNKNOWN


def test_classify_is_case_insensitive():
    assert classify_platform_error(
        message="INVALID APP_KEY"
    ) == PlatformErrorKind.AUTH_INVALID


# ======================================================================
# 4. 错误报文抽取
# ======================================================================

def test_extract_error_taobao():
    payload = {
        "error_response": {
            "code": 29,
            "msg": "Invalid app Key",
            "sub_code": "isv.appkey-not-exists",
        }
    }
    assert extract_error(payload) == (
        "29", "Invalid app Key", "isv.appkey-not-exists", ""
    )


def test_extract_error_jd_zh_desc():
    """回归：京东没有 msg，只有 zh_desc / en_desc —— 漏读会丢光报错文本。"""
    payload = {
        "error_response": {
            "code": "21",
            "zh_desc": "key=12345678 信息无效",
            "en_desc": "Invalid app_key",
        }
    }
    code, message, _, _ = extract_error(payload)
    assert code == "21"
    assert "信息无效" in message


def test_extract_error_jd_falls_back_to_en_desc():
    payload = {"error_response": {"code": "21", "en_desc": "Invalid app_key"}}
    _, message, _, _ = extract_error(payload)
    assert message == "Invalid app_key"


def test_extract_error_pdd():
    payload = {
        "error_response": {
            "error_code": 10016,
            "error_msg": "client下线或者clientId不正确",
            "sub_code": "10016",
            "sub_msg": "client下线或者clientId不正确",
        }
    }
    code, message, sub_code, _ = extract_error(payload)
    assert code == "10016"
    assert "clientId" in message
    assert sub_code == "10016"


def test_extract_error_returns_none_on_success():
    """成功响应没有 error_response → 必须返回 None，否则会把成功当失败。"""
    assert extract_error({"items_onsale_get_response": {"items": {}}}) is None
    assert extract_error({}) is None


# ======================================================================
# 5. 响应解包
# ======================================================================

def test_unwrap_taobao_response():
    integ = TaobaoIntegration()
    payload = {"items_onsale_get_response": {"items": {"item": [{"num_iid": 1}]}}}
    assert integ.unwrap(payload) == {"items": {"item": [{"num_iid": 1}]}}


def test_unwrap_jd_responce_with_official_typo():
    """京东官方把 response 拼成 ``responce`` —— 两种都要能解。"""
    integ = JdIntegration()
    payload = {
        "jingdong_pop_order_shipment_responce": {"sopjosshipment_result": {"success": "true"}}
    }
    assert integ.unwrap(payload) == {"sopjosshipment_result": {"success": "true"}}


def test_unwrap_raises_platform_call_error():
    integ = TaobaoIntegration()
    with pytest.raises(PlatformCallError) as exc:
        integ.unwrap({"error_response": {"code": 29, "msg": "Invalid app Key"}})
    assert exc.value.kind == PlatformErrorKind.AUTH_INVALID
    assert "原始报错" in exc.value.friendly


# ======================================================================
# 6. 能力声明
# ======================================================================

def test_new_platforms_declare_write_capabilities():
    for name in ("taobao", "jd", "pdd"):
        caps = all_platform_capabilities()[name]
        assert PlatformCapability.READ.value in caps
        assert PlatformCapability.WRITE_INVENTORY.value in caps
        assert PlatformCapability.WRITE_PRICE.value in caps
        assert PlatformCapability.SHIP_ORDER.value in caps


def test_legacy_platforms_are_read_only():
    """Shopify/抖音/沙盒尚未实现双向写 → 不应谎报写能力。"""
    caps = all_platform_capabilities()
    for name in ("shopify", "douyin", "sandbox"):
        assert caps[name] == [PlatformCapability.READ.value]


def test_platform_registry_no_longer_stubs_the_big_three():
    """国产三巨头不再落到 GenericIntegration（原先是桩）。"""
    from app.services.platforms.generic import GenericIntegration

    for name in ("taobao", "jd", "pdd"):
        assert PLATFORM_REGISTRY[name] is not GenericIntegration
    assert PLATFORM_REGISTRY["amazon"] is GenericIntegration


async def test_unsupported_write_returns_explicit_result():
    """只读平台调写操作要给明确结果，而不是抛异常或静默成功。"""
    from app.services.platforms.shopify import ShopifyIntegration

    result = await ShopifyIntegration().update_inventory(FAKE_CFG, "ws", [])
    assert isinstance(result, WriteResult)
    assert result.ok is False
    assert "暂不支持" in result.errors[0]


def test_capability_list_is_stably_ordered():
    """能力列表顺序要稳定，避免前端渲染顺序抖动。"""
    caps = TaobaoIntegration().capability_list()
    assert caps == sorted(
        caps, key=lambda c: [x.value for x in PlatformCapability].index(c)
    )


def test_get_integration_unknown_platform():
    assert get_integration("no-such-platform") is None


# ======================================================================
# 7. 落库链路（fake httpx，含真实结构的响应）
# ======================================================================

class _Resp:
    def __init__(self, status_code: int, data: dict):
        self.status_code = status_code
        self._data = data
        self.text = json.dumps(data, ensure_ascii=False)

    def json(self):
        return self._data


def _canned(method: str) -> dict:
    """按调用方法返回**真实结构**的响应体。"""
    if method == "taobao.items.onsale.get":
        return {
            "items_onsale_get_response": {
                "items": {
                    "item": [
                        {
                            "num_iid": 111,
                            "title": "淘宝测试商品",
                            "price": "99.50",
                            "num": 30,
                            "outer_id": "SKU-TB-1",
                            "pic_url": "https://img/1.jpg",
                            "approve_status": "onsale",
                            "cid": 50010850,
                        }
                    ]
                },
                "total_results": 1,
            }
        }
    if method == "taobao.items.inventory.get":
        return {"items_inventory_get_response": {"items": {}, "total_results": 0}}
    if method == "taobao.trades.sold.get":
        return {
            "trades_sold_get_response": {
                "trades": {
                    "trade": [
                        {
                            "tid": 9001,
                            "status": "WAIT_BUYER_CONFIRM_GOODS",
                            "payment": "128.00",
                            "post_fee": "8.00",
                            "discount_fee": "0.00",
                            "buyer_nick": "买家甲",
                            "receiver_name": "张三",
                            "receiver_state": "广东省",
                            "receiver_city": "深圳市",
                            "receiver_district": "南山区",
                            "receiver_address": "科技园1号",
                            "pay_time": "2026-09-16 10:00:00",
                            "orders": {
                                "order": [
                                    {
                                        "title": "淘宝测试商品",
                                        "num_iid": 111,
                                        "outer_sku_id": "SKU-TB-1",
                                        "price": "99.50",
                                        "num": 1,
                                        "total_fee": "99.50",
                                    },
                                    {
                                        "title": "赠品",
                                        "num_iid": 112,
                                        "price": "28.50",
                                        "num": 1,
                                        "total_fee": "28.50",
                                    },
                                ]
                            },
                        }
                    ]
                },
                "total_results": 1,
            }
        }
    if method == "pdd.goods.list.get":
        return {
            "goods_list_get_response": {
                "goods_list": [
                    {
                        "goods_id": 77777,
                        "goods_name": "拼多多测试商品",
                        "price": 1999,          # 单位：分
                        "quantity": 50,
                        "thumb_url": "https://img/pdd.jpg",
                    }
                ],
                "total_count": 1,
            }
        }
    if method == "pdd.order.list.get":
        return {
            "order_list_get_response": {
                "order_list": [
                    {
                        "order_sn": "PDD20260917001",
                        "order_status": 2,
                        "pay_amount": 3998,      # 单位：分
                        "postage": 0,
                        "receiver_name": "李四",
                        "receiver_address": "上海市浦东新区",
                        "province": "上海市",
                        "city": "上海市",
                        "district": "浦东新区",
                        "item_list": [
                            {
                                "goods_name": "拼多多测试商品",
                                "goods_count": 2,
                                "goods_price": 1999,
                                "goods_amount": 3998,
                            }
                        ],
                    }
                ],
                "total_count": 1,
            }
        }
    if method == "taobao.item.quantity.update":
        return {"item_quantity_update_response": {"item": {"num_iid": 111, "num": 88}}}
    raise AssertionError(f"未预置响应的方法：{method}")


class FakeRpcClient:
    """按表单里的 method/type 分发预置响应。"""

    calls: list[dict] = []

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, content=None, headers=None):
        from urllib.parse import parse_qs

        parsed = {k: v[0] for k, v in parse_qs(content or "").items()}
        FakeRpcClient.calls.append(parsed)
        method = parsed.get("method") or parsed.get("type") or ""
        # 带包 JSON 的业务参数解回来，便于断言
        if "360buy_param_json" in parsed:
            parsed["__biz"] = json.loads(parsed["360buy_param_json"])
        return _Resp(200, _canned(method))


@pytest.fixture
def patch_rpc(monkeypatch):
    import app.services.platforms.rpc_signed as rpc_mod

    FakeRpcClient.calls = []
    monkeypatch.setattr(rpc_mod.httpx, "AsyncClient", FakeRpcClient)
    yield
    FakeRpcClient.calls = []


async def test_taobao_sync_creates_then_updates(
    workspace_id, session_factory, patch_rpc
):
    """首次同步建数据，二次同步只更新 —— 且订单明细不重复。"""
    integration = TaobaoIntegration()
    r1 = await integration.full_sync(FAKE_CFG, workspace_id)
    assert not r1.all_errors, r1.all_errors
    assert r1.products.created == 1
    assert r1.orders.created == 1

    async with session_factory() as db:
        product = (
            await db.execute(
                select(Product).where(Product.workspace_id == workspace_id)
            )
        ).scalar_one()
        order = (
            await db.execute(select(Order).where(Order.workspace_id == workspace_id))
        ).scalar_one()
        items = (
            await db.execute(
                select(func.count(OrderItem.id)).where(OrderItem.order_id == order.id)
            )
        ).scalar()

    assert product.sku == "tb-111"
    assert product.stock == 30
    # 金额列是 Numeric，读出来是 Decimal → 转 float 再比
    assert float(product.price) == pytest.approx(99.50)   # 淘宝价格单位是元，不除以 100
    assert order.order_number == "TB-9001"
    assert order.status == OrderStatus.SHIPPED
    assert order.platform == "taobao"
    assert items == 2

    r2 = await integration.full_sync(FAKE_CFG, workspace_id)
    assert r2.products.created == 0 and r2.products.updated == 1
    assert r2.orders.created == 0 and r2.orders.updated == 1

    async with session_factory() as db:
        order = (
            await db.execute(select(Order).where(Order.workspace_id == workspace_id))
        ).scalar_one()
        items2 = (
            await db.execute(
                select(func.count(OrderItem.id)).where(OrderItem.order_id == order.id)
            )
        ).scalar()
    assert items2 == 2  # 幂等：替换而非追加


async def test_pdd_money_is_converted_from_cents(
    workspace_id, session_factory, patch_rpc
):
    """拼多多金额单位是**分**，落库必须换算成元（与淘宝相反）。"""
    integration = PddIntegration()
    r1 = await integration.full_sync(FAKE_CFG, workspace_id)
    assert not r1.all_errors, r1.all_errors

    async with session_factory() as db:
        product = (
            await db.execute(
                select(Product).where(Product.workspace_id == workspace_id)
            )
        ).scalar_one()
        order = (
            await db.execute(select(Order).where(Order.workspace_id == workspace_id))
        ).scalar_one()

    assert product.sku == "pdd-77777"
    # 金额列是 Numeric，读出来是 Decimal → 转 float 再比
    assert float(product.price) == pytest.approx(19.99)   # 1999 分 → 19.99 元
    assert order.order_number == "PDD-PDD20260917001"
    assert float(order.total) == pytest.approx(39.98)     # 3998 分 → 39.98 元
    assert order.status == OrderStatus.SHIPPED
    assert order.platform == "pdd"


async def test_taobao_inventory_write_updates_local_stock(
    workspace_id, session_factory, patch_rpc
):
    """库存回写成功后，本地库存要同步，避免两边不一致。"""
    integration = TaobaoIntegration()
    await integration.sync_products(FAKE_CFG, workspace_id)

    result = await integration.update_inventory(
        FAKE_CFG, workspace_id, [{"sku": "tb-111", "stock": 88}]
    )
    assert result.succeeded == 1
    assert result.failed == 0

    # 校验发出去的确实是 TOP 口径（全量更新 type=1）
    call = next(c for c in FakeRpcClient.calls if c.get("method") == "taobao.item.quantity.update")
    assert call["num_iid"] == "111"
    assert call["quantity"] == "88"
    assert call["type"] == "1"

    async with session_factory() as db:
        product = (
            await db.execute(
                select(Product).where(Product.workspace_id == workspace_id)
            )
        ).scalar_one()
    assert product.stock == 88


async def test_taobao_price_write_requires_sku_id(
    workspace_id, session_factory, patch_rpc
):
    """单品一口价 TOP 已不支持旧接口 → 必须明确拒绝，而不是发一个必然失败的请求。"""
    integration = TaobaoIntegration()
    result = await integration.update_price(
        FAKE_CFG, workspace_id, [{"sku": "tb-111", "price": 88.0}]
    )
    assert result.failed == 1
    assert "schema" in result.errors[0] or "sku_id" in result.errors[0]
    # 不应真正发出请求
    assert not any(
        c.get("method") == "taobao.item.sku.price.update"
        for c in FakeRpcClient.calls
    )


async def test_jd_ship_requires_numeric_carrier():
    """京东发货要物流公司数字 ID，传中文名要能自动映射；无法识别则明确报错。"""
    integ = JdIntegration()
    # 无法识别 → 拒绝并提示
    result = await integ.ship_order(
        FAKE_CFG, "ws", "JD-123", "SF123456", carrier="不存在的快递"
    )
    assert result.failed == 1
    assert "物流公司" in result.errors[0]

    # 缺少运单号 → 拒绝
    result2 = await integ.ship_order(FAKE_CFG, "ws", "JD-123", "", carrier="顺丰速运")
    assert result2.failed == 1

    # 订单号前缀不对 → 拒绝
    result3 = await integ.ship_order(
        FAKE_CFG, "ws", "UNKNOWN-1", "SF123", carrier="顺丰速运"
    )
    assert result3.failed == 1
    assert "JD-" in result3.errors[0]


def test_carrier_id_map_covers_major_couriers():
    from app.services.platforms.jd import CARRIER_ID_MAP

    for name in ("中通快递", "韵达快递", "申通快递", "圆通速递", "顺丰速运", "京东快递"):
        assert name in CARRIER_ID_MAP
        assert CARRIER_ID_MAP[name].isdigit()


async def test_sync_errors_are_friendly_not_raw():
    """平台报错要以中文可操作结论呈现，不能把裸错误码抛给商家。"""
    integration = TaobaoIntegration()
    result = await integration.sync_orders({**FAKE_CFG, "api_key": ""}, "ws-x")
    # sync_orders 返回的是 SyncResult（不是聚合的 FullSyncResult）
    assert result.created == 0
    assert result.updated == 0
    assert result.errors
    # 缺 AppKey 要说清是凭证问题，而不是抛一个数字错误码
    assert "AppKey" in result.errors[0] or "凭证" in result.errors[0]


async def test_write_helpers_reject_non_numeric_ids():
    """回归：ID 抽取必须校验数字 —— 否则会把任意字符串塞进 int() 崩掉。

    实测踩坑：``ship_order("UNKNOWN-1")`` 曾直接抛
    ``ValueError: invalid literal for int() with base 10``。
    """
    jd = JdIntegration()
    r = await jd.ship_order(FAKE_CFG, "ws", "UNKNOWN-1", "SF123", carrier="顺丰速运")
    assert r.failed == 1
    assert "JD-" in r.errors[0]

    tb = TaobaoIntegration()
    r2 = await tb.update_inventory(
        FAKE_CFG, "ws", [{"sku": "手填编码", "stock": 5}]
    )
    assert r2.failed == 1
    assert "num_iid" in r2.errors[0]

    pdd = PddIntegration()
    r3 = await pdd.update_inventory(
        FAKE_CFG, "ws", [{"sku": "abc-xyz", "stock": 5}]
    )
    assert r3.failed == 1
    assert "goods_id" in r3.errors[0]


def test_digits_after_prefix_validates():
    from app.services.platforms.rpc_signed import digits_after_prefix

    assert digits_after_prefix("tb-123", "tb-") == "123"
    assert digits_after_prefix("123", "tb-") == "123"
    assert digits_after_prefix("tb-abc", "tb-") is None
    assert digits_after_prefix("", "tb-") is None
    assert digits_after_prefix("tb-", "tb-") is None
