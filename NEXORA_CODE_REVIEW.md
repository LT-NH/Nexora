# Nexora 代码质量评审与改进报告

> 对象：`saas-forge`（Nexora 多租户电商 SaaS，FastAPI + React/Vite）
> 评审人：资深开发工程师（WorkBuddy）
> 日期：2026-07-14
> 范围：外部平台集成层（店铺对接 / 数据同步 / 入站 Webhook）

---

## 1. 总体评价

架构基础**相当扎实**，达到可上线 SaaS 的雏形：

- 多租户隔离通过 `workspace_id` 行级过滤 + JWT 双 Token + 角色权限实现，思路正确。
- 平台集成采用**抽象基类 + 注册表**（`PlatformIntegration` / `PLATFORM_REGISTRY`），这是教科书级的可扩展设计，新增平台不需要改动调用方。
- 异步 SQLAlchemy 2.0 + Pydantic v2 + 统一异常/审计日志，工程规范到位。

但「能跑」和「能放心用」之间还有 gap，尤其集中在**数据同步的正确性**和**与外部平台的真实联通**上。本次评审聚焦后者，并已直接修复可验证的缺陷、补齐测试。

> 一句话结论：**集成层是「真写了一半」——适配器确实是真在调外部 API，但同步有数据损坏级 bug，且没有测试、没有入站通道，所以团队此前无法确认它「真的连上了」。**

---

## 2. 关键问题清单（按严重度排序）

| 严重度 | 位置 | 问题 | 影响 | 本次处理 |
|--------|------|------|------|----------|
| 🔴 严重 | `shopify.py` / `douyin.py` `_upsert_order` | **重复订单行项**：每次重同步都往订单里追加一遍 `OrderItem`，从不清理旧行项 | 订单金额/件数随时间**翻倍失真**，不可接受 | ✅ 改为「按订单删除旧行项 + 重插」（幂等） |
| 🔴 严重 | 同上 `sync_*` | **计数全部算成 created**：`update` 时仍 `created += 1`，`updated` 永远是 0 | 同步统计谎言，运维无法判断增量 | ✅ upsert 方法返回 `is_new`，正确累加 created/updated |
| 🟠 高 | `api/stores.py` `create_store` | 新建店铺直接标记 `status=connected`，**未经任何凭证校验** | 列表里一片「已连接」假象，误导排查 | ✅ 改为 `disconnected`；新增 `POST /test` 显式校验 |
| 🟠 高 | 无入站通道 | 集成**只支持拉取（pull）**，外部平台推送的订单变更无法回写 | 不是真正的「双向连接」，数据滞后 | ✅ 新增 Shopify 入站 Webhook（HMAC 验签 + 实时 upsert） |
| 🟡 中 | 无测试 | 集成层**零自动化测试**，改一行都不敢 | 无法保证「真的连得上」，回归风险高 | ✅ 新增 `backend/tests/`，离线可跑 pytest |
| 🟡 中 | `store` 表 | `api_key/api_secret/access_token` **明文存储** | 凭证泄露即全量泄露 | ⚠️ 建议：Fernet 加密落库（见第 5 节） |
| 🟡 中 | 无 sandbox | 没有真实凭证时**整条链路无法演示/联调** | 团队上手成本高，难做演示 | ✅ 新增 `sandbox` 离线适配器（确定性假数据） |
| 🟢 低 | `base.py` | `datetime.utcnow()` 已废弃 | 运行告警，未来版本不兼容 | ✅ 改为 `datetime.now(timezone.utc)` |
| 🟢 低 | 同步为同步接口 | `sync_store` 在大店铺会**长时间占用请求**，可能超时 | 大商户体验差 | ⚠️ 建议：改为后台任务 + 进度查询（见路线图） |

---

## 3. 本次已交付的改动

### 3.1 修复（backend）
- `app/services/platforms/shopify.py`
  - `_upsert_order` / `_upsert_product` / `_upsert_customer` 重构为返回 `is_new`；
  - 订单行项改为**幂等替换**（先 `DELETE` 再 `INSERT`），彻底消除重复行项；
  - 新增 `upsert_order_from_payload()`，供 Webhook 复用。
- `app/services/platforms/douyin.py`：同上修复（行项幂等 + 计数 + 客户累计改为幂等）。
- `app/services/platforms/sandbox.py`（**新增**）：离线沙箱适配器，生成确定性商品/订单/客户，无需任何凭证即可跑通全链路。
- `app/services/webhooks.py` + `app/api/webhooks.py`（**新增**）：`POST /api/v1/webhooks/shopify`，校验 `X-Shopify-Hmac-Sha256`，按店铺域名定位工作空间并实时 upsert 订单。
- `app/api/stores.py`：新增 `POST /{store_id}/test`（仅校验凭证、不改数据）；`sync_store` 返回 `created` / `updated` 明细；`create_store` 不再假连接。
- `app/services/platforms/__init__.py`：注册 `sandbox`。
- `app/models/store.py` + `app/schemas/store.py`：`StorePlatform` 增加 `sandbox`。
- `app/config.py` + `.env.example`：新增 `SHOPIFY_WEBHOOK_SECRET`。

### 3.2 测试（backend/tests）
- `conftest.py`：内存 SQLite（StaticPool）+ 将各适配器的 `async_session_factory` 重定向到测试库（解决模块级 import 的 patch 难点）。
- `test_sandbox_adapter.py`：全量同步落地数量正确；**二次同步幂等、行项不翻倍**。
- `test_shopify_adapter.py`：用 mock `httpx.AsyncClient` 验证凭证校验、首同步创建、重同步更新且行项仍为 2 条。
- `test_webhook.py`：HMAC 验签（正确/错误/缺密钥）+ 经 Webhook 的订单 upsert 幂等。

### 3.3 前端（frontend）
- `pages/Stores.tsx`：新增「测试连接」按钮；同步结果 toast 显示**新增/更新**分项；新增 `sandbox` 平台与说明。
- `services/ecommerce.ts`：新增 `testConnection()`。
- `types/ecommerce.ts`：`StorePlatform` 增加 `sandbox`。

> ✅ **测试结果：6 passed**（pytest，离线，无需任何外部凭证）。

---

## 4. 架构亮点（值得团队保持）

1. **适配器抽象层**：`base.PlatformIntegration` + `PLATFORM_REGISTRY` 让「加一个平台」变成「写一个子类 + 注册一行」，调用方零改动。
2. **统一结果对象**：`SyncResult` / `FullSyncResult` 让同步统计结构化、可测试。
3. **行级多租户**：所有查询强制带 `workspace_id`，配合 `AuditLog`，安全与可追溯性到位。
4. **配置即代码**：pydantic-settings + `.env.example`，环境隔离清晰。

---

## 5. 团队改进建议（可直接落地）

### A. 给同步加「幂等」是铁律
任何「从外部拉数据写本地」的逻辑，**必须能用稳定外部 ID 做 upsert**，且**集合类子表（订单行项、标签）要整体替换而非追加**。本次 bug 正是反面教材。

### B. 凭证安全
`store` 表的 `api_secret` / `access_token` 建议用 `cryptography.fernet` 在写入时加密、读取时解密，密钥放环境变量。明文落库是合规红线。

### C. 入站通道必须验签
Webhook 是公网入口，**永远先验证签名再处理**（已做）。其余平台（抖音、淘宝）接入时同理：抖音用 `sign`，微信/支付用各自签名算法。

### D. 同步改为异步任务
`sync_store` 当前是同步 HTTP 调用。大店铺应改为：
- 接收请求 → 创建 `SyncJob`（pending）→ 后台 worker 执行 → 前端轮询/WebSocket 推进度。
- 同时对外部 API 加大方退避重试（Shopify 429 限流）。

### E. 测试文化
- 给关键业务逻辑（同步、计费、权限）都补 `pytest`；CI 里强制跑。
- 外部依赖一律 mock（`httpx.AsyncClient` / `respx`），保证测试离线、快速、确定性。
- 本次 `sandbox` 适配器本身就是「无依赖即可跑通整链」的好范式，建议保留为团队默认联调方式。

### F. 可观测性
同步结果应落审计 + 暴露指标（成功/失败数、耗时）。出问题能第一时间定位是「凭证失效」还是「平台限流」还是「映射 bug」。

---

## 6. 如何运行测试

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt
pytest tests/ -v
```

> 说明：`conftest` 用内存 SQLite，所有适配器被重定向到测试库，因此**不依赖任何真实 Shopify/抖音凭证**即可验证同步正确性。

---

## 7. 团队实操：如何新增一个平台适配器（以「微信小店」为例）

1. 新建 `app/services/platforms/wechat_shop.py`，继承 `PlatformIntegration`，实现
   `validate_credentials` / `sync_products` / `sync_orders` / `sync_customers`。
2. upsert 方法**必须返回 `is_new`**，行项用「先删后插」保证幂等（参考 `shopify.py`）。
3. 在 `app/services/platforms/__init__.py` 的 `PLATFORM_REGISTRY` 注册：
   `"wechat_shop": WechatShopIntegration`。
4. `app/models/store.py` 的 `StorePlatform` 增加 `WECHAT_SHOP = "wechat_shop"`；
   `app/schemas/store.py` 的 `platform` 正则同步放开。
5. 前端 `types/ecommerce.ts` 的 `StorePlatform` 与 `Stores.tsx` 的 `platformConfig` 增加选项。
6. 在 `backend/tests/` 用 mock HTTP 补一个 `test_wechat_shop_adapter.py`（首同步创建 + 重同步更新 + 行项不翻倍）。
7. 若该平台支持 Webhook，参照 `app/api/webhooks.py` 增加验签 + 路由。

**调用方（`stores.py`）无需任何改动**——这就是抽象层带来的红利。

---

## 8. 后续路线图（建议优先级）

1. 凭证加密落库（合规）。
2. 同步异步化 + 进度查询（大商户可用性）。
3. 外部 API 限流/重试/退避（稳定性）。
4. 各平台 Webhook 接入（抖音/淘宝事件回写）。
5. 同步可观测性面板（成功/失败/耗时）。
6. 端到端测试覆盖计费、权限、RFM。

---

> 评审结论：架构方向正确，已实现「真连接」所需的核心抽象；本次已补齐**最致命的数据正确性 bug**、**入站双向通道**、**离线可验证能力**与**测试底座**。按第 5、8 节推进，可系统性地把团队工程水位拉到生产级。
