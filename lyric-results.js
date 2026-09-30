// Verified local lyric index: provider coverage remains separate from result design.
const originalFetchLyrics=fetchLyrics,originalSearchLyrics=searchLyrics;
const lyricIndex=new Map();
try{for(const x of JSON.parse(localStorage.getItem('nagan_lyric_index')||'[]'))if(x.title&&x.artist&&x.text)lyricIndex.set(lyricKey(x.artist)+'|'+lyricKey(x.title),x);}catch{}
fetchLyrics=async function(t,force=false){
 const j=await originalFetchLyrics(t,force);
 if(j&&lyricMatch(j,t)){
 const text=j.plainLyrics||parseLRC(j.syncedLyrics||'').map(x=>x.text).join('\n');
 if(text){lyricIndex.set(lyricKey(t.artist)+'|'+lyricKey(t.title),{title:lyricQueryTitle(t.title),artist:lyricQueryTitle(t.artist),id:t.id,text});
 try{localStorage.setItem('nagan_lyric_index',JSON.stringify([...lyricIndex.values()].slice(-100)));}catch{}}
 }return j;
};
searchLyrics=async function(q){
 const local=[];
 for(const x of lyricIndex.values()){
 const hit=x.text.split('\n').map(line=>({line,score:lyricLineScore(line,q)})).sort((a,b)=>b.score-a.score)[0];
 if(hit?.score)local.push({title:x.title,artist:x.artist,id:x.id,line:hit.line,score:hit.score});
 }
 // A known lyric-word match must not wait for the remote candidate chain.
 if(local.length)return local.sort((a,b)=>b.score-a.score).slice(0,5);
 return originalSearchLyrics(q);
};
function renderLyricSnippet(el,line,q){
 const words=String(line||'').split(/\s+/),queries=normTxt(q).split(' ').filter(Boolean);
 const match=w=>queries.some(x=>normTxt(w).includes(x));let first=-1,last=-1;
 words.forEach((w,i)=>{if(match(w)){if(first<0)first=i;last=i;}});
 el.replaceChildren();el.append(document.createTextNode('"'));
 const start=first<0?0:Math.max(0,first-2),end=first<0?Math.min(words.length,12):Math.min(words.length,last+4);
 if(start)el.append(document.createTextNode('... '));
 words.slice(start,end).forEach((w,i)=>{if(i)el.append(document.createTextNode(' '));if(match(w)){const b=document.createElement('b');b.textContent=w;el.append(b);}else el.append(document.createTextNode(w));});
 if(end<words.length)el.append(document.createTextNode(' ...'));el.append(document.createTextNode('"'));
}
async function lyricResultTrack(title,artist){
 const key=lyricKey(title),ak=lyricKey(artist);
 const known=[...(state.history||[]),...(state.queue||[])].find(t=>lyricKey(t.title)===key&&lyricKey(t.artist)===ak);
 if(known)return known;
 try{return (await searchMusicCached(artist+' '+title)).find(t=>lyricKey(t.title)===key&&lyricKey(t.artist)===ak)||null;}catch{return null;}
}
function decorateLyricResults(){
 document.querySelectorAll('#resBody h2.js-lyr').forEach(h=>{if(h.textContent!=='תוצאות מובילות')h.textContent='תוצאות מובילות';});
 for(const row of document.querySelectorAll('#resBody .lyrrow:not([data-lyric-design])')){
 row.dataset.lyricDesign='1';const title=row.querySelector('.t')?.textContent,artist=row.querySelector('.a')?.textContent;
 if(!title||!artist)continue;
 const note=row.querySelector('.lyrnote');if(note){note.replaceChildren();const img=document.createElement('img');img.alt='';img.src='./icon-192.png';note.append(img);}
 const subtitle=row.querySelector('.a');subtitle.textContent='שיר · '+artist;
 let track=null;lyricResultTrack(title,artist).then(t=>{track=t;if(t&&note)note.querySelector('img').src=sqThumb(t.id);});
 row.addEventListener('click',async e=>{e.stopImmediatePropagation();const t=track||await lyricResultTrack(title,artist);if(t)playQueue([t],0);else toast('לא נמצאה התאמת שיר מאומתת');},true);
 }
}
new MutationObserver(decorateLyricResults).observe($('resBody'),{childList:true,subtree:true});
const lyricResultStyle=document.createElement('style');lyricResultStyle.textContent=`
.lyrrow{padding:14px 0;gap:12px;align-items:center;border-bottom:1px solid var(--border);width:100%;text-align:right}.lyrrow .lyrnote{width:58px;height:58px;flex:0 0 58px;background:none}.lyrrow .lyrnote img{width:58px;height:58px;object-fit:cover;border-radius:5px}.lyrrow .t{font-size:17px;font-weight:500}.lyrrow .a{font-size:14px}.lyrrow .lyrsnip{font-size:14px;font-style:normal;line-height:1.5;margin-top:3px;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.lyrrow .lyrsnip b{color:var(--text);font-weight:700}@media(min-width:820px){.lyrrow .lyrnote,.lyrrow .lyrnote img{width:64px;height:64px}.lyrrow .lyrnote{flex-basis:64px}.lyrrow .lyrsnip{font-size:15px}}
`;document.head.appendChild(lyricResultStyle);
