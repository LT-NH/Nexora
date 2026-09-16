import { test, expect } from '@playwright/test';

/**
 * 右下角浮动按钮簇（返回顶部 / 快速反馈 / AI 助手）
 *
 * 守护两类问题：
 *
 * 1) **位置必须相对视口**。CSS 规范：祖先元素带 `transform` 时，其
 *    `position: fixed` 的后代会改为相对该祖先定位。历史上「快速反馈」就被
 *    AppLayout 里带 transform 的内容包裹层裹住，写在 `bottom-24` 却实测落在
 *    视口偏上（bottom=670）。所以这里量的是「距视口底部的像素」。
 *
 * 2) **三者必须是一套规范**：48×48、右侧对齐 24、自下而上 24/84/144、
 *    全圆角、z 一致、且不得残留非品牌色（曾用 blue-600）。
 */

const EXPECT = [
  { label: '返回顶部', bottom: 24 },
  { label: '快速反馈', bottom: 84 },
  { label: 'AI 助手', bottom: 144 },
];

/** 仪表盘就绪标志：统计卡片文案（问候语按小时变，不能用它当锚点） */
const DASHBOARD_READY = /成员总数|7天订单|周报|客单价/;

async function loginAsDemo(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill('demo@nexora.com');
  await page.getByPlaceholder('请输入您的密码').fill('Demo1234!');
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  await expect(page.getByText(DASHBOARD_READY).first()).toBeVisible({ timeout: 30_000 });
}

/**
 * 冻结 NPS 自动弹窗，让浮动按钮簇的状态确定。
 *
 * 为什么必须处理：NPS 面板弹出时会**取代**「快速反馈」按钮（同一位置互斥），
 * 量坐标时可能正好被顶掉 → 偶发「找不到按钮」。
 *
 * 为什么不用「等它弹完再关」：NPS 定时器是在 `currentWorkspace` 就绪后才启动的，
 * 启动时刻晚于「仪表盘就绪」标志，用固定等待覆盖不住（实测 5.6s 仍会漏，
 * 全量并行时会话更慢、漏得更彻底）。改成「写标记 + 重载」后，FeedbackWidget
 * 重新挂载时就会看到标记、不再安排定时器 → 确定性。
 */
async function loginAndFreezeNps(page: import('@playwright/test').Page) {
  await loginAsDemo(page);
  const wsId = await page.evaluate(() => localStorage.getItem('current_workspace_id'));
  if (wsId) {
    await page.evaluate(
      (k) => localStorage.setItem(k, String(Date.now())),
      `nexora_nps_last_shown_${wsId}`,
    );
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText(DASHBOARD_READY).first()).toBeVisible({ timeout: 30_000 });
}

async function fabMetrics(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const out: any[] = [];
    document.querySelectorAll('button[aria-label]').forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed') return;
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      out.push({
        label: el.getAttribute('aria-label') || '',
        right: Math.round(window.innerWidth - r.right),
        bottom: Math.round(window.innerHeight - r.bottom),
        w: Math.round(r.width),
        h: Math.round(r.height),
        z: cs.zIndex,
        bg: cs.backgroundColor,
        gradient: cs.backgroundImage !== 'none',
      });
    });
    return out;
  });
}

test.describe('浮动按钮簇', () => {
  test('三个按钮同列对齐、尺寸一致，且相对视口定位正确', async ({ page }) => {
    await loginAndFreezeNps(page);

    // 滚下去让「返回顶部」进入可见态 —— 隐藏态带 translate-y-3，会偏移 12px
    await page.evaluate(() => window.scrollTo(0, 900));
    await page.waitForTimeout(800);

    const metrics = await fabMetrics(page);

    for (const { label, bottom } of EXPECT) {
      const m = metrics.find((x) => x.label === label);
      expect(m, `应存在浮动按钮「${label}」`).toBeTruthy();
      // 关键断言：必须是「距视口底部」的像素。祖先带 transform 时会明显偏离。
      expect(
        Math.abs(m!.bottom - bottom),
        `「${label}」距视口底部应为 ${bottom}px，实测 ${m!.bottom}px —— 若偏差很大，` +
          `检查它是否被放进了带 transform 的容器（fixed 会改为相对该容器定位）`,
      ).toBeLessThanOrEqual(1);
      expect(m!.right, `「${label}」右侧边距应为 24`).toBe(24);
      expect([m!.w, m!.h], `「${label}」应为 48×48`).toEqual([48, 48]);
    }

    // 右侧完全对齐 → 视觉上成一列
    expect(new Set(metrics.map((m) => m.right)).size, '三个按钮右侧未对齐').toBe(1);
    // 不得残留非品牌色（blue-600）
    expect(
      metrics.some((m) => m.bg === 'rgb(37, 99, 235)'),
      '浮动按钮不应使用 blue-600（非品牌色）',
    ).toBe(false);
    // 主行动保持品牌渐变
    expect(metrics.some((m) => m.gradient), '应有主行动按钮使用品牌渐变').toBe(true);
  });

  test('反馈面板锚定在按钮簇上方，且不被浮动按钮遮挡', async ({ page }) => {
    await loginAndFreezeNps(page);

    await page.getByRole('button', { name: '快速反馈' }).click();
    const textarea = page.getByPlaceholder('请分享您的想法、建议或遇到的问题...');
    await expect(textarea).toBeVisible({ timeout: 15_000 });

    const panelBox = await page.evaluate(() => {
      const el = [...document.querySelectorAll('div')].find((d) => {
        const cs = getComputedStyle(d);
        return (
          cs.position === 'fixed' &&
          Number(cs.zIndex) >= 60 &&
          d.getBoundingClientRect().height > 200
        );
      });
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        z: Number(getComputedStyle(el).zIndex),
        bottom: Math.round(window.innerHeight - r.bottom),
        inViewport: r.top >= 0 && r.bottom <= window.innerHeight,
      };
    });

    expect(panelBox, '应能找到反馈面板').not.toBeNull();
    // z 必须高于浮动按钮（z-50），否则 AI 助手按钮会压在面板上
    expect(panelBox!.z, '面板 z 应高于浮动按钮').toBeGreaterThan(50);
    // 底边贴合反馈槽位（84）
    expect(Math.abs(panelBox!.bottom - 84), '面板应锚定在反馈槽位上方').toBeLessThanOrEqual(1);
    expect(panelBox!.inViewport, '面板应完整落在视口内').toBe(true);

    // 无横向溢出
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  });

  test('提交反馈后出现成功提示（改版后功能未坏）', async ({ page }) => {
    await loginAndFreezeNps(page);

    await page.getByRole('button', { name: '快速反馈' }).click();
    await page
      .getByPlaceholder('请分享您的想法、建议或遇到的问题...')
      .fill('E2E 自检：浮动按钮改版后提交链路');
    await page.getByRole('button', { name: '提交' }).click();

    await expect(page.getByText('感谢您的反馈！')).toBeVisible({ timeout: 15_000 });
  });
});
