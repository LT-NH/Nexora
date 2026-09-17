import { test, expect, type Page } from '@playwright/test';

/**
 * 经营健康引擎 · 六维雷达图两侧评分卡布局守卫
 *
 * 背景（2026-09-17）：六维评分明细原先堆在雷达图下方，雷达图左右大片留白。
 * 现按**顶点真实几何位置**拆到两侧 —— ECharts 雷达的角度是
 * `angle(i) = startAngle(90°) + i·360/n` 逆时针（源码 coord/radar/Radar.js），
 * n=6 时顶点为：正上 / 左上 / 左下 / 正下 / 右下 / 右上。
 * ⇒ 左列 = 左上/左下/正下，右列 = 正上/右上/右下。
 *
 * 守卫点：
 *  1. xl 三栏并列：左右各 3 张卡、互不重叠、无横向溢出
 *  2. 卡片顺序与顶点几何一致（右列首卡=正上维度、左列首卡=左上维度）
 *  3. 窄屏退化为「雷达图全宽在上、卡片两列在下」
 *
 * 注意：useEChart 用 renderer:'svg'，雷达图是 <svg>，**没有 canvas**；
 *      健康接口 ai=1 真实调用千问，首次体检可能 30-60s（有快照缓存时很快）。
 */

// 维度原始顺序（后端契约）：cashflow 上 / inventory 左上 / customer 左下 /
// channel 下 / growth 右下 / profit 右上
const EXPECT_RIGHT = ['现金流', '利润', '增长']; // 正上 / 右上 / 右下
const EXPECT_LEFT = ['库存', '客户', '渠道']; // 左上 / 左下 / 正下

async function openHealthCard(page: Page) {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill('demo@nexora.com');
  await page.getByPlaceholder('请输入您的密码').fill('Demo1234!');
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

  const card = page.locator('#health-engine-card');
  await expect(card).toBeVisible({ timeout: 35_000 });
  // 健康接口 ai=1 真实调千问，慢；有持久化快照缓存时很快
  await page
    .locator('#health-engine-card svg')
    .first()
    .waitFor({ timeout: 120_000 });
  await page.waitForTimeout(1200); // 等 ECharts 完成布局与动画
  return card;
}

/** 抓取雷达图容器与 6 张维度卡的几何信息 */
async function readGeometry(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('#health-engine-card');
    if (!root) return null;
    // HealthRadarChart 渲染 <div style="width:100%;height:420px">，
    // 卡片里还有 lucide 图标 <svg>，不能用 querySelector('svg') 定位
    const chartDiv = Array.from(root.querySelectorAll('div')).find(
      (d) => (d as HTMLElement).style?.height === '420px',
    ) as HTMLElement | undefined;
    const radar = chartDiv?.getBoundingClientRect() ?? null;

    const cards = Array.from(root.querySelectorAll('button'))
      .filter((b) => (b.textContent || '').includes('/100'))
      .map((b) => {
        const r = b.getBoundingClientRect();
        const name = (b.querySelector('span.truncate')?.textContent || '').trim();
        return { name, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) };
      });

    return {
      radar: radar
        ? { x: Math.round(radar.x), right: Math.round(radar.right), w: Math.round(radar.width) }
        : null,
      cards,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
}

test.describe('六维雷达图两侧评分卡', () => {
  test('xl 三栏并列：左右各 3 张，与顶点几何对齐', async ({ page }) => {
    test.setTimeout(180_000); // ai=1 首次体检可能较慢
    await page.setViewportSize({ width: 1280, height: 900 });
    await openHealthCard(page);
    const geo = await readGeometry(page);
    expect(geo, '健康卡未渲染').not.toBeNull();
    const g = geo!;

    expect(g.radar, '未找到雷达图容器').not.toBeNull();
    expect(g.cards.length, '应有 6 张维度评分卡').toBe(6);
    expect(g.overflowX, '不应出现横向溢出').toBe(false);

    const rb = g.radar!;
    const left = g.cards.filter((c) => c.x + c.w <= rb.x + 2);
    const right = g.cards.filter((c) => c.x >= rb.right - 2);

    expect(left.length, `雷达图左侧应有 3 张卡（实际 ${left.length}）`).toBe(3);
    expect(right.length, `雷达图右侧应有 3 张卡（实际 ${right.length}）`).toBe(3);

    // 同列自上而下
    for (const col of [left, right]) {
      for (let i = 1; i < col.length; i++) {
        expect(col[i].y, '同列卡片应自上而下排列').toBeGreaterThan(col[i - 1].y);
      }
    }

    // 顶点几何对齐（右列首卡 = 正上维度，左列首卡 = 左上维度）
    expect(right.map((c) => c.name)).toEqual(EXPECT_RIGHT);
    expect(left.map((c) => c.name)).toEqual(EXPECT_LEFT);

    // 左右卡片不得与雷达图容器重叠
    for (const c of [...left, ...right]) {
      const overlapRight = c.x < rb.right && c.x + c.w > rb.x;
      expect(overlapRight, `卡片「${c.name}」与雷达图容器重叠`).toBe(false);
    }
  });

  test('窄屏（900px）退化为堆叠：雷达图全宽在上，卡片两列在下', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 900, height: 900 });
    await openHealthCard(page);
    const geo = await readGeometry(page);
    expect(geo).not.toBeNull();
    const g = geo!;

    expect(g.cards.length).toBe(6);
    expect(g.overflowX, '不应出现横向溢出').toBe(false);

    // 雷达图容器应占满卡片内宽（不再居中成 440px 窄柱）
    expect(g.radar!.w, '窄屏下雷达图应为全宽').toBeGreaterThan(600);

    // 6 张卡全部位于雷达图下方
    for (const c of g.cards) {
      expect(c.y, `卡片「${c.name}」应在雷达图下方`).toBeGreaterThan(0);
    }
  });
});
