// Real extension loading against an intercepted, synthetic ChatGPT page; never contacts ChatGPT.
// Requires an extension-capable Chrome/Chromium, supplied as CHROME_PATH.
const {chromium}=require('playwright-core'); const path=require('node:path'); const fs=require('node:fs'); const os=require('node:os'); const assert=require('node:assert/strict');
(async()=>{
  if(!process.env.CHROME_PATH) throw new Error('Set CHROME_PATH to an extension-capable Chrome/Chromium binary');
  const ext=path.resolve('extension'), profile=fs.mkdtempSync(path.join(os.tmpdir(),'gpt-extension-e2e-'));
  let context;
  try {
    context=await chromium.launchPersistentContext(profile,{executablePath:process.env.CHROME_PATH,headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--no-sandbox',`--disable-extensions-except=${ext}`,`--load-extension=${ext}`]});
    const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker',{timeout:12000});
    const id=new URL(worker.url()).host;
    await context.route('https://chatgpt.com/**',route=>new URL(route.request().url()).pathname==='/original.png' ? route.fulfill({status:200,contentType:'image/png',body:fs.readFileSync('extension/icons/status-idle.png')}) : route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Fixture - ChatGPT</title><link rel="icon" type="image/png" sizes="32x32" href="/original.png"><main><div id="conversation"></div><textarea id="prompt-textarea"></textarea><button data-testid="send-button">Send</button></main>'}));
    const chat=await context.newPage(); await chat.goto('https://chatgpt.com/');
    const dashboard=await context.newPage(); await dashboard.goto(`chrome-extension://${id}/dashboard.html`);
    const tasks=()=>dashboard.evaluate(async()=>Object.values((await chrome.storage.local.get('tasks')).tasks||{}));
    async function waitStatus(status){await dashboard.waitForFunction(async status=>Object.values((await chrome.storage.local.get('tasks')).tasks||{}).some(t=>t.status===status),status,{timeout:15000});}
    await waitStatus('IDLE');
    const initial=await tasks(); const task=initial.find(x=>x.status==='IDLE'); assert.ok(task?.tabId);
    const probe=await dashboard.evaluate(tabId=>chrome.runtime.sendMessage({type:'PROBE',tabId}),task.tabId); assert.equal(probe.ok,true); assert.equal(probe.probe.injected,true); assert.equal(probe.probe.delivery.state,'ack');
    await dashboard.evaluate(()=>chrome.runtime.sendMessage({type:'SETTINGS',settings:{desktop:false,sound:false,volume:0.5,favicon:false,titlePrefix:true}}));
    const forced=await dashboard.evaluate(tabId=>chrome.runtime.sendMessage({type:'VISUAL_TEST',tabId,status:'PROCESSING'}),task.tabId);assert.equal(forced.ok,true);
    await dashboard.waitForFunction(async tabId=>(await chrome.tabs.get(tabId)).favIconUrl===chrome.runtime.getURL('icons/status-processing.png'),task.tabId,{timeout:15000});
    assert.ok((await chat.title()).startsWith('🔵 '));
    const vprobe=await dashboard.evaluate(tabId=>chrome.runtime.sendMessage({type:'PROBE',tabId}),task.tabId);assert.equal(vprobe.tabIcon,'match');
    await dashboard.evaluate(tabId=>chrome.runtime.sendMessage({type:'VISUAL_TEST',tabId,status:null}),task.tabId);
    await dashboard.waitForFunction(async tabId=>(await chrome.tabs.get(tabId)).favIconUrl==='https://chatgpt.com/original.png',task.tabId,{timeout:15000});
    console.log('PASS extension test: Chrome tab favicon metadata changed and original restored; on-screen rendering not verified');

    await chat.click('[data-testid=send-button]');
    await chat.evaluate(()=>document.querySelector('main').insertAdjacentHTML('beforeend','<button data-testid="stop-button" aria-label="Stop generating">Stop</button>'));
    await waitStatus('PROCESSING'); const active=(await tasks()).find(x=>x.tabId===task.tabId);
    await chat.evaluate(()=>{history.pushState({},'', '/c/new-fixture');document.querySelector('main').append(document.createElement('span'));});
    await dashboard.waitForFunction(async tabId=>{const t=(await chrome.storage.local.get('tasks')).tasks?.[tabId];return t?.conversation==='/c/new-fixture'&&t?.status==='PROCESSING';},task.tabId,{timeout:10000});
    assert.equal((await tasks()).find(x=>x.tabId===task.tabId).taskId,active.taskId);
    await chat.evaluate(()=>{document.querySelector('#conversation').innerHTML='<article data-testid="conversation-turn-1"><div data-message-author-role="assistant">fixture response</div><button aria-label="Copy response">Copy</button></article>';document.querySelector('[data-testid=stop-button]').remove();});
    await waitStatus('COMPLETED'); console.log('PASS actual extension + synthetic page: injection, ACK, detection and SPA migration');
  } finally {if(context) await context.close();fs.rmSync(profile,{recursive:true,force:true});}
})().catch(e=>{console.error('FAIL extension-load E2E:',e.message);process.exitCode=1;});
