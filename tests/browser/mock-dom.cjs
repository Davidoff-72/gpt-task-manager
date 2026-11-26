// Playwright + Chromium headless shell; simulated page and chrome.runtime, NOT an extension-load or real ChatGPT test.
const {chromium} = require('playwright-core');
const bundle = require('@sparticuz/chromium').default;
const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os'); const zlib = require('node:zlib'); const {execFileSync} = require('node:child_process');
const assert = require('node:assert/strict');
(async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gpt-browser-libs-'));
  const archive=path.join(dir,'libs.tar');
  fs.writeFileSync(archive,zlib.brotliDecompressSync(fs.readFileSync(path.join(path.dirname(require.resolve('@sparticuz/chromium')),'..','bin','al2023.tar.br'))));
  execFileSync('tar',['-xf',archive,'-C',dir]);
  const browser=await chromium.launch({executablePath:await bundle.executablePath(),args:bundle.args,env:{...process.env,LD_LIBRARY_PATH:path.join(dir,'lib')+':'+(process.env.LD_LIBRARY_PATH||'')}});
  try {
    const page=await browser.newPage();
    await page.setContent('<title>Fixture - ChatGPT</title><main><div id="conversation"></div><textarea id="prompt-textarea"></textarea><button data-testid="send-button">Send</button></main>');
    await page.evaluate(()=>{window.events=[];window.chrome={runtime:{sendMessage:msg=>{window.events.push(msg.type); return Promise.resolve();}}};});
    await page.addScriptTag({path:'extension/detector.js'}); await page.addScriptTag({path:'extension/content.js'});
    await page.waitForFunction(()=>events.includes('IDLE'));
    await page.click('[data-testid=send-button]');
    await page.evaluate(()=>document.querySelector('main').insertAdjacentHTML('beforeend','<button aria-label="Stop generating">Stop</button>'));
    await page.waitForFunction(()=>events.includes('OBSERVE_ACTIVE'));
    await page.evaluate(()=>{document.querySelector('#conversation').innerHTML='<article data-testid="conversation-turn-1"><div data-message-author-role="assistant">fixture</div><button aria-label="Copy response">Copy</button></article><div role="status">Searching</div>'; document.querySelector('[aria-label="Stop generating"]').remove();});
    await page.waitForTimeout(11000);
    assert.equal(await page.evaluate(()=>events.includes('FINISH')),false,'tool activity must block completion');
    await page.evaluate(()=>document.querySelector('[role=status]').remove());
    await page.waitForFunction(()=>events.includes('FINISH'),null,{timeout:14000});
    assert.equal(await page.evaluate(()=>events.filter(x=>x==='FINISH').length),1);
    const events=await page.evaluate(()=>window.events);
    console.log('PASS mocked DOM in Chromium headless shell: tool pause, stable completion, no duplicate:',events.join(', '));
    const second=await browser.newPage();
    await second.setContent('<main><textarea id="prompt-textarea"></textarea><button data-testid="send-button">Send</button></main>');
    await second.evaluate(()=>{window.events=[];window.chrome={runtime:{sendMessage:msg=>{events.push(msg.type); return Promise.resolve();}}};});
    await second.addScriptTag({path:'extension/detector.js'}); await second.addScriptTag({path:'extension/content.js'});
    await second.waitForFunction(()=>events.includes('IDLE')); await second.click('[data-testid=send-button]');
    await second.evaluate(()=>document.querySelector('main').insertAdjacentHTML('beforeend','<button aria-label="Stop generating">Stop</button>'));
    await second.waitForFunction(()=>events.includes('OBSERVE_ACTIVE')); await second.click('[aria-label="Stop generating"]');
    await second.waitForFunction(()=>events.includes('STOP')); assert.equal(await second.evaluate(()=>events.includes('FINISH')),false);
    assert.equal(await page.evaluate(()=>events.filter(x=>x==='FINISH').length),1);
    console.log('PASS second independent mocked tab: explicit stop is not completion');
    await second.close(); await page.close();
  } finally {await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
