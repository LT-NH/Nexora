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
        # 真实案例：百炼「未购买该模型」返回 403 AccessDenied.Unpurchased。
        # 文本是 "Access to model denied"（不含 "access denied"），曾被漏判成
        # unauthorized → 界面显示「Key 无效」，把用户引向检查 API Key
        (
            403,
            '{"error":{"message":"Access to model denied. Please make sure you '
            'are eligible for using the model.","type":"AccessDenied.Unpurchased",'
            '"code":"AccessDenied.Unpurchased"}}',
            "denied",
        ),
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


def test_unpurchased_model_403_is_not_reported_as_bad_key():
    """回归：未购买模型的 403 不能报成「Key 无效」（会误导去检查 API Key）。"""
    msg = ('{"error":{"message":"Access to model denied. Please make sure you are '
           'eligible for using the model.","type":"AccessDenied.Unpurchased"}}')
    assert mr.classify_error(403, msg) == "denied"
    assert mr.classify_error(403, msg) != "unauthorized"
    # 裸 403 仍应是「Key/权限」问题，走 unauthorized
    assert mr.classify_error(403, "") == "unauthorized"


def test_quota_labels_cover_all_statuses():
    """每个可能出现的状态都要有中文展示文案，否则前端会露出原始英文码。"""
    for status in [
        "unknown", "ok", "exhausted", "throttled", "denied",
        "stream_only", "unauthorized", "not_found", "error",
    ]:
        assert status in mr.QUOTA_LABELS


# ----------------------------------------------------------------------
# 1b. 目录本身的自洽性（策展目录的质量守门）
# ----------------------------------------------------------------------

def test_catalog_entries_are_well_formed():
    """目录每项都要有 model_id / label / family / supports_tools，且 family 有展示名。"""
    ids = [item["model_id"] for item in mr.MODEL_CATALOG]
    assert len(ids) == len(set(ids)), "目录内 model_id 不能重复"
    for item in mr.MODEL_CATALOG:
        assert item["model_id"], "model_id 不能为空"
        assert item["label"], f"{item['model_id']} 缺少 label"
        assert isinstance(item["supports_tools"], bool), (
            f"{item['model_id']} 的 supports_tools 必须是 bool —— "
            f"它决定管理台是否提示「切过去 Agent 不可用」"
        )
        assert item["family"] in mr.FAMILY_LABELS, (
            f"{item['model_id']} 的 family={item['family']} 没有对应展示名"
        )


def test_catalog_marks_tool_incapable_models():
    """已知不支持 function calling 的模型必须被显式标 False，不能漏（否则切过去 Agent 会坏）。"""
    flags = {item["model_id"]: item["supports_tools"] for item in mr.MODEL_CATALOG}
    # 实测：视觉模型与 deepseek-r1 不返回 tool_calls
    for mid in ("qwen-vl-plus", "qwen-vl-max", "deepseek-r1"):
        assert flags.get(mid) is False, f"{mid} 实测不支持工具调用，应标 supports_tools=False"


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


async def test_hydrate_syncs_metadata_of_existing_builtin_rows(
    session_factory, patch_session
):
    """目录改版后，已存在的内置行必须被**校正**（不只是补建新条目）。

    回归：只补建不校正时，老库里同名的行会保留旧 family/label，
    新增的 supports_tools 列还会被建成默认 False —— 管理台于是显示错误分组，
    甚至误报「当前模型不支持工具调用」（实测踩过）。
    """
    from sqlalchemy import select

    from app.models.ai_model import AIModel

    await mr.hydrate()
    keep = mr.MODEL_CATALOG[0]["model_id"]  # qwen-plus
    truth = mr.MODEL_CATALOG[0]

    # 模拟「旧版本写入的脏元数据」
    async with session_factory() as db:
        row = (await db.execute(
            select(AIModel).where(AIModel.model_id == keep)
        )).scalars().first()
        row.family = "commercial"      # 旧分组
        row.label = "旧标签"
        row.supports_tools = False     # 加列时的默认值
        await db.commit()

    await mr.hydrate()

    async with session_factory() as db:
        row = (await db.execute(
            select(AIModel).where(AIModel.model_id == keep)
        )).scalars().first()
        assert row.family == truth["family"], "family 应被目录校正"
        assert row.label == truth["label"], "label 应被目录校正"
        assert row.supports_tools is True, "supports_tools 应被目录校正为 True"


async def test_hydrate_does_not_overwrite_custom_rows(session_factory, patch_session):
    """自定义条目是用户自己写的，hydrate 一律不碰。"""
    from sqlalchemy import select

    from app.models.ai_model import AIModel

    await mr.hydrate()
    async with session_factory() as db:
        db.add(AIModel(model_id="user-owned", label="我的手写标签", family="custom",
                       is_custom=True, note="我的备注", is_active=False))
        await db.commit()

    await mr.hydrate()

    async with session_factory() as db:
        row = (await db.execute(
            select(AIModel).where(AIModel.model_id == "user-owned")
        )).scalars().first()
        assert row is not None, "自定义条目不能被清理"
        assert row.label == "我的手写标签"
        assert row.note == "我的备注"


async def test_hydrate_prunes_legacy_builtins_but_keeps_custom_and_active(
    session_factory, patch_session
):
    """目录改版后，旧的内置条目要被清掉，但**不能误删**自定义条目与当前生效模型。

    真实场景：把目录从「12 个通用模型」换成「23 个实测可用模型」后，
    旧库里那 7 个点不动的死条目必须消失，否则管理台永远是一堆噪音。
    """
    from sqlalchemy import select

    from app.models.ai_model import AIModel

    await mr.hydrate()

    async with session_factory() as db:
        # 1) 一条「曾经内置、现已从目录移除」的脏数据
        db.add(AIModel(model_id="qwen2.5-72b-instruct", label="旧条目", family="custom",
                       is_custom=False, is_active=False))
        # 2) 一条用户自定义（不在目录里，但必须保留）
        db.add(AIModel(model_id="my-private-model", label="我的模型", family="custom",
                       is_custom=True, is_active=False))
        await db.commit()

    await mr.hydrate()  # 再跑一次（等价于重启）

    async with session_factory() as db:
        rows = (await db.execute(select(AIModel))).scalars().all()
        ids = {r.model_id for r in rows}
        assert "qwen2.5-72b-instruct" not in ids, "旧内置条目应被清理"
        assert "my-private-model" in ids, "自定义条目不能被误删"
        assert sum(1 for r in rows if r.is_active) == 1, "active 仍应唯一"


async def test_prune_never_deletes_active_model(session_factory, patch_session):
    """极端情况：当前生效的模型恰好不在新目录里 → 也必须保留（否则 AI 会被打断）。"""
    from sqlalchemy import select

    from app.models.ai_model import AIModel

    await mr.hydrate()
    async with session_factory() as db:
        db.add(AIModel(model_id="legacy-active-model", label="旧的当前模型",
                       family="custom", is_custom=False, is_active=False))
        await db.commit()
    async with session_factory() as db:
        await mr.set_active(db, "legacy-active-model", "admin@example.com")
        await db.commit()

    await mr.hydrate()

    async with session_factory() as db:
        rows = (await db.execute(select(AIModel))).scalars().all()
        assert "legacy-active-model" in {r.model_id for r in rows}, (
            "当前生效的模型即使不在目录里也不能被清理"
        )
        assert mr.get_active_model() == "legacy-active-model"


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

    # 必须用「不在内置目录里」的 model_id，否则会命中的是内置条目而非新建自定义
    CUSTOM = "my-custom-qwen"
    assert CUSTOM not in {i["model_id"] for i in mr.MODEL_CATALOG}

    async with session_factory() as db:
        row = await mr.upsert_custom(db, CUSTOM, "自定义模型", "新模型", "a@b.c")
        await db.commit()
        assert row.is_custom is True
        assert row.family == "custom"

    # 自定义模型可以删除
    async with session_factory() as db:
        assert await mr.delete_model(db, CUSTOM) is True
        await db.commit()

    # 内置模型不允许删除
    builtin = mr.MODEL_CATALOG[0]["model_id"]
    async with session_factory() as db:
        assert await mr.delete_model(db, builtin) is False

    # 当前生效的模型不允许删除（会把手切换断掉）
    async with session_factory() as db:
        await mr.upsert_custom(db, CUSTOM, "My", None, "a@b.c")
        await mr.set_active(db, CUSTOM, "a@b.c")
        await db.commit()
        assert await mr.delete_model(db, CUSTOM) is False


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

    # 初始值 = 注册表登记的当前模型（不再假设等于 .env 的 QWEN_MODEL ——
    # 目录改版后 .env 里的旧模型可能已不在目录中）
    initial = mr.get_active_model()
    assert _get_qwen_config()[1] == initial

    async with session_factory() as db:
        await mr.set_active(db, "qwen-max", "admin@example.com")
        await db.commit()

    key, model, base_url = _get_qwen_config()
    assert model == "qwen-max"
    # key / base_url 仍然来自 .env，切换只影响 model
    assert key == settings.QWEN_API_KEY
    assert base_url == settings.QWEN_BASE_URL


async def test_fresh_db_defaults_to_first_catalog_model_and_supports_tools(
    session_factory, patch_session
):
    """全新库的默认模型 = 目录第一项（qwen-plus），且必须支持工具调用。

    回归：曾经用「字母序兜底」，结果新装环境的默认模型会落到 `deepseek-r1`
    —— 那是不支持 function calling 的模型，等于一装好巡店 Agent 就是坏的。
    """
    await mr.hydrate()
    assert mr.get_active_model() == mr.MODEL_CATALOG[0]["model_id"]

    active = mr.MODEL_CATALOG[0]
    assert active["supports_tools"] is True, (
        "目录第一项（默认模型）必须支持 function calling，否则新环境 Agent 直接不可用"
    )
    assert active["family"] == "core", "默认模型应该来自主力档"


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
        "active", "active_source", "agent_tools_ok", "tool_capable_count",
        "key_configured", "key_hint", "base_url", "usage_scope", "models",
    ):
        assert field in body, f"返回体缺少 {field}"

    assert len(body["models"]) == len(mr.MODEL_CATALOG)
    # 每个模型都带前端要用的字段
    for m in body["models"]:
        for field in (
            "model_id", "label", "family", "family_label", "is_active",
            "is_custom", "supports_tools", "quota_status", "quota_label", "usage",
        ):
            assert field in m, f"模型条目缺少 {field}"
        for f in ("calls", "prompt_tokens", "completion_tokens", "total_tokens"):
            assert f in m["usage"]

    # 恰好一个 is_active，且与 active 字段一致
    actives = [m["model_id"] for m in body["models"] if m["is_active"]]
    assert actives == [body["active"]]
