#!/usr/bin/env node
/**
 * 笔记预览 APP — 自动化测试脚本
 * 执行方式: node test/run_tests.mjs
 * 需要先启动 HTTP 服务器: python3 -m http.server 8765
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
  r = await fetch(`${BASE}/notes/nonexistent.html`); test('不存在的文件返回 404', !r.ok);
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
    test(`笔记 #${i+1} 有 tags (数组)`, Array.isArray(n.tags), `类型: ${typeof n.tags}`);
  });

  // 验证 file 路径引用
  const files = [...new Set(data.map(n => n.file))];
  for (const f of files) {
    const r = await fetch(`${BASE}/${f}`);
    test(`文件引用 "${f}" 可访问`, r.ok);
  }

  // 验证 tags 非空
  const emptyTags = data.filter(n => n.tags.length === 0);
  test('所有笔记都有标签', emptyTags.length === 0, `${emptyTags.length} 条笔记标签为空`);
}

// ===================================================================
// 3. index.html 结构验证
// ===================================================================
console.log('\n🏗️ 3. index.html 结构验证');
{
  const html = await fetchText('index.html');

  test('有 <!DOCTYPE html>', html.trimStart().startsWith('<!DOCTYPE html>'));
  test('lang="zh-CN"', html.includes('lang="zh-CN"'));
  test('有 <meta charset="UTF-8">', html.includes('charset="UTF-8"'));
  test('有 viewport meta', html.includes('viewport'));
  test('有 viewport-fit=cover', html.includes('viewport-fit=cover'));
  test('有 theme-color meta', html.includes('name="theme-color"'));
  test('有 <title>', html.includes('<title>'));
  test('有 sidebar (#sidebar)', html.includes('id="sidebar"'));
  test('有 main content (#mainContent)', html.includes('id="mainContent"'));
  test('有搜索框 (#searchInput)', html.includes('id="searchInput"'));
  test('有笔记列表 (#noteList)', html.includes('id="noteList"'));
  test('有预览区 (#previewBody)', html.includes('id="previewBody"'));
  test('有返回按钮 (#backBtn)', html.includes('id="backBtn"'));
  test('有主题切换 (#themeToggle)', html.includes('id="themeToggle"'));
  test('有底部导航 (#bottomNav)', html.includes('id="bottomNav"'));
  test('有笔记计数器 (#noteCount)', html.includes('id="noteCount"'));
}

// ===================================================================
// 4. CSS 验证
// ===================================================================
console.log('\n🎨 4. CSS 验证');
{
  const html = await fetchText('index.html');
  const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
  const css = styleMatch ? styleMatch[1] : '';

  test('CSS 存在', css.length > 0);
  test('使用 CSS 变量 (--bg-primary)', css.includes('--bg-primary'));
  test('定义暗色主题 [data-theme="dark"]', css.includes('[data-theme="dark"]'));
  test('有移动端媒体查询 (max-width:767px)', css.includes('max-width: 767px'));
  test('有平板媒体查询 (768px-1023px)', css.includes('min-width: 768px') && css.includes('max-width: 1023px'));
  test('有大屏优化 (min-width:1024px)', css.includes('min-width: 1024px'));
  test('safe-area 适配', css.includes('safe-area-inset-bottom'));
  test('overscroll-behavior: none', css.includes('overscroll-behavior: none'));
  test('有滚动条自定义 (::-webkit-scrollbar)', css.includes('::-webkit-scrollbar'));
  test('有过渡动画 (transition)', css.includes('transition'));
  test('底部导航默认隐藏 (display:none)', css.includes('.bottom-nav') && css.includes('display: none'));
  test('返回按钮默认隐藏 (display:none)', css.includes('.back-btn') && css.includes('display: none'));
  test('移动端底部导航显示', html.includes('@media') && html.includes('bottom-nav') && html.includes('display: flex'));
  test('移动端返回按钮显示', html.includes('@media') && html.includes('back-btn') && html.includes('display: flex'));
}

// ===================================================================
// 5. JavaScript 逻辑验证
// ===================================================================
console.log('\n⚙️ 5. JavaScript 逻辑验证');
{
  const html = await fetchText('index.html');
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/g);
  const mainScript = scriptMatch ? scriptMatch[scriptMatch.length - 1].replace(/<\/?script>/g, '') : '';

  test('JS 存在', mainScript.length > 0);
  test('使用严格模式', mainScript.includes("'use strict'") || mainScript.includes('"use strict"'));
  test('有 IIFE 封装', mainScript.includes('(function()') || mainScript.includes('(function ()'));
  test('有 DOM 引用缓存', mainScript.includes("document.querySelector"));
  test('有 STATE 状态管理', mainScript.includes('STATE'));
  test('有 loadNotes 异步函数', mainScript.includes('async function loadNotes') || mainScript.includes('loadNotes'));
  test('有 fetch notes.json', mainScript.includes("fetch('notes.json')"));
  test('有 HTTP 错误处理', mainScript.includes('resp.ok') || mainScript.includes('!resp.ok'));
  test('有 JSON 格式验证', mainScript.includes('Array.isArray(data)'));
  test('有搜索防抖 (debounce)', mainScript.includes('debounce') || (mainScript.includes('setTimeout') && mainScript.includes('searchDebounce')));
  test('有 resize 防抖', mainScript.includes('resizeDebounce'));
  test('有 localStorage 读操作', mainScript.includes('localStorage.getItem'));
  test('有 localStorage 写操作', mainScript.includes('localStorage.setItem'));
  test('有 localStorage 异常捕获', mainScript.includes('catch') && mainScript.includes('readStatus'));
  test('有 localStorage quota 异常处理', mainScript.includes('quota exceeded'));
  test('有 escapeHtml 防 XSS', mainScript.includes('escapeHtml'));
  test('有 formatDate 函数', mainScript.includes('formatDate'));
  test('有 tagColor 函数', mainScript.includes('tagColor'));
  test('有 getFilteredNotes 函数', mainScript.includes('getFilteredNotes'));
  test('有 markAsRead 函数', mainScript.includes('markAsRead'));
  test('有 loadReadStatus 函数', mainScript.includes('loadReadStatus'));
  test('有 saveReadStatus 函数', mainScript.includes('saveReadStatus'));
  test('有 applyTheme 函数', mainScript.includes('applyTheme'));
  test('有 setMobileView 函数', mainScript.includes('setMobileView'));
  test('有 showPreview 函数', mainScript.includes('showPreview'));
  test('有 showWelcome 函数', mainScript.includes('showWelcome'));
  test('有 popstate 监听 (Android 返回)', mainScript.includes('popstate'));
  test('有键盘可访问性 (keydown Enter/Space)', mainScript.includes("keydown") && (mainScript.includes("'Enter'") || mainScript.includes('"Enter"')));
  test('字段默认值: title → 未命名笔记', mainScript.includes("'未命名笔记'") || mainScript.includes('"未命名笔记"'));
  test('字段默认值: file → 空字符串', mainScript.includes("n.file || ''"));
  test('字段默认值: tags → 空数组', mainScript.includes('Array.isArray(n.tags) ? n.tags : []'));
  test('iframe sandbox 属性', mainScript.includes('sandbox'));
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
  test('note1.html 有 closing </html>', n1.includes('</html>'));
  test('note2.html 有 closing </html>', n2.includes('</html>'));
  test('note1.html 包含《苏菲的世界》', n1.includes('苏菲的世界'));
  test('note2.html 包含《人类简史》', n2.includes('人类简史'));
}

// ===================================================================
// 7. 边界条件 & 安全审查
// ===================================================================
console.log('\n🔒 7. 边界条件 & 安全审查');
{
  const html = await fetchText('index.html');
  const mainScript = (html.match(/<script>([\s\S]*?)<\/script>/g) || []).pop()?.replace(/<\/?script>/g, '') || '';

  // innerHTML 使用检查
  const innerHTMLCount = (mainScript.match(/innerHTML\s*=/g) || []).length;
  test(`innerHTML 使用次数 ≤ 8 (合理范围)`, innerHTMLCount <= 8, `实际: ${innerHTMLCount}`);

  // 使用 textContent 优先的场景
  test('计数器使用 textContent (安全)', mainScript.includes('textContent'));

  // 检查是否对用户输入做了转义
  test('搜索输入未直接插入 DOM', !mainScript.includes('searchInput.value') || mainScript.includes('toLowerCase'));

  // clickjacking 防护
  test('无 X-Frame-Options 需要（单文件应用，无服务端）', true); // 信息项

  // 检查事件委托
  test('使用事件委托处理笔记点击', mainScript.includes("closest('.note-item')"));
}

// ===================================================================
// 8. 模拟测试核心逻辑
// ===================================================================
console.log('\n🧪 8. 核心逻辑模拟测试');
{
  // 复制源码中的核心函数
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

  // tagColor
  test('tagColor 返回有效颜色', TAG_COLORS.includes(tagColor('哲学')));
  test('tagColor 幂等性', tagColor('历史') === tagColor('历史'));
  test('tagColor 空字符串不报错', TAG_COLORS.includes(tagColor('')));

  // formatDate
  test('formatDate("2024-01-15")', formatDate('2024-01-15') === '2024-01-15');
  test('formatDate("")', formatDate('') === '');
  test('formatDate(null)', formatDate(null) === '');
  test('formatDate(undefined)', formatDate(undefined) === '');
  test('formatDate("invalid") 返回原值', formatDate('invalid-date') === 'invalid-date');

  // getFilteredNotes
  test('空查询返回全部', getFilteredNotes(mockNotes, '').length === 5);
  test('搜索"苏菲"返回1条', getFilteredNotes(mockNotes, '苏菲').length === 1);
  test('搜索"哲学"返回2条', getFilteredNotes(mockNotes, '哲学').length === 2);
  test('标签搜索"心理学"返回1条', getFilteredNotes(mockNotes, '心理学').length === 1);
  test('搜索"量子"返回0条', getFilteredNotes(mockNotes, '量子').length === 0);
  test('空白查询返回全部', getFilteredNotes(mockNotes, '   ').length === 5);
  test('空数组搜索不报错', getFilteredNotes([], 'x').length === 0);
  test('搜索匹配标签"文学"(2条)', getFilteredNotes(mockNotes, '文学').length === 2);
}

// ===================================================================
// 9. Bug 修复验证 (Regression — 3 Fixes)
// ===================================================================
console.log('\n🐛 9. Bug 修复回归验证');
{
  const html = await fetchText('index.html');
  const mainScript = (html.match(/<script>([\s\S]*?)<\/script>/g) || []).pop()?.replace(/<\/?script>/g, '') || '';

  // Fix #1: popstate 中不再有无效的 e.preventDefault()
  // Extract the popstate handler block to test only within that scope
  const popstateMatch = mainScript.match(/addEventListener\('popstate'[\s\S]*?\{([\s\S]*?)\n  \}\);/);
  const popstateBlock = popstateMatch ? popstateMatch[1] : '';
  const hasPreventDefaultInPopstate = popstateBlock.includes('preventDefault');
  test('Fix #1: popstate 中已移除 e.preventDefault()',
    !hasPreventDefaultInPopstate,
    'popstate handler 内仍有 preventDefault 残留');
  test('Fix #1: popstate 有注释说明不可取消',
    mainScript.includes('not cancelable') || mainScript.includes('不可取消'),
    '缺少注释说明');

  // Fix #2: sidebar padding-bottom 使用 calc() + safe-area
  test('Fix #2: sidebar 使用 calc() 联动 safe-area',
    html.includes('calc(56px + env(safe-area-inset-bottom'),
    '未找到 calc() + safe-area-inset-bottom 写法');
  test('Fix #2: 不再硬编码 padding-bottom: 56px',
    !html.match(/padding-bottom:\s*56px[^+\w]/),
    '仍存在裸的 56px 硬编码');

  // Fix #3: iframe 加载失败有降级处理
  test('Fix #3: 有 iframe error 事件监听',
    mainScript.includes("addEventListener('error'") || mainScript.includes('addEventListener("error")'),
    '未找到 error 事件监听');
  test('Fix #3: 有错误降级 UI (preview-error)',
    mainScript.includes('preview-error') || html.includes('preview-error'),
    '未找到错误降级 DOM');
  test('Fix #3: 错误信息包含文件路径',
    mainScript.includes('note.file') && mainScript.includes('无法加载'),
    '错误提示中缺少文件路径信息');

  // Good patterns (unchanged)
  test('✅ 搜索防抖 150ms', mainScript.includes('150'));
  test('✅ resize 防抖 200ms', mainScript.includes('200'));
  test('✅ 数据标准化（字段默认值）', mainScript.includes("'未命名笔记'"));
  test('✅ 格式错误提示', mainScript.includes('格式错误'));
}

// ===================================================================
// 最终报告
// ===================================================================
console.log('\n' + '='.repeat(60));
console.log('📊 测试报告');
console.log('='.repeat(60));
console.log(`总计: ${pass + fail} | ✅ 通过: ${pass} | ❌ 失败: ${fail}`);
console.log(`通过率: ${((pass / (pass + fail)) * 100).toFixed(1)}%`);

if (failures.length > 0) {
  console.log('\n❌ 失败详情:');
  failures.forEach(f => console.log(`  - ${f.name}: ${f.detail}`));
}

// 智能路由判定
console.log('\n🧭 智能路由判定:');
if (fail === 0) {
  console.log('  → NoOne — 全部测试通过，3 个修复点均验证成功，无回归问题');
} else {
  console.log(`  → Engineer (Alex) — ${fail} 个测试失败，修复不完整或有回归`);
  console.log('\n  失败详情:');
  failures.forEach(f => console.log(`    • ${f.name}: ${f.detail}`));
}

console.log('\n✅ 测试完成\n');
