// Preserve the full library; hide duplicate cards only within each Home shelf.
(function(){try{
if(window.aviHomeDedupe)return;
function imageKey(raw){if(!raw)return '';try{const u=new URL(raw,location.href);if(/(^|\.)ytimg\.com$/.test(u.hostname)){const id=u.pathname.match(/\/vi(?:_webp)?\/([^/]+)/);if(id)return 'youtube:'+id[1];}if(/googleusercontent\.com$/.test(u.hostname))return u.origin+u.pathname.replace(/=[^/]*$/,'');u.hash='';u.search='';return u.origin+u.pathname;}catch{return raw;}}
function identity(card){return card.dataset.playlistId||card.dataset.plId||card.dataset.trackId||card.dataset.aviIdentity||'';}
function dedupeRow(row){const ids=new Set(),images=new Set(),titles=new Set();let hidden=0;for(const card of row.children){if(!card.matches('.herocard,.card,.bigcard,.stationcard,.gradcard,.widecard'))continue;const id=identity(card),img=card.querySelector('img'),image=imageKey(img?.getAttribute('src')||''),title=(card.querySelector('.ct,.hero-title,.hct')?.textContent||card.textContent||'').trim().replace(/\s+/g,' ');const duplicate=!!((id&&ids.has(id))||(image&&images.has(image))||(!id&&title&&titles.has(title)));if(duplicate){card.hidden=true;card.dataset.aviDuplicate='true';hidden++;}else{if(card.dataset.aviDuplicate){card.hidden=false;delete card.dataset.aviDuplicate;}if(id)ids.add(id);if(image)images.add(image);if(title)titles.add(title);}}return hidden;}
const style=document.createElement('style');style.textContent='#listenBody [data-avi-duplicate="true"]{display:none!important}';document.head.append(style);
let pending=false;function scan(){pending=false;for(const row of document.querySelectorAll('#listenBody .hscroll'))dedupeRow(row);}
const box=document.getElementById('listenBody');if(!box)return;const observer=new MutationObserver(()=>{if(!pending){pending=true;requestAnimationFrame(scan);}});observer.observe(box,{childList:true,subtree:true,attributes:true,attributeFilter:['src','data-playlist-id','data-pl-id','data-track-id','data-avi-identity']});
for(const [name,getId] of [['albumCardEl',a=>a?.plId],['sqCard',t=>t?.id],['sqCapCard',t=>t?.id],['wideCapCard',t=>t?.id],['bigCard',t=>t?.id]]){try{const original=window[name];if(typeof original!=='function')continue;window[name]=function(...args){const card=original.apply(this,args),id=getId(args[0]);if(id&&card?.dataset)card.dataset.aviIdentity=String(id);return card;};}catch{}}
window.aviHomeDedupe={imageKey,dedupeRow,scan};scan();
}catch(e){console.warn('home-row-dedupe disabled',e);}})();
// Keep the version label clear of the Home profile and hide diagnostic-only UI.
(function(){try{
const s=document.createElement('style');s.textContent='#verChip{left:auto!important;right:calc(8px + env(safe-area-inset-right))!important;top:calc(6px + env(safe-area-inset-top))!important;cursor:default!important}';document.head.append(s);
const chip=document.getElementById('verChip');if(chip){chip.addEventListener('click',e=>{e.stopImmediatePropagation();e.preventDefault();},true);chip.title='גרסה';}
if(typeof showStreamDiag==='function')showStreamDiag=function(){};
}catch(e){console.warn('production-ui disabled',e);}})();
