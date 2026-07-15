#!/usr/bin/env node
/**
 * 笔记预览 APP v2 — 自动化测试脚本 (Node.js)
 * 执行方式: node test/run_tests.mjs
 * 需要先启动 HTTP 服务器: python3 -m http.server 8771
 */

const BASE = 'http://127.0.0.1:8771';

let pass = 0, fail = 0;
const failures = [];

function test(name, condition, detail = '') {
  if (condition) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); failures.push({ name, detail }); }
}

async function fetchText(path) {
  const resp = await fetch(`${BASE}/${path}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${path}`);
  return resp.text();
}

async function fetchJson(path) {
  const resp = await fetch(`${BASE}/${path}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${path}`);
  return resp.json();
}

// ===================================================================
// 1. 文件可访问性
// ===================================================================
console.log('\n📁 1. 文件可访问性');
{
  let r;
  r = await fetch(`${BASE}/index.html`); test('index.html 可访问 (200)', r.ok);
  r = await fetch(`${BASE}/notes.json`); test('notes.json 可访问 (200)', r.ok);
  r = await fetch(`${BASE}/notes/note1.html`); test('notes/note1.html 可访问 (200)', r.ok);
  r = await fetch(`${BASE}/notes/note2.html`); test('notes/note2.html 可访问 (200)', r.ok);
}

// ===================================================================
// 2. notes.json 数据验证
// ===================================================================
console.log('\n📊 2. notes.json 数据验证');
{
  const data = await fetchJson('notes.json');
  test('notes.json 是数组', Array.isArray(data));
  test('包含 5 条笔记', data.length === 5, `实际: ${data.length}`);
  data.forEach((n, i) => {
    test(`笔记 #${i+1} 有 id`, !!n.id);
    test(`笔记 #${i+1} 有 title`, !!n.title);
    test(`笔记 #${i+1} 有 file`, !!n.file);
    test(`笔记 #${i+1} 有 date`, !!n.date);
    test(`笔记 #${i+1} tags 是数组`, Array.isArray(n.tags), `类型: ${typeof n.tags}`);
  });
}

// ===================================================================
// 3. index.html v2 结构验证 — DOM 元素
// ===================================================================
console.log('\n🏗️ 3. v2 DOM 结构验证');
{
  const html = await fetchText('index.html');

  // ---- 基础结构 ----
  test('有 <!DOCTYPE html>', html.trimStart().startsWith('<!DOCTYPE html>'));
  test('lang="zh-CN"', html.includes('lang="zh-CN"'));
  test('有 <meta charset="UTF-8">', html.includes('charset="UTF-8"'));
  test('有 viewport meta', html.includes('viewport'));
  test('有 sidebar (#sidebar)', html.includes('id="sidebar"'));
  test('有 main content (#mainContent)', html.includes('id="mainContent"'));
  test('有笔记列表 (#noteList)', html.includes('id="noteList"'));
  test('有预览区 (#previewBody)', html.includes('id="previewBody"'));
  test('有笔记计数器 (#noteCount)', html.includes('id="noteCount"'));

  // ---- ① 笔记管理 ----
  test('① 有上传 input (#uploadFileInput)', html.includes('id="uploadFileInput"'));
  test('① upload accept=".html"', html.includes('accept=".html"'));
  test('① 有上传按钮 (#uploadBtn)', html.includes('id="uploadBtn"'));
  test('① 有确认弹窗 (#confirmModal)', html.includes('id="confirmModal"'));
  test('① 有 .note-delete CSS 类', html.includes('note-delete'));

  // ---- ② 搜索页 ----
  test('② 有搜索按钮 (#searchBtn)', html.includes('id="searchBtn"'));
  test('② 侧栏搜索改为图标（旧 #searchInput 已移除）', !html.includes('id="searchInput"'), '旧版 #searchInput 仍存在！');
  test('② 有搜索页 (#searchPage)', html.includes('id="searchPage"'));
  test('② 有搜索输入框 (#searchPageInput)', html.includes('id="searchPageInput"'));
  test('② 有搜索结果区 (#searchResults)', html.includes('id="searchResults"'));
  test('② 有搜索历史区 (#searchHistory)', html.includes('id="searchHistory"'));
  test('② 有返回按钮 (#backSearchBtn)', html.includes('id="backSearchBtn"'));

  // ---- ③ 去掉已读/未读 ----
  test('③ 无 .read-dot CSS 残留', !html.includes('.read-dot'), '仍存在 .read-dot！');
  test('③ 无 #searchInput 旧搜索框', !html.includes('id="searchInput"'), '仍存在旧搜索框！');

  // ---- ④ 个人中心 ----
  test('④ 底部导航有 #navProfile (👤 我的)', html.includes('id="navProfile"'));
  test('④ 桌面端 profile 按钮 (#profileBtnDesktop)', html.includes('id="profileBtnDesktop"'));
  test('④ 有 profile-overlay', html.includes('id="profileOverlay"'));
  test('④ 有昵称输入框 (#profileNickname)', html.includes('id="profileNickname"'));
  test('④ 主题切换 (#profileThemeToggle)', html.includes('id="profileThemeToggle"'));
  test('④ 旧 #themeToggle 已移除', !html.includes('id="themeToggle"'), '旧版 #themeToggle 仍存在！');
  test('④ 存储管理 (#storageSize)', html.includes('id="storageSize"'));
  test('④ 清除按钮 (#clearUserNotesBtn)', html.includes('id="clearUserNotesBtn"'));
  test('④ 有关闭按钮 (#profileCloseBtn)', html.includes('id="profileCloseBtn"'));
  test('④ 版本号 v2.0', html.includes('v2.0'));
}

// ===================================================================
// 4. CSS v2 验证
// ===================================================================
console.log('\n🎨 4. CSS v2 验证');
{
  const html = await fetchText('index.html');
  const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
  const css = styleMatch ? styleMatch[1] : '';

  test('CSS 存在', css.length > 0);
  test('使用 CSS 变量 (--bg-primary)', css.includes('--bg-primary'));
  test('有 :root 变量定义', css.includes(':root'));
  test('有暗色主题 [data-theme="dark"]', css.includes('[data-theme="dark"]'));
  test('移动端 @media (max-width: 767px)', css.includes('max-width: 767px'));
  test('平板 @media (768px-1023px)', css.includes('min-width: 768px') && css.includes('max-width: 1023px'));
  test('大屏 @media (min-width: 1024px)', css.includes('min-width: 1024px'));
  test('safe-area-inset-bottom', css.includes('safe-area-inset-bottom'));
  test('viewport-fit=cover', html.includes('viewport-fit=cover'));
  test('overscroll-behavior: none', css.includes('overscroll-behavior: none'));
  test('滚动条自定义 (::-webkit-scrollbar)', css.includes('::-webkit-scrollbar'));
  test('过渡动画 (transition)', css.includes('transition'));

  // ---- ① 笔记管理 CSS ----
  test('① .note-delete 初始 opacity: 0', css.includes('opacity: 0') || '缺少删除按钮隐藏样式');
  test('① .note-item:hover .note-delete opacity: 1', css.includes('.note-item:hover .note-delete'));

  // ---- ② 搜索页 CSS ----
  test('② .search-page 样式存在', css.includes('.search-page'));
  test('② .search-history 样式存在', css.includes('search-history'));

  // ---- ③ 去掉已读/未读 CSS ----
  test('③ 无 .read-dot 样式', !css.includes('.read-dot'), '.read-dot 样式残留！');

  // ---- ④ 个人中心 CSS ----
  test('④ .profile-overlay 样式存在', css.includes('.profile-overlay'));
  test('④ .profile-btn-desktop 样式存在', css.includes('.profile-btn-desktop'));
  test('④ .profile-nickname 样式存在', css.includes('.profile-nickname'));
  test('④ .toggle-switch 样式存在', css.includes('.toggle-switch'));

  // ---- 响应式 ----
  test('底部导航默认 display:none', css.includes('.bottom-nav') && css.includes('display: none'));
  test('返回按钮默认 display:none', css.includes('.back-btn') && css.includes('display: none'));
}

// ===================================================================
// 5. JavaScript v2 逻辑验证
// ===================================================================
console.log('\n⚙️ 5. JavaScript v2 逻辑验证');
{
  const html = await fetchText('index.html');
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/g);
  const js = scriptMatch ? scriptMatch[scriptMatch.length - 1].replace(/<\/?script>/g, '') : '';

  test('JS 存在', js.length > 0);
  test('使用严格模式', js.includes("'use strict'") || js.includes('"use strict"'));
  test('IIFE 封装', js.includes('(function()'));

  // ---- ① 笔记管理 JS ----
  test('① handleFileUpload 函数', js.includes('handleFileUpload'));
  test('① generateUserId 函数', js.includes('generateUserId'));
  test('① DB IndexedDB 封装', js.includes('const DB = {'));
  test('① IndexedDB notes-app 数据库', js.includes("indexedDB.open('notes-app'"));
  test('① user-notes object store', js.includes("'user-notes'"));
  test('① DB.put / DB.get / DB.delete / DB.clear', js.includes('DB.put') && js.includes('DB.get') && js.includes('DB.delete') && js.includes('DB.clear'));
  test('① localStorage user-notes-index', js.includes("'user-notes-index'"));
  test('① 同名文件自动加序号后缀', js.includes("' (") && js.includes("+ counter +"));

  test('① removeUserNote 函数', js.includes('removeUserNote'));
  test('① showConfirm 确认弹窗函数', js.includes('showConfirm'));
  test('① 删除后自动切换到第一条', js.includes("showPreview(STATE.notes[0])"));
  test('① 删除后显示欢迎页', js.includes('showWelcome()'));

  test('① user notes 排在列表顶部', js.includes("source: 'user'"));
  test('① 删除按钮仅用户笔记显示', js.includes("isUser ?"));

  // ---- ② 搜索页 JS ----
  test('② openSearchPage 函数', js.includes('openSearchPage'));
  test('② closeSearchPage 函数', js.includes('closeSearchPage'));
  test('② searchPageInput.focus() 自动聚焦', js.includes('searchPageInput.focus()'));
  test('② 搜索防抖 150ms', js.includes('150'));
  test('② renderSearchResults 函数', js.includes('renderSearchResults'));

  test('② loadSearchHistory 函数', js.includes('loadSearchHistory'));
  test('② addSearchHistory 函数', js.includes('addSearchHistory'));
  test('② removeSearchHistory 函数', js.includes('removeSearchHistory'));
  test('② clearSearchHistory 函数', js.includes('clearSearchHistory'));
  test('② localStorage notes-search-history', js.includes("'notes-search-history'"));
  test('② 搜索历史去重', js.includes("filter(h => h !== t)"));
  test('② 搜索历史最多 20 条', js.includes('length > 20') && js.includes('slice(0, 20)'));
  test('② 搜索结果保存到历史', js.includes('addSearchHistory('));
  test('② 搜索结果点击关闭搜索页', js.includes('closeSearchPage()'));

  // ---- ③ 去掉已读/未读 JS ----
  test('③ 无 readStatus 残留', !js.includes('readStatus'), 'readStatus 残留！');
  test('③ 无 markAsRead 残留', !js.includes('markAsRead'), 'markAsRead 残留！');
  test('③ 无 loadReadStatus 残留', !js.includes('loadReadStatus'), 'loadReadStatus 残留！');
  test('③ 无 saveReadStatus 残留', !js.includes('saveReadStatus'), 'saveReadStatus 残留！');
  test('③ 无 notes-read-status 键', !js.includes('notes-read-status'), 'notes-read-status 键残留！');

  // ---- ④ 个人中心 JS ----
  test('④ openProfile 函数', js.includes('openProfile'));
  test('④ closeProfile 函数', js.includes('closeProfile'));
  test('④ loadNickname 函数', js.includes('loadNickname'));
  test('④ saveNickname 函数', js.includes('saveNickname'));
  test('④ localStorage notes-nickname', js.includes("'notes-nickname'"));
  test('④ 昵称 blur 保存', js.includes("addEventListener('blur'"));
  test('④ 昵称 Enter 保存', js.includes("key === 'Enter'") && js.includes('this.blur()'));

  test('④ loadTheme / saveTheme / toggleTheme', js.includes('loadTheme') && js.includes('saveTheme') && js.includes('toggleTheme'));
  test('④ localStorage notes-theme', js.includes("'notes-theme'"));
  test('④ 主题切换 change 事件', js.includes("profileThemeToggle.addEventListener('change'"));

  test('④ DB.estimateSize 计算存储', js.includes('estimateSize'));
  test('④ formatBytes 格式化函数', js.includes('formatBytes'));
  test('④ clearAllUserNotes 函数', js.includes('clearAllUserNotes'));
  test('④ DB.clear() 清空 IndexedDB', js.includes('DB.clear()'));
  test('④ 清除二次确认 showConfirm', js.includes("showConfirm("));

  // ---- 回归 JS ----
  test('escapeHtml 防 XSS', js.includes('escapeHtml'));
  test('formatDate 函数', js.includes('formatDate'));
  test('tagColor 函数', js.includes('tagColor'));
  test('getFilteredNotes 函数', js.includes('getFilteredNotes'));
  test('applyTheme 函数', js.includes('applyTheme'));
  test('setMobileView 函数', js.includes('setMobileView'));
  test('showPreview 函数', js.includes('showPreview'));
  test('popstate 监听 (Android 返回)', js.includes('popstate'));
  test('事件委托 (.note-item)', js.includes("closest('.note-item')"));
  test('iframe sandbox 属性', js.includes('sandbox'));
  test('Blob URL 释放', js.includes('URL.revokeObjectURL'));
  test('数据标准化: title 默认值', js.includes("'未命名笔记'"));
  test('数据标准化: file 默认值', js.includes("n.file || ''"));
  test('数据标准化: tags 默认值', js.includes('Array.isArray(n.tags) ? n.tags : []'));
  test('resize 防抖', js.includes('resizeDebounce'));
  test('cloneNode 清理事件', js.includes('cloneNode(true)'));
}

// ===================================================================
// 6. 笔记 HTML 内容验证
// ===================================================================
console.log('\n📝 6. 笔记 HTML 内容验证');
{
  const n1 = await fetchText('notes/note1.html');
  const n2 = await fetchText('notes/note2.html');

  test('note1.html 有 DOCTYPE', n1.trimStart().startsWith('<!DOCTYPE html>'));
  test('note2.html 有 DOCTYPE', n2.trimStart().startsWith('<!DOCTYPE html>'));
  test('note1.html 有 charset', n1.includes('charset'));
  test('note2.html 有 charset', n2.includes('charset'));
  test('note1.html 有 </html>', n1.includes('</html>'));
  test('note2.html 有 </html>', n2.includes('</html>'));
  test('note1.html 含《苏菲的世界》', n1.includes('苏菲的世界'));
  test('note2.html 含《人类简史》', n2.includes('人类简史'));
}

// ===================================================================
// 7. 核心逻辑模拟测试
// ===================================================================
console.log('\n🧪 7. 核心逻辑模拟测试');
{
  const TAG_COLORS = ['#e74c3c', '#e67e22', '#2980b9', '#27ae60', '#8e44ad', '#16a085', '#d35400', '#2c3e50'];

  function tagColor(tag) {
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
      hash = ((hash << 5) - hash) + tag.charCodeAt(i);
      hash |= 0;
    }
    return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } catch (_) { return dateStr; }
  }

  function getFilteredNotes(notes, query) {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(n =>
      n.title.toLowerCase().includes(q) ||
      n.tags.some(t => t.toLowerCase().includes(q))
    );
  }

  const mockNotes = [
    { id: '1', title: '《苏菲的世界》— 哲学入门笔记', tags: ['哲学', '小说', '启蒙'] },
    { id: '2', title: '《人类简史》— 认知革命与农业革命', tags: ['历史', '人类学', '科普'] },
    { id: '3', title: '《百年孤独》— 魔幻现实主义赏析', tags: ['文学', '拉美', '经典'] },
    { id: '4', title: '《思考，快与慢》— 行为经济学要点', tags: ['心理学', '经济学', '思维'] },
    { id: '5', title: '《局外人》— 加缪与荒诞哲学', tags: ['哲学', '文学', '存在主义'] },
  ];

  test('tagColor 返回有效颜色', TAG_COLORS.includes(tagColor('哲学')));
  test('tagColor 幂等性', tagColor('历史') === tagColor('历史'));
  test('tagColor 空字符串', TAG_COLORS.includes(tagColor('')));
  test('formatDate("2024-01-15")', formatDate('2024-01-15') === '2024-01-15');
  test('formatDate("")', formatDate('') === '');
  test('formatDate(null)', formatDate(null) === '');
  test('formatDate(undefined)', formatDate(undefined) === '');
  test('formatDate("invalid") 返回原值', formatDate('invalid-date') === 'invalid-date');
  test('空查询返回全部', getFilteredNotes(mockNotes, '').length === 5);
  test('搜索"苏菲"返回1条', getFilteredNotes(mockNotes, '苏菲').length === 1);
  test('搜索"哲学"返回2条(标题)', getFilteredNotes(mockNotes, '哲学').length === 2);
  test('标签搜索"心理学"返回1条', getFilteredNotes(mockNotes, '心理学').length === 1);
  test('搜索"量子"返回0条', getFilteredNotes(mockNotes, '量子').length === 0);
  test('空白查询返回全部', getFilteredNotes(mockNotes, '   ').length === 5);
  test('空数组不报错', getFilteredNotes([], 'x').length === 0);
  test('搜索标签"文学"(2条)', getFilteredNotes(mockNotes, '文学').length === 2);
}

// ===================================================================
// 最终报告
// ===================================================================
console.log('\n' + '='.repeat(60));
console.log('📊 测试报告 (v2)');
console.log('='.repeat(60));
console.log(`总计: ${pass + fail} | ✅ 通过: ${pass} | ❌ 失败: ${fail}`);
const pct = pass + fail > 0 ? ((pass / (pass + fail)) * 100).toFixed(1) : '0.0';
console.log(`通过率: ${pct}%`);

if (failures.length > 0) {
  console.log('\n❌ 失败详情:');
  failures.forEach(f => console.log(`  - ${f.name}: ${f.detail}`));
}

// 智能路由判定
console.log('\n🧭 智能路由判定:');
if (fail === 0) {
  console.log('  → NoOne — 全部测试通过，v2 功能完整，无回归问题');
} else {
  // Analyze failures: are they source code bugs or test bugs?
  console.log(`  → Engineer (Alex) — ${fail} 个测试失败，源文件需要修复`);
  console.log('\n  失败详情:');
  failures.forEach(f => console.log(`    • ${f.name}: ${f.detail}`));
}

console.log('\n✅ 测试完成\n');

// Exit with appropriate code
process.exit(fail === 0 ? 0 : 1);
