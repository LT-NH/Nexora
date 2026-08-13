const { chromium } = require('C:/Users/lihaoqi/Desktop/nexora-preview/nexora-optimized/frontend/node_modules/playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  const apiCalls = [];
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 130)));
  page.on('response', r => { if (r.url().includes('/api/')) apiCalls.push(r.status() + ' ' + r.url().split('/api/v1/')[1]?.slice(0, 50)); });
  await page.goto('http://127.0.0.1:3000/login');
  await page.waitForTimeout(1000);
  await page.waitForTimeout(1500);
  const html = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input')].map(i => ({ t: i.type, ph: i.placeholder, name: i.name }));
    const btns = [...document.querySelectorAll('button')].map(b => b.innerText?.trim().slice(0, 20));
    return { inputs, btns };
  });
  console.log('表单输入框:', JSON.stringify(html.inputs));
  console.log('按钮:', JSON.stringify(html.btns));
  await page.fill('input[type="email"]', 'demo@nexora.com').catch(()=>{});
  await page.fill('input[placeholder*="密码"], input[type="password"]', 'Demo1234!').catch(()=>{});
  await page.click('button[type="submit"]').catch(()=>{});
  await page.waitForURL(/dashboard|workbench/, { timeout: 15000 }).catch(()=>{});
  await page.waitForTimeout(3000);
  const r = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      url: location.pathname,
      hasHealth: t.includes('经营健康') || t.includes('health'),
      hasRevenue: /¥\d[\d,]*/.test(t),
      len: t.length,
    };
  });
  console.log('登录后页面:', r.url, '| 文本:', r.len);
  console.log('健康引擎数据:', r.hasHealth ? 'YES' : 'NO', '| 有金额数据:', r.hasRevenue ? 'YES' : 'NO');
  console.log('API 调用数:', apiCalls.length, '| 4xx/5xx:', apiCalls.filter(u => /^[45]\d\d/.test(u)).slice(0, 5));
  console.log('JS错误:', errs.length ? errs.slice(0, 3) : '无');
  await browser.close();
})().catch(e => { console.error('FATAL', e.message.slice(0,200)); process.exit(1); });
