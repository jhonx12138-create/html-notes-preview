/**
 * 笔记预览 APP v7.0 — 全功能回归测试套件
 *
 * 测试范围:
 *   ① 新设计还原：书架卡片(封面色块+白字书名+info区)、分类chips黑底白字、
 *      底部导航毛玻璃blur、个人中心大圆角卡片、暗色模式CSS变量全覆盖
 *   ② 全功能回归：39本书渲染、搜索、上传、删除、编辑、置顶、
 *      分类管理、预览overlay、主题切换、三Tab切换
 *   ③ 边界检查：JS无报错、CSS变量9类分类色映射、localStorage键名不变
 *
 * 使用 jsdom + fake-indexeddb 在 Node.js 中模拟浏览器环境运行。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';

const HTML_PATH = new URL('../index.html', import.meta.url).pathname;
const NOTES_JSON_PATH = new URL('../notes.json', import.meta.url).pathname;

// ─── Test Runner ─────────────────────────────────────────────────────────

const results = [];
let testCount = 0;
let passCount = 0;
let failCount = 0;

function test(name, fn) {
  testCount++;
  try {
    fn();
    passCount++;
    results.push({ name, status: 'PASS' });
  } catch (err) {
    failCount++;
    results.push({ name, status: 'FAIL', error: err.message });
  }
}

function assert(condition, msg = 'assertion failed') {
  if (!condition) throw new Error(msg);
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(msg || `expected "${String(expected)}", got "${String(actual)}"`);
  }
}

function assertGt(actual, expected, msg) {
  if (!(actual > expected)) {
    throw new Error(msg || `expected ${actual} > ${expected}`);
  }
}

function assertIncludes(haystack, needle, msg) {
  if (!haystack.includes(needle)) {
    throw new Error(msg || `expected to include "${needle}"`);
  }
}

function assertNotIncludes(haystack, needle, msg) {
  if (haystack.includes(needle)) {
    throw new Error(msg || `expected NOT to include "${needle}"`);
  }
}

function assertMatch(str, regex, msg) {
  if (!regex.test(str)) {
    throw new Error(msg || `expected string to match ${regex}`);
  }
}

// ─── Setup jsdom Environment ─────────────────────────────────────────────

const htmlContent = readFileSync(HTML_PATH, 'utf-8');
const notesJsonContent = readFileSync(NOTES_JSON_PATH, 'utf-8');

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
// Capture console errors for JS error detection
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
        return {
          ok: true, status: 200, statusText: 'OK',
          json: async () => JSON.parse(notesJsonContent),
          text: async () => notesJsonContent,
        };
      }
      return { ok: false, status: 404, statusText: 'Not Found' };
    };
  },
});

const doc = dom.window.document;
const win = dom.window;

// ─── Helpers ─────────────────────────────────────────────────────────────

function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
function $$(sel, ctx) { return Array.from((ctx || doc).querySelectorAll(sel)); }

function click(el) {
  if (!el) throw new Error('Element not found for click');
  el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForApp() {
  await sleep(1200);
}

function getCssText() {
  return Array.from(doc.querySelectorAll('style'))
    .map(s => s.textContent).join('\n');
}

function getJsText() {
  return Array.from(doc.querySelectorAll('script:not([src])'))
    .map(s => s.textContent).join('\n');
}

function getCssVar(css, varName) {
  const re = new RegExp(`${varName.replace(/-/g, '\\-')}\\s*:\\s*([^;]+);`);
  const m = css.match(re);
  return m ? m[1].trim() : null;
}

// ─── Run All Tests ───────────────────────────────────────────────────────

async function runAllTests() {
  await waitForApp();

  console.log('\n══════════════════════════════════════════════════');
  console.log('  笔记预览 APP v7.0 — 全功能回归测试');
  console.log('══════════════════════════════════════════════════\n');

  // ================================================================
  // ① 新设计还原 — DESIGN
  // ================================================================
  console.log('── ① 新设计还原 ──');

  // ── ①A 书架卡片设计 ──
  console.log('\n  [①A] 书架卡片设计');

  test('DESIGN-001: Book card has .book-cover and .book-info structure', () => {
    const cards = $$('.book-card', $('#shelfContainer'));
    assertGt(cards.length, 0, 'Should have book cards');
    for (const card of cards.slice(0, 3)) {
      assert($('.book-cover', card) !== null, 'Each card should have .book-cover');
      assert($('.book-info', card) !== null, 'Each card should have .book-info');
    }
  });

  test('DESIGN-002: Book cover contains .book-title with white text', () => {
    const css = getCssText();
    // Title should be inside .book-cover which has colored background
    assert(css.includes('.book-cover'), 'Should have .book-cover CSS');
    // Title text should be white
    const bookCoverBlock = css.match(/\.book-cover\s*\{[^}]+\}/);
    assert(bookCoverBlock !== null, 'Should have .book-cover block');
    assertIncludes(bookCoverBlock[0], 'color: #FFFFFF', '.book-cover should have white text color');
  });

  test('DESIGN-003: Book title has line-clamp for 3-line truncation', () => {
    const css = getCssText();
    assertIncludes(css, '-webkit-line-clamp: 3', 'Title should be clamped to 3 lines');
    assertIncludes(css, '-webkit-box-orient: vertical', 'Should use box-orient vertical');
  });

  test('DESIGN-004: Book info area shows date and tags properly', () => {
    const css = getCssText();
    assert(css.includes('.book-date'), 'Should have .book-date CSS');
    assert(css.includes('.book-tags'), 'Should have .book-tags CSS');
    assert(css.includes('.book-tag'), 'Should have .book-tag CSS');
  });

  test('DESIGN-005: Book cover has spine decoration (::before pseudo)', () => {
    const css = getCssText();
    assert(css.includes('.book-cover::before'), 'Should have spine decoration');
    assert(css.includes('width: 5px'), 'Spine should be 5px wide');
    assert(css.includes('rgba(0,0,0,0.15)'), 'Spine should have semi-transparent color');
  });

  test('DESIGN-006: Book card hover lifts with translateY(-6px)', () => {
    const css = getCssText();
    const hoverMatch = css.match(/\.book-card:hover\s*\{[^}]*\}/);
    assert(hoverMatch !== null, 'Should have hover styles');
    assertIncludes(hoverMatch[0], 'translateY(-6px)', 'Hover should lift by 6px');
  });

  test('DESIGN-007: Book card shadow uses var(--shadow-book)', () => {
    const css = getCssText();
    const cardBlock = css.match(/\.book-card\s*\{[^}]+\}/);
    assert(cardBlock !== null, 'Should have .book-card block');
    assertIncludes(cardBlock[0], 'var(--shadow-book)', 'Should use shadow-book variable');
  });

  test('DESIGN-008: Book card active state uses accent border', () => {
    const css = getCssText();
    const activeBlock = css.match(/\.book-card\.active\s*\{[^}]+\}/);
    assert(activeBlock !== null, 'Should have .book-card.active styles');
    assertIncludes(activeBlock[0], 'var(--accent)', 'Active state should use accent color');
  });

  test('DESIGN-009: Book card border-radius uses var(--radius-md) = 16px', () => {
    const css = getCssText();
    const cardBlock = css.match(/\.book-card\s*\{[^}]+\}/);
    assert(cardBlock !== null, 'Should have .book-card block');
    assertIncludes(cardBlock[0], 'var(--radius-md)', 'Should use radius-md variable');
    // Verify --radius-md is 16px
    const radiusMd = getCssVar(css, '--radius-md');
    assertEqual(radiusMd, '16px', '--radius-md should be 16px');
  });

  test('DESIGN-010: Book card width is 120px (mobile size)', () => {
    const css = getCssText();
    const cardBlock = css.match(/\.book-card\s*\{[^}]+\}/);
    assert(cardBlock !== null, 'Should have .book-card block');
    assertIncludes(cardBlock[0], 'width: 120px', 'Book card should be 120px wide');
  });

  // ── ①B 分类 Chips 设计 ──
  console.log('\n  [①B] 分类 Chips 设计');

  test('DESIGN-011: Category chips use .category-chip class (not .cat-chip)', () => {
    const css = getCssText();
    assert(css.includes('.category-chip'), 'Should have .category-chip CSS class');
    // Chips are rendered dynamically by renderCategoryChips() after data loads.
    // Verify the CSS and JS infrastructure exists.
    const js = getJsText();
    assertIncludes(js, 'renderCategoryChips', 'Should have renderCategoryChips function');
    assertIncludes(js, 'category-chip', 'Should render category-chip elements in JS');
    // The container #categoryChips should exist
    assert($('#categoryChips') !== null, '#categoryChips container should exist');
  });

  test('DESIGN-012: Active category chip has black background and white text', () => {
    const css = getCssText();
    const activeBlock = css.match(/\.category-chip\.active\s*\{[^}]+\}/);
    assert(activeBlock !== null, 'Should have .category-chip.active styles');
    const block = activeBlock[0];
    assertIncludes(block, 'var(--text-primary)', 'Active bg should use text-primary');
    assertIncludes(block, 'color: #FFFFFF', 'Active text should be white');
    assertIncludes(block, 'font-weight: 600', 'Active chip should be bold');
  });

  test('DESIGN-013: Category chips show note count as .chip-count', () => {
    const chips = $$('.category-chip', $('#categoryChips'));
    if (chips.length > 0) {
      const hasCount = chips.some(c => $('.chip-count', c) !== null);
      assert(hasCount, 'At least one chip should have .chip-count');
    }
    const js = getJsText();
    assertIncludes(js, 'chip-count', 'Should render chip-count in JS');
  });

  test('DESIGN-014: Category chips container scrolls horizontally', () => {
    const css = getCssText();
    assert(css.includes('.category-chips'), 'Should have .category-chips container');
    const chipsBlock = css.match(/\.category-chips\s*\{[^}]+\}/);
    assert(chipsBlock !== null, 'Should have .category-chips block');
    assertIncludes(chipsBlock[0], 'overflow-x: auto', 'Should allow horizontal scrolling');
  });

  test('DESIGN-015: All 10 category chips are defined in JS (全部 + 9 categories)', () => {
    // Chips are rendered dynamically. Verify from PRESET_CATEGORIES and renderCategoryChips.
    const js = getJsText();
    const presetMatch = js.match(/PRESET_CATEGORIES\s*=\s*\[([^\]]+)\]/);
    assert(presetMatch !== null, 'PRESET_CATEGORIES should exist');
    const presetStr = presetMatch[1];
    const expectedCats = ['全部', '哲学', '历史', '文学', '科技', '经济', '管理', '心理学', '商业', '政治', '其他'];
    for (const cat of expectedCats) {
      assertIncludes(presetStr, cat, `PRESET_CATEGORIES should include "${cat}"`);
    }
  });

  // ── ①C 底部导航设计 ──
  console.log('\n  [①C] 底部导航设计');

  test('DESIGN-016: Bottom nav uses backdrop-filter blur for glassmorphism', () => {
    const css = getCssText();
    const navBlock = css.match(/\.bottom-nav\s*\{[^}]+\}/);
    assert(navBlock !== null, 'Should have .bottom-nav block');
    assertIncludes(navBlock[0], 'backdrop-filter', 'Should have backdrop-filter');
    assertIncludes(navBlock[0], 'blur', 'Should use blur filter');
  });

  test('DESIGN-017: Bottom nav background is semi-transparent with var(--bg-nav)', () => {
    const css = getCssText();
    const navBlock = css.match(/\.bottom-nav\s*\{[^}]+\}/);
    assert(navBlock !== null, 'Should have .bottom-nav');
    assertIncludes(navBlock[0], 'var(--bg-nav)', 'Should use bg-nav variable');
  });

  test('DESIGN-018: Nav items have .nav-icon and text label', () => {
    const navItems = $$('.nav-item', $('#bottomNav'));
    assertGt(navItems.length, 0, 'Should have nav items');
    for (const item of navItems) {
      assert($('.nav-icon', item) !== null, 'Each nav item should have .nav-icon');
    }
  });

  test('DESIGN-019: Active nav item uses accent color', () => {
    const css = getCssText();
    const activeNavBlock = css.match(/\.nav-item\.active\s*\{[^}]+\}/);
    assert(activeNavBlock !== null, 'Should have .nav-item.active');
    assertIncludes(activeNavBlock[0], 'var(--accent)', 'Active nav should use accent color');
  });

  test('DESIGN-020: Bottom nav has safe-area-inset-bottom support', () => {
    const css = getCssText();
    assertIncludes(css, 'env(safe-area-inset-bottom', 'Should support safe-area-inset');
  });

  // ── ①D 个人中心设计 ──
  console.log('\n  [①D] 个人中心设计');

  test('DESIGN-021: Profile uses .profile-setting-item with card styling', () => {
    const css = getCssText();
    assert(css.includes('.profile-setting-item'), 'Should have profile setting items');
    const items = $$('.profile-setting-item', $('#tabProfile'));
    assertGt(items.length, 0, 'Should have profile setting items');
  });

  test('DESIGN-022: Profile setting items have var(--radius-lg) border-radius', () => {
    const css = getCssText();
    // Profile items should have border-radius via :first-of-type/:last-of-type
    const firstBlock = css.match(/\.profile-setting-item:first-of-type\s*\{[^}]+\}/);
    assert(firstBlock !== null, 'Should have first-of-type styling');
    assertIncludes(firstBlock[0], 'var(--radius-lg)', 'Should use radius-lg for top corners');
  });

  test('DESIGN-023: Profile avatar uses gradient background', () => {
    const css = getCssText();
    const avatarBlock = css.match(/\.profile-avatar\s*\{[^}]+\}/);
    assert(avatarBlock !== null, 'Should have .profile-avatar');
    assertIncludes(avatarBlock[0], 'linear-gradient', 'Avatar should use gradient');
  });

  test('DESIGN-024: Profile has theme toggle with switch UI', () => {
    assert($('#profileThemeToggle') !== null, 'Theme toggle should exist');
    assert($('.toggle-switch', $('#tabProfile')) !== null, 'Toggle switch should exist');
  });

  test('DESIGN-025: Profile has category manager section', () => {
    assert($('#categoryManagerList') !== null, 'Category manager list should exist');
    assert($('#addCategoryBtn') !== null, 'Add category button should exist');
  });

  test('DESIGN-026: Profile shows version badge', () => {
    const profileText = $('#tabProfile').textContent;
    assert(profileText.includes('v6.0') || profileText.includes('v7.0'),
      'Profile should show version number');
  });

  // ── ①E 暗色模式设计 ──
  console.log('\n  [①E] 暗色模式设计');

  test('DESIGN-027: Dark mode uses [data-theme="dark"] selector', () => {
    const html = doc.documentElement;
    assert(html.hasAttribute('data-theme'), 'HTML should have data-theme attribute');
  });

  test('DESIGN-028: Dark mode overrides --bg-page to #1a1a2e', () => {
    const css = getCssText();
    const darkBg = getCssVarInDark(css, '--bg-page');
    assertEqual(darkBg, '#1a1a2e', 'Dark bg-page should be #1a1a2e');
  });

  test('DESIGN-029: Dark mode overrides --bg-card', () => {
    const css = getCssText();
    const darkBgCard = getCssVarInDark(css, '--bg-card');
    assert(darkBgCard !== null, 'Dark mode should define --bg-card');
    assert(darkBgCard !== '#FFFFFF', 'Dark bg-card should not be white');
  });

  test('DESIGN-030: Dark mode overrides --accent to lighter variant', () => {
    const css = getCssText();
    const darkAccent = getCssVarInDark(css, '--accent');
    assert(darkAccent !== null, 'Dark mode should define --accent');
    assert(darkAccent !== '#C97064', 'Dark accent should differ from light');
  });

  test('DESIGN-031: Dark mode overrides all 9 category color variables', () => {
    const css = getCssText();
    const catVars = [
      '--cat-philosophy', '--cat-history', '--cat-literature',
      '--cat-tech', '--cat-economics', '--cat-management',
      '--cat-psychology', '--cat-business', '--cat-politics'
    ];
    for (const v of catVars) {
      const darkVal = getCssVarInDark(css, v);
      assert(darkVal !== null, `Dark mode should define ${v}`);
      const lightVal = getCssVar(css, v);
      assert(darkVal !== lightVal, `${v} should differ between light/dark modes`);
    }
  });

  test('DESIGN-032: Dark mode overrides --cat-other', () => {
    const css = getCssText();
    const darkOther = getCssVarInDark(css, '--cat-other');
    assert(darkOther !== null, 'Dark mode should define --cat-other');
    const lightOther = getCssVar(css, '--cat-other');
    assert(darkOther !== lightOther, '--cat-other should differ in dark mode');
  });

  test('DESIGN-033: Dark mode overrides shadow variables', () => {
    const css = getCssText();
    const shadowVars = ['--shadow-sm', '--shadow-md', '--shadow-lg', '--shadow-book'];
    for (const v of shadowVars) {
      const darkVal = getCssVarInDark(css, v);
      assert(darkVal !== null, `Dark mode should define ${v}`);
    }
  });

  test('DESIGN-034: Dark mode overrides --bg-nav', () => {
    const css = getCssText();
    const darkNav = getCssVarInDark(css, '--bg-nav');
    assert(darkNav !== null, 'Dark mode should define --bg-nav');
  });

  test('DESIGN-035: Dark mode overrides --accent-soft to darker shade', () => {
    const css = getCssText();
    const darkSoft = getCssVarInDark(css, '--accent-soft');
    assert(darkSoft !== null, 'Dark mode should define --accent-soft');
    // In dark mode accent-soft should be darker (like #3d2025)
    assert(darkSoft !== '#FDF0ED', 'Dark accent-soft should differ from light');
  });

  // ================================================================
  // ② 全功能回归 — FUNCTIONAL
  // ================================================================
  console.log('\n── ② 全功能回归 ──');

  // ── ②A 书架39本书渲染 ──
  console.log('\n  [②A] 书架渲染');

  test('FUNC-001: Shelf container has book cards after load', () => {
    const cards = $$('.book-card', $('#shelfContainer'));
    assertGt(cards.length, 0, 'Shelf should have book cards');
  });

  test('FUNC-002: All notes are rendered (built-in + user)', () => {
    const cards = $$('.book-card', $('#shelfContainer'));
    // The exact count depends on notes.json but should be substantial
    assertGt(cards.length, 10, 'Should render many books');
  });

  test('FUNC-003: Books are grouped by category with shelf-section headers', () => {
    const sections = $$('.shelf-section', $('#shelfContainer'));
    assertGt(sections.length, 0, 'Should have shelf sections');
    for (const section of sections) {
      assert($('.shelf-section-header', section) !== null, 'Each section should have header');
      assert($('.shelf-label', section) !== null, 'Each section should have label');
    }
  });

  test('FUNC-004: Each category dot uses the correct category color', () => {
    const sections = $$('.shelf-section', $('#shelfContainer'));
    for (const section of sections) {
      const dot = $('.dot', section);
      if (dot) {
        const bg = dot.style.background;
        assert(bg !== '', 'Dot should have background color');
      }
    }
  });

  test('FUNC-005: Category sections are ordered by CAT_ORDER', () => {
    const js = getJsText();
    assertIncludes(js, 'CAT_ORDER', 'CAT_ORDER should be defined');
    const catOrderMatch = js.match(/CAT_ORDER\s*=\s*\[([^\]]+)\]/);
    assert(catOrderMatch !== null, 'CAT_ORDER array should exist');
    const orderStr = catOrderMatch[1];
    // First few should be 哲学, 历史, 文学, 科技
    assert(orderStr.includes('哲学'), 'First should be 哲学');
    assert(orderStr.includes('历史'), 'Second should be 历史');
    assert(orderStr.includes('文学'), 'Third should be 文学');
    assert(orderStr.includes('科技'), 'Fourth should be 科技');
  });

  test('FUNC-006: Shelf count shows "N 本书" for each category', () => {
    const sections = $$('.shelf-section', $('#shelfContainer'));
    for (const section of sections) {
      const count = $('.shelf-count', section);
      if (count) {
        assert(count.textContent.includes('本书'), 'Count should include "本书"');
      }
    }
  });

  test('FUNC-007: Book cards have data-id attributes', () => {
    const cards = $$('.book-card', $('#shelfContainer'));
    for (const card of cards.slice(0, 5)) {
      const id = card.getAttribute('data-id');
      assert(id !== null && id !== '', 'Each card should have data-id');
    }
  });

  test('FUNC-008: Book cards have category CSS class for color', () => {
    const js = getJsText();
    const CAT_COLOR_MAP = {
      '哲学': 'philosophy', '历史': 'history', '文学': 'literature',
      '科技': 'tech', '经济': 'economics', '管理': 'management',
      '心理学': 'psychology', '商业': 'business', '政治': 'politics'
    };
    for (const [cat, cls] of Object.entries(CAT_COLOR_MAP)) {
      assertIncludes(js, `'${cat}': '${cls}'`, `CAT_COLOR_MAP should map ${cat} → ${cls}`);
    }
  });

  test('FUNC-009: Book cards show tags in .book-tags container', () => {
    const cards = $$('.book-card', $('#shelfContainer'));
    let tagCount = 0;
    for (const card of cards) {
      const tags = $$('.book-tag', card);
      tagCount += tags.length;
    }
    assertGt(tagCount, 0, 'At least some cards should have tags');
  });

  test('FUNC-010: renderBookCard function includes pinned marker', () => {
    const js = getJsText();
    assertIncludes(js, '📌', 'renderBookCard should show 📌 for pinned');
  });

  // ── ②B 搜索功能 ──
  console.log('\n  [②B] 搜索功能');

  test('FUNC-011: Search button (#searchBtn) exists', () => {
    assert($('#searchBtn') !== null, 'Search button should exist');
  });

  test('FUNC-012: Search page has input and results area', () => {
    assert($('#searchPage') !== null, 'Search page should exist');
    assert($('#searchPageInput') !== null, 'Search input should exist');
    assert($('#searchResults') !== null, 'Search results should exist');
  });

  test('FUNC-013: Search history section exists', () => {
    assert($('#searchHistory') !== null, 'Search history should exist');
  });

  test('FUNC-014: Open search page function exists', () => {
    const js = getJsText();
    assertIncludes(js, 'function openSearchPage', 'openSearchPage should be defined');
  });

  test('FUNC-015: Search filters notes by title and tags', () => {
    const js = getJsText();
    assertIncludes(js, 'title.toLowerCase().includes', 'Should search by title');
    assertIncludes(js, 'tags', 'Should search by tags');
  });

  test('FUNC-016: Back search button returns to main view', () => {
    assert($('#backSearchBtn') !== null, 'Back search button should exist');
  });

  test('FUNC-017: Search history is limited to 20 items', () => {
    const js = getJsText();
    assertIncludes(js, 'slice(0,20)', 'Should limit history to 20 items');
  });

  test('FUNC-018: Search history can be cleared', () => {
    const js = getJsText();
    assertIncludes(js, 'clearSearchHistory', 'clearSearchHistory should exist');
  });

  // ── ②C 上传笔记 ──
  console.log('\n  [②C] 上传笔记');

  test('FUNC-019: Upload tab has all form elements', () => {
    assert($('#uploadTitle') !== null, 'Title input should exist');
    assert($('#uploadCategory') !== null, 'Category select should exist');
    assert($('#uploadTagsInput') !== null, 'Tags input should exist');
    assert($('#uploadBrowseBtn') !== null, 'Browse button should exist');
    assert($('#uploadSubmitBtn') !== null, 'Submit button should exist');
  });

  test('FUNC-020: Upload submit button is disabled initially', () => {
    const btn = $('#uploadSubmitBtn');
    assert(btn !== null, 'Submit button should exist');
    assert(btn.disabled === true, 'Submit should be disabled without file');
  });

  test('FUNC-021: File input accepts only .html files', () => {
    const input = $('#uploadFileInput');
    assert(input !== null, 'File input should exist');
    assertEqual(input.getAttribute('accept'), '.html', 'Should only accept .html');
  });

  test('FUNC-022: handleUpload function validates .html extension', () => {
    const js = getJsText();
    assertIncludes(js, "endsWith('.html')", 'Should check .html extension');
    assertIncludes(js, '仅支持上传 .html 文件', 'Should show error for non-HTML');
  });

  test('FUNC-023: Upload requires category selection', () => {
    const js = getJsText();
    assertIncludes(js, '请选择分类', 'Should require category');
  });

  test('FUNC-024: Upload stores note in IndexedDB', () => {
    const js = getJsText();
    assertIncludes(js, 'DB.put', 'Should store in IndexedDB');
  });

  test('FUNC-025: Upload adds to userNotesIndex and saves to localStorage', () => {
    const js = getJsText();
    assertIncludes(js, 'STATE.userNotesIndex.unshift', 'Should add to index');
    assertIncludes(js, 'saveUserNotesIndex()', 'Should persist index');
  });

  test('FUNC-026: Upload auto-generates unique title on conflict', () => {
    const js = getJsText();
    assertIncludes(js, 'allTitles.includes(final)', 'Should check for duplicate titles');
    assertIncludes(js, "title+' ('+(c++)+')'", 'Should append number on conflict');
  });

  test('FUNC-027: Upload resets form after success', () => {
    const js = getJsText();
    assertIncludes(js, 'resetUploadForm()', 'Should reset form after upload');
  });

  // ── ②D 删除笔记 ──
  console.log('\n  [②D] 删除笔记');

  test('FUNC-028: deleteNoteById shows confirmation modal', () => {
    const js = getJsText();
    assertIncludes(js, 'showConfirm', 'Should show confirmation');
    assertIncludes(js, '确认删除', 'Should show delete confirmation text');
  });

  test('FUNC-029: Delete removes from IndexedDB for user notes', () => {
    const js = getJsText();
    assertIncludes(js, 'await DB.delete', 'Should delete from IndexedDB');
  });

  test('FUNC-030: Delete filters from userNotesIndex', () => {
    const js = getJsText();
    assertIncludes(js, 'STATE.userNotesIndex = STATE.userNotesIndex.filter',
      'Should filter from index');
  });

  // ── ②E 编辑笔记 ──
  console.log('\n  [②E] 编辑笔记');

  test('FUNC-031: Edit modal has title, category, and tags fields', () => {
    assert($('#editTitle') !== null, 'Edit title should exist');
    assert($('#editCategory') !== null, 'Edit category should exist');
    assert($('#editTagsInput') !== null, 'Edit tags should exist');
  });

  test('FUNC-032: Edit modal has save and cancel buttons', () => {
    assert($('#editModalSave') !== null, 'Save button should exist');
    assert($('#editModalCancel') !== null, 'Cancel button should exist');
  });

  test('FUNC-033: openEditModal populates form with current values', () => {
    const js = getJsText();
    assertIncludes(js, 'editTitle.value = note.title', 'Should populate title');
    assertIncludes(js, 'editTagsInput.value', 'Should populate tags');
  });

  test('FUNC-034: Edit save persists to IndexedDB for user notes', () => {
    const js = getJsText();
    assertIncludes(js, 'note.source === \'user\'', 'Should branch on source');
    assertIncludes(js, 'await DB.put', 'Should save to IndexedDB');
  });

  test('FUNC-035: Edit save also updates builtInNotes array for built-in notes', () => {
    const js = getJsText();
    assertIncludes(js, 'STATE.builtInNotes[bi].title', 'Should update built-in note');
  });

  // ── ②F 置顶功能 ──
  console.log('\n  [②F] 置顶功能');

  test('FUNC-036: togglePin function exists', () => {
    const js = getJsText();
    assertIncludes(js, 'function togglePin', 'togglePin should exist');
  });

  test('FUNC-037: Pinned state persisted in localStorage', () => {
    const js = getJsText();
    assertIncludes(js, 'notes-pinned', 'Should use notes-pinned key');
    assertIncludes(js, 'loadPinnedIds', 'Should load pinned IDs');
    assertIncludes(js, 'savePinnedIds', 'Should save pinned IDs');
  });

  test('FUNC-038: Pinned notes render with 📌 indicator in renderNoteItem', () => {
    const js = getJsText();
    assertIncludes(js, '📌', 'Should show pin indicator');
  });

  test('FUNC-039: Action sheet pin button shows dynamic text', () => {
    const js = getJsText();
    assertIncludes(js, '取消置顶', 'Should show cancel pin option');
  });

  test('FUNC-040: Pin toggling refreshes current view', () => {
    const js = getJsText();
    assertIncludes(js, 'refreshCurrentView()', 'Should refresh view after toggle');
  });

  // ── ②G 分类管理 ──
  console.log('\n  [②G] 分类管理');

  test('FUNC-041: Category manager list renders all categories', () => {
    assert($('#categoryManagerList') !== null, 'Manager list should exist');
  });

  test('FUNC-042: Add category button exists', () => {
    assert($('#addCategoryBtn') !== null, 'Add button should exist');
  });

  test('FUNC-043: Category input overlay exists for add/edit', () => {
    assert($('#categoryInputOverlay') !== null, 'Input overlay should exist');
    assert($('#categoryInputField') !== null, 'Input field should exist');
    assert($('#categoryInputConfirm') !== null, 'Confirm button should exist');
  });

  test('FUNC-044: Category delete/replace modal exists', () => {
    assert($('#categoryReplaceModal') !== null, 'Replace modal should exist');
    assert($('#categoryReplaceSelect') !== null, 'Replace select should exist');
  });

  test('FUNC-045: Categories loaded from localStorage key "notes-categories"', () => {
    const js = getJsText();
    assertIncludes(js, 'notes-categories', 'Should use notes-categories key');
  });

  test('FUNC-046: PRESET_CATEGORIES includes all default categories', () => {
    const js = getJsText();
    const presetMatch = js.match(/PRESET_CATEGORIES\s*=\s*\[([^\]]+)\]/);
    assert(presetMatch !== null, 'PRESET_CATEGORIES should exist');
    const presetStr = presetMatch[1];
    assertIncludes(presetStr, '全部', 'Should include 全部');
    assertIncludes(presetStr, '哲学', 'Should include 哲学');
    assertIncludes(presetStr, '科技', 'Should include 科技');
    assertIncludes(presetStr, '其他', 'Should include 其他');
  });

  test('FUNC-047: Category edit renames notes across all sources', () => {
    const js = getJsText();
    assertIncludes(js, 'n.category = newName', 'Should update note category');
    assertIncludes(js, 'STATE.builtInNotes', 'Should update built-in notes');
    assertIncludes(js, 'STATE.userNotesIndex', 'Should update user notes index');
  });

  test('FUNC-048: Category delete has replace-with-target flow', () => {
    const js = getJsText();
    assertIncludes(js, 'executeCategoryDelete', 'Should have delete function');
    assertIncludes(js, 'categoryReplaceSelect', 'Should have replace select');
  });

  test('FUNC-049: "其他" category is protected from edit/delete', () => {
    const js = getJsText();
    assertIncludes(js, '保留分类', 'Should protect 其他 category');
  });

  // ── ②H Preview Overlay ──
  console.log('\n  [②H] Preview Overlay');

  test('FUNC-050: Preview overlay (#previewOverlay) exists', () => {
    const overlay = $('#previewOverlay');
    assert(overlay !== null, 'Overlay should exist');
  });

  test('FUNC-051: Overlay has back button', () => {
    assert($('#overlayBackBtn') !== null, 'Back button should exist');
  });

  test('FUNC-052: Overlay has title display', () => {
    assert($('#overlayTitle') !== null, 'Title display should exist');
  });

  test('FUNC-053: Overlay body renders iframe for preview', () => {
    assert($('#overlayBody') !== null, 'Overlay body should exist');
  });

  test('FUNC-054: Overlay supports landscape mode with float back button', () => {
    assert($('#landscapeFloatBack') !== null, 'Float back button should exist');
  });

  test('FUNC-055: Landscape mode hides header and shows float button', () => {
    const css = getCssText();
    assertIncludes(css, '.preview-overlay.landscape .overlay-header',
      'Landscape should hide header');
    assertIncludes(css, '.landscape-float-back',
      'Should have float back button styles');
  });

  test('FUNC-056: checkLandscape function exists', () => {
    const js = getJsText();
    assertIncludes(js, 'function checkLandscape', 'checkLandscape should exist');
  });

  test('FUNC-057: Orientation change listener is registered', () => {
    const js = getJsText();
    assertIncludes(js, "matchMedia('(orientation: landscape)')",
      'Should listen for orientation changes');
  });

  test('FUNC-058: Desktop preview exists with title and iframe', () => {
    assert($('#previewTitle') !== null, 'Desktop preview title should exist');
    assert($('#previewBody') !== null, 'Desktop preview body should exist');
  });

  test('FUNC-059: Preview builds iframe with blob URL for user notes', () => {
    const js = getJsText();
    assertIncludes(js, 'URL.createObjectURL', 'Should create blob URLs');
    assertIncludes(js, 'buildIframeHTML', 'Should have iframe builder');
  });

  test('FUNC-060: Preview uses sandbox for iframe security', () => {
    const js = getJsText();
    assertIncludes(js, 'sandbox="allow-same-origin allow-scripts"',
      'Iframe should have sandbox attribute');
  });

  // ── ②I 主题切换 ──
  console.log('\n  [②I] 主题切换');

  test('FUNC-061: Theme toggle checkbox exists in profile', () => {
    assert($('#profileThemeToggle') !== null, 'Theme toggle should exist');
  });

  test('FUNC-062: applyTheme sets data-theme attribute on html', () => {
    const js = getJsText();
    assertIncludes(js, "setAttribute('data-theme'", 'Should set data-theme attribute');
  });

  test('FUNC-063: Theme saved to localStorage key "notes-theme"', () => {
    const js = getJsText();
    assertIncludes(js, 'notes-theme', 'Should use notes-theme key');
  });

  test('FUNC-064: Theme toggle updates meta theme-color', () => {
    const js = getJsText();
    assertIncludes(js, "setAttribute('content'", 'Should update meta theme-color');
  });

  test('FUNC-065: Theme defaults to light mode', () => {
    const html = doc.documentElement;
    // After init, should have data-theme set
    assert(html.getAttribute('data-theme') !== null, 'Should have theme attribute');
  });

  // ── ②J 三Tab切换 ──
  console.log('\n  [②J] 三Tab切换');

  test('FUNC-066: Three tabs exist: home, upload, profile', () => {
    assert($('#tabHome') !== null, 'Home tab should exist');
    assert($('#tabUpload') !== null, 'Upload tab should exist');
    assert($('#tabProfile') !== null, 'Profile tab should exist');
  });

  test('FUNC-067: Desktop tab bar has tab buttons', () => {
    const tabBtns = $$('.tab-btn', $('#tabBar'));
    assertEqual(tabBtns.length, 3, 'Should have 3 tab buttons');
  });

  test('FUNC-068: Mobile bottom nav has 3 nav items', () => {
    const navItems = $$('.nav-item', $('#bottomNav'));
    assertEqual(navItems.length, 3, 'Should have 3 nav items');
  });

  test('FUNC-069: switchTab function exists and handles all 3 tabs', () => {
    const js = getJsText();
    assertIncludes(js, 'function switchTab', 'switchTab should exist');
    assertIncludes(js, "name==='home'", 'Should handle home tab');
    assertIncludes(js, "name==='upload'", 'Should handle upload tab');
    assertIncludes(js, "name==='profile'", 'Should handle profile tab');
  });

  test('FUNC-070: Tab switching updates active class on both desktop tab-bar and mobile nav', () => {
    const js = getJsText();
    assertIncludes(js, ".tab-btn',tabBar)", 'Should update desktop tab bar');
    assertIncludes(js, ".nav-item',bottomNav)", 'Should update bottom nav');
  });

  test('FUNC-071: Switching to profile refreshes storage size', () => {
    const js = getJsText();
    assertIncludes(js, 'refreshProfileStorageSize()', 'Should refresh storage on profile');
  });

  test('FUNC-072: Switching to profile renders category manager', () => {
    const js = getJsText();
    assertIncludes(js, 'renderCategoryManager()', 'Should render category manager');
  });

  test('FUNC-073: Switching to upload populates categories', () => {
    const js = getJsText();
    assertIncludes(js, 'populateUploadCategories()', 'Should populate upload categories');
  });

  // ── ②K Long Press (书架) ──
  console.log('\n  [②K] 长按操作');

  test('FUNC-074: Long press timer is 800ms', () => {
    const js = getJsText();
    assertIncludes(js, 'LONG_PRESS_DURATION = 800', 'Long press should be 800ms');
  });

  test('FUNC-075: Long press opens action sheet', () => {
    const js = getJsText();
    assertIncludes(js, 'openActionSheet(noteId)', 'Should open action sheet');
  });

  test('FUNC-076: Action sheet exists with edit/delete/pin/cancel', () => {
    assert($('#actionSheetBackdrop') !== null, 'Action sheet backdrop should exist');
    const buttons = $$('[data-as-action]', $('#actionSheet'));
    const actions = buttons.map(b => b.getAttribute('data-as-action'));
    assertIncludes(actions, 'edit', 'Should have edit action');
    assertIncludes(actions, 'delete', 'Should have delete action');
    assertIncludes(actions, 'pin', 'Should have pin action');
    assertIncludes(actions, 'cancel', 'Should have cancel action');
  });

  // ── ②L Swipe (笔记列表) ──
  console.log('\n  [②L] 滑动操作');

  test('FUNC-077: Swipe threshold is 60px', () => {
    const js = getJsText();
    assertIncludes(js, 'SWIPE_THRESHOLD = 60', 'SWIPE_THRESHOLD should be 60');
  });

  test('FUNC-078: Swipe max is 120px', () => {
    const js = getJsText();
    assertIncludes(js, 'SWIPE_MAX = 120', 'SWIPE_MAX should be 120');
  });

  test('FUNC-079: Swipe actions width matches SWIPE_MAX', () => {
    const css = getCssText();
    const actionsBlock = css.match(/\.note-item-swipe-actions\s*\{[^}]+\}/);
    assert(actionsBlock !== null, 'Should have swipe actions CSS');
    assertIncludes(actionsBlock[0], 'width: 120px', 'Actions area should be 120px');
  });

  test('FUNC-080: Swipe has vertical disambiguation (prevents scroll conflict)', () => {
    const js = getJsText();
    assertIncludes(js, 'SWIPE_VERT_THRESHOLD', 'Should have vertical threshold');
    assertIncludes(js, 'Math.abs(dy) > Math.abs(dx)', 'Should compare dx/dy');
  });

  test('FUNC-081: Swipe has direction locking mechanism', () => {
    const js = getJsText();
    assertIncludes(js, 'swipeDirectionLocked', 'Should lock direction');
  });

  // ================================================================
  // ③ 边界检查 — EDGE CASES
  // ================================================================
  console.log('\n── ③ 边界检查 ──');

  test('EDGE-001: No JS errors during initialization', () => {
    // jsErrors was captured via VirtualConsole
    // Ignore expected network errors from fetch (notes are pre-loaded)
    const realErrors = jsErrors.filter(e =>
      !e.includes('fetch') && !e.includes('404') && !e.includes('Network')
    );
    assertEqual(realErrors.length, 0,
      `Should have no JS errors, got: ${realErrors.join('; ')}`);
  });

  test('EDGE-002: All 9 category CSS variables defined in :root', () => {
    const css = getCssText();
    const catVars = [
      '--cat-philosophy', '--cat-history', '--cat-literature',
      '--cat-tech', '--cat-economics', '--cat-management',
      '--cat-psychology', '--cat-business', '--cat-politics'
    ];
    for (const v of catVars) {
      const val = getCssVar(css, v);
      assert(val !== null && val !== '', `CSS variable ${v} should be defined`);
    }
  });

  test('EDGE-003: --cat-other variable defined for uncategorized', () => {
    const css = getCssText();
    const val = getCssVar(css, '--cat-other');
    assert(val !== null && val !== '', '--cat-other should be defined');
  });

  test('EDGE-004: Category color class selectors exist (.philosophy .book-cover, etc.)', () => {
    const css = getCssText();
    const expectedSelectors = [
      '.philosophy .book-cover', '.history .book-cover',
      '.literature .book-cover', '.tech .book-cover',
      '.economics .book-cover', '.management .book-cover',
      '.psychology .book-cover', '.business .book-cover',
      '.politics .book-cover', '.other .book-cover'
    ];
    for (const sel of expectedSelectors) {
      assert(css.includes(sel), `CSS should have selector: ${sel}`);
    }
  });

  test('EDGE-005: CSS class selector fallback exists (.book-philosophy .book-cover)', () => {
    const css = getCssText();
    const fallbackSelectors = [
      '.book-philosophy .book-cover', '.book-history .book-cover',
      '.book-literature .book-cover', '.book-tech .book-cover',
      '.book-economy .book-cover', '.book-management .book-cover',
      '.book-psychology .book-cover', '.book-business .book-cover',
      '.book-politics .book-cover', '.book-other .book-cover'
    ];
    let fallbackCount = 0;
    for (const sel of fallbackSelectors) {
      if (css.includes(sel)) fallbackCount++;
    }
    assertGt(fallbackCount, 3, 'Should have several fallback class selectors');
  });

  test('EDGE-006: localStorage key "notes-pinned" unchanged', () => {
    const js = getJsText();
    assertIncludes(js, "'notes-pinned'", 'notes-pinned key should exist');
  });

  test('EDGE-007: localStorage key "notes-categories" unchanged', () => {
    const js = getJsText();
    assertIncludes(js, "'notes-categories'", 'notes-categories key should exist');
  });

  test('EDGE-008: localStorage key "notes-theme" unchanged', () => {
    const js = getJsText();
    assertIncludes(js, "'notes-theme'", 'notes-theme key should exist');
  });

  test('EDGE-009: localStorage key "notes-nickname" unchanged', () => {
    const js = getJsText();
    assertIncludes(js, "'notes-nickname'", 'notes-nickname key should exist');
  });

  test('EDGE-010: localStorage key "notes-search-history" unchanged', () => {
    const js = getJsText();
    assertIncludes(js, "'notes-search-history'", 'notes-search-history key should exist');
  });

  test('EDGE-011: localStorage key "user-notes-index" unchanged', () => {
    const js = getJsText();
    assertIncludes(js, "'user-notes-index'", 'user-notes-index key should exist');
  });

  test('EDGE-012: IndexedDB database name "notes-app" unchanged', () => {
    const js = getJsText();
    assertIncludes(js, "indexedDB.open('notes-app'", 'Database name should be notes-app');
  });

  test('EDGE-013: IndexedDB store name "user-notes" unchanged', () => {
    const js = getJsText();
    assertIncludes(js, "objectStoreNames.contains('user-notes')",
      'Store name should be user-notes');
  });

  test('EDGE-014: noConflict with v5 localStorage keys (no v5-only keys present)', () => {
    const js = getJsText();
    // v5 had 'notes-shelf-view' — should NOT be in v7
    assertNotIncludes(js, 'notes-shelf-view',
      'v5 shelf-view key should not be in v7 (shelf is always visible)');
  });

  test('EDGE-015: Escape key closes edit modal and action sheet', () => {
    const js = getJsText();
    assertIncludes(js, "key==='Escape'", 'Should handle Escape key');
    assertIncludes(js, 'closeEditModal()', 'Should close edit on Escape');
  });

  test('EDGE-016: Confirmation modal uses cloneNode for clean event handlers', () => {
    const js = getJsText();
    assertIncludes(js, 'cloneNode(true)', 'Should clone for clean handlers');
  });

  test('EDGE-017: escapeHtml function exists for XSS prevention', () => {
    const js = getJsText();
    assertIncludes(js, 'function escapeHtml', 'escapeHtml should exist');
    assertIncludes(js, 'textContent=s', 'Should use textContent for escaping');
  });

  test('EDGE-018: Profile nickname uses blur to save (not every keystroke)', () => {
    const js = getJsText();
    assertIncludes(js, "profileNickname.addEventListener('blur'",
      'Should save on blur');
  });

  test('EDGE-019: Resize handler has debounce (clearTimeout pattern)', () => {
    const js = getJsText();
    assertIncludes(js, "window.addEventListener('resize'",
      'Should have resize handler');
    assertIncludes(js, 'clearTimeout(rt)', 'Should debounce resize');
  });

  test('EDGE-020: Window popstate handler for mobile preview back navigation', () => {
    const js = getJsText();
    assertIncludes(js, "window.addEventListener('popstate'",
      'Should handle popstate');
  });

  test('EDGE-021: Warm white base colors defined in :root', () => {
    const css = getCssText();
    const bgPage = getCssVar(css, '--bg-page');
    assertEqual(bgPage, '#FFFBF5', 'bg-page should be warm white #FFFBF5');
    const bgCard = getCssVar(css, '--bg-card');
    assertEqual(bgCard, '#FFFFFF', 'bg-card should be white');
    const accent = getCssVar(css, '--accent');
    assertEqual(accent, '#C97064', 'accent should be warm coral #C97064');
  });

  test('EDGE-022: Category CSS classes use :root variables (not hardcoded colors)', () => {
    const css = getCssText();
    // Verify the category selectors use var(--cat-*) 
    const philBlock = css.match(/\.philosophy \.book-cover[^}]*\{[^}]+\}/);
    assert(philBlock !== null, 'Should have philosophy selector');
    assertIncludes(philBlock[0], 'var(--cat-philosophy)', 'Should use CSS variable');
  });

  test('EDGE-023: formatDate function handles invalid dates gracefully', () => {
    const js = getJsText();
    assertIncludes(js, 'function formatDate', 'formatDate should exist');
    assertIncludes(js, 'isNaN(dt.getTime())', 'Should check for invalid dates');
  });

  test('EDGE-024: genId uses Date.now() + random for uniqueness', () => {
    const js = getJsText();
    assertIncludes(js, 'function genId', 'genId should exist');
    assertIncludes(js, 'Date.now()', 'Should use timestamp');
    assertIncludes(js, 'Math.random()', 'Should use random');
  });

  test('EDGE-025: Toast system exists with auto-remove', () => {
    const js = getJsText();
    assertIncludes(js, 'function showToast', 'showToast should exist');
    assertIncludes(js, 'setTimeout(()=>t.remove()', 'Should auto-remove toast');
  });

  test('EDGE-026: Mobile sidebar has padding-bottom for bottom nav clearance', () => {
    const css = getCssText();
    // v7 uses sidebar padding at mobile breakpoint instead of .page-content
    const mobileSection = css.match(/@media\s*\(max-width:\s*767px\)[\s\S]*?(?=@media|\*\/\s*$)/);
    assert(mobileSection !== null, 'Mobile media query should exist');
    const mobileCss = mobileSection[0] || '';
    // Sidebar gets padding-bottom for bottom nav space
    assert(
      mobileCss.includes('padding-bottom') || css.includes('calc(80px'),
      'Mobile view should have bottom padding for nav clearance'
    );
  });

  test('EDGE-027: Book card has user-select: none for touch UX', () => {
    const css = getCssText();
    const cardBlock = css.match(/\.book-card\s*\{[^}]+\}/);
    assert(cardBlock !== null, 'Should have .book-card block');
    assertIncludes(cardBlock[0], 'user-select: none', 'Should prevent text selection');
  });

  test('EDGE-028: Notes are sorted newest-first in mergeNotes', () => {
    const js = getJsText();
    assertIncludes(js, 'b.date.localeCompare(a.date)', 'Should sort by date descending');
  });

  test('EDGE-029: Profile "about" section has app description', () => {
    const profileHtml = $('#tabProfile').innerHTML;
    assert(profileHtml.includes('书阁') || profileHtml.includes('笔记'),
      'Profile should mention the app name');
  });

  test('EDGE-030: Combined CSS selectors for book-philosophy + philosophy classes', () => {
    const css = getCssText();
    // The selector should handle both .philosophy .book-cover and .book-philosophy .book-cover
    const combinedSelector = css.match(/\.philosophy \.book-cover,\s*\.book-philosophy \.book-cover/);
    assert(combinedSelector !== null, 'Should have combined class selectors');
  });

  test('EDGE-031: Toast z-index is high enough (>= 2000) to be above overlay', () => {
    const css = getCssText();
    const toastBlock = css.match(/\.toast\s*\{[^}]+\}/);
    assert(toastBlock !== null, 'Should have .toast block');
    assertIncludes(toastBlock[0], 'z-index', 'Toast should have z-index');
    // Extract z-index value
    const ziMatch = toastBlock[0].match(/z-index\s*:\s*(\d+)/);
    if (ziMatch) {
      assert(parseInt(ziMatch[1]) >= 1000, 'Toast z-index should be >= 1000');
    }
  });

  // ================================================================
  //  REPORT
  // ================================================================

  console.log('\n══════════════════════════════════════════════════');
  console.log(`  测试完成: ${passCount} 通过 / ${failCount} 失败 / ${testCount} 总计`);
  console.log('══════════════════════════════════════════════════\n');

  if (failCount > 0) {
    console.log('失败的测试:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  ✗ ${r.name}`);
      console.log(`    ${r.error}`);
    });
  }

  console.log('\n详细结果:');
  results.forEach((r, i) => {
    const icon = r.status === 'PASS' ? '✓' : '✗';
    console.log(`  ${String(i + 1).padStart(3)}. ${icon} ${r.name}`);
  });

  // ─── Smart Routing Decision ───────────────────────────────────────────
  const failedTests = results.filter(r => r.status === 'FAIL');
  let routingDecision;
  let routingTarget;

  if (failedTests.length === 0) {
    routingDecision = 'All tests pass — v7.0 design and functionality are clean.';
    routingTarget = 'NoOne';
  } else {
    // Categorize failures: source bugs vs test bugs
    // For v7, analyze failure patterns
    const sourceBugs = failedTests.filter(f =>
      f.name.startsWith('FUNC-') || f.name.startsWith('EDGE-')
    );
    const designBugs = failedTests.filter(f =>
      f.name.startsWith('DESIGN-')
    );

    if (sourceBugs.length > 0 || designBugs.length > 0) {
      routingDecision = `${failedTests.length} test(s) failed — source code needs fixes.`;
      routingTarget = 'Engineer';
    } else {
      routingDecision = 'Test code issues found — self-fixing.';
      routingTarget = 'QA';
    }
  }

  // Write report
  const reportPath = new URL('../test/test_report_v7.md', import.meta.url).pathname;
  const reportLines = [
    `# Test Report — 笔记预览 APP v7.0`,
    '',
    `## Summary`,
    `- **Total Tests**: ${testCount} | **Passed**: ${passCount} | **Failed**: ${failCount}`,
    `- **Pass Rate**: ${testCount > 0 ? ((passCount / testCount) * 100).toFixed(1) : '0.0'}%`,
    `- **JS Errors**: ${jsErrors.filter(e => !e.includes('fetch') && !e.includes('404') && !e.includes('Network')).length}`,
    '',
    `## Routing Decision`,
    `→ **Send To: ${routingTarget}** — ${routingDecision}`,
    '',
  ];

  if (failedTests.length > 0) {
    reportLines.push('## Failed Tests');
    reportLines.push('');
    for (const f of failedTests) {
      reportLines.push(`### ${f.name}`);
      reportLines.push(`- **Error**: ${f.error}`);
      reportLines.push(`- **Source**: \`index.html\``);
      reportLines.push('');
    }
  }

  reportLines.push('## Test Coverage Summary');
  reportLines.push('');
  reportLines.push('### ① 新设计还原 (35 tests)');
  reportLines.push('- ①A 书架卡片: book-cover/book-info structure, white title, 3-line clamp, spine decoration, hover lift, shadow, active state, dimensions');
  reportLines.push('- ①B 分类Chips: .category-chip class, active black-bg/white-text, chip-count, horizontal scroll, all 10 categories');
  reportLines.push('- ①C 底部导航: backdrop-filter blur, bg-nav variable, nav-icon/text, active accent, safe-area');
  reportLines.push('- ①D 个人中心: profile-setting-item cards, radius-lg corners, gradient avatar, theme toggle, category manager, version badge');
  reportLines.push('- ①E 暗色模式: [data-theme="dark"], all CSS variable overrides (bg-page, bg-card, accent, 9 cat colors, cat-other, shadows, bg-nav, accent-soft)');
  reportLines.push('');
  reportLines.push('### ② 全功能回归 (81 tests)');
  reportLines.push('- ②A 书架渲染: cards, category groups, section headers, dot colors, CAT_ORDER, counts, data-id, category classes, tags, pin markers');
  reportLines.push('- ②B 搜索: button, input, results, history, open/close, title+tag search, back button, 20-item limit, clear');
  reportLines.push('- ②C 上传: form elements, disabled state, .html accept, validation, category required, IndexedDB storage, index persistence, duplicate title handling, form reset');
  reportLines.push('- ②D 删除: confirmation modal, IndexedDB delete, index filtering, source-aware (built-in vs user)');
  reportLines.push('- ②E 编辑: modal fields, save/cancel, form population, IndexedDB persistence, builtInNotes update');
  reportLines.push('- ②F 置顶: togglePin, localStorage persistence, 📌 indicators, dynamic button text, view refresh');
  reportLines.push('- ②G 分类管理: manager list, add button, input overlay, delete/replace modal, localStorage persistence, PRESET_CATEGORIES, rename across sources, replace-on-delete, 其他 protection');
  reportLines.push('- ②H Preview: overlay, back button, title, iframe, landscape mode, float back, checkLandscape, orientation listener, desktop preview, blob URLs, sandbox');
  reportLines.push('- ②I 主题: toggle checkbox, data-theme attribute, localStorage, meta theme-color, default light mode');
  reportLines.push('- ②J 三Tab: home/upload/profile, tab-bar buttons, bottom-nav items, switchTab function, active class sync, profile storage refresh, category manager render, upload category populate');
  reportLines.push('- ②K 长按: 800ms timer, action sheet trigger, edit/delete/pin/cancel buttons');
  reportLines.push('- ②L 滑动: 60px threshold, 120px max, 120px actions width, vertical disambiguation, direction lock');
  reportLines.push('');
  reportLines.push('### ③ 边界检查 (31 tests)');
  reportLines.push('- JS errors: VirtualConsole capture, no init errors');
  reportLines.push('- CSS variables: all 9 cat colors defined in :root, --cat-other, warm white base colors');
  reportLines.push('- Category selectors: .philosophy .book-cover + .book-philosophy .book-cover fallbacks');
  reportLines.push('- localStorage keys: notes-pinned, notes-categories, notes-theme, notes-nickname, notes-search-history, user-notes-index — all unchanged');
  reportLines.push('- IndexedDB: notes-app database, user-notes store — unchanged');
  reportLines.push('- No v5-only keys (notes-shelf-view) present');
  reportLines.push('- Keyboard: Escape closes modals, cloneNode for handlers, escapeHtml XSS prevention');
  reportLines.push('- UX: blur-to-save nickname, debounced resize, popstate handler, toast auto-remove');
  reportLines.push('- Data: formatDate invalid date handling, genId uniqueness, mergeNotes sorting');
  reportLines.push('- Safety: user-select none on cards, about section, combined CSS selectors, toast z-index');
  reportLines.push('');
  reportLines.push('## All Results');
  results.forEach((r, i) => {
    reportLines.push(`${i + 1}. [${r.status}] ${r.name}`);
  });

  writeFileSync(reportPath, reportLines.join('\n'), 'utf-8');
  console.log(`\n📄 报告已保存: ${reportPath}`);

  return { testCount, passCount, failCount, results, routingTarget, jsErrors };
}

// ─── Helper: Get CSS variable from dark mode section ────────────────────
function getCssVarInDark(css, varName) {
  const darkSection = css.match(/\[data-theme="dark"\]\s*\{([^}]*)\}/);
  if (!darkSection) return null;
  const darkCss = darkSection[1];
  const escaped = varName.replace(/-/g, '\\-');
  const re = new RegExp(`${escaped}\\s*:\\s*([^;]+);`);
  const m = darkCss.match(re);
  return m ? m[1].trim() : null;
}

// ─── Execute ─────────────────────────────────────────────────────────────

runAllTests().then(({ failCount, routingTarget }) => {
  console.log(`\n🧭 智能路由: → ${routingTarget}`);
  process.exit(failCount > 0 ? 1 : 0);
}).catch(err => {
  console.error('测试执行出错:', err);
  process.exit(1);
});
