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

  test('登录页左侧品牌叙事栏渲染完整（桌面断点）', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/login');

    // 主张标题
    await expect(
      page.getByRole('heading', { name: /一个面板/ }),
    ).toBeVisible({ timeout: 15_000 });

    // 四条能力主张
    for (const t of [
      '多渠道订单自动汇聚',
      '千问 AI 经营分析',
      '六维经营健康评分',
      '企业级权限与安全',
    ]) {
      await expect(page.getByText(t, { exact: true })).toBeVisible();
    }

    // 图标引用已从横版品牌图切换为方形标记，且实际加载成功
    const logoOk = await page.evaluate(async () => {
      const img = document.querySelector(
        'img[src="/favicon-512.png"]',
      ) as HTMLImageElement | null;
      if (!img) return { found: false, ok: false, w: 0 };
      if (!img.complete) await img.decode().catch(() => {});
      return { found: true, ok: img.naturalWidth > 0, w: img.naturalWidth };
    });
    expect(logoOk.found, '登录页应引用 /favicon-512.png').toBe(true);
    expect(logoOk.ok, 'favicon-512.png 应能成功解码').toBe(true);

    // 500 以上不再出现的横版品牌图引用（防止回退到旧资源）
    const stale = await page.evaluate(() =>
      Array.from(document.querySelectorAll('img')).filter((i) =>
        /favicon\.png$|og\.png$/.test(i.getAttribute('src') || ''),
      ).length,
    );
    expect(stale, '不应再引用已删除的 favicon.png / og.png').toBe(0);

    // 无横向溢出
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow, '登录页不应横向溢出').toBe(false);
  });

  test('登录页窄屏下隐藏左栏但保留品牌条', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/login');

    // 窄屏：左栏隐藏，改由右侧顶部品牌条承接
    await expect(page.locator('h2', { hasText: 'Nexora' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow, '窄屏登录页不应横向溢出').toBe(false);
  });
});
