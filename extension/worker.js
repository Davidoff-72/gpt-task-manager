importScripts('core.js');
const defaults = {desktop: true, sound: true, volume: 0.5, privacy: false, skipActive: false, dnd: false, favicon: false, titlePrefix: false, diagnostic: false};
let state = {}, projects = {}, diagnostics = [], settings = {...defaults}, ready = chrome.storage.local.get(['tasks', 'settings', 'projects', 'diagnostics']).then(data => { state = data.tasks || {}; projects = data.projects || {}; diagnostics = Array.isArray(data.diagnostics) ? data.diagnostics.slice(-100) : []; settings = {...defaults, ...data.settings}; });
const projectKey = path => /^\/c\/[a-zA-Z0-9-]{1,120}$/.test(path || '') ? path : null;
let queue = Promise.resolve();
function serial(fn) { const result = queue.then(() => ready).then(fn); queue = result.catch(console.error); return result; }
const validUrl = url => { try { return new URL(url).origin === 'https://chatgpt.com'; } catch { return false; } };
async function save() { await chrome.storage.local.set({tasks: state}); }
function remember(old, next, type, reason) {
  const history=Array.isArray(old.history) ? old.history.slice(-29) : [];
  const entry={at:Date.now(),event:type,from:old.status||'UNKNOWN',to:next.status||'UNKNOWN',reason};
  const last=history[history.length-1];
  if (!last || last.event!==entry.event || last.from!==entry.from || last.to!==entry.to || last.reason!==entry.reason) history.push(entry);
  return {...next,history};
}
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
    const types = ['RESET','MIGRATE','SUBMIT','OBSERVE_ACTIVE','STOP','FINISH','ERROR','RATE_LIMITED','UNCERTAIN','IDLE'];
    const reject = reason => { reply({ok:false,reason}); if (sender.id === chrome.runtime.id) serial(async () => { diagnostics.push({at:Date.now(),event:'REJECTED',reason}); diagnostics=diagnostics.slice(-100); await chrome.storage.local.set({diagnostics}); }); };
    if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || !Number.isInteger(sender.tab?.id)) { reject('INVALID_SENDER'); return; }
    if (!validUrl(sender.url) || !validUrl(sender.tab.url)) { reject('INVALID_ORIGIN'); return; }
    if (typeof msg.conversation !== 'string' || !msg.conversation.startsWith('/') || msg.conversation.length > 500 || !types.includes(msg.type)) { reject('INVALID_MESSAGE'); return; }
    serial(async () => {
      const id = sender.tab.id;
      // sender.url can be the original document URL after a History API navigation.
      // Re-check the current Chrome tab URL instead of treating sender.url's path as current.
      let tab; try { tab = await chrome.tabs.get(id); } catch { reject('TAB_UNAVAILABLE'); return; }
      if (!validUrl(tab.url)) { reject('INVALID_ORIGIN'); return; }
      const previous = state[id] || {tabId:id, status:'UNKNOWN', unread:false};
      const currentPath = new URL(tab.url).pathname;
      // A new chat can acquire its /c/ URL before the queued root-page start arrives.
      // Permit only non-terminal root events from the same document, then require MIGRATE.
      const rootStartRace = msg.conversation === '/' && !!projectKey(currentPath) && !!sender.documentId &&
        ['RESET','IDLE','SUBMIT','OBSERVE_ACTIVE'].includes(msg.type) &&
        (!previous.conversation || (previous.conversation === '/' && previous.documentId === sender.documentId));
      if (currentPath !== msg.conversation && !rootStartRace) { reject('TAB_ROUTE_MISMATCH'); return; }
      if (msg.type !== 'RESET' && previous.documentId && previous.documentId !== sender.documentId) { reject('DOCUMENT_MISMATCH'); return; }
      if (msg.type === 'MIGRATE') {
        if (!sender.documentId || previous.documentId !== sender.documentId || previous.conversation !== '/' || !projectKey(msg.conversation) || previous.status !== 'PROCESSING' || !previous.taskId) { reject('MIGRATION_NOT_VERIFIED'); return; }
      } else if (msg.type !== 'RESET' && previous.conversation !== msg.conversation) { reject('STATE_ROUTE_MISMATCH'); return; }
      let next = msg.type === 'MIGRATE' ? {...previous,conversation:msg.conversation} : TaskCore.transition(previous, msg, Date.now(), crypto.randomUUID());
      if (msg.type === 'RESET' || msg.type === 'MIGRATE') next.project = projects[projectKey(msg.conversation)] || '';
      next.tabId = id; next.windowId = sender.tab.windowId; next.documentId = sender.documentId || null; next.title = typeof msg.title === 'string' ? msg.title.slice(0,200) : '';
      next = remember(previous,next,msg.type,TaskCore.reason(previous,msg,next));
      if (JSON.stringify(previous) === JSON.stringify(next)) { reply({ok:true}); return; }
      state[id] = next;
      if (settings.diagnostic && previous.status !== next.status) { diagnostics.push({at:Date.now(),event:msg.type,status:next.status}); diagnostics = diagnostics.slice(-100); await chrome.storage.local.set({diagnostics}); }
      await save(); await badge();
      if (['COMPLETED','ERROR','RATE_LIMITED'].includes(next.status) && next.status !== previous.status) await notify(next, next.status);
      reply({ok:true});
    }).catch(() => reject('WORKER_ERROR'));
    return true;
  }
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('')) || !msg || msg.target === 'audio') return;
  serial(async () => {
    if (msg.type === 'GET') { const tabs = await chrome.tabs.query({url:'https://chatgpt.com/*'}); const ids = new Set(tabs.map(t => t.id)); for (const id of Object.keys(state)) if (!ids.has(Number(id))) delete state[id]; for (const tab of tabs) if (!state[tab.id]) state[tab.id] = {tabId:tab.id, windowId:tab.windowId, title:tab.title || '', status:tab.discarded ? 'SUSPENDED' : 'UNKNOWN', unread:false}; await save(); reply({tasks:Object.values(state), settings}); }
    else if (msg.type === 'SETTINGS') { const s = msg.settings || {}; settings = {...defaults, desktop:!!s.desktop, sound:!!s.sound, privacy:!!s.privacy, skipActive:!!s.skipActive, dnd:!!s.dnd, favicon:!!s.favicon, titlePrefix:!!s.titlePrefix, diagnostic:!!s.diagnostic, volume:Math.max(0, Math.min(1, Number(s.volume) || 0))}; await chrome.storage.local.set({settings}); reply({ok:true}); }
    else if (msg.type === 'OPEN' && Number.isInteger(msg.tabId)) { const tab = await chrome.tabs.get(msg.tabId); if (validUrl(tab.url)) { await chrome.windows.update(tab.windowId,{focused:true}); await chrome.tabs.update(tab.id,{active:true}); } reply({ok:true}); }
    else if (msg.type === 'READ_ALL') { for (const id in state) if (state[id].unread) { const prev=state[id], event={type:'READ'}, next=TaskCore.transition(prev,event); state[id]=remember(prev,next,'READ',TaskCore.reason(prev,event,next)); } await save(); await badge(); reply({ok:true}); }
    else if (msg.type === 'PROJECT' && Number.isInteger(msg.tabId) && state[msg.tabId]) { const project = String(msg.project || '').slice(0,100); const key = projectKey(state[msg.tabId].conversation); if (key) { if (project) projects[key] = project; else delete projects[key]; for (const task of Object.values(state)) if (task.conversation === key) task.project = project; await chrome.storage.local.set({projects}); } else state[msg.tabId].project = project; await save(); reply({ok:true}); }
    else if (msg.type === 'TEST') { await notify({tabId:-1,title:'알림 테스트'}, 'COMPLETED'); reply({ok:true,suppressed:settings.dnd}); }
    else if (msg.type === 'VISUAL_TEST') {
      if (!Number.isInteger(msg.tabId) || !(msg.status === null || ['PROCESSING','COMPLETED','ERROR','UNKNOWN'].includes(msg.status))) { reply({ok:false,reason:'INVALID_MESSAGE'}); return; }
      let tab; try { tab=await chrome.tabs.get(msg.tabId); } catch { reply({ok:false,reason:'TAB_UNAVAILABLE'}); return; }
      if (!validUrl(tab.url)) { reply({ok:false,reason:'INVALID_ORIGIN'}); return; }
      try { const result=await chrome.tabs.sendMessage(msg.tabId,{target:'visual-test',status:msg.status},{frameId:0}); reply(result?.ok ? result : {ok:false,reason:result?.reason || 'NO_PROBE_RESPONSE'}); }
      catch { reply({ok:false,reason:'NO_CONTENT_SCRIPT'}); }
    }
    else if (msg.type === 'PROBE' && Number.isInteger(msg.tabId)) {
      let tab; try { tab=await chrome.tabs.get(msg.tabId); } catch { reply({ok:false,reason:'TAB_UNAVAILABLE'}); return; }
      if (!validUrl(tab.url)) { reply({ok:false,reason:'INVALID_ORIGIN'}); return; }
      try { const result=await chrome.tabs.sendMessage(msg.tabId,{target:'probe'},{frameId:0}); if (!result?.injected) { reply({ok:false,reason:'NO_PROBE_RESPONSE'}); return; } const kind=result.visual?.iconKind; const expected=['idle','processing','generating','completed','error','stopped','unknown'].includes(kind) ? chrome.runtime.getURL(`icons/status-${kind}.png`) : null; const tabIcon = !tab.favIconUrl || !expected ? 'unavailable' : tab.favIconUrl === expected ? 'match' : 'different'; reply({ok:true,probe:result,tabIcon}); }
      catch { reply({ok:false,reason:'NO_CONTENT_SCRIPT'}); }
    }
    else if (msg.type === 'DIAGNOSTICS') reply({entries:diagnostics});
    else if (msg.type === 'CLEAR_DIAGNOSTICS') { diagnostics=[]; await chrome.storage.local.set({diagnostics}); reply({ok:true}); }
  }).catch(() => reply({ok:false})); return true;
});
chrome.tabs.onRemoved.addListener(id => serial(async () => { delete state[id]; await save(); await badge(); }));
chrome.tabs.onUpdated.addListener((id, change, tab) => serial(async () => { if (!state[id]) return; if (!validUrl(tab.url)) { delete state[id]; } else if (change.discarded || change.status === 'loading') { const prev=state[id], event={type:'SUSPEND',routeChanged:change.status==='loading' && !!prev.conversation && new URL(tab.url).pathname!==prev.conversation}; const next=TaskCore.transition(prev,event); state[id]=remember(prev,next,'SUSPEND',TaskCore.reason(prev,event,next)); } else return; await save(); await badge(); }));
chrome.tabs.onActivated.addListener(({tabId}) => serial(async () => { if (state[tabId]?.unread) { const prev=state[tabId], event={type:'READ'}, next=TaskCore.transition(prev,event); state[tabId]=remember(prev,next,'READ',TaskCore.reason(prev,event,next)); await save(); await badge(); } }));
chrome.notifications.onClicked.addListener(id => { const m = /^task:(\d+):/.exec(id); if (m) chrome.tabs.get(Number(m[1])).then(t => { chrome.windows.update(t.windowId,{focused:true}); chrome.tabs.update(t.id,{active:true}); }).catch(() => {}); });
chrome.runtime.onInstalled.addListener(() => { chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:false}).catch(() => {}); });
