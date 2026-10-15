import puppeteer from 'puppeteer';
import fs from 'fs';
const CHROME='/Users/xuezhiyong/.cache/puppeteer/chrome/mac_arm-149.0.7827.22/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const b=await puppeteer.launch({headless:true,executablePath:CHROME,protocolTimeout:180000,args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']});
const cases=[
  ['合法但只含部分键', {app:'书阁',version:1,exportedAt:'2026-10-10T08:00:00.000Z',localStorage:{'notes-theme':'dark'},userNotes:[]}, true],
  ['合法含全部键', {app:'书阁',version:1,exportedAt:'2026-10-10T08:00:00.000Z',localStorage:{'notes-pinned':'["1"]','notes-theme':'light','notes-categories-v2':'["全部","其他"]','notes-edits':'{"_mod":{},"_del":[]}','notes-reader-font':'2','user-notes-index':'[]','notes-nickname':'我','notes-search-history':'["a"]'},userNotes:[]}, true],
  ['localStorage 为空对象', {app:'书阁',version:1,localStorage:{},userNotes:[]}, true],
  ['无 exportedAt（老备份）', {app:'书阁',version:1,localStorage:{'notes-theme':'dark'},userNotes:[]}, true],
  ['notes-edits=null 应拒绝', {app:'书阁',version:1,localStorage:{'notes-edits':'null'},userNotes:[]}, false],
  ['notes-pinned 非数组应拒绝', {app:'书阁',version:1,localStorage:{'notes-pinned':'"abc"'},userNotes:[]}, false],
  ['notes-theme 非法值应拒绝', {app:'书阁',version:1,localStorage:{'notes-theme':'neon'},userNotes:[]}, false],
  ['notes-reader-font 越界应拒绝', {app:'书阁',version:1,localStorage:{'notes-reader-font':'99'},userNotes:[]}, false],
];
let pass=0;
for (const [label,payload,shouldAccept] of cases){
  const p=await b.newPage();
  p.setDefaultTimeout(60000);
  await p.setViewport({width:1440,height:900});
  await p.goto('http://127.0.0.1:8899/index.html',{waitUntil:'networkidle0'});
  await p.waitForSelector('.book-card');
  const f='/tmp/edge_'+label.replace(/[^\w一-龥]/g,'_')+'.json';
  fs.writeFileSync(f,JSON.stringify(payload));
  const input=await p.$('#importFileInput');
  await input.uploadFile(f);
  await new Promise(r=>setTimeout(r,900));
  const r=await p.evaluate(()=>({
    modal: !document.getElementById('confirmModal').classList.contains('hidden'),
    toast: document.querySelector('.toast')?.textContent||null,
    msg: document.getElementById('confirmModalMessage').textContent,
  }));
  const accepted = r.modal;
  const good = accepted===shouldAccept;
  if(good)pass++;
  console.log(`${good?'PASS':'FAIL'} [${label}] 期望${shouldAccept?'接受':'拒绝'} 实际${accepted?'接受(弹确认框)':'拒绝'} ${r.toast?'toast="'+r.toast+'"':''}`);
  if(accepted){ await p.evaluate(()=>document.getElementById('confirmModalCancel').click()); }
  await p.close();
}
await b.close();
console.log(`\n==== ${pass}/${cases.length} PASS ====`);
if(pass<cases.length)process.exit(1);
