// Genre song browsers keep the same cursor in the category page and drilldown.
const genreSpecSet=new Set(Object.values(categoryDomains));
function genreCatalogCursor(spec,artists){
 if(spec===arabicClassicSpec)return arabicCatalogBrowser();
 const isPiyyut=spec===categoryDomains[arabicCategoryNames[0]];
 const progressive=[];
 const cursors=artists.map(a=>({a,q:a.name,next:null,started:false,done:false}));let pool=[],busy=false;
 return async function(existing=[]){
  if(busy)return {tracks:[],done:false};busy=true;let success=0;
  try{
   for(let round=0;round<20&&pool.length<30;round++){
    const results=await Promise.allSettled(cursors.filter(c=>!c.done).map(async c=>{
     const path=c.started?'/nextpage/search?q='+encodeURIComponent(c.q)+'&filter=music_songs&nextpage='+encodeURIComponent(c.next):'/search?q='+encodeURIComponent(c.q)+'&filter=music_songs';
     const j=await within(pipedFetch(path),15000);success++;c.started=true;c.next=j.nextpage;c.done=!c.next||c.next==='null';
     const ready=(j.items||[]).filter(x=>x.type==='stream').map(x=>({...mapStream(x),musicCatalog:true,_domainScope:spec.name})).filter(t=>t.id&&t.ch===c.a.ch&&t.dur>=90&&setSignals(t)<2&&(!spec.live||/live|הופעה|בהופעה|קיסריה/i.test(t.title))&&(!isPiyyut||!/(מאוהב בגשם|לא מוותר|חפלה)/.test(t.title))&&(!isPiyyut||/פיוט|סליחות|אל גליל|אל בעניי|אל בעוני|אלי חסרה|לך אלי|אלי בזמן|אלי שוב|אלי תשוקתי|נא אלי|מול אלי|הבדלה|פאר נעטר|שבת|מקא[םמ]|Piyut|Selichot|עמל חיינו|אדון|אליהו|אלוהים|אלהים|אלוהי|אלוקי|יהי|ירושלים|ציון|יגדל|שמע|חביבי|אוחיל|ידיד|דרור|אל נא|יוצר|אהלל/i.test(t.title)));
     progressive.push(...ready);window.genreProgressHooks?.get(spec.name)?.(uniqueSongList([...existing,...progressive]));return ready;
    }));
    const merged=uniqueSongList([...existing,...pool,...results.flatMap(r=>r.status==='fulfilled'?r.value:[])]),ids=new Set(existing.map(t=>t.id));pool=byKnownViews(merged.filter(t=>!ids.has(t.id)));
    if(cursors.every(c=>c.done))break;
   }
   if(!success&&!pool.length&&!cursors.every(c=>c.done))throw new Error('Genre unavailable');
   return {tracks:pool.splice(0,30),done:!pool.length&&cursors.every(c=>c.done)};
  }finally{busy=false;}
 };
}
const buildBeforeGenrePanels=buildMusicDomain;
buildMusicDomain=async function(spec){
 const data=await buildBeforeGenrePanels(spec);if(!genreSpecSet.has(spec))return data;
 if(spec===categoryDomains[arabicCategoryNames[0]])data.tracks=[];
 const next=data._arabicNext||genreCatalogCursor(spec,data.artists);data._genreNext=next;data._genreDone=data._arabicDone||false;
 if(spec.recent){
  // Source-dated releases only: expand inside their tracks, never generic artist hits.
  const results=await Promise.allSettled(data.artists.map(async a=>{const cat=await catalogForTaste(a);const albums=cat.filter(r=>Number(r.releaseYear)>=new Date().getFullYear()-1);const rows=await Promise.allSettled(albums.slice(0,8).map(loadAlbumTracks));return rows.flatMap(r=>r.status==='fulfilled'?r.value.tracks:[]);}));
  const pool=byKnownViews(uniqueSongList([...data.tracks,...results.flatMap(r=>r.status==='fulfilled'?r.value:[])])).map(t=>({...t,_domainScope:spec.name}));
  data.tracks=pool.splice(0,30);data._genreNext=async()=>({tracks:pool.splice(0,30),done:pool.length===0});data._genreDone=pool.length===0;
 }else if(data.tracks.length<30){const batch=await next(data.tracks);data.tracks=byKnownViews(uniqueSongList([...data.tracks,...batch.tracks])).slice(0,30);data._genreDone=batch.done;}
 return data;
};
const genreDataByName=new Map;
const appendBeforeGenrePanels=appendDomainSongList;
function genreMoreButton(data,rerender){
 const button=document.createElement('button');button.className='domain-more genre-panel-more';button.textContent=data._genreDone?'כל השירים הזמינים בתחום נטענו':'טען עוד 30 שירים';button.disabled=data._genreDone;
 button.addEventListener('click',async()=>{button.disabled=true;button.textContent='טוען שירים...';try{const batch=await data._genreNext(data.tracks);data.tracks=byKnownViews(uniqueSongList([...data.tracks,...batch.tracks]));data._genreDone=batch.done;rerender();}catch{button.disabled=false;button.textContent='הטעינה לא זמינה · נסה שוב';}});return button;
}
appendDomainSongList=function(box,spec,data){
 if(!genreSpecSet.has(spec))return appendBeforeGenrePanels(box,spec,data);
 genreDataByName.set(spec.name,data);
 const wasExpand=spec.expand;spec.expand=false;
 // Temporarily bypass the old Arabic-only button; one shared cursor owns paging.
 const next=data._arabicNext;data._arabicNext=null;appendBeforeGenrePanels(box,spec,data);data._arabicNext=next;spec.expand=wasExpand;
 const heading=[...box.querySelectorAll('.secttl')].find(x=>x.textContent.includes('שירים בתחום'));
 if(heading){const replacement=heading.cloneNode(true);heading.replaceWith(replacement);replacement.addEventListener('click',()=>sectionTracks(spec.name,data.tracks));}
 box.appendChild(genreMoreButton(data,()=>{document.querySelector('.genre-start')?.remove();box.replaceChildren();appendDomainSongList(box,spec,data);}));
 if(data.tracks.length<30){const note=document.createElement('p');note.className='catalog-note dim';note.textContent='המקור החזיר כרגע '+data.tracks.length+' שירים מתאימים. לא נוסיף שירים מז׳אנר אחר כדי להשלים.';box.appendChild(note);}
};
const sectionBeforeGenrePanels=sectionTracks;
sectionTracks=function(title,tracks){
 sectionBeforeGenrePanels(title,tracks);const data=genreDataByName.get(title);if(!data)return;
 openPlTracks=()=>data.tracks;
 const render=()=>{renderPlTracks();$('plTracks').querySelectorAll('.genre-panel-more').forEach(x=>x.remove());$('plTracks').appendChild(genreMoreButton(data,render));};render();
};
