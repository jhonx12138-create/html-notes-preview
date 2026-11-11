// -*- coding: utf-8 -*-
/**
 * 书阁 v8.15.3 —— 分类详情页：右滑返回手势 + 行间距修复
 * 运行: NODE_PATH=<puppeteer> node test/test-catdetail-v8153.mjs
 *
 * 覆盖：
 *   ① 分类详情页可正常进入，行距回到设计值 12px（改前实测 135.4px）
 *   ② 右滑返回：横滑够长 → 回到书架，书架渲染正常
 *   ③ 回弹：横滑太短 → 不回退，且下次进入不带位移
 *   ④ 纵向滑动不会误触发返回（分类页仍可正常滚动）
 *   ⑤ 右滑松手不会误开笔记预览（合成 click 被吞）
 *   ⑥ 首页书架的书卡尺寸/间距未被本次改动影响
 */
import puppeteer from 'puppeteer';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:8899/index.html';
// v8.15.3：当前展示版本号。升版时改这里 + index.html 的 5 处展示文案；
// 下方「版本自检」会直接从 index.html 源码读实际版本比对，漏改任一处都会明确报红。
const APP_VERSION = 'v8.15.3';
const CHROME = '/Users/xuezhiyong/.cache/puppeteer/chrome/mac_arm-149.0.7827.22/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const results = [];
const ok = (n, pass, extra = '') => {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${extra ? '   ' + extra : ''}`);
};

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});
const p = await browser.newPage();
const errors = [];
p.on('pageerror', e => errors.push(e.message));
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await p.goto(BASE, { waitUntil: 'networkidle0' });
await sleep(1600);

/* [QA 环境补丁] 本机沙箱里 Chrome 没有帧时钟，requestAnimationFrame 永不触发。
   只有真的不转时才用 setTimeout 兜底（≈60fps），不改 index.html 行为。 */
const rafAlive = await p.evaluate(() => new Promise(res => {
  let fired = false;
  requestAnimationFrame(() => { fired = true; });
  setTimeout(() => res(fired), 250);
}));
if (!rafAlive) {
  console.log('[env] 检测到 rAF 不触发，已用 setTimeout 兜底帧时钟');
  await p.evaluate(() => {
    window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 16);
    window.cancelAnimationFrame = id => clearTimeout(id);
  });
}

/* 在页面上下文里手搓 TouchEvent（headless 下比 p.touchscreen 更可控，
   且不会额外合成 click 干扰断言；另有一条用例专门验证合成 click 的防护）。 */
const installSwipeHelper = () => p.evaluate(() => {
  window.__swipe = function(opts) {
    const o = opts || {};
    const dx = o.dx || 0, dy = o.dy || 0;
    const steps = o.steps || 8;
    const el = document.getElementById('categoryDetailView');
    const r = el.getBoundingClientRect();
    const sx = o.startX != null ? o.startX : r.left + 30;
    const sy = o.startY != null ? o.startY : r.top + Math.min(180, r.height * 0.4);
    const mkTouch = (x, y) => new Touch({
      identifier: 1, target: el, clientX: x, clientY: y,
      pageX: x, pageY: y, screenX: x, screenY: y,
      radiusX: 12, radiusY: 12, force: 1,
    });
    const fire = (type, touches, changed) => {
      const ev = new TouchEvent(type, {
        bubbles: true, cancelable: true, composed: true,
        touches, targetTouches: touches, changedTouches: changed,
      });
      el.dispatchEvent(ev);
      return ev;
    };
    const t0 = mkTouch(sx, sy);
    fire('touchstart', [t0], [t0]);
    for (let i = 1; i <= steps; i++) {
      const t = mkTouch(sx + (dx * i) / steps, sy + (dy * i) / steps);
      fire('touchmove', [t], [t]);
    }
    const tEnd = mkTouch(sx + dx, sy + dy);
    const evEnd = fire('touchend', [], [tEnd]);
    return { preventDefault: evEnd.defaultPrevented };
  };
});
await installSwipeHelper();

const enterCategory = (cat) => p.evaluate((c) => {
  const secs = [...document.querySelectorAll('.shelf-section')];
  const target = secs.find(s => (s.textContent || '').includes(c));
  if (!target) return false;
  const head = target.querySelector('.shelf-section-header') || target;
  head.click();
  return true;
}, cat);

const viewState = () => p.evaluate(() => {
  const v = document.getElementById('categoryDetailView');
  const g = document.getElementById('categoryDetailGrid');
  const shelf = document.getElementById('shelfContainer');
  const cs = getComputedStyle(g);
  const cards = [...g.querySelectorAll('.book-card')];
  const tops = [...new Set(cards.map(c => +c.getBoundingClientRect().top.toFixed(1)))].sort((a, b) => a - b);
  const cardH = cards.length ? +cards[0].getBoundingClientRect().height.toFixed(1) : 0;
  const rows = cs.gridTemplateRows.split(' ').map(v => parseFloat(v));
  return {
    hidden: v.classList.contains('hidden'),
    transform: v.style.transform || '',
    opacity: v.style.opacity || '',
    hasAnimClass: v.classList.contains('cat-swipe-animating'),
    shelfDisplay: shelf.style.display,
    rowGap: parseFloat(cs.rowGap),
    alignContent: cs.alignContent,
    cardH,
    cardCount: cards.length,
    rows,
    visualGap: tops.length > 1 ? +(tops[1] - tops[0] - cardH).toFixed(1) : null,
    title: (document.getElementById('categoryDetailTitle') || {}).textContent || '',
    previewHidden: document.getElementById('previewOverlay')
      ? document.getElementById('previewOverlay').classList.contains('hidden') : true,
  };
});

/* ---------------------------------------------------------------- */
console.log('\n=== ① 版本号与入口 ===');
const ver = await p.evaluate(() => ({
  title: document.title,
  hero: [...document.querySelectorAll('.hero-version')].map(e => e.textContent.trim()),
  setting: [...document.querySelectorAll('.setting-value')].map(e => e.textContent.trim()),
  about: (document.querySelector('.about-version') || {}).textContent || '',
}));
ok(`版本文案全部升到 ${APP_VERSION}`,
  ver.title.includes(APP_VERSION) && ver.hero.length === 2 && ver.hero.every(v => v === APP_VERSION)
  && ver.setting.includes(APP_VERSION) && ver.about.includes(APP_VERSION),
  JSON.stringify(ver));

/* 版本自检：不依赖人肉对比。直接读 index.html 源码，抽出 5 处展示位的版本，
   与 APP_VERSION 逐一比对 —— 只有「测试常量 / 源码 / 运行时 DOM」三者全一致才 PASS。
   （漏改 index.html → 这里红；漏改本文件常量 → 这里与上一条一起红，且报出双方取值） */
const srcHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const srcVersions = {
  title: (srcHtml.match(/<title>[^<]*?(v\d+\.\d+\.\d+)<\/title>/) || [])[1] || null,
  hero: [...srcHtml.matchAll(/<span class="hero-version">(v[\d.]+)<\/span>/g)].map(m => m[1]),
  setting: [...srcHtml.matchAll(/<span class="setting-value">(v[\d.]+)<\/span>/g)].map(m => m[1]),
  about: (srcHtml.match(/<div class="about-version">[^<]*?(v\d+\.\d+\.\d+)<\/div>/) || [])[1] || null,
};
const srcAll = [srcVersions.title, ...srcVersions.hero, ...srcVersions.setting, srcVersions.about];
ok('版本自检：index.html 源码 5 处展示版本 === APP_VERSION（漏改会在此明确报红）',
  srcAll.length === 5 && srcAll.every(v => v === APP_VERSION),
  `index.html=${JSON.stringify(srcVersions)} / 测试常量=${APP_VERSION}`);
ok('版本自检：运行时 DOM 与源码一致（无 JS 覆写版本）',
  ver.title.includes(srcVersions.title || '\u0000')
  && ver.hero.every(v => v === srcVersions.title)
  && ver.setting.includes(srcVersions.title || '\u0000')
  && ver.about.includes(srcVersions.title || '\u0000'),
  `DOM=${ver.title}`);

await p.evaluate(() => document.querySelector('.nav-item[data-tab="notes"]').click());
await sleep(900);
const shelfOk = await p.evaluate(() => document.querySelectorAll('.shelf-container .book-card').length);
ok('书架已渲染出书卡', shelfOk > 0, `${shelfOk} 张`);

const entered = await enterCategory('社会与文化');
await sleep(600);
let st = await viewState();
ok('能进入「社会与文化」分类详情页', entered && !st.hidden && st.cardCount > 0,
  `cards=${st.cardCount} title=${st.title}`);

console.log('\n=== ② 行间距（v8.15.3 主修） ===');
ok('网格 align-content 已改为 start（不再拉伸行轨道）', st.alignContent === 'start', st.alignContent);
ok('row-gap 是设计值 12px', st.rowGap === 12, `${st.rowGap}px`);
ok('每行轨道高度 ≈ 卡片高度（不再是卡片 1.85 倍）',
  st.rows.every(r => Math.abs(r - st.cardH) < 2),
  `rows=${st.rows.join('/')} cardH=${st.cardH}`);
ok('两行书卡的实际垂直空白 ≤ 12 + 6px 容差（改前实测 135.4px）',
  st.visualGap !== null && st.visualGap <= 12 + 6,
  `实测 ${st.visualGap}px`);

console.log('\n=== ③ 纵向滑动不误触返回 ===');
await installSwipeHelper();
let ev = await p.evaluate(() => window.__swipe({ dx: 0, dy: -150, steps: 10 }));
await sleep(420);
st = await viewState();
ok('向上滚列表没有退出分类页', !st.hidden, `hidden=${st.hidden}`);
ok('纵向滑动期间没有产生横向位移', st.transform === '' || st.transform === 'none', st.transform);
ok('touchend 未被 preventDefault（滚动语义保留）', ev.preventDefault === false, JSON.stringify(ev));

console.log('\n=== ④ 横滑太短 → 回弹不回退 ===');
await installSwipeHelper();
await p.evaluate(() => window.__swipe({ dx: 30, dy: 4, steps: 6 }));
await sleep(420);
st = await viewState();
ok('横移 30px（< 70px 阈值）不返回', !st.hidden, `hidden=${st.hidden}`);
ok('回弹后内联位移已清空（.cat-swipe-animating 也已摘下）',
  st.transform === '' && st.hasAnimClass === false, JSON.stringify({ t: st.transform, anim: st.hasAnimClass }));

console.log('\n=== ⑤ 右滑够长 → 返回书架 ===');
await installSwipeHelper();
ev = await p.evaluate(() => window.__swipe({ dx: 170, dy: 6, steps: 12 }));
ok('横滑时 touchend 已 preventDefault（吞掉合成 click）', ev.preventDefault === true, JSON.stringify(ev));
await sleep(520);
st = await viewState();
ok('右滑后分类页已隐藏', st.hidden === true, `hidden=${st.hidden}`);
ok('书架容器已恢复显示', st.shelfDisplay === '', `display="${st.shelfDisplay}"`);
const shelfBack = await p.evaluate(() => ({
  cards: document.querySelectorAll('.shelf-container .book-card').length,
  sections: document.querySelectorAll('.shelf-container .shelf-section').length,
}));
ok('返回后书架重新渲染正常（分类区块 + 书卡都在）', shelfBack.cards > 0 && shelfBack.sections > 0,
  JSON.stringify(shelfBack));
ok('返回后没有误开笔记预览', st.previewHidden === true, `previewHidden=${st.previewHidden}`);

console.log('\n=== ⑥ 再次进入：无残留位移 ===');
await enterCategory('社会与文化');
await sleep(600);
st = await viewState();
ok('再次进入分类页正常显示、无残留 transform/opacity',
  !st.hidden && st.transform === '' && st.opacity === '',
  JSON.stringify({ hidden: st.hidden, t: st.transform, o: st.opacity }));

console.log('\n=== ⑦ 轻扫（短距离 + 快速）也返回 ===');
await installSwipeHelper();
await p.evaluate(() => window.__swipe({ dx: 55, dy: 3, steps: 4 }));
await sleep(520);
st = await viewState();
ok('横移 55px 的快速轻扫同样返回书架', st.hidden === true, `hidden=${st.hidden}`);

console.log('\n=== ⑧ 首页书架未被本次改动影响 ===');
await p.evaluate(() => document.querySelector('.nav-item[data-tab="notes"]').click());
await sleep(700);
const shelfMetrics = await p.evaluate(() => {
  const row = document.querySelector('.shelf-container .book-row');
  const cs = getComputedStyle(row);
  const cards = [...row.querySelectorAll('.book-card')];
  const tops = [...new Set(cards.map(c => +c.getBoundingClientRect().top.toFixed(1)))].sort((a, b) => a - b);
  const h = +cards[0].getBoundingClientRect().height.toFixed(1);
  const w = +cards[0].getBoundingClientRect().width.toFixed(1);
  return {
    rowGap: parseFloat(cs.rowGap), alignContent: cs.alignContent, cardH: h, cardW: w,
    visualGap: tops.length > 1 ? +(tops[1] - tops[0] - h).toFixed(1) : null,
    ratio: +(h / w).toFixed(3),
  };
});
ok('书架书卡行距仍是 12px', shelfMetrics.visualGap === null || shelfMetrics.visualGap <= 12 + 6,
  `实测 ${shelfMetrics.visualGap}px`);
ok('书架书卡仍是 80:150 比例（未被拉伸变形）',
  Math.abs(shelfMetrics.ratio - 150 / 80) < 0.06, `ratio=${shelfMetrics.ratio} (${shelfMetrics.cardW}×${shelfMetrics.cardH})`);
ok('书架网格 align-content 保持原样（未被本次改动波及）',
  shelfMetrics.alignContent === 'normal', shelfMetrics.alignContent);

console.log('\n=== ⑨ 行轨道不塌缩：8 / 13 / 20 本（v8.15.3 补修 grid-auto-rows） ===');
/* 用内存 DOM 夹具：把现有书卡 clone 到目标数量，测完移除，绝不改 notes.json。
   背景：auto 行轨道的 base size 取 min-content(≈68px)，装不下所有行时 Maximize Tracks
   不执行 → 轨道比卡片矮 → 卡片溢出叠压（改前：13 本重叠 5px、20 本重叠 33px）。 */
const ROW_HELPERS = `
  window.__fitCards = function (target) {
    const g = document.getElementById('categoryDetailGrid');
    const orig = [...g.querySelectorAll('.book-card')];
    while (g.querySelectorAll('.book-card').length > target) g.lastElementChild.remove();
    while (g.querySelectorAll('.book-card').length < target) {
      const src = orig[g.querySelectorAll('.book-card').length % orig.length];
      g.appendChild(src.cloneNode(true));
    }
    return g.querySelectorAll('.book-card').length;
  };
  window.__rowMetrics = function () {
    const g = document.getElementById('categoryDetailGrid');
    const cs = getComputedStyle(g);
    const cards = [...g.querySelectorAll('.book-card')];
    const rects = cards.map(c => {
      const r = c.getBoundingClientRect();
      return { top: +r.top.toFixed(2), bot: +r.bottom.toFixed(2), h: +r.height.toFixed(2), w: +r.width.toFixed(2) };
    });
    const tops = [...new Set(rects.map(r => r.top))].sort((a, b) => a - b);
    const rows = tops.map(t => rects.filter(r => r.top === t));
    // 相邻行「下一行 top − 上一行 bottom」，取最小值：<0 即叠压，正常应 = row-gap(12)
    let worstGap = Infinity;
    for (let i = 1; i < rows.length; i++) {
      const prevBot = Math.max(...rows[i - 1].map(r => r.bot));
      const curTop = Math.min(...rows[i].map(r => r.top));
      worstGap = Math.min(worstGap, +(curTop - prevBot).toFixed(2));
    }
    if (!isFinite(worstGap)) worstGap = null;
    const tracks = cs.gridTemplateRows.split(' ').map(v => parseFloat(v));
    return {
      cards: cards.length, rowCount: rows.length,
      tracks, minTrack: +Math.min(...tracks).toFixed(2), maxTrack: +Math.max(...tracks).toFixed(2),
      cardH: rects[0].h, cardW: rects[0].w, ratio: +(rects[0].h / rects[0].w).toFixed(3),
      gapRow1to2: rows.length > 1 ? +(Math.min(...rows[1].map(r => r.top)) - Math.max(...rows[0].map(r => r.bot))).toFixed(2) : null,
      worstGap, gridAutoRows: cs.gridAutoRows, alignContent: cs.alignContent,
      scrollH: g.scrollHeight, clientH: g.clientHeight, scrollable: g.scrollHeight > g.clientHeight,
    };
  };
`;

/** 断言一组「装不下 → 必须正确定尺且可滚」的指标 */
const assertNoOverlap = (label, m) => {
  ok(`${label}：行轨道高度 = 卡片高度（不再塌缩到 min-content）`,
    Math.abs(m.minTrack - m.cardH) < 2, `行轨 ${m.minTrack}~${m.maxTrack}px / 卡 ${m.cardH}px（${m.rowCount} 行）`);
  ok(`${label}：相邻行无叠压（下一行 top ≥ 上一行 bottom + 12 − 1）`,
    m.worstGap !== null && m.worstGap >= 11, `最差行距 ${m.worstGap}px`);
  ok(`${label}：容器真的可滚（scrollHeight > clientHeight）`,
    m.scrollable === true, `${m.scrollH} / ${m.clientH}`);
};

await enterCategory('社会与文化');
await sleep(650);
await p.evaluate(ROW_HELPERS);

const m8 = await p.evaluate(() => { window.__fitCards(8); return window.__rowMetrics(); });
ok('8 本：观感与改前逐像素一致（行轨 145.312 / 行距 12 / 卡 77.5×145.31）',
  Math.abs(m8.minTrack - 145.312) < 0.05 && m8.gapRow1to2 === 12
  && Math.abs(m8.cardW - 77.5) < 0.1 && Math.abs(m8.ratio - 1.875) < 0.005,
  JSON.stringify({ tracks: m8.tracks, gap: m8.gapRow1to2, w: m8.cardW, h: m8.cardH, ratio: m8.ratio }));
ok('8 本：grid-auto-rows 已生效为 max-content', m8.gridAutoRows === 'max-content', m8.gridAutoRows);

const m13 = await p.evaluate(() => { window.__fitCards(13); return window.__rowMetrics(); });
ok('13 本：夹具生效（4 行 13 张卡）', m13.cards === 13 && m13.rowCount === 4,
  `${m13.cards} 卡 / ${m13.rowCount} 行`);
assertNoOverlap('13 本', m13);

const m20 = await p.evaluate(() => { window.__fitCards(20); return window.__rowMetrics(); });
ok('20 本：夹具生效（5 行 20 张卡）', m20.cards === 20 && m20.rowCount === 5,
  `${m20.cards} 卡 / ${m20.rowCount} 行`);
assertNoOverlap('20 本', m20);

// 清理夹具：移除 clone，确认回到原始 8 本
const mClean = await p.evaluate(() => { window.__fitCards(8); return window.__rowMetrics(); });
ok('夹具清理：DOM 恢复原始 8 张卡（notes.json 全程未改动）',
  mClean.cards === 8 && mClean.rowCount === 2, `${mClean.cards} 卡`);

console.log('\n=== ⑩ 桌面 1440×900：13 / 20 本同样不叠压 ===');
{
  const dp = await browser.newPage();
  const derrs = [];
  dp.on('pageerror', e => derrs.push(e.message));
  await dp.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2, isMobile: false, hasTouch: false });
  await dp.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1600);
  await dp.evaluate(() => document.querySelector('.nav-item[data-tab="notes"]').click());
  await sleep(900);
  await dp.evaluate(() => {
    [...document.querySelectorAll('.shelf-section')].find(s => s.textContent.includes('社会与文化'))
      .querySelector('.shelf-section-header').click();
  });
  await sleep(700);
  await dp.evaluate(ROW_HELPERS);

  const d8 = await dp.evaluate(() => { window.__fitCards(8); return window.__rowMetrics(); });
  ok('桌面 8 本：行距 12px、卡片比例 1.875 保持原样',
    d8.gapRow1to2 === 12 && Math.abs(d8.ratio - 1.875) < 0.005,
    JSON.stringify({ gap: d8.gapRow1to2, w: d8.cardW, h: d8.cardH, ratio: d8.ratio }));

  const d13 = await dp.evaluate(() => { window.__fitCards(13); return window.__rowMetrics(); });
  assertNoOverlap('桌面 13 本', d13);

  const d20 = await dp.evaluate(() => { window.__fitCards(20); return window.__rowMetrics(); });
  assertNoOverlap('桌面 20 本', d20);

  // 书架反证（桌面）
  await dp.evaluate(() => { document.getElementById('backCatBtn').click(); });
  await sleep(700);
  const dShelf = await dp.evaluate(() => {
    const row = document.querySelector('.shelf-container .book-row');
    const cs = getComputedStyle(row);
    const cards = [...row.querySelectorAll('.book-card')];
    const tops = [...new Set(cards.map(c => +c.getBoundingClientRect().top.toFixed(2)))].sort((a, b) => a - b);
    const h = +cards[0].getBoundingClientRect().height.toFixed(2);
    const w = +cards[0].getBoundingClientRect().width.toFixed(2);
    return { alignContent: cs.alignContent, ratio: +(h / w).toFixed(3), w, h,
      gap: tops.length > 1 ? +(tops[1] - tops[0] - h).toFixed(2) : null };
  });
  ok('桌面书架未被波及（align-content 仍 normal、行距 12、比例 1.875）',
    dShelf.alignContent === 'normal' && dShelf.gap <= 12 + 1 && Math.abs(dShelf.ratio - 1.875) < 0.005,
    JSON.stringify(dShelf));
  ok('桌面端无 pageerror', derrs.length === 0, derrs.slice(0, 2).join(' | '));
  await dp.close();
}

console.log('\n=== ⑪ 回归：无 JS 运行时错误 ===');
ok('无 pageerror', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const pass = results.filter(Boolean).length;
console.log(`\n===== ${pass}/${results.length} PASS =====`);
process.exit(pass === results.length ? 0 : 1);
