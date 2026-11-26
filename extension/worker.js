importScripts('core.js');
const defaults = {desktop: true, sound: true, volume: 0.5, privacy: false, skipActive: false, dnd: false, favicon: false};
let state = {}, settings = {...defaults}, ready = chrome.storage.local.get(['tasks', 'settings']).then(data => { state = data.tasks || {}; settings = {...defaults, ...data.settings}; });
let queue = Promise.resolve();
function serial(fn) { const result = queue.then(() => ready).then(fn); queue = result.catch(console.error); return result; }
const validUrl = url => { try { return new URL(url).origin === 'https://chatgpt.com'; } catch { return false; } };
async function save() { await chrome.storage.local.set({tasks: state}); }
async function badge() { const n = Object.values(state).filter(x => x.unread).length; await chrome.action.setBadgeText({text: n ? String(n) : ''}); await chrome.action.setBadgeBackgroundColor({color: '#168769'}); const icons = {PROCESSING:['…','#2867ae'], COMPLETED:['✓','#168769'], ERROR:['!','#bd3434'], RATE_LIMITED:['!','#bd3434'], SUSPENDED:['Ⅱ','#7b6e82'], UNKNOWN:['?','#69777a'], IDLE:['–','#69777a'], STOPPED:['■','#69777a']}; for (const t of Object.values(state)) { const [text,color] = icons[t.status] || icons.UNKNOWN; await chrome.action.setBadgeText({tabId:t.tabId,text}).catch(()=>{}); await chrome.action.setBadgeBackgroundColor({tabId:t.tabId,color}).catch(()=>{}); await chrome.tabs.sendMessage(t.tabId,{target:'visual',status:t.status}).catch(()=>{}); } }
async function notify(task, kind) {
  if (settings.dnd || (settings.skipActive && (await chrome.tabs.query({active:true, lastFocusedWindow:true})).some(t => t.id === task.tabId))) return;
  if (settings.desktop) {
    const label = settings.privacy ? 'ChatGPT 작업' : (task.project || task.title || 'ChatGPT');
    const duration = task.startedAt ? ` · ${Math.round((Date.now()-task.startedAt)/1000)}초` : '';
    try { await chrome.notifications.create(`task:${task.tabId}:${task.taskId || task.completedAt}`, {type:'basic', iconUrl:'icons/icon128.png', title:kind === 'COMPLETED' ? '답변 완료' : kind === 'RATE_LIMITED' ? '사용량 제한' : '오류 감지', message:label + duration}); } catch (e) { console.warn('Desktop notification unavailable',e); }
  }
  if (settings.sound) {
    try {
      if (!(await chrome.offscreen.hasDocument())) await chrome.offscreen.createDocument({url:'offscreen.html', reasons:['AUDIO_PLAYBACK'], justification:'Play local notification sounds'});
      await chrome.runtime.sendMessage({target:'audio', kind, volume:settings.volume});
    } catch (e) { console.warn('Audio unavailable', e); }
  }
}
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.source === 'chatgpt-adapter') {
    if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || !sender.tab?.id || !validUrl(sender.url) || !validUrl(sender.tab.url) || typeof msg.conversation !== 'string' || msg.conversation.length > 500 || new URL(sender.url).pathname !== msg.conversation || !['RESET','OBSERVE_ACTIVE','STOP','FINISH','ERROR','RATE_LIMITED','UNCERTAIN','IDLE'].includes(msg.type)) return;
    serial(async () => {
      const id = sender.tab.id, previous = state[id] || {tabId:id, status:'UNKNOWN', unread:false};
      // Do not accept an event for a different route before a reset.
      if (msg.type !== 'RESET' && previous.conversation !== msg.conversation) { reply({ok:false}); return; }
      const next = TaskCore.transition(previous, msg, Date.now(), crypto.randomUUID());
      next.tabId = id; next.windowId = sender.tab.windowId; next.title = typeof msg.title === 'string' ? msg.title.slice(0,200) : '';
      if (JSON.stringify(previous) === JSON.stringify(next)) { reply({ok:true}); return; }
      state[id] = next;
      await save(); await badge();
      if (['COMPLETED','ERROR','RATE_LIMITED'].includes(next.status) && next.status !== previous.status) await notify(next, next.status);
      reply({ok:true});
    }).catch(() => reply({ok:false}));
    return true;
  }
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('')) || !msg || msg.target === 'audio') return;
  serial(async () => {
    if (msg.type === 'GET') { const tabs = await chrome.tabs.query({url:'https://chatgpt.com/*'}); const ids = new Set(tabs.map(t => t.id)); for (const id of Object.keys(state)) if (!ids.has(Number(id))) delete state[id]; for (const tab of tabs) if (!state[tab.id]) state[tab.id] = {tabId:tab.id, windowId:tab.windowId, title:tab.title || '', status:tab.discarded ? 'SUSPENDED' : 'UNKNOWN', unread:false}; await save(); reply({tasks:Object.values(state), settings}); }
    else if (msg.type === 'SETTINGS') { const s = msg.settings || {}; settings = {...defaults, desktop:!!s.desktop, sound:!!s.sound, privacy:!!s.privacy, skipActive:!!s.skipActive, dnd:!!s.dnd, favicon:!!s.favicon, volume:Math.max(0, Math.min(1, Number(s.volume) || 0))}; await chrome.storage.local.set({settings}); reply({ok:true}); }
    else if (msg.type === 'OPEN' && Number.isInteger(msg.tabId)) { const tab = await chrome.tabs.get(msg.tabId); if (validUrl(tab.url)) { await chrome.windows.update(tab.windowId,{focused:true}); await chrome.tabs.update(tab.id,{active:true}); } reply({ok:true}); }
    else if (msg.type === 'READ_ALL') { for (const id in state) state[id] = TaskCore.transition(state[id], {type:'READ'}); await save(); await badge(); reply({ok:true}); }
    else if (msg.type === 'PROJECT' && Number.isInteger(msg.tabId) && state[msg.tabId]) { state[msg.tabId].project = String(msg.project || '').slice(0,100); await save(); reply({ok:true}); }
    else if (msg.type === 'TEST') { await notify({tabId:-1,title:'알림 테스트'}, 'COMPLETED'); reply({ok:true}); }
  }).catch(() => reply({ok:false})); return true;
});
chrome.tabs.onRemoved.addListener(id => serial(async () => { delete state[id]; await save(); await badge(); }));
chrome.tabs.onUpdated.addListener((id, change, tab) => serial(async () => { if (!state[id]) return; if (!validUrl(tab.url)) { delete state[id]; } else if (change.discarded || change.status === 'loading') state[id] = TaskCore.transition(state[id], {type:'SUSPEND'}); else return; await save(); await badge(); }));
chrome.tabs.onActivated.addListener(({tabId}) => serial(async () => { if (state[tabId]?.unread) { state[tabId] = TaskCore.transition(state[tabId], {type:'READ'}); await save(); await badge(); } }));
chrome.notifications.onClicked.addListener(id => { const m = /^task:(\d+):/.exec(id); if (m) chrome.tabs.get(Number(m[1])).then(t => { chrome.windows.update(t.windowId,{focused:true}); chrome.tabs.update(t.id,{active:true}); }).catch(() => {}); });
chrome.runtime.onInstalled.addListener(() => { chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:false}).catch(() => {}); });
