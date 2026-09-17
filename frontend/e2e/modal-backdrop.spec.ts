import { test, expect, type Page } from '@playwright/test';

/**
 * 浮层定位回归守卫：**遮罩必须相对视口铺满，面板必须完整落在视口内**。
 *
 * 背景（2026-09-17 实测踩坑）：
 *   CSS 规范规定，祖先只要有非 none 的 `transform`，其 `position: fixed`
 *   后代会改为**相对该祖先**定位而不是视口。
 *   `AppLayout` 的内容层当时写着 Tailwind 的裸 `transform` 工具类，
 *   它输出 `translate(0,0) rotate(0) … scale(1)`，计算值是 matrix(1,0,0,1,0,0)
 *   —— **不是 none**，于是成了所有弹窗遮罩的包含块。
 *   实测（1280×720）：「添加店铺」的遮罩落在 x=240 / y=24 / 1040×509
 *   （正确值应是整个视口），面板被顶到 y=-8，标题直接被裁掉。
 *
 * 这个 spec 断言的是**行为不变量**而不是某个类名，所以无论日后是谁、
 * 在哪个祖先上加了 transform/scale/translate/filter，它都会立刻抓住。
 */

/** 读取元素与视口的几何关系（用 getBoundingClientRect，与实测口径一致） */
async function geometry(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: r.x,
      y: r.y,
      w: r.width,
      h: r.height,
      right: r.right,
      bottom: r.bottom,
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
  }, selector);
}

/** 断言：该元素精确覆盖整个视口 */
async function expectCoversViewport(page: Page, selector: string, label: string) {
  const g = await geometry(page, selector);
  expect(g, `${label}：找不到元素 ${selector}`).not.toBeNull();
  const g2 = g!;
  // 允许 1px 内的亚像素误差，其余必须严丝合缝
  expect(Math.abs(g2.x), `${label}：遮罩左边应贴视口左缘（实际 x=${g2.x}）`).toBeLessThanOrEqual(1);
  expect(Math.abs(g2.y), `${label}：遮罩顶边应贴视口顶缘（实际 y=${g2.y}）`).toBeLessThanOrEqual(1);
  expect(
    Math.abs(g2.w - g2.vw),
    `${label}：遮罩宽度应等于视口宽（实际 ${g2.w} / 视口 ${g2.vw}）`,
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(g2.h - g2.vh),
    `${label}：遮罩高度应等于视口高（实际 ${g2.h} / 视口 ${g2.vh}）`,
  ).toBeLessThanOrEqual(1);
}

/** 断言：该元素完整落在视口内（不被裁切） */
async function expectFullyInsideViewport(page: Page, selector: string, label: string) {
  const g = await geometry(page, selector);
  expect(g, `${label}：找不到元素 ${selector}`).not.toBeNull();
  const g2 = g!;
  expect(g2.y, `${label}：面板顶部不应超出视口上缘（实际 y=${g2.y}）`).toBeGreaterThanOrEqual(-1);
  expect(
    g2.bottom,
    `${label}：面板底部不应超出视口下缘（实际 bottom=${g2.bottom} / 视口高 ${g2.vh}）`,
  ).toBeLessThanOrEqual(g2.vh + 1);
  expect(g2.x, `${label}：面板左侧不应超出视口`).toBeGreaterThanOrEqual(-1);
  expect(g2.right, `${label}：面板右侧不应超出视口`).toBeLessThanOrEqual(g2.vw + 1);
}

async function loginAsDemo(page: Page) {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill('demo@nexora.com');
  await page.getByPlaceholder('请输入您的密码').fill('Demo1234!');
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

/** 打开「添加店铺」弹窗 */
async function openAddStoreModal(page: Page) {
  await loginAsDemo(page);
  // 直接跳转而**不是**点侧栏链接：窄屏下侧栏是抽屉，链接在视口外点不到。
  // 这里要测的是浮层几何，不应被导航方式干扰。
  await page.goto('/stores');
  await expect(
    page.getByRole('main').getByRole('heading', { name: '店铺管理' }),
  ).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /添加店铺|新增店铺/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
}

test.describe('浮层几何：遮罩必须铺满视口', () => {
  test('内容层不得带 transform（否则会成为 fixed 的包含块）', async ({ page }) => {
    await loginAsDemo(page);

    const offenders = await page.evaluate(() => {
      const out: { tag: string; classes: string; transform: string }[] = [];
      document.querySelectorAll('div, main, section').forEach((el) => {
        const cs = getComputedStyle(el);
        if (cs.transform && cs.transform !== 'none') {
          out.push({
            tag: el.tagName,
            classes: el.className.toString().slice(0, 120),
            transform: cs.transform,
          });
        }
      });
      return out;
    });

    // 允许动画中的元素临时带 transform，但**布局容器**不允许。
    // 这里只针对内容层那条已知的包裹容器做判定：它必须不是 fixed 的包含块。
    const isContainingBlockForFixed = await page.evaluate(() => {
      const main = document.querySelector('main');
      if (!main) return false;
      let node = main.parentElement;
      while (node && node !== document.documentElement) {
        const cs = getComputedStyle(node);
        if (cs.transform && cs.transform !== 'none') return true;
        if (cs.filter && cs.filter !== 'none') return true;
        if (cs.perspective && cs.perspective !== 'none') return true;
        if (cs.contain && /paint|layout|strict|content/.test(cs.contain)) return true;
        node = node.parentElement;
      }
      return false;
    });

    expect(
      isContainingBlockForFixed,
      `主内容区的祖先中存在会创建 fixed 包含块的样式（transform/filter/perspective/contain），` +
        `会导致所有弹窗遮罩相对它定位而不是视口。当前带 transform 的元素：` +
        JSON.stringify(offenders),
    ).toBe(false);
  });

  test('添加店铺弹窗：遮罩铺满视口且面板不被裁切（1280×720）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openAddStoreModal(page);

    // 遮罩就是角色为 dialog 的面板的父节点
    const dialog = page.getByRole('dialog');
    await expectCoversViewport(page, 'body > div.fixed.inset-0', '添加店铺遮罩');
    await expectFullyInsideViewport(page, '[role="dialog"]', '添加店铺面板');
    await expect(dialog.getByRole('heading', { name: /添加店铺|编辑店铺/ })).toBeVisible();
  });

  test('添加店铺弹窗在窄屏下同样铺满视口（390×844）', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAddStoreModal(page);
    await expectCoversViewport(page, 'body > div.fixed.inset-0', '窄屏遮罩');
    await expectFullyInsideViewport(page, '[role="dialog"]', '窄屏面板');
  });

  test('管理台自绘遮罩也铺满视口（额度校准弹窗）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await loginAsDemo(page);
    await page.goto('/admin/ai-models');
    await expect(page.getByRole('button', { name: '校准额度' }).first()).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('button', { name: '校准额度' }).first().click();
    await expect(page.getByText('校准免费额度')).toBeVisible({ timeout: 15_000 });

    // 管理台是独立全屏壳，这里的遮罩是页面自绘的 fixed inset-0
    await expectCoversViewport(page, 'div.fixed.inset-0.bg-black\\/40', '校准弹窗遮罩');

    await page.getByRole('button', { name: '取消' }).click();
  });

  test('弹窗打开后页面主体不滚动（滚动锁仍生效）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openAddStoreModal(page);
    const overflow = await page.evaluate(() => document.body.style.overflow);
    expect(overflow).toBe('hidden');
  });
});
