# Contributing to Nexora

感谢你对 Nexora 的关注！

## 开发环境搭建

```bash
# 克隆仓库
git clone git@github.com:LT-NH/Nexora.git
cd Nexora

# 后端
cd backend
python -m venv venv && source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000

# 前端
cd ../frontend
npm install
npm run dev
```

## 运行测试

```bash
cd backend && pytest -v   # 28 tests, ~10s
cd frontend && npx tsc --noEmit  # Type check
```

## Pull Request 流程

1. Fork 仓库
2. 创建 feature 分支 (`git checkout -b feature/amazing-feature`)
3. 提交改动 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 开启 Pull Request

## 项目作者

李浩棋 — 13656117061
