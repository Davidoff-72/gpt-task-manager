(() => {
  // Site-owned icons are never changed or removed. An extension-owned link is appended after them.
  let enabled=false, titleEnabled=false, status='UNKNOWN', icon=null, observer=null, testStatus=null, testTimer=null;
  let baseTitle=document.title, lastAppliedTitle=null, lastPrefix='', imageCheck='not-tested', checkedUrl='', cspBlocked=false;
  const styles={IDLE:'idle',PROCESSING:'processing',THINKING:'processing',GENERATING:'generating',COMPLETED:'completed',ERROR:'error',RATE_LIMITED:'error',STOPPED:'stopped',SUSPENDED:'unknown',UNKNOWN:'unknown'};
  const prefixes={IDLE:'⚪',PROCESSING:'🔵',THINKING:'🔵',GENERATING:'🔵',COMPLETED:'🟢',ERROR:'🔴',RATE_LIMITED:'🔴',STOPPED:'⚪',SUSPENDED:'⚪',UNKNOWN:'⚪'};
  function getBaseTitle(){ const current=document.title; if(lastAppliedTitle!==null && current===lastAppliedTitle) return baseTitle; return current; }
  function renderTitle(currentStatus){
    baseTitle=getBaseTitle();
    if(titleEnabled){const prefix=(prefixes[currentStatus]||'⚪')+' ';const desired=prefix+baseTitle;lastPrefix=prefix;lastAppliedTitle=desired;if(document.title!==desired)document.title=desired;}
    else {if(lastAppliedTitle!==null && document.title===lastAppliedTitle)document.title=baseTitle;lastAppliedTitle=null;lastPrefix='';}
  }
  function removeIcon(){if(icon)icon.remove();icon=null;}
  function imageProbe(url){if(checkedUrl===url)return;checkedUrl=url;imageCheck='pending';cspBlocked=false;const img=new Image();img.onload=()=>{if(checkedUrl===url)imageCheck='loaded';};img.onerror=()=>{if(checkedUrl===url)imageCheck='failed';};img.src=url;}
  function render(){
    const current=testStatus||status;
    renderTitle(current);
    if(!enabled && !testStatus){removeIcon();return;}
    if(!document.head)return;
    if(!icon){icon=document.createElement('link');icon.rel='icon';icon.type='image/png';icon.setAttribute('sizes','32x32');icon.dataset.gptTaskManager='status';}
    const url=chrome.runtime.getURL(`icons/status-${styles[current]||'unknown'}.png`);
    if(icon.getAttribute('href')!==url)icon.setAttribute('href',url);
    imageProbe(url);
    const icons=[...document.head.querySelectorAll('link[rel~="icon" i]')];
    if(icons[icons.length-1]!==icon)document.head.append(icon);
  }
  function info(){const icons=document.head?[...document.head.querySelectorAll('link[rel~="icon" i]')]:[];return {faviconEnabled:enabled,testActive:!!testStatus,iconKind:styles[testStatus||status]||'unknown',linkPresent:!!icon?.isConnected,lastIcon:!!icon&&icons[icons.length-1]===icon,imageCheck,cspBlocked,titleEnabled,titleApplied:!!lastAppliedTitle&&document.title===lastAppliedTitle,tabRendering:'not-verifiable'};}
  globalThis.TaskVisual={getBaseTitle,info};
  chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
    if(sender.id!==chrome.runtime.id)return;
    if(msg?.target==='visual' && Object.hasOwn(styles,msg.status)){status=msg.status;render();}
    if(msg?.target==='visual-test'){
      if(msg.status!==null && !['PROCESSING','COMPLETED','ERROR','UNKNOWN'].includes(msg.status)){reply({ok:false,reason:'INVALID_STATUS'});return;}
      if(testTimer)clearTimeout(testTimer);testTimer=null;testStatus=msg.status;
      if(testStatus)testTimer=setTimeout(()=>{testStatus=null;testTimer=null;render();},15000);
      render();reply({ok:true,visual:info()});
    }
  });
  chrome.storage.local.get('settings').then(data=>{enabled=!!data.settings?.favicon;titleEnabled=!!data.settings?.titlePrefix;render();}).catch(()=>{});
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local' && changes.settings){enabled=!!changes.settings.newValue?.favicon;titleEnabled=!!changes.settings.newValue?.titlePrefix;render();}});
  document.addEventListener('securitypolicyviolation',e=>{if(/(?:img-src|default-src)/i.test(e.violatedDirective||'') && /^(chrome-extension(?::|$)|data(?::|$))/i.test(e.blockedURI||''))cspBlocked=true;});
  function observe(){if(document.head){observer?.disconnect();observer=new MutationObserver(render);observer.observe(document.head,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['href','rel','sizes','type']});}}
  // Remove only recognizable leftovers injected by this extension in an earlier reload.
  const ownedPrefix=chrome.runtime.getURL('icons/status-');
  for(const old of document.querySelectorAll('link[data-gpt-task-manager="status"]')) {const href=old.getAttribute('href')||'';if(href.startsWith('data:image/svg+xml,') || href.startsWith(ownedPrefix))old.remove();}
  observe();
  window.addEventListener('pagehide',()=>{observer?.disconnect();if(testTimer)clearTimeout(testTimer);testStatus=null;testTimer=null;removeIcon();if(lastAppliedTitle!==null && document.title===lastAppliedTitle)document.title=baseTitle;lastAppliedTitle=null;lastPrefix='';});
  window.addEventListener('pageshow',()=>{observe();render();});
})();
