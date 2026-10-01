"""版本号一致性回归测试（2026-09-19）。

背景：后端曾把版本号写死在三个地方（config.py / main.py / api/__init__.py），
结果全部停在 5.4.0 而产品已发到 v5.8，OpenAPI 文档与 /api/v1 根接口对外
报的都是错版本。

权威来源：前端 `frontend/src/pages/Changelog.tsx` 的 changelogData[0].version
（它同时被 e2e/landing.spec.ts「发布信息一致性」用例与落地页徽章互锁）。
本测试把后端与前端对齐，任何一侧改版而另一侧漏改都会在这里失败。
"""

import json
import re
from pathlib import Path

import pytest

from app.version import APP_VERSION

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent
CHANGELOG_TSX = REPO_DIR / "frontend" / "src" / "pages" / "Changelog.tsx"
LANDING_TSX = REPO_DIR / "frontend" / "src" / "pages" / "Landing.tsx"
PACKAGE_JSON = REPO_DIR / "frontend" / "package.json"
README_MD = REPO_DIR / "README.md"
ROOT_CHANGELOG_MD = REPO_DIR / "CHANGELOG.md"


def _frontend_changelog_version() -> str:
    """读取 Changelog.tsx 中 changelogData 的首个版本号（不带 v 前缀）。"""
    text = CHANGELOG_TSX.read_text(encoding="utf-8")
    # 首个 `version: 'v5.8',` 即最新版本（数组首项=最新）
    match = re.search(r"version:\s*'v?([\d.]+)'", text)
    assert match, "未能在 Changelog.tsx 中解析到版本号"
    return match.group(1)


def test_backend_version_matches_frontend_changelog():
    """后端 APP_VERSION 必须等于前端更新日志的最新版本。"""
    fe = _frontend_changelog_version()
    assert APP_VERSION == fe, (
        f"版本漂移：后端 {APP_VERSION} vs 前端更新日志 v{fe}。"
        "发版后请同步 backend/app/version.py"
    )


def test_landing_badge_matches_backend_version():
    """落地页徽章也必须同版本（三处互锁：Changelog / Landing / 后端）。"""
    text = LANDING_TSX.read_text(encoding="utf-8")
    match = re.search(r"v([\d.]+)\s*现已发布", text)
    assert match, "未能在 Landing.tsx 中解析到版本徽章"
    assert match.group(1) == APP_VERSION, (
        f"落地页徽章 v{match.group(1)} 与后端 {APP_VERSION} 不一致"
    )


def test_version_format_is_semver_like():
    assert re.fullmatch(r"\d+\.\d+(\.\d+)?", APP_VERSION), APP_VERSION


def _major_minor(value: str) -> list[str]:
    return str(value).split(".")[:2]


def test_package_json_version_matches_backend():
    """frontend/package.json 的 major.minor 必须与代码版本一致。

    此前它长期停在 5.4.0，而产品已发到 5.11 —— 任何按 package.json 判断
    版本的工具（依赖扫描、发布流水线、IDE）读到的都是过期信息。
    """
    pkg = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))
    actual = pkg.get("version")
    assert _major_minor(actual) == _major_minor(APP_VERSION), (
        f"版本漂移：frontend/package.json 是 {actual}，而应用版本是 {APP_VERSION}"
    )


def test_readme_version_badge_matches_backend():
    """README 顶部的 version badge 必须与代码版本一致。"""
    text = README_MD.read_text(encoding="utf-8")
    match = re.search(r"badge/version-([\d.]+)-", text)
    assert match, "未能在 README 中解析到 version badge"
    assert _major_minor(match.group(1)) == _major_minor(APP_VERSION), (
        f"README badge 是 v{match.group(1)}，代码版本是 {APP_VERSION}"
    )


def test_root_changelog_does_not_claim_a_newer_version():
    """仓库根 CHANGELOG.md 不得声称比实现更新的版本。

    这里只做「不得超前」的单向约束：CHANGELOG 记录的是已归档的发布说明，
    允许滞后于代码（不必为每次小改动补条目），但不允许它宣称一个还没做的版本。
    """
    text = ROOT_CHANGELOG_MD.read_text(encoding="utf-8")
    versions = re.findall(r"^##\s*\[(\d+\.\d+(?:\.\d+)?)\]", text, re.M)
    assert versions, "未能在 CHANGELOG.md 中解析到任何版本条目"

    def _key(v: str) -> tuple[int, int, int]:
        parts = [int(x) for x in v.split(".")]
        while len(parts) < 3:
            parts.append(0)
        return (parts[0], parts[1], parts[2])

    newest = max(_key(v) for v in versions)
    assert newest <= _key(APP_VERSION), (
        f"CHANGELOG.md 声称了 {'.'.join(map(str, newest))}，"
        f"但代码版本只有 {APP_VERSION} —— 文档不应超前于实现"
    )


def test_no_hardcoded_version_left_in_backend():
    """守卫：后端源码里不得再出现写死的 x.y.z 版本字符串。

    仅允许 app/version.py 持有版本字面量。
    """
    offenders: list[str] = []
    pattern = re.compile(r"""["']\d+\.\d+\.\d+["']""")
    for path in (BACKEND_DIR / "app").rglob("*.py"):
        if path.name == "version.py":
            continue
        text = path.read_text(encoding="utf-8")
        for m in pattern.finditer(text):
            # 排除常见非版本号：IP 片段之外的三段数字（如 0.0.0 占位）也一并报出，
            # 宁可让人显式确认
            offenders.append(
                f"{path.relative_to(BACKEND_DIR)}: {m.group(0)}"
            )
    assert not offenders, "发现写死的版本号（应引用 app.version.APP_VERSION）：\n" + "\n".join(
        offenders
    )
