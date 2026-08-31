/**
 * QA 回归测试：验证书阁 APP 新导入的三本书（id 36/37/38，分类「政治与经济」）
 *
 * 运行前置：需先起本地 HTTP 服务（file:// 下 fetch('notes.json') 会被 CORS 拦截）
 *   cd <project> && python3 -m http.server 8899
 * 运行：
 *   node test/test_new_books_36_38.mjs
 */
import puppeteer from 'puppeteer';

const CHROME =
  '/Users/xuezhiyong/.cache/puppeteer/chrome/mac_arm-149.0.7827.22/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = 'http://localhost:8899/index.html';
const SHOT_DIR = '/tmp/shuge-qa-shots';

const NEW_BOOKS = [
  { id: '36', title: '《信息与激励经济学》', author: '陈钊', file: 'notes/note36.html' },
  { id: '37', title: '《县乡中国》', author: '杨华', file: 'notes/note37.html' },
  { id: '38', title: '《通向繁荣之路》', author: '王东京', file: 'notes/note38.html' },
];
const CAT = '政治与经济';
const EXPECT_CAT_COUNT = 10;
const EXPECT_TOTAL = 38;

const results = [];
const rec = (id, name, pass, detail) => {
  results.push({ id, name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${id} ${name} | ${detail}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });

const consoleErrors = [];
const pageErrors = [];
const badResponses = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`));
page.on('response', (r) => {
  if (r.status() >= 400) badResponses.push(`HTTP ${r.status()} ${r.url()}`);
});
page.on('requestfailed', (r) => {
  badResponses.push(`REQFAIL ${r.url()} :: ${r.failure()?.errorText}`);
});

/* ---------- Arrange: 打开页面，等待书架渲染 ---------- */
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
await page.waitForFunction(
  () => document.querySelectorAll('#shelfContainer .book-card').length > 0,
  { timeout: 20000 }
);
await sleep(500); // 等 IndexedDB / 后续渲染稳定

const collectShelf = () =>
  page.evaluate(() => ({
    total: document.querySelectorAll('#shelfContainer .book-card').length,
    sections: [...document.querySelectorAll('#shelfContainer .shelf-section')].map((s) => ({
      label: s.querySelector('.shelf-label')?.textContent.trim() || '',
      countText: s.querySelector('.shelf-count')?.textContent.trim() || '',
      cards: [...s.querySelectorAll('.book-card')].map((c) => ({
        id: c.getAttribute('data-id'),
        title: c.querySelector('.book-title')?.textContent.trim() || '',
        author: c.querySelector('.book-author-text')?.textContent.trim() || '',
      })),
    })),
  }));

const shelf = await collectShelf();
await page.screenshot({ path: `${SHOT_DIR}/01-shelf-desktop.png`, fullPage: false });

/* ---------- 断言 1：分类区块存在 ---------- */
const catSection = shelf.sections.find((s) => s.label === CAT);
rec('A1', '数据加载：「政治与经济」分类区块存在', !!catSection,
  catSection
    ? `找到区块，标签="${catSection.label}"，标注数量="${catSection.countText}"`
    : `未找到；实际区块=${JSON.stringify(shelf.sections.map((s) => s.label))}`);

/* ---------- 断言 2：数量正确 ---------- */
const catCount = catSection ? catSection.cards.length : -1;
rec('A2a', `「${CAT}」卡片数 = ${EXPECT_CAT_COUNT}`, catCount === EXPECT_CAT_COUNT,
  `实际 ${catCount} 本${catSection ? `（区块标注"${catSection.countText}"）` : ''}`);

rec('A2b', `全书架总数 = ${EXPECT_TOTAL}`, shelf.total === EXPECT_TOTAL,
  `实际 ${shelf.total} 本；各分类=${JSON.stringify(shelf.sections.map((s) => `${s.label}:${s.cards.length}`))}`);

/* ---------- 断言 3：新书可见 ---------- */
for (const b of NEW_BOOKS) {
  const hit = catSection?.cards.find((c) => c.id === b.id);
  const titleHit = hit && hit.title === b.title;
  rec('A3', `新书可见 [id=${b.id}] ${b.title}`, !!titleHit,
    hit ? `书架显示标题="${hit.title}"` : `书架未找到 data-id=${b.id} 的卡片`);
}

/* ---------- 断言 4：作者显示 ---------- */
for (const b of NEW_BOOKS) {
  const hit = catSection?.cards.find((c) => c.id === b.id);
  const ok = hit && hit.author.replace(/^✍️\s*/, '').trim() === b.author;
  rec('A4', `作者显示 [id=${b.id}] ${b.author}`, !!ok,
    hit ? `卡片作者文本="${hit.author}"` : `无卡片可查`);
}

/* ---------- 断言 5：可打开（逐本点击三本新书） ---------- */
for (const b of NEW_BOOKS) {
  let clickOk = false;
  let clickErr = '';
  try {
    const card = await page.$(`#shelfContainer .book-card[data-id="${b.id}"]`);
    if (!card) throw new Error(`未找到 data-id=${b.id} 的卡片`);
    await card.click();
    await page.waitForFunction(
      () => !!document.querySelector('#previewBody iframe'),
      { timeout: 8000 }
    );
    clickOk = true;
  } catch (e) {
    clickErr = e.message;
  }
  rec('A5a', `可点击打开 [id=${b.id}] ${b.title} → 预览区出现 iframe`, clickOk,
    clickOk ? 'iframe 已渲染' : `失败：${clickErr}`);
  if (!clickOk) continue;

  await sleep(700);
  const pv = await page.evaluate(() => ({
    previewTitle: document.querySelector('#previewTitle')?.textContent.trim() || '',
    iframeSrc: document.querySelector('#previewBody iframe')?.getAttribute('src') || '',
    activeCardId:
      document.querySelector('#shelfContainer .book-card.active')?.getAttribute('data-id') || '',
  }));
  await page.screenshot({ path: `${SHOT_DIR}/02-preview-note${b.id}.png`, fullPage: false });

  rec('A5b', `#previewTitle = ${b.title} [id=${b.id}]`, pv.previewTitle === b.title,
    `实际="${pv.previewTitle}"`);
  rec('A5c', `iframe src = ${b.file} [id=${b.id}]`, pv.iframeSrc === b.file,
    `实际="${pv.iframeSrc}"`);
  rec('A5e', `卡片高亮态跟随 [id=${b.id}]`, pv.activeCardId === b.id,
    `实际 active 卡片 data-id="${pv.activeCardId}"`);

  // iframe 内容是否真的加载出正文（而非空白）
  let iframeTextLen = -1;
  try {
    const frames = page.frames();
    const f = frames.find((fr) => (fr.url() || '').endsWith(b.file));
    if (f) iframeTextLen = await f.evaluate(() => document.body.innerText.trim().length);
  } catch (e) {
    iframeTextLen = -1;
  }
  rec('A5d', `iframe 正文实际渲染出内容（非空）[id=${b.id}]`, iframeTextLen > 200,
    `iframe 正文字符数=${iframeTextLen}`);
}

/* ---------- 断言 7：分类钻入回归 ---------- */
let drill = null;
try {
  await page.evaluate((cat) => {
    const sec = [...document.querySelectorAll('#shelfContainer .shelf-section')].find(
      (s) => s.querySelector('.shelf-label')?.textContent.trim() === cat
    );
    if (!sec) throw new Error('未找到分类区块');
    sec.querySelector('.shelf-section-header').click();
  }, CAT);
  await page.waitForFunction(
    () => document.querySelectorAll('#categoryDetailGrid .book-card').length > 0,
    { timeout: 8000 }
  );
  await sleep(400);
  drill = await page.evaluate(() => ({
    title: document.querySelector('#categoryDetailTitle')?.textContent.trim() || '',
    countText: document.querySelector('#categoryDetailCount')?.textContent.trim() || '',
    cards: [...document.querySelectorAll('#categoryDetailGrid .book-card')].map((c) => ({
      id: c.getAttribute('data-id'),
      title: c.querySelector('.book-title')?.textContent.trim() || '',
    })),
  }));
  await page.screenshot({ path: `${SHOT_DIR}/03-category-detail.png`, fullPage: false });
} catch (e) {
  drill = { error: e.message };
}

const drillTitles = drill?.cards?.map((c) => c.title) || [];
rec('A7a', `分类钻入：详情页标题 = ${CAT}`, drill?.title === CAT,
  `实际="${drill?.title || drill?.error}"`);
rec('A7b', `分类详情页书籍数 = ${EXPECT_CAT_COUNT}`, drill?.cards?.length === EXPECT_CAT_COUNT,
  `实际 ${drill?.cards?.length ?? 0} 本${drill?.countText ? `（标注"${drill.countText}"）` : ''}`);
for (const b of NEW_BOOKS) {
  rec('A7c', `分类详情页含新书 [id=${b.id}] ${b.title}`, drillTitles.includes(b.title),
    `详情页标题列表=${JSON.stringify(drillTitles)}`);
}

/* ---------- 断言 6：无 console error ---------- */
// 环境噪音判定：本地静态服务器没有 favicon.ico，浏览器自动请求会 404。
// console 里的文本是通用的 "Failed to load resource: ... 404 (File not found)"，不含 URL，
// 因此改为依据「实际 4xx 响应的 URL」归因：若所有 4xx 都是 favicon，则这些 console error 归为环境噪音。
const bad4xxRaw = badResponses.filter((r) => /HTTP 4\d\d|REQFAIL/.test(r));
const nonFaviconBad = bad4xxRaw.filter((r) => !/favicon/i.test(r));
const isEnvNoise = (s) => /favicon/i.test(s);
const realConsoleErrors =
  nonFaviconBad.length === 0 && bad4xxRaw.length > 0
    ? consoleErrors.filter((e) => !/Failed to load resource/i.test(e))
    : consoleErrors.filter((e) => !isEnvNoise(e));
const realBadResp = nonFaviconBad;
console.log('\n[DEBUG] 原始 4xx/失败请求: ' + JSON.stringify(bad4xxRaw));
console.log('[DEBUG] 原始 console error: ' + JSON.stringify(consoleErrors));
rec('A6a', '无 page error（未捕获异常）', pageErrors.length === 0,
  pageErrors.length ? JSON.stringify(pageErrors) : '0 条');
rec('A6b', '无 console error（已排除 favicon 噪音）', realConsoleErrors.length === 0,
  realConsoleErrors.length ? JSON.stringify(realConsoleErrors) : '0 条');
rec('A6c', '无失败请求 / 4xx-5xx（已排除 favicon）', realBadResp.length === 0,
  realBadResp.length ? JSON.stringify(realBadResp.slice(0, 10)) : '0 条');

/* ---------- 汇总 ---------- */
await browser.close();

const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass);
console.log('\n================ SUMMARY ================');
console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed.length}`);
if (failed.length) {
  console.log('\n--- FAILED ---');
  for (const f of failed) console.log(`  [${f.id}] ${f.name}\n      ${f.detail}`);
}
console.log('\n--- ENV NOISE (非缺陷) ---');
console.log(`  favicon 相关: ${consoleErrors.length - realConsoleErrors.length + (badResponses.length - realBadResp.length)} 条`);
console.log(`  截图目录: ${SHOT_DIR}`);
console.log('\nRESULT_JSON=' + JSON.stringify({ total: results.length, passed, failed: failed.map((f) => ({ id: f.id, name: f.name, detail: f.detail })) }));
process.exit(failed.length ? 1 : 0);
