# Nexora E2E 测试（Playwright）

端到端测试覆盖认证流程与核心业务页面（商品管理 / 仪表盘）。

## 前置条件

1. 启动后端 API（默认 `http://127.0.0.1:8000`）：
   ```bash
   cd backend
   python -m uvicorn app.main:app --port 8000
   ```
   > 演示账号 `demo@nexora.com / Demo1234!` 由 `backend/seed_demo.py` 保证存在。
   > 建议先运行 `python seed_demo.py` 让仪表盘图表有数据。

2. 启动前端 dev server（`http://localhost:3000`，vite 已配置 `/api` 代理）：
   ```bash
   cd frontend
   npm run dev
   ```

## 安装依赖

```bash
cd frontend
npm i -D @playwright/test
npx playwright install chromium    # 首次需要下载浏览器
```

> **注意（回退路径）**：本环境沙箱限制了 npm 对 `node_modules` / `package-lock.json` 的写入，
> 自动化安装被拦截。因此 `@playwright/test@1.62.1` 已通过以下方式就位：
> 1. `package.json` 的 `devDependencies` 已加入 `"@playwright/test": "^1.62.1"`；
> 2. `package-lock.json` 已手工补齐 `@playwright/test`、`playwright`、`playwright-core` 三个条目（含正确 integrity）。
>
> 如果你在其它环境遇到 lockfile 与 `npm ci` 不同步，直接执行上面的
> `npm i -D @playwright/test` 重新生成即可。

## 运行测试

```bash
cd frontend
npx playwright test                # 运行全部
npx playwright test e2e/auth.spec.ts   # 只跑认证
npx playwright test --headed       # 带浏览器窗口
```

## 失败截图 / 报告

- 失败截图与 trace 输出在 `frontend/test-results/`
- HTML 报告在 `frontend/playwright-report/`（用 `npx playwright show-report` 查看）

## 类型检查

主 `tsconfig.json` 只包含 `src`，E2E 文件不影响 `npm run build`。
单独校验 E2E 文件类型：

```bash
cd frontend
npx tsc --noEmit -p e2e/tsconfig.json
```
