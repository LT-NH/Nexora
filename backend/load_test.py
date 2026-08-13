#!/usr/bin/env python3
"""Nexora 接口压测脚本（standalone，仅依赖 httpx）。

用法：
    python load_test.py                                    # 默认 10 并发 500 请求
    python load_test.py --concurrency 20 --requests 1000
    python load_test.py --base-url http://127.0.0.1:8000

流程：
    1. 用演示账号登录获取 JWT
    2. 取得第一个工作空间 slug
    3. 并发请求 GET /api/v1/workspaces/{slug}/orders
统计：
    总耗时 / 吞吐(Req/s) / P50 / P95 延迟 / 错误数
    错误率 > 5% 时以非零码退出（便于接入 CI）。
"""

import argparse
import concurrent.futures
import statistics
import sys
import time
from datetime import datetime

import httpx

EMAIL = "demo@nexora.com"
PASSWORD = "Demo1234!"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Nexora 订单接口压测",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--base-url", default="http://127.0.0.1:8000",
        help="后端 API 根地址",
    )
    parser.add_argument(
        "--concurrency", type=int, default=10,
        help="并发连接数",
    )
    parser.add_argument(
        "--requests", type=int, default=500,
        help="总请求数",
    )
    parser.add_argument(
        "--email", default=EMAIL,
        help="登录邮箱",
    )
    parser.add_argument(
        "--password", default=PASSWORD,
        help="登录密码",
    )
    return parser.parse_args()


def login(client: httpx.Client, base_url: str, email: str, password: str) -> tuple[str, str]:
    """登录并返回 (access_token, workspace_slug)。"""
    resp = client.post(
        f"{base_url}/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    resp.raise_for_status()
    token = resp.json()["access_token"]

    ws = client.get(
        f"{base_url}/api/v1/workspaces",
        headers={"Authorization": f"Bearer {token}"},
    )
    ws.raise_for_status()
    items = ws.json().get("items") or []
    if not items:
        raise RuntimeError("登录成功但未找到任何工作空间")
    return token, items[0]["slug"]


def run_load_test(base_url: str, concurrency: int, total_requests: int,
                  email: str, password: str) -> dict:
    """执行压测并返回统计结果。"""
    headers = {}

    # 预热/登录
    with httpx.Client(base_url=base_url, timeout=30) as client:
        token, slug = login(client, base_url, email, password)
        headers["Authorization"] = f"Bearer {token}"
        orders_url = f"{base_url}/api/v1/workspaces/{slug}/orders"

    latencies: list[float] = []
    errors = 0
    error_samples: list[str] = []

    def do_one(_: int) -> tuple[float, int, str]:
        start = time.perf_counter()
        try:
            with httpx.Client(base_url=base_url, timeout=30) as client:
                resp = client.get(orders_url, headers=headers)
            status = resp.status_code
            ok = status == 200
            if not ok:
                return time.perf_counter() - start, status, f"HTTP {status}"
            return time.perf_counter() - start, status, ""
        except Exception as exc:  # noqa: BLE001
            return time.perf_counter() - start, 0, f"{type(exc).__name__}: {exc}"

    start_time = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as pool:
        for latency, status, msg in pool.map(do_one, range(total_requests)):
            latencies.append(latency)
            if status != 200:
                errors += 1
                if len(error_samples) < 5:
                    error_samples.append(msg or f"HTTP {status}")
    elapsed = time.perf_counter() - start_time

    latencies.sort()
    n = len(latencies)

    def pct(p: float) -> float:
        if not latencies:
            return 0.0
        return latencies[min(n - 1, max(0, round(p / 100 * (n - 1))))] * 1000  # ms

    return {
        "base_url": base_url,
        "concurrency": concurrency,
        "requests": total_requests,
        "elapsed": elapsed,
        "rps": total_requests / elapsed if elapsed > 0 else 0.0,
        "p50_ms": pct(50),
        "p95_ms": pct(95),
        "errors": errors,
        "error_rate": errors / total_requests if total_requests else 0.0,
        "error_samples": error_samples,
        "slug": slug,
        "ts": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


def print_report(stats: dict) -> None:
    """打印 ASCII 报告。"""
    bar = "=" * 60
    print()
    print(bar)
    print("   Nexora 订单接口压测报告")
    print(bar)
    print(f"   时间        : {stats['ts']}")
    print(f"   目标地址    : {stats['base_url']}  (slug: {stats['slug']})")
    print(f"   并发数      : {stats['concurrency']}")
    print(f"   请求数      : {stats['requests']}")
    print(f"   总耗时      : {stats['elapsed']:.2f} s")
    print(f"   吞吐量      : {stats['rps']:.1f} req/s")
    print(f"   P50 延迟    : {stats['p50_ms']:.1f} ms")
    print(f"   P95 延迟    : {stats['p95_ms']:.1f} ms")
    print(f"   错误数      : {stats['errors']}")
    print(f"   错误率      : {stats['error_rate'] * 100:.2f}%")
    if stats["error_samples"]:
        print("   错误样例    :")
        for sample in stats["error_samples"]:
            print(f"     - {sample}")
    verdict = "PASS" if stats["error_rate"] <= 0.05 else "FAIL"
    print(bar)
    print(f"   判定        : {verdict} (阈值: 错误率 <= 5%)")
    print(bar)


def main() -> int:
    args = parse_args()
    if args.concurrency < 1 or args.requests < 1:
        print("错误: --concurrency 与 --requests 必须 >= 1", file=sys.stderr)
        return 2

    try:
        stats = run_load_test(
            args.base_url,
            args.concurrency,
            args.requests,
            args.email,
            args.password,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"错误: 压测执行失败 — {exc}", file=sys.stderr)
        print("请确认后端已启动: uvicorn app.main:app --port 8000", file=sys.stderr)
        return 1

    print_report(stats)
    return 0 if stats["error_rate"] <= 0.05 else 1


if __name__ == "__main__":
    sys.exit(main())
