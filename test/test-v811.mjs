// -*- coding: utf-8 -*-
/**
 * 书阁 v8.11 —— 回顾卡分享验证
 * 运行: node test/test-v811.mjs
 */
import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
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
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});

const p = await browser.newPage();
const errors = [];
p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await p.goto(BASE, { waitUntil: 'networkidle0' });
await sleep(1800);

console.log('\n=== ① 入口位置 ===');
const entry = await p.evaluate(() => {
  const card = document.querySelector('.review-card[data-depth="0"]');
  if (!card) return { none: true };
  const btn = card.querySelector('.review-share');
  const foot = card.querySelector('.review-card-foot');
  if (!btn) return { noBtn: true };
  const b = btn.getBoundingClientRect(), f = foot.getBoundingClientRect();
  const cs = getComputedStyle(btn);
  return {
    w: +b.width.toFixed(1), h: +b.height.toFixed(1),
    inFoot: b.top >= f.top - 2 && b.bottom <= f.bottom + 2,
    rightOfDate: b.left > card.querySelector('.review-foot-date').getBoundingClientRect().right,
    leftOfOpen: b.right <= card.querySelector('.review-open').getBoundingClientRect().left + 1,
    radius: cs.borderRadius, color: cs.color,
    onScreen: b.top > 0 && b.bottom < window.innerHeight,
  };
});
ok('回顾卡上有分享键', !entry.none && !entry.noBtn, JSON.stringify(entry));
ok('分享键落在脚注内且不压字', entry.inFoot && entry.rightOfDate && entry.leftOfOpen, `inFoot=${entry.inFoot}`);
ok('分享键可见且够点', entry.w >= 24 && entry.h >= 24 && entry.onScreen, `${entry.w}×${entry.h}`);

console.log('\n=== ② 书卡侧已撤掉 ===');
await p.evaluate(() => document.querySelector('.nav-item[data-tab="notes"]').click());
await sleep(900);
const shelf = await p.evaluate(() => ({
  shareBtns: document.querySelectorAll('.book-share-btn').length,
  cards: document.querySelectorAll('.book-card').length,
}));
ok('书卡上没有分享圆点', shelf.shareBtns === 0, `bookCards=${shelf.cards} shareBtns=${shelf.shareBtns}`);
await p.evaluate(() => document.querySelector('.nav-item[data-tab="home"]').click());
await sleep(900);

console.log('\n=== ③ 点分享键出图 ===');
// 走真实指针路径：pointerdown → pointerup → click
const box = await p.evaluate(() => {
  const b = document.querySelector('.review-card[data-depth="0"] .review-share').getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
});
await p.mouse.move(box.x, box.y);
await p.mouse.down();
await p.mouse.up();
await sleep(300);
const modalOpen = await p.evaluate(() => document.querySelector('#shareModalBackdrop').classList.contains('show'));
ok('点分享键打开弹层', modalOpen);
const noNoteOpened = await p.evaluate(() => {
  const ov = document.getElementById('previewOverlay');
  return !ov || ov.classList.contains('hidden');
});
ok('点分享键没有误开笔记', noNoteOpened);

await p.waitForFunction(() => {
  const img = document.getElementById('shareModalImg');
  return img && img.src.startsWith('data:image/png') && img.naturalWidth > 0;
}, { timeout: 15000 }).catch(() => {});
const poster = await p.evaluate(() => {
  const img = document.getElementById('shareModalImg');
  return { w: img.naturalWidth, h: img.naturalHeight, shown: img.style.display !== 'none',
           bytes: img.src.length };
});
ok('生成 PNG 且尺寸正确', poster.w === 1080 && poster.h > 900, `${poster.w}×${poster.h} ${Math.round(poster.bytes/1024)}KB`);
ok('图片已显示、保存键可用', poster.shown &&
  !(await p.evaluate(() => document.getElementById('shareModalSave').disabled)), '');
const hint = await p.evaluate(() => document.getElementById('shareModalHint').textContent);
ok('提示文案针对观点图', /发给朋友|保存/.test(hint), hint);

// 落盘一张看肉眼效果
const dataUrl = await p.evaluate(() => document.getElementById('shareModalImg').src);
if (dataUrl && dataUrl.startsWith('data:image/png')) {
  writeFileSync(path.join(SHOTS, 'v811-review-poster.png'), Buffer.from(dataUrl.split(',')[1], 'base64'));
}
const model = await p.evaluate(() => {
  const card = document.querySelector('.review-card[data-depth="0"]');
  return {
    heading: card.querySelector('.review-point-title').textContent.trim(),
    quote: card.querySelector('.review-quote').textContent.trim().slice(0, 40),
    source: card.querySelector('.review-source').textContent.trim(),
  };
});
console.log('   卡片内容:', JSON.stringify(model));

await p.evaluate(() => document.getElementById('shareModalClose').click());
await sleep(300);
ok('弹层可关闭', !(await p.evaluate(() => document.querySelector('#shareModalBackdrop').classList.contains('show'))));

console.log('\n=== ④ 滑动/键盘不受影响 ===');
const swipe = await p.evaluate(() => {
  const before = document.querySelector('.review-card[data-depth="0"]').getAttribute('data-no');
  document.getElementById('reviewNext').click();
  return before;
});
await sleep(500);
const after = await p.evaluate(() => document.querySelector('.review-card[data-depth="0"]').getAttribute('data-no'));
ok('切换卡片仍正常', swipe !== after, `${swipe} -> ${after}`);

console.log('\n=== ⑤ 控制台 ===');
ok('无 console / page 错误', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const passed = results.filter(r => r.pass).length;
console.log(`\n===== ${passed}/${results.length} 通过 =====`);
process.exit(passed === results.length ? 0 : 1);
