# Nexora — 全栈多租户 SaaS 电商管理平台

<div align="center">

![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green)
![React](https://img.shields.io/badge/React-18-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6)
![Tests](https://img.shields.io/badge/Tests-28/28-brightgreen)
![License](https://img.shields.io/badge/License-MIT-yellow)

**One Core, All Commerce — 面向中小电商的一站式 SaaS 管理平台**

</div>

## 🚀 快速开始

```bash
git clone ...
cd SaaS
bash deploy.sh
# 访问 http://localhost:3000
# 演示账号: demo@nexora.com / Demo1234!
```

## ✨ 核心功能

| 模块 | 说明 |
|------|------|
| 🏢 多租户工作空间 | OWNER/ADMIN/MEMBER/VIEWER 四级权限, 数据隔离 |
| 📦 商品管理 | CRUD + 变体 + 分类树 + AI 描述生成 |
| 📋 订单管理 | 状态流 + 日期筛选 + 趋势统计 |
| 👥 客户管理 | 标签 + RFM 五层分析 |
| 🏪 多平台接入 | Shopify / 抖音 / 淘宝 / 京东 / Amazon / 沙盒 |
| 🔐 安全体系 | JWT + API Key + Fernet AES + bcrypt + RateLimit |
| 🤖 AI 洞察 | 销售预测 + 客户画像 + 营销文案 + SEO 关键词 |
| 🎨 Glass UI | 暗色模式 + WCAG 2.1 AA + Plus Jakarta Sans 字体 |

## 🛠 技术栈

**后端**: FastAPI + SQLAlchemy 2.0 (async) + Pydantic v2 + JWT + Fernet + 28 项 pytest-asyncio 测试

**前端**: React 18 + TypeScript + Vite + Tailwind CSS + ECharts 5 + 6 种图表类型

**基础设施**: Alembic 迁移 · Docker Compose · GitHub Actions CI · 数据模拟器 · CSV 导出

## 📊 项目规模

- 147 源码文件 | 12 API 路由 | 15 数据模型 | 46 Pydantic Schema
- 28 项集成测试 | 10.2s 全量通过
- 20 前端页面 | 17 UI 组件
- 演示数据: 50 商品 · 80 订单 · 100 客户 · 2 店铺

## 📁 项目结构

```
SaaS/
├── backend/
│   ├── app/
│   │   ├── api/        # REST 路由 (12 个端点组)
│   │   ├── models/     # SQLAlchemy 模型
│   │   ├── schemas/    # Pydantic schema
│   │   ├── services/   # 业务逻辑层
│   │   ├── utils/      # 工具函数
│   │   └── middleware/  # 中间件
│   ├── tests/          # 28 项测试
│   ├── alembic/        # 数据库迁移
│   └── seed_data.py    # 种子数据
├── frontend/
│   ├── src/
│   │   ├── pages/      # 22 个页面
│   │   ├── components/ # UI 组件 + 图表
│   │   ├── hooks/      # 自定义 Hook
│   │   └── services/   # API 客户端
│   └── public/         # 静态资源
└── deploy.sh           # 一键部署
```

## 🧪 测试

```bash
cd backend && pytest -v   # 28 项测试, 10s 完成
```

覆盖: 认证(6) · 商品(7) · 订单(5) · 店铺(4) · 适配器(4) · Webhook(3)

## 📄 环境配置

复制 `backend/.env.example` 到 `backend/.env`，修改 SECRET_KEY 和 DATABASE_URL。

## 👤 作者

李浩棋 — 13656117061

## 📝 更新日志

详见 [/changelog](http://localhost:3000/changelog)
