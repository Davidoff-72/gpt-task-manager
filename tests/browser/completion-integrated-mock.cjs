// Synthetic browser DOM connected to the real worker through mocked Chrome APIs.
// This is NOT a Chrome extension load, Windows or actual ChatGPT test.
const {chromium}=require('playwright-core'), bundle=require('@sparticuz/chromium').default;
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib'),vm=require('node:vm'),{execFileSync}=require('node:child_process'),{randomUUID}=require('node:crypto'),assert=require('node:assert/strict');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gpt-completion-libs-')),tar=path.join(dir,'libs.tar');
 fs.writeFileSync(tar,zlib.brotliDecompressSync(fs.readFileSync(path.join(path.dirname(require.resolve('@sparticuz/chromium')),'..','bin','al2023.tar.br'))));execFileSync('tar',['-xf',tar,'-C',dir]);
 const browser=await chromium.launch({executablePath:await bundle.executablePath(),args:bundle.args,env:{...process.env,LD_LIBRARY_PATH:path.join(dir,'lib')+':'+(process.env.LD_LIBRARY_PATH||'')}});
 try{
  const page=await browser.newPage(),disk={settings:{desktop:true,sound:false,favicon:true}},events={},notifications=[];
  const on=name=>({addListener:fn=>events[name]=fn});
  const chrome={storage:{local:{get:async()=>structuredClone(disk),set:async data=>Object.assign(disk,structuredClone(data))}},runtime:{id:'test-id',getURL:p=>'chrome-extension://test-id/'+p,onMessage:on('message'),onInstalled:on('installed'),sendMessage:async()=>{}},tabs:{get:async id=>({id,url:page.url(),windowId:1}),query:async()=>[],update:async()=>{},onRemoved:on('removed'),onUpdated:on('updated'),onActivated:on('activated'),sendMessage:async(id,msg)=>page.evaluate(m=>new Promise(resolve=>{let answered=false;for(const fn of window.listeners){fn(m,{id:'test-id'},result=>{answered=true;resolve(result);});}if(!answered)resolve();}),msg)},windows:{update:async()=>{}},notifications:{create:async(id,opts)=>notifications.push({id,opts}),onClicked:on('clicked')},action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},offscreen:{hasDocument:async()=>true,createDocument:async()=>{}},sidePanel:{setPanelBehavior:async()=>{}}};
  const ctx=vm.createContext({chrome,console,crypto:{randomUUID},URL,Date,structuredClone});ctx.importScripts=()=>vm.runInContext(fs.readFileSync('extension/core.js','utf8'),ctx);vm.runInContext(fs.readFileSync('extension/worker.js','utf8'),ctx);
  await page.route('https://chatgpt.com/**',route=>new URL(route.request().url()).pathname.startsWith('/icons/')?route.fulfill({status:200,contentType:'image/png',body:fs.readFileSync('extension/icons/status-processing.png')}):route.fulfill({status:200,contentType:'text/html',body:'<html><head><title>Fixture - ChatGPT</title></head><body><main><div id="conversation"></div><textarea id="prompt-textarea"></textarea><button data-testid="send-button">Send</button></main></body></html>'}));
  await page.goto('https://chatgpt.com/c/fixture');
  const send=msg=>new Promise(resolve=>{const sender={id:'test-id',frameId:0,documentId:'doc1',url:page.url(),tab:{id:4,url:page.url(),windowId:1}};if(events.message(msg,sender,resolve)!==true)resolve({ok:false,reason:'NO_RESPONSE'});});
  await page.exposeFunction('sendToWorker',send);await page.exposeFunction('workerState',()=>disk.tasks?.[4]||null);
  await page.evaluate(()=>{window.listeners=[];window.chrome={runtime:{id:'test-id',getURL:p=>'https://chatgpt.com/'+p,sendMessage:m=>window.sendToWorker(m),onMessage:{addListener:fn=>listeners.push(fn)}},storage:{local:{get:async()=>({settings:{favicon:true}})},onChanged:{addListener:()=>{}}}};});
  await page.addScriptTag({path:'extension/detector.js'});await page.addScriptTag({path:'extension/visual.js'});await page.addScriptTag({path:'extension/content.js'});
  async function waitUntil(predicate,label){const end=Date.now()+15000;while(Date.now()<end){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error('Timed out waiting for '+label);}
  const waitState=status=>waitUntil(()=>disk.tasks?.[4]?.status===status,'state '+status);
  await waitState('IDLE');await page.click('[data-testid=send-button]');await waitState('UNKNOWN');
  const probe=await page.evaluate(()=>new Promise(resolve=>{for(const fn of listeners)fn({target:'probe'},{id:'test-id'},resolve);}));
  assert.ok(probe.trace.some(x=>x.reason==='STOP_NOT_OBSERVED'));
  await page.evaluate(()=>document.querySelector('main').insertAdjacentHTML('beforeend','<button data-testid="stop-button">Stop</button>'));await waitState('PROCESSING');
  const first=disk.tasks[4].taskId;
  await page.evaluate(()=>{document.querySelector('#conversation').innerHTML='<article><div data-message-author-role="assistant">fixture response</div><button aria-label="Copy response">Copy</button></article>';});
  await page.waitForTimeout(500);await page.evaluate(()=>document.querySelector('[data-testid=stop-button]').remove());await waitState('COMPLETED');
  assert.equal(disk.tasks[4].unread,true);assert.equal(notifications.length,1);
  await page.waitForFunction(()=>document.querySelector('link[data-gpt-task-manager]')?.href.includes('status-completed.png'));
  await send({source:'chatgpt-adapter',type:'FINISH',conversation:'/c/fixture',title:'Fixture'});
  await send({source:'chatgpt-adapter',type:'IDLE',conversation:'/c/fixture',title:'Fixture'});
  await send({source:'chatgpt-adapter',type:'RESET',conversation:'/c/fixture',title:'Fixture'});
  await events.updated(4,{status:'loading'},{url:page.url()});await send({source:'chatgpt-adapter',type:'RESET',conversation:'/c/fixture',title:'Fixture'});
  assert.equal(disk.tasks[4].status,'COMPLETED');assert.equal(disk.tasks[4].unread,true);assert.equal(notifications.length,1);
  assert.ok((await page.locator('link[data-gpt-task-manager]').getAttribute('href')).includes('status-completed.png'));
  await events.activated({tabId:4});assert.equal(disk.tasks[4].status,'COMPLETED');assert.equal(disk.tasks[4].unread,false);
  await page.click('[data-testid=send-button]');await waitUntil(()=>disk.tasks?.[4]?.pendingSubmit===true,'new submission');
  assert.equal(disk.tasks[4].status,'COMPLETED');await page.evaluate(()=>document.querySelector('main').insertAdjacentHTML('beforeend','<button data-testid="stop-button">Stop</button>'));await waitState('PROCESSING');
  assert.notEqual(disk.tasks[4].taskId,first);assert.equal(notifications.length,1);
  assert.ok(disk.tasks[4].history.some(e=>e.reason==='SAME_CONVERSATION_COMPLETION_PRESERVED'));
  console.log('PASS integrated mocked DOM/Chrome APIs: submit without stop → unknown; confirmed completion → green link; duplicate/idle/reset/reload → preserved; read separate; new observed run → processing');
  await page.close();
 }finally{await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
