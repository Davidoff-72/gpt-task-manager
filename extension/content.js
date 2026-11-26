(() => {
  // Only visible controls and explicit UI alerts are inspected; message bodies are never sent or stored.
  let path = location.pathname, active = false, stopRequested = false, lastAssistantCount = 0, timer;
  const visible = el => !!(el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  const send = (type, extra = {}) => chrome.runtime.sendMessage({source: 'chatgpt-adapter', type, conversation: path, title: document.title.replace(/\s*[-|–]\s*ChatGPT\s*$/i, '').slice(0, 200), ...extra}).catch(() => {});
  const stopButton = () => [...document.querySelectorAll('button')].find(el => visible(el) && /stop (generating|streaming|responding)|생성 중지|응답 중지/i.test([el.getAttribute('aria-label'), el.getAttribute('title'), el.dataset.testid, el.textContent].join(' ')));
  const composer = () => document.querySelector('#prompt-textarea, [data-testid="composer"] textarea, textarea[placeholder], [contenteditable="true"][data-id]');
  const alerts = () => [...document.querySelectorAll('[role="alert"], [data-testid*="error"], [data-testid*="limit"]')].filter(visible).map(el => el.textContent.slice(0, 500)).join(' ');
  function check() {
    if (path !== location.pathname) { path = location.pathname; active = false; stopRequested = false; send('RESET'); }
    const error = alerts();
    if (/rate limit|usage limit|too many requests|message limit|사용량 제한|요청이 너무 많|메시지 한도/i.test(error)) { active = false; send('RATE_LIMITED'); return; }
    if (/something went wrong|network error|error generating|오류가 발생|네트워크 오류/i.test(error)) { active = false; send('ERROR'); return; }
    const stop = stopButton();
    const assistantCount = document.querySelectorAll('[data-message-author-role="assistant"]').length;
    if (stop) { if (!active) { active = true; stopRequested = false; lastAssistantCount = assistantCount; send('OBSERVE_ACTIVE'); } return; }
    if (active) {
      active = false;
      if (stopRequested) send('STOP');
      // A visible composer plus an assistant turn is needed; no signal is guessed from a missing button alone.
      else if (visible(composer()) && assistantCount > 0 && assistantCount >= lastAssistantCount) send('FINISH');
      else send('UNCERTAIN');
    } else if (visible(composer())) send('IDLE');
    else send('UNCERTAIN');
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(check, 1200); }
  document.addEventListener('click', e => { const button = e.target.closest('button'); if (button && button === stopButton()) stopRequested = true; }, true);
  new MutationObserver(schedule).observe(document.documentElement, {subtree: true, childList: true, attributes: true, attributeFilter: ['aria-label', 'disabled', 'data-testid']});
  window.addEventListener('popstate', schedule);
  window.addEventListener('pageshow', () => { active = false; send('RESET'); schedule(); });
  send('RESET'); schedule();
})();
