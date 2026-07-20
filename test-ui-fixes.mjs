/**
 * test-ui-fixes.mjs — QA Test Suite for v7.2 UI Fixes
 *
 * Validates:
 *   ① 书架分类箭头 (Bookshelf category arrows)
 *   ② 分类详情 2 列网格 (Category detail 2-col grid)
 *   ③ 预览页内容显示 (Preview page content display)
 *   + Quick regression (bookshelf, search, tabs, JS errors)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = resolve(__dirname, 'index.html');
const JSON_PATH = resolve(__dirname, 'notes.json');

// ── Test Framework ──────────────────────────────────────────
const results = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    results.push({ name, status: 'PASS' });
    passed++;
  } catch (e) {
    results.push({ name, status: 'FAIL', error: e.message });
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertMatch(text, pattern, msg) {
  if (!pattern.test(text)) throw new Error(msg || `Expected pattern ${pattern} not found`);
}

function assertNoMatch(text, pattern, msg) {
  if (pattern.test(text)) throw new Error(msg || `Unexpected pattern ${pattern} found`);
}

// ── Load Files ──────────────────────────────────────────────
const html = readFileSync(HTML_PATH, 'utf-8');
const notesJson = JSON.parse(readFileSync(JSON_PATH, 'utf-8'));

// Extract sections
const styleSection = (html.match(/<style>([\s\S]*?)<\/style>/) || ['', ''])[1];
const bodyHTML = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/) || ['', ''])[1];
const scriptSection = (html.match(/<script>([\s\S]*?)<\/script>/) || ['', ''])[1];

// Extract media query section for mobile-specific rules
const mobileMQ = (styleSection.match(/@media\s*\(max-width:\s*767px\)\s*\{([\s\S]*?)\n\}/) || ['', ''])[1];

console.log('='.repeat(60));
console.log('  QA Test Suite — v7.2 UI Fixes Verification');
console.log('  Target:', HTML_PATH);
console.log('  Style section:', styleSection.length, 'chars');
console.log('  Body HTML:', bodyHTML.length, 'chars');
console.log('  Script section:', scriptSection.length, 'chars');
console.log('  notes.json:', notesJson.length, 'items');
console.log('='.repeat(60));

// ═══════════════════════════════════════════════════════════
//  ① 书架分类箭头 (Bookshelf Category Arrows)
// ═══════════════════════════════════════════════════════════
console.log('\n── ① 书架分类箭头 ──');

test('CSS: .shelf-arrow class exists with transition', () => {
  assertMatch(styleSection, /\.shelf-arrow\s*\{/, 'Missing .shelf-arrow rule');
  assertMatch(styleSection, /\.shelf-arrow\s*\{[^}]*transition:/, '.shelf-arrow missing transition');
});

test('CSS: .shelf-arrow has display:inline-block and line-height', () => {
  assertMatch(styleSection, /\.shelf-arrow\s*\{[^}]*display:\s*inline-block/, '.shelf-arrow missing inline-block');
  assertMatch(styleSection, /\.shelf-arrow\s*\{[^}]*line-height:\s*1/, '.shelf-arrow missing line-height:1');
});

test('CSS: .shelf-section-header:hover .shelf-arrow → color accent + translateX(2px)', () => {
  const hoverMatch = styleSection.match(/\.shelf-section-header:hover\s+\.shelf-arrow\s*\{([^}]+)\}/);
  assert(hoverMatch, 'Missing .shelf-section-header:hover .shelf-arrow rule');
  assertMatch(hoverMatch[1], /color:\s*var\(--accent\)/, 'Hover arrow color should use --accent');
  assertMatch(hoverMatch[1], /transform:\s*translateX\(2px\)/, 'Hover arrow should translateX(2px)');
});

test('CSS: .shelf-section-header has cursor:pointer (whole row clickable)', () => {
  // The second .shelf-section-header rule (line 678) adds cursor:pointer
  const cursorMatches = [...styleSection.matchAll(/\.shelf-section-header\s*\{([^}]*)\}/g)];
  const hasCursor = cursorMatches.some(m => /cursor:\s*pointer/.test(m[1]));
  assert(hasCursor, '.shelf-section-header missing cursor:pointer');
});

test('CSS: .shelf-section-header:hover has background for visual feedback', () => {
  const hoverMatches = [...styleSection.matchAll(/\.shelf-section-header:hover\s*\{([^}]*)\}/g)];
  const hasBg = hoverMatches.some(m => /background:/.test(m[1]));
  assert(hasBg, '.shelf-section-header:hover missing background');
});

test('HTML: renderShelf generates shelf-arrow with › character', () => {
  // Check both occurrences (CAT_ORDER loop and custom-cat loop)
  const arrowInstances = [...scriptSection.matchAll(/shelf-arrow[^>]*>\s*›/g)];
  assert(arrowInstances.length >= 2, `Expected ≥2 shelf-arrow › instances, got ${arrowInstances.length}`);
});

test('CSS: .shelf-count uses flex with align-items:center for arrow alignment', () => {
  assertMatch(styleSection, /\.shelf-count\s*\{[^}]*display:\s*flex/, '.shelf-count missing flex');
  assertMatch(styleSection, /\.shelf-count\s*\{[^}]*align-items:\s*center/, '.shelf-count missing align-items:center');
});

// ═══════════════════════════════════════════════════════════
//  ② 分类详情 2 列网格 (Category Detail 2-Column Grid)
// ═══════════════════════════════════════════════════════════
console.log('\n── ② 分类详情 2 列网格 ──');

test('CSS: Desktop .category-detail-grid uses 3-column layout', () => {
  // Find the base rule (NOT in @media) — look for the standalone rule
  const baseGridMatch = styleSection.match(/\.category-detail-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*1fr\)/);
  assert(baseGridMatch, 'Desktop .category-detail-grid should have repeat(3, 1fr)');
});

test('CSS: Mobile @media(max-width:767px) switches to 2-column grid', () => {
  assert(mobileMQ, 'Missing @media (max-width:767px) block');
  assertMatch(mobileMQ, /grid-template-columns:\s*repeat\(2,\s*1fr\)/, 'Mobile grid should be repeat(2, 1fr)');
});

test('CSS: Mobile grid has padding: 12px 16px', () => {
  assertMatch(mobileMQ, /padding:\s*12px\s+16px/, 'Mobile grid padding should be 12px 16px');
});

test('CSS: Mobile grid has gap: 10px', () => {
  assertMatch(mobileMQ, /gap:\s*10px/, 'Mobile grid gap should be 10px');
});

test('CSS: Mobile .category-detail-grid .book-cover has padding: 18px 14px', () => {
  assertMatch(mobileMQ, /\.category-detail-grid\s+\.book-cover[^}]*padding:\s*18px\s+14px/, 'Mobile book-cover padding should be 18px 14px');
});

test('CSS: Mobile .category-detail-grid .book-card has min-width: 150px', () => {
  assertMatch(mobileMQ, /\.category-detail-grid\s+\.book-card[^}]*min-width:\s*150px/, 'Mobile book-card missing min-width:150px');
});

test('CSS: Mobile .category-detail-header has padding: 12px 16px', () => {
  assertMatch(mobileMQ, /\.category-detail-header[^}]*padding:\s*12px\s+16px/, 'Mobile category-detail-header padding incorrect');
});

test('HTML: categoryDetailView DOM exists with grid, title, count elements', () => {
  assert(bodyHTML.includes('id="categoryDetailView"'), 'Missing #categoryDetailView');
  assert(bodyHTML.includes('id="categoryDetailGrid"'), 'Missing #categoryDetailGrid');
  assert(bodyHTML.includes('id="categoryDetailTitle"'), 'Missing #categoryDetailTitle');
  assert(bodyHTML.includes('id="categoryDetailCount"'), 'Missing #categoryDetailCount');
});

test('JS: renderCategoryDetail populates grid with renderBookCard', () => {
  assert(scriptSection.includes('categoryDetailGrid.innerHTML'), 'renderCategoryDetail missing grid.innerHTML');
  assert(scriptSection.includes('renderBookCard'), 'renderCategoryDetail should call renderBookCard');
});

test('JS: openCategoryDetail hides shelf container, shows detail view', () => {
  assert(scriptSection.includes("shelfContainer.style.display = 'none'"), 'openCategoryDetail should hide shelf');
  assert(scriptSection.includes("categoryDetailView.classList.remove('hidden')"), 'openCategoryDetail should show detail');
});

// ═══════════════════════════════════════════════════════════
//  ③ 预览页内容显示 (Preview Page Content Display)
// ═══════════════════════════════════════════════════════════
console.log('\n── ③ 预览页内容显示 ──');

test('CSS: #overlayBodyContent has height:100% and width:100%', () => {
  const rule = styleSection.match(/#overlayBodyContent\s*\{([^}]+)\}/);
  assert(rule, 'Missing #overlayBodyContent rule');
  assertMatch(rule[1], /height:\s*100%/, '#overlayBodyContent missing height:100%');
  assertMatch(rule[1], /width:\s*100%/, '#overlayBodyContent missing width:100%');
});

test('CSS: .overlay-body is flex:1 with relative positioning', () => {
  const rule = styleSection.match(/\.overlay-body\s*\{([^}]+)\}/);
  assert(rule, 'Missing .overlay-body rule');
  assertMatch(rule[1], /flex:\s*1/, '.overlay-body missing flex:1');
});

test('CSS: .overlay-body iframe fills parent (100% width/height)', () => {
  const rule = styleSection.match(/\.overlay-body\s+iframe\s*\{([^}]+)\}/);
  assert(rule, 'Missing .overlay-body iframe rule');
  assertMatch(rule[1], /width:\s*100%/, 'overlay-body iframe missing width:100%');
  assertMatch(rule[1], /height:\s*100%/, 'overlay-body iframe missing height:100%');
});

test('CSS: .preview-overlay uses flex-direction:column layout', () => {
  const rule = styleSection.match(/\.preview-overlay\s*\{([^}]+)\}/);
  assert(rule, 'Missing .preview-overlay rule');
  assertMatch(rule[1], /flex-direction:\s*column/, '.preview-overlay missing flex-direction:column');
});

test('HTML: previewOverlay DOM hierarchy complete', () => {
  assert(bodyHTML.includes('id="previewOverlay"'), 'Missing #previewOverlay');
  assert(bodyHTML.includes('id="overlayBody"'), 'Missing #overlayBody');
  assert(bodyHTML.includes('id="overlayBodyContent"'), 'Missing #overlayBodyContent');
  assert(bodyHTML.includes('id="overlayHeader"'), 'Missing #overlayHeader');
  assert(bodyHTML.includes('id="overlayTitle"'), 'Missing #overlayTitle');
});

test('JS: showPreview populates overlayBodyContent via buildIframeHTML', () => {
  assert(scriptSection.includes('buildIframeHTML(note, overlayBodyContent'), 'showPreview should build iframe in overlayBodyContent');
});

test('JS: showPreview removes hidden from previewOverlay on mobile', () => {
  assert(scriptSection.includes("previewOverlay.classList.remove('hidden')"), 'showPreview should show overlay');
});

test('JS: showPreview hides sidebar on mobile', () => {
  assert(scriptSection.includes("sidebar.classList.add('hidden')"), 'showPreview should hide sidebar');
});

test('JS: buildIframeHTML creates sandboxed iframe with title', () => {
  assert(scriptSection.includes('sandbox="allow-same-origin allow-scripts"'), 'iframe missing sandbox attribute');
  assert(scriptSection.includes('title="${escapeHtml(note.title)}"'), 'iframe missing title attribute');
});

test('JS: closePreviewOverlay cleans up properly', () => {
  assert(scriptSection.includes('closePreviewOverlay'), 'Missing closePreviewOverlay function');
  assert(scriptSection.includes("previewOverlay.classList.add('hidden')"), 'closePreviewOverlay should add hidden');
});

// ═══════════════════════════════════════════════════════════
//  快速回归 (Quick Regression)
// ═══════════════════════════════════════════════════════════
console.log('\n── 快速回归 ──');

test('REGRESSION: notes.json has 39 books', () => {
  assert(Array.isArray(notesJson), 'notes.json should be an array');
  assert(notesJson.length === 39, `Expected 39 books, got ${notesJson.length}`);
});

test('REGRESSION: notes.json items have required fields', () => {
  let missingCount = 0;
  for (const note of notesJson) {
    if (!note.title) missingCount++;
  }
  assert(missingCount === 0, `${missingCount} notes missing title field`);
});

test('REGRESSION: Search page DOM elements exist', () => {
  assert(bodyHTML.includes('id="searchPageInput"'), 'Missing search page input');
  assert(bodyHTML.includes('id="searchPage"'), 'Missing search page container');
  assert(bodyHTML.includes('id="searchResults"'), 'Missing search results area');
});

test('REGRESSION: Three bottom nav tabs — home/upload/profile', () => {
  const tabs = [...bodyHTML.matchAll(/data-tab="(home|upload|profile)"/g)];
  const tabSet = new Set(tabs.map(m => m[1]));
  assert(tabSet.has('home'), 'Missing home tab');
  assert(tabSet.has('upload'), 'Missing upload tab');
  assert(tabSet.has('profile'), 'Missing profile tab');
});

test('REGRESSION: Desktop tab bar has 3 tabs', () => {
  const tabButtons = [...bodyHTML.matchAll(/class="tab-btn[^"]*"\s+data-tab=/g)];
  assert(tabButtons.length >= 3, `Expected ≥3 desktop tab buttons, got ${tabButtons.length}`);
});

test('REGRESSION: switchTab function handles tab switching', () => {
  assert(scriptSection.includes('function switchTab'), 'Missing switchTab function');
  // Uses classList.toggle for tab activation
  assert(scriptSection.includes("classList.toggle('active'"), 'switchTab should toggle active classes');
});

test('REGRESSION: IndexedDB operations exist for persistence', () => {
  assert(scriptSection.includes('indexedDB') || scriptSection.includes('IDBDatabase'), 'Missing IndexedDB operations');
});

test('REGRESSION: JS — balanced curly braces', () => {
  let braceCount = 0;
  for (const ch of scriptSection) {
    if (ch === '{') braceCount++;
    if (ch === '}') braceCount--;
  }
  assert(braceCount === 0, `Unbalanced braces: net ${braceCount}`);
});

test('REGRESSION: JS — balanced parentheses', () => {
  let parenCount = 0;
  let inString = false;
  let stringChar = '';
  for (let i = 0; i < scriptSection.length; i++) {
    const ch = scriptSection[i];
    if (inString) {
      if (ch === '\\') { i++; continue; }
      if (ch === stringChar) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inString = true; stringChar = ch; continue; }
    if (ch === '(') parenCount++;
    if (ch === ')') parenCount--;
  }
  assert(parenCount === 0, `Unbalanced parentheses: net ${parenCount}`);
});

test('REGRESSION: CAT_ORDER and CAT_COLORS defined', () => {
  assert(scriptSection.includes('CAT_ORDER'), 'Missing CAT_ORDER');
  assert(scriptSection.includes('CAT_COLORS'), 'Missing CAT_COLORS');
});

test('REGRESSION: renderShelf exists and groups by category', () => {
  assert(scriptSection.includes('function renderShelf'), 'Missing renderShelf function');
  assert(scriptSection.includes('shelf-section-header'), 'renderShelf should create shelf sections');
});

// ═══════════════════════════════════════════════════════════
//  Report
// ═══════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(60));
console.log('  TEST REPORT');
console.log('='.repeat(60));
console.log(`  Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
console.log(`  Success Rate: ${((passed / results.length) * 100).toFixed(1)}%`);
console.log('='.repeat(60));

if (failed > 0) {
  console.log('\n  FAILED TESTS:');
  for (const r of results) {
    if (r.status === 'FAIL') {
      console.log(`    ✗ ${r.name}`);
      console.log(`      → ${r.error}`);
    }
  }
}

console.log('');

process.exit(failed > 0 ? 1 : 0);
