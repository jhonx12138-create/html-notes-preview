import puppeteer from 'puppeteer';
import fs from 'fs';

const CHROME = '/Users/xuezhiyong/.cache/puppeteer/chrome/mac_arm-149.0.7827.22/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const URL = 'http://127.0.0.1:8899/index.html';
const results = [];
function ok(id, pass, detail) { results.push({ id, pass }); console.log(`${pass ? 'PASS' : 'FAIL'} [${id}] ${detail}`); }

/* 每个用例独立浏览器实例，避免 localStorage 互相污染（QA 踩过这个坑） */
async function fresh(vp = { width: 1440, height: 900 }, touch = false) {
  const b = await puppeteer.launch({ headless: true, executablePath: CHROME, protocolTimeout: 180000, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'] });
  const p = await b.newPage();
  p.setDefaultTimeout(60000); p.setDefaultNavigationTimeout(60000);
  await p.setViewport(vp);
  if (touch) { const c = await p.createCDPSession(); await c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); }
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  p.__errs = errs;
  await p.goto(URL, { waitUntil: 'networkidle0' });
  await p.waitForSelector('.book-card');
  await new Promise(r => setTimeout(r, 600));
  return { b, p };
}

/* ---------- A9-2 / P0：notes-edits 损坏不得清空内置笔记 ---------- */
for (const [label, poison] of [['null', 'null'], ['非法JSON', 'not-json{{'], ['数组', '[1,2]'], ['缺字段', '"{}"'.slice(1, -1)]]) {
  const { b, p } = await fresh();
  await p.evaluate((v) => localStorage.setItem('notes-edits', v), poison);
  await p.reload({ waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1200));
  const r = await p.evaluate(() => ({
    cards: document.querySelectorAll('.book-card').length,
    // 只看 shelfContainer 内是否渲染了空态（不能查 body.innerHTML —— 那个字符串也存在于 <script> 源码里）
    shelfEmpty: !!document.querySelector('#shelfContainer .empty-state'),
    shelfHTML: document.getElementById('shelfContainer').innerHTML.slice(0, 80),
    count: document.getElementById('noteCount').textContent.trim(),
    banner: !!document.querySelector('.error-banner'),
  }));
  ok(`P0 notes-edits=${label}`, r.cards === 43 && !r.shelfEmpty && !r.banner, `注入 ${JSON.stringify(poison)} → 书卡=${r.cards} 空态=${r.shelfEmpty} 错误横幅=${r.banner} 篇数="${r.count}"`);
  await b.close();
}

/* ---------- P0 补充：损坏值不应阻止编辑/删除内置笔记 ---------- */
{
  const { b, p } = await fresh();
  const r = await p.evaluate(async () => {
    localStorage.setItem('notes-edits', 'null');
    const before = document.querySelectorAll('.book-card').length;
    // 触发一次内置笔记改名（走 loadEdits 分支）
    document.querySelector('.book-card').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    document.querySelector('[data-as-action="edit"]').click();
    const ed = document.getElementById('editModal');
    const shown = !ed.classList.contains('hidden');
    document.getElementById('editTitle').value = '容错测试标题';
    document.getElementById('editModalSave').click();
    await new Promise(r => setTimeout(r, 400));
    return { before, shown, after: document.querySelectorAll('.book-card').length, edits: localStorage.getItem('notes-edits') };
  });
  ok('P0 损坏值下仍可编辑内置笔记', r.shown && r.after === 43 && r.edits && r.edits.includes('容错测试标题'),
     `弹窗=${r.shown} 书卡 ${r.before}→${r.after} 写入的 notes-edits=${String(r.edits).slice(0, 60)}`);
  await b.close();
}

/* ---------- 导入毒备份被拦截 ---------- */
for (const [label, lsVal] of [['notes-edits=null', { 'notes-edits': 'null' }], ['notes-edits 非法', { 'notes-edits': 'xx{{' }], ['notes-pinned 垃圾', { 'notes-pinned': 'zzz' }], ['categories 空数组', { 'notes-categories-v2': '[]' }]]) {
  const { b, p } = await fresh();
  const f = `/tmp/bad_${label.replace(/[^\w]/g, '_')}.json`;
  fs.writeFileSync(f, JSON.stringify({ app: '书阁', version: 1, exportedAt: new Date().toISOString(), localStorage: lsVal, userNotes: [] }));
  const input = await p.$('#importFileInput');
  await input.uploadFile(f);
  await new Promise(r => setTimeout(r, 900));
  const r = await p.evaluate(() => ({
    toast: document.querySelector('.toast') ? document.querySelector('.toast').textContent : null,
    modalHidden: document.getElementById('confirmModal').classList.contains('hidden'),
    poisoned: localStorage.getItem('notes-edits'),
  }));
  ok(`导入拦截 ${label}`, !!(r.toast && r.toast.includes('已拒绝导入')) && r.modalHidden && r.poisoned === null,
     `toast="${r.toast}" 确认框未弹=${r.modalHidden} localStorage未被污染=${r.poisoned === null}`);
  await b.close();
}

/* ---------- A10-2 / P1：触屏 768~1023 CSS 与 JS 断点一致 ---------- */
for (const w of [800, 900, 1000, 1023]) {
  const { b, p } = await fresh({ width: w, height: 900 }, true);
  const r = await p.evaluate(() => {
    const bn = document.getElementById('bottomNav');
    const mc = document.getElementById('mainContent');
    const sb = document.getElementById('sidebar');
    const app = document.getElementById('app');
    return {
      bottomNavVisible: getComputedStyle(bn).display !== 'none',
      mainHidden: getComputedStyle(mc).display === 'none' || mc.style.display === 'none',
      sidebarW: Math.round(sb.getBoundingClientRect().width),
      vw: window.innerWidth,
      flexDir: getComputedStyle(app).flexDirection,
      anyPointerCoarse: matchMedia('(any-pointer: coarse)').matches,
      menuBtnHidden: getComputedStyle(document.querySelector('.book-card-menu')).display === 'none',
    };
  });
  ok(`P1 触屏 ${w}px 布局一致`, r.bottomNavVisible && r.mainHidden && r.sidebarW === r.vw,
     `w=${r.vw} 底部导航可见=${r.bottomNavVisible} 主区隐藏=${r.mainHidden} 侧栏宽=${r.sidebarW} flex=${r.flexDir} any-pointer:coarse=${r.anyPointerCoarse} hover按钮隐藏=${r.menuBtnHidden}`);
  await b.close();
}

/* ---------- P1 反向：非触屏 768~1023 必须仍是桌面布局 ---------- */
for (const w of [800, 1000]) {
  const { b, p } = await fresh({ width: w, height: 900 }, false);
  const r = await p.evaluate(() => {
    const bn = document.getElementById('bottomNav');
    const mc = document.getElementById('mainContent');
    const sb = document.getElementById('sidebar');
    return {
      bottomNavVisible: getComputedStyle(bn).display !== 'none',
      mainVisible: getComputedStyle(mc).display !== 'none',
      sidebarW: Math.round(sb.getBoundingClientRect().width),
      vw: window.innerWidth,
      menuBtnShown: getComputedStyle(document.querySelector('.book-card-menu')).display !== 'none',
    };
  });
  ok(`P1 桌面 ${w}px 布局不变`, !r.bottomNavVisible && r.mainVisible && r.sidebarW === 300 && r.menuBtnShown,
     `w=${r.vw} 底部导航隐藏=${!r.bottomNavVisible} 主区可见=${r.mainVisible} 侧栏宽=${r.sidebarW}(应300) hover按钮显示=${r.menuBtnShown}`);
  await b.close();
}

/* ---------- A11-2 / P3：面板不残留 ---------- */
{
  const { b, p } = await fresh();
  const r = await p.evaluate(async () => {
    document.querySelector('.book-card').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    const bd = document.getElementById('actionSheetBackdrop');
    const opened = !bd.classList.contains('hidden');
    document.querySelectorAll('.book-card')[2].click();     // 打开面板状态下直接点另一本书
    await new Promise(r => setTimeout(r, 500));
    return { opened, stillOpen: !bd.classList.contains('hidden'), active: document.querySelectorAll('.book-card')[2].classList.contains('active') };
  });
  ok('P3 操作面板不残留', r.opened && !r.stillOpen && r.active, `面板已打开=${r.opened} 切换笔记后仍显示=${r.stillOpen} 新书已激活=${r.active}`);
  await b.close();
}

/* ---------- P2：确认文案含备份时间 + 丢失警告 ---------- */
{
  const { b, p } = await fresh();
  const f = '/tmp/good_backup.json';
  fs.writeFileSync(f, JSON.stringify({ app: '书阁', version: 1, exportedAt: '2026-10-10T08:00:00.000Z', localStorage: { 'notes-theme': 'dark' }, userNotes: [] }));
  const input = await p.$('#importFileInput');
  await input.uploadFile(f);
  await new Promise(r => setTimeout(r, 900));
  const r = await p.evaluate(() => ({
    visible: !document.getElementById('confirmModal').classList.contains('hidden'),
    msg: document.getElementById('confirmModalMessage').textContent,
    ws: getComputedStyle(document.getElementById('confirmModalMessage')).whiteSpace,
  }));
  const hasTime = /2026-10-10/.test(r.msg);
  const hasWarn = /新做的改动将丢失/.test(r.msg);
  const hasMerge = /备份中没有的笔记不会被删除/.test(r.msg);
  ok('P2 导入文案含时间/丢失警告/合并语义', r.visible && hasTime && hasWarn && hasMerge,
     `弹窗=${r.visible} 含备份时间=${hasTime} 含丢失警告=${hasWarn} 含合并说明=${hasMerge} white-space=${r.ws}`);
  console.log(`   文案: ${r.msg.replace(/\n/g, ' ⏎ ')}`);
  await b.close();
}

/* ---------- 回归：控制台零报错 ---------- */
{
  const errs = [];
  for (const [vp, touch] of [[{ width: 1440, height: 900 }, false], [{ width: 390, height: 844, isMobile: true, hasTouch: true }, false], [{ width: 900, height: 900 }, true]]) {
    const { b, p } = await fresh(vp, touch);
    await p.evaluate(async () => {
      document.querySelector('.book-card').click();
      await new Promise(r => setTimeout(r, 700));
      const chip = document.querySelectorAll('#categoryChips .category-chip')[1];
      if (chip) chip.click();
      document.querySelectorAll('#categoryChips .category-chip')[0].click();
      document.querySelector('.shelf-section-header').click();
      await new Promise(r => setTimeout(r, 400));
      document.getElementById('backCatBtn').click();
      document.querySelector('.tab-btn[data-tab="profile"]').click();
      document.querySelector('.tab-btn[data-tab="home"]').click();
    });
    await new Promise(r => setTimeout(r, 500));
    errs.push(...p.__errs);
    await b.close();
  }
  ok('回归 三种视口零报错', errs.length === 0, `错误数=${errs.length} ${JSON.stringify(errs).slice(0, 300)}`);
}

const failed = results.filter(r => !r.pass);
console.log(`\n==== SUMMARY: ${results.length - failed.length}/${results.length} PASS ====`);
if (failed.length) { console.log('FAILED:', failed.map(f => f.id).join(' | ')); process.exit(1); }
