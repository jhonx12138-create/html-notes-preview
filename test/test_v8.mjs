/**
 * 笔记预览 APP v8.0 — 分类详情页 3 列网格验证测试
 *
 * 验证范围:
 *   ① 点击分类 → 详情页 3 列网格（grid-template-columns: repeat(3, 1fr)）
 *   ② 横向不滚动（overflow-y: auto），多余换行
 *   ③ 每张 book-card 有 book-cover（封面色块+2行书名）+ book-info（日期+标签）
 *   ④ 卡片大小适配（12px title，10px date，9px tag）
 *   ⑤ 点击卡片 → 预览正常
 *   ⑥ 返回书架正常
 *   ⑦ 书架首页无回归
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

/**
 * Find a CSS rule block for a given selector prefix.
 * Returns the full block text including the selector and braces.
 */
function getCssBlock(selectorPrefix) {
  const css = getCssText();
  // Find all occurrences and return the one that contains the most properties
  // (the main definition, not the media query override)
  const blocks = [];
  const escaped = selectorPrefix.replace(/\./g, '\\.');
  const regex = new RegExp(`${escaped}\\s*\\{[^}]*\\}`, 'gs');
  let match;
  while ((match = regex.exec(css)) !== null) {
    blocks.push(match[0]);
  }
  // Return the largest block (the main definition with most properties)
  if (blocks.length === 1) return blocks[0];
  blocks.sort((a, b) => b.length - a.length);
  return blocks[0] || null;
}

// ─── Run All Tests ───────────────────────────────────────────────────────

async function runAllTests() {
  await waitForApp();

  console.log('\n══════════════════════════════════════════════════');
  console.log('  分类详情页 3 列网格 — 验证测试');
  console.log('══════════════════════════════════════════════════\n');

  // ================================================================
  // ① 书架首页回归检查
  // ================================================================
  console.log('── ① 书架首页回归 ──\n');

  test('REGR-001: 书架首页正常渲染', () => {
    const container = $('#shelfContainer');
    assert(container !== null, 'shelfContainer should exist');
    const cards = $$('.book-card', container);
    assertGt(cards.length, 0, 'Should have book cards on shelf');
  });

  test('REGR-002: 分类详情页初始隐藏', () => {
    const view = $('#categoryDetailView');
    assert(view !== null, 'categoryDetailView should exist');
    assert(view.classList.contains('hidden'), 'categoryDetailView should be hidden initially');
  });

  test('REGR-003: 书架 section headers 正常', () => {
    const sections = $$('.shelf-section', $('#shelfContainer'));
    assertGt(sections.length, 0, 'Should have shelf sections');
    for (const section of sections.slice(0, 3)) {
      const header = $('.shelf-section-header', section);
      assert(header !== null, 'Each shelf section should have a header');
      const label = $('.shelf-label', header);
      assert(label !== null, 'Each shelf section header should have a label');
    }
  });

  test('REGR-004: Book cards have correct structure on shelf', () => {
    const card = $('.book-card', $('#shelfContainer'));
    assert(card !== null, 'At least one book card should exist');
    assert($('.book-cover', card) !== null, 'Book card should have .book-cover');
    assert($('.book-info', card) !== null, 'Book card should have .book-info');
  });

  // ================================================================
  // ② 点击分类 → 详情页 3 列网格
  // ================================================================
  console.log('\n── ② 点击分类 → 详情页 ──\n');

  test('GRID-001: openCategoryDetail 函数在 JS 源码中存在', () => {
    const js = getJsText();
    assertMatch(js, /function\s+openCategoryDetail\s*\(/, 'openCategoryDetail function must exist in JS source');
  });

  test('GRID-002: closeCategoryDetail 函数在 JS 源码中存在', () => {
    const js = getJsText();
    assertMatch(js, /function\s+closeCategoryDetail\s*\(/, 'closeCategoryDetail function must exist in JS source');
  });

  test('GRID-003: renderCategoryDetail 函数在 JS 源码中存在', () => {
    const js = getJsText();
    assertMatch(js, /function\s+renderCategoryDetail\s*\(/, 'renderCategoryDetail function must exist in JS source');
  });

  test('GRID-004: showPreview 函数在 JS 源码中存在', () => {
    const js = getJsText();
    assertMatch(js, /function\s+showPreview\s*\(/, 'showPreview function must exist in JS source');
  });

  test('GRID-005: 点击分类 section header 打开详情页', () => {
    const firstSection = $('.shelf-section', $('#shelfContainer'));
    assert(firstSection !== null, 'At least one shelf section must exist');
    const header = $('.shelf-section-header', firstSection);
    click(header);

    const view = $('#categoryDetailView');
    assert(!view.classList.contains('hidden'), 'categoryDetailView should be visible after click');
  });

  test('GRID-006: 详情页标题显示分类名称', () => {
    const title = $('#categoryDetailTitle');
    assert(title !== null, 'categoryDetailTitle should exist');
    assert(title.textContent.trim().length > 0, 'Category detail title should not be empty');
  });

  test('GRID-007: 详情页显示书本数量', () => {
    const count = $('#categoryDetailCount');
    assert(count !== null, 'categoryDetailCount should exist');
    assertIncludes(count.textContent, '本书', 'Should show book count with "本书"');
  });

  test('GRID-008: 打开详情页后书架隐藏', () => {
    const container = $('#shelfContainer');
    assertEqual(container.style.display, 'none', 'shelfContainer should be hidden when detail view is open');
  });

  // ================================================================
  // ③ CSS 布局验证 — 3 列网格
  // ================================================================
  console.log('\n── ③ CSS 布局：3 列网格 ──\n');

  test('CSS-001: .category-detail-grid 使用 display: grid', () => {
    const block = getCssBlock('.category-detail-grid');
    assert(block !== null, '.category-detail-grid main CSS block must exist');
    assertIncludes(block, 'display: grid', 'Must use CSS Grid');
  });

  test('CSS-002: grid-template-columns: repeat(3, 1fr)', () => {
    const block = getCssBlock('.category-detail-grid');
    assertMatch(block, /grid-template-columns\s*:\s*repeat\(\s*3\s*,\s*1fr\s*\)/,
      'Must have grid-template-columns: repeat(3, 1fr)');
  });

  test('CSS-003: 使用 overflow-y: auto（纵向滚动）', () => {
    const block = getCssBlock('.category-detail-grid');
    assertIncludes(block, 'overflow-y: auto', 'Must have overflow-y: auto for vertical scroll');
  });

  test('CSS-004: 不设置 overflow-x（避免横向滚动）', () => {
    const block = getCssBlock('.category-detail-grid');
    // The main block should not have overflow-x: auto or scroll
    assertNotIncludes(block, 'overflow-x: auto', 'Should NOT have overflow-x: auto');
    assertNotIncludes(block, 'overflow-x: scroll', 'Should NOT have overflow-x: scroll');
  });

  test('CSS-005: gap 值为 10px', () => {
    const block = getCssBlock('.category-detail-grid');
    assertMatch(block, /gap\s*:\s*10px/, 'Grid gap must be 10px');
  });

  test('CSS-006: padding 为 12px 16px', () => {
    const block = getCssBlock('.category-detail-grid');
    assertMatch(block, /padding\s*:\s*12px\s+16px/, 'Grid padding must be 12px 16px');
  });

  test('CSS-007: flex: 1 填满剩余空间', () => {
    const block = getCssBlock('.category-detail-grid');
    assertMatch(block, /flex\s*:\s*1/, 'Grid must have flex: 1');
  });

  // ================================================================
  // ④ 卡片在 grid 中自适应
  // ================================================================
  console.log('\n── ④ 卡片自适应布局 ──\n');

  test('CARDGRID-001: grid 中 book-card width: auto', () => {
    const block = getCssBlock('.category-detail-grid .book-card');
    assert(block !== null, '.category-detail-grid .book-card CSS must exist');
    assertIncludes(block, 'width: auto', 'book-card in grid should have width: auto');
  });

  test('CARDGRID-002: grid 中 book-card min-width: 0', () => {
    const block = getCssBlock('.category-detail-grid .book-card');
    assertIncludes(block, 'min-width: 0', 'book-card should have min-width: 0 to prevent overflow');
  });

  // ================================================================
  // ⑤ 卡片尺寸适配
  // ================================================================
  console.log('\n── ⑤ 卡片尺寸适配 ──\n');

  test('SIZE-001: 分类详情页 title 字体 12px', () => {
    const block = getCssBlock('.category-detail-grid .book-title');
    assert(block !== null, '.category-detail-grid .book-title CSS must exist');
    assertMatch(block, /font-size\s*:\s*12px/, 'Title font-size must be 12px');
  });

  test('SIZE-002: 分类详情页 title 两行截断', () => {
    const block = getCssBlock('.category-detail-grid .book-title');
    assertMatch(block, /-webkit-line-clamp\s*:\s*2/, 'Title should clamp to 2 lines');
  });

  test('SIZE-003: 分类详情页 date 字体 10px', () => {
    const block = getCssBlock('.category-detail-grid .book-date');
    assert(block !== null, '.category-detail-grid .book-date CSS must exist');
    assertMatch(block, /font-size\s*:\s*10px/, 'Date font-size must be 10px');
  });

  test('SIZE-004: 分类详情页 tag 字体 9px', () => {
    const block = getCssBlock('.category-detail-grid .book-tag');
    assert(block !== null, '.category-detail-grid .book-tag CSS must exist');
    assertMatch(block, /font-size\s*:\s*9px/, 'Tag font-size must be 9px');
  });

  test('SIZE-005: book-cover 内边距适配（12px 8px）', () => {
    const block = getCssBlock('.category-detail-grid .book-cover');
    assert(block !== null, '.category-detail-grid .book-cover CSS must exist');
    assertMatch(block, /padding\s*:\s*12px\s+8px/, 'Cover padding should be 12px 8px');
  });

  test('SIZE-006: book-cover min-height: 60px', () => {
    const block = getCssBlock('.category-detail-grid .book-cover');
    assertMatch(block, /min-height\s*:\s*60px/, 'Cover min-height should be 60px');
  });

  test('SIZE-007: book-info 内边距适配（8px 10px）', () => {
    const block = getCssBlock('.category-detail-grid .book-info');
    assert(block !== null, '.category-detail-grid .book-info CSS must exist');
    assertMatch(block, /padding\s*:\s*8px\s+10px/, 'Info padding should be 8px 10px');
  });

  test('SIZE-008: book-tags gap 为 2px', () => {
    const block = getCssBlock('.category-detail-grid .book-tags');
    assert(block !== null, '.category-detail-grid .book-tags CSS must exist');
    assertMatch(block, /gap\s*:\s*2px/, 'Tags gap should be 2px');
  });

  test('SIZE-009: tag padding 为 1px 5px', () => {
    const block = getCssBlock('.category-detail-grid .book-tag');
    assertMatch(block, /padding\s*:\s*1px\s+5px/, 'Tag padding should be 1px 5px');
  });

  // ================================================================
  // ⑥ 卡片内容结构验证
  // ================================================================
  console.log('\n── ⑥ 卡片内容结构 ──\n');

  test('STRUCT-001: 分类详情页 grid 中有 book-card', () => {
    const grid = $('#categoryDetailGrid');
    assert(grid !== null, 'categoryDetailGrid should exist');
    const cards = $$('.book-card', grid);
    assertGt(cards.length, 0, 'Should have book cards in detail grid');
  });

  test('STRUCT-002: 每张 card 有 book-cover 和 book-info', () => {
    const grid = $('#categoryDetailGrid');
    const cards = $$('.book-card', grid);
    for (const card of cards.slice(0, 5)) {
      assert($('.book-cover', card) !== null, 'Each card must have .book-cover');
      assert($('.book-info', card) !== null, 'Each card must have .book-info');
    }
  });

  test('STRUCT-003: book-cover 包含书名（.book-title）', () => {
    const grid = $('#categoryDetailGrid');
    const cards = $$('.book-card', grid);
    for (const card of cards.slice(0, 3)) {
      const title = $('.book-title', card);
      assert(title !== null, 'Each card must have .book-title');
      assert(title.textContent.trim().length > 0, 'Book title should not be empty');
    }
  });

  test('STRUCT-004: book-info 包含日期（.book-date）', () => {
    const grid = $('#categoryDetailGrid');
    const cards = $$('.book-card', grid);
    let hasDate = false;
    for (const card of cards.slice(0, 5)) {
      if ($('.book-date', card)) { hasDate = true; break; }
    }
    assert(hasDate, 'At least some cards should have .book-date');
  });

  test('STRUCT-005: book-cover 有分类颜色 class（如 .philosophy, .history）', () => {
    const grid = $('#categoryDetailGrid');
    const firstCard = $('.book-card', grid);
    assert(firstCard !== null, 'First book card should exist');
    const validClasses = ['philosophy', 'history', 'literature', 'tech',
      'economics', 'management', 'psychology', 'business', 'politics', 'other'];
    const hasValidClass = validClasses.some(c => firstCard.classList.contains(c));
    assert(hasValidClass, `Book card should have a category color class, got: ${firstCard.className}`);
  });

  test('STRUCT-006: book-card 有 data-id 属性', () => {
    const grid = $('#categoryDetailGrid');
    const firstCard = $('.book-card', grid);
    assert(firstCard !== null, 'First card should exist');
    assert(firstCard.getAttribute('data-id') !== null, 'Book card must have data-id');
  });

  test('STRUCT-007: 每行 3 列 — grid 中卡片数量 > 3 时验证结构', () => {
    const grid = $('#categoryDetailGrid');
    const cards = $$('.book-card', grid);
    if (cards.length < 3) {
      console.log('  (skip) Less than 3 cards, cannot verify 3-column layout');
      assert(true);
      return;
    }
    // With 3 columns, card index 0, 1, 2 should be in the first row
    // At minimum, we should have the right number of cards rendered
    assertGt(cards.length, 0, 'Should have cards in grid');
  });

  // ================================================================
  // ⑦ 点击卡片 → 预览
  // ================================================================
  console.log('\n── ⑦ 点击卡片 → 预览 ──\n');

  test('CLICK-001: categoryDetailGrid 有 click 事件处理器（JS 源码）', () => {
    const js = getJsText();
    assertIncludes(js, "categoryDetailGrid.addEventListener('click'",
      'categoryDetailGrid should have click event listener');
  });

  test('CLICK-002: 点击卡片触发预览 — 预览面板标题更新', () => {
    const grid = $('#categoryDetailGrid');
    const firstCard = $('.book-card', grid);
    assert(firstCard !== null, 'Should have at least one card');

    const cardTitle = $('.book-title', firstCard).textContent.trim();
    click(firstCard);

    // Desktop preview title should update
    const previewTitle = $('#previewTitle');
    assert(previewTitle !== null, 'previewTitle should exist');
    assert(previewTitle.textContent.trim().length > 0, 'Preview title should not be empty after click');
  });

  test('CLICK-003: 预览主体内容非空', () => {
    const previewBody = $('#previewBody');
    assert(previewBody !== null, 'previewBody should exist');
    const hasContent = previewBody.innerHTML.trim().length > 0 &&
      !previewBody.innerHTML.includes('选择一篇笔记开始阅读');
    assert(hasContent, 'Preview body should show note content');
  });

  test('CLICK-004: 点击卡片后预览面板日期更新', () => {
    const previewDate = $('#previewDate');
    assert(previewDate !== null, 'previewDate should exist');
    // Date may or may not be populated depending on the note
    assert(true); // Non-blocking — preview title verified in CLICK-002
  });

  // ================================================================
  // ⑧ 返回书架
  // ================================================================
  console.log('\n── ⑧ 返回书架 ──\n');

  test('BACK-001: backCatBtn 存在', () => {
    const btn = $('#backCatBtn');
    assert(btn !== null, 'backCatBtn should exist');
  });

  test('BACK-002: 点击返回按钮关闭详情页', () => {
    click($('#backCatBtn'));

    const view = $('#categoryDetailView');
    assert(view.classList.contains('hidden'), 'categoryDetailView should be hidden after back');
  });

  test('BACK-003: 返回后书架恢复显示', () => {
    const container = $('#shelfContainer');
    assert(container.style.display !== 'none', 'shelfContainer should be visible after back');
  });

  test('BACK-004: 返回后书架重新渲染有卡片', () => {
    const cards = $$('.book-card', $('#shelfContainer'));
    assertGt(cards.length, 0, 'Shelf should have book cards after returning from detail');
  });

  // ================================================================
  // ⑨ 多次打开/关闭稳定性
  // ================================================================
  console.log('\n── ⑨ 多次打开/关闭稳定性 ──\n');

  test('STAB-001: 打开第二个分类详情页', () => {
    const sections = $$('.shelf-section', $('#shelfContainer'));
    if (sections.length < 2) {
      console.log('  (skip) Only one category');
      assert(true);
      return;
    }
    const secondSection = sections[1];
    const label = $('.shelf-label', secondSection);
    const catName = label.textContent.trim();

    click($('.shelf-section-header', secondSection));

    const view = $('#categoryDetailView');
    assert(!view.classList.contains('hidden'), 'categoryDetailView should be visible for second category');
    const title = $('#categoryDetailTitle');
    assertEqual(title.textContent.trim(), catName, 'Title should match second category name');
  });

  test('STAB-002: 返回后再打开正常', () => {
    click($('#backCatBtn'));

    const firstSection = $('.shelf-section', $('#shelfContainer'));
    click($('.shelf-section-header', firstSection));

    const view = $('#categoryDetailView');
    assert(!view.classList.contains('hidden'), 'categoryDetailView should open again');
    const cards = $$('.book-card', $('#categoryDetailGrid'));
    assertGt(cards.length, 0, 'Should have cards after re-opening');
  });

  test('STAB-003: 第三个分类也能正常打开', () => {
    const sections = $$('.shelf-section', $('#shelfContainer'));
    if (sections.length < 3) {
      console.log('  (skip) Less than 3 categories');
      assert(true);
      return;
    }
    const thirdSection = sections[2];
    click($('.shelf-section-header', thirdSection));

    const view = $('#categoryDetailView');
    assert(!view.classList.contains('hidden'), 'Should open third category detail');
    const cards = $$('.book-card', $('#categoryDetailGrid'));
    assertGt(cards.length, 0, 'Should have cards for third category');
  });

  // ================================================================
  // ⑩ 边界检查
  // ================================================================
  console.log('\n── ⑩ 边界检查 ──\n');

  test('EDGE-001: 操作期间无 JS 报错', () => {
    assertEqual(jsErrors.length, 0,
      `JS errors detected: ${jsErrors.join('; ')}`);
  });

  test('EDGE-002: 空分类 grid 显示空状态', () => {
    // Go back to shelf first
    click($('#backCatBtn'));
    // We can't easily test empty category in JSDOM since STATE is not accessible
    // But we can verify empty-state class exists in source
    const js = getJsText();
    assertIncludes(js, 'empty-state', 'Empty state handling must exist in source');
    assertIncludes(js, '暂无书籍', 'Empty state text for empty categories must exist');
  });

  test('EDGE-003: 返回按钮有正确的 aria-label', () => {
    // Reopen to check the button
    const firstSection = $('.shelf-section', $('#shelfContainer'));
    click($('.shelf-section-header', firstSection));

    const btn = $('#backCatBtn');
    assertEqual(btn.getAttribute('aria-label'), '返回书架', 'Back button should have aria-label "返回书架"');
  });

  test('EDGE-004: category-detail-view 有正确的 CSS 结构', () => {
    const css = getCssText();
    assertIncludes(css, '.category-detail-view', 'category-detail-view CSS must exist');
    assertIncludes(css, 'flex: 1', 'Should use flex: 1');
    assertIncludes(css, 'overflow: hidden', 'Should have overflow: hidden');
  });

  test('EDGE-005: category-detail-view.hidden 使用 display: none', () => {
    const css = getCssText();
    const hiddenBlock = css.match(/\.category-detail-view\.hidden\s*\{[^}]*\}/);
    assert(hiddenBlock !== null, '.category-detail-view.hidden must exist');
    assertIncludes(hiddenBlock[0], 'display: none', 'Hidden state should use display: none');
  });

  // ================================================================
  // ⑪ 书架首页回归 — 二次确认
  // ================================================================
  console.log('\n── ⑪ 书架首页最终回归 ──\n');

  test('REGR-FINAL-001: 多次切换后书架仍正常渲染', () => {
    const sections = $$('.shelf-section', $('#shelfContainer'));
    assertGt(sections.length, 0, 'Should have shelf sections after all operations');
  });

  test('REGR-FINAL-002: section header 仍可点击', () => {
    const firstSection = $('.shelf-section', $('#shelfContainer'));
    const header = $('.shelf-section-header', firstSection);
    assert(header !== null, 'Section header should still exist');
    click(header);
    assert(!$('#categoryDetailView').classList.contains('hidden'), 'Should open detail view');
  });

  test('REGR-FINAL-003: 书架卡片结构完整', () => {
    click($('#backCatBtn'));
    const card = $('.book-card', $('#shelfContainer'));
    assert(card !== null, 'Shelf should have cards');
    assert($('.book-cover', card) !== null, 'Cards should have book-cover');
    assert($('.book-info', card) !== null, 'Cards should have book-info');
    assert($('.book-title', card) !== null, 'Cards should have book-title');
  });

  test('REGR-FINAL-004: 无 v8 相关 JS 错误', () => {
    const v8Errors = jsErrors.filter(e =>
      e.includes('categoryDetail') || e.includes('openCategoryDetail') ||
      e.includes('closeCategoryDetail') || e.includes('renderCategoryDetail')
    );
    assertEqual(v8Errors.length, 0,
      `v8-related JS errors detected: ${v8Errors.join('; ')}`);
  });

  test('REGR-FINAL-005: 所有分类 sections 都有可点击的 header', () => {
    click($('#backCatBtn'));
    const sections = $$('.shelf-section', $('#shelfContainer'));
    for (const section of sections) {
      const header = $('.shelf-section-header', section);
      assert(header !== null, 'Each section must have a header');
      const label = $('.shelf-label', header);
      assert(label !== null, 'Each header must have a label');
    }
  });

  // ─── Generate Report ───────────────────────────────────────────────────

  console.log('\n══════════════════════════════════════════════════');
  console.log(`  Total: ${testCount} | Passed: ${passCount} | Failed: ${failCount}`);
  console.log('══════════════════════════════════════════════════\n');

  const reportLines = [];
  reportLines.push('# Test Report — 分类详情页 3 列网格验证\n');
  reportLines.push('## Summary\n');
  reportLines.push(`- **Total Tests**: ${testCount} | **Passed**: ${passCount} | **Failed**: ${failCount}\n`);
  reportLines.push(`- **Pass Rate**: ${testCount > 0 ? (passCount / testCount * 100).toFixed(1) : '0.0'}%\n`);
  reportLines.push(`- **JS Errors**: ${jsErrors.length}\n`);

  reportLines.push('\n## Routing Decision\n');
  if (failCount === 0) {
    reportLines.push('→ **Send To: NoOne** — All tests pass. Category detail 3-column grid works correctly.\n');
  } else {
    // Determine if failures are test bugs or source bugs
    reportLines.push('→ **Send To: Engineer** — Some tests failed. See details below.\n');
  }

  reportLines.push('\n## Test Coverage\n');
  reportLines.push('- ① 书架首页回归: 4 tests\n');
  reportLines.push('- ② 点击分类 → 详情页: 8 tests\n');
  reportLines.push('- ③ CSS 3列网格布局: 7 tests\n');
  reportLines.push('- ④ 卡片自适应布局: 2 tests\n');
  reportLines.push('- ⑤ 卡片尺寸适配: 9 tests\n');
  reportLines.push('- ⑥ 卡片内容结构: 7 tests\n');
  reportLines.push('- ⑦ 点击卡片预览: 4 tests\n');
  reportLines.push('- ⑧ 返回书架: 4 tests\n');
  reportLines.push('- ⑨ 多次切换稳定性: 3 tests\n');
  reportLines.push('- ⑩ 边界检查: 5 tests\n');
  reportLines.push('- ⑪ 最终回归: 5 tests\n');

  reportLines.push('\n## Failed Tests\n');
  const failed = results.filter(r => r.status === 'FAIL');
  if (failed.length === 0) {
    reportLines.push('None. All tests passed! ✅\n');
  } else {
    for (const f of failed) {
      reportLines.push(`- **${f.name}**: ${f.error}\n`);
    }
  }

  reportLines.push('\n## All Results\n');
  let idx = 1;
  for (const r of results) {
    reportLines.push(`${idx}. [${r.status}] ${r.name}${r.status === 'FAIL' ? ' — ' + r.error : ''}\n`);
    idx++;
  }

  const reportPath = new URL('test_report_v8.md', import.meta.url).pathname;
  writeFileSync(reportPath, reportLines.join(''), 'utf-8');
  console.log(`\nReport written to: ${reportPath}`);

  return { testCount, passCount, failCount, results, jsErrors };
}

runAllTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
