// -*- coding: utf-8 -*-
/**
 * 书阁 v8.15.1 —— 分享图专项回归
 * ------------------------------------------------------------------
 * 针对用户报的「点了生成分享图出不来」BugFix 做独立回归验证，不依赖工程师的结论：
 *   _presentShare 的 `_sharing` 布尔锁只在 finally 复位、closeShareCard 从不复位，
 *   于是「一次生成没结束就关闭弹层」之后再点分享会被静默 return。
 *   v8.15.1 改成「重入令牌 + closeShareCard 复位」，这里逐条实测。
 *
 * 用例：
 *   ① 竞态回归：生成中关闭弹层 → 再点一次必须能出图（本次修复的核心）
 *   ② 三种笔记类型都能出图（内置 html / 图片 / PDF）
 *   ③ 双视口（桌面 1440×1000 / 移动 390×844）
 *   ④ 连续快速点两次不炸
 *   ⑤ 关闭再打开三次不死锁
 *   ⑥ 控制台干净（[share] 生成失败 也算失败）
 *   ⑦ 版本 v8.15.1 + v8.15.0 豆瓣评分胶囊（桌面 / 移动）
 *
 * 运行：
 *   cd html-preview-app
 *   python3 -m http.server 8899 --bind 127.0.0.1
 *   NODE_PATH=/Users/xuezhiyong/.workbuddy/binaries/node/workspace/node_modules \
 *   /Users/xuezhiyong/.workbuddy/binaries/node/versions/22.22.2-6/bin/node test/test-share-v8151.mjs
 */
import puppeteer from 'puppeteer';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:8899/index.html';
// v8.15.3：当前展示版本号（升版时只改这一处）
const APP_VERSION = 'v8.15.4';
const CHROME = '/Users/xuezhiyong/.cache/puppeteer/chrome/mac_arm-149.0.7827.22/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const SHOTS = path.resolve('shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
if (!existsSync(SHOTS)) mkdirSync(SHOTS, { recursive: true });

/* ---------------- 断言与统计（沿用 test-v813.mjs 的写法） ---------------- */
const results = [];
const ok = (name, pass, extra = '') => {
  results.push(!!pass);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? '   ' + extra : ''}`);
};

/* ---------------- 轮询兜底：本机 waitForFunction 偶发漏采样 ---------------- */
async function poll(fn, { timeout = 15000, step = 200 } = {}) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeout) {
    try { last = await fn(); } catch (_) { last = null; }
    if (last) return last;
    await sleep(step);
  }
  return null;
}

/* ---------------- 控制台收集：资源 404（用户笔记抓原文件）不算失败 ---------------- */
function attachConsole(page, bucket) {
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource|net::ERR|status of 404/i.test(t)) { bucket.resource.push(t); return; }
    bucket.err.push(t);
  });
  page.on('pageerror', e => bucket.pageerr.push(e.message));
}
const clean = () => ({ err: [], pageerr: [], resource: [] });

/* ---------------- 页面动作 ---------------- */
async function switchTab(page, name) {
  await page.evaluate(n => {
    const btn = document.querySelector(`.tab-btn[data-tab="${n}"]`);
    const nav = document.querySelector(`.nav-item[data-tab="${n}"]`);
    const el = (btn && btn.offsetParent !== null) ? btn : nav;
    if (el) el.click();
  }, name);
}

async function shelfReady(page) {
  return poll(() => page.evaluate(() => {
    const c = document.querySelector('.book-card');
    return !!c && c.getBoundingClientRect().width > 0;
  }), { timeout: 12000 });
}

/** 打开书店标签并确认书卡可见 */
async function gotoNotes(page) {
  await switchTab(page, 'notes');
  return shelfReady(page);
}

/** 静默打开笔记（键盘 Enter 入口，避开 headless 点按滚动问题），再退回列表 */
async function openReadThenBack(page, cardSelector) {
  const opened = await page.evaluate(sel => {
    const c = document.querySelector(sel);
    if (!c) return null;
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return { id: c.dataset.id, title: (c.querySelector('.book-t') || {}).textContent || '' };
  }, cardSelector);
  // 移动端走全屏阅读层，桌面端走右侧预览栏 —— 两种入口都算「打开了」
  const readerUp = await poll(() => page.evaluate(() => {
    const ov = document.getElementById('previewOverlay');
    const overlayOpen = !!ov && !ov.classList.contains('hidden');
    const t = document.getElementById('previewTitle');
    const deskOpen = !!t && t.textContent.trim() !== '选择一篇笔记';
    return overlayOpen || deskOpen;
  }), { timeout: 12000, step: 150 });
  await page.evaluate(() => {
    const b = document.getElementById('overlayBackBtn');
    const ov = document.getElementById('previewOverlay');
    if (b && ov && !ov.classList.contains('hidden')) b.click();
  });
  await sleep(500);
  return { opened, readerUp };
}

/** 操作面板 → 生成分享图 */
async function triggerShare(page, cardSelector) {
  await page.evaluate(sel => {
    const c = document.querySelector(sel);
    if (c) c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  }, cardSelector);
  const sheetUp = await poll(() => page.evaluate(() =>
    !!document.querySelector('[data-as-action="share"]')), { timeout: 6000, step: 100 });
  if (!sheetUp) return false;
  await page.evaluate(() => document.querySelector('[data-as-action="share"]').click());
  return true;
}

/** 弹层当前状态快照 */
const modalState = page => page.evaluate(() => {
  const i = document.getElementById('shareModalImg');
  const l = document.getElementById('shareModalLoading');
  return {
    show: document.getElementById('shareModalBackdrop').classList.contains('show'),
    srcHead: (i.getAttribute('src') || '').slice(0, 22),
    srcLen: (i.getAttribute('src') || '').length,
    naturalWidth: i.naturalWidth,
    naturalHeight: i.naturalHeight,
    imgDisplay: i.style.display,
    loadingDisplay: l ? l.style.display : '(no-el)',
    saveDisabled: document.getElementById('shareModalSave').disabled,
    toast: (document.querySelector('.toast') || {}).textContent || '',
  };
});

/** 等图出来（base64 + naturalWidth>0） */
const waitImage = (page, timeout = 20000) => poll(async () => {
  const s = await modalState(page);
  return (s.srcHead.startsWith('data:image/png;base64') && s.naturalWidth > 0) ? s : null;
}, { timeout, step: 250 });

const closeByButton = page => page.evaluate(() => document.getElementById('shareModalClose').click());
const closeByEsc = page => page.evaluate(() =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
const modalShown = page => page.evaluate(() =>
  document.getElementById('shareModalBackdrop').classList.contains('show'));

/* ---------------- 启动 ---------------- */
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});

/**
 * 环境补丁（只作用于测试环境，不碰 index.html）：
 * 本机沙箱里 Chrome 没有帧时钟，requestAnimationFrame 永不触发，
 * 书卡的入场动画 / 面板合帧就永远停在初始态，交互没法稳定复现。
 * 用 setTimeout 兜底 ≈ 60fps，语义等价。
 */
async function newPage(viewport) {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 16);
    window.cancelAnimationFrame = id => clearTimeout(id);
  });
  await page.setViewport(viewport);
  return page;
}

const data = await fetch(BASE.replace('index.html', 'notes.json')).then(r => r.json());
const highlights = await fetch(BASE.replace('index.html', 'highlights.json')).then(r => r.json());
const ratedIds = new Set(data.filter(n => n.rating).map(n => String(n.id)));
// 「没有人工标注观点」的笔记会走 fetch 正文摘录这条慢路径 —— 竞态用例需要它
const noHlIds = new Set(data.filter(n => !highlights[n.id] && /^notes\//.test(n.file || '')).map(n => String(n.id)));

const VIEWPORT_DESKTOP = { width: 1440, height: 1000, deviceScaleFactor: 1 };
const VIEWPORT_MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

/* ==================================================================
 * 移动端主流程
 * ================================================================== */
const mp = await newPage(VIEWPORT_MOBILE);
const mlog = clean();
attachConsole(mp, mlog);
await mp.goto(BASE, { waitUntil: 'networkidle0' });
await sleep(1800);

console.log('\n=== ⑦-A 版本号（移动端） ===');
const verM = await mp.evaluate(() => ({
  title: document.title,
  heroVersion: [...document.querySelectorAll('.hero-version')].map(e => e.textContent.trim()),
  aboutVersion: (document.querySelector('.about-version') || {}).textContent || '',
  settingVersion: [...document.querySelectorAll('.profile-setting-item .setting-value')].map(e => e.textContent.trim()),
}));
// v8.15.3：版本断言原来写死 v8.15.1（v8.15.2 升版时漏改，导致 4 条假失败），
// 改为跟随 APP_VERSION 常量，以后每次升版只改这一处。
ok(`页面标题是 ${APP_VERSION}`, verM.title.includes(APP_VERSION), verM.title);
ok(`品牌栏版本号是 ${APP_VERSION}`, verM.heroVersion.length > 0 && verM.heroVersion.every(v => v === APP_VERSION), verM.heroVersion.join('/'));
ok(`「我的 → 关于」是 ${APP_VERSION}`, verM.aboutVersion.includes(APP_VERSION) && verM.settingVersion.includes(APP_VERSION), `${verM.aboutVersion} | ${verM.settingVersion.join('/')}`);

console.log('\n=== ⑦-B 豆瓣评分胶囊（移动端） ===');
await gotoNotes(mp);
const rateM = await mp.evaluate(() => {
  const cards = [...document.querySelectorAll('.book-card')].filter(c => c.getBoundingClientRect().width > 0);
  return {
    cards: cards.length,
    badges: cards.filter(c => c.querySelector('.book-rating')).length,
    ids: cards.map(c => String(c.dataset.id)),
    sample: (cards.find(c => c.querySelector('.book-rating')) || {}).dataset ? (cards.find(c => c.querySelector('.book-rating')).querySelector('.book-rating').textContent.trim()) : '',
  };
});
const ratedOnShelfM = rateM.ids.filter(id => ratedIds.has(id)).length;
ok('移动端：有评分的书都渲染了胶囊', rateM.badges === ratedOnShelfM, `胶囊 ${rateM.badges} / 应显示 ${ratedOnShelfM}（书架 ${rateM.cards} 张 / notes.json ${data.length} 本，其中带 rating ${ratedIds.size} 本）`);
ok('移动端：胶囊数量与 notes.json 一致', rateM.badges === ratedIds.size || rateM.cards < data.length, `胶囊 ${rateM.badges}，书架可见 ${rateM.cards}/${data.length} 本`);
ok('胶囊文案是 ★+一位小数', /^★\d\.\d$/.test(rateM.sample), rateM.sample);

console.log('\n=== ① 竞态回归：生成中关闭 → 再点必须出图（核心用例） ===');
// 找一本「没有 highlights」的内置 html 笔记：它必然走 fetch 正文这条慢路径
const raceId = await mp.evaluate(ids => {
  const cards = [...document.querySelectorAll('.book-card')].filter(c => c.getBoundingClientRect().width > 0);
  const hit = cards.find(c => ids.includes(String(c.dataset.id)));
  if (!hit) return null;
  hit.scrollIntoView({ block: 'center' });
  return String(hit.dataset.id);
}, [...noHlIds]);
const raceSel = `.book-card[data-id="${raceId}"]`;
const raceRead = await openReadThenBack(mp, raceSel);
ok('能打开笔记（复现前提）', !!raceRead.opened && !!raceRead.readerUp, JSON.stringify(raceRead.opened));

// 让正文 fetch 延迟 2500ms —— 制造「生成还没结束」的窗口（不动 index.html）
await mp.evaluate(ms => {
  if (window.__qaOrigFetch) return;
  window.__qaOrigFetch = window.fetch;
  window.fetch = function (input, init) {
    const u = typeof input === 'string' ? input : (input && input.url) || '';
    if (/notes\/note\d+\.html/.test(u)) {
      return new Promise((res, rej) => {
        setTimeout(() => window.__qaOrigFetch.call(window, input, init).then(res, rej), ms);
      });
    }
    return window.__qaOrigFetch.call(window, input, init);
  };
}, 2500);

const t0 = Date.now();
const firstClick = await triggerShare(mp, raceSel);
const loadingUp = await poll(async () => {
  const s = await modalState(mp);
  return (s.show && s.loadingDisplay !== 'none') ? s : null;
}, { timeout: 3000, step: 100 });
ok('第一次点分享：弹层立刻打开、处于 loading', firstClick && !!loadingUp, JSON.stringify(loadingUp));

if (loadingUp) {
  await closeByButton(mp);         // 生成还没结束就关掉
  await sleep(200);
  const closed = await modalState(mp);
  ok('生成中点关闭：弹层收起', closed.show === false, JSON.stringify({ show: closed.show, srcLen: closed.srcLen }));
} else {
  ok('生成中点关闭：弹层收起', false, '第一次没打开弹层，无法继续');
}

// 旧那次构建 2.5s 后仍然会跑完 —— 令牌守卫必须拦住它，不许把图回填进已关闭的弹层
await sleep(3400);
const stale = await modalState(mp);
ok('关闭后旧构建不得回填（弹层仍关着、img 无 src）',
  stale.show === false && !stale.srcHead.startsWith('data:'),
  JSON.stringify({ show: stale.show, srcHead: stale.srcHead }));

// 再点一次 —— 旧实现（_sharing 卡在 true）在这里会被静默吞掉，弹层不出现
const secondClick = await triggerShare(mp, raceSel);
const reopened = await poll(async () => (await modalShown(mp)) ? true : null, { timeout: 3000, step: 100 });
ok('关闭后再点一次：弹层能重新打开（旧版此处为 false）', secondClick && reopened === true,
  `间隔 ${Date.now() - t0}ms`);

const raceImg = await waitImage(mp, 20000);
ok('第二次分享最终出图（base64 + naturalWidth>0）', !!raceImg,
  raceImg ? `base64 ${raceImg.srcLen} 字符，${raceImg.naturalWidth}×${raceImg.naturalHeight}` : JSON.stringify(await modalState(mp)));
ok('loading 最终隐藏', !!raceImg && raceImg.loadingDisplay === 'none', raceImg ? raceImg.loadingDisplay : '-');
// toBlob 是异步的，按钮可用要多等一会（不是失败，只是 blob 编码比出图慢半拍）
const saveReady = await poll(async () => (await modalState(mp)).saveDisabled === false ? true : null,
  { timeout: 10000, step: 150 });
ok('「保存图片」按钮最终可用（Blob 已备好）', saveReady === true,
  JSON.stringify((({ saveDisabled, toast }) => ({ saveDisabled, toast }))(await modalState(mp))));
ok('弹层仍保持打开状态', !!(await modalShown(mp)));

// 再等一会儿，确认旧构建彻底结束后弹层状态不被污染
await sleep(2500);
const settled = await modalState(mp);
ok('旧构建结束后弹层状态不被污染（仍出图、仍打开）',
  settled.show === true && settled.srcHead.startsWith('data:image/png;base64') && settled.naturalWidth > 0,
  JSON.stringify({ show: settled.show, w: settled.naturalWidth, srcLen: settled.srcLen }));

// 落盘存证：把海报 dataUrl 直接写文件（比整页截图稳，不会 OOM）
const dataUrl = await mp.evaluate(() => document.getElementById('shareModalImg').getAttribute('src') || '');
if (dataUrl.startsWith('data:image/png;base64,')) {
  writeFileSync(path.resolve('shots/qa-v8151-race.png'), Buffer.from(dataUrl.split(',')[1], 'base64'));
}
await closeByButton(mp);
await sleep(200);

await mp.evaluate(() => {
  if (window.__qaOrigFetch) { window.fetch = window.__qaOrigFetch; delete window.__qaOrigFetch; }
});

console.log('\n=== ①-C 弱网挂起不再永久卡死（抓正文 12s 上限） ===');
// 整条笔记正文请求永不响应，模拟弱网挂起：旧版 fetch 无超时，
// _sharing 会永久为 true、弹层永远转圈；v8.15.1 应该在 12s 后放弃摘录、照样出图。
{
  const wp = await newPage(VIEWPORT_MOBILE);
  const wlog = clean();
  attachConsole(wp, wlog);
  await wp.setRequestInterception(true);
  wp.on('request', req => {
    if (/notes\/note\d+\.html$/.test(req.url())) return;   // 故意挂起，不响应
    req.continue().catch(() => {});
  });
  await wp.goto(BASE, { waitUntil: 'domcontentloaded' });
  await sleep(2000);
  await gotoNotes(wp);
  const hangId = await wp.evaluate(ids => {
    const cards = [...document.querySelectorAll('.book-card')];
    const c = cards.find(x => ids.includes(String(x.dataset.id)));
    return c ? String(c.dataset.id) : null;
  }, [...noHlIds]);
  const tHang = Date.now();
  const clicked = hangId ? await triggerShare(wp, `.book-card[data-id="${hangId}"]`) : false;
  const hungImg = clicked ? await waitImage(wp, 30000) : null;
  const cost = Date.now() - tHang;
  ok('正文请求挂死时仍能出图（不会永远 loading）', !!hungImg,
    hungImg ? `耗时 ${(cost / 1000).toFixed(1)}s，base64 ${hungImg.srcLen} 字符，${hungImg.naturalWidth}px`
      : JSON.stringify(await modalState(wp)));
  ok('耗时符合 12s 超时预期（10s–25s）', !!hungImg && cost >= 10000 && cost <= 25000, `${(cost / 1000).toFixed(1)}s`);
  ok('弱网场景下 loading 收掉、弹层仍打开',
    !!hungImg && hungImg.loadingDisplay === 'none' && (await modalShown(wp)),
    JSON.stringify({ loading: hungImg ? hungImg.loadingDisplay : '-', show: await modalShown(wp) }));
  ok('弱网场景无 [share] 生成失败', !wlog.err.concat(wlog.pageerr).some(t => /\[share\] 生成失败/.test(t)),
    JSON.stringify(wlog.err.slice(0, 2)));
  await wp.close();
}

console.log('\n=== ④ 连续快速点两次不炸 ===');
const dblFirst = await triggerShare(mp, raceSel);
await sleep(60);
// 第二次：再开一次操作面板并立刻点分享（此时 _sharing 仍为 true、弹层还在）
const dblSecond = await triggerShare(mp, raceSel);
const dblShown = await poll(async () => (await modalShown(mp)) ? true : null, { timeout: 3000, step: 100 });
const dblImg = await waitImage(mp, 20000);
ok('快速连点两次：弹层正常、不抛错', dblFirst && dblShown === true, `first=${dblFirst} second=${dblSecond}`);
ok('快速连点两次：最终仍出图', !!dblImg,
  dblImg ? `base64 ${dblImg.srcLen} 字符，${dblImg.naturalWidth}px` : JSON.stringify(await modalState(mp)));
await closeByButton(mp);
await sleep(200);

console.log('\n=== ⑤ 关闭再打开三次：_sharing 不能卡死 ===');
const cycle = [];
for (let i = 1; i <= 3; i++) {
  const clicked = await triggerShare(mp, raceSel);
  const shown = await poll(async () => (await modalShown(mp)) ? true : null, { timeout: 3000, step: 100 });
  const img = await waitImage(mp, 20000);
  cycle.push({ i, clicked, shown, srcLen: img ? img.srcLen : 0, w: img ? img.naturalWidth : 0 });
  // 关闭方式：第 2 次用 Esc，其余用按钮，两条退出路径都测到
  if (i === 2) await closeByEsc(mp); else await closeByButton(mp);
  await sleep(250);
}
ok('三次都能重新打开弹层并出图', cycle.every(c => c.clicked && c.shown && c.w > 0), JSON.stringify(cycle));
ok('第 2 次用 Esc 关闭也能正常重开', cycle[1] && cycle[1].w > 0 && cycle[2].w > 0, JSON.stringify(cycle[1]));

console.log('\n=== ② 三种笔记类型都出图（图片 / PDF） ===');
const pngPath = path.resolve('test/_qa-share-tiny.png');
const pdfPath = path.resolve('test/_qa-share-tiny.pdf');
writeFileSync(pngPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
const pdfPage = await browser.newPage();
await pdfPage.setContent('<h1>书阁分享图测试 PDF</h1><p>第二行正文</p>');
await pdfPage.pdf({ path: pdfPath, format: 'A5' });
await pdfPage.close();

async function uploadOne(page, filePath, title) {
  await switchTab(page, 'upload');
  await sleep(700);
  const input = await page.$('#uploadFileInput');
  await input.uploadFile(filePath);
  await sleep(500);
  await page.evaluate(t => {
    const ti = document.getElementById('uploadTitle');
    if (ti) ti.value = t;
    const sel = document.getElementById('uploadCategory');
    if (sel && !sel.value) {
      const opt = [...sel.options].find(o => o.value);
      if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    }
  }, title);
  await sleep(300);
  await page.evaluate(() => document.getElementById('uploadSubmitBtn').click());
  await sleep(2200);
}
await uploadOne(mp, pngPath, 'QA 分享图-图片笔记');
await uploadOne(mp, pdfPath, 'QA 分享图-PDF笔记');

const userNotes = await mp.evaluate(() => JSON.parse(localStorage.getItem('user-notes-index') || '[]'));
const imgNote = userNotes.find(n => n.kind === 'image');
const pdfNote = userNotes.find(n => n.kind === 'pdf');
ok('上传后拿到 image / pdf 两条笔记', !!imgNote && !!pdfNote, JSON.stringify(userNotes.map(n => n.kind)));

async function shareAndCheck(page, sel, label) {
  const before = (await modalState(page)).srcLen;
  const clicked = await triggerShare(page, sel);
  const img = clicked ? await waitImage(page, 25000) : null;
  ok(`${label} 能出分享图`, !!img, img ? `base64 ${img.srcLen} 字符，${img.naturalWidth}×${img.naturalHeight}` : JSON.stringify(await modalState(page)));
  if (img) {
    const url = await page.evaluate(() => document.getElementById('shareModalImg').getAttribute('src') || '');
    const fn = `shots/qa-v8151-${label.replace(/[^\w-]/g, '')}.png`;
    if (url.startsWith('data:image/png;base64,')) writeFileSync(path.resolve(fn), Buffer.from(url.split(',')[1], 'base64'));
  }
  if (await modalShown(page)) { await closeByButton(page); await sleep(250); }
  return { img, before };
}

await gotoNotes(mp);
if (imgNote) await shareAndCheck(mp, `.book-card[data-id="${imgNote.id}"]`, 'image 笔记');
else ok('image 笔记 能出分享图', false, '没找到刚上传的图片笔记');
if (pdfNote) await shareAndCheck(mp, `.book-card[data-id="${pdfNote.id}"]`, 'pdf 笔记');
else ok('pdf 笔记 能出分享图', false, '没找到刚上传的 PDF 笔记');

console.log('\n=== ⑥-A 移动端控制台 ===');
ok('移动端无 JS 报错 / pageerror', mlog.err.length === 0 && mlog.pageerr.length === 0,
  JSON.stringify({ err: mlog.err.slice(0, 3), pageerr: mlog.pageerr.slice(0, 3), resources: mlog.resource.length }));
ok('移动端没有 [share] 生成失败', !mlog.err.concat(mlog.pageerr).some(t => /\[share\] 生成失败/.test(t)), '');

/* ==================================================================
 * 桌面端
 * ================================================================== */
console.log('\n=== ③-A 桌面 1440×1000 分享图 ===');
const dp = await newPage(VIEWPORT_DESKTOP);
const dlog = clean();
attachConsole(dp, dlog);
await dp.goto(BASE, { waitUntil: 'networkidle0' });
await sleep(1800);

const verD = await dp.evaluate(() => ({
  title: document.title,
  heroVersion: [...document.querySelectorAll('.hero-version')].map(e => e.textContent.trim()),
}));
ok(`桌面端标题 / 品牌栏版本是 ${APP_VERSION}`, verD.title.includes(APP_VERSION) && verD.heroVersion.every(v => v === APP_VERSION), `${verD.title} | ${verD.heroVersion.join('/')}`);

await gotoNotes(dp);
const deskId = await dp.evaluate(() => {
  const c = document.querySelector('.book-card');
  return c ? c.dataset.id : null;
});
const deskRead = await openReadThenBack(dp, `.book-card[data-id="${deskId}"]`);
ok('桌面端能打开笔记', !!deskRead.opened && !!deskRead.readerUp, JSON.stringify(deskRead.opened));
const deskShare = await shareAndCheck(dp, `.book-card[data-id="${deskId}"]`, '桌面 html 笔记');
ok('桌面端出图尺寸为海报宽度 1080', !!deskShare.img && deskShare.img.naturalWidth === 1080,
  deskShare.img ? String(deskShare.img.naturalWidth) : '-');

console.log('\n=== ⑦-C 豆瓣评分胶囊（桌面端） ===');
const rateD = await dp.evaluate(() => {
  const cards = [...document.querySelectorAll('.book-card')].filter(c => c.getBoundingClientRect().width > 0);
  return {
    cards: cards.length,
    badges: cards.filter(c => c.querySelector('.book-rating')).length,
    ids: cards.map(c => String(c.dataset.id)),
  };
});
const ratedOnShelfD = rateD.ids.filter(id => ratedIds.has(id)).length;
ok('桌面端：胶囊数量与带 rating 的书一致', rateD.badges === ratedOnShelfD, `胶囊 ${rateD.badges} / 应显示 ${ratedOnShelfD}（书架 ${rateD.cards} 张）`);

console.log('\n=== ⑥-B 桌面端控制台 ===');
ok('桌面端无 JS 报错 / pageerror', dlog.err.length === 0 && dlog.pageerr.length === 0,
  JSON.stringify({ err: dlog.err.slice(0, 3), pageerr: dlog.pageerr.slice(0, 3), resources: dlog.resource.length }));

/* ---------------- 汇总 ---------------- */
await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n===== ${passed}/${results.length} 通过 =====`);
process.exit(passed === results.length ? 0 : 1);
