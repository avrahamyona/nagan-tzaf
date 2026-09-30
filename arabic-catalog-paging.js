// Broad Arabic classics can grow; intentionally narrow piyut/moods stay unchanged.
const broadArabicArtists=[
 ...arabicDomainArtists.map((a,i)=>({...a,query:['Om Kolthoum','Mohamed Abdel Wahab','Farid Al Atrash','Abdel Halim Hafez'][i]})),
 {name:'ורדה',query:'Warda',ch:'UCx8ARN_phbuVxs2-hEiBxXQ'},
 {name:'פיירוז',query:'Fairuz',ch:'UCzixfFiEFMjhSB3R9UdUdsA'}
];
const artistIdentityBeforeArabicPaging=songArtistIdentity;
songArtistIdentity=function(t){return broadArabicArtists.some(a=>a.ch===t.ch)?t.ch:artistIdentityBeforeArabicPaging(t);};
const arabicClassicSpec=categoryDomains[arabicCategoryNames[1]];
function arabicCatalogBrowser(){
 const progressive=[];
 const cursors=broadArabicArtists.map(a=>({a,next:null,started:false,done:false}));let pool=[],busy=false;
 return async function(existing=[]){
  if(busy)return {tracks:[],done:false};busy=true;let successful=0;
  try{
   for(let round=0;round<7&&pool.length<30;round++){
    const results=await Promise.allSettled(cursors.filter(c=>!c.done).map(async c=>{
     const path=c.started?'/nextpage/search?q='+encodeURIComponent(c.a.query)+'&filter=music_songs&nextpage='+encodeURIComponent(c.next):'/search?q='+encodeURIComponent(c.a.query)+'&filter=music_songs';
     const j=await within(pipedFetch(path),15000);successful++;c.started=true;c.next=j.nextpage;c.done=!c.next||c.next==='null';
     const ready=(j.items||[]).filter(x=>x.type==='stream').map(x=>({...mapStream(x),musicCatalog:true,_domainScope:arabicClassicSpec.name})).filter(t=>t.id&&t.ch===c.a.ch&&t.dur>=90&&!/karaoke|remix|רמיקס|sped up|slowed|8d|nightcore/i.test(t.title));
     progressive.push(...ready);window.genreProgressHooks?.get(arabicClassicSpec.name)?.(uniqueSongList(progressive));return ready;
    }));
    let joined=uniqueSongList([...existing,...pool,...results.flatMap(r=>r.status==='fulfilled'?r.value:[])]);
    if(joined.some(t=>/^Cleopatra$/i.test(t.title)))joined=joined.filter(t=>!/^Cleopatra\s*\(Pt\s*\d+\)/i.test(t.title));
    const ids=new Set(existing.map(t=>t.id));pool=byKnownViews(joined.filter(t=>!ids.has(t.id)));
    if(cursors.every(c=>c.done))break;
   }
   if(!successful&&!pool.length)throw new Error('Arabic catalog unavailable');
   return {tracks:pool.splice(0,30),done:!pool.length&&cursors.every(c=>c.done)};
  }finally{busy=false;}
 };
}
const buildBeforeArabicPaging=buildMusicDomain;
buildMusicDomain=async function(spec){
 if(spec!==arabicClassicSpec)return buildBeforeArabicPaging(spec);
 const next=arabicCatalogBrowser();const first=await next([]);
 const data=await buildBeforeArabicPaging({...spec,artists:broadArabicArtists,loadTracks:async()=>first.tracks});
 data._arabicNext=next;data._arabicDone=first.done;return data;
};
const appendBeforeArabicPaging=appendDomainSongList;
appendDomainSongList=function(box,spec,data){
 appendBeforeArabicPaging(box,spec,data);
 if(spec!==arabicClassicSpec||!data._arabicNext)return;
 const button=document.createElement('button');button.className='domain-more';button.textContent=data._arabicDone?'כל השירים הזמינים נטענו':'טען עוד 30 שירים';button.disabled=data._arabicDone;box.appendChild(button);
 button.addEventListener('click',async()=>{
  button.disabled=true;button.textContent='טוען שירים...';
  try{const batch=await data._arabicNext(data.tracks);if(!button.isConnected)return;data.tracks=byKnownViews([...data.tracks,...batch.tracks]);data._arabicDone=batch.done;
   const oldStart=document.querySelector('.genre-start');oldStart?.remove();box.replaceChildren();appendDomainSongList(box,spec,data);
  }catch{button.disabled=false;button.textContent='הטעינה לא זמינה · נסה שוב';}
 });
};
