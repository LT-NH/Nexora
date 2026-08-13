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
 * 依赖的演示账号（由 backend/seed_demo.py 保证存在）：
 *   demo@nexora.com / Demo1234!
 */
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
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  outputDir: 'test-results',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
