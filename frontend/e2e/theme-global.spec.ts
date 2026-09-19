import { test, expect, type Page } from '@playwright/test';

/**
 * 主题必须是**全局单例**（2026-09-19 修复的 bug）。
 *
 * 此前的实现里 `useTheme` 是普通 hook，每个调用方各持一份 `useState`：
 * 顶栏、命令面板、每个 ECharts 实例互不同步。用户表现为
 * 「主题要一个页面一个页面单独切换」。
 *
 * 这里锁定的核心不变量是**跨消费者同步**：
 * 从命令面板切换后，顶栏显示必须同步更新（反之亦然）。
 * 如果又退回到「各持一份 state」，本用例会失败。
 */

const THEME_LABELS = /浅色模式|深色模式|跟随系统/;

async function login(page: Page) {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill('demo@nexora.com');
  await page.getByPlaceholder('请输入您的密码').fill('Demo1234!');
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

/** 顶栏的主题按钮（其 aria-label 反映当前主题） */
function topbarToggle(page: Page) {
  return page.locator('header').getByRole('button', { name: THEME_LABELS });
}

async function htmlTheme(page: Page): Promise<string> {
  return page.evaluate(() => document.documentElement.dataset.theme || '');
}

async function isDark(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.classList.contains('dark'));
}

test.describe('主题全局切换', () => {
  test('从命令面板切换后，顶栏显示同步更新（跨消费者一致）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page);

    // 起点：默认浅色
    const toggle = topbarToggle(page);
    await expect(toggle).toHaveAttribute('aria-label', '浅色模式');
    expect(await isDark(page)).toBe(false);

    // 从**另一个消费者**（命令面板）触发切换
    await page.keyboard.press('Control+k');
    await page.getByText('切换主题', { exact: false }).first().click();

    // html 上的 class 变了……
    await expect.poll(() => isDark(page), { timeout: 5_000 }).toBe(true);
    expect(await htmlTheme(page)).toBe('dark');

    // ……而且顶栏这个**独立消费者**也必须同步更新
    // （旧实现下这里会失败：顶栏仍显示"浅色模式"）
    await expect(toggle).toHaveAttribute('aria-label', '深色模式');
  });

  test('从顶栏切换后，再次打开命令面板仍是一致的下一态', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page);

    const toggle = topbarToggle(page);
    await expect(toggle).toHaveAttribute('aria-label', '浅色模式');

    // 顶栏连续切两次：浅色 → 深色 → 跟随系统
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-label', '深色模式');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-label', '跟随系统');

    // 命令面板用的是同一份状态：再切一次应回到浅色（而不是基于陈旧值算出别的）
    await page.keyboard.press('Control+k');
    await page.getByText('切换主题', { exact: false }).first().click();
    await expect(toggle).toHaveAttribute('aria-label', '浅色模式');
    expect(await htmlTheme(page)).toBe('light');
  });

  test('主题跨页面保持：切换后导航到其它页面不丢', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page);

    await topbarToggle(page).click();
    await expect.poll(() => isDark(page), { timeout: 5_000 }).toBe(true);

    // 前进到订单页（AppLayout 复用，主题不应重置）
    await page.goto('/orders', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    expect(await isDark(page), '导航后主题丢失').toBe(true);
    expect(await htmlTheme(page)).toBe('dark');

    // 再用浏览器后退，同样保持
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    expect(await isDark(page)).toBe(true);
  });

  test('刷新后主题持久化（localStorage）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page);

    await topbarToggle(page).click();
    await expect.poll(() => isDark(page), { timeout: 5_000 }).toBe(true);
    const stored = await page.evaluate(() => localStorage.getItem('nexora-theme'));
    expect(stored).toBe('dark');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    expect(await isDark(page), '刷新后主题未恢复').toBe(true);
  });

  test('「跟随系统」必须尊重系统深色，且刷新后不被品牌默认覆盖', async ({ page }) => {
    // 这条覆盖第二个根因：useBranding 此前会按品牌设置覆盖 class，
    // 把「跟随系统 + 系统深色」直接抹成浅色（刷新后尤其明显）。
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page);

    const toggle = topbarToggle(page);
    // 浅色 → 深色 → 跟随系统
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-label', '深色模式');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-label', '跟随系统');

    // 系统是深色 → 结果必须是深色
    await expect.poll(() => isDark(page), { timeout: 5_000 }).toBe(true);
    expect(await htmlTheme(page)).toBe('dark');

    // 刷新后依然（品牌默认不得覆盖用户"跟随系统"的选择）
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    expect(await isDark(page), '刷新后「跟随系统」被覆盖').toBe(true);
  });

  test('营销首页固定浅色，但不篡改用户选择（离开后恢复）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page);

    // 用户先选深色
    await topbarToggle(page).click();
    await expect.poll(() => isDark(page), { timeout: 5_000 }).toBe(true);

    // 去营销首页：应固定浅色
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    expect(await isDark(page), 'Landing 应固定浅色').toBe(false);

    // 但用户选择没被改掉：localStorage 仍是 dark
    expect(await page.evaluate(() => localStorage.getItem('nexora-theme'))).toBe('dark');

    // 回工作台：恢复深色
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    expect(await isDark(page), '离开 Landing 后应恢复用户主题').toBe(true);
  });
});
