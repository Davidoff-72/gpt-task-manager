// Synthetic DOM/CSP tests only; they do not prove that Chrome displays the tab favicon.
const {chromium}=require('playwright-core'); const bundle=require('@sparticuz/chromium').default;
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const zlib=require('node:zlib');const {execFileSync}=require('node:child_process');const assert=require('node:assert/strict');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gpt-visual-libs-'));const archive=path.join(dir,'libs.tar');fs.writeFileSync(archive,zlib.brotliDecompressSync(fs.readFileSync(path.join(path.dirname(require.resolve('@sparticuz/chromium')),'..','bin','al2023.tar.br'))));execFileSync('tar',['-xf',archive,'-C',dir]);
 const browser=await chromium.launch({executablePath:await bundle.executablePath(),args:bundle.args,env:{...process.env,LD_LIBRARY_PATH:path.join(dir,'lib')+':'+(process.env.LD_LIBRARY_PATH||'')}});
 try {
  const page=await browser.newPage();
  await page.route('https://chatgpt.com/**',route=>{const u=new URL(route.request().url()); if(u.pathname.startsWith('/icons/')||u.pathname.endsWith('.png')) return route.fulfill({status:200,contentType:'image/png',body:fs.readFileSync('extension/icons/status-processing.png')}); return route.fulfill({status:200,headers:{'content-type':'text/html','content-security-policy':"img-src 'self'"},body:'<html><head><title>Original title</title><link rel="icon" sizes="32x32" href="/original.png"><link rel="icon" data-gpt-task-manager="status" href="data:image/svg+xml,old"></head><body></body></html>'});});
  await page.goto('https://chatgpt.com/');
  const svgBlocked=await page.evaluate(()=>new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(false);img.onerror=()=>resolve(true);img.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');}));
  assert.equal(svgBlocked,true);console.log('PASS synthetic CSP: img-src self blocks old SVG data URL (not a test of actual ChatGPT CSP)');
  await page.evaluate(()=>{window.handlers={};window.chrome={runtime:{id:'test',getURL:p=>'https://chatgpt.com/'+p,onMessage:{addListener:fn=>handlers.msg=fn}},storage:{local:{get:async()=>({settings:{favicon:true,titlePrefix:true}})},onChanged:{addListener:fn=>handlers.storage=fn}}};});
  await page.addScriptTag({path:'extension/visual.js'});
  await page.waitForFunction(()=>window.TaskVisual?.info().imageCheck==='loaded');
  assert.equal(await page.title(),'⚪ Original title');
  assert.equal(await page.locator('link[data-gpt-task-manager=status]').count(),1);
  assert.equal(await page.locator('link[rel=icon]').count(),2);
  await page.evaluate(()=>handlers.msg({target:'visual',status:'PROCESSING'},{id:'test'},()=>{}));
  await page.waitForFunction(()=>document.title==='🔵 Original title'&&TaskVisual.info().imageCheck==='loaded');
  assert.ok((await page.locator('link[data-gpt-task-manager=status]').getAttribute('href')).endsWith('/status-processing.png'));
  await page.evaluate(()=>{document.head.insertAdjacentHTML('beforeend','<link rel="icon" sizes="32x32" href="/updated.png">');document.title='Renamed by site';});
  await page.waitForFunction(()=>TaskVisual.info().lastIcon&&document.title==='🔵 Renamed by site');
  assert.equal(await page.evaluate(()=>TaskVisual.getBaseTitle()),'Renamed by site');
  await page.evaluate(()=>handlers.storage({settings:{newValue:{favicon:false,titlePrefix:false}}},'local'));
  assert.equal(await page.title(),'Renamed by site');assert.equal(await page.locator('link[data-gpt-task-manager=status]').count(),0);assert.equal(await page.locator('link[rel=icon]').count(),2);
  assert.equal(await page.locator('link[href="/original.png"]').count(),1);assert.equal(await page.locator('link[href="/updated.png"]').count(),1);
  for(const [status,part] of [['PROCESSING','processing'],['COMPLETED','completed'],['ERROR','error'],['UNKNOWN','unknown']]) {
    const r=await page.evaluate(status=>new Promise(resolve=>handlers.msg({target:'visual-test',status},{id:'test'},resolve)),status);assert.equal(r.ok,true);assert.ok((await page.locator('link[data-gpt-task-manager=status]').getAttribute('href')).endsWith(`/status-${part}.png`));
  }
  await page.waitForTimeout(15500);assert.equal(await page.evaluate(()=>TaskVisual.info().testActive),false);assert.equal(await page.locator('link[data-gpt-task-manager=status]').count(),0);
  console.log('PASS synthetic DOM: site icon conflict, site title update, opt-out, four forced states, 15-second restoration');
  const csp=await browser.newPage();const data='data:image/png;base64,'+fs.readFileSync('extension/icons/status-processing.png').toString('base64');
  await csp.route('https://chatgpt.com/**',route=>route.fulfill({status:200,headers:{'content-type':'text/html','content-security-policy':"img-src 'none'"},body:'<html><head><title>CSP fixture</title></head><body></body></html>'}));await csp.goto('https://chatgpt.com/');
  await csp.evaluate(url=>{window.chrome={runtime:{id:'test',getURL:()=>url,onMessage:{addListener:()=>{}}},storage:{local:{get:async()=>({settings:{favicon:true}})},onChanged:{addListener:()=>{}}}};},data);await csp.evaluate(code=>(0,eval)(code),fs.readFileSync('extension/visual.js','utf8'));
  await csp.waitForFunction(()=>TaskVisual.info().imageCheck==='failed'&&TaskVisual.info().cspBlocked);console.log('PASS synthetic restrictive img-src blocks data image and is reported; actual ChatGPT CSP not tested');
  await csp.close();await page.close();
 } finally {await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
