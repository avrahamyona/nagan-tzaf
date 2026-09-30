// Broad Arabic classics can grow; intentionally narrow piyut/moods stay unchanged.
// Track-level language allowlists. An Arabic-flavored Hebrew song is not Arabic.
const israeliArabicArtists=[
 {name:'עופר לוי',query:'עופר לוי שר ערבית',ch:'UCC9qyLIBFldP7rl-deg645Q',titles:['סלמת סלמת','לא תלעב בנר','סיבני אחבך'],releaseTitles:['שר ערבית']},
 {name:'יובל טייב',query:'יובל טייב אש עלינא',ch:'UCJ9MOj5CuA0gaehrxG5usMw',titles:['מחרוזת אש עלינא'],releaseTitles:['מחרוזת אש עלינא']},
 {name:'שרית חדד',query:'שרית חדד מה ביסמחלק',ch:'UC-q2Vo4BjYYKnyEfL6_D-Ow',titles:['מה ביסמחלק','סאקן'],releaseTitles:['בערבית']},
 {name:'A-WA',query:'A-WA Habib Galbi',ch:'UCdJT0kHVq4BuemsQInj8_ew',titles:['Habib Galbi'],releaseTitles:['Habib Galbi']},
 {name:'אמיל זריהן',query:'Emil Zrihan Habibi Dyali',ch:'UC_-DGpJTUKG_07a6rBbN_mQ',titles:['Habibi Dyali'],releaseTitles:[]}
];
const broadArabicArtists=[
 ...arabicDomainArtists.map((a,i)=>({...a,query:['Om Kolthoum','Mohamed Abdel Wahab','Farid Al Atrash','Abdel Halim Hafez'][i]})),
 {name:'ורדה',query:'Warda',ch:'UCx8ARN_phbuVxs2-hEiBxXQ'},
 {name:'פיירוז',query:'Fairuz',ch:'UCzixfFiEFMjhSB3R9UdUdsA'},
 ...israeliArabicArtists
];
function diverseArabicSongs(tracks){
 const groups=new Map;
 for(const t of tracks){if(!groups.has(t.ch))groups.set(t.ch,[]);groups.get(t.ch).push(t);}
 const order=[...israeliArabicArtists.map(a=>a.ch),...broadArabicArtists.filter(a=>!a.titles).map(a=>a.ch)];
 const out=[];
 while(order.some(ch=>groups.get(ch)?.length)){for(const ch of order){const list=groups.get(ch);if(list?.length)out.push(list.shift());}}
 return out;
}
const artistIdentityBeforeArabicPaging=songArtistIdentity;
songArtistIdentity=function(t){return broadArabicArtists.some(a=>a.ch===t.ch)?t.ch:artistIdentityBeforeArabicPaging(t);};
const arabicClassicSpec=categoryDomains[arabicCategoryNames[1]];
arabicClassicSpec.desc='קלאסיקות בערבית · גם אמנים יהודים-ישראלים ששרים בערבית';
function arabicCatalogBrowser(){
 const progressive=[];
 const cursors=broadArabicArtists.map(a=>({a,next:null,started:false,done:false}));let pool=[],busy=false;
 return async function(existing=[]){
  if(busy)return {tracks:[],done:false};busy=true;let successful=0;
  try{
   for(let round=0;round<7&&pool.length<30;round++){
    const results=await Promise.allSettled(cursors.filter(c=>!c.done).map(async c=>{
     const path=c.started?'/nextpage/search?q='+encodeURIComponent(c.a.query)+'&filter=music_songs&nextpage='+encodeURIComponent(c.next):'/search?q='+encodeURIComponent(c.a.query)+'&filter=music_songs';
     const j=await within(pipedFetch(path),15000);successful++;c.started=true;c.next=j.nextpage;c.done=!!c.a.titles||!c.next||c.next==='null';
     const ready=(j.items||[]).filter(x=>x.type==='stream').map(x=>({...mapStream(x),musicCatalog:true,_domainScope:arabicClassicSpec.name})).filter(t=>t.id&&t.ch===c.a.ch&&t.dur>=90&&(!c.a.titles||c.a.titles.includes(t.title))&&!/karaoke|remix|רמיקס|sped up|slowed|8d|nightcore/i.test(t.title));
     progressive.push(...ready);window.genreProgressHooks?.get(arabicClassicSpec.name)?.(uniqueSongList(progressive));return ready;
    }));
    let joined=uniqueSongList([...existing,...pool,...results.flatMap(r=>r.status==='fulfilled'?r.value:[])]);
    if(joined.some(t=>/^Cleopatra$/i.test(t.title)))joined=joined.filter(t=>!/^Cleopatra\s*\(Pt\s*\d+\)/i.test(t.title));
    const ids=new Set(existing.map(t=>t.id));pool=diverseArabicSongs(byKnownViews(joined.filter(t=>!ids.has(t.id))));
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
