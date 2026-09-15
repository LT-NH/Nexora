import { test, expect } from '@playwright/test';

/**
 * Landing 顶栏对称性 E2E
 *
 * 背景：顶栏原先用 `flex justify-between`，中间只有 2 个链接，
 * 视觉重心偏左、左右配重失衡。改为 `grid-cols-[1fr_auto_1fr]`
 * 三段等权布局后，主导航由 grid 的两侧等宽轨道夹持，实现数学居中。
 *
 * 本测试锁死三件事，防止后续改动把居中破坏掉：
 *   1. 主导航中心与视口中心偏差 ≤ 1px（真居中，不是目测居中）
 *   2. 左右两段宽度差 ≤ 40px（配重对称，容差给头像/邮箱这类不定宽内容）
 *   3. 三段互不重叠 + 无横向溢出
 * 并在窄屏断点验证主导航收起、汉堡菜单可展开且含全部导航项。
 */

/** 主导航断点：>=1024 应可见 */
const WIDE = [
  { w: 1920, h: 1080 },
  { w: 1600, h: 900 },
  { w: 1440, h: 900 },
  { w: 1280, h: 800 },
  { w: 1024, h: 768 },
];

/** 窄屏断点：<1024 主导航隐藏 */
const NARROW = [
  { w: 820, h: 1180 },
  { w: 390, h: 844 },
];

async function measure(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const header = document.querySelector('header');
    const nav = header?.querySelector('nav[aria-label="主导航"]') as HTMLElement | null;
    if (!header) return null;

    // 三段 grid：header 内 .grid-cols-[1fr_auto_1fr]
    const grid = header.querySelector('div[class*="grid-cols-"]') as HTMLElement | null;
    if (!grid) return null;
    const kids = Array.from(grid.children) as HTMLElement[];

    const rect = (el: HTMLElement | null) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return {
        l: Math.round(b.left),
        r: Math.round(b.right),
        w: Math.round(b.width),
        c: Math.round(b.left + b.width / 2),
      };
    };

    return {
      vw: window.innerWidth,
      nav: rect(nav),
      // 左段 = grid 首个子元素；右段 = 末个子元素
      left: rect(kids[0] ?? null),
      right: rect(kids[kids.length - 1] ?? null),
      kidCount: kids.length,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
}

test.describe('Landing 顶栏三段对称', () => {
  for (const { w, h } of WIDE) {
    test(`${w}px 下主导航数学居中且左右配重对称`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/');

      const nav = page.locator('nav[aria-label="主导航"]');
      await expect(nav).toBeVisible({ timeout: 15_000 });

      const m = await measure(page);
      expect(m, '应能测到顶栏结构').not.toBeNull();
      if (!m || !m.nav || !m.left || !m.right) throw new Error('顶栏三段未全部渲染');

      // 1. 数学居中
      const offset = Math.abs(m.nav.c - m.vw / 2);
      expect(offset, `主导航中心偏离视口中线 ${offset}px（实测 nav.c=${m.nav.c}, vw/2=${m.vw / 2}）`).toBeLessThanOrEqual(1);

      // 2. 左右配重对称（容差 40px：右侧含头像/邮箱等不定宽内容）
      const diff = Math.abs(m.left.w - m.right.w);
      expect(diff, `左右两段宽度差 ${diff}px（左 ${m.left.w} / 右 ${m.right.w}）`).toBeLessThanOrEqual(40);

      // 3. 三段不重叠
      expect(m.left.r, '左段与中段重叠').toBeLessThanOrEqual(m.nav.l);
      expect(m.nav.r, '中段与右段重叠').toBeLessThanOrEqual(m.right.l);

      // 4. 无横向溢出
      expect(m.overflow, '顶栏导致横向溢出').toBe(false);

      // 5. 四个导航项齐全（对称性的前提：两端各 2 项，视觉均衡）
      for (const label of ['功能特性', '工作原理', '定价方案', '常见问题']) {
        await expect(nav.getByRole('link', { name: label })).toBeVisible();
      }
    });
  }

  for (const { w, h } of NARROW) {
    test(`${w}px 下主导航收起且汉堡菜单可展开完整`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/');

      // 主导航在窄屏不可见（避免把右段挤压变形）
      await expect(page.locator('nav[aria-label="主导航"]')).toBeHidden();

      // 汉堡按钮可展开，且展开后含全部导航项
      const burger = page.getByRole('button', { name: /打开菜单|菜单/ }).first();
      await expect(burger).toBeVisible({ timeout: 15_000 });
      await burger.click();

      for (const label of ['功能特性', '工作原理', '定价方案', '常见问题']) {
        await expect(page.getByRole('link', { name: label }).first()).toBeVisible();
      }

      const m = await measure(page);
      expect(m?.overflow, '窄屏展开菜单后不应横向溢出').toBe(false);
    });
  }
});
