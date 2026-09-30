// Catalog-scoped recommendations from this device's listening, not editorial claims.
const personalAlbumCache=new Map();
async function catalogForTaste(a){
 let id=a.ch||a.id;
 if(!/^UC[\w-]{22}$/.test(id||'')){const match=(await within(searchChannels(a.name),12000)).find(c=>artistKey(c.name)===artistKey(a.name));id=match?.id||match?.chId;}
 if(!id)return [];
 if(!personalAlbumCache.has(id))personalAlbumCache.set(id,(async()=>{
  const r=await fetch(STREAM_API_DEFAULT+'/music-artist/'+encodeURIComponent(id),{signal:AbortSignal.timeout(15000)});if(!r.ok)return [];
  const j=await r.json();if(j.artistId!==id||j.dateSource!=='youtube-music-release-year')return [];
  return (j.releases||[]).filter(x=>x.artistId===id&&/^OLAK5uy_[A-Za-z0-9_-]{10,80}$/.test(x.plId||'')&&x.title).map(x=>({...x,artistName:a.name||j.artistName,sub:x.releaseYear||''}));
 })().catch(()=>[]));
 return personalAlbumCache.get(id);
}
async function buildPersonalAlbums(){
 const tastes=tasteArtists();if(!tastes.length)return {familiar:[],fresh:[]};
 const seenAlbums=new Set((state.history||[]).map(t=>t.album?.plId).filter(Boolean));
 const results=await Promise.allSettled(tastes.slice(0,3).map(catalogForTaste));
 const familiar=[];const used=new Set();
 results.forEach(r=>{if(r.status!=='fulfilled')return;const albums=r.value.filter(a=>releaseKind(a)==='album'&&!seenAlbums.has(a.plId)).sort((a,b)=>(a.popularityRank||9999)-(b.popularityRank||9999));for(const a of albums.slice(0,2))if(!used.has(a.plId)){used.add(a.plId);familiar.push(a);}});
 const names=new Set(tastes.map(a=>artistKey(a.name))),ids=new Set(tastes.map(a=>a.ch));
 let neighbors=[];try{neighbors=await musicNeighbors(tastes[0]);}catch{}
 const newArtists=neighbors.filter(a=>!ids.has(a.id)&&!names.has(artistKey(a.name))).slice(0,4);
 const newer=await Promise.allSettled(newArtists.map(a=>catalogForTaste({name:a.name,ch:a.id})));
 const fresh=[];newer.forEach(r=>{if(r.status!=='fulfilled')return;const releases=r.value.filter(a=>Number(a.releaseYear)>=new Date().getFullYear()-2&&!/(לילדים|שירי ילדים|children|kids)/i.test(a.title)&&!seenAlbums.has(a.plId)).sort((a,b)=>Number(b.releaseYear)-Number(a.releaseYear)||(a.recencyRank||9999)-(b.recencyRank||9999));const a=releases.find(a=>releaseKind(a)==='album')||releases[0];if(a&&!used.has(a.plId)){used.add(a.plId);fresh.push(a);}});
 return {familiar,fresh};
}
function addPersonalAlbums(){
 const box=$('listenBody');if(!tasteArtists().length||box.querySelector('#personalAlbums'))return;
 const entries=[['personalAlbums','אלבומים מומלצים','אלבומים מהאמנים שאתה שומע, לפי קטלוג האמן'],['newArtistAlbums','המלצות לזמרים חדשים','אמנים דומים שלא מופיעים בהאזנה שלך · הוצאות מהשנתיים האחרונות לפי שנת ההוצאה']];
 const shelves=entries.map(([id,title,note])=>{const shelf=sectionEl(title,'hscroll');shelf.sec.id=id;shelf.body.innerHTML='<div class="empty inline"><p>טוען המלצות לפי ההאזנה שלך...</p></div>';const n=document.createElement('div');n.className='catalog-note dim';n.textContent=note;shelf.sec.appendChild(n);box.appendChild(shelf.sec);return shelf;});
 buildPersonalAlbums().then(data=>{[data.familiar,data.fresh].forEach((albums,i)=>{const{sec,body,heading}=shelves[i];if(!sec.isConnected)return;if(!albums.length){sec.remove();return;}body.replaceChildren();albums.forEach(a=>body.appendChild(albumCardEl(a)));heading.disabled=false;heading.addEventListener('click',()=>openArtistAlbums(albums,entries[i][1]));});}).catch(()=>shelves.forEach(s=>s.sec.remove()));
}
const listenBeforeAlbums=renderListen;renderListen=async function(){await listenBeforeAlbums();addPersonalAlbums();};addPersonalAlbums();
