"""店铺平台接入 API 测试.

覆盖：
  - ``GET /stores/platforms`` 平台能力目录
  - 写操作的**能力门控**：不支持该能力的平台必须 400 且说明原因，
    而不是发一个注定失败的请求
  - ``sandbox`` 字段能正确存取（沙箱开关必须能带进适配器配置，
    否则在沙箱店铺做写操作会改到真实数据）
"""

import pytest
from sqlalchemy import select

from app.models.store import Store

BASE = "/api/v1/workspaces/test-workspace/stores"


async def _create_store(async_client, auth_headers, **overrides):
    payload = {
        "name": "测试店铺",
        "platform": "taobao",
        "api_key": "ak-123",
        "api_secret": "sk-123",
        "access_token": "tok-123",
    }
    payload.update(overrides)
    resp = await async_client.post(BASE, json=payload, headers=auth_headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_platform_catalog_exposes_capabilities(
    async_client, auth_headers
):
    resp = await async_client.get(f"{BASE}/platforms", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    catalog = {item["platform"]: item for item in resp.json()}

    # 国产三巨头已实现且声明了双向能力
    for name in ("taobao", "jd", "pdd"):
        assert catalog[name]["implemented"] is True
        caps = catalog[name]["capabilities"]
        assert "read" in caps
        assert "write_inventory" in caps
        assert "write_price" in caps
        assert "ship_order" in caps
        # 必须如实给出资质门槛，不能粉饰
        assert catalog[name]["qualification_note"]

    # 只有淘宝有公开沙箱网关
    assert catalog["taobao"]["sandbox_supported"] is True
    assert catalog["jd"]["sandbox_supported"] is False
    assert catalog["pdd"]["sandbox_supported"] is False

    # 未实现的平台要标出来，前端才能禁用
    assert catalog["amazon"]["implemented"] is False

    # 只读平台不应声明写能力（否则前端会显示点了就报错的按钮）
    assert catalog["shopify"]["capabilities"] == ["read"]


async def test_platform_catalog_credential_labels(async_client, auth_headers):
    """不同平台对同一字段的叫法不同，前端要拿到正确标签。"""
    resp = await async_client.get(f"{BASE}/platforms", headers=auth_headers)
    catalog = {item["platform"]: item for item in resp.json()}
    assert catalog["pdd"]["credential_labels"]["api_key"] == "ClientID"
    assert catalog["taobao"]["credential_labels"]["access_token"].startswith(
        "SessionKey"
    )


async def test_sandbox_flag_round_trips(
    async_client, auth_headers, session_factory
):
    """沙箱开关必须存得下、读得出 —— 丢失会导致写操作打到生产环境。"""
    created = await _create_store(async_client, auth_headers, sandbox=True)
    assert created["sandbox"] is True

    resp = await async_client.get(
        f"{BASE}/{created['id']}", headers=auth_headers
    )
    assert resp.json()["sandbox"] is True

    async with session_factory() as db:
        row = (
            await db.execute(select(Store).where(Store.id == created["id"]))
        ).scalar_one()
        assert bool(row.sandbox) is True


async def test_sandbox_defaults_to_false(async_client, auth_headers):
    created = await _create_store(async_client, auth_headers)
    assert created["sandbox"] is False


async def test_write_gated_on_unsupported_platform(
    async_client, auth_headers
):
    """Shopify 未声明库存写能力 → 必须 400 并说明，不能真去调平台。"""
    store = await _create_store(
        async_client,
        auth_headers,
        platform="shopify",
        store_url="https://x.myshopify.com",
        access_token="shpat_x",
    )
    resp = await async_client.post(
        f"{BASE}/{store['id']}/inventory",
        json={"items": [{"sku": "abc", "stock": 5}]},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert "不支持" in resp.json()["detail"]


async def test_write_rejects_unknown_store(async_client, auth_headers):
    resp = await async_client.post(
        f"{BASE}/no-such-store/inventory",
        json={"items": [{"sku": "abc", "stock": 5}]},
        headers=auth_headers,
    )
    assert resp.status_code == 404


async def test_write_validates_payload(async_client, auth_headers):
    """请求体校验：SKU 不能为空、库存不能为负、items 不能为空。"""
    store = await _create_store(async_client, auth_headers)

    resp = await async_client.post(
        f"{BASE}/{store['id']}/inventory",
        json={"items": []},
        headers=auth_headers,
    )
    assert resp.status_code == 422

    resp2 = await async_client.post(
        f"{BASE}/{store['id']}/inventory",
        json={"items": [{"sku": "tb-123", "stock": -5}]},
        headers=auth_headers,
    )
    assert resp2.status_code == 422


async def test_write_returns_per_item_result(async_client, auth_headers):
    """写操作要返回**逐条**结果，不能把一批的成败糊成一个 500。

    这里用一个格式非法的 SKU 触发参数错误：整体仍应是 HTTP 200，
    ``failed=1`` 且错误文案指出是 num_iid 的问题。
    """
    store = await _create_store(async_client, auth_headers)

    resp = await async_client.post(
        f"{BASE}/{store['id']}/inventory",
        json={"items": [{"sku": "手填的非法编码", "stock": 5}]},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["operation"] == "库存回写"
    assert body["failed"] == 1
    assert body["succeeded"] == 0
    assert body["total"] == 1
    # 错误要说清是 num_iid 问题，而不是抛裸异常
    assert "num_iid" in body["errors"][0]


async def test_ship_rejects_bad_order_prefix(async_client, auth_headers):
    """订单号格式不对要给出明确提示，不能崩在 int() 上。"""
    store = await _create_store(async_client, auth_headers)
    resp = await async_client.post(
        f"{BASE}/{store['id']}/orders/NOT-A-TAOBAO-ORDER/ship",
        json={"tracking_number": "SF123456", "carrier": "顺丰速运"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["failed"] == 1
    assert "TB-" in body["errors"][0]


async def test_platform_catalog_requires_auth(async_client):
    resp = await async_client.get(f"{BASE}/platforms")
    assert resp.status_code in (401, 403)
