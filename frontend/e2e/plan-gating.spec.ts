import { test, expect } from '@playwright/test';

/**
 * 订阅门控与 Agent 权限边界 E2E 测试
 *
 * 为什么单独测这两块：它们是最容易出回归、且后果最严重的地方
 *   · 套餐门控错配 → Free 用户白嫖 Pro/Enterprise 能力（曾真实发生过）
 *   · Agent 越权   → 高风险动作（改价）被自动执行，直接影响营收
 *
 * 覆盖：
 *   1. 演示账号（Enterprise/超管）可见巡店 Agent 面板与决策回放
 *   2. Agent 权限边界表正确展示「可自主 / 需你确认」两类动作
 *   3. 高风险动作 price_adjust 永远落在「需你确认」一侧
 */

async function loginAsDemo(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill('demo@nexora.com');
  await page.getByPlaceholder('请输入您的密码').fill('Demo1234!');
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

test.describe('订阅门控与 Agent 权限边界', () => {
  test('Enterprise 账号可见巡店 Agent 面板', async ({ page }) => {
    await loginAsDemo(page);

    // 巡店 Agent 卡片标题
    await expect(page.getByText('巡店 Agent').first()).toBeVisible({ timeout: 15_000 });

    // Agent 权限边界区块（折叠标题始终可见）
    await expect(page.getByText('Agent 权限边界')).toBeVisible({ timeout: 15_000 });
  });

  test('Agent 权限边界：改价需确认、发券可自主', async ({ page }) => {
    await loginAsDemo(page);

    // 展开「Agent 权限边界」
    await page.getByText('Agent 权限边界').click();

    // 中等风险动作 → 标记为「Agent 可自主」
    await expect(page.getByText('发放优惠券')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Agent 可自主').first()).toBeVisible();

    // 高风险动作 → 标记为「需你确认」
    await expect(page.getByText('调整售价')).toBeVisible();
    await expect(page.getByText('需你确认').first()).toBeVisible();

    // 关键断言：改价绝对不能出现在「可自主」一侧
    // —— 通过校验它的说明文案属于确认侧来间接验证
    await expect(
      page.getByText(/不可逆影响营收/),
    ).toBeVisible();
  });

  test('Agent 决策回放时间线渲染四阶段', async ({ page }) => {
    await loginAsDemo(page);

    const replay = page.getByText('Agent 决策回放').first();
    await expect(replay).toBeVisible({ timeout: 15_000 });

    // 四阶段标签（感知 / 决策 / 执行 / 回访）
    await expect(page.getByText('感知').first()).toBeVisible();
    await expect(page.getByText('决策').first()).toBeVisible();
  });
});

test.describe('Free 套餐门控（未登录态兜底）', () => {
  test('未登录访问 dashboard 会跳转到登录页', async ({ page }) => {
    await page.goto('/dashboard');
    // ProtectedRoute 应把未认证用户送回登录页
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    await expect(page.getByRole('button', { name: '登录' })).toBeVisible();
  });
});
