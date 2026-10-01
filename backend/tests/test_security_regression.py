"""安全回归测试 —— 锁住 2026-09-20 审计中修复的 P0 问题。

每个用例对应一条**真实攻击链**，而不是形式化断言。任何一条回归，都意味着
收入或数据面临直接风险：

    1. SPA catch-all 路径穿越 → 任意文件读取（含 .env 与数据库）
    2. verify-payment 零元激活付费订阅
    3. switch-plan 降级洗白 → 零元开通 Pro
    4. sandbox-confirm 自助置已付（生产环境必须失效）
    5. 付费一次得约 10 年服务（Free 订阅虚假远期周期被计入续费叠加）

本文件在修复前应当是红的 —— 如果你回滚了上面的修复，这些用例必须失败。
"""

import uuid
from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

from app.models.subscription import (
    PaymentStatus,
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
)
from app.utils.security import create_access_token, decode_token, get_token_jti
from app.utils.timeutils import to_naive_utc
from app.utils.uploads import detect_image_extension
from app.utils.urls import UnsafeUrlError, validate_outbound_url

# workspace_id fixture 创建的固定 slug
WS_SLUG = "test-workspace"


async def _create_plan(session_factory, slug: str, price_monthly: float) -> str:
    """插入一个套餐并返回其 id。"""
    plan_id = str(uuid.uuid4())
    async with session_factory() as db:
        db.add(
            SubscriptionPlan(
                id=plan_id,
                name=slug.title(),
                slug=slug,
                price_monthly=price_monthly,
                price_yearly=price_monthly * 10,
                max_members=20,
                max_workspaces=5,
                features={},
                is_active=True,
            )
        )
        await db.commit()
    return plan_id


async def _get_subscription(session_factory, workspace_id: str) -> Subscription | None:
    async with session_factory() as db:
        return (
            await db.execute(
                select(Subscription).where(Subscription.workspace_id == workspace_id)
            )
        ).scalars().first()


# ---------------------------------------------------------------------------
# 1. 路径穿越
# ---------------------------------------------------------------------------

async def test_spa_catch_all_blocks_path_traversal():
    """catch-all 只能服务 frontend/dist 内的文件。

    修复前 ``GET /..%2f..%2fbackend%2f.env`` 会原样返回 .env，其中的
    SECRET_KEY 可用于离线伪造任意用户的 JWT。
    """
    from app.main import app

    route = next(
        (r for r in app.routes if getattr(r, "path", None) == "/{full_path:path}"),
        None,
    )
    if route is None:
        pytest.skip("frontend/dist 未构建，SPA catch-all 路由未注册")

    escapes = [
        "../../backend/.env",
        "../../backend/app/config.py",
        "..%2f..%2fbackend%2f.env",
        "%2e%2e%2f%2e%2e%2fbackend%2f.env",
        "..\\..\\backend\\.env",
        "/etc/passwd",
    ]
    for payload in escapes:
        response = await route.endpoint(payload)
        served = str(getattr(response, "path", ""))
        assert served.endswith("index.html"), (
            f"payload {payload!r} 逃出了 frontend/dist，实际返回 {served}"
        )


async def test_spa_catch_all_still_serves_real_assets():
    """收紧后仍必须能正常服务 dist 内的真实文件（别把功能修坏）。"""
    from app.main import app

    route = next(
        (r for r in app.routes if getattr(r, "path", None) == "/{full_path:path}"),
        None,
    )
    if route is None:
        pytest.skip("frontend/dist 未构建，SPA catch-all 路由未注册")

    # 不存在的路由回退到 SPA 入口，这是客户端路由的正常行为
    response = await route.endpoint("dashboard/settings")
    assert str(getattr(response, "path", "")).endswith("index.html")


# ---------------------------------------------------------------------------
# 2. verify-payment 必须已移除
# ---------------------------------------------------------------------------

async def test_verify_payment_endpoint_is_gone(async_client, auth_headers, workspace_id):
    """该端点只要求 OWNER 角色，调用后订阅直接从 incomplete 变 active。"""
    resp = await async_client.post(
        f"/api/v1/subscriptions/workspace/{WS_SLUG}/verify-payment",
        headers=auth_headers,
    )
    assert resp.status_code in (404, 405), (
        f"verify-payment 仍然可用（HTTP {resp.status_code}）—— 零元激活漏洞已回归"
    )


# ---------------------------------------------------------------------------
# 3. switch-plan 不能洗白未付款订阅
# ---------------------------------------------------------------------------

async def test_switch_plan_cannot_launder_unpaid_subscription(
    async_client, auth_headers, session_factory, workspace_id
):
    """「先升 enterprise → 再降 pro」不得把未付款订阅变成 ACTIVE。"""
    await _create_plan(session_factory, "pro", 29.0)
    await _create_plan(session_factory, "enterprise", 99.0)
    free_id = await _create_plan(session_factory, "free", 0.0)

    async with session_factory() as db:
        db.add(
            Subscription(
                id=str(uuid.uuid4()),
                workspace_id=workspace_id,
                plan_id=free_id,
                status=SubscriptionStatus.ACTIVE,
                payment_status=PaymentStatus.VERIFIED,
                current_period_start=datetime.utcnow(),
                current_period_end=None,
            )
        )
        await db.commit()

    upgrade = await async_client.post(
        f"/api/v1/subscriptions/workspace/{WS_SLUG}/switch-plan",
        json={"plan_slug": "enterprise"},
        headers=auth_headers,
    )
    assert upgrade.status_code == 200, upgrade.text
    assert upgrade.json()["status"] == "incomplete"
    assert upgrade.json()["payment_status"] == "pending"

    downgrade = await async_client.post(
        f"/api/v1/subscriptions/workspace/{WS_SLUG}/switch-plan",
        json={"plan_slug": "pro"},
        headers=auth_headers,
    )
    assert downgrade.status_code == 402, (
        f"降级洗白仍然可行（HTTP {downgrade.status_code}）：{downgrade.text}"
    )

    sub = await _get_subscription(session_factory, workspace_id)
    assert sub.status == SubscriptionStatus.INCOMPLETE
    assert sub.payment_status == PaymentStatus.PENDING


# ---------------------------------------------------------------------------
# 4. sandbox-confirm 在生产环境必须失效
# ---------------------------------------------------------------------------

async def test_sandbox_confirm_is_disabled_in_production(
    async_client, auth_headers, session_factory, workspace_id, monkeypatch
):
    """生产环境不得允许自助把订单置为已付。

    修复前唯一守门条件是「微信是否配置齐全」，与订单实际通道脱钩 ——
    生产漏配证书时任何 OWNER 都能把自己的真实订单置为已付。
    """
    from app.models.subscription_order import SubscriptionOrder

    await _create_plan(session_factory, "pro", 29.0)

    checkout = await async_client.post(
        f"/api/v1/workspaces/{WS_SLUG}/billing/checkout",
        json={"plan_slug": "pro", "period": "month", "method": "alipay"},
        headers=auth_headers,
    )
    assert checkout.status_code == 200, checkout.text
    order_id = checkout.json()["order_id"]

    monkeypatch.setattr("app.config.settings.ENVIRONMENT", "production")

    confirm = await async_client.post(
        f"/api/v1/workspaces/{WS_SLUG}/billing/sandbox-confirm/{order_id}",
        headers=auth_headers,
    )
    assert confirm.status_code == 404, (
        f"生产环境仍可自助置已付（HTTP {confirm.status_code}）：{confirm.text}"
    )

    async with session_factory() as db:
        order = (
            await db.execute(
                select(SubscriptionOrder).where(SubscriptionOrder.id == order_id)
            )
        ).scalar_one()
    assert order.status == "pending", "订单被自助置为已付，资损漏洞已回归"


# ---------------------------------------------------------------------------
# 5. 计费周期：首次购买只给一个周期
# ---------------------------------------------------------------------------

async def test_first_purchase_grants_one_month_not_ten_years(
    patch_session, session_factory, workspace_id
):
    """即使存在历史遗留的远期到期时间，首次购买也只能得到一个计费周期。"""
    from app.api.billing import _activate_subscription
    from app.models.subscription_order import SubscriptionOrder

    free_id = await _create_plan(session_factory, "free", 0.0)
    pro_id = await _create_plan(session_factory, "pro", 29.0)

    # 复现历史遗留状态：Free 订阅带着一个「10 年后」的到期时间
    now = datetime.utcnow()
    async with session_factory() as db:
        db.add(
            Subscription(
                id=str(uuid.uuid4()),
                workspace_id=workspace_id,
                plan_id=free_id,
                status=SubscriptionStatus.ACTIVE,
                payment_status=PaymentStatus.VERIFIED,
                current_period_start=now,
                current_period_end=now.replace(year=now.year + 10),
            )
        )
        await db.commit()

    order = SubscriptionOrder(
        id=str(uuid.uuid4()),
        workspace_id=workspace_id,
        plan_slug="pro",
        plan_name="Pro",
        period="month",
        amount=29.0,
        method="wechat_native",
        status="paid",
    )
    async with session_factory() as db:
        await _activate_subscription(db, order)

    sub = await _get_subscription(session_factory, workspace_id)
    assert sub.plan_id == pro_id
    assert sub.status == SubscriptionStatus.ACTIVE

    remaining = to_naive_utc(sub.current_period_end) - datetime.utcnow()
    assert timedelta(days=29) <= remaining <= timedelta(days=31), (
        f"首次购买获得了约 {remaining.days} 天服务，应为约 30 天 —— "
        "说明续费叠加又把历史遗留周期算进去了"
    )


async def test_same_plan_renewal_extends_period(patch_session, session_factory, workspace_id):
    """同一套餐续费应当顺延（别为了修漏洞把正常续费也砍掉）。"""
    from app.api.billing import _activate_subscription
    from app.models.subscription_order import SubscriptionOrder

    pro_id = await _create_plan(session_factory, "pro", 29.0)
    now = datetime.utcnow()

    async with session_factory() as db:
        db.add(
            Subscription(
                id=str(uuid.uuid4()),
                workspace_id=workspace_id,
                plan_id=pro_id,
                status=SubscriptionStatus.ACTIVE,
                payment_status=PaymentStatus.VERIFIED,
                current_period_start=now,
                current_period_end=now + timedelta(days=10),
            )
        )
        await db.commit()

    order = SubscriptionOrder(
        id=str(uuid.uuid4()),
        workspace_id=workspace_id,
        plan_slug="pro",
        plan_name="Pro",
        period="month",
        amount=29.0,
        method="wechat_native",
        status="paid",
    )
    async with session_factory() as db:
        await _activate_subscription(db, order)

    sub = await _get_subscription(session_factory, workspace_id)
    remaining = to_naive_utc(sub.current_period_end) - datetime.utcnow()
    # 剩余 10 天 + 新购 30 天 ≈ 40 天
    assert timedelta(days=39) <= remaining <= timedelta(days=41), (
        f"续费后剩余 {remaining.days} 天，应约为 40 天（10 天余额 + 30 天）"
    )


# ---------------------------------------------------------------------------
# 6. Free 订阅不应有到期时间
# ---------------------------------------------------------------------------

async def test_new_workspace_free_subscription_has_no_expiry(
    async_client, auth_headers, session_factory, workspace_id
):
    """Free 套餐没有到期概念；有到期时间就会被计费逻辑当作可顺延的已付周期。"""
    await _create_plan(session_factory, "free", 0.0)

    slug = f"sec-{uuid.uuid4().hex[:8]}"
    resp = await async_client.post(
        "/api/v1/workspaces",
        json={"name": "Security WS", "slug": slug},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    new_id = resp.json()["id"]

    sub = await _get_subscription(session_factory, new_id)
    assert sub is not None, "新工作空间应当自动获得 Free 订阅"
    assert sub.current_period_end is None, (
        f"Free 订阅被写入了到期时间 {sub.current_period_end}，"
        "会让付费周期被错误顺延"
    )


# ===========================================================================
# P1 批次（2026-09-20 第二批修复）
#
# 每个用例对应一个真实攻击面。与 P0 部分同样要求：**回滚对应修复后必须变红**。
# ===========================================================================


# ---------------------------------------------------------------------------
# P1-1 出站 URL 校验（SSRF）
# ---------------------------------------------------------------------------

def test_outbound_url_blocks_internal_and_bad_schemes():
    """内网 / 环回 / 云元数据地址与非法协议必须被拒。"""
    blocked = [
        "http://127.0.0.1/hook",
        "http://127.0.0.1:8000/hook",
        "http://localhost/hook",
        "http://169.254.169.254/latest/meta-data/",
        "http://10.0.0.5/hook",
        "http://192.168.1.10/hook",
        "http://172.16.0.9/hook",
        "http://[::1]/hook",
        "http://0.0.0.0/hook",
        "file:///etc/passwd",
        "ftp://example.com/hook",
        "gopher://example.com/hook",
        "",
    ]
    for url in blocked:
        with pytest.raises(UnsafeUrlError):
            validate_outbound_url(url)


def test_outbound_url_accepts_public_address():
    """公网地址必须放行 —— 别把正常功能修坏。

    用字面 IPv4（1.1.1.1）避免依赖 DNS，保证离线环境同样可跑。
    """
    url = "https://1.1.1.1/hook"
    assert validate_outbound_url(url) == url


# ---------------------------------------------------------------------------
# P1-2 上传类型按内容判定
# ---------------------------------------------------------------------------

def test_image_extension_comes_from_content_not_filename():
    """扩展名必须由文件内容决定，HTML 伪装成图片要被识别出来。"""
    assert detect_image_extension(b"\x89PNG\r\n\x1a\n" + b"\x00" * 32) == "png"
    assert detect_image_extension(b"\xff\xd8\xff\xe0" + b"\x00" * 32) == "jpg"
    assert detect_image_extension(b"GIF89a" + b"\x00" * 16) == "gif"
    assert detect_image_extension(b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 8) == "webp"

    # 关键：脚本 / HTML 伪装成 image/png（Content-Type 客户端可控）时必须判为非法
    assert detect_image_extension(b"<html><script>alert(1)</script></html>") is None
    assert detect_image_extension(b"") is None
    assert detect_image_extension(b"short") is None


# ---------------------------------------------------------------------------
# P1-3 JWT jti（吊销的前提）
# ---------------------------------------------------------------------------

def test_access_token_carries_jti():
    """没有 jti 就无法吊销 —— 登出 / 改密会形同虚设。"""
    payload = decode_token(create_access_token("user-123"))
    assert payload is not None
    assert payload.get("jti"), "access token 缺少 jti，吊销机制无法工作"
    assert payload.get("type") == "access"


def test_get_token_jti_returns_remaining_ttl():
    """黑名单条目的 TTL 应等于令牌剩余寿命。"""
    token = create_access_token("user-123", expires_delta=timedelta(minutes=30))
    jti, ttl = get_token_jti(token)
    assert jti
    assert 25 * 60 <= ttl <= 30 * 60, f"TTL 计算异常: {ttl}"

    assert get_token_jti("not-a-jwt") == (None, 0)


# ---------------------------------------------------------------------------
# P1-4 /metrics 鉴权
# ---------------------------------------------------------------------------

async def test_metrics_is_denied_in_production_without_token(async_client, monkeypatch):
    """生产环境未配置 METRICS_TOKEN 时必须拒绝，而不是把指标公开出去。"""
    monkeypatch.setattr("app.config.settings.ENVIRONMENT", "production")
    monkeypatch.setattr("app.config.settings.METRICS_TOKEN", "")

    resp = await async_client.get("/metrics")
    assert resp.status_code == 403, (
        f"生产环境 /metrics 未受保护（HTTP {resp.status_code}）"
    )


async def test_metrics_rejects_wrong_token(async_client, monkeypatch):
    monkeypatch.setattr("app.config.settings.ENVIRONMENT", "production")
    monkeypatch.setattr("app.config.settings.METRICS_TOKEN", "s3cret-token")

    assert (await async_client.get("/metrics")).status_code == 401


async def test_process_metrics_requires_login(async_client):
    """进程指标会暴露内存 / CPU / 连接数，不应匿名可读。"""
    resp = await async_client.get("/metrics/process")
    assert resp.status_code in (401, 403), (
        f"/metrics/process 匿名可读（HTTP {resp.status_code}）"
    )


# ---------------------------------------------------------------------------
# P1-5 /health 真实反映依赖状态
# ---------------------------------------------------------------------------

async def test_health_returns_503_when_database_unavailable(async_client, monkeypatch):
    """数据库不可用必须返回 503，否则编排层的 healthCheck 发现不了故障。"""
    async def _db_down(_session):
        return False

    monkeypatch.setattr("app.api.system._check_db", _db_down)

    resp = await async_client.get("/health")
    assert resp.status_code == 503, (
        f"数据库不可用但 /health 仍返回 {resp.status_code} —— healthCheck 形同虚设"
    )
    assert resp.json()["status"] == "unhealthy"


async def test_health_stays_200_when_only_redis_is_down(async_client, monkeypatch):
    """Redis 是可选加速器：不可用时仍应 200（degraded），避免实例被误重启。"""
    async def _db_up(_session):
        return True

    async def _redis_down():
        return False

    monkeypatch.setattr("app.api.system._check_db", _db_up)
    monkeypatch.setattr("app.api.system._check_redis", _redis_down)

    resp = await async_client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "degraded"
    assert resp.json()["redis"] == "unavailable"


# ---------------------------------------------------------------------------
# P1-6 密码重置令牌不回显
# ---------------------------------------------------------------------------

async def test_forgot_password_does_not_expose_reset_token(async_client, session_factory):
    """默认必须不回显。此前条件是 DEBUG or ENVIRONMENT==development，两者默认都为真。"""
    from app.models.user import User
    from app.utils.security import hash_password

    email = f"rp-{uuid.uuid4().hex[:8]}@example.com"
    async with session_factory() as db:
        db.add(
            User(
                id=str(uuid.uuid4()),
                email=email,
                password_hash=hash_password("Test1234!"),
                full_name="Reset Probe",
            )
        )
        await db.commit()

    resp = await async_client.post("/api/v1/auth/forgot-password", json={"email": email})
    assert resp.status_code == 200, resp.text
    assert "reset_token" not in resp.json(), (
        "重置令牌被回显给调用方 —— 攻击者可据此直接接管账号"
    )


# ---------------------------------------------------------------------------
# P1-7 门控 fail-closed
# ---------------------------------------------------------------------------

async def test_ai_gating_fails_closed_on_error(
    async_client, auth_headers, workspace_id, monkeypatch
):
    """门控查询异常时必须拒绝（403），而不是放行。"""
    async def _boom(_db, _ws_id):
        raise RuntimeError("subscription table unavailable")

    monkeypatch.setattr("app.api.billing.get_ws_plan_tier", _boom)

    resp = await async_client.get(
        f"/api/v1/workspaces/{WS_SLUG}/ai/predictions",
        headers=auth_headers,
    )
    assert resp.status_code == 403, (
        f"计费查询异常时 Pro 专属端点被放行（HTTP {resp.status_code}）—— fail-open 回归"
    )


# ---------------------------------------------------------------------------
# P1-8 Webhook 端点级 SSRF
# ---------------------------------------------------------------------------

async def test_create_webhook_rejects_internal_url(
    async_client, auth_headers, workspace_id
):
    """自注册用户即 OWNER：若不校验就能把 webhook 指向云元数据服务。"""
    resp = await async_client.post(
        f"/api/v1/workspaces/{WS_SLUG}/webhooks",
        json={
            "name": "metadata probe",
            "url": "http://169.254.169.254/latest/meta-data/",
            "events": ["order.created"],
        },
        headers=auth_headers,
    )
    assert resp.status_code == 400, (
        f"内网 webhook 地址被接受（HTTP {resp.status_code}）—— SSRF 防护回归"
    )


async def test_update_webhook_rejects_internal_url(
    async_client, auth_headers, workspace_id
):
    """不能靠「先建合法 URL、再 PATCH 成内网地址」绕过。"""
    created = await async_client.post(
        f"/api/v1/workspaces/{WS_SLUG}/webhooks",
        json={
            "name": "legit",
            "url": "https://1.1.1.1/hook",
            "events": ["order.created"],
        },
        headers=auth_headers,
    )
    if created.status_code != 201:
        pytest.skip(f"创建合法 webhook 失败（HTTP {created.status_code}），跳过更新用例")

    hook_id = created.json().get("id")
    resp = await async_client.patch(
        f"/api/v1/workspaces/{WS_SLUG}/webhooks/{hook_id}",
        json={"url": "http://127.0.0.1:8000/health"},
        headers=auth_headers,
    )
    assert resp.status_code == 400, (
        f"更新端点未做 SSRF 校验（HTTP {resp.status_code}）—— 可从 PATCH 绕过"
    )
