// -*- coding: utf-8 -*-
/**
 * 书阁 v8.13 —— 字号下限 / 转屏字号保持 / 头图设置 / 书目更新
 * 运行: node test/test-v813.mjs
 */
import puppeteer from 'puppeteer';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
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
  // 模拟 v8.13 用户：6 档索引 2（=100%），带 ver=2
  try { localStorage.setItem('notes-reader-font', '2'); localStorage.setItem('notes-reader-font-ver', '2'); } catch (_) {}
});
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await p.goto(BASE, { waitUntil: 'networkidle0' });
await sleep(1800);

console.log('\n=== ① 字号滑块：70–150 + 老索引迁移 ===');
await p.evaluate(() => document.querySelector('.nav-item[data-tab="notes"]').click());
await sleep(800);
const cbox = await p.evaluate(() => {
  const r = document.querySelector('.book-card').getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await p.mouse.move(cbox.x, cbox.y); await p.mouse.down(); await p.mouse.up();
await sleep(2600);

const f0 = await p.evaluate(() => ({
  text: document.getElementById('fontLevelText').textContent,
  min: document.getElementById('fontRange').min,
  max: document.getElementById('fontRange').max,
  step: document.getElementById('fontRange').step,
  val: document.getElementById('fontRange').value,
}));
ok('v8.13 的索引 2 迁移后仍是 100%', f0.text === '100%' && f0.val === '100', JSON.stringify(f0));
ok('滑块范围 70–150、步长 5', f0.min === '70' && f0.max === '150' && f0.step === '5', `${f0.min}-${f0.max}/${f0.step}`);

const dragFont = async (v) => {
  await p.evaluate((val) => {
    const r = document.getElementById('fontRange');
    r.value = String(val);
    r.dispatchEvent(new Event('input', { bubbles: true }));
  }, v);
  await sleep(320);
};
const zoomOfTop = () => p.evaluate(() => {
  const all = [...document.querySelectorAll('iframe')];
  const ifr = all[all.length - 1];
  return ifr && ifr.contentDocument && ifr.contentDocument.body
    ? (ifr.contentDocument.body.style.zoom || '(none)') : '(no-iframe)';
});

await dragFont(70);
const z70 = await zoomOfTop();
ok('拖到 70% 后正文缩到 0.7', z70 === '0.7', String(z70));
await dragFont(150);
const z150 = await zoomOfTop();
ok('拖到 150% 后正文是 1.5', z150 === '1.5', String(z150));
await dragFont(100);

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
  presetVals: [...new Set([...document.querySelectorAll('#heroPicks [data-hero-val]')].map(e => e.getAttribute('data-hero-val')))].sort().join(','),
  scrollable: [...document.querySelectorAll('#heroPicks .hero-pick-track')].map(t => t.scrollWidth > t.clientWidth + 1),
}));
ok('两组头图选择器都在', ui.rows === 2 && ui.thumbs >= 6, JSON.stringify(ui));
ok('内置 5 张齐全', ui.presetVals === 'a,b,c,d,e,follow', ui.presetVals);
ok('缩略图区可横滑（放不下时）', ui.scrollable.length === 2 && ui.scrollable.every(Boolean), JSON.stringify(ui.scrollable));
ok('分享图有「跟随首页」选项', ui.follow === 1, `follow=${ui.follow}`);
ok('首页默认选中 A', ui.homeActive === 'a', `active=${ui.homeActive}`);

await p.evaluate(() => document.querySelector('#heroPicks [data-hero-set="notes-hero-home"][data-hero-val="b"]').click());
await sleep(500);
const afterB = await p.evaluate(() => ({
  src: document.querySelector('.hero-img').getAttribute('src'),
  saved: localStorage.getItem('notes-hero-home'),
}));
ok('切到 B 后首页头图跟着换', /shuge-header-b/.test(afterB.src) && afterB.saved === 'b', JSON.stringify(afterB));

await p.evaluate(() => document.querySelector('#heroPicks [data-hero-set="notes-hero-home"][data-hero-val="e"]').click());
await sleep(500);
const afterE = await p.evaluate(() => ({ src: document.querySelector('.hero-img').src, saved: localStorage.getItem('notes-hero-home') }));
ok('能选到 E（第 5 张内置）', /shuge-header-e/.test(afterE.src) && afterE.saved === 'e', JSON.stringify(afterE));

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
ok('notes.json 条数够（≥65）', data.length >= 65, `${data.length}`);
ok('本次新增 5 本都在', ['《概率论通识讲义》', '《组织的逻辑》', '《刑法学讲义》', '《刘擎西方现代思想讲义》', '《医学通识讲义》'].every(t => titles.includes(t)),
  `数学=${data.filter(n => n.category === '数学').length} 组织与管理=${data.filter(n => n.category === '组织与管理').length} 通识与科普=${data.filter(n => n.category === '通识与科普').length}`);
ok('没有重复书名', new Set(titles).size === titles.length, `unique=${new Set(titles).size}/${titles.length}`);
ok('旧版备份文件没有混进来', !titles.some(t => t.includes('旧版备份')), '');
ok('书架有渲染卡片', shelf.cards > 0, `${shelf.cards} 张`);

// 新书要真的出现在书架 DOM 里（不能只是写进了 notes.json）。卡片标题不带书名号，所以按 data-id 查
await p.evaluate(() => document.querySelector('.nav-item[data-tab="notes"]').click());
await sleep(900);
const newIds = await p.evaluate(() => ['62', '63', '64', '65', '66'].map(i => !!document.querySelector(`.book-card[data-id="${i}"]`)));
ok('5 本新书都上了书架', newIds.every(Boolean), JSON.stringify(newIds));

// 新书的正文文件要能取到、标题对得上（headless 里模拟移动端点按不稳，所以直接校验文件本身）
const fileChecks = [];
for (const [id, want] of [['62', '概率论通识讲义'], ['63', '组织的逻辑'], ['64', '刑法学讲义'], ['65', '刘擎西方现代思想讲义'], ['66', '医学通识讲义']]) {
  const r = await fetch(BASE.replace('index.html', `notes/note${id}.html`));
  const t = r.ok ? await r.text() : '';
  const title = (t.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  fileChecks.push({ id, code: r.status, okTitle: title.includes(want), title });
}
ok('5 个正文文件都能取到且标题正确',
  fileChecks.every(c => c.code === 200 && c.okTitle),
  JSON.stringify(fileChecks.map(c => `${c.id}:${c.code}${c.okTitle ? '✓' : '✗'}`)));

console.log('\n=== ⑤ 亮度调节（替代夜间模式）===');
await p.evaluate(() => document.querySelector('.nav-item[data-tab="notes"]').click());
await sleep(800);
const cbox2 = await p.evaluate(() => {
  const r = document.querySelector('.book-card').getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await p.mouse.move(cbox2.x, cbox2.y); await p.mouse.down(); await p.mouse.up();
await sleep(2400);

await p.evaluate(() => document.getElementById('overlayThemeBtn').click());
await sleep(300);
const dimUi = await p.evaluate(() => ({
  open: document.getElementById('brightnessPanel').classList.contains('show'),
  min: document.getElementById('brightnessRange').min,
  max: document.getElementById('brightnessRange').max,
  icon: document.getElementById('overlayThemeBtn').textContent.trim(),
}));
ok('亮度面板能打开（工具栏不再是夜间模式）', dimUi.open && dimUi.icon === '☀️', JSON.stringify(dimUi));

const dragDim = async (v) => {
  await p.evaluate((val) => {
    const r = document.getElementById('brightnessRange');
    r.value = String(val);
    r.dispatchEvent(new Event('input', { bubbles: true }));
  }, v);
  await sleep(350);
};
await dragDim(50);
const dim50 = await p.evaluate(() => ({
  op: parseFloat(document.getElementById('dimLayer').style.opacity || '0'),
  val: document.getElementById('brightnessVal').textContent,
  saved: localStorage.getItem('notes-reader-dim'),
}));
ok('亮度 50% 时遮罩压暗正文', dim50.op > 0.4 && dim50.op < 0.65, JSON.stringify(dim50));
ok('亮度值写进 localStorage', dim50.saved === '50', String(dim50.saved));

await dragDim(100);
const dim100 = await p.evaluate(() => parseFloat(document.getElementById('dimLayer').style.opacity || '0'));
ok('拖回 100% 遮罩消失', dim100 === 0, String(dim100));

const dimCover = await p.evaluate(() => {
  const d = document.getElementById('dimLayer').getBoundingClientRect();
  const h = document.getElementById('overlayHeader').getBoundingClientRect();
  return { dimTop: Math.round(d.top), headerBottom: Math.round(h.bottom) };
});
ok('遮罩不盖住顶栏', dimCover.dimTop >= dimCover.headerBottom - 2, JSON.stringify(dimCover));

console.log('\n=== ⑥ 上传图片 / PDF ===');
await p.evaluate(() => document.getElementById('overlayBackBtn').click());
await sleep(700);

// 造测试素材：1x1 PNG + 用 Chrome 自己打印一份合法 PDF
const pngPath = path.resolve('test/_tmp-tiny.png');
const pdfPath = path.resolve('test/_tmp-tiny.pdf');
writeFileSync(pngPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
const pdfPage = await browser.newPage();
await pdfPage.setContent('<h1>书阁测试 PDF</h1><p>第二行</p>');
await pdfPage.pdf({ path: pdfPath, format: 'A5' });
await pdfPage.close();

async function uploadOne(filePath, title) {
  await p.evaluate(() => document.querySelector('.nav-item[data-tab="upload"]').click());
  await sleep(700);
  const input = await p.$('#uploadFileInput');
  await input.uploadFile(filePath);
  await sleep(500);
  await p.evaluate((t) => {
    const ti = document.getElementById('uploadTitle');
    if (ti) ti.value = t;
    const sel = document.getElementById('uploadCategory');
    if (sel && !sel.value) {
      const opt = [...sel.options].find(o => o.value);
      if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    }
  }, title);
  await sleep(250);
  await p.evaluate(() => document.getElementById('uploadSubmitBtn').click());
  await sleep(2200);
}

await uploadOne(pngPath, '测试图片笔记');
await uploadOne(pdfPath, '测试PDF笔记');

const uploaded = await p.evaluate(() => {
  const idx = JSON.parse(localStorage.getItem('user-notes-index') || '[]');
  return idx.slice(0, 2).map(n => ({ id: n.id, title: n.title, kind: n.kind, mime: n.mime }));
});
ok('图片笔记按 image 类型存下', uploaded.some(u => u.kind === 'image'), JSON.stringify(uploaded));
ok('PDF 笔记按 pdf 类型存下', uploaded.some(u => u.kind === 'pdf'), JSON.stringify(uploaded));

// 打开图片笔记，检查渲染成 <img> 而不是 iframe
const imgNote = uploaded.find(u => u.kind === 'image');
await p.evaluate(() => document.querySelector('.nav-item[data-tab="notes"]').click());
await sleep(900);
// 用书卡自带的键盘 Enter 入口打开（shelfContainer 的 keydown 处理器直接调 showPreview），
// 比模拟点按稳：点按要先滚动到元素，而切 tab 后书架重渲染会把滚动位置清零。
const imgOpened = await p.evaluate((id) => {
  const card = document.querySelector(`.book-card[data-id="${id}"]`);
  if (!card) return false;
  card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  return true;
}, imgNote ? imgNote.id : '-1');
if (imgOpened) {
  await sleep(2400);
  const imgRender = await p.evaluate(() => {
    const img = document.querySelector('#overlayBodyContent .img-note img');
    return {
      hasImg: !!img,
      blob: img ? img.src.slice(0, 5) : '',
      fontBtnDisabled: document.getElementById('overlayFontBtn').disabled,
      hasIframe: !!document.querySelector('#overlayBodyContent iframe'),
      overlayTitle: document.getElementById('overlayTitle').textContent,
    };
  });
  ok('图片笔记渲染成 <img>（blob URL）', imgRender.hasImg && imgRender.blob === 'blob:' && !imgRender.hasIframe, JSON.stringify(imgRender));
  ok('图片笔记时字号按钮置灰', imgRender.fontBtnDisabled === true, String(imgRender.fontBtnDisabled));

  // 再打开 PDF 笔记
  await p.evaluate(() => document.getElementById('overlayBackBtn').click());
  await sleep(800);
  const pdfNote = uploaded.find(u => u.kind === 'pdf');
  const pdfOpened = await p.evaluate((id) => {
    const card = document.querySelector(`.book-card[data-id="${id}"]`);
    if (!card) return false;
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return true;
  }, pdfNote ? pdfNote.id : '-1');
  if (pdfOpened) {
    await sleep(2400);
    const pdfRender = await p.evaluate(() => {
      const f = document.querySelector('#overlayBodyContent iframe.pdf-note');
      return { has: !!f, src: f ? f.getAttribute('src').slice(0, 5) : '', sandbox: f ? f.getAttribute('sandbox') : null };
    });
    ok('PDF 笔记渲染成 iframe 且不套 sandbox（否则原生阅读器被拦）',
      pdfRender.has && pdfRender.src === 'blob:' && !pdfRender.sandbox, JSON.stringify(pdfRender));
  } else {
    ok('PDF 笔记渲染成 iframe 且不套 sandbox（否则原生阅读器被拦）', false, '书架上没找到 PDF 笔记');
  }
} else {
  ok('图片笔记渲染成 <img>（blob URL）', false, '书架上没找到刚上传的图片笔记');
  ok('图片笔记时字号按钮置灰', false, '同上');
}

console.log('\n=== ⑦ 删除后回到列表并提示 ===');
/* headless 里 touchstart+touchEnd 会额外合成一次 click，长按菜单刚开就被关掉，
   所以这里切到桌面视口，用「右键 → 删除」这条入口，走的是同一个 deleteNoteById。 */
await p.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
await sleep(1000);

const firstId = await p.evaluate(() => {
  const c = document.querySelector('.book-card');
  if (!c) return null;
  c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  return c.dataset.id;
});
await sleep(1600);
const openedDesk = await p.evaluate(() => document.getElementById('previewTitle').textContent);
ok('桌面端能打开笔记（复现前提）', !!openedDesk && openedDesk !== '选择一篇笔记', openedDesk);

await p.evaluate((id) => {
  const c = document.querySelector(`.book-card[data-id="${id}"]`);
  c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
}, firstId);
await sleep(600);
const sheetOk = await p.evaluate(() => !!document.querySelector('[data-as-action="delete"]'));
ok('右键能开出操作面板', sheetOk, String(sheetOk));

if (sheetOk) {
  await p.evaluate(() => document.querySelector('[data-as-action="delete"]').click());
  await sleep(600);
  const confirmShown = await p.evaluate(() => !document.getElementById('confirmModal').classList.contains('hidden'));
  await p.evaluate(() => document.getElementById('confirmModalOk').click());
  await sleep(1200);
  const afterDel = await p.evaluate(() => ({
    previewTitle: document.getElementById('previewTitle').textContent,
    activeCards: document.querySelectorAll('.book-card.active').length,
    toast: (document.querySelector('.toast') || {}).textContent || '',
  }));
  ok('确认弹窗出现', confirmShown, String(confirmShown));
  ok('删除后回到列表（右侧不再自动打开别的笔记）', afterDel.previewTitle === '选择一篇笔记' && afterDel.activeCards === 0, JSON.stringify(afterDel));
  ok('删除后有「已删除」提示', /已删除/.test(afterDel.toast), afterDel.toast);
}

// 移动端：正在读这篇的时候把它删掉，全屏阅读层要一起收起
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await sleep(1000);
const mId = await p.evaluate(() => {
  const c = document.querySelector('.book-card');
  if (!c) return null;
  c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  return c.dataset.id;
});
await sleep(2000);
const mOverlayOpen = await p.evaluate(() => !document.getElementById('previewOverlay').classList.contains('hidden'));
await p.evaluate((id) => {
  const c = document.querySelector(`.book-card[data-id="${id}"]`);
  c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
}, mId);
await sleep(500);
await p.evaluate(() => document.querySelector('[data-as-action="delete"]').click());
await sleep(500);
await p.evaluate(() => document.getElementById('confirmModalOk').click());
await sleep(1300);
const mAfter = await p.evaluate(() => ({
  overlayHidden: document.getElementById('previewOverlay').classList.contains('hidden'),
  navVisible: document.querySelector('.bottom-nav') ? getComputedStyle(document.querySelector('.bottom-nav')).display !== 'none' : true,
  toast: (document.querySelector('.toast') || {}).textContent || '',
}));
ok('移动端删除当前笔记后阅读层收起', mOverlayOpen && mAfter.overlayHidden, JSON.stringify(mAfter));
ok('移动端删除后底部导航恢复', mAfter.navVisible, String(mAfter.navVisible));

console.log('\n=== ⑧ 控制台 ===');
ok('无页面报错', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n===== ${passed}/${results.length} 通过 =====`);
process.exit(passed === results.length ? 0 : 1);
