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
 *   E2E_BASE_URL   覆盖被测站点地址（默认 http://127.0.0.1:3000）
 *   E2E_HEADLESS   1=无头（默认），0=有头
 *
 * 依赖的演示账号（由 backend/seed_demo.py 保证存在）：
 *   demo@nexora.com / Demo1234!
 */
const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';
// 用完整 chromium（而非 headless shell）渲染，避免部分环境下
// chrome-headless-shell 二进制缺失导致 browserType.launch 直接失败。
const HEADLESS = process.env.E2E_HEADLESS !== '0';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,            // 每个测试用例整体超时
  expect: { timeout: 15_000 }, // 每个断言超时
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
