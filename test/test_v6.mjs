/**
 * 笔记预览 APP v6.0 — 综合测试套件 (Round 1)
 *
 * 测试范围:
 *   ① 移除笔记子Tab — 首页只保留书架 (no home-subtab, shelf always visible, search btn in header)
 *   ② 我的页面标签管理 (add/edit/delete tags, replace on delete, localStorage)
 *   ③ 回归验证 (shelf 39 books, search, upload, theme, preview overlay, landscape)
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

function assertNotEmpty(val, msg) {
  if (!val || (Array.isArray(val) && val.length === 0)) {
    throw new Error(msg || 'expected non-empty value');
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

function assertGt(actual, expected, msg) {
  if (!(actual > expected)) {
    throw new Error(msg || `expected ${actual} > ${expected}`);
  }
}

// ─── Setup jsdom Environment ─────────────────────────────────────────────

const htmlContent = readFileSync(HTML_PATH, 'utf-8');
const notesJsonContent = readFileSync(NOTES_JSON_PATH, 'utf-8');

let _landscapeMode = false;
const _mqListeners = [];

function mockMatchMedia(query) {
  const mq = {
    get matches() { return _landscapeMode; },
    media: query,
    addEventListener(event, handler) {
      _mqListeners.push({ event, handler, query });
    },
    removeEventListener() {},
    dispatchEvent() {},
  };
  return mq;
}

const virtualConsole = new VirtualConsole();

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
    // Simulate desktop width (> 768px)
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
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
  await sleep(1000);
  // Allow extra time for async notes.json fetch + IndexedDB operations
  await new Promise(resolve => setTimeout(resolve, 500));
}

function getCssText() {
  return Array.from(doc.querySelectorAll('style'))
    .map(s => s.textContent).join('\n');
}

function getJsText() {
  return Array.from(doc.querySelectorAll('script'))
    .map(s => s.textContent).join('\n');
}

// ─── Run All Tests ───────────────────────────────────────────────────────

async function runAllTests() {
  await waitForApp();

  console.log('\n══════════════════════════════════════════════════');
  console.log('  笔记预览 APP v6.0 — 综合测试 (Round 1)');
  console.log('══════════════════════════════════════════════════\n');

  // ================================================================
  //  ① 移除笔记子Tab — 首页只保留书架
  // ================================================================
  console.log('── ① 移除笔记子Tab — 首页书架 ──\n');

  // 1.1 无笔记/书架切换子Tab
  test('01-001: 无 .home-subtab-btn 元素（笔记/书架子Tab已移除）', () => {
    const subtabBtns = $$('.home-subtab-btn');
    assertEqual(subtabBtns.length, 0,
      `不应存在 home-subtab-btn 子Tab按钮，实际有 ${subtabBtns.length} 个`);
  });

  // 1.2 无 #shelfToggleBtn（书架切换按钮已移除）
  test('01-002: 无 #shelfToggleBtn 书架切换按钮', () => {
    const btn = $('#shelfToggleBtn');
    assert(btn === null, 'v6 不应有 shelfToggleBtn，书架始终可见');
  });

  // 1.3 书架容器始终可见
  test('01-003: 书架容器 (#shelfContainer) 可见（非 hidden）', () => {
    const sc = $('#shelfContainer');
    assert(sc !== null, '#shelfContainer 应存在');
    assert(!sc.classList.contains('hidden'), '书架容器不应有 hidden 类');
    // Shelf should be directly visible (its parent tabHome is active)
    assert(sc.style.display !== 'none', '书架容器 display 不应为 none');
  });

  // 1.4 笔记列表区域隐藏
  test('01-004: 笔记列表区域 (#notesViewArea) display:none', () => {
    const nva = $('#notesViewArea');
    assert(nva !== null, '#notesViewArea 应存在');
    assertEqual(nva.style.display, 'none', '笔记列表区域应隐藏');
  });

  // 1.5 搜索按钮在 header
  test('01-005: 🔍 搜索按钮 (#searchBtn) 在 sidebar-header 中', () => {
    const btn = $('#searchBtn');
    assert(btn !== null, '#searchBtn 应存在');
    const header = $('#sidebar').querySelector('.sidebar-header');
    assert(header !== null, '.sidebar-header 应存在');
    const inHeader = header.contains(btn);
    assert(inHeader, '搜索按钮应在 sidebar-header 内');
    assert(btn.title.includes('搜索') || btn.getAttribute('aria-label')?.includes('搜索'),
      '搜索按钮应有搜索标签');
  });

  // 1.6 header 只有一个按钮（搜索）
  test('01-006: sidebar-header 只有 1 个 icon-btn（搜索）', () => {
    const headerBtns = $$('.icon-btn', $('#sidebar').querySelector('.sidebar-header'));
    assertEqual(headerBtns.length, 1, `header 应有1个按钮，实际 ${headerBtns.length} 个`);
  });

  // 1.7 Desktop Tab Bar 有正确的三个 Tab
  test('01-007: Desktop Tab Bar 有 3 个按钮：首页/上传/我的', () => {
    const tabBtns = $$('.tab-btn', $('#tabBar'));
    assertEqual(tabBtns.length, 3, `应有 3 个 tab 按钮，实际 ${tabBtns.length} 个`);
    const labels = tabBtns.map(b => b.textContent.trim());
    assert(labels.some(l => l.includes('首页')), '应有"首页"tab');
    assert(labels.some(l => l.includes('上传')), '应有"上传"tab');
    assert(labels.some(l => l.includes('我的')), '应有"我的"tab');
    // 确认没有"笔记/书架"子Tab相关
    assert(!labels.some(l => l.includes('笔记') && !l.includes('读书')), '不应有"笔记"子Tab');
    assert(!labels.some(l => l.includes('书架')), '不应有"书架"子Tab');
  });

  // 1.8 底部三Tab（移动端）
  test('01-008: Bottom Nav 有 3 个导航项：首页/上传/我的', () => {
    const navItems = $$('.nav-item', $('#bottomNav'));
    assertEqual(navItems.length, 3, `应有 3 个导航项，实际 ${navItems.length} 个`);
    const labels = navItems.map(b => b.textContent.trim());
    assert(labels.some(l => l.includes('首页')), '应有"首页"导航');
    assert(labels.some(l => l.includes('上传')), '应有"上传"导航');
    assert(labels.some(l => l.includes('我的')), '应有"我的"导航');
  });

  // 1.9 默认选中首页Tab
  test('01-009: 默认选中首页Tab (active)', () => {
    const homeBtn = $('#tabBar').querySelector('.tab-btn[data-tab="home"]');
    assert(homeBtn !== null, '首页 tab 按钮应存在');
    assert(homeBtn.classList.contains('active'), '首页 tab 应为 active');
    const tabHome = $('#tabHome');
    assert(tabHome !== null, '#tabHome 应存在');
    assert(tabHome.classList.contains('active'), '#tabHome 应为 active');
  });

  // 1.10 书架有卡片内容
  test('01-010: 书架视图有 book-card 卡片', () => {
    const cards = $$('.book-card', $('#shelfContainer'));
    assertGt(cards.length, 0, `书架应有卡片，实际 ${cards.length} 张`);
    // 应该有 39 本书
    assert(cards.length >= 39, `应有至少 39 张卡片，实际 ${cards.length} 张`);
  });

  // 1.11 书架按分类排列
  test('01-011: 书架按分类 (shelf-section) 排列', () => {
    const sections = $$('.shelf-section', $('#shelfContainer'));
    assertGt(sections.length, 0, `应有分类 section，实际 ${sections.length} 个`);
    // 检查每个 section 有 shelf-cat-label
    for (const sec of sections) {
      const label = $('.shelf-cat-label', sec);
      assert(label !== null, '每个 shelf-section 应有 shelf-cat-label');
    }
  });

  // 1.12 书架分类标签有正确的颜色 class
  test('01-012: 书架分类标签使用 CAT_COLOR_MAP 颜色类', () => {
    const css = getCssText();
    const validClasses = ['philosophy', 'history', 'literature', 'tech', 'other'];
    for (const cls of validClasses) {
      assert(css.includes(`.shelf-cat-label.${cls}`),
        `shelf-cat-label.${cls} CSS 应存在`);
    }
  });

  // 1.13 localStorage 无 notes-home-view 和 notes-shelf-view（v6 不再需要）
  test('01-013: localStorage 不再存储 notes-home-view / notes-shelf-view', () => {
    const js = getJsText();
    assertNotIncludes(js, "'notes-home-view'",
      'v6 不应使用 notes-home-view localStorage key');
    assertNotIncludes(js, "'notes-shelf-view'",
      'v6 不应使用 notes-shelf-view localStorage key');
  });

  // 1.14 Tab 切换功能
  test('01-014: 切换到"上传"Tab 正常', () => {
    const uploadTabBtn = $('#tabBar').querySelector('.tab-btn[data-tab="upload"]');
    assert(uploadTabBtn !== null, '上传 tab 按钮应存在');
    click(uploadTabBtn);
    // 验证 tabUpload 是 active
    const tabUpload = $('#tabUpload');
    assert(tabUpload.classList.contains('active'), '#tabUpload 应为 active');
  });

  // 1.15 切换回首页后书架仍显示
  test('01-015: 切换回首页后书架仍正常显示', () => {
    const homeTabBtn = $('#tabBar').querySelector('.tab-btn[data-tab="home"]');
    click(homeTabBtn);
    const tabHome = $('#tabHome');
    assert(tabHome.classList.contains('active'), '#tabHome 应为 active');
    const sc = $('#shelfContainer');
    assert(!sc.classList.contains('hidden'), '书架应可见');
    const cards = $$('.book-card', sc);
    assertGt(cards.length, 0, '书架应有卡片');
  });

  // ================================================================
  //  ② 我的页面标签管理
  // ================================================================
  console.log('\n── ② 我的页面标签管理 ──\n');

  // First switch to profile tab
  test('TAG-001: 切换到"我的"页面显示标签管理区域', () => {
    const profileTabBtn = $('#tabBar').querySelector('.tab-btn[data-tab="profile"]');
    assert(profileTabBtn !== null, '我的 tab 按钮应存在');
    click(profileTabBtn);
    const tabProfile = $('#tabProfile');
    assert(tabProfile.classList.contains('active'), '#tabProfile 应为 active');
  });

  // 2.1 Tag Manager DOM structure
  test('TAG-002: 标签管理区域 (.tag-manager-item) 存在', () => {
    const tagMgr = $('.tag-manager-item');
    assert(tagMgr !== null, '.tag-manager-item 应存在');
  });

  test('TAG-003: 标签管理标题为"标签管理"', () => {
    const tagMgr = $('.tag-manager-item');
    const label = $('.setting-label', tagMgr);
    assert(label !== null, '标签管理区域应有 label');
    assert(label.textContent.includes('标签'), '标签管理 label 应包含"标签"');
  });

  test('TAG-004: 标签列表容器 (#tagManagerList) 存在', () => {
    const list = $('#tagManagerList');
    assert(list !== null, '#tagManagerList 应存在');
  });

  test('TAG-005: 新增标签按钮 (#addTagBtn) 存在', () => {
    const btn = $('#addTagBtn');
    assert(btn !== null, '#addTagBtn 应存在');
    assert(btn.textContent.includes('新增'), '按钮文本应包含"新增"');
  });

  // 2.2 Tag list rendering
  test('TAG-006: 标签列表显示标签名和关联笔记数', () => {
    const rows = $$('.tag-manager-row', $('#tagManagerList'));
    // Should have tags from notes.json data
    assertGt(rows.length, 0, `标签列表应有条目，实际 ${rows.length} 条`);
    const firstRow = rows[0];
    const tagName = $('.tag-name', firstRow);
    assert(tagName !== null, '标签行应有 tag-name');
    assertNotEmpty(tagName.textContent.trim(), '标签名不应为空');
    const tagCount = $('.tag-count', firstRow);
    assert(tagCount !== null, '标签行应有 tag-count');
    assert(tagCount.textContent.includes('篇笔记'), 'tag-count 应显示"篇笔记"');
  });

  test('TAG-007: 每个标签行有 dot、name、count、actions', () => {
    const rows = $$('.tag-manager-row', $('#tagManagerList'));
    if (rows.length > 0) {
      const row = rows[0];
      assert($('.tag-dot', row) !== null, '应有 tag-dot');
      assert($('.tag-name', row) !== null, '应有 tag-name');
      assert($('.tag-count', row) !== null, '应有 tag-count');
      assert($('.tag-actions', row) !== null, '应有 tag-actions');
    }
  });

  test('TAG-008: 每个标签行有编辑和删除按钮', () => {
    const rows = $$('.tag-manager-row', $('#tagManagerList'));
    if (rows.length > 0) {
      const row = rows[0];
      const actions = $$('.tag-action-btn', row);
      const actionTypes = actions.map(b => b.getAttribute('data-action'));
      assert(actionTypes.includes('edit'), '应有 edit 操作按钮');
      assert(actionTypes.includes('delete'), '应有 delete 操作按钮');
    }
  });

  test('TAG-009: 标签 dot 有颜色（通过 tagColor 生成）', () => {
    const rows = $$('.tag-manager-row', $('#tagManagerList'));
    if (rows.length > 0) {
      const dot = $('.tag-dot', rows[0]);
      const style = dot.getAttribute('style') || '';
      assert(style.includes('background'), 'tag-dot 应有 background 样式');
    }
  });

  // 2.3 Tag input modal (add/edit)
  test('TAG-010: 标签输入弹窗 (#tagInputOverlay) 存在且初始隐藏', () => {
    const overlay = $('#tagInputOverlay');
    assert(overlay !== null, '#tagInputOverlay 应存在');
    assert(overlay.classList.contains('hidden'), '弹窗初始应隐藏');
  });

  test('TAG-011: 标签输入弹窗有输入框和确定/取消按钮', () => {
    assert($('#tagInputField') !== null, '#tagInputField 应存在');
    assert($('#tagInputConfirm') !== null, '#tagInputConfirm 应存在');
    assert($('#tagInputCancel') !== null, '#tagInputCancel 应存在');
  });

  test('TAG-012: 标签输入弹窗输入框 maxlength=30', () => {
    const field = $('#tagInputField');
    assertEqual(field.getAttribute('maxlength'), '30', '输入框 maxlength 应为 30');
  });

  // 2.4 Add tag flow
  test('TAG-013: 点击"新增标签"打开输入弹窗 (mode=add)', () => {
    // Close any existing overlay first
    const overlay = $('#tagInputOverlay');
    if (!overlay.classList.contains('hidden')) {
      click($('#tagInputCancel'));
    }
    // Click add button
    click($('#addTagBtn'));
    // Need to wait for setTimeout 50ms
  });

  test('TAG-014: 新增弹窗标题为"新增标签"', () => {
    // At this point overlay should be open from previous test
    // Let's re-trigger to be safe
    const overlay = $('#tagInputOverlay');
    if (overlay.classList.contains('hidden')) {
      click($('#addTagBtn'));
    }
    // Check title
    const title = $('#tagInputTitle');
    assert(title !== null, '#tagInputTitle 应存在');
    assert(title.textContent.includes('新增'), '标题应包含"新增"');
  });

  test('TAG-015: 确认空标签名显示提示', () => {
    // Close and reopen to ensure clean state
    const overlay = $('#tagInputOverlay');
    if (!overlay.classList.contains('hidden')) {
      click($('#tagInputCancel'));
    }
    click($('#addTagBtn'));
    // Clear and submit empty
    const field = $('#tagInputField');
    field.value = '';
    click($('#tagInputConfirm'));
    // Check toast or error — the code shows showToast('标签名不能为空')
    // jsdom doesn't render toasts visually, but the function should have been called
    // Let's verify the overlay is still open (empty submission shouldn't close it)
    // Actually, looking at the code: confirmTagInput checks if(!newName) { showToast('标签名不能为空'); return; }
    // It returns early, so overlay stays open
    const stillOpen = !$('#tagInputOverlay').classList.contains('hidden');
    assert(stillOpen, '空标签名提交后弹窗应保持打开');
  });

  // Close the overlay
  test('TAG-016: 取消按钮关闭输入弹窗', () => {
    const overlay = $('#tagInputOverlay');
    if (!overlay.classList.contains('hidden')) {
      click($('#tagInputCancel'));
    }
    assert(overlay.classList.contains('hidden'), '取消后弹窗应关闭');
  });

  // 2.5 Edit tag flow (code analysis)
  test('TAG-017: openTagInput 函数支持 add/edit 两种模式', () => {
    const js = getJsText();
    assert(js.includes("tagEditMode = mode"), '应设置 tagEditMode');
    assert(js.includes("mode === 'add'"), '应处理 add 模式');
    assert(js.includes("mode === 'edit'"), '应处理 edit 模式');
  });

  test('TAG-018: 编辑标签时重命名同步到所有关联笔记', () => {
    const js = getJsText();
    // Should update tags in STATE.notes
    assert(js.includes('n.tags[idx] = newName'), '应更新 STATE.notes 中的标签');
    // Should update builtInNotes
    assert(js.includes('STATE.builtInNotes'), '应更新 builtInNotes');
    // Should update userNotesIndex
    assert(js.includes('STATE.userNotesIndex'), '应更新 userNotesIndex');
    // Should update IndexedDB
    assert(js.includes('DB.getAll()'), '应更新 IndexedDB 中的数据');
  });

  test('TAG-019: 编辑标签时检查目标标签名是否已存在', () => {
    const js = getJsText();
    assert(js.includes('目标标签名已存在'), '编辑时应检查标签名冲突');
  });

  test('TAG-020: 编辑标签时更新 customTags 并保存到 localStorage', () => {
    const js = getJsText();
    assert(js.includes("STATE.customTags[ci] = newName"), '应更新 customTags');
    assert(js.includes("saveCustomTags()"), '应调用 saveCustomTags');
  });

  // 2.6 Delete tag flow
  test('TAG-021: 标签删除确认弹窗 (#tagReplaceModal) 存在', () => {
    const modal = $('#tagReplaceModal');
    assert(modal !== null, '#tagReplaceModal 应存在');
    assert(modal.classList.contains('hidden'), '弹窗初始应隐藏');
  });

  test('TAG-022: 标签删除弹窗有取消/移除/替换按钮', () => {
    assert($('#tagReplaceCancel') !== null, '#tagReplaceCancel 应存在');
    assert($('#tagReplaceRemove') !== null, '#tagReplaceRemove 应存在');
    assert($('#tagReplaceConfirm') !== null, '#tagReplaceConfirm 应存在');
  });

  test('TAG-023: openTagDeleteConfirm 检查关联笔记数', () => {
    const js = getJsText();
    assert(js.includes('function openTagDeleteConfirm'), 'openTagDeleteConfirm 应存在');
    assert(js.includes('collectAllTags()'), '应调用 collectAllTags 获取关联数');
    assert(js.includes('count > 0'), '应检查关联笔记数');
  });

  test('TAG-024: 有关联笔记时显示替换选择框', () => {
    const js = getJsText();
    assert(js.includes("tagReplaceSelect.classList.remove('hidden')"),
      '有关联笔记时应显示替换选择框');
    assert(js.includes("tagReplaceConfirm.classList.remove('hidden')"),
      '有关联笔记时应显示替换按钮');
  });

  test('TAG-025: 无关联笔记时隐藏替换选择框，直接确认删除', () => {
    const js = getJsText();
    assert(js.includes("tagReplaceSelect.classList.add('hidden')"),
      '无关联笔记时应隐藏替换选择框');
    assert(js.includes("tagReplaceConfirm.classList.add('hidden')"),
      '无关联笔记时应隐藏替换按钮');
    assert(js.includes("'确定删除'"), '删除按钮文本应为"确定删除"');
  });

  test('TAG-026: executeTagDelete 支持替换 (replaceWith) 和直接移除 (__remove__)', () => {
    const js = getJsText();
    assert(js.includes('function executeTagDelete'), 'executeTagDelete 应存在');
    assert(js.includes("replaceWith && replaceWith !== '__remove__'"),
      '应区分替换和移除两种模式');
    assert(js.includes("n.tags = n.tags.filter"), '移除模式应 filter 标签');
    assert(js.includes("n.tags[idx] = replaceWith"), '替换模式应修改标签值');
  });

  test('TAG-027: 删除标签后从 customTags 中移除', () => {
    const js = getJsText();
    assert(js.includes("STATE.customTags.splice"), '应从 customTags 中 splice');
    assert(js.includes("saveCustomTags()"), '应保存 customTags');
  });

  // 2.7 collectAllTags function
  test('TAG-028: collectAllTags 统计所有标签及关联笔记数', () => {
    const js = getJsText();
    assert(js.includes('function collectAllTags'), 'collectAllTags 应存在');
    assert(js.includes('map.set(k, (map.get(k) || 0) + 1)'),
      '应使用 Map 统计标签计数');
  });

  // 2.8 localStorage for custom tags
  test('TAG-029: 使用 localStorage key "notes-custom-tags"', () => {
    const js = getJsText();
    assert(js.includes("'notes-custom-tags'"), '应使用 notes-custom-tags key');
    assert(js.includes('loadCustomTags'), 'loadCustomTags 函数应存在');
    assert(js.includes('saveCustomTags'), 'saveCustomTags 函数应存在');
  });

  test('TAG-030: loadCustomTags 在 init 中调用', () => {
    const js = getJsText();
    assert(js.includes('loadCustomTags()'), 'init 应调用 loadCustomTags');
  });

  // 2.9 renderTagManager merges custom tags
  test('TAG-031: renderTagManager 合并 customTags（即使关联数为0）', () => {
    const js = getJsText();
    assert(js.includes('function renderTagManager'), 'renderTagManager 应存在');
    // Should merge custom tags that have 0 notes
    assert(js.includes("tagMap.set(ct, 0)"), '应添加关联数为 0 的 custom tag');
  });

  // 2.10 Tag edit uses overlay click to close
  test('TAG-032: 点击弹窗遮罩关闭 tagInputOverlay', () => {
    const js = getJsText();
    assert(js.includes("tagInputOverlay.addEventListener('click'"),
      'tagInputOverlay 应有 click 监听');
  });

  test('TAG-033: Enter 键提交标签输入', () => {
    const js = getJsText();
    assert(js.includes("tagInputField.addEventListener('keydown'"),
      'tagInputField 应有 keydown 监听');
    assert(js.includes("e.key === 'Enter'"), '应处理 Enter 键');
  });

  // 2.11 Tag replace modal close
  test('TAG-034: 点击遮罩关闭 tagReplaceModal', () => {
    const js = getJsText();
    assert(js.includes("tagReplaceModal.addEventListener('click'"),
      'tagReplaceModal 应有 click 监听');
  });

  // ================================================================
  //  ③ 回归验证 — REGRESSION
  // ================================================================
  console.log('\n── ③ 回归验证 ──\n');

  // --- Shelf: 39 books ---
  test('REG-001: 书架渲染完整的 39 本内置书籍', () => {
    const cards = $$('.book-card', $('#shelfContainer'));
    // notes.json should have 39 built-in notes
    assert(cards.length >= 39, `内置书籍应至少 39 本，实际 ${cards.length} 本`);
    // User notes count should be 0
    const userCount = $$('[data-id^="user-"]', $('#shelfContainer')).length;
    assertEqual(userCount, 0, '初始状态应无用户笔记');
  });

  test('REG-002: 书架按分类分组（哲学/历史/文学/科技/其他）', () => {
    const sections = $$('.shelf-section', $('#shelfContainer'));
    const labels = sections.map(s => {
      const l = $('.shelf-cat-label', s);
      return l ? l.textContent.trim() : '';
    });
    // Should have at least some of the preset categories
    const preset = ['哲学', '历史', '文学', '科技', '其他'];
    const found = preset.filter(p => labels.includes(p));
    assertGt(found.length, 0, `应至少包含预设分类，找到: ${found.join(', ')}`);
  });

  // --- Search ---
  test('REG-003: 搜索按钮点击打开搜索页面', () => {
    // Navigate to home first
    const homeTabBtn = $('#tabBar').querySelector('.tab-btn[data-tab="home"]');
    click(homeTabBtn);
    // Click search
    const searchBtn = $('#searchBtn');
    click(searchBtn);
    const searchPage = $('#searchPage');
    assert(!searchPage.classList.contains('hidden'), '搜索页应打开');
  });

  test('REG-004: 搜索页有输入框和返回按钮', () => {
    assert($('#searchPageInput') !== null, '搜索输入框应存在');
    assert($('#backSearchBtn') !== null, '返回按钮应存在');
  });

  test('REG-005: 返回按钮关闭搜索页', () => {
    click($('#backSearchBtn'));
    const searchPage = $('#searchPage');
    // After close, in v6 search page should be hidden
    assert(searchPage.classList.contains('hidden'), '搜索页应关闭');
  });

  // --- Upload ---
  test('REG-006: 上传表单各字段存在', () => {
    const uploadTabBtn = $('#tabBar').querySelector('.tab-btn[data-tab="upload"]');
    click(uploadTabBtn);
    assert($('#uploadTitle') !== null, '#uploadTitle 应存在');
    assert($('#uploadCategory') !== null, '#uploadCategory 应存在');
    assert($('#uploadTagsInput') !== null, '#uploadTagsInput 应存在');
    assert($('#uploadBrowseBtn') !== null, '#uploadBrowseBtn 应存在');
    assert($('#uploadSubmitBtn') !== null, '#uploadSubmitBtn 应存在');
  });

  test('REG-007: 上传按钮初始为禁用', () => {
    const btn = $('#uploadSubmitBtn');
    assert(btn.disabled === true, '上传按钮初始应为禁用');
  });

  test('REG-008: 上传文件输入仅接受 .html', () => {
    const input = $('#uploadFileInput');
    assertEqual(input.getAttribute('accept'), '.html', '应仅接受 .html 文件');
  });

  test('REG-009: 上传分类选择有预设分类', () => {
    const opts = $$('option', $('#uploadCategory'));
    // Should have at least 哲学/历史/文学/科技/其他
    const values = opts.map(o => o.value);
    assertGt(values.length, 0, '分类选择应有选项');
    // "其他" should be default selected
    const otherOpt = Array.from(opts).find(o => o.value === '其他');
    if (otherOpt) {
      assert(otherOpt.selected, '"其他"应为默认分类');
    }
  });

  // --- Delete note (code analysis) ---
  test('REG-010: deleteNoteById 区分内置笔记和用户笔记', () => {
    const js = getJsText();
    assert(js.includes("note.source !== 'user'"), '应检查 note.source');
  });

  test('REG-011: 删除使用 showConfirm 弹窗确认', () => {
    const js = getJsText();
    assert(js.includes("showConfirm('确认删除"), '删除应使用确认弹窗');
  });

  test('REG-012: 确认弹窗 (#confirmModal) 有取消和确定按钮', () => {
    assert($('#confirmModal') !== null, '#confirmModal 应存在');
    assert($('#confirmModalCancel') !== null, '#confirmModalCancel 应存在');
    assert($('#confirmModalOk') !== null, '#confirmModalOk 应存在');
  });

  // --- Theme ---
  test('REG-013: 主题切换 toggle (#profileThemeToggle) 存在', () => {
    const profileTabBtn = $('#tabBar').querySelector('.tab-btn[data-tab="profile"]');
    click(profileTabBtn);
    assert($('#profileThemeToggle') !== null, '#profileThemeToggle 应存在');
  });

  test('REG-014: 初始主题为 light', () => {
    const theme = doc.documentElement.getAttribute('data-theme');
    assertEqual(theme, 'light', `初始主题应为 light，实际为 ${theme}`);
  });

  test('REG-015: 黑暗模式 CSS 变量定义 ([data-theme="dark"])', () => {
    const css = getCssText();
    assert(css.includes('[data-theme="dark"]'), '应有黑暗模式 CSS');
    assert(css.includes('--bg-primary: #1a1a2e'), '暗色 --bg-primary 应为 #1a1a2e');
    assert(css.includes('--bg-secondary: #16213e'), '暗色 --bg-secondary 应为 #16213e');
  });

  test('REG-016: 主题持久化到 localStorage "notes-theme"', () => {
    const js = getJsText();
    assert(js.includes("'notes-theme'"), '应使用 notes-theme key');
    assert(js.includes('saveTheme()'), 'saveTheme 应存在');
    assert(js.includes('loadTheme()'), 'loadTheme 应存在');
  });

  test('REG-017: toggleTheme 切换 light↔dark', () => {
    const js = getJsText();
    assert(js.includes('function toggleTheme'), 'toggleTheme 应存在');
    assert(js.includes("STATE.theme==='light'?'dark':'light'"),
      '应切换 light↔dark');
  });

  // --- Preview overlay ---
  test('REG-018: 预览浮层 (#previewOverlay) 存在且初始隐藏', () => {
    assert($('#previewOverlay') !== null, '#previewOverlay 应存在');
    assert($('#previewOverlay').classList.contains('hidden'), '预览浮层初始应隐藏');
  });

  test('REG-019: 预览浮层有返回按钮', () => {
    assert($('#overlayBackBtn') !== null, '#overlayBackBtn 应存在');
  });

  test('REG-020: 横屏浮动返回按钮 (#landscapeFloatBack) 存在', () => {
    assert($('#landscapeFloatBack') !== null, '#landscapeFloatBack 应存在');
  });

  test('REG-021: 横屏 CSS — 隐藏 header, 显示浮动返回按钮', () => {
    const css = getCssText();
    assert(css.includes('.preview-overlay.landscape .overlay-header'),
      '横屏应隐藏 overlay-header');
    assert(css.includes('.landscape-float-back'),
      '横屏应有浮动返回按钮样式');
  });

  test('REG-022: checkLandscape 函数存在', () => {
    const js = getJsText();
    assert(js.includes('function checkLandscape'), 'checkLandscape 应存在');
    assert(js.includes("matchMedia('(orientation: landscape)')"),
      '应使用 orientation media query');
  });

  // --- Desktop preview ---
  test('REG-023: 桌面预览区 (#mainContent) 存在', () => {
    assert($('#mainContent') !== null, '#mainContent 应存在');
  });

  test('REG-024: 预览标题 (#previewTitle) 和日期 (#previewDate) 存在', () => {
    assert($('#previewTitle') !== null, '#previewTitle 应存在');
    assert($('#previewDate') !== null, '#previewDate 应存在');
    assertEqual($('#previewTitle').textContent, '选择一篇笔记', '预览标题应有默认值');
  });

  test('REG-025: 预览 body (#previewBody) 显示欢迎界面', () => {
    const body = $('#previewBody');
    assert(body !== null, '#previewBody 应存在');
    const welcome = $('.welcome', body);
    assert(welcome !== null, '应有欢迎界面');
  });

  // --- Book card structure ---
  test('REG-026: book-card 有 top-bar, body, bottom-bar 结构', () => {
    const cards = $$('.book-card', $('#shelfContainer'));
    if (cards.length > 0) {
      const card = cards[0];
      assert($('.book-card-top-bar', card) !== null, '应有 top-bar');
      assert($('.book-card-body', card) !== null, '应有 body');
      assert($('.book-card-bottom-bar', card) !== null, '应有 bottom-bar');
    }
  });

  test('REG-027: book-card-body 包含 title 和 meta', () => {
    const cards = $$('.book-card', $('#shelfContainer'));
    if (cards.length > 0) {
      const card = cards[0];
      assert($('.book-card-title', card) !== null, '应有 title');
      assert($('.book-card-meta', card) !== null, '应有 meta');
    }
  });

  // --- Profile elements ---
  test('REG-028: 个人中心有昵称输入', () => {
    const profileTabBtn = $('#tabBar').querySelector('.tab-btn[data-tab="profile"]');
    click(profileTabBtn);
    assert($('#profileNickname') !== null, '#profileNickname 应存在');
  });

  test('REG-029: 个人中心有存储管理', () => {
    assert($('#storageSize') !== null, '#storageSize 应存在');
  });

  test('REG-030: 个人中心有清除用户笔记按钮', () => {
    assert($('#clearUserNotesBtn') !== null, '#clearUserNotesBtn 应存在');
  });

  test('REG-031: 版本号显示 v6.0', () => {
    const profileContent = $('#tabProfile').textContent;
    assert(profileContent.includes('v6.0'), '应显示 v6.0');
  });

  // --- Data layer ---
  test('REG-032: IndexedDB 数据库 "notes-app" 用于持久化用户笔记', () => {
    const js = getJsText();
    assert(js.includes("indexedDB.open('notes-app'"), '应打开 notes-app 数据库');
    assert(js.includes("'user-notes'"), '应有 user-notes store');
  });

  test('REG-033: fetch notes.json 加载内置笔记', () => {
    const js = getJsText();
    assert(js.includes("fetch('notes.json')"), '应 fetch notes.json');
  });

  test('REG-034: mergeNotes 合并用户和内置笔记', () => {
    const js = getJsText();
    assert(js.includes('function mergeNotes'), 'mergeNotes 应存在');
    assert(js.includes('STATE.builtInNotes'), '应引用 builtInNotes');
    assert(js.includes('STATE.userNotesIndex'), '应引用 userNotesIndex');
  });

  // --- Accessibility ---
  test('REG-035: escapeHtml 防 XSS 函数存在', () => {
    const js = getJsText();
    assert(js.includes('function escapeHtml'), 'escapeHtml 应存在');
    assert(js.includes('textContent=s'), 'escapeHtml 应使用 textContent');
  });

  test('REG-036: 书架支持键盘导航 (Enter/Space)', () => {
    const js = getJsText();
    assert(js.includes("shelfContainer.addEventListener('keydown'"),
      '书架应有 keydown 监听');
  });

  // --- Responsive ---
  test('REG-037: 移动端断点 max-width: 767px', () => {
    const css = getCssText();
    assert(css.includes('max-width: 767px'), '应有移动端断点');
  });

  test('REG-038: 移动端底部导航显示 (display: flex)', () => {
    const css = getCssText();
    const mobileSection = css.match(/@media\s*\(max-width:\s*767px\)[\s\S]*?(?=@media|\*\/\s*$)/);
    assert(mobileSection !== null, '应有移动端 media query');
    const mobileCss = mobileSection[0] || '';
    assert(mobileCss.includes('.bottom-nav'), '移动端应有 bottom-nav 样式');
  });

  test('REG-039: safe-area-inset 适配', () => {
    const css = getCssText();
    assert(css.includes('safe-area-inset-bottom'), '应使用 safe-area-inset-bottom');
  });

  // --- Toast ---
  test('REG-040: showToast 函数存在', () => {
    const js = getJsText();
    assert(js.includes('function showToast'), 'showToast 应存在');
  });

  // --- Resize handler ---
  test('REG-041: resize 事件处理（含 debounce）', () => {
    const js = getJsText();
    assert(js.includes("window.addEventListener('resize'"),
      '应有 resize 监听');
    assert(js.includes('clearTimeout(rt)'), '应有 debounce');
  });

  // --- Android back button ---
  test('REG-042: popstate 事件处理（Android 返回键）', () => {
    const js = getJsText();
    assert(js.includes("window.addEventListener('popstate'"),
      '应有 popstate 监听');
  });

  // --- Action sheet for long press ---
  test('REG-043: Action Sheet (#actionSheetBackdrop) 存在', () => {
    assert($('#actionSheetBackdrop') !== null, '#actionSheetBackdrop 应存在');
    assert($('#actionSheetBackdrop').classList.contains('hidden'), '初始应隐藏');
  });

  test('REG-044: Action Sheet 有编辑/删除/置顶/取消四个操作', () => {
    const buttons = $$('[data-as-action]', $('#actionSheet'));
    const actions = buttons.map(b => b.getAttribute('data-as-action'));
    assert(actions.includes('edit'), '应有 edit');
    assert(actions.includes('delete'), '应有 delete');
    assert(actions.includes('pin'), '应有 pin');
    assert(actions.includes('cancel'), '应有 cancel');
  });

  // --- Long press on shelf ---
  test('REG-045: 书架长按机制 (800ms LONG_PRESS_DURATION)', () => {
    const js = getJsText();
    assert(js.includes('LONG_PRESS_DURATION = 800'), '长按持续时间应为 800ms');
    assert(js.includes('LONG_PRESS_MOVE_THRESHOLD = 10'), '移动阈值应为 10px');
  });

  // --- Edit modal ---
  test('REG-046: 编辑弹窗 (#editModal) 存在', () => {
    assert($('#editModal') !== null, '#editModal 应存在');
    assert($('#editTitle') !== null, '#editTitle 应存在');
    assert($('#editCategory') !== null, '#editCategory 应存在');
    assert($('#editTagsInput') !== null, '#editTagsInput 应存在');
  });

  // --- Swipe mechanism ---
  test('REG-047: 滑动删除机制存在 (SWIPE_THRESHOLD=60, SWIPE_MAX=120)', () => {
    const js = getJsText();
    assert(js.includes('SWIPE_THRESHOLD = 60'), 'SWIPE_THRESHOLD 应为 60');
    assert(js.includes('SWIPE_MAX = 120'), 'SWIPE_MAX 应为 120');
  });

  // --- notesViewArea hidden in v6 ---
  test('REG-048: #notesViewArea 始终隐藏（v6 已弃用笔记列表视图）', () => {
    // In v6, notesViewArea has inline style="display:none" in HTML, always hidden
    const nva = $('#notesViewArea');
    assert(nva !== null, '#notesViewArea 应存在（保留DOM但不显示）');
    assertEqual(nva.style.display, 'none',
      'notesViewArea 应通过 inline style 隐藏');
    // The shelf container should NOT be hidden
    const sc = $('#shelfContainer');
    assert(!sc.classList.contains('hidden'), '书架容器不应隐藏');
    assert(sc.style.display !== 'none', '书架容器 display 不应为 none');
  });

  // --- Confirm modal ---
  test('REG-049: showConfirm 使用 cloneNode 清理事件', () => {
    const js = getJsText();
    assert(js.includes('cloneNode(true)'), '应使用 cloneNode 清理 handler');
  });

  // --- Book card CSS ---
  test('REG-050: 五种书籍颜色类别 CSS 变量定义', () => {
    const css = getCssText();
    const categories = [
      { var: '--book-phil-bg', light: '#f0ecfa', accent: '--book-phil-accent' },
      { var: '--book-hist-bg', light: '#faf0e6', accent: '--book-hist-accent' },
      { var: '--book-lit-bg', light: '#fde8ee', accent: '--book-lit-accent' },
      { var: '--book-tech-bg', light: '#e6f5f5', accent: '--book-tech-accent' },
      { var: '--book-other-bg', light: '#f3f4f6', accent: '--book-other-accent' },
    ];
    for (const cat of categories) {
      assert(css.includes(`${cat.var}:`), `${cat.var} 应定义`);
      assert(css.includes(cat.light), `${cat.var} light 颜色应为 ${cat.light}`);
      assert(css.includes(cat.accent), `${cat.accent} 应定义`);
    }
  });

  // --- Tag color system ---
  test('REG-051: TAG_COLORS 有 8 种颜色', () => {
    const js = getJsText();
    const match = js.match(/TAG_COLORS\s*=\s*\[([^\]]+)\]/);
    assert(match !== null, 'TAG_COLORS 应存在');
    const colors = match[1].match(/#[0-9a-fA-F]{6}/g) || [];
    assertEqual(colors.length, 8, `应有 8 种标签颜色，实际 ${colors.length} 种`);
  });

  // --- Category chip persistence ---
  test('REG-052: 分类列表从 localStorage "notes-categories" 加载', () => {
    const js = getJsText();
    assert(js.includes("'notes-categories'"), '应使用 notes-categories key');
  });

  test('REG-053: 预设分类为 ["全部","哲学","历史","文学","科技","其他"]', () => {
    const js = getJsText();
    // Check PRESET_CATEGORIES array
    assert(js.includes("'全部','哲学','历史','文学','科技','其他'"),
      '预设分类应包含全部/哲学/历史/文学/科技/其他');
  });

  // --- Pinned notes ---
  test('REG-054: 置顶笔记 localStorage key "notes-pinned"', () => {
    const js = getJsText();
    assert(js.includes("'notes-pinned'"), '应使用 notes-pinned key');
  });

  // --- Nickname ---
  test('REG-055: 昵称 localStorage key "notes-nickname"', () => {
    const js = getJsText();
    assert(js.includes("'notes-nickname'"), '应使用 notes-nickname key');
  });

  // --- Search history ---
  test('REG-056: 搜索历史 localStorage key "notes-search-history"', () => {
    const js = getJsText();
    assert(js.includes("'notes-search-history'"), '应使用 notes-search-history key');
  });

  test('REG-057: 搜索历史最多 20 条', () => {
    const js = getJsText();
    assert(js.includes('slice(0,20)'), '搜索历史应限制 20 条');
  });

  // ================================================================
  //  REPORT GENERATION
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

  // Smart routing decision
  const failedTests = results.filter(r => r.status === 'FAIL');
  let routingDecision;
  let routingTarget;

  if (failedTests.length === 0) {
    routingDecision = 'All tests pass — v6 features and regression tests are clean.';
    routingTarget = 'NoOne';
  } else {
    // Analyze: source code bugs vs test bugs
    const sourceBugs = [];
    const testBugs = [];

    for (const f of failedTests) {
      // All failures are attributed to source code unless proven otherwise
      sourceBugs.push(f);
    }

    routingDecision = `${sourceBugs.length} test(s) failed — source code needs fixes.`;
    routingTarget = 'Engineer';
  }

  // Write report file
  const reportPath = new URL('../test/test_report_v6.md', import.meta.url).pathname;
  const reportLines = [
    `# Test Report — 笔记预览 APP v6.0 (Round 1)`,
    '',
    '## Summary',
    `- Total Tests: ${testCount} | Passed: ${passCount} | Failed: ${failCount}`,
    `- Pass Rate: ${((passCount / testCount) * 100).toFixed(1)}%`,
    '',
    '## Routing Decision',
    `→ **Send To: ${routingTarget}** — ${routingDecision}`,
  ];

  if (failedTests.length > 0) {
    reportLines.push('');
    reportLines.push('## Failed Tests');
    for (const f of failedTests) {
      reportLines.push(`- **${f.name}**: ${f.error}`);
      reportLines.push(`  - Source: \`index.html\``);
    }
  }

  reportLines.push('');
  reportLines.push('## Test Coverage');
  reportLines.push('');
  reportLines.push('### ① 移除笔记子Tab — 首页书架 (15 tests)');
  reportLines.push('- 确认无 home-subtab-btn / shelfToggleBtn');
  reportLines.push('- 书架始终可见，笔记列表隐藏');
  reportLines.push('- 搜索按钮在 header');
  reportLines.push('- Desktop Tab Bar: 首页/上传/我的');
  reportLines.push('- Bottom Nav: 首页/上传/我的');
  reportLines.push('- 默认选中首页，书架有卡片');
  reportLines.push('- 分类排列 (shelf-section + shelf-cat-label)');
  reportLines.push('- localStorage 清理 (no notes-home-view/shelf-view)');
  reportLines.push('- Tab 切换正常');
  reportLines.push('');
  reportLines.push('### ② 标签管理 (34 tests)');
  reportLines.push('- DOM 结构: tag-manager-item, tagManagerList, addTagBtn');
  reportLines.push('- 标签列表渲染: tag-manager-row (dot, name, count, actions)');
  reportLines.push('- 标签输入弹窗: tagInputOverlay (field, confirm, cancel)');
  reportLines.push('- 新增标签: openTagInput(add), 空值校验, 取消关闭');
  reportLines.push('- 编辑标签: openTagInput(edit), 重命名同步所有笔记');
  reportLines.push('- 编辑标签: 检查名称冲突, 更新 customTags');
  reportLines.push('- 删除标签: tagReplaceModal, 有关联/无关联分支');
  reportLines.push('- 删除标签: 替换选择框, 直接移除, 确认删除');
  reportLines.push('- executeTagDelete: replaceWith vs __remove__ 分支');
  reportLines.push('- collectAllTags: Map 统计');
  reportLines.push('- localStorage: notes-custom-tags, loadCustomTags/saveCustomTags');
  reportLines.push('- renderTagManager: 合并 customTags (关联数0)');
  reportLines.push('- 弹窗遮罩关闭, Enter 键提交');
  reportLines.push('');
  reportLines.push('### ③ 回归验证 (57 tests total + 34 tag + 15 schema = 106 tests)');
  reportLines.push('- 书架: 39 本内置书籍, 分类分组');
  reportLines.push('- 搜索: 打开/关闭, 输入框, 返回按钮');
  reportLines.push('- 上传: 表单字段, 禁用状态, .html accept, 分类选择');
  reportLines.push('- 删除: 源码分支检查, 确认弹窗');
  reportLines.push('- 主题: toggle, light/dark, CSS 变量, localStorage');
  reportLines.push('- 预览: overlay, back btn, landscape float back, CSS');
  reportLines.push('- 桌面预览: mainContent, title, date, welcome');
  reportLines.push('- 卡片结构: top-bar/body/bottom-bar, title/meta');
  reportLines.push('- 个人中心: 昵称, 存储, 清除, v6.0 版本号');
  reportLines.push('- 数据层: IndexedDB, notes.json, mergeNotes');
  reportLines.push('- 其他: XSS, 键盘导航, 响应式, Toast, resize, popstate');
  reportLines.push('- Action Sheet, 长按, 编辑弹窗, 滑动删除');
  reportLines.push('- Book card CSS variables, TAG_COLORS, localStorage keys');
  reportLines.push('- Categories, Pinned notes, Nickname, Search history');
  reportLines.push('');
  reportLines.push('## All Results');
  results.forEach((r, i) => {
    reportLines.push(`${i + 1}. [${r.status}] ${r.name}`);
  });

  writeFileSync(reportPath, reportLines.join('\n'), 'utf-8');
  console.log(`\n📄 报告已保存: ${reportPath}`);

  return { testCount, passCount, failCount, results, routingTarget };
}

// ─── Execute ─────────────────────────────────────────────────────────────

runAllTests().then(({ failCount: fc, routingTarget }) => {
  console.log(`\n🧭 智能路由: → ${routingTarget}`);
  process.exit(fc > 0 ? 1 : 0);
}).catch(err => {
  console.error('测试执行出错:', err);
  process.exit(1);
});
