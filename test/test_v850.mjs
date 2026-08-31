/**
 * test_v850.mjs — 书阁 v8.5.0 移动端沉浸式阅读 验收测试
 *
 * 验收 4 项（对应 team-lead 完成标准第 4 条）：
 *   ① 页面正常加载，控制台零报错
 *   ② 移动端打开笔记后 5 个新元素存在于 DOM
 *   ③ 点 #overlayFontBtn 弹出 #fontPanel，点 + 档位数字变化
 *   ④ 桌面端双栏布局无回归（sidebar + main-content 并存）
 *
 * 用法：node test/test_v850.mjs
 * 注意：必须用 http 提供服务——index.html 用 fetch('notes.json') 读数据，
 *      file:// 下会被 Chrome 拦截，测不出真实行为。
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, extname, normalize } from 'node:path';
import puppeteer from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const CHROME = '/Users/xuezhiyong/.cache/puppeteer/chrome/mac_arm-149.0.7827.22/'
  + 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

/* ---- 静态服务器 ---- */
function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const rel = normalize(urlPath === '/' ? '/index.html' : urlPath).replace(/^(\.\.[/\\])+/, '');
      const filePath = join(ROOT, rel);
      if (!filePath.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
      const buf = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
      res.end(buf);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok(server)));
}

/* ---- 迷你测试框架 ---- */
const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail: detail || '' });
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'}  ${name}${detail ? `\n         ${detail}` : ''}`);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 打开第一篇笔记：书架卡片优先，退化到侧栏列表项 */
async function openFirstNote(page) {
  const clicked = await page.evaluate(() => {
    const el = document.querySelector('.book-card')
      || document.querySelector('.note-item')
      || document.querySelector('.note-item-wrapper');
    if (!el) return null;
    el.click();
    return el.className;
  });
  await sleep(1200); // 等 iframe + IndexedDB 异步分支
  return clicked;
}

async function main() {
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  console.log(`\n服务已启动: ${base}\n${'─'.repeat(62)}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    /* ===== ① 控制台零报错（移动端视口加载 + 打开笔记全流程） ===== */
    const page = await browser.newPage();
    const errors = [];
    // favicon 是浏览器自动请求的，本项目没有 favicon，404 属测试环境噪音不算 app 缺陷
    const isNoise = t => /favicon/i.test(t);
    page.on('console', m => { if (m.type() === 'error' && !isNoise(m.text())) errors.push(`console.error: ${m.text()}`); });
    page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
    page.on('requestfailed', r => {
      if (!isNoise(r.url())) errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`);
    });
    page.on('response', r => {
      if (r.status() >= 400 && !isNoise(r.url())) errors.push(`HTTP ${r.status()}: ${r.url()}`);
    });

    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(base, { waitUntil: 'networkidle2' });
    await sleep(600);

    const opened = await openFirstNote(page);
    record('①-a 移动端可打开笔记', !!opened, opened ? `点击了 .${String(opened).split(' ')[0]}` : '找不到可点击的笔记入口');

    const overlayShown = await page.evaluate(() =>
      !document.querySelector('#previewOverlay')?.classList.contains('hidden'));
    record('①-b 预览浮层已展开', overlayShown);

    record('① 控制台零报错', errors.length === 0,
      errors.length ? errors.slice(0, 8).join('\n         ') : '无报错');

    /* ===== ② 5 个新元素存在 ===== */
    const NEW_IDS = ['overlayFontBtn', 'overlayLoading', 'edgeSwipeZone', 'landscapeExitBtn', 'fontPanel'];
    const presence = await page.evaluate(ids => {
      const out = {};
      for (const id of ids) out[id] = !!document.getElementById(id);
      return out;
    }, NEW_IDS);
    const missing = NEW_IDS.filter(id => !presence[id]);
    record('② 5 个新元素都在 DOM 中', missing.length === 0,
      missing.length ? `缺失: ${missing.map(m => '#' + m).join(', ')}` : NEW_IDS.map(i => '#' + i).join(', '));

    /* ===== ③ 字号面板交互 ===== */
    if (presence.overlayFontBtn && presence.fontPanel) {
      const isVisible = sel => page.evaluate(s => {
        const el = document.querySelector(s);
        if (!el) return false;
        const cs = getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.01;
      }, sel);

      const before = await isVisible('#fontPanel');
      await page.click('#overlayFontBtn');
      await sleep(350);
      const after = await isVisible('#fontPanel');
      record('③-a 点 #overlayFontBtn 弹出 #fontPanel', !before && after,
        `点击前可见=${before} / 点击后可见=${after}`);

      const readLevel = () => page.evaluate(() =>
        document.querySelector('#fontLevelText')?.textContent?.trim() ?? null);
      const lv0 = await readLevel();
      await page.click('#fontPlusBtn');
      await sleep(300);
      const lv1 = await readLevel();
      record('③-b 点 A+ 档位数字变化', !!lv0 && !!lv1 && lv0 !== lv1, `${lv0} → ${lv1}`);

      // 边界置灰：连点到顶应 disabled
      for (let i = 0; i < 4; i++) { await page.click('#fontPlusBtn').catch(() => {}); await sleep(120); }
      const maxDisabled = await page.evaluate(() => !!document.querySelector('#fontPlusBtn')?.disabled);
      record('③-c 到最大档位 A+ 置灰', maxDisabled, `disabled=${maxDisabled}`);
    } else {
      record('③-a 点 #overlayFontBtn 弹出 #fontPanel', false, '前置元素缺失，跳过');
      record('③-b 点 A+ 档位数字变化', false, '前置元素缺失，跳过');
      record('③-c 到最大档位 A+ 置灰', false, '前置元素缺失，跳过');
    }

    await page.close();

    /* ===== ④ 桌面端双栏无回归 ===== */
    const dpage = await browser.newPage();
    const derrors = [];
    dpage.on('pageerror', e => derrors.push(e.message));
    dpage.on('console', m => { if (m.type() === 'error') derrors.push(m.text()); });

    await dpage.setViewport({ width: 1440, height: 900 });
    await dpage.goto(base, { waitUntil: 'networkidle2' });
    await sleep(600);
    await openFirstNote(dpage);

    const layout = await dpage.evaluate(() => {
      const sb = document.querySelector('.sidebar');
      const mc = document.querySelector('.main-content');
      const ov = document.querySelector('#previewOverlay');
      const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
      const vis = el => { if (!el) return false; const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden'; };
      return {
        sidebar: box(sb), sidebarVisible: vis(sb) && !sb?.classList.contains('hidden'),
        main: box(mc), mainVisible: vis(mc),
        overlayHidden: ov ? ov.classList.contains('hidden') : true,
        iframeInMain: !!document.querySelector('.main-content iframe'),
      };
    });

    const twoCol = layout.sidebarVisible && layout.mainVisible
      && layout.sidebar?.w > 200 && layout.main?.w > 300 && layout.overlayHidden;
    record('④ 桌面端双栏布局无回归', twoCol,
      `sidebar=${JSON.stringify(layout.sidebar)} visible=${layout.sidebarVisible} | `
      + `main=${JSON.stringify(layout.main)} visible=${layout.mainVisible} | `
      + `overlay隐藏=${layout.overlayHidden} | 正文iframe=${layout.iframeInMain}`);
    record('④-b 桌面端无 JS 报错', derrors.length === 0, derrors.slice(0, 5).join(' | ') || '无报错');

    await dpage.close();
  } finally {
    await browser.close();
    server.close();
  }

  /* ---- 汇总 ---- */
  const pass = results.filter(r => r.pass).length;
  const fail = results.length - pass;
  console.log('─'.repeat(62));
  console.log(`总计 ${results.length} 项：${pass} 通过 / ${fail} 失败`);
  console.log(`BROWSER_VERIFY: ${fail === 0 ? 'YES' : 'NO'}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error('测试脚本自身异常:', e); process.exit(2); });
