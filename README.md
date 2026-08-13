# Nexora — 全栈多租户 SaaS 电商管理平台

<div align="center">

![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green)
![React](https://img.shields.io/badge/React-18-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6)
![ECharts](https://img.shields.io/badge/ECharts-5.x-orange)
![Tests](https://img.shields.io/badge/Tests-39/39-brightgreen)
![License](https://img.shields.io/badge/License-MIT-yellow)

**One Core, All Commerce — 面向中小电商的一站式 SaaS 经营平台**

**从「数据展示」到「AI 经营顾问」：体检 → 诊断 → 处方 → 执行，全链路闭环**

</div>

## 🏥 核心卖点：经营健康引擎

Nexora 不只展示数据，更像一位「经营医生」——自动体检、归因诊断、给出明确处方并一键执行：

| 能力 | 说明 |
|------|------|
| 🩺 **健康评分** | 0-100 环形分 + 红黄绿三态，现金流/库存/客户/渠道/增长 5 维度自动评分与归因 |
| 📡 **异常雷达** | 自动扫描订单突降 / 退款率异常 / 断货风险 / 渠道下滑，按严重度主动推送 |
| ⚡ **一键执行** | 清仓自动降价 15%（真实改价）、唤醒自动创建满 99 减 20 券，执行后健康分实时重算 |
| 📅 **经营周会** | 每周一页经营结论：3 个关键变化 + 下周 3 件事 + 下周营收预测（含置信度），一键导出分享 |

> 演示 60 秒：健康分 69 黄灯 → 异常雷达提示库存告急 → 今日行动点「执行」→ 商品真实降价 15% → 健康分重算 → 周会导出给合伙人。

## ✨ 核心功能

| 模块 | 说明 |
|------|------|
| 🏢 多租户工作空间 | OWNER/ADMIN/MEMBER/VIEWER 四级权限，数据硬隔离 |
| 📦 商品管理 | CRUD + 变体 + 分类 + AI 描述/SEO 生成 + 库存预警 |
| 📋 订单管理 | 状态流 + 多维筛选 + 批量操作 + 趋势统计 |
| 👥 客户管理 | 标签 + RFM 五层分群 + Cohort 留存热力图 + 流失预警 |
| 🤖 AI 智能助手 | 自然语言 BI 问答（营收/热销/退款/库存/流失 6 类意图），真实查库 + 多轮记忆 + 图表联动高亮 |
| 🏪 多平台接入 | Shopify / 抖音 / 淘宝 / 京东 / Amazon / 沙盒适配器 |
| 💳 收款管理 | 支付宝/微信模拟扫码收款 + 订单状态实时联动 |
| 🎨 品牌定制 | 品牌名/Logo/主色实时生效，9 个图表跟随品牌色一键换肤 |
| 📡 Webhook + 事件总线 | 订单事件驱动实时通知，Redis 队列 + 重试 |
| 🔐 安全体系 | JWT + API Key + Fernet AES + bcrypt + 限流 + 审计日志 |
| 🌍 国际化 | 中/英双语，18+ 页面即时切换 |
| 🎬 Glass UI | 液态玻璃质感 + 极光背景 + 暗色模式 + WCAG 2.1 AA |

## 🛠 技术栈

**后端**: FastAPI + SQLAlchemy 2.0 (async) + Pydantic v2 + 通义千问(Qwen) + JWT + Fernet + Redis（限流/缓存/队列）

**前端**: React 18 + TypeScript + Vite + Tailwind CSS + ECharts 5（9 种图表）+ WebSocket 实时推送

**基础设施**: Alembic 迁移 · Docker Compose · GitHub Actions CI · 90 天种子数据 · 压测脚本 · 性能报告模板

## 🚀 快速开始

```bash
git clone git@github.com:LT-NH/Nexora.git
cd Nexora

# 方式一：一键脚本
bash deploy.sh

# 方式二：Docker Compose（生产化）
docker compose up --build

# 访问 http://localhost:3000
# 演示账号: demo@nexora.com / Demo1234!
```

## 📊 项目规模

- 后端 17 个 API 路由组 | 15+ 数据模型 | 50+ Pydantic Schema
- **39 项集成测试全量通过**（认证/商品/订单/退款/会员/权限/反馈）
- 前端 22 个页面 | 9 种 ECharts 图表 | 40+ 组件
- 演示数据: 90 天 3,300+ 订单 · 30 客户 · 8 商品 · 多平台

## 📁 项目结构

```
Nexora/
├── backend/
│   ├── app/
│   │   ├── api/        # REST 路由（含 health.py 经营健康引擎）
│   │   ├── models/     # SQLAlchemy 模型
│   │   ├── schemas/    # Pydantic schema
│   │   ├── services/   # 业务逻辑（AI 代理 / 报告 / 事件总线）
│   │   ├── utils/      # 工具函数
│   │   └── middleware/ # 鉴权 / 限流 / 指标
│   ├── tests/          # 39 项集成测试
│   ├── alembic/        # 数据库迁移
│   └── seed_demo.py    # 90 天种子数据（含流失客户模拟）
├── frontend/
│   ├── src/
│   │   ├── pages/      # 22 个页面（Dashboard/AI 助手/分析等）
│   │   ├── components/ # UI 组件 + 图表（健康卡/周会卡）
│   │   ├── hooks/      # 自定义 Hook（图表品牌色/WebSocket）
│   │   └── services/   # API 客户端（GET 缓存去重）
│   └── public/         # 静态资源
├── .github/            # CI
├── Dockerfile.backend / Dockerfile.frontend
├── docker-compose.yml
└── render.yaml         # Render 免费部署蓝图
```

## 🧪 测试

```bash
cd backend && pytest -v   # 39 项测试, ~20s 完成
```

覆盖: 认证 · 商品 · 订单 · 退款 · 会员等级 · 权限 · 反馈 · Webhook

## 📄 环境配置

复制 `backend/.env.example` 到 `backend/.env`，配置：

```
SECRET_KEY=你的随机密钥
DATABASE_URL=sqlite+aiosqlite:///./data/nexora.db   # 或 PostgreSQL
REDIS_URL=redis://localhost:6379/0                    # 可选，自动降级
QWEN_API_KEY=你的通义千问 Key                        # AI 能力（无 Key 自动回退规则引擎）
```

## 👤 作者

李浩棋 — 13656117061

## 📝 更新日志

| 版本 | 亮点 |
|------|------|
| v3.1 | 经营健康引擎（评分/异常/执行/周会）、Cohort 留存、流失预警、工作台秒开、可视化升级 |
| v3.0 | AI 全面接入千问、收款管理、品牌白标、国际化、Docker 部署、CI |
| v2.x | 安全加固（金额服务端重算/超管鉴权）、WebSocket 实时通知、SSE 流式输出 |
| v2.0 | AI 数据洞察、暗色模式、Glass 特效、路由瘦身重构 |
