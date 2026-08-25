/**
 * 笔记预览 APP v8.4 — 桌面「横屏/专注阅读」模式 + 移动端横屏回归 验证测试
 *
 * 验证范围:
 *   ① 桌面专注模式开/关 (#desktopLandscapeBtn → #app.focus-mode / #sidebar.hidden)
 *   ② showFocusHeader（专注态下 mousemove → .main-content .preview-header.show-focus）
 *   ③ 版本号 v8.4（<title> / 侧栏标题 / 关于页），且无 v8.3 残留
 *   ④ 移动端横屏回归（#overlayLandscapeBtn → #previewOverlay.landscape，移动分支未被改坏）
 *
 * 运行方式: node test/test_landscape_focus.mjs
 * 依赖: jsdom, fake-indexeddb（已在项目 node_modules 中）
 */

import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';

const HTML_PATH = new URL('../index.html', import.meta.url).pathname;
const NOTES_JSON_PATH = new URL('../notes.json', import.meta.url).pathname;

// ─── Test Runner ─────────────────────────────────────────────────────────

const results = [];
let testCount = 0, passCount = 0, failCount = 0;

async function test(name, fn) {
  testCount++;
  try {
    const r = fn();
    if (r && typeof r.then === 'function') await r;
    passCount++;
    results.push({ name, status: 'PASS' });
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failCount++;
    results.push({ name, status: 'FAIL', error: err.message });
    console.log(`  ❌ ${name} — ${err.message}`);
  }
}

function assert(condition, msg = 'assertion failed') {
  if (!condition) throw new Error(msg);
}
function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error(msg || `expected "${String(expected)}", got "${String(actual)}"`);
}
function assertIncludes(haystack, needle, msg) {
  if (!haystack.includes(needle)) throw new Error(msg || `expected to include "${needle}"`);
}
function assertNotIncludes(haystack, needle, msg) {
  if (haystack.includes(needle)) throw new Error(msg || `expected NOT to include "${needle}"`);
}

// ─── Setup jsdom Environment ─────────────────────────────────────────────

const htmlContent = readFileSync(HTML_PATH, 'utf-8');
const notesJsonContent = readFileSync(NOTES_JSON_PATH, 'utf-8');
const rawHtml = htmlContent; // 用于静态版本号检查

let _landscapeMode = false;
const _mqListeners = [];
function mockMatchMedia(query) {
  return {
    get matches() { return _landscapeMode; },
    media: query,
    addEventListener(event, handler) { _mqListeners.push({ event, handler, query }); },
    removeEventListener() {},
    dispatchEvent() {},
  };
}

const virtualConsole = new VirtualConsole();
const jsErrors = [];
virtualConsole.on('jsdomError', (err) => { jsErrors.push(err.message || String(err)); });

const dom = new JSDOM(htmlContent, {
  url: 'http://localhost/',
  referrer: 'http://localhost/',
  contentType: 'text/html',
  runScripts: 'dangerously',
  resources: 'usable',
  virtualConsole,
  beforeParse(window) {
    window.indexedDB = indexedDB;
    window.IDBKeyRange = IDBKeyRange;
    window.matchMedia = mockMatchMedia;
    window.fetch = async (url) => {
      if (String(url).includes('notes.json')) {
        return { ok: true, status: 200, statusText: 'OK',
          json: async () => JSON.parse(notesJsonContent), text: async () => notesJsonContent };
      }
      return { ok: false, status: 404, statusText: 'Not Found' };
    };
  },
});

const win = dom.window;
const doc = win.document;

// ─── Helpers ──────────────────────────────────────────────────────────────

function $(sel, ctx) { return (ctx || doc).querySelector(sel); }

function click(el) {
  if (!el) throw new Error('Element not found for click');
  el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// jsdom 的 innerWidth 为只读 getter，用 defineProperty 覆盖以驱动 checkMobile()。
function setViewport(width) {
  Object.defineProperty(win, 'innerWidth', { configurable: true, value: width });
  win.dispatchEvent(new win.Event('resize'));
}
async function setViewportAndWait(width) {
  setViewport(width);
  await sleep(350); // 等待 resize 防抖（200ms）后 checkMobile 生效
}

function getCssText() {
  return Array.from(doc.querySelectorAll('style')).map(s => s.textContent).join('\n');
}
function getJsText() {
  return Array.from(doc.querySelectorAll('script:not([src])')).map(s => s.textContent).join('\n');
}

function hasClass(el, cls) { return !!el && el.classList.contains(cls); }

// ─── Run All Tests ────────────────────────────────────────────────────────

async function runAllTests() {
  await sleep(1400); // 等待 IIFE 执行 + init() 异步加载完成

  console.log('\n══════════════════════════════════════════════════');
  console.log('  v8.4 桌面专注模式 + 移动端横屏回归 — 验证测试');
  console.log('══════════════════════════════════════════════════\n');

  // ================================================================
  // 0. 初始化健全性（默认 innerWidth=1024 → 桌面模式）
  // ================================================================
  console.log('── 0. 初始化 / 默认桌面模式 ──\n');

  await test('INIT-001: 应用脚本已执行（#shelfContainer 存在）', () => {
    assert($('#shelfContainer') !== null, 'shelfContainer 应存在，说明脚本已运行');
  });

  await test('INIT-002: 默认桌面模式 — #sidebar 可见（无 hidden）', () => {
    const sidebar = $('#sidebar');
    assert(sidebar !== null);
    assert(!hasClass(sidebar, 'hidden'), '桌面模式下侧栏应可见');
  });

  await test('INIT-003: 默认桌面模式 — #bottomNav 隐藏（display:none）', () => {
    const bn = $('#bottomNav');
    assert(bn !== null);
    assertEqual(bn.style.display, 'none', '桌面模式下底部导航应隐藏');
  });

  await test('INIT-004: 默认桌面模式 — #app 无 focus-mode', () => {
    const app = $('#app');
    assert(app !== null);
    assert(!hasClass(app, 'focus-mode'), '初始不应处于专注模式');
  });

  await test('INIT-005: 桌面专注按钮初始为 🔄（未激活）', () => {
    const btn = $('#desktopLandscapeBtn');
    assert(btn !== null, '#desktopLandscapeBtn 应存在');
    assertEqual(btn.textContent, '🔄', '初始图标应为 🔄');
    assert(!hasClass(btn, 'active'), '初始不应 active');
  });

  // ================================================================
  // 1. 桌面专注模式：开启
  // ================================================================
  console.log('\n── 1. 桌面专注模式：开启 ──\n');

  const app = $('#app');
  const sidebar = $('#sidebar');
  const desktopBtn = $('#desktopLandscapeBtn');
  const previewBody = $('#previewBody');
  const mainHeader = $('.main-content .preview-header');

  await test('DESK-001: 点击 #desktopLandscapeBtn 进入专注模式', () => {
    click(desktopBtn);
    assert(hasClass(app, 'focus-mode'), '#app 应获得 focus-mode 类');
  });

  await test('DESK-002: 专注态下 #sidebar 被隐藏（含 hidden 类）', () => {
    assert(hasClass(sidebar, 'hidden'), '#sidebar 应被加上 hidden 类');
  });

  await test('DESK-003: 专注态下 #sidebar 受 CSS .app.focus-mode .sidebar{display:none} 控制', () => {
    const css = getCssText();
    assertIncludes(css, '.app.focus-mode .sidebar', '应在样式表中定义 .app.focus-mode .sidebar');
    assertIncludes(css, 'display: none', '该规则应包含 display: none');
  });

  await test('DESK-004: 专注态下 #previewBody（内容区）可见', () => {
    assert(previewBody !== null, '#previewBody 应存在');
    assert(!hasClass(previewBody, 'hidden'), '#previewBody 不应被 hidden');
  });

  await test('DESK-005: 专注态下按钮变 ↩️ 且 active', () => {
    assertEqual(desktopBtn.textContent, '↩️', '按钮图标应变为 ↩️');
    assert(hasClass(desktopBtn, 'active'), '按钮应处于 active 状态');
  });

  // ================================================================
  // 2. showFocusHeader — 专注态下 mousemove 显示浮动退出钮
  // ================================================================
  console.log('\n── 2. showFocusHeader（mousemove → .show-focus） ──\n');

  await test('FOCUS-001: .main-content .preview-header 元素存在', () => {
    assert(mainHeader !== null, '.main-content .preview-header 应存在');
  });

  await test('FOCUS-002: 专注态下派发 mousemove → 该 header 获得 show-focus', () => {
    assert(hasClass(app, 'focus-mode'), '前置条件：应处于专注态');
    win.dispatchEvent(new win.MouseEvent('mousemove', { bubbles: true }));
    assert(hasClass(mainHeader, 'show-focus'), '.preview-header 应获得 show-focus 类（浮动退出钮可见）');
  });

  await test('FOCUS-003: 退出专注态后 #app 不再含 focus-mode', () => {
    click(desktopBtn); // 再次点击 → 退出
    assert(!hasClass(app, 'focus-mode'), '#app 应移除 focus-mode');
  });

  // ================================================================
  // 3. 桌面专注模式：关闭 + 还原
  // ================================================================
  console.log('\n── 3. 桌面专注模式：关闭与还原 ──\n');

  await test('DESK-006: 退出后 #sidebar 恢复显示（移除 hidden）', () => {
    assert(!hasClass(sidebar, 'hidden'), '#sidebar 应恢复显示（无 hidden 类）');
  });

  await test('DESK-007: 退出后按钮还原为 🔄 且非 active', () => {
    assertEqual(desktopBtn.textContent, '🔄', '按钮图标应还原为 🔄');
    assert(!hasClass(desktopBtn, 'active'), '按钮应移除 active');
  });

  // ================================================================
  // 4. 版本号 v8.4 校验
  // ================================================================
  console.log('\n── 4. 版本号 v8.4 校验 ──\n');

  await test('VER-001: <title> 包含 v8.4', () => {
    assertIncludes(doc.title, 'v8.4', `document.title="${doc.title}"`);
  });

  await test('VER-002: 侧栏标题包含 v8.4', () => {
    const h1 = $('#sidebar h1');
    assert(h1 !== null, '#sidebar h1 应存在');
    assertIncludes(h1.textContent, 'v8.4', `侧栏标题="${h1.textContent}"`);
  });

  await test('VER-003: 关于页 .about-version 包含 v8.4', () => {
    const av = $('.about-version');
    assert(av !== null, '.about-version 应存在');
    assertIncludes(av.textContent, 'v8.4', `.about-version="${av.textContent}"`);
  });

  await test('VER-004: 源码中无 v8.3 残留', () => {
    assertNotIncludes(rawHtml, 'v8.3', 'index.html 不应残留 v8.3');
    assertNotIncludes(getJsText(), 'v8.3', 'JS 中不应残留 v8.3');
  });

  // ================================================================
  // 5. 移动端横屏回归
  // ================================================================
  console.log('\n── 5. 移动端横屏回归 ──\n');

  await test('MOB-000: 切换到移动端（innerWidth=500 + resize）', async () => {
    await setViewportAndWait(500);
    const mc = $('#mainContent');
    // 移动分支 resize 会将 mainContent.style.display 置为 'none'
    assertEqual(mc.style.display, 'none', '移动端切换后 mainContent 应隐藏（确认 isMobile=true）');
    const bn = $('#bottomNav');
    assert(bn.style.display !== 'none', '移动端底部导航应显示');
  });

  await test('MOB-001: #overlayLandscapeBtn 仍存在', () => {
    const ob = $('#overlayLandscapeBtn');
    assert(ob !== null, '#overlayLandscapeBtn 必须存在（移动横屏入口）');
  });

  await test('MOB-002: 点击 #overlayLandscapeBtn → #previewOverlay 获得 landscape 类', () => {
    const ob = $('#overlayLandscapeBtn');
    const ov = $('#previewOverlay');
    click(ob);
    assert(hasClass(ov, 'landscape'), '#previewOverlay 应获得 landscape 类');
    // 关键：移动分支执行（而非误用桌面分支）
    assert(!hasClass(app, 'focus-mode'), '移动分支不应给 #app 加 focus-mode');
    assertEqual(ob.textContent, '↩️', '移动横屏按钮图标应变为 ↩️');
    assert(hasClass(ob, 'active'), '移动横屏按钮应 active');
    assertEqual($('#bottomNav').style.display, 'none', '移动横屏态底部导航应隐藏');
  });

  await test('MOB-003: 再次点击 → 移除 landscape 类', () => {
    const ob = $('#overlayLandscapeBtn');
    const ov = $('#previewOverlay');
    click(ob);
    assert(!hasClass(ov, 'landscape'), '#previewOverlay 应移除 landscape 类');
    assertEqual(ob.textContent, '🔄', '移动横屏按钮图标应还原为 🔄');
    assert(!hasClass(ob, 'active'), '移动横屏按钮应移除 active');
  });

  await test('MOB-004: 移动分支代码完整（previewOverlay.classList.add("landscape") 未被改坏/删除）', () => {
    const js = getJsText();
    assertIncludes(js, "previewOverlay.classList.add('landscape')", '移动横屏逻辑必须保留');
    assertIncludes(js, "STATE.isMobile", '移动/桌面分支守卫 STATE.isMobile 必须保留');
    // 桌面分支也须保留，证明两套逻辑并存、互不破坏
    assertIncludes(js, "app.classList.add('focus-mode')", '桌面专注分支必须保留');
  });

  // 还原为桌面模式，便于后续人工复跑
  await setViewportAndWait(1024);
}

// ─── 最终报告 ────────────────────────────────────────────────────────────

function printReport() {
  console.log('\n' + '='.repeat(64));
  console.log('📊 测试报告 (v8.4 桌面专注模式 + 移动端回归)');
  console.log('='.repeat(64));
  console.log(`总计: ${testCount} | ✅ 通过: ${passCount} | ❌ 失败: ${failCount}`);
  const pct = testCount > 0 ? ((passCount / testCount) * 100).toFixed(1) : '0.0';
  console.log(`通过率: ${pct}%`);

  if (jsErrors.length > 0) {
    console.log('\n⚠️  jsdom 运行期错误（供诊断，未直接判失败）:');
    jsErrors.slice(0, 10).forEach(e => console.log(`   • ${e}`));
  }

  if (failCount > 0) {
    console.log('\n❌ 失败用例:');
    results.filter(r => r.status === 'FAIL').forEach(r => console.log(`   • ${r.name}: ${r.error}`));
  }

  console.log('\n🧭 智能路由判定:');
  if (failCount === 0) {
    console.log('  → NoOne — 全部通过：桌面专注模式开/关、版本号、移动端横屏回归均验证通过');
  } else {
    console.log('  → 需人工分析失败用例（见上）。若失败源于断言/测试脚手架 → QA 自行修正；');
    console.log('    若失败源于 index.html 实现 → 路由回工程师(寇豆码) 修复。');
  }
  console.log('');
}

runAllTests()
  .then(() => { printReport(); process.exit(failCount === 0 ? 0 : 1); })
  .catch((e) => { console.error('测试运行异常:', e); process.exit(2); });
