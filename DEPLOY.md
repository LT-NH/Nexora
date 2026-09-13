# DEPLOY.md — Nexora 部署与运维手册（RUNBOOK）

> 适用版本：v5.4.0+　最后更新：2026-09-13
> 读者：负责把 Nexora 部署到服务器并维持其可用的人（当前即项目作者）。

---

## 1. 架构概览

```
                 ┌─────────────────────────────┐
   浏览器  ───►  │ 前端：React 18 + Vite (3100)│
                 └──────────────┬──────────────┘
                                │ /api/* 代理
                 ┌──────────────▼──────────────┐
                 │ 后端：FastAPI + SQLAlchemy   │
                 │  业务 / AI / Agent 调度       │
                 └───┬─────────┬───────────┬───┘
                     │         │           │
              ┌──────▼───┐ ┌───▼────┐ ┌────▼────────┐
              │PostgreSQL│ │ Redis  │ │ 外部服务     │
              │  (主库)   │ │缓存/限流│ │ 千问/支付宝/ │
              └──────────┘ └────────┘ │ 微信/Shopify │
                                       └─────────────┘
```

- 本地开发默认 SQLite（零依赖起步）；**生产必须 PostgreSQL**。
- Redis 非必需但推荐（限流、缓存、队列）；缺失时 `/health` 会显示 `degraded`，核心功能不受影响。

---

## 2. 部署方式

### 方式 A：Docker Compose（推荐，一键起全套）

```bash
cd nexora-optimized
cp backend/.env.example backend/.env      # 按需填写环境变量
docker compose up --build -d              # 首次构建约 3-5 分钟
docker compose ps                         # 确认 4 个服务 healthy
curl http://127.0.0.1:8000/health         # 期望 {"status":"healthy"|"degraded"}
```

- Compose 已内置：PostgreSQL 16 + Redis 7 + 后端 + 前端（3000 端口）。
- 后端容器环境变量已在 compose 内注入（`DATABASE_URL` 指向 postgres、`REDIS_URL` 指向 redis）。
- 生产环境**务必**覆盖 `SECRET_KEY`（compose 中默认值仅供开发）。
- 停止：`docker compose down`；连同数据卷清理：`docker compose down -v`（⚠️ 会删库）。

### 方式 B：Render（配置已就绪）

仓库根目录已含 `render.yaml`。在 Render 控制台 "New → Blueprint" 选择本仓库即可；
需要在 Render 面板补齐密钥类环境变量（`SECRET_KEY`、`DASHSCOPE_API_KEY`、支付凭据等）。

### 方式 C：本地 / 自有服务器（Windows 开发者机）

- 一键：双击桌面 `Start-Nexora.bat`（自动清理 8000/3100 旧进程 → 清 vite 缓存 → 起前后端 → 自动开浏览器）。
- 手动：
  ```bash
  # 后端
  cd backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
  # 前端
  cd frontend && npx vite --port 3100 --strictPort
  ```

---

## 3. 环境变量（backend/.env）

| 变量 | 必填 | 说明 |
|---|---|---|
| `SECRET_KEY` | ✅ 生产必填 | JWT 签名密钥，生产必须替换为强随机值 |
| `DATABASE_URL` | ✅ | 本地 `sqlite+aiosqlite:///./data/nexora.db`；生产 `postgresql+asyncpg://user:pass@host:5432/nexora` |
| `PUBLIC_BASE_URL` | ✅ 生产 | 公网基址，用于支付异步通知与回跳（如 `https://app.your-domain.com`） |
| `CORS_ORIGINS` | ✅ 生产 | 允许的前端域名列表（JSON 数组） |
| `DASHSCOPE_API_KEY` | ✅ | 千问大模型调用密钥（AI 决策 / Agent / 诊断） |
| `REDIS_URL` | 推荐 | 如 `redis://localhost:6379/0`；缺失时限流退化为内存实现 |
| `SENTRY_DSN` | 推荐 | 后端错误监控；留空则自动跳过 |
| `VITE_SENTRY_DSN`（前端） | 可选 | 前端错误监控 |
| `WXPAY_APPID` / `WXPAY_MCHID` / `WXPAY_MCH_SERIAL_NO` / `WXPAY_APIV3_KEY` / `WXPAY_PRIVATE_KEY_PATH` | 可选 | 微信支付 Native；齐备后自动启用真实收款 |
| `ALIPAY_APP_ID` / `ALIPAY_APP_PRIVATE_KEY` / `ALIPAY_PUBLIC_KEY` | 可选 | 支付宝电脑网站支付；齐备后自动启用 |
| `ALIPAY_GATEWAY` | 可选 | 留空 = 生产网关；沙箱填 `https://openapi-sandbox.dl.alipaydev.com/gateway.do` |

> 支付凭据的完整性与正确性可用 `python scripts/verify_alipay_config.py` 与
> `python scripts/verify_alipay_gateway.py` 自检（含公私钥配对与网关端到端验签）。

---

## 4. 生产上线检查清单

- [ ] `SECRET_KEY` 已替换为强随机值（≥32 字节）
- [ ] `DATABASE_URL` 指向 PostgreSQL，且已执行 `alembic upgrade head`
- [ ] `PUBLIC_BASE_URL` 为公网 HTTPS 域名（支付回调依赖）
- [ ] `CORS_ORIGINS` 仅包含自有前端域名（不要 `*`）
- [ ] Redis 已启动（`/health` 不再 `degraded`）
- [ ] `SENTRY_DSN` 已配置，并触发一次测试异常确认能收到告警
- [ ] 前端构建产物已部署：`npm run build`（注意静态托管需 `VITE_STATIC_HOST=1` 走 HashRouter）
- [ ] 备份任务已配置（见第 6 节）
- [ ] 支付通道自检通过（若启用）

---

## 5. RUNBOOK — 常见故障处理

| 现象 | 根因 | 处理 |
|---|---|---|
| 页面报 `ECONNREFUSED 127.0.0.1:8000` / 接口全 502 | 后端未启动或掉线 | 双击 `Start-Nexora.bat`；或 `docker compose restart backend`；或手动起 uvicorn |
| 端口 8000 / 3100 被占用，新服务起不来 | 旧进程残留 | `netstat -ano \| findstr :8000` 找到 PID → `taskkill /F /PID <pid>`（启动脚本已自动处理） |
| 前端白屏 / 依赖 504 / 动态 import 失败 | vite 预构建缓存损坏 | 删除 `frontend/node_modules/.vite` 后重启前端 |
| 后端启动即报数据库锁 / `database is locked` | SQLite 并发写入 | 停后端再操作；长期方案：切 PostgreSQL |
| 表结构缺字段 / 迁移状态不一致 | 未执行迁移 | `cd backend && alembic upgrade head`；误操作后 `alembic downgrade -1` |
| `/health` 显示 `degraded` | Redis 未启用 | 启动 Redis 或忽略（核心功能不受影响） |
| 支付宝下单页报 `invalid-timestamp` | 下单表单时间戳过期（>15 分钟） | 重新发起下单（前端会自动重新生成） |
| 支付成功但订阅未激活 | 异步通知未到达（公网/回调问题） | 检查 `PUBLIC_BASE_URL` 公网可达与 `notify_url`；系统有订单查询兜底 |
| 每日 9:30 巡店未执行 | 调度器未运行 / 该工作空间非 Enterprise 档 | 确认后端常驻；确认订阅档位（Enterprise 专属） |
| 前端提示版本过期（stale-state guard） | 新版本部署后本地缓存 | 按提示刷新；或带 `?reset=1` 访问 |

---

## 6. 备份与恢复

**PostgreSQL（生产）**

```bash
# 备份（建议每日，保留 14 天）
pg_dump -U nexora -h localhost -Fc nexora > backup/nexora_$(date +%F).dump

# 恢复
pg_restore -U nexora -h localhost -d nexora --clean backup/nexora_2026-09-13.dump
```

**SQLite（本地开发）**

```bash
copy backend\data\nexora.db backup\nexora_%date:~0,10%.db
```

> 恢复演练：至少每季度在副本库上执行一次恢复，确认备份可用（客户会问“能不能恢复”）。

---

## 7. 回滚

- **代码**：`git revert <commit>` 后重新部署（保留历史，勿用 `reset --hard` 推远端）。
- **容器**：为镜像打版本标签（`nexora-backend:5.4.0`），回滚时把 compose 的 image 指回上一标签并 `docker compose up -d`。
- **数据库**：迁移回滚 `alembic downgrade -1`；结构性变更前先做一次 `pg_dump`。

---

## 8. 版本与变更

- 版本号遵循语义化版本，变更记录见 [CHANGELOG.md](./CHANGELOG.md)。
- 发布流程：更新 `CHANGELOG.md` → 同步版本号（`frontend/package.json`、后端 `FastAPI(version=...)`）→ 打 git tag `v5.4.0` → 部署 → 验证 `/health`。
