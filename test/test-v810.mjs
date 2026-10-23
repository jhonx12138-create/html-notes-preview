// -*- coding: utf-8 -*-
/**
 * 书阁 v8.10 —— ① 分类筛选改版验证  ② 分享图生成验证
 * 运行: node test/test-v810.mjs
 */
import puppeteer from 'puppeteer';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:8899/index.html';
const SHOTS = path.resolve('shots');
const CHROME = '/Users/xuezhiyong/.cache/puppeteer/chrome/mac_arm-149.0.7827.22/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!existsSync(SHOTS)) mkdirSync(SHOTS, { recursive: true });

const results = [];
const ok = (name, pass, extra = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? '   ' + extra : ''}`);
};

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
});

// ══════════ 移动端 ══════════
const p = await browser.newPage();
const errors = [];
p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await p.goto(BASE, { waitUntil: 'networkidle0' });
await sleep(1200);
// 初始停在「首页」，切到「笔记」Tab 才是书架 + 分类筛选
await p.evaluate(() => document.querySelector('.nav-item[data-tab="notes"]').click());
await sleep(900);

console.log('\n=== ① 分类筛选改版 ===');
ok('筛选按钮已渲染', await p.$eval('.cat-filter-btn', () => true).catch(() => false) !== false);
const btnText0 = (await p.$eval('#catFilterBtn', el => el.innerText)).replace(/\s+/g, ' ').trim();
ok('默认显示「全部分类」+ 总数', /全部分类/.test(btnText0), btnText0);
ok('旧横滑 chip 已彻底移除', (await p.$$('.category-chip')).length === 0);

// v8.10.1：篇数与筛选按钮必须同一行
const rowGeom = await p.evaluate(() => {
  const b = document.querySelector('#catFilterBtn').getBoundingClientRect();
  const t = document.querySelector('#noteCount').getBoundingClientRect();
  return {
    dy: Math.abs((b.top + b.height / 2) - (t.top + t.height / 2)),
    btnRight: Math.round(b.right), totLeft: Math.round(t.left),
    totText: document.querySelector('#noteCount').textContent.trim()
  };
});
ok('篇数与筛选按钮同一行', rowGeom.dy < 4, `中心差 ${rowGeom.dy.toFixed(1)}px`);
ok('篇数靠右且不与按钮重叠', rowGeom.totLeft > rowGeom.btnRight, `按钮右 ${rowGeom.btnRight} / 篇数左 ${rowGeom.totLeft}`);
ok('篇数文案为「共 N 篇」', /^共 \d+ 篇$/.test(rowGeom.totText), rowGeom.totText);

await p.click('#catFilterBtn');
await sleep(450);
ok('筛选面板可打开', !!(await p.$('#catSheet.show')));
ok('aria-expanded=true',
  await p.$eval('#catFilterBtn', el => el.getAttribute('aria-expanded')) === 'true');

const itemCount = (await p.$$('.cat-sheet-item')).length;
const cols = await p.$eval('.cat-sheet-grid', el =>
  getComputedStyle(el).gridTemplateColumns.split(' ').length);
ok('面板列出全部分类（≥10）', itemCount >= 10, `共 ${itemCount} 项`);
ok('面板为两列网格', cols === 2, `${cols} 列`);

await p.screenshot({ path: path.join(SHOTS, 'v810-cat-sheet.png') });

const targetCat = await p.evaluate(() => {
  const it = [...document.querySelectorAll('.cat-sheet-item')]
    .find(i => i.getAttribute('data-cat') !== '全部');
  return it ? it.getAttribute('data-cat') : null;
});
await p.evaluate(c => {
  document.querySelector(`.cat-sheet-item[data-cat="${c}"]`).click();
}, targetCat);
await sleep(550);
ok('选中后关闭面板', !(await p.$('#catSheet.show')));
const btnText1 = (await p.$eval('#catFilterBtn', el => el.innerText)).replace(/\s+/g, ' ').trim();
ok('按钮反映当前分类', btnText1.includes(targetCat), btnText1);
ok('筛选态加 has-filter', !!(await p.$('.cat-filter-btn.has-filter')));

const secs = await p.evaluate(() =>
  [...document.querySelectorAll('.shelf-section')]
    .map(s => s.querySelector('.shelf-label').innerText.trim()));
ok('书架只显示该分类', secs.length === 1 && secs[0] === targetCat, JSON.stringify(secs));

// 遮罩关闭
await p.click('#catFilterBtn'); await sleep(420);
await p.mouse.click(20, 40); await sleep(420);
ok('点遮罩可关闭', !(await p.$('#catSheet.show')));

// 切回全部
await p.click('#catFilterBtn'); await sleep(420);
await p.evaluate(() => document.querySelector('.cat-sheet-item[data-cat="全部"]').click());
await sleep(520);
ok('可切回「全部」', (await p.$eval('#catFilterBtn', el => el.innerText)).includes('全部分类'));

console.log('\n=== ② 书卡海报（入口已收进操作面板）===');
const shareN = (await p.$$('.book-share-btn')).length;
ok('书卡上不再常驻分享圆点', shareN === 0, `${shareN} 个`);

// v8.11：书卡分享入口从「封面右上角小圆点」收进长按/右键操作面板。
// 移动端长按等价于桌面右键，测试里直接派发 contextmenu（同一条 openActionSheet 路径）。
await p.evaluate(() => {
  const card = document.querySelector('.book-card');
  card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
});
await sleep(450);
ok('操作面板含「生成分享图」', !!(await p.$('[data-as-action="share"]')));
await p.evaluate(() => document.querySelector('[data-as-action="share"]').click());
await sleep(400);
ok('分享弹层打开', !!(await p.$('#shareModalBackdrop.show')));

await p.waitForFunction(() => {
  const img = document.getElementById('shareModalImg');
  return img && img.src.startsWith('data:image/png') && img.naturalWidth > 0;
}, { timeout: 25000 });
await sleep(450);

const info = await p.evaluate(() => {
  const i = document.getElementById('shareModalImg');
  return { w: i.naturalWidth, h: i.naturalHeight, kb: Math.round(i.src.length / 1365) };
});
ok('生成 PNG 成功', info.w === 1080 && info.h > 900, `${info.w}×${info.h}，约 ${info.kb}KB`);
ok('保存按钮已启用', await p.$eval('#shareModalSave', el => !el.disabled));

// v8.10.1：顶部必须有书封色带（头图），而不是一片纸色
const head = await p.evaluate(async () => {
  const img = document.getElementById('shareModalImg');
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const px = (x, y) => { const d = g.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]]; };
  const isPaper = ([r, gg, b]) => r > 246 && gg > 240 && b > 228;
  // 沿中线向下找第一条纸色行 = 色带下沿
  let bandH = 0;
  for (let y = 0; y < img.naturalHeight; y += 2) {
    if (isPaper(px(540, y))) { bandH = y; break; }
  }
  return {
    top: px(540, 30), spine: px(8, 200), body: px(300, 200),
    bandH, H: img.naturalHeight
  };
});
const lum = ([r, g, b]) => r + g + b;
ok('顶部有头图色带（非纸色）', lum(head.top) < 560, `rgb(${head.top.join(',')})`);
ok('头图色带够高（≥300px）', head.bandH >= 300, `色带高 ${head.bandH}px / 全图 ${head.H}px`);
ok('色带左侧有独立书脊', head.spine.join() !== head.body.join(),
  `书脊 rgb(${head.spine.join(',')}) vs 封面 rgb(${head.body.join(',')})`);

await p.screenshot({ path: path.join(SHOTS, 'v810-share-modal.png') });
const dataUrl = await p.evaluate(() => document.getElementById('shareModalImg').src);
writeFileSync(path.join(SHOTS, 'v810-poster.png'), Buffer.from(dataUrl.split(',')[1], 'base64'));

await p.click('#shareModalClose'); await sleep(320);
ok('弹层可关闭', !(await p.$('#shareModalBackdrop.show')));

// ══════════ 桌面端 ══════════
console.log('\n=== ③ 桌面端 ===');
const d = await browser.newPage();
await d.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
await d.goto(BASE, { waitUntil: 'networkidle0' });
await sleep(1300);
await d.evaluate(() => document.querySelector('.tab-btn[data-tab="notes"]').click());
await sleep(900);

const chips = await d.evaluate(() => {
  const card = document.querySelector('.book-card');
  if (!card) return { none: true };
  return {
    share: card.querySelectorAll('.book-share-btn').length,
    menu: card.querySelectorAll('.book-card-menu').length,
  };
});
ok('桌面书卡只剩一个 ⋯ 角标', !chips.none && chips.share === 0 && chips.menu === 1, JSON.stringify(chips));

// 桌面右键 → 操作面板 → 生成分享图（和移动端长按同一条 openActionSheet 路径）
await d.evaluate(() => {
  const card = document.querySelector('.book-card');
  card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
});
await sleep(420);
const sheetOpen = await d.evaluate(() => !document.getElementById('actionSheetBackdrop').classList.contains('hidden'));
ok('桌面右键能开操作面板', sheetOpen);
await d.evaluate(() => document.querySelector('[data-as-action="cancel"]').click());
await sleep(320);

await d.hover('.book-card');
await sleep(400);
await d.screenshot({ path: path.join(SHOTS, 'v810-desktop-card.png'), clip: { x: 0, y: 150, width: 520, height: 420 } });
await d.close();

console.log('\n=== ④ 控制台 ===');
ok('无 console / page 错误', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const fail = results.filter(r => !r.pass).length;
console.log(`\n===== ${results.length - fail}/${results.length} 通过 =====`);
if (fail) process.exit(1);
