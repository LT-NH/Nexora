import { test, expect } from '@playwright/test';

/**
 * 超管管理台 E2E
 *
 * 重点锁两件事：
 *   1. 管理台是**独立全屏壳**，不与业务端布局叠加。
 *      历史上 `/admin` 嵌在 AppLayout 里，导致所有超管页出现双层外壳
 *      （业务侧栏 + 管理侧栏、业务顶栏 + 管理顶栏）。
 *   2. AI 模型切换器可用：渲染完整 + 一键切换真的生效（并还原）。
 */

const ADMIN_BASE = 'demo@nexora.com';

async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill(ADMIN_BASE);
  await page.getByPlaceholder('请输入您的密码').fill('Demo1234!');
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

/** 定位某个模型所在卡片：必须同时含该 model_id 与「设为当前」按钮 */
function modelCard(page: import('@playwright/test').Page, modelId: string) {
  return page
    .locator('div.rounded-xl')
    .filter({ has: page.locator(`code:text-is("${modelId}")`) })
    .filter({ has: page.getByRole('button', { name: '设为当前' }) })
    .last();
}

test.describe('超管管理台', () => {
  test('管理台是独立全屏壳，不与业务端布局叠加', async ({ page }) => {
    await loginAsAdmin(page);

    // 先确认业务端确实有 vt-topbar（否则本断言形同虚设）
    await page.goto('/dashboard');
    await expect(page.locator('header.vt-topbar').first()).toBeVisible();

    await page.goto('/admin/ai-models');
    await expect(page.getByRole('heading', { name: 'AI 模型切换' })).toBeVisible({
      timeout: 30_000,
    });

    // 业务端顶栏不应出现
    await expect(page.locator('header.vt-topbar')).toHaveCount(0);

    // 管理台自己的侧栏导航与身份标识
    await expect(page.getByRole('link', { name: 'AI 模型切换' })).toBeVisible();
    await expect(page.getByRole('link', { name: '审计日志' })).toBeVisible();
    // 顶栏身份徽章。注意必须加 exact —— 侧栏底部还有一句
    // 「操作全部留痕 · Superadmin 专属」，不加 exact 会 strict mode 违规
    await expect(page.getByText('Superadmin', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: '返回业务端' })).toBeVisible();

    // 桌面无横向溢出
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow, '管理台桌面不应横向溢出').toBe(false);

    // 窄屏：侧栏收起为横向导航条，且不撑破文档宽度
    // （固定 240px 侧栏曾在 390px 视口下直接撑破页面）
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    const mobOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(mobOverflow, '管理台窄屏不应横向溢出').toBe(false);
    // 窄屏仍要能导航（横向导航条里保留入口）
    await expect(page.getByRole('link', { name: 'AI 模型切换' }).first()).toBeVisible();
  });

  test('模型切换器渲染完整（当前模型 / 凭证 / 模型卡片）', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/ai-models');

    const activeCard = page.locator('div.border-violet-200').first();
    await expect(activeCard).toBeVisible({ timeout: 30_000 });
    await expect(activeCard).toContainText('当前生效模型');
    // 当前模型必须是可解析的 qwen 模型名
    expect(await activeCard.innerText()).toMatch(/qwen[\w.\-]+/);

    // 凭证与端点区块
    await expect(page.getByText('凭证与端点')).toBeVisible();
    await expect(page.getByText('Base URL')).toBeVisible();

    // 卡片数量 = 内置目录规模（每个卡片都有「自检」按钮）
    const cards = page
      .locator('div.rounded-xl')
      .filter({ has: page.getByRole('button', { name: '自检' }) });
    expect(await cards.count()).toBeGreaterThanOrEqual(10);

    // 每个卡片都应有「设为当前」或「当前使用中」
    const switchable = await page
      .getByRole('button', { name: /设为当前|当前使用中/ })
      .count();
    expect(switchable).toBeGreaterThanOrEqual(10);
  });

  test('一键切换当前模型真的生效，并自动还原', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/ai-models');

    const activeCard = page.locator('div.border-violet-200').first();
    await expect(activeCard).toBeVisible({ timeout: 30_000 });
    const original = (await activeCard.innerText()).match(/qwen[\w.\-]+/)?.[0] ?? '';
    expect(original, '应能读出当前模型').toMatch(/^qwen/);

    // 挑一个不是当前的模型作为切换目标
    const target = original === 'qwen-max' ? 'qwen-plus' : 'qwen-max';
    const targetCard = modelCard(page, target);
    await expect(targetCard).toHaveCount(1);

    try {
      await targetCard.getByRole('button', { name: '设为当前' }).click();
      // 顶部「当前生效模型」卡片必须换成目标模型
      await expect(activeCard).toContainText(target, { timeout: 30_000 });
    } finally {
      // 无论如何都还原，避免污染其他用例与本地开发状态
      const back = modelCard(page, original);
      await back.getByRole('button', { name: '设为当前' }).click();
      await expect(activeCard).toContainText(original, { timeout: 30_000 });
    }
  });

  test('未登录访问管理台会跳转登录页', async ({ page }) => {
    await page.goto('/admin/ai-models');
    await page.waitForURL(/\/login/, { timeout: 30_000 });
    await expect(page.getByRole('button', { name: '登录' })).toBeVisible();
  });
});
