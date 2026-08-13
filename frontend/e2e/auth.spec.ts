import { test, expect } from '@playwright/test';

/**
 * 认证流程 E2E 测试
 *
 * 覆盖：
 *   1. 注册新用户 → 成功跳转仪表盘 / 出现成功 toast
 *   2. 登录演示账号 → 跳转 /dashboard
 */

test.describe('认证流程', () => {
  test('注册新用户后跳转仪表盘', async ({ page }) => {
    await page.goto('/register');

    const email = `e2e+${Date.now()}@test.com`;

    // 填写注册表单
    await page.getByPlaceholder('张三').fill('E2E 测试用户');
    await page.getByPlaceholder('you@example.com').fill(email);
    await page.getByPlaceholder('创建一个强密码').fill('Test1234!');
    await page.getByPlaceholder('请再次输入密码').fill('Test1234!');
    await page.locator('input[type="checkbox"]').check();
    await page.getByRole('button', { name: '创建账户' }).click();

    // 期望：跳转到仪表盘，或出现「账户已创建！」成功 toast
    const redirected = await page
      .waitForURL(/\/dashboard/, { timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    const toastVisible = await page
      .getByText('账户已创建！')
      .isVisible()
      .catch(() => false);

    expect(redirected || toastVisible, '注册后应跳转仪表盘或出现成功 toast').toBe(true);
  });

  test('登录演示账号后跳转仪表盘', async ({ page }) => {
    await page.goto('/login');

    await page.getByPlaceholder('you@example.com').fill('demo@nexora.com');
    await page.getByPlaceholder('请输入您的密码').fill('Demo1234!');
    await page.getByRole('button', { name: '登录' }).click();

    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
    expect(page.url()).toContain('/dashboard');
  });
});
