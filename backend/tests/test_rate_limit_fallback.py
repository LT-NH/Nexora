"""限流中间件降级行为回归测试（2026-09-19）。

背景：限流优先走 Redis；Redis 不可用（未部署 / 宕机 / 网络抖动）时必须
**降级到进程内存**继续限流，而不是直接放行（放行等于限流失效）或直接 500。
实现里还带一个**冷却期**：Redis 故障后短暂不再重试，避免每个请求都付连接超时。

这些行为此前没有测试覆盖 —— 本次补上，锁定「降级但不失效」这一不变量。
"""

import time

import pytest
import pytest_asyncio

import app.middleware.rate_limit as rl_mod
from app.middleware.rate_limit import RateLimitMiddleware


class _FakeRedis:
    """最小可用的 Redis 替身：只实现限流用到的三个命令。"""

    def __init__(self) -> None:
        self.counters: dict[str, int] = {}
        self.expires: dict[str, int] = {}
        self.incr_calls = 0

    async def incr(self, key: str) -> int:
        self.incr_calls += 1
        self.counters[key] = self.counters.get(key, 0) + 1
        return self.counters[key]

    async def expire(self, key: str, ttl: int) -> bool:
        self.expires[key] = ttl
        return True

    async def ttl(self, key: str) -> int:
        return self.expires.get(key, 30)


@pytest_asyncio.fixture
def middleware() -> RateLimitMiddleware:
    """直连被测方法，不经过 HTTP 栈（避免为测限流拉起整个应用）。"""
    return RateLimitMiddleware(app=None, max_requests=3, window_seconds=60)


@pytest.fixture(autouse=True)
def _reset_redis_cooldown():
    """每个用例前清掉 Redis 冷却状态（模块级全局变量）。"""
    rl_mod._redis_retry_after = 0.0
    yield
    rl_mod._redis_retry_after = 0.0


async def test_redis_outage_falls_back_to_memory(monkeypatch, middleware):
    """Redis 不可用 → 降级到内存限流，限流依然生效（不是放行）。"""

    async def _boom():
        raise ConnectionError("redis not configured")

    monkeypatch.setattr(rl_mod, "get_redis", _boom)

    now = time.time()
    for i in range(3):
        limited, _ = await middleware._check_and_record("1.2.3.4", now)
        assert not limited, f"第 {i + 1} 次请求不应被限流"

    limited, retry_after = await middleware._check_and_record("1.2.3.4", now)
    assert limited, "超出阈值后必须被限流（降级不等于放行）"
    assert retry_after >= 1


async def test_redis_outage_does_not_retry_every_request(monkeypatch, middleware):
    """冷却期生效：Redis 故障后不应对每个请求都重试连接。"""
    attempts = 0

    async def _boom():
        nonlocal attempts
        attempts += 1
        raise ConnectionError("down")

    monkeypatch.setattr(rl_mod, "get_redis", _boom)

    now = time.time()
    for _ in range(5):
        await middleware._check_and_record("9.9.9.9", now)

    assert attempts == 1, f"冷却期内只应尝试 1 次，实际 {attempts} 次"


async def test_redis_is_used_when_healthy(monkeypatch, middleware):
    """Redis 健康时走 Redis 计数（内存计数不应被触碰）。"""
    fake = _FakeRedis()
    monkeypatch.setattr(rl_mod, "get_redis", lambda: _async_value(fake))

    now = time.time()
    limited, _ = await middleware._check_and_record("5.5.5.5", now)
    assert not limited
    assert fake.incr_calls == 1
    assert fake.expires, "首次计数应设置过期时间（否则计数永不过期）"


async def test_redis_limits_when_over_threshold(monkeypatch, middleware):
    """Redis 侧超限时返回限流 + retry_after（取自 TTL）。"""
    fake = _FakeRedis()
    monkeypatch.setattr(rl_mod, "get_redis", lambda: _async_value(fake))

    now = time.time()
    results = []
    for _ in range(4):
        results.append(await middleware._check_and_record("6.6.6.6", now))

    assert [r[0] for r in results] == [False, False, False, True]
    assert results[-1][1] >= 1


async def test_recovers_to_redis_after_cooldown(monkeypatch, middleware):
    """冷却期结束后应重新尝试 Redis（故障恢复后自动回切）。"""
    failing = {"mode": "down"}

    async def _maybe():
        if failing["mode"] == "down":
            raise ConnectionError("down")
        return fake

    fake = _FakeRedis()
    monkeypatch.setattr(rl_mod, "get_redis", _maybe)

    now = time.time()
    await middleware._check_and_record("7.7.7.7", now)
    assert fake.incr_calls == 0, "故障期间不应走 Redis"

    # 模拟冷却期已过 + Redis 恢复
    rl_mod._redis_retry_after = time.time() - 1
    failing["mode"] = "up"
    await middleware._check_and_record("7.7.7.7", now)
    assert fake.incr_calls == 1, "冷却期结束后应回切 Redis"


def _async_value(value):
    """把同步返回值包成 awaitable（模拟 await get_redis()）。"""

    async def _inner():
        return value

    return _inner()
