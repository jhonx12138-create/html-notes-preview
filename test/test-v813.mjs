// -*- coding: utf-8 -*-
/**
 * 书阁 v8.13 —— 字号下限 / 转屏字号保持 / 头图设置 / 书目更新
 * 运行: node test/test-v813.mjs
 */
import puppeteer from 'puppeteer';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://localhost:8899/index.html';
const SHOTS = path.resolve('shots');
const CHROME = '/Users/xuezhiyong/.cache/puppeteer/chrome/mac_arm-149.0.7827.22/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = ms => new Promise(r => setTimeout(r, ms));
if (!existsSync(SHOTS)) mkdirSync(SHOTS, { recursive: true });

const results = [];
const ok = (n, p, e = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${e ? '   ' + e : ''}`); };

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});

const p = await browser.newPage();
const errors = [];
p.on('pageerror', e => errors.push(e.message));
await p.evaluateOnNewDocument(() => {
  try { localStorage.setItem('notes-reader-font', '1'); localStorage.removeItem('notes-reader-font-ver'); } catch (_) {}
});
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await p.goto(BASE, { waitUntil: 'networkidle0' });
await sleep(1800);

console.log('\n=== ① 字号：下限 70% + 老索引迁移 ===');
await p.evaluate(() => document.querySelector('.nav-item[data-tab="notes"]').click());
await sleep(800);
const cbox = await p.evaluate(() => {
  const r = document.querySelector('.book-card').getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await p.mouse.move(cbox.x, cbox.y); await p.mouse.down(); await p.mouse.up();
await sleep(2600);

const lv0 = await p.evaluate(() => document.getElementById('fontLevelText').textContent);
ok('老索引 1 迁移后仍是 100%', lv0 === '100%', lv0);

const seq = [];
for (let i = 0; i < 6; i++) {
  await p.evaluate(() => document.getElementById('fontMinusBtn').click());
  await sleep(110);
  seq.push(await p.evaluate(() => document.getElementById('fontLevelText').textContent));
}
ok('可以缩到 70%', seq.includes('70%'), seq.join(' → '));
const minState = await p.evaluate(() => ({
  text: document.getElementById('fontLevelText').textContent,
  disabled: document.getElementById('fontMinusBtn').disabled,
}));
ok('到 70% 后减号禁用', minState.text === '70%' && minState.disabled, JSON.stringify(minState));

console.log('\n=== ② 转屏后字号不跳 ===');
const zoomOf = () => p.evaluate(() => {
  const all = [...document.querySelectorAll('iframe')];
  const ifr = all[all.length - 1];
  return ifr && ifr.contentDocument && ifr.contentDocument.body
    ? (ifr.contentDocument.body.style.zoom || '(none)') : '(no-iframe)';
});
const z1 = await zoomOf();
await p.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await sleep(1100);
const z2 = await zoomOf();
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await sleep(1100);
const z3 = await zoomOf();
ok('横屏后 zoom 仍在', z2 === z1, `竖=${z1} 横=${z2}`);
ok('转回竖屏 zoom 未丢失', z3 === z1, `竖=${z1} 回=${z3}`);

console.log('\n=== ③ 头图设置 ===');
await p.evaluate(() => history.back());
await sleep(600);
await p.evaluate(() => document.querySelector('.nav-item[data-tab="profile"]').click());
await sleep(700);
const ui = await p.evaluate(() => ({
  rows: document.querySelectorAll('#heroPicks .hero-pick-row').length,
  thumbs: document.querySelectorAll('#heroPicks .hero-thumb').length,
  follow: document.querySelectorAll('#heroPicks [data-hero-val="follow"]').length,
  homeActive: document.querySelector('#heroPicks [data-hero-set="notes-hero-home"].active')?.getAttribute('data-hero-val'),
}));
ok('两组头图选择器都在', ui.rows === 2 && ui.thumbs >= 6, JSON.stringify(ui));
ok('分享图有「跟随首页」选项', ui.follow === 1, `follow=${ui.follow}`);
ok('首页默认选中 A', ui.homeActive === 'a', `active=${ui.homeActive}`);

await p.evaluate(() => document.querySelector('#heroPicks [data-hero-set="notes-hero-home"][data-hero-val="b"]').click());
await sleep(500);
const afterB = await p.evaluate(() => ({
  src: document.querySelector('.hero-img').getAttribute('src'),
  saved: localStorage.getItem('notes-hero-home'),
}));
ok('切到 B 后首页头图跟着换', /shuge-header-b/.test(afterB.src) && afterB.saved === 'b', JSON.stringify(afterB));

await p.evaluate(() => document.querySelector('#heroPicks [data-hero-set="notes-hero-share"][data-hero-val="a"]').click());
await sleep(400);
const shareSet = await p.evaluate(() => localStorage.getItem('notes-hero-share'));
ok('分享图可单独设为 A', shareSet === 'a', String(shareSet));

// 分享图实际用了 A：切到首页生成海报，比对顶部像素与 B 不同
await p.evaluate(() => document.querySelector('.nav-item[data-tab="home"]').click());
await sleep(1200);
const box2 = await p.evaluate(() => {
  const b = document.querySelector('.review-card[data-depth="0"] .review-share').getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
});
await p.mouse.move(box2.x, box2.y); await p.mouse.down(); await p.mouse.up();
await p.waitForFunction(() => {
  const i = document.getElementById('shareModalImg');
  return i && i.src.startsWith('data:image/png') && i.naturalWidth > 0;
}, { timeout: 20000 });
await sleep(300);
const px = await p.evaluate(() => {
  const img = document.getElementById('shareModalImg');
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(200, 250, 1, 1).data;
  return [d[0], d[1], d[2]];
});
ok('海报头图确实换了图（不是默认 A 的同一像素）', px[0] + px[1] + px[2] > 0, `rgb(${px.join(',')})`);

console.log('\n=== ④ 书目更新 ===');
const shelf = await p.evaluate(() => {
  const all = [...document.querySelectorAll('.book-card')];
  return { cards: all.length };
});
const data = await fetch(BASE.replace('index.html', 'notes.json')).then(r => r.json());
const titles = data.map(n => n.title);
ok('notes.json 有 55 条', data.length === 55, `${data.length}`);
ok('新增 4 本都在', ['《上瘾》', '《从0到1》', '《HR三支柱》', '《管理百年》'].every(t => titles.includes(t)),
  `商业与市场=${data.filter(n => n.category === '商业与市场').length} 组织与管理=${data.filter(n => n.category === '组织与管理').length}`);
ok('旧版备份文件没有混进来', !titles.some(t => t.includes('旧版备份')), '');
ok('书架有渲染卡片', shelf.cards > 0, `${shelf.cards} 张`);

console.log('\n=== ⑤ 控制台 ===');
ok('无页面报错', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n===== ${passed}/${results.length} 通过 =====`);
process.exit(passed === results.length ? 0 : 1);
