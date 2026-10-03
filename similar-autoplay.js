// Track-seeded autoplay; search results are candidates for selection, never a queue.
let singleSongGesture=false;
const rowBeforeSingle=trackRow;
trackRow=function(t,opts={}){
 const action=opts.onPlay;let row;
 const wrapped=action?{...opts,onPlay:()=>{const old=singleSongGesture;singleSongGesture=!row?.closest('#plTracks,#queueList')&&!(row?.closest('#alTracks')&&alCur);try{return action();}finally{singleSongGesture=old;}}}:opts;
 row=rowBeforeSingle(t,wrapped);return row;
};
for(const name of ['sqCard','sqCapCard','wideCapCard']){
 const before=window[name];if(!before)continue;
 window[name]=function(t,tap,...args){return before(t,()=>{const old=singleSongGesture;singleSongGesture=true;try{return tap();}finally{singleSongGesture=old;}},...args);};
}
function autoplayArtistKey(name){return artistKey(String(name||'').replace(/\b(?:vevo|official|topic)\b/gi,'')).replace(/[^\p{L}\p{N}]/gu,'');}
function autoplayArtistMatch(a,b){const x=autoplayArtistKey(a),y=autoplayArtistKey(b);return !!(x&&y&&(x===y||x.includes(y)||y.includes(x)));}
function autoplayTitle(t){
 let raw=String(t.title||'').replace(/\[[^\]]*\]|\([^)]*\)/g,' ');
 if(t.artist){const dash=raw.match(/^\s*(.{2,50}?)\s*[-–|]\s+/);if(dash&&autoplayArtistMatch(dash[1],t.artist))raw=raw.slice(dash[0].length);}
 let title=canonicalSongTitle({...t,title:raw});
 const names=[t.artist,...piyyutDomainArtists.map(a=>a.name),'תפארת הפיוט','יחזקאל ציון','Yehezkel Zion',...tasteArtists().map(a=>a.name)];
 for(const name of names){const n=normTxt(name).replace(/[^\p{L}\p{N}\s]/gu,'').trim();if(n)title=title.replace(n,' ');}
 return title.replace(/בלעדי לפורטל חזנות ופיוט|מוואל|בפקר/gi,' ').replace(/אל בעניי|אל בעני|אל בעוניי/g,'אל בעוני').replace(/\b(?:live|remix|cover|version|acoustic|instrumental|official|audio|video)\b|בהופעה חיה|הופעה חיה|ביצוע חי|גרסה|גירסה|רמיקס|קאבר|אקוסטי|מילים|קריוקי/gi,' ').replace(/\s+/g,' ').trim();
}
function autoplayAllowed(t){return !!t?.id&&!state.lessSuggestions?.[t.id]&&setSignals(t)<2&&(!t.dur||t.dur<=900)&&!/(נחמן|ברסלב|breslov|nachman|ballad|בלדה|בלדות|שירי ילדים|full album|האלבום המלא)/i.test(t.title+' '+t.artist);}
function autoplayProfile(seed){
 const specs=[...new Set([...Object.values(categoryDomains),...homeVibes])];
 const title=autoplayTitle(seed);
 const exact=specs.filter(s=>(s.songs||[]).some(([a,n])=>autoplayTitle({title:n,artist:a})===title&&autoplayArtistMatch(a,seed.artist)));
 if(exact.length)return exact.slice(0,2);
 if(/משה חבושה|תפארת הפיוט|ציון יחזקאל|יחזקאל ציון|יחיאל נהרי|יובל טייב/.test(seed.artist+' '+seed.title))return [categoryDomains[arabicCategoryNames[0]]];
 const paired=specs.filter(s=>(s.songs||[]).some(([a])=>autoplayArtistMatch(a,seed.artist)));if(paired.length)return paired.slice(0,1);
 const known=specs.filter(s=>s.artists?.some(a=>a.ch&&a.ch===seed.ch||autoplayArtistMatch(a.name,seed.artist)));
 return known.slice(0,1);
}
function balancedAutoplay(candidates,seed,existing=[]){
 const ids=new Set(existing.map(t=>t.id)),titles=new Set(existing.map(autoplayTitle));titles.add(autoplayTitle(seed));ids.add(seed.id);
 const artists=new Map;
 for(const t of candidates){const title=autoplayTitle(t);if(!autoplayAllowed(t)||!title||ids.has(t.id)||[...titles].some(k=>k===title||(k.length>=7&&title.length>=7&&(k.includes(title)||title.includes(k)))))continue;ids.add(t.id);titles.add(title);const k=songArtistIdentity(t);if(!artists.has(k))artists.set(k,[]);artists.get(k).push({...t,_autoplay:true});}
 const out=[];let last=songArtistIdentity(existing.at(-1)||seed);
 while(out.length<10&&artists.size){const keys=[...artists.keys()].sort((a,b)=>Number(a===last)-Number(b===last));const k=keys[0],group=artists.get(k);out.push(group.shift());last=k;if(!group.length)artists.delete(k);}
 return out;
}
async function buildRelatedAutoplay(seed,existing){
 const profiles=autoplayProfile(seed),artists=profiles.flatMap(s=>s.artists||[]);
 const groups=await Promise.allSettled(profiles.map(s=>s.loadTracks?s.loadTracks():buildHomeVibe(s)));
 let pool=groups.flatMap(r=>r.status==='fulfilled'?r.value:[]).map(t=>{const a=piyyutDomainArtists.find(a=>normTxt(t.title+' '+t.artist).includes(normTxt(a.name)));return a?{...t,artist:a.name}:t;});
 // Cached repertoire is eligible only inside the same style, not all listening history.
 for(const s of profiles)pool.push(...(genreDataByName.get(s.name)?.tracks||[]));
 let neighbors=[];try{neighbors=await within(musicNeighbors({name:seed.artist,ch:seed.ch}),10000);}catch{}
 const compatible=[...artists,...neighbors.map(a=>({name:a.name,ch:a.id}))].filter(a=>a.name);
 const queries=[...new Map(compatible.map(a=>[a.ch||artistKey(a.name),a])).values()].slice(0,5);
 if(pool.length<12&&queries.length){const rows=await Promise.allSettled(queries.map(async a=>songDiscovery(await within(searchMusicCached(a.name),12000)).filter(t=>artistMatchesTaste(t,[a]))));pool.push(...rows.flatMap(r=>r.status==='fulfilled'?r.value:[]));}
 // For unknown styles use source related tracks only with related-artist evidence.
 if(!profiles.length&&neighbors.length){try{const j=await pipedFetch('/streams/'+seed.id,8000);pool.push(...(j.relatedStreams||[]).filter(s=>s.type==='stream').map(mapStream).filter(t=>artistMatchesTaste(t,queries)));}catch{}}
 // Never return empty while the catalog has candidates: related streams of the seed, then other songs by the same artist. Taste and title-dedupe filters still apply downstream.
 if(!pool.length){try{const j=await pipedFetch('/streams/'+seed.id,8000);pool.push(...(j.relatedStreams||[]).filter(s=>s.url&&s.type==='stream').map(mapStream).filter(t=>t.id&&t.id!==seed.id));}catch{}}
 if(pool.length<6&&seed.artist){try{pool.push(...songDiscovery(await within(searchMusicCached(seed.artist),12000)).filter(t=>autoplayArtistMatch(t.artist,seed.artist)));}catch{}}
 return balancedAutoplay(pool,seed,existing);
}
const playBeforeSimilar=playQueue;
playQueue=function(tracks,index=0,options={}){
 const seed=tracks[index||0];if(!seed)return;
 const single=!options.station&&(singleSongGesture||tracks.length===1)&&!options.explicitList;
 if(single){const priority=[...(state.priorityQueue||[])];const t={...seed};delete t._domainScope;state.singleAutoplay={seed:t};state.shuffle=false;state.repeat='off';const result=playBeforeSimilar([t],0,options);state.priorityQueue=priority;save();return result;}
 state.singleAutoplay=null;return playBeforeSimilar(tracks,index,options);
};
const ensureBeforeSimilar=ensureUpNext;
let relatedPending=null;
ensureUpNext=async function(){
 if(!state.singleAutoplay)return ensureBeforeSimilar();
 if(!state.autoNext||state.queue.length-state.qi-1>=10)return;
 const token=state.queue,seed=state.singleAutoplay.seed;
 if(relatedPending?.token===token)return relatedPending.promise;
 const promise=(async()=>{try{const rows=await buildRelatedAutoplay(seed,token);if(state.queue!==token||!state.singleAutoplay||!state.autoNext)return;const fresh=balancedAutoplay(rows,seed,token).slice(0,Math.max(0,10-(token.length-state.qi-1)));token.push(...fresh);save();if($('queueSheet').classList.contains('open'))renderQueue();}finally{if(relatedPending?.token===token)relatedPending=null;}})();
 relatedPending={token,promise};return promise;
};
const renderBeforeSimilar=renderQueue;
renderQueue=function(){renderBeforeSimilar();if(!state.singleAutoplay)return;const heads=$('queueList').querySelectorAll('.qsect');for(const h of heads)if(h.textContent==='התור המקורי')h.textContent='שירים דומים';const note=$('queueList').querySelector('.qautonote');if(note)note.textContent=state.autoNext?(state.queue.length>1?'∞ שירים דומים · שירים שונים ואמנים מתחלפים':'∞ מחפש שירים דומים · לא יתווספו גרסאות של אותו שיר'):'∞ הפעלה אינסופית כבויה';};
