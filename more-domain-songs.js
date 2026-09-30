// View counts come from the provider, never search position or upload date.
const streamWithoutViews=mapStream;
mapStream=function(item){const track=streamWithoutViews(item);if(Number.isFinite(item.views)&&item.views>=0)track.views=item.views;return track;};
function byKnownViews(tracks){return [...tracks].sort((a,b)=>(Number.isFinite(b.views)?b.views:-1)-(Number.isFinite(a.views)?a.views:-1));}
async function countDomainViews(tracks){
 const rows=await Promise.allSettled(tracks.map(async t=>{if(Number.isFinite(t.views))return t;try{const j=await within(pipedFetch('/streams/'+t.id),12000);return Number.isFinite(j.views)&&j.views>=0?{...t,views:j.views}:t;}catch{return t;}}));
 return byKnownViews(rows.map((r,i)=>r.status==='fulfilled'?r.value:tracks[i]));
}
function domainSongBrowser(spec,data){
 const cursors=data.artists.map(a=>({a,q:a.name,next:null,started:false,done:false}));let pool=[],busy=false;
 return async function(){
  if(busy)return {tracks:[],done:false};busy=true;let success=0;
  try{for(let round=0;round<3&&pool.length<30;round++){
   const rows=await Promise.allSettled(cursors.filter(c=>!c.done).map(async c=>{
    const path=c.started?'/nextpage/search?q='+encodeURIComponent(c.q)+'&filter=videos&nextpage='+encodeURIComponent(c.next):'/search?q='+encodeURIComponent(c.q)+'&filter=videos';
    const j=await within(pipedFetch(path),15000);success++;c.started=true;c.next=j.nextpage;c.done=!c.next||c.next==='null';
    return (j.items||[]).filter(x=>x.type==='stream'&&x.url).map(mapStream).filter(t=>artistMatchesTaste(t,[c.a])&&t.dur>=90&&t.dur<=600&&setSignals(t)<1&&(!spec.live||/live|הופעה|קיסריה|בהופעה/i.test(t.title)));
   }));
   const seen=new Set([...data.tracks,...pool].map(t=>t.id));for(const r of rows)if(r.status==='fulfilled')for(const t of r.value)if(!seen.has(t.id)){pool.push(t);seen.add(t.id);}
   pool=byKnownViews(pool);if(cursors.every(c=>c.done))break;
  }
  if(!success&&!pool.length&&!cursors.every(c=>c.done))throw new Error('song source unavailable');
  const tracks=pool.splice(0,30);return {tracks,done:!pool.length&&cursors.every(c=>c.done)};
  }finally{busy=false;}
 };
}
function appendDomainSongList(box,spec,data){
 const{sec,body,heading}=sectionEl('שירים בתחום');heading.disabled=false;heading.addEventListener('click',()=>sectionTracks(spec.name,data.tracks));
 const render=()=>{body.replaceChildren();data.tracks.forEach((t,i)=>{const row=trackRow(t,{artistLink:true,onPlay:()=>playQueue(data.tracks,i)});if(Number.isFinite(t.views)){const count=document.createElement('small');count.className='domain-view-count dim';count.textContent=t.views.toLocaleString('he-IL')+' צפיות';row.querySelector('.meta')?.appendChild(count);}body.appendChild(row);});};render();box.appendChild(sec);
 const note=document.createElement('p');note.className='catalog-note dim';note.textContent='השירים שנטענו ממוינים לפי צפיות ביוטיוב, מהגבוה לנמוך. ללא נתון צפיות: בסוף.';sec.appendChild(note);
 countDomainViews(data.tracks).then(tracks=>{if(!sec.isConnected)return;const counts=new Map(tracks.map(t=>[t.id,t]));data.tracks=byKnownViews(data.tracks.map(t=>counts.get(t.id)||t));render();});
 if(spec.expand){const next=domainSongBrowser(spec,data);const button=document.createElement('button');button.className='domain-more';button.textContent='טען עוד 30 שירים';sec.appendChild(button);button.addEventListener('click',async()=>{button.disabled=true;button.textContent='טוען שירים...';try{const batch=await next();if(!sec.isConnected)return;data.tracks=byKnownViews([...data.tracks,...batch.tracks]);render();button.textContent=batch.done?'כל השירים הזמינים נטענו':'טען עוד 30 שירים';button.disabled=batch.done;if(!batch.tracks.length&&!batch.done)button.textContent='לא נמצאו שירים נוספים כרגע · נסה שוב';}catch{button.textContent='הטעינה לא זמינה · נסה שוב';button.disabled=false;}});}
}
const domainMoreStyle=document.createElement('style');domainMoreStyle.textContent='.domain-more{display:block;margin:20px auto;padding:12px 24px;border-radius:12px;background:var(--card);color:var(--accent);font:inherit;font-weight:600}.domain-more:disabled{color:var(--dim)}.domain-view-count{display:block;font-size:11px;margin-top:3px}';document.head.appendChild(domainMoreStyle);
