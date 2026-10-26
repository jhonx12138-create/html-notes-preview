// -*- coding: utf-8 -*-
/**
 * 书阁 v8.12 —— 海报头图 + 署名跟随昵称
 * 运行: node test/test-v812.mjs
 */
import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://localhost:8899/index.html';
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

/** 打开首页 → 点当前卡的分享键 → 从画布里采样像素 */
async function grabPoster(nickname, shot) {
  const p = await browser.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.evaluateOnNewDocument(nk => {
    // about:blank 阶段 origin 是 null，读 localStorage 会抛 SecurityError，吞掉即可
    try {
      if (nk === null) localStorage.removeItem('notes-nickname');
      else localStorage.setItem('notes-nickname', nk);
    } catch (_) { /* 等真实文档建立后再写 */ }
  }, nickname);
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1900);

  const box = await p.evaluate(() => {
    const b = document.querySelector('.review-card[data-depth="0"] .review-share').getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  await p.mouse.move(box.x, box.y);
  await p.mouse.down(); await p.mouse.up();
  await p.waitForFunction(() => {
    const i = document.getElementById('shareModalImg');
    return i && i.src.startsWith('data:image/png') && i.naturalWidth > 0;
  }, { timeout: 20000 });
  await sleep(400);

  const measure = await p.evaluate(() => {
    const img = document.getElementById('shareModalImg');
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const px = (x, y) => { const d = g.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]]; };
    const PAPER = [255, 251, 245];
    const diff = ([r, gg, b]) => Math.abs(r - PAPER[0]) + Math.abs(gg - PAPER[1]) + Math.abs(b - PAPER[2]);

    // ① 头图区：横向 20 个采样点，看有没有明显偏离纸色（水彩图应该偏灰绿/米）
    let imgDiff = 0, dark = 0;
    for (let i = 0; i < 20; i++) {
      const p0 = px(60 + i * 48, 250);
      imgDiff += diff(p0);
      if (p0[0] + p0[1] + p0[2] < 690) dark++;
    }
    // ② 品牌行区域（y 96..150，x 84..420）里有多少非纸色像素 = 文字
    let inkPixels = 0;
    for (let y = 96; y <= 150; y += 3) {
      for (let x = 84; x <= 420; x += 3) {
        if (diff(px(x, y)) > 90) inkPixels++;
      }
    }
    // ③ 品牌行像素指纹（用来比对「换名字后画面确实变了」）
    let fp = '';
    for (let x = 84; x <= 460; x += 4) {
      const d0 = px(x, 130);
      fp += (d0[0] + d0[1] + d0[2] < 420 ? '1' : '0');
    }
    // ④ 头图与纸面之间有没有硬边（是否有渐变过渡）
    const at = y => diff(px(540, y));
    return {
      w: img.naturalWidth, h: img.naturalHeight,
      imgDiffAvg: Math.round(imgDiff / 20), darkSamples: dark,
      inkPixels, fp,
      seam: [at(300), at(380), at(430), at(500)],
    };
  });

  if (shot) {
    const dataUrl = await p.evaluate(() => document.getElementById('shareModalImg').src);
    writeFileSync(path.join(SHOTS, shot), Buffer.from(dataUrl.split(',')[1], 'base64'));
  }
  await p.close();
  return { ...measure, errors };
}

console.log('\n=== ① 头图铺上了 ===');
const a = await grabPoster('老薛', 'v812-poster-nick.png');
ok('海报尺寸正常', a.w === 1080 && a.h > 1100, `${a.w}×${a.h}`);
ok('头部区域确实是图不是纸', a.imgDiffAvg > 6 && a.darkSamples >= 6,
  `平均色差=${a.imgDiffAvg} 偏暗采样=${a.darkSamples}/20`);
ok('头图与正文之间有过渡没有硬边', a.seam[0] > 100 && a.seam[1] < a.seam[0] && a.seam[2] < 12,
  `y300=${a.seam[0]} y380=${a.seam[1]} y430=${a.seam[2]} y500=${a.seam[3]}（应自上而下递减）`);
ok('品牌行有文字', a.inkPixels > 40, `${a.inkPixels} 个着色像素`);

console.log('\n=== ② 署名跟随昵称 ===');
const b2 = await grabPoster('薛志勇的书阁号', 'v812-poster-nick2.png');
ok('换昵称后画面确实不同', a.fp !== b2.fp, `fpA=${a.fp.slice(0, 28)}… fpB=${b2.fp.slice(0, 28)}…`);
ok('长昵称没有溢出（仍在版心内）', b2.inkPixels > 40 && b2.w === 1080, `${b2.inkPixels} 个着色像素`);

const c = await grabPoster(null, 'v812-poster-default.png');
ok('没设置昵称时回落到默认', c.fp !== a.fp, `默认 fp=${c.fp.slice(0, 28)}…`);

console.log('\n=== ③ 控制台 ===');
ok('无页面报错', a.errors.length === 0 && b2.errors.length === 0, [a.errors[0], b2.errors[0]].filter(Boolean).join(' | '));

await browser.close();
const passed = results.filter(r => r.pass).length;
console.log(`\n===== ${passed}/${results.length} 通过 =====`);
process.exit(passed === results.length ? 0 : 1);
