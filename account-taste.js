// Imported account taste is an additional seed, not invented listening history.
(function(){
'use strict';
let remote=null;
const previous=tasteArtists;
function readLocal(){try{return JSON.parse(localStorage.getItem('avi_taste_v1')||'null');}catch{return null;}}
function importedArtists(local,cloud){
 const counts=new Map();
 for(const source of [local,cloud])for(const [name,count] of Object.entries(source?.artists||{})){
  if(!name.trim()||!Number.isSafeInteger(count)||count<=0||['__proto__','constructor','prototype'].includes(name))continue;
  const key=artistKey(name);if(!key)continue;
  const prior=counts.get(key);if(!prior||count>prior.count)counts.set(key,{name,count});
 }
 return [...counts.values()];
}
tasteArtists=function(){
 const existing=previous(),merged=new Map();
 for(const seed of existing){const key=artistKey(seed.name);if(!key)continue;const prior=merged.get(key);if(!prior)merged.set(key,{...seed});else{prior.weight+=seed.weight||0;if(!prior.ch&&seed.ch)prior.ch=seed.ch;}}
 for(const seed of importedArtists(readLocal(),remote)){
  const key=artistKey(seed.name),entry=merged.get(key)||{name:seed.name,ch:'',weight:0};
  entry.weight+=Math.log2(1+seed.count);merged.set(key,entry);
 }
 return [...merged.values()].sort((a,b)=>b.weight-a.weight);
};
async function hydrate(){
 if(!window.aviAccount?.profile)return;
 try{const doc=await window.aviAccount.api('/g/account');if(!window.aviAccount.profile)return;remote=doc.data?.taste||null;document.dispatchEvent(new CustomEvent('avi-taste-ready'));if(typeof renderListen==='function')await renderListen();}
 catch{remote=null;}
}
document.addEventListener('avi-account-ready',hydrate);
if(window.aviAccount?.profile)hydrate();
window.aviTasteSeeds={importedArtists};
})();
