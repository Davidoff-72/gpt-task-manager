(() => {
  // Only control labels and explicit alerts are inspected. No conversation body leaves this page.
  let path = location.pathname, model = GptDetector.initial(), timer = null, timerDue = 0, assistantChanged = false, stopRequested = false, submitted = false;
  const visible = el => !!(el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  const send = type => chrome.runtime.sendMessage({source:'chatgpt-adapter',type,conversation:path,title:document.title.replace(/\s*[-|–]\s*ChatGPT\s*$/i,'').slice(0,200)}).catch(() => {});
  const stopButton = () => [...document.querySelectorAll('button')].find(el => visible(el) && /stop[- ](generating|streaming|responding|button)|생성 중지|응답 중지/i.test([el.getAttribute('aria-label'),el.getAttribute('title'),el.dataset.testid,el.textContent].join(' ')));
  const composer = () => document.querySelector('#prompt-textarea, [data-testid="composer"] textarea, textarea[placeholder], [contenteditable="true"][data-id]');
  const errorSignal = () => { const text = [...document.querySelectorAll('[role="alert"], [data-testid*="error"], [data-testid*="limit"]')].filter(visible).map(el=>el.textContent.slice(0,500)).join(' '); if (/rate limit|usage limit|too many requests|message limit|사용량 제한|요청이 너무 많|메시지 한도/i.test(text)) return 'RATE_LIMITED'; if (/something went wrong|network error|error generating|오류가 발생|네트워크 오류/i.test(text)) return 'ERROR'; return null; };
  const finalControl = () => { const nodes = document.querySelectorAll('[data-message-author-role="assistant"]'); const last = nodes[nodes.length-1]; if (!last) return false; const turn = last.closest('article, [data-testid^="conversation-turn"]'); if (!turn) return false; return [...turn.querySelectorAll('button')].some(el => visible(el) && /copy[- ](turn[- ]action[- ]button|response|answer)|copy|복사/i.test([el.getAttribute('aria-label'),el.getAttribute('title'),el.dataset.testid].join(' '))); };
  const toolBusy = () => [...document.querySelectorAll('[role="status"], [data-testid*="tool"], [aria-busy="true"]')].some(el => visible(el) && (/searching|browsing|using tool|running|검색 중|도구 사용|실행 중/i.test((el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('data-testid') || '') + ' ' + (el.getAttribute('role') === 'status' ? el.textContent.slice(0,150) : '')) || el.getAttribute('aria-busy') === 'true'));
  function schedule(delay=300) { const due=Date.now()+delay; if (timer && timerDue<=due) return; if (timer) clearTimeout(timer); timerDue=due; timer=setTimeout(() => {timer=null; timerDue=0; check();},delay); }
  function check() {
    if (path !== location.pathname) { path=location.pathname; model=GptDetector.initial(); assistantChanged=false; stopRequested=false; submitted=false; send('RESET'); }
    const result = GptDetector.step(model,{submitted,stopRequested,assistantChanged,stopVisible:!!stopButton(),composerReady:visible(composer()),finalControl:finalControl(),toolBusy:toolBusy(),error:errorSignal()},Date.now());
    model=result.state; submitted=false; stopRequested=false; assistantChanged=false;
    for (const event of result.events) send(event);
    if (model.phase==='candidate') schedule(GptDetector.STABLE_MS);
  }
  function submit() { submitted=true; schedule(); }
  document.addEventListener('keydown', e => { if (e.key==='Enter' && !e.shiftKey && !e.isComposing && !e.ctrlKey && !e.altKey && !e.metaKey && (e.target===composer() || composer()?.contains(e.target))) submit(); },true);
  document.addEventListener('click', e => { const b=e.target.closest('button'); if (!b) return; if (b===stopButton()) { stopRequested=true; schedule(); return; } const label=[b.dataset.testid,b.getAttribute('aria-label'),b.getAttribute('title')].join(' '); if (/send[- ]button|send message|메시지 보내기|regenerate|다시 생성|retry|재시도/i.test(label) && !b.disabled) submit(); },true);
  document.addEventListener('submit', e => { if (e.target.contains(composer())) submit(); },true);
  new MutationObserver(records => { if ((model.phase==='active'||model.phase==='candidate') && records.some(r => (r.target.nodeType===1?r.target:r.target.parentElement)?.closest?.('[data-message-author-role="assistant"]') || [...r.addedNodes].some(n=>n.nodeType===1 && (n.matches?.('[data-message-author-role="assistant"]') || n.querySelector?.('[data-message-author-role="assistant"]'))))) assistantChanged=true; schedule(); }).observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','disabled','data-testid','aria-busy']});
  window.addEventListener('popstate',schedule);
  window.addEventListener('pageshow',()=>{model=GptDetector.initial(); send('RESET'); schedule();});
  send('RESET'); schedule();
})();
