"""AI 模型注册表 / 运行时热切换 测试。

覆盖三块：
  1. 错误分类 —— 必须区分「模型未开通」与「Key 无效」（实测踩过坑：
     专属网关返回 Access denied 被误判成 Key 坏了，会把人带偏）
  2. 注册表行为 —— 幂等装载 / 唯一 active / 切换 / 自定义模型保护
  3. 热切换真的生效 —— `_get_qwen_config()` 必须跟着注册表走
     （这是整个功能的地基：所有 AI 调用都从这个收口取 model）
"""

import pytest
import pytest_asyncio

from app.services import model_registry as mr


@pytest_asyncio.fixture(autouse=True)
def _clean_runtime_state():
    """每个用例前后清空进程内状态，避免用例间互相污染。"""
    mr.reset_runtime_state()
    yield
    mr.reset_runtime_state()


# ----------------------------------------------------------------------
# 1. 错误分类
# ----------------------------------------------------------------------

@pytest.mark.parametrize(
    "status, message, expected",
    [
        # 专属网关未部署该模型 —— 是「没开通」，不是「Key 坏了」
        (403, '{"error":{"message":"Access denied","id":"x"}}', "denied"),
        (200, '{"error":{"message":"Permission denied"}}', "denied"),
        # 真实案例：百炼额度耗尽返回 403 + "Free quota exhausted"。
        # 若按 403 判成 unauthorized，会把「该换模型」误导成「Key 坏了」
        (
            403,
            '{"error":{"message":"Free quota exhausted. To continue accessing '
            'the model on a paid basis, please ..."}}',
            "exhausted",
        ),
        # 该模型只支持流式
        (400, '{"error":{"message":"This model only support stream mode"}}', "stream_only"),
        # 额度 / 欠费
        (400, '{"error":{"code":"Arrearage","message":"欠费"}}', "exhausted"),
        (400, '{"error":{"message":"Free quota exhausted"}}', "exhausted"),
        # 限流（是「一时打太快」，与额度耗尽处置方式不同）
        (429, '{"error":{"message":"Requests rate limit exceeded"}}', "throttled"),
        (200, '{"error":{"message":"Requests throttled"}}', "throttled"),
        # 模型名不存在
        (404, '{"error":{"message":"Model not found"}}', "not_found"),
        # 凭证本身无效
        (401, '{"error":{"code":"InvalidApiKey","message":"Invalid API-key provided"}}', "unauthorized"),
        # 文本无强语义时按状态码兜底。
        # 注意 403/forbidden → denied（未开通）而非 unauthorized：
        # 403 的字面含义是「禁止访问」，把用户引去检查 API Key 才是误伤；
        # 真正 Key 无效时上游给的是 401 + InvalidApiKey。
        (403, "forbidden", "denied"),
        (401, "unauthorized", "unauthorized"),
        (500, "internal error", "error"),
    ],
)
def test_classify_error(status, message, expected):
    assert mr.classify_error(status, message) == expected


def test_access_denied_is_not_reported_as_bad_key():
    """回归：曾经把 Access denied 归成 unauthorized，会让人以为要去换 Key。"""
    assert mr.classify_error(403, '{"error":{"message":"Access denied"}}') != "unauthorized"


def test_quota_exhausted_403_is_not_reported_as_bad_key():
    """回归（最关键的一条）：额度耗尽必须报「额度耗尽」，不能报「Key 无效」。

    报错文本里的语义优先于裸 403 —— 这是本功能的核心信号。
    """
    msg = '{"error":{"message":"Free quota exhausted. To continue accessing the model..."}}'
    assert mr.classify_error(403, msg) == "exhausted"
    assert mr.classify_error(403, msg) != "unauthorized"


def test_quota_labels_cover_all_statuses():
    """每个可能出现的状态都要有中文展示文案，否则前端会露出原始英文码。"""
    for status in [
        "unknown", "ok", "exhausted", "throttled", "denied",
        "stream_only", "unauthorized", "not_found", "error",
    ]:
        assert status in mr.QUOTA_LABELS


# ----------------------------------------------------------------------
# 2. 注册表行为
# ----------------------------------------------------------------------

def test_active_model_falls_back_to_settings_without_cache():
    """缓存未装载时（启动早期/测试）必须回落到 .env，而不是抛异常。"""
    from app.config import settings

    assert mr.get_active_model_cached() is None
    assert mr.get_active_model() == settings.QWEN_MODEL


async def test_hydrate_seeds_catalog_and_is_idempotent(session_factory, patch_session):
    first = await mr.hydrate()
    assert first  # 返回生效模型名

    from sqlalchemy import select

    from app.models.ai_model import AIModel

    async with session_factory() as db:
        rows = (await db.execute(select(AIModel))).scalars().all()
        count_after_first = len(rows)
        # 有且仅有一个 active
        assert sum(1 for r in rows if r.is_active) == 1
        # 目录已写入
        assert count_after_first == len(mr.MODEL_CATALOG)
        # 缓存已装载
        assert mr.get_active_model_cached() is not None

    # 再跑一次（等价于重启）不应产生重复行
    await mr.hydrate()
    async with session_factory() as db:
        rows2 = (await db.execute(select(AIModel))).scalars().all()
        assert len(rows2) == count_after_first
        assert sum(1 for r in rows2 if r.is_active) == 1


async def test_set_active_switches_model_and_cache(session_factory, patch_session):
    await mr.hydrate()

    from sqlalchemy import select

    from app.models.ai_model import AIModel

    async with session_factory() as db:
        row = await mr.set_active(db, "qwen-max", "admin@example.com")
        await db.commit()
        assert row.model_id == "qwen-max"
        assert row.activated_by == "admin@example.com"

    # 缓存立即生效（无需重启）
    assert mr.get_active_model() == "qwen-max"
    assert mr.get_active_model_cached() == "qwen-max"

    async with session_factory() as db:
        rows = (await db.execute(select(AIModel))).scalars().all()
        actives = [r.model_id for r in rows if r.is_active]
        assert actives == ["qwen-max"], "同一时刻只能有一个 active"


async def test_set_active_unknown_model_raises(session_factory, patch_session):
    await mr.hydrate()
    async with session_factory() as db:
        with pytest.raises(LookupError):
            await mr.set_active(db, "definitely-not-a-model", "admin@example.com")


async def test_switching_back_clears_stale_failure_mark(session_factory, patch_session):
    """切走再切回来时，旧的「已耗尽」标记不应继续误导用户。"""
    await mr.hydrate()
    await mr.record_quota_state("qwen-max", "exhausted", "Free quota exhausted")
    assert mr.quota_for("qwen-max")["status"] == "exhausted"

    async with session_factory() as db:
        await mr.set_active(db, "qwen-max", "admin@example.com")
        await db.commit()

    assert mr.quota_for("qwen-max")["status"] == "unknown"


async def test_custom_model_upsert_and_delete_protection(session_factory, patch_session):
    await mr.hydrate()

    async with session_factory() as db:
        row = await mr.upsert_custom(db, "qwen3-max", "Qwen3 Max", "新模型", "a@b.c")
        await db.commit()
        assert row.is_custom is True
        assert row.family == "custom"

    # 自定义模型可以删除
    async with session_factory() as db:
        assert await mr.delete_model(db, "qwen3-max") is True
        await db.commit()

    # 内置模型不允许删除
    async with session_factory() as db:
        assert await mr.delete_model(db, "qwen-plus") is False

    # 当前生效的模型不允许删除（会把手切换断掉）
    async with session_factory() as db:
        await mr.upsert_custom(db, "my-model", "My", None, "a@b.c")
        await mr.set_active(db, "my-model", "a@b.c")
        await db.commit()
        assert await mr.delete_model(db, "my-model") is False


# ----------------------------------------------------------------------
# 3. 用量统计
# ----------------------------------------------------------------------

def test_record_usage_accumulates():
    mr.record_usage("qwen-plus", {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150})
    mr.record_usage("qwen-plus", {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15})
    u = mr.usage_for("qwen-plus")
    assert u["calls"] == 2
    assert u["total_tokens"] == 165
    assert u["prompt_tokens"] == 110

    # 只统计调用次数，不因缺 usage 而报错
    mr.record_usage("qwen-turbo", None)
    assert mr.usage_for("qwen-turbo")["calls"] == 1
    assert mr.usage_for("qwen-turbo")["total_tokens"] == 0


def test_record_usage_derives_total_when_missing():
    mr.record_usage("qwen-long", {"prompt_tokens": 7, "completion_tokens": 3})
    assert mr.usage_for("qwen-long")["total_tokens"] == 10


def test_usage_is_isolated_per_model():
    mr.record_usage("qwen-plus", {"total_tokens": 100})
    mr.record_usage("qwen-max", {"total_tokens": 5})
    assert mr.usage_for("qwen-plus")["total_tokens"] == 100
    assert mr.usage_for("qwen-max")["total_tokens"] == 5


# ----------------------------------------------------------------------
# 4. 热切换真的改变了 AI 调用所用的模型（核心集成断言）
# ----------------------------------------------------------------------

async def test_qwen_config_follows_runtime_switch(session_factory, patch_session):
    """切模型后，所有 AI 调用共用的 `_get_qwen_config()` 必须返回新模型。"""
    from app.config import settings
    from app.services.ai import _get_qwen_config

    await mr.hydrate()

    # 切换前 = .env 默认
    assert _get_qwen_config()[1] == settings.QWEN_MODEL

    async with session_factory() as db:
        await mr.set_active(db, "qwen-max", "admin@example.com")
        await db.commit()

    key, model, base_url = _get_qwen_config()
    assert model == "qwen-max"
    # key / base_url 仍然来自 .env，切换只影响 model
    assert key == settings.QWEN_API_KEY
    assert base_url == settings.QWEN_BASE_URL


async def test_agent_orchestrator_follows_runtime_switch(session_factory, patch_session):
    """Agent 编排是 token 消耗最大的路径，也必须跟着切换走。"""
    await mr.hydrate()
    async with session_factory() as db:
        await mr.set_active(db, "qwen-long", "admin@example.com")
        await db.commit()

    from app.services.agent_orchestrator import _get_qwen_config as agent_cfg

    assert agent_cfg()[1] == "qwen-long"


# ----------------------------------------------------------------------
# 5. 权限边界：平台级凭证不能下放给普通用户
# ----------------------------------------------------------------------

async def test_admin_ai_endpoints_require_auth(async_client):
    # GET 不接受 json 参数，只有 POST 需要
    resp = await async_client.get("/api/v1/admin/ai/models")
    assert resp.status_code in (401, 403), f"GET models 未鉴权却返回 {resp.status_code}"

    for path in (
        "/api/v1/admin/ai/models/switch",
        "/api/v1/admin/ai/models/test",
        "/api/v1/admin/ai/models/custom",
    ):
        resp = await async_client.post(path, json={})
        assert resp.status_code in (401, 403), f"{path} 未鉴权却返回 {resp.status_code}"


async def test_admin_ai_endpoints_reject_normal_user(async_client, auth_headers):
    resp = await async_client.get("/api/v1/admin/ai/models", headers=auth_headers)
    assert resp.status_code == 403


async def test_models_endpoint_payload_shape(async_client, auth_headers, session_factory, patch_session):
    """把普通用户提权为超管，验证返回体结构完整（前端强依赖这些字段）。"""
    from sqlalchemy import update

    from app.models.user import User

    async with session_factory() as db:
        await db.execute(update(User).values(is_superadmin=True))
        await db.commit()

    resp = await async_client.get("/api/v1/admin/ai/models", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()

    for field in (
        "active", "active_source", "key_configured", "key_hint",
        "base_url", "usage_scope", "models",
    ):
        assert field in body, f"返回体缺少 {field}"

    assert len(body["models"]) == len(mr.MODEL_CATALOG)
    # 每个模型都带前端要用的字段
    for m in body["models"]:
        for field in (
            "model_id", "label", "family", "family_label", "is_active",
            "is_custom", "quota_status", "quota_label", "usage",
        ):
            assert field in m, f"模型条目缺少 {field}"
        for f in ("calls", "prompt_tokens", "completion_tokens", "total_tokens"):
            assert f in m["usage"]

    # 恰好一个 is_active，且与 active 字段一致
    actives = [m["model_id"] for m in body["models"] if m["is_active"]]
    assert actives == [body["active"]]
