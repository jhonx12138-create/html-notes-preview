import puppeteer from 'puppeteer';
import fs from 'fs';

const CHROME = '/Users/xuezhiyong/.cache/puppeteer/chrome/mac_arm-149.0.7827.22/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const URL = 'http://127.0.0.1:8899/index.html';
const DL = '/tmp/v862_dl2';
fs.rmSync(DL, { recursive: true, force: true }); fs.mkdirSync(DL, { recursive: true });

const results = [];
function ok(id, pass, detail) { results.push({ id, pass }); console.log(`${pass ? 'PASS' : 'FAIL'} [${id}] ${detail}`); }

const browser = await puppeteer.launch({ headless: true, executablePath: CHROME, protocolTimeout: 180000, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage();
page.setDefaultTimeout(60000);
page.setDefaultNavigationTimeout(60000);
await page.setViewport({ width: 1440, height: 900 });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('.book-card');
await new Promise(r => setTimeout(r, 600));

const client = await page.createCDPSession();
await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, eventsEnabled: true });

/* --- 1. 造数据：置顶 / 分类 / 用户笔记 / 字号 --- */
const seeded = await page.evaluate(async () => {
  // 置顶前 2 本
  const ids = [...document.querySelectorAll('.book-card')].slice(0, 2).map(c => c.dataset.id);
  localStorage.setItem('notes-pinned', JSON.stringify(ids));
  // 自定义分类
  localStorage.setItem('notes-categories-v2', JSON.stringify(['全部','测试分类A','其他']));
  // 内置笔记改名（notes-edits）
  localStorage.setItem('notes-edits', JSON.stringify({ _mod: { [ids[0]]: { title: '改过的标题', category: '测试分类A', author: '测试作者' } }, _del: [] }));
  // 字号偏好
  localStorage.setItem('notes-reader-font', '2');
  // 写一篇用户笔记到 IndexedDB
  await new Promise((res, rej) => {
    const r = indexedDB.open('notes-app', 1);
    r.onsuccess = e => { const db = e.target.result; const tx = db.transaction('user-notes','readwrite'); tx.objectStore('user-notes').put({ id:'utest-1', title:'我的用户笔记', file:'u.html', date:'2026-01-01', author:'我', category:'测试分类A', content:'<h1>正文</h1><p>这是用户上传的笔记正文</p>' }); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); };
    r.onerror = () => rej(r.error);
  });
  localStorage.setItem('user-notes-index', JSON.stringify([{ id:'utest-1', title:'我的用户笔记', file:'u.html', date:'2026-01-01', author:'我', category:'测试分类A' }]));
  return { pinned: ids, seededKeys: ['notes-pinned','notes-categories-v2','notes-edits','notes-reader-font','user-notes-index'] };
});
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('.book-card');
await new Promise(r => setTimeout(r, 800));

const afterSeed = await page.evaluate(() => ({
  pinnedMarks: document.querySelectorAll('.book-title').length,
  shelfHasEdited: document.body.innerHTML.includes('改过的标题'),
  shelfHasUser: document.body.innerHTML.includes('我的用户笔记'),
  chips: [...document.querySelectorAll('#categoryChips .category-chip')].map(c => c.textContent.replace(/\d+$/, '').trim()),
  noteCount: document.getElementById('noteCount').textContent.trim(),
}));
ok('setup. 造数据生效', afterSeed.shelfHasEdited && afterSeed.shelfHasUser && afterSeed.chips.includes('测试分类A'),
   `改名生效=${afterSeed.shelfHasEdited} 用户笔记上架=${afterSeed.shelfHasUser} 分类=[${afterSeed.chips}] 篇数="${afterSeed.noteCount}"`);

/* --- 2. 导出 --- */
await page.evaluate(() => document.querySelector('.tab-btn[data-tab="profile"]').click());
await page.evaluate(() => document.getElementById('exportDataBtn').click());
await new Promise(r => setTimeout(r, 2500));
const files = fs.readdirSync(DL).filter(f => f.endsWith('.json'));
let payload = null;
if (files.length) payload = JSON.parse(fs.readFileSync(DL + '/' + files[0], 'utf8'));
ok('export. 导出内容完整', files.length === 1 && payload && Object.keys(payload.localStorage).length >= 4 && payload.userNotes.length === 1 && payload.userNotes[0].content.includes('用户上传的笔记正文'),
   `文件=${JSON.stringify(files)} version=${payload?.version} lsKeys=${JSON.stringify(Object.keys(payload?.localStorage||{}))} userNotes=${payload?.userNotes?.length} 正文已含=${payload?.userNotes?.[0]?.content?.includes('用户上传的笔记正文')}`);

/* --- 3. 破坏数据 --- */
const wiped = await page.evaluate(() => {
  localStorage.removeItem('notes-pinned');
  localStorage.removeItem('notes-categories-v2');
  localStorage.removeItem('notes-edits');
  localStorage.setItem('notes-reader-font', '0');
  localStorage.setItem('user-notes-index', '[]');
  return new Promise(res => { const r = indexedDB.open('notes-app',1); r.onsuccess = e => { const tx = e.target.result.transaction('user-notes','readwrite'); tx.objectStore('user-notes').clear(); tx.oncomplete = () => res(true); }; });
});
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('.book-card');
await new Promise(r => setTimeout(r, 800));
const afterWipe = await page.evaluate(() => ({
  edited: document.body.innerHTML.includes('改过的标题'),
  user: document.body.innerHTML.includes('我的用户笔记'),
  chips: [...document.querySelectorAll('#categoryChips .category-chip')].length,
}));
ok('wipe. 数据已清空', !afterWipe.edited && !afterWipe.user,
   `改名还在=${afterWipe.edited} 用户笔记还在=${afterWipe.user} 自定义分类已消失(chips=${afterWipe.chips})`);

/* --- 4. 导入 --- */
const input = await page.$('#importFileInput');
await input.uploadFile(DL + '/' + files[0]);
await new Promise(r => setTimeout(r, 900));
const confirmShown = await page.evaluate(() => ({
  visible: !document.getElementById('confirmModal').classList.contains('hidden'),
  title: document.getElementById('confirmModalTitle').textContent,
  msg: document.getElementById('confirmModalMessage').textContent,
}));
await page.evaluate(() => document.getElementById('confirmModalOk').click());
await new Promise(r => setTimeout(r, 2200));   // 等待写入 + location.reload()
await page.waitForSelector('.book-card', { timeout: 15000 });
await new Promise(r => setTimeout(r, 900));
const afterImport = await page.evaluate(() => ({
  edited: document.body.innerHTML.includes('改过的标题'),
  user: document.body.innerHTML.includes('我的用户笔记'),
  chips: [...document.querySelectorAll('#categoryChips .category-chip')].map(c => c.textContent.replace(/\d+$/, '').trim()),
  font: localStorage.getItem('notes-reader-font'),
  pinned: JSON.parse(localStorage.getItem('notes-pinned') || '[]').length,
  dbContent: null,
}));
const dbContent = await page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('notes-app',1); r.onsuccess = e => res(e.target.result); r.onerror = () => rej(r.error); });
  const recs = await new Promise((res) => { const tx = db.transaction('user-notes','readonly'); const q = tx.objectStore('user-notes').getAll(); q.onsuccess = () => res(q.result); });
  return recs.map(r => ({ id: r.id, content: (r.content||'').slice(0, 30) }));
});
ok('import. 导入恢复全部数据',
   confirmShown.visible && afterImport.edited && afterImport.user && afterImport.chips.includes('测试分类A') && afterImport.font === '2' && afterImport.pinned === 2 && dbContent.length === 1,
   `确认弹窗="${confirmShown.title}" | 恢复后: 改名=${afterImport.edited} 用户笔记=${afterImport.user} 分类=[${afterImport.chips}] 字号档=${afterImport.font} 置顶数=${afterImport.pinned} IndexedDB记录=${JSON.stringify(dbContent)}`);

/* --- 5. 坏文件 --- */
fs.writeFileSync('/tmp/bad.json', '{ this is not json ');
const input2 = await page.$('#importFileInput');
await input2.uploadFile('/tmp/bad.json');
await new Promise(r => setTimeout(r, 800));
const badRes = await page.evaluate(() => {
  const t = document.querySelector('.toast');
  return { toast: t ? t.textContent : null, modalHidden: document.getElementById('confirmModal').classList.contains('hidden') };
});
ok('import. 坏文件提示不静默', !!badRes.toast && badRes.toast.includes('格式不正确'),
   `toast="${badRes.toast}" 确认框未误弹=${badRes.modalHidden}`);

ok('console. 全程零报错', errs.length === 0, `错误数=${errs.length} ${JSON.stringify(errs).slice(0,300)}`);

await browser.close();
const failed = results.filter(r => !r.pass);
console.log(`\n==== SUMMARY: ${results.length - failed.length}/${results.length} PASS ====`);
if (failed.length) process.exit(1);
