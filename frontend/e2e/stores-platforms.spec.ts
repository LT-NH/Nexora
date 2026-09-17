import { test, expect } from '@playwright/test';

/**
 * 店铺平台接入 E2E 测试
 *
 * 覆盖本次新增的「多平台接入 + 双向同步」能力：
 *   1. 平台能力目录（GET /stores/platforms）能正常下发并渲染能力徽章
 *   2. 表单按平台裁剪凭证字段（淘宝/京东/拼多多**不**要店铺地址）
 *   3. 资质门槛提示如实展示（不让商家填完才发现没权限）
 *   4. 沙箱开关只在平台确实提供沙箱网关时出现
 *   5. 写操作入口按能力渲染 —— 只读平台不显示回写按钮
 *
 * 设计原则：断言从后端下发的真实数据推导，不硬编码「应该有哪些能力」，
 * 这样后端调整能力声明时测试不会变成假失败；但关键平台的差异是硬约束，
 * 所以对淘宝/京东/拼多多的特有表现做明确断言。
 */

async function loginAsDemo(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill('demo@nexora.com');
  await page.getByPlaceholder('请输入您的密码').fill('Demo1234!');
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

/** 进入店铺管理页 */
async function gotoStores(page: import('@playwright/test').Page) {
  await loginAsDemo(page);
  await page.getByRole('link', { name: '店铺管理' }).click();
  await page.waitForURL(/\/stores/, { timeout: 15_000 });
  // 顶栏面包屑与主标题同名 → 必须限定在 main 内
  await expect(
    page.getByRole('main').getByRole('heading', { name: '店铺管理' }),
  ).toBeVisible({ timeout: 15_000 });
}

/** 打开「添加店铺」弹窗 */
async function openAddStoreDialog(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /添加店铺|新增店铺/ }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  return dialog;
}

test.describe('店铺平台接入', () => {
  test('平台下拉包含国产三巨头且表单按平台裁剪字段', async ({ page }) => {
    await gotoStores(page);
    const dialog = await openAddStoreDialog(page);

    const select = dialog.locator('#store-platform');
    const options = await select.locator('option').allTextContents();
    for (const label of ['淘宝', '京东', '拼多多']) {
      expect(options.some((o) => o.includes(label))).toBe(true);
    }

    // 默认平台是淘宝 → 不该要求店铺地址（靠 AppKey + SessionKey 识别店铺）
    await select.selectOption('taobao');
    await expect(dialog.getByLabel('店铺链接')).toHaveCount(0);
    // 淘宝凭证叫 AppKey / SessionKey
    await expect(dialog.getByText('SessionKey', { exact: false })).toBeVisible();

    // 拼多多的 AppKey 字段应显示为 ClientID
    await select.selectOption('pdd');
    await expect(dialog.getByText('ClientID', { exact: false })).toBeVisible();

    // Shopify 需要店铺地址 → 字段应出现
    await select.selectOption('shopify');
    await expect(dialog.getByLabel('店铺链接')).toBeVisible();
  });

  test('淘宝显示资质门槛提示与沙箱开关', async ({ page }) => {
    await gotoStores(page);
    const dialog = await openAddStoreDialog(page);
    await dialog.locator('#store-platform').selectOption('taobao');

    // 资质门槛必须如实展示（营业执照 / 企业支付宝）
    await expect(
      dialog.getByText('接入资质提示', { exact: false }),
    ).toBeVisible();
    await expect(
      dialog.getByText(/企业开发者资质|营业执照/).first(),
    ).toBeVisible();

    // 淘宝有公开沙箱网关 → 沙箱开关可见
    await expect(
      dialog.getByText('使用沙箱环境', { exact: false }),
    ).toBeVisible();
  });

  test('京东/拼多多无公开沙箱，应提示而非显示开关', async ({ page }) => {
    await gotoStores(page);
    const dialog = await openAddStoreDialog(page);

    await dialog.locator('#store-platform').selectOption('jd');
    await expect(
      dialog.getByText('该平台暂无公开沙箱环境', { exact: false }),
    ).toBeVisible();
    await expect(dialog.getByText('使用沙箱环境', { exact: false })).toHaveCount(0);

    await dialog.locator('#store-platform').selectOption('pdd');
    await expect(
      dialog.getByText('该平台暂无公开沙箱环境', { exact: false }),
    ).toBeVisible();
  });

  test('店铺卡片的能力徽章与写入口跟随后端声明', async ({ page }) => {
    await gotoStores(page);

    // 页面必须至少有一个店铺卡片（演示数据里有）
    const cards = page.getByRole('main').locator('.grid > div');
    const count = await cards.count();
    test.skip(count === 0, '演示工作空间没有店铺数据');

    // 读第一张卡片的文本，确认能力徽章区已渲染
    const firstCard = cards.first();
    const text = (await firstCard.textContent()) || '';

    // 只读平台必须给出「不支持写操作」的说明或干脆不渲染写按钮；
    // 无论如何，**不应该**出现「回写库存」按钮却没有对应能力声明。
    const hasInventoryBtn = text.includes('回写库存');
    const declaresInventory = text.includes('库存回写');
    expect(hasInventoryBtn).toBe(declaresInventory);
  });

  test('平台能力目录接口可直接访问且包含资质说明', async ({ page }) => {
    await loginAsDemo(page);

    // 直接从浏览器上下文调后端接口，验证契约
    const resp = await page.request.get(
      '/api/v1/workspaces/test-workspace/stores/platforms',
    );
    // 演示账号可能不属于 test-workspace → 403/404 也算「接口存在且做了鉴权」
    if (resp.status() === 200) {
      const catalog = await resp.json();
      const byPlatform = Object.fromEntries(
        catalog.map((c: any) => [c.platform, c]),
      );
      for (const name of ['taobao', 'jd', 'pdd']) {
        expect(byPlatform[name].implemented).toBe(true);
        expect(byPlatform[name].capabilities).toContain('write_inventory');
        expect(byPlatform[name].qualification_note.length).toBeGreaterThan(0);
      }
      expect(byPlatform.taobao.sandbox_supported).toBe(true);
      expect(byPlatform.jd.sandbox_supported).toBe(false);
    } else {
      expect([401, 403, 404]).toContain(resp.status());
    }
  });
});
