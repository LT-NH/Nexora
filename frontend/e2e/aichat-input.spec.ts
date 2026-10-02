import { test, expect, type Page } from '@playwright/test';

/**
 * AI 对话页回归守卫（2026-10-02）。
 *
 * 锁定的两个不变量：
 *  1. **输入框内外层对齐** —— 此前 textarea 无垂直内边距、靠 items-end 底对齐，
 *     高度只有 22.4px 而发送按钮 38.4px，文字比按钮低约 16px（用户报的
 *     「内层和外层不匹配」）。现要求两者等高、底边对齐、可输入区与视觉胶囊一致。
 *  2. **多行自动增高** —— 此前 rows={1} 固定高度，多行只能内部滚动；
 *     现要求 scrollHeight === clientHeight（内容全部可见，没有内部滚动条）。
 */

async function login(page: Page) {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill('demo@nexora.com');
  await page.getByPlaceholder('请输入您的密码').fill('Demo1234!');
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

async function goChat(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page);
  await page.goto('/ai-chat', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('textarea')).toBeVisible({ timeout: 15_000 });
}

test.describe('AI 对话输入框', () => {
  test('输入框与发送按钮等高、底边对齐', async ({ page }) => {
    await goChat(page);

    const m = await page.evaluate(() => {
      const ta = document.querySelector('textarea') as HTMLTextAreaElement;
      const btn = ta.parentElement!.querySelector('button') as HTMLElement;
      const a = ta.getBoundingClientRect();
      const b = btn.getBoundingClientRect();
      return {
        taH: a.height,
        btnH: b.height,
        taTop: a.top,
        btnTop: b.top,
        taBottom: a.bottom,
        btnBottom: b.bottom,
        taPadTop: getComputedStyle(ta).paddingTop,
        taPadBottom: getComputedStyle(ta).paddingBottom,
      };
    });

    // 等高（允许亚像素误差）
    expect(Math.abs(m.taH - m.btnH), `textarea ${m.taH} vs 按钮 ${m.btnH}`).toBeLessThanOrEqual(1);
    // 底边对齐
    expect(Math.abs(m.taBottom - m.btnBottom)).toBeLessThanOrEqual(1);
    // 顶边对齐 —— 修复前这里会差 16px
    expect(Math.abs(m.taTop - m.btnTop), '输入区未与按钮对齐（内外层错位）').toBeLessThanOrEqual(1);
    // 必须有垂直内边距，否则文字无法与按钮文字居中对齐
    expect(parseFloat(m.taPadTop)).toBeGreaterThan(0);
    expect(parseFloat(m.taPadBottom)).toBeGreaterThan(0);
  });

  test('多行输入自动增高，且不出现内部滚动条', async ({ page }) => {
    await goChat(page);

    const before = await page.locator('textarea').evaluate((el) => el.getBoundingClientRect().height);

    await page.locator('textarea').fill('第一行\n第二行\n第三行');
    await page.waitForTimeout(250);

    const after = await page.evaluate(() => {
      const ta = document.querySelector('textarea') as HTMLTextAreaElement;
      const outer = ta.parentElement as HTMLElement;
      return {
        taH: ta.getBoundingClientRect().height,
        outerH: outer.getBoundingClientRect().height,
        scrollH: ta.scrollHeight,
        clientH: ta.clientHeight,
      };
    });

    expect(after.taH, '三行文本后输入框未增高').toBeGreaterThan(before + 20);
    // 内容全部可见 = 没有内部滚动条
    expect(Math.abs(after.scrollH - after.clientH), '出现内部滚动条').toBeLessThanOrEqual(1);
    // 外层容器同步长高，不会把输入区裁掉
    expect(after.outerH).toBeGreaterThan(after.taH);

    // 清空后应回到单行高度（height 先归零再测量的意义）
    await page.locator('textarea').fill('');
    await page.waitForTimeout(250);
    const cleared = await page.locator('textarea').evaluate((el) => el.getBoundingClientRect().height);
    expect(Math.abs(cleared - before), '清空后未回落到单行高度').toBeLessThanOrEqual(2);
  });
});
