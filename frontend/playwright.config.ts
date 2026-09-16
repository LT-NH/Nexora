import { defineConfig, devices } from '@playwright/test';

/**
 * Nexora 前端 E2E 测试配置
 *
 * 前置条件：本地已启动后端 API（http://127.0.0.1:8000）与前端 dev server
 *   - 后端：  cd backend && uvicorn app.main:app --port 8000
 *   - 前端：  cd frontend && npm run dev        （vite 端口 3000，含 /api 代理）
 *
 * 运行：
 *   npx playwright install chromium   # 首次需要安装浏览器
 *   npm run e2e                       # 或 npx playwright test
 *
 * 可用环境变量：
 *   E2E_BASE_URL   覆盖被测站点地址（默认 http://localhost:3000）
 *   E2E_HEADLESS   1=无头（默认），0=有头
 *
 * 依赖的演示账号（由 backend/seed_demo.py 保证存在）：
 *   demo@nexora.com / Demo1234!
 */
// 默认用 localhost 而不是 127.0.0.1：vite 未指定 --host 时只绑 localhost，
// 在本机它解析到 IPv6 ::1，于是 127.0.0.1:3000 会被拒（ERR_CONNECTION_REFUSED），
// 表现为「全量用例同时连接失败」。localhost 在两种绑定下都能通（浏览器会回退），
// 所以它是更稳的默认值。若显式用 --host 127.0.0.1 起服务，用 E2E_BASE_URL 覆盖即可。
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
// 用完整 chromium（而非 headless shell）渲染，避免部分环境下
// chrome-headless-shell 二进制缺失导致 browserType.launch 直接失败。
const HEADLESS = process.env.E2E_HEADLESS !== '0';

export default defineConfig({
  testDir: './e2e',
  // 这是本机开发环境：同一台机器还跑着 vite + 后端 + 可能的 Docker。
  // Playwright 默认取 50% 核数（本机约 6 workers）会互相抢占 CPU，
  // 导致「仪表盘数据没在 15s 内渲染出来」这类**与真实缺陷无关**的超时。
  // 实测：25 个用例 / 6 workers 时 core.spec 与新增用例均出现超时；
  // 降到 3 workers + 放宽超时后稳定。稳定性优先于速度。
  workers: 3,
  timeout: 45_000,            // 每个测试用例整体超时
  expect: { timeout: 20_000 }, // 每个断言超时
  fullyParallel: false,       // 演示应用有共享状态，串行更稳
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: BASE_URL,
    headless: HEADLESS,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  outputDir: 'test-results',
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // 显式走完整 chromium channel，绕开缺失的 chromium_headless_shell
        headless: HEADLESS,
      },
    },
  ],
});
