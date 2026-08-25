/**
 * v8.4.1 修复验证（真实浏览器 / Puppeteer）
 * 覆盖：桌面进入/退出专注模式、resize 边角、版本号、移动端横屏回归
 * 运行: node test/_pw_check_v841.cjs
 */
const puppeteer = require('puppeteer');

const FILE = '/Users/xuezhiyong/WorkBuddy/2026-07-14-22-17-09/html-preview-app/index.html';
const CHROME = '/Users/xuezhiyong/.cache/puppeteer/chrome/mac_arm-149.0.7827.22/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const URL = 'file://' + FILE;

const results = [];
function rec(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: detail || '' });
  console.log((pass ? 'PASS ' : 'FAIL ') + '| ' + name + (detail ? '  ::  ' + detail : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  /* ============ 断言 1 & 2：桌面进入 / 退出专注模式 ============ */
  {
    const page = await browser.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(URL, { waitUntil: 'networkidle0' });
    await sleep(400);

    // 进入
    await page.click('#desktopLandscapeBtn');
    await sleep(300);
    const enter = await page.evaluate(() => {
      const app = document.querySelector('#app');
      const sb = document.querySelector('#sidebar');
      const btn = document.querySelector('#desktopLandscapeBtn');
      return {
        hasFocus: app.classList.contains('focus-mode'),
        sbDisplay: getComputedStyle(sb).display,
        inlineDisplay: sb.style.display,
        btnText: (btn.textContent || '').trim(),
      };
    });
    rec('A1 桌面进入专注: #app 含 focus-mode', enter.hasFocus === true, 'focus-mode=' + enter.hasFocus);
    rec('A1 桌面进入专注: #sidebar display === "none" (内联强制隐藏)', enter.sbDisplay === 'none', 'computed=' + enter.sbDisplay + ' inline=' + enter.inlineDisplay);
    rec('A1 桌面进入专注: #desktopLandscapeBtn 文本为 ↩️', enter.btnText === '↩️', 'text=' + enter.btnText);

    // 退出
    await page.click('#desktopLandscapeBtn');
    await sleep(300);
    const exit = await page.evaluate(() => {
      const app = document.querySelector('#app');
      const sb = document.querySelector('#sidebar');
      const btn = document.querySelector('#desktopLandscapeBtn');
      return {
        hasFocus: app.classList.contains('focus-mode'),
        sbDisplay: getComputedStyle(sb).display,
        inlineDisplay: sb.style.display,
        btnText: (btn.textContent || '').trim(),
      };
    });
    rec('A2 桌面退出专注: #app 不含 focus-mode', exit.hasFocus === false, 'focus-mode=' + exit.hasFocus);
    rec('A2 桌面退出专注: #sidebar display 恢复 (非 none, 应为 flex)', exit.sbDisplay !== 'none', 'computed=' + exit.sbDisplay + ' inline=' + JSON.stringify(exit.inlineDisplay));
    rec('A2 桌面退出专注: #desktopLandscapeBtn 文本为 🔄', exit.btnText === '🔄', 'text=' + exit.btnText);

    if (errors.length) console.log('  [console errors] ' + JSON.stringify(errors));
    await page.close();
  }

  /* ============ 断言 3：resize 边角（桌面→移动→桌面）============ */
  {
    const page = await browser.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(URL, { waitUntil: 'networkidle0' });
    await sleep(400);

    // 桌面进入专注（sidebar 内联 none）
    await page.click('#desktopLandscapeBtn');
    await sleep(300);

    // 改为移动 (500) -> 再改回桌面 (1280)
    await page.setViewport({ width: 500, height: 800 });
    await sleep(450);
    await page.setViewport({ width: 1280, height: 800 });
    await sleep(550);

    const st = await page.evaluate(() => {
      const app = document.querySelector('#app');
      const sb = document.querySelector('#sidebar');
      return {
        hasFocus: app.classList.contains('focus-mode'),
        sbDisplay: getComputedStyle(sb).display,
        inlineDisplay: sb.style.display,
      };
    });
    rec('A3 resize边角: #app 不含 focus-mode', st.hasFocus === false, 'focus-mode=' + st.hasFocus);
    rec('A3 resize边角: #sidebar display 恢复 flex (内联 none 未卡死)', st.sbDisplay !== 'none', 'computed=' + st.sbDisplay + ' inline=' + JSON.stringify(st.inlineDisplay));
    if (errors.length) console.log('  [console errors] ' + JSON.stringify(errors));
    await page.close();
  }

  /* ============ 断言 4：版本号 v8.4.1 & 无旧版 v8.4 残留 ============ */
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(URL, { waitUntil: 'networkidle0' });
    await sleep(300);
    const ver = await page.evaluate(() => {
      const title = document.title;
      const span = document.querySelector('#sidebar .sidebar-header h1 span');
      const about = document.querySelector('.about-version');
      const html = document.documentElement.outerHTML;
      const allMatches = html.match(/v8\.4[^<\s]*/g) || [];
      const residue = html.match(/v8\.4(?!(\.1))/g) || []; // 旧版 v8.4 残留（非 v8.4.1）
      return {
        title,
        spanText: span ? span.textContent : null,
        aboutText: about ? about.textContent : null,
        allMatches,
        residue,
      };
    });
    rec('A4 版本: <title> 含 v8.4.1', (ver.title || '').includes('v8.4.1'), 'title=' + ver.title);
    rec('A4 版本: #sidebar .sidebar-header h1 span 含 v8.4.1', (ver.spanText || '').includes('v8.4.1'), 'span=' + ver.spanText);
    rec('A4 版本: .about-version 含 v8.4.1', (ver.aboutText || '').includes('v8.4.1'), 'about=' + ver.aboutText);
    rec('A4 版本: 全文无旧版 v8.4 残留', ver.residue.length === 0, 'residue=' + JSON.stringify(ver.residue) + ' 全部v8.4出现=' + JSON.stringify(ver.allMatches));
    await page.close();
  }

  /* ============ 断言 5：移动端横屏回归 ============ */
  {
    const page = await browser.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
    await page.setViewport({ width: 500, height: 800 });
    await page.goto(URL, { waitUntil: 'networkidle0' });
    await sleep(400);

    const before = await page.evaluate(() => {
      const bn = document.querySelector('#bottomNav');
      return { bottomNavDisplay: getComputedStyle(bn).display }; // 移动端应为 flex
    });

    // 程序化 click 移动端横屏按钮（绕过 overlay 隐藏时的可见性限制，仍触发真实 click 事件）
    await page.evaluate(() => { document.querySelector('#overlayLandscapeBtn').click(); });
    await sleep(300);

    const after = await page.evaluate(() => {
      const ov = document.querySelector('#previewOverlay');
      return { hasLandscape: ov.classList.contains('landscape') };
    });
    rec('A5 移动端布局: #bottomNav 显示 flex (移动布局生效)', before.bottomNavDisplay === 'flex', 'display=' + before.bottomNavDisplay);
    rec('A5 移动端横屏: #previewOverlay 获得 landscape 类 (逻辑未破坏)', after.hasLandscape === true, 'hasLandscape=' + after.hasLandscape);
    if (errors.length) console.log('  [console errors] ' + JSON.stringify(errors));
    await page.close();
  }

  await browser.close();

  /* ============ 汇总 ============ */
  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  console.log('\n==================== 测试汇总 ====================');
  console.log('总计=' + results.length + '  通过=' + passed + '  失败=' + failed);
  console.log('路由判定=' + (failed === 0 ? 'NoOne' : 'Engineer'));
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
