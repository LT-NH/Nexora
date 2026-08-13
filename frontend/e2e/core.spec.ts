import { test, expect } from '@playwright/test';

/**
 * 核心业务页面 E2E 测试
 *
 * 覆盖：
 *   1. 登录 → 侧边栏导航到 /products → 页面加载 → 打开「添加商品」弹窗
 *   2. 登录 → /dashboard 统计卡片正常渲染
 */

/** 登录演示账号并等待进入仪表盘 */
async function loginAsDemo(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill('demo@nexora.com');
  await page.getByPlaceholder('请输入您的密码').fill('Demo1234!');
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

test.describe('核心业务页面', () => {
  test('登录后通过侧边栏进入商品管理并打开创建弹窗', async ({ page }) => {
    await loginAsDemo(page);

    // 通过侧边栏导航到 /products
    await page.getByRole('link', { name: '商品管理' }).click();
    await page.waitForURL(/\/products/, { timeout: 15_000 });

    // 页面加载成功：出现页面标题
    await expect(page.getByRole('heading', { name: '商品管理' })).toBeVisible({
      timeout: 15_000,
    });

    // 打开「添加商品」弹窗
    await page.getByRole('button', { name: '添加商品' }).click();
    await expect(page.getByRole('heading', { name: '添加商品' })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('登录后仪表盘显示统计卡片', async ({ page }) => {
    await loginAsDemo(page);

    // 欢迎语出现（页面未报错）
    await expect(page.getByText(/欢迎回来/)).toBeVisible({ timeout: 15_000 });

    // 统计卡片出现（成员总数 / 7天订单 / 周报 / 客单价 任一即可）
    const statCard = page.getByText(/成员总数|7天订单|周报|客单价/).first();
    await expect(statCard).toBeVisible({ timeout: 15_000 });
  });
});
