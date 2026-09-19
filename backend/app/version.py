"""产品版本号 —— 后端唯一来源。

**权威来源是前端** `frontend/src/pages/Changelog.tsx` 的
`changelogData[0].version`（它与落地页徽章由 `e2e/landing.spec.ts` 的
「发布信息一致性」用例互锁）。后端不得自己另立版本号。

历史教训：曾经 `config.py` / `main.py` / `api/__init__.py` **三处各写一份**
版本号，结果全部停在 `5.4.0`，而产品已经发到 v5.8 —— OpenAPI 文档与
`/api/v1` 根接口对外报的版本号都是错的。
`tests/test_version_consistency.py` 现在会比对后端与前端，防止再次漂移。

发版流程：改 Changelog + Landing 徽章之后，同步更新本文件。
"""

APP_VERSION = "5.9"

# 与前端 Changelog 对齐时使用的版本格式（前端写 "v5.8"，后端存 "5.8"）
VERSION_PREFIX = "v"
