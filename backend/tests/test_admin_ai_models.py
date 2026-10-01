"""AI 模型注册表管理端点的测试（不发起真实网络请求）。

覆盖 2026-10-01 新增的「一键检测全部模型」：
  - 单模型探测的错误分类（额度耗尽 / 正常）
  - 批量检测的汇总口径与文案映射

设计原则：用替身拦截 httpx，**绝不真实打百炼** —— 测试不应消耗用户额度。
"""

import pytest

from app.api import admin_ai


class _FakeResponse:
    def __init__(self, status_code: int, text: str) -> None:
        self.status_code = status_code
        self.text = text

    def json(self) -> dict:
        import json

        return json.loads(self.text)


class _FakeAsyncClient:
    """替身：按预设脚本返回响应，记录收到的请求体。"""

    def __init__(self, response: _FakeResponse, sink: list) -> None:
        self._response = response
        self._sink = sink

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, headers=None, json=None):
        self._sink.append({"url": url, "headers": headers, "json": json})
        return self._response


def _patch_http(monkeypatch, response: _FakeResponse) -> list:
    sink: list = []

    def fake_client(*args, **kwargs):
        return _FakeAsyncClient(response, sink)

    monkeypatch.setattr(admin_ai.httpx, "AsyncClient", fake_client)
    return sink


async def test_probe_classifies_free_quota_exhausted(monkeypatch, patch_session):
    """403 + Free quota exhausted 必须归为「额度耗尽」，而不是「Key 无效」。

    这是本功能最核心的信号：额度用完该换模型，而 Key 无效要去改配置，
    两者的处置方式完全不同。
    """
    body = '{"error":{"message":"Free quota exhausted. To add funds...","type":"invalid_request_error"}}'
    _patch_http(monkeypatch, _FakeResponse(403, body))

    result = await admin_ai._probe_model("qwen-max")

    assert result["ok"] is False
    assert result["quota_status"] == "exhausted"
    assert "Free quota exhausted" in result["error"]


async def test_probe_records_success_and_usage(monkeypatch, patch_session):
    """200 时返回可用、记录 usage（探测本身也花额度，必须计入记账）。"""
    body = (
        '{"choices":[{"message":{"content":"可用"}}],'
        '"usage":{"prompt_tokens":8,"completion_tokens":2,"total_tokens":10}}'
    )
    sink = _patch_http(monkeypatch, _FakeResponse(200, body))

    result = await admin_ai._probe_model("qwen-plus")

    assert result["ok"] is True
    assert result["quota_status"] == "ok"
    assert result["reply"] == "可用"
    # 请求体要带 model 与最小 messages
    assert sink[0]["json"]["model"] == "qwen-plus"
    assert sink[0]["json"]["messages"]


async def test_batch_aggregates_all_models(monkeypatch, patch_session, session_factory):
    """批量检测：跑遍注册表、汇总可用数、给出中文文案映射。

    用 monkeypatch 顶掉真实探测（否则会消耗真实额度），只验证编排与口径。
    """
    probed: list[str] = []

    async def fake_probe(model_id: str) -> dict:
        probed.append(model_id)
        ok = model_id in ("qwen-plus", "qwen-flash")
        return {
            "ok": ok,
            "model_id": model_id,
            "latency_ms": 12,
            "quota_status": "ok" if ok else "exhausted",
        }

    monkeypatch.setattr(admin_ai, "_probe_model", fake_probe)

    async def _no_sleep(_seconds: float) -> None:
        """跳过探测间隔，测试不必真等。"""
        return None

    monkeypatch.setattr(admin_ai.asyncio, "sleep", _no_sleep)

    async with session_factory() as db:
        res = await admin_ai.test_all_models(_sa=None, db=db)

    assert res["total"] == len(probed) > 0, "应逐个探测注册表里的全部模型"
    assert res["ok_count"] == 2
    assert res["summary"]["ok"] == 2
    assert res["summary"]["exhausted"] == res["total"] - 2
    # 文案由后端给出，前端不再自己写一套映射
    assert res["summary_labels"]["exhausted"] == "额度耗尽"
    assert res["summary_labels"]["ok"] == "可用"
    assert len(res["results"]) == res["total"]


def test_batch_endpoint_requires_superadmin():
    """平台级凭证不允许下放：该端点必须挂 superadmin 依赖。

    直接检查路由依赖，避免为了测权限去搭一套完整鉴权环境。
    """
    route = next(
        r for r in admin_ai.router.routes if getattr(r, "path", "").endswith("/models/test-all")
    )
    dep_names = [getattr(d.call, "__name__", "") for d in route.dependant.dependencies]
    assert any("superadmin" in n for n in dep_names), f"缺少 superadmin 守卫：{dep_names}"
