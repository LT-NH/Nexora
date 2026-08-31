# Nexora —— 下一代电商助手平台

多租户电商 SaaS：一个面板管理 Shopify / 抖音 / 淘宝 / 拼多多 / 京东 / Amazon 全渠道订单、库存、客户、优惠券、退款售后，经营健康引擎 + 千问 AI 深度分析 + 超级管理台（租户健康雷达 / 营收运营 / 反馈中心 / 公告广播）。

> **v5.3 核心能力**：超级管理台 5 大新功能上线——租户健康雷达、工作空间管理、营收运营看板、平台反馈中心、平台公告广播，覆盖租户级运营治理全场景。

## 技术栈

- **后端**: FastAPI + SQLAlchemy 2.0 (async) + SQLite/PostgreSQL + Alembic 迁移
- **前端**: React 18 + Vite + TailwindCSS + TipTap + ECharts
- **AI**: 阿里云通义千问 (Qwen) 大模型
- **安全**: JWT 双 Token + 2FA (TOTP) + Fernet AES-128 + 限流中间件

## 快速启动

### 后端

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                  # 按需修改 SECRET_KEY / ENCRYPTION_KEY
# 初始化数据库（两种方式任选其一）
python -m alembic upgrade head                        # 推荐：Alembic 迁移
# 或首次开发用 init_db() 自动建表（启动时自动执行）
# 启动
uvicorn app.main:app --reload --port 8000
```

### 前端

```bash
cd frontend
npm install
npm run dev      # http://localhost:3000（端口被占用时 vite 自动 +1，见启动日志）
```

### 接入真实 Shopify 店铺（推荐）

1. 注册 [Shopify 开发者账号](https://shopify.dev) → 创建 **Development Store**（免费）
2. 店铺后台 → **Settings → Apps and sales channels → Develop apps** → 创建应用
3. **Configuration → Admin API scopes** 勾选：`read_products` / `read_orders` / `read_customers` / `read_price_rules` / `read_inventory`
4. **API credentials** 页复制 **Admin API access token**（`shpat_` 开头，仅显示一次）
5. 登录 Nexora → **店铺管理** → 添加店铺（平台选 Shopify）：
   - 店铺链接：`https://你的店铺.myshopify.com`（后台地址 `admin.shopify.com/store/xxx` 也会自动识别）
   - API Key / Access Token：粘贴 token（两个字段均可）
6. 点「测试连接」→「同步」→ 真实商品/订单/客户/优惠券/退款自动落库

## 演示账号

```
邮箱: demo@nexora.com
密码: Demo1234!
```

## 核心功能

### 真实数据引擎（v4.0）
- **多平台适配器**：Shopify（真实 Admin REST API）/ 抖音 / 淘宝 / 京东 / 拼多多 / Amazon / 沙箱，统一 `PlatformIntegration` 接口，分页/限流/凭证校验内置
- **一键同步**：店铺管理页「测试连接 + 同步」，自动拾取商品 / 订单 / 客户 / 优惠券 / 退款 / 库存并落库
- **真实优惠券同步**：Shopify price rules + discount codes → 优惠券页（买一送一 / 免运费 / 折扣码）
- **真实退款同步**：订单退款事件自动进入退款售后页（金额/原因/订单号关联）

### 经营健康引擎（AI 医生）
- 工作台健康评分（0-100 环形 + 红黄绿）+ 现金流/库存/客户/渠道/增长 5 维度归因
- **今日行动清单**：基于真实数据生成处方（补货/清仓/唤醒/退款排查）+ 预估影响
- **异常雷达**：自动扫描订单突降/退款率异常/断货风险/渠道下滑，按严重度推送
- **一键执行**：清仓自动降价 15%（真实改价）、唤醒自动创建优惠券，执行后健康分实时重算
- **经营周会**：每周经营结论 + 下周预测（含置信度），一键导出分享

### AI 经营指挥台（v5.0 智能体）
- **对话式指挥**：输入自然语言指令（如「把 Gift Card 降价 10%」），千问拆解任务并调用真实工具（搜索商品 / 改价 / 建券 / 经营快照），全程留审计
- **确认制安全执行**：破坏性操作（改价 / 建券）默认挂起待确认，确认后真实写入 Shopify 并回显同步状态；可切换自动执行
- **任务历史**：每次指令的步骤链（工具 / 参数 / 结果 / 状态）完整留档，可回滚
- **自动巡检**：每天 9:00 千问体检（退款率 / 低库存 / 积压），异常主动推送通知
- **AI 结论聚合**：今日摘要 + 一键执行 + 回访命中率 + 销售预测 / 定价雷达 / 风险雷达一屏聚合

### 利润分析（真实毛利看板）
- 基于订单明细 × 商品成本价计算真实营收 / 成本 / 毛利 / 毛利率（demo 46.1%）
- TOP 利润商品榜 + 低毛利预警（<10%）+ 分类毛利透视
- 商品批量编辑支持成本价（cost_price）批量设置

### 多渠道与店铺安全
- 订单列表支持按来源平台筛选（Shopify / 抖音 / 淘宝…）
- 店铺凭证（api_secret / access_token）**Fernet 加密落库**，不存明文
- Shopify 同步支持**增量同步**（仅拉取变更数据，基于 updated_at_min）
- Webhook 路由扩展：订单 / 商品 / 客户三类事件自动 upsert

### 多租户全流程管理
- 订单 / 商品 / 库存 / 优惠券 / 退款售后 / 客户 / 会员 全流程管理
- 客户 RFM 分层 + 会员等级（铜/银/金/钻石）+ Cohort 留存热力图 + AI 流失预警
- Webhook 事件推送 + 开放 API（API Key + scopes）
- 细粒度 RBAC 权限组 + 2FA 双因素认证
- Excel 导出 / CSV 批量导入 / 评论晒图 / 用户反馈 (NPS)
- 数据自动备份 / 性能监控 (Prometheus) / 定时周报邮件
- AI 多轮对话记忆：聊天与图表联动，追问可指代上下文
- **前端性能**：ECharts 按需引入（体积 -60%），统一图表运行时入口避免多注册崩溃

## 环境变量

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | 默认 SQLite；生产用 PostgreSQL |
| `SECRET_KEY` | JWT 密钥，生产必须设置强随机值 |
| `ENCRYPTION_KEY` | 字段加密密钥，生产必须设置 |
| `METRICS_TOKEN` | 设置后 /metrics 需 Bearer Token |
| `SMTP_*` | 邮件通知（新订单/库存预警/周报） |

## 测试

```bash
cd backend
pytest -q        # 39 项测试（离线可跑）
```

## 目录结构

```
backend/
  app/
    api/         # REST API 路由 (25 个)
    models/      # SQLAlchemy 模型 (17 个)
    services/    # 业务逻辑 + 平台适配器 (platforms/)
    middleware/  # 鉴权/限流/监控
    utils/       # 通用工具
  alembic/       # 数据库迁移
  tests/         # 测试套件
frontend/
  src/
    pages/       # 26 个页面
    components/  # UI 组件
    hooks/       # React hooks
    services/    # API 客户端
```

## 更新日志

完整更新历史见前端 **Changelog 页面**（官网底部 / Changelog 路由）。

**v5.3（2026-08-31）**：超级管理台 5 大新功能上线——① **租户健康雷达**（全平台商户 5 维加权健康评分榜，红灯预警实时定位，评分口径与业务端健康引擎一致）② **工作空间管理**（全平台 workspace 列表 + 详情弹窗：成员/订阅/业务计数 + 暂停/恢复一键操作）③ **营收运营看板**（MRR/ARR + 12 月支付趋势折线 + 套餐分布环形饼图 + 14 天流失预警）④ **平台反馈中心**（全平台 NPS 净推荐值 + 推荐者/中立/贬损三段分布 + 处理状态流转 new→resolved/dismissed）⑤ **平台公告广播**（一键广播至全平台工作空间成员，写入通知中心 + 审计日志 + WebSocket 实时推送）。新增 `backend/app/api/admin_ops.py`（9 路由）、5 个前端页面、AdminLayout 导航 9 项扩展；轻量迁移为 `workspaces` / `feedbacks` 表新增 `status` 列。

**v5.3.1（2026-08-31）**：修复「全平台广播未送达」问题——根因是公告写库后未推送 WebSocket 实时事件，加上 Topbar 在 WS 秒连时只同步未读数不拉取列表，导致在线商户的铃铛列表无法显示历史公告。修复：`admin_ops.announce` 提交后遍历所有受通知调 `notify_workspace()` 推送 `notification` 事件；`Topbar.fetchNotifications` 改为始终拉取列表+未读数（WS 只做实时增量追加，去重防重复）；`Topbar.typeIcons` 加 `announcement` 专属大喇叭黄图标。

**v5.2（2026-08-28）**：账号切换体验修复——切换账号后工作空间自动跟随（自动归属校验 + 登出清空残留）；操作后列表即时刷新（写操作成功后清空 GET 缓存，用户管理/订阅支付等所有列表页点击后立即可见变化）；新手引导改为非阻塞（demo 账号自动跳过、点击遮罩即关闭）；「退出登录」彻底清除会话凭证与工作空间选择。

**v5.1（2026-08-30）**：ECharts 按需引入（构建体积 -60% + 稳定性修复）、Landing 页与工作台视觉重设计、图表组件（Top 商品/时段分布）重绘、导航与布局优化。

**v5.0（2026-08）**：AI 经营指挥台（对话式 Agent + 真实工具执行 + 审计）、利润分析毛利看板、店铺凭证加密落库、Shopify 增量同步、多渠道订单筛选、Webhook 事件扩展、工作台经营 KPI 重排与侧边栏分组。
