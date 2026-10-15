import puppeteer from 'puppeteer';

const CHROME = '/Users/xuezhiyong/.cache/puppeteer/chrome/mac_arm-149.0.7827.22/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const URL = 'http://127.0.0.1:8899/index.html';
const DL = '/tmp/v862_dl';

const results = [];
function ok(id, pass, detail) { results.push({ id, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} [${id}] ${detail}`); }

async function newPage(browser, viewport) {
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(60000);
  await page.setViewport(viewport);
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.__errs = errs;
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await new Promise(r => setTimeout(r, 600));
  return page;
}

const browser = await puppeteer.launch({
  headless: true,
  executablePath: CHROME,
  protocolTimeout: 180000,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});

/* ---------- a. 移动端长按菜单不再自杀 ---------- */
{
  const page = await newPage(browser, { width: 390, height: 844, isMobile: true, hasTouch: true });
  const r = await page.evaluate(async () => {
    const card = document.querySelector('.book-card');
    const rect = card.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    const el = document.elementFromPoint(x, y);
    const mk = (type, pts) => {
      const t = new Touch({ identifier: 1, target: el, clientX: pts[0], clientY: pts[1] });
      return new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true });
    };
    el.dispatchEvent(mk('touchstart', [x, y]));
    await new Promise(r => setTimeout(r, 1100));   // 超过 800ms 长按阈值
    const bd = document.getElementById('actionSheetBackdrop');
    const visibleAt1100 = !bd.classList.contains('hidden');
    // 抬手瞬间浏览器合成的 click 会在长按触发后立即到达 —— 必须被宽限期忽略
    bd.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const survivedSyntheticClick = !bd.classList.contains('hidden');
    await new Promise(r => setTimeout(r, 1200));   // 再等 1.2s，确认不会自杀
    const visibleAt2300 = !bd.classList.contains('hidden');
    const title = document.getElementById('actionSheetTitle').textContent;
    // 350ms 后遮罩恢复正常关闭功能
    bd.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const closedAfterGrace = bd.classList.contains('hidden');
    return { visibleAt1100, survivedSyntheticClick, visibleAt2300, title, closedAfterGrace };
  });
  ok('a. 移动端长按菜单不自杀', r.visibleAt1100 && r.survivedSyntheticClick && r.visibleAt2300 && r.closedAfterGrace,
     `1100ms可见=${r.visibleAt1100} 合成click后仍可见=${r.survivedSyntheticClick} 2300ms仍可见=${r.visibleAt2300} 标题="${r.title}" 宽限期后遮罩可关闭=${r.closedAfterGrace}`);
  console.log('   a 控制台错误:', JSON.stringify(page.__errs));
  await page.close();
}

/* ---------- b. 桌面端右键打开操作面板 ---------- */
{
  const page = await newPage(browser, { width: 1440, height: 900 });
  const r = await page.evaluate(() => {
    const out = {};
    const card = document.querySelector('.book-card');
    card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    const bd = document.getElementById('actionSheetBackdrop');
    out.contextmenu = !bd.classList.contains('hidden');
    out.title = document.getElementById('actionSheetTitle').textContent;
    bd.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    bd.classList.add('hidden');
    // hover 按钮
    const btn = document.querySelector('.book-card-menu');
    out.menuBtnExists = !!btn;
    btn.click();
    out.menuBtn = !bd.classList.contains('hidden');
    bd.classList.add('hidden');
    // 键盘 E
    card.focus();
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }));
    out.keyE = !bd.classList.contains('hidden');
    bd.classList.add('hidden');
    return out;
  });
  ok('b. 桌面端右键打开操作面板', r.contextmenu && r.menuBtn && r.keyE,
     `右键=${r.contextmenu}(标题"${r.title}") hover按钮=${r.menuBtn} 键盘E=${r.keyE}`);
  console.log('   b 控制台错误:', JSON.stringify(page.__errs));
  await page.close();
}

/* ---------- e. 书架网格后可见书籍数 ---------- */
{
  const page = await newPage(browser, { width: 1440, height: 900 });
  const r = await page.evaluate(() => {
    const sc = document.getElementById('shelfContainer');
    const cards = [...document.querySelectorAll('.book-card')];
    const sr = sc.getBoundingClientRect();
    const visible = cards.filter(c => { const b = c.getBoundingClientRect(); return b.top >= sr.top - 1 && b.bottom <= sr.bottom + 1 && b.width > 0; });
    const row = document.querySelector('.book-row');
    const rr = row.getBoundingClientRect();
    return {
      total: cards.length,
      visible: visible.length,
      cols: getComputedStyle(row).gridTemplateColumns.split(' ').length,
      rowOverflow: row.scrollWidth - row.clientWidth,
      rowDisplay: getComputedStyle(row).display,
      chipCount: document.querySelectorAll('#categoryChips .category-chip').length,
      chipsVisible: getComputedStyle(document.getElementById('categoryChips')).display !== 'none',
      noteCountText: document.getElementById('noteCount').textContent.trim(),
      shelfH: Math.round(sr.height),
    };
  });
  ok('e. 书架网格后书籍可见', r.visible > 10 && r.cols >= 3 && r.rowOverflow <= 1,
     `共${r.total}本 首屏可见${r.visible}本 网格${r.cols}列 display=${r.rowDisplay} 溢出=${r.rowOverflow}px | 分类chip=${r.chipCount}个(可见=${r.chipsVisible}) 篇数文案="${r.noteCountText}"`);
  console.log('   e 控制台错误:', JSON.stringify(page.__errs));
  await page.close();
}

/* ---------- d. 768→767 断点笔记不消失 ---------- */
{
  const page = await newPage(browser, { width: 1440, height: 900 });
  const before = await page.evaluate(() => {
    document.querySelector('.book-card').click();
    return new Promise(r => setTimeout(() => {
      const ifr = document.querySelector('#previewBody iframe');
      r({ hasIframe: !!ifr, title: document.getElementById('previewTitle').textContent });
    }, 1200));
  });
  await page.setViewport({ width: 767, height: 900 });
  // 注：本机 Chrome 149 在 setViewport 后不再自动派发 resize 事件（空白页同样为 0，属环境问题）。
  // 视口宽度是真实变化的（innerWidth=767），这里补一次显式派发来触发 APP 的 resize 处理器。
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  // 轮询等待 resize 防抖(200ms)+迁移完成，避免机器负载高时 flake
  await page.waitForFunction(() => {
    const mc = document.getElementById('mainContent');
    return mc.style.display === 'none' && !document.getElementById('previewOverlay').classList.contains('hidden');
  }, { timeout: 15000, polling: 200 }).catch(() => {});
  const after = await page.evaluate(() => {
    // 内置笔记 iframe 的 src 是相对路径（notes/xxx.html），用户笔记才是 blob:，所以不能只按 blob 过滤
    const ifrs = [...document.querySelectorAll('#previewBody iframe, #overlayBodyContent iframe')];
    const withContent = ifrs.filter(f => { try { return !!f.contentDocument && f.contentDocument.body.innerHTML.length > 50; } catch (e) { return false; } });
    return {
      isMobile: document.getElementById('mainContent').style.display,
      overlayHidden: document.getElementById('previewOverlay').classList.contains('hidden'),
      iframes: ifrs.length,
      withContent: withContent.length,
      srcs: ifrs.map(f => (f.getAttribute('src') || '').slice(0, 30)),
      sidebarHidden: document.getElementById('sidebar').classList.contains('hidden'),
      overlayTitle: document.getElementById('overlayTitle').textContent,
    };
  });
  ok('d. 768→767 断点笔记不消失', after.iframes > 0 && after.withContent > 0 && after.overlayHidden === false,
     `1440时iframe=${before.hasIframe} 标题"${before.title}" → 767时: mainContent.display="${after.isMobile}" 浮层hidden=${after.overlayHidden} iframe数=${after.iframes} 有内容=${after.withContent} src=${JSON.stringify(after.srcs)} 浮层标题="${after.overlayTitle}"`);
  console.log('   d 控制台错误:', JSON.stringify(page.__errs));
  await page.close();
}

/* ---------- c. 手机横屏后笔记不消失 ---------- */
{
  const page = await newPage(browser, { width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.evaluate(() => document.querySelector('.book-card').click());
  await new Promise(r => setTimeout(r, 1200));
  const before = await page.evaluate(() => ({
    overlayHidden: document.getElementById('previewOverlay').classList.contains('hidden'),
    iframes: document.querySelectorAll('#overlayBodyContent iframe').length,
  }));
  await page.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true, landscape: true });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));   // 见 test d 注释：本机 Chrome 不再自动派发 resize
  // 轮询等待 resize 防抖 + 迁移完成
  await page.waitForFunction(() => {
    const ifr = document.querySelector('#overlayBodyContent iframe');
    if (!ifr) return false;
    try { return !!ifr.contentDocument && ifr.contentDocument.body.innerHTML.length > 50; } catch (e) { return false; }
  }, { timeout: 15000, polling: 200 }).catch(() => {});
  const after = await page.evaluate(() => {
    const ifr = document.querySelector('#overlayBodyContent iframe');
    let hasContent = false;
    try { hasContent = !!ifr && !!ifr.contentDocument && ifr.contentDocument.body.innerHTML.length > 50; } catch (e) {}
    return {
      overlayHidden: document.getElementById('previewOverlay').classList.contains('hidden'),
      iframes: document.querySelectorAll('#overlayBodyContent iframe').length,
      hasContent,
      landscape: document.getElementById('previewOverlay').classList.contains('landscape'),
      w: window.innerWidth,
    };
  });
  ok('c. 手机横屏后笔记不消失', !after.overlayHidden && after.iframes > 0 && after.hasContent,
     `竖屏390: 浮层hidden=${before.overlayHidden} iframe=${before.iframes} → 横屏844(w=${after.w}): 浮层hidden=${after.overlayHidden} iframe=${after.iframes} iframe有内容=${after.hasContent} 横屏态=${after.landscape}`);
  console.log('   c 控制台错误:', JSON.stringify(page.__errs));
  await page.close();
}

/* ---------- f. 导出/导入 ---------- */
{
  const page = await newPage(browser, { width: 1440, height: 900 });
  const fs = await import('fs');
  fs.rmSync(DL, { recursive: true, force: true }); fs.mkdirSync(DL, { recursive: true });
  const client = await page.createCDPSession();
  await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, eventsEnabled: true });

  const existence = await page.evaluate(() => {
    document.querySelector('.tab-btn[data-tab="profile"]').click();
    return {
      exportBtn: !!document.getElementById('exportDataBtn'),
      importBtn: !!document.getElementById('importDataBtn'),
      exportText: document.getElementById('exportDataBtn') ? document.getElementById('exportDataBtn').textContent : null,
      importText: document.getElementById('importDataBtn') ? document.getElementById('importDataBtn').textContent : null,
      inProfile: document.getElementById('tabProfile').classList.contains('active'),
      inputAccept: document.getElementById('importFileInput').getAttribute('accept'),
    };
  });

  await page.evaluate(() => document.getElementById('exportDataBtn').click());
  // 轮询等待下载落盘（不用固定 sleep，避免机器负载高时 flake）
  let files = [];
  for (let i = 0; i < 40; i++) {
    files = fs.readdirSync(DL).filter(f => f.endsWith('.json'));
    if (files.length) break;
    await new Promise(r => setTimeout(r, 250));
  }
  if (files.length) await new Promise(r => setTimeout(r, 300));   // 等写完
  let payloadInfo = null;
  if (files.length) {
    const j = JSON.parse(fs.readFileSync(DL + '/' + files[0], 'utf8'));
    payloadInfo = { version: j.version, hasLs: !!j.localStorage, lsKeys: Object.keys(j.localStorage || {}), userNotes: Array.isArray(j.userNotes) ? j.userNotes.length : 'N/A', exportedAt: !!j.exportedAt };
  }
  ok('f. 导出/导入按钮存在且导出可下载 JSON', existence.exportBtn && existence.importBtn && files.length === 1 && payloadInfo && payloadInfo.hasLs,
     `按钮: 导出="${existence.exportText}" 导入="${existence.importText}" (在「我的」页=${existence.inProfile}, accept=${existence.inputAccept}) | 下载文件=${JSON.stringify(files)} payload=${JSON.stringify(payloadInfo)}`);
  console.log('   f 控制台错误:', JSON.stringify(page.__errs));
  await page.close();
}

/* ---------- g. 全流程控制台零报错 ---------- */
{
  const page = await newPage(browser, { width: 1440, height: 900 });
  await page.evaluate(async () => {
    document.querySelector('.book-card').click();
    await new Promise(r => setTimeout(r, 900));
    document.querySelector('#shelfContainer').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    document.getElementById('actionSheetBackdrop').classList.add('hidden');
    const chip = document.querySelectorAll('#categoryChips .category-chip')[1];
    if (chip) chip.click();
    document.querySelectorAll('#categoryChips .category-chip')[0].click();
    document.querySelector('.shelf-section-header').click();
    await new Promise(r => setTimeout(r, 500));
    document.getElementById('backCatBtn').click();
    document.querySelector('.tab-btn[data-tab="upload"]').click();
    document.querySelector('.tab-btn[data-tab="profile"]').click();
    document.querySelector('.tab-btn[data-tab="home"]').click();
    document.getElementById('searchBtn').click();
    await new Promise(r => setTimeout(r, 400));
    document.getElementById('backSearchBtn').click();
    document.getElementById('desktopLandscapeBtn').click();
    await new Promise(r => setTimeout(r, 400));
    document.getElementById('desktopLandscapeBtn').click();
  });
  await new Promise(r => setTimeout(r, 600));
  const errs = page.__errs;
  ok('g. 控制台零报错', errs.length === 0, `错误数=${errs.length} ${JSON.stringify(errs).slice(0, 500)}`);
  await page.close();
}

await browser.close();

const failed = results.filter(r => !r.pass);
console.log(`\n==== SUMMARY: ${results.length - failed.length}/${results.length} PASS ====`);
if (failed.length) { console.log('FAILED:', failed.map(f => f.id).join(' | ')); process.exit(1); }
