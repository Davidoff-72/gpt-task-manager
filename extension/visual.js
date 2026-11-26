(() => {
  // Add our own favicon link only; never mutate or remove site-owned icons.
  let enabled=false, status='UNKNOWN', icon=null, observer=null;
  const styles={IDLE:['#77858b','–'],PROCESSING:['#246cc3','…'],THINKING:['#246cc3','…'],GENERATING:['#d18b00','✎'],COMPLETED:['#168769','✓'],ERROR:['#bd3434','!'],RATE_LIMITED:['#bd3434','!'],STOPPED:['#705e78','■'],SUSPENDED:['#705e78','Ⅱ'],UNKNOWN:['#6b7278','?']};
  function render(){
    if (!enabled) { if(icon) icon.remove(); icon=null; return; }
    if(!document.head) return;
    if(!icon) { icon=document.createElement('link'); icon.rel='icon'; icon.type='image/svg+xml'; icon.dataset.gptTaskManager='status'; }
    const [color,glyph]=styles[status]||styles.UNKNOWN;
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="${color}"/><text x="16" y="23" text-anchor="middle" font-family="sans-serif" font-size="21" font-weight="bold" fill="white">${glyph}</text></svg>`;
    const url='data:image/svg+xml,'+encodeURIComponent(svg); if(icon.href!==url) icon.href=url;
    const icons=[...document.head.querySelectorAll('link[rel~="icon"]')];
    if (icons[icons.length-1]!==icon) document.head.append(icon);
  }
  chrome.runtime.onMessage.addListener(msg=>{if(msg?.target==='visual' && Object.hasOwn(styles,msg.status)){status=msg.status;render();}});
  chrome.storage.local.get('settings').then(data=>{enabled=!!data.settings?.favicon;render();}).catch(()=>{});
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local' && changes.settings){enabled=!!changes.settings.newValue?.favicon;render();}});
  if(document.head){observer=new MutationObserver(render);observer.observe(document.head,{childList:true,subtree:false});}
  window.addEventListener('pagehide',()=>{if(observer) observer.disconnect(); if(icon) icon.remove();});
})();
