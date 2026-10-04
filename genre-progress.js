// Render each verified section as soon as it arrives, and reuse complete genre results.
let progressiveGenre=null;
function showGenreProgress(){
 const p=progressiveGenre;if(!p||p.seq!==alSeq||!$('page-album').classList.contains('on'))return;
 const scroll=$('alTracks').parentElement.scrollTop;
 renderCompleteGenre(p.spec,p.data);
 const box=$('alTracks');box.querySelectorAll('.catalog-note').forEach(n=>{if(n.textContent.includes('המקור החזיר'))n.remove();});
 const sections=box.querySelectorAll('.asec');
 for(const [i,ready]of [p.data.artists.length,p.data.releases.length,p.data.tracks.length,p.data.tracks.length].entries())if(!ready&&sections[i]){sections[i].querySelector('.asec-body').textContent='טוען...';}
 $('alTracks').parentElement.scrollTop=scroll;
}
window.genreSectionProgress=function(spec,result){
 const p=progressiveGenre;if(!p||p.spec!==spec)return;
 if(result.artist&&!p.data.artists.some(a=>a.ch===result.artist.ch))p.data.artists.push(result.artist);
 if(result.releases)for(const a of result.releases)if(!p.data.releases.some(r=>r.plId===a.plId))p.data.releases.push(a);
 showGenreProgress();
};
const openBeforeProgress=openMusicDomain;
openMusicDomain=async function(spec){
 if(!genreSpecSet.has(spec))return openBeforeProgress(spec);
 const cached=genreDataByName.get(spec.name);const now=performance.now();
 if(cached?._completedAt&&now-cached._completedAt<600000){
  ++alSeq;alCur=null;alTracks=[];$('page-album').classList.add('genre-detail','release-list');$('alTitle').textContent=spec.name;$('alArtist').textContent=spec.desc;$('alMeta').textContent='שירים · אמנים · אלבומים ו-EP';$('alPlay').style.display='none';$('alShuffle').style.display='none';openPage('page-album');renderCompleteGenre(spec,cached);return;
 }
 const p={spec,seq:alSeq+1,data:{tracks:[],artists:[],releases:[]}};progressiveGenre=p;
 const work=openBeforeProgress(spec);
 // Wrap the already-installed song callback instead of replacing its generation guards.
 const before=window.genreProgressHooks.get(spec.name);
 window.genreProgressHooks.set(spec.name,tracks=>{if(progressiveGenre!==p||p.seq!==alSeq)return;p.data.tracks=uniqueSongList(tracks).slice(0,30).map(t=>({...t,_domainScope:spec.name}));showGenreProgress();});
 showGenreProgress();
 try{await work;const data=genreDataByName.get(spec.name);if(data)data._completedAt=performance.now();}finally{if(progressiveGenre===p)progressiveGenre=null;}
};
// v170: both Home mood shelves are song mixes, never a top-listening-artist search.
const legacyMoodSpecs=[{name:'שמחה',desc:'קצב ושירים שמחים',moodAlias:'מסיבה'},{name:'עצב',desc:'שירי געגוע ומזרחית עצובה',moodAlias:'מזרחי דיכאון'},{name:'ריכוז',desc:'שירים נעימים בלי סטים ובלי בלדות',moodAlias:'שקט של ערב'}];
const moodSongChoices={
 'מזרחי דיכאון':[['אבי ביטר','חבר ואח'],['זהבה בן','טיפת מזל'],['שריף','ממשיכה לבד'],['עופר לוי','יום הרווקים'],['זוהר ארגוב','בדד'],['אייל גולן','צליל מיתר']],
 'מזרחי שמח':[['משה פרץ','קרמלה'],['פאר טסי','מה נשאר לך'],['עומר אדם','שני משוגעים'],['ליאור נרקיס','שגעת'],['עדן חסון','איך שהיא רוקדת'],['איתי לוי','יש לי יום הולדת'],['אושר כהן','יום הולדת'],['עדן בן זקן','מסיבה']],
 'מזרחי טורקי':[['זהבה בן','טיפת מזל'],['עופר לוי','יום הרווקים'],['שריף','ממשיכה לבד'],['אבי ביטר','חבר ואח'],['זוהר ארגוב','הפרח בגני'],['חיים משה','לינדה']],
 'פופ שמח':[['סטטיק ובן אל','סלסולים'],['נועה קירל','פאוץ'],['עומר אדם','שני משוגעים'],['עדן חסון','איך שהיא רוקדת'],['אושר כהן','בדיוק ככה'],['אגם בוחבוט','אליטה'],['עדן בן זקן','מועבט'],['איתי לוי','הנה זה בא']],
 'אהבה':[['ישי לוי','ריקוד רומנטי'],['עומר אדם','שני משוגעים'],['משה פרץ','מאמי שלי'],['מור רביעי','תקרא לי מאמי'],['פאר טסי','מונה ליזה'],['אריק איינשטיין','אני ואתה']],
 'שקט של ערב':[['אריק איינשטיין','סע לאט'],['שלמה ארצי','תתארו לכם'],['חיים משה','לינדה'],['אביהו מדינה','לנר ולבשמים'],['ג\'ו עמר','יום זה לישראל'],['יובל טייב','שבת'],['משה לוק','יום השבת']],
 'געגוע':[['אריק איינשטיין','עוף גוזל'],['שלמה ארצי','האהבה הישנה'],['אייל גולן','צליל מיתר'],['חיים משה','אהבת חיי'],['עידן רייכל','ממעמקים'],['זוהר ארגוב','בדד'],['בועז שרעבי','לתת']],
 'מסיבה':[['סטטיק ובן אל','סלסולים'],['משה פרץ','קרמלה'],['פאר טסי','דרך השלום'],['עומר אדם','קאקדילה'],['עדן בן זקן','מסיבה'],['עדן חסון','שיכורים'],['ליאור נרקיס','ריחות של אלכוהול'],['איתי לוי','אפטר אמאל']],
 'נסיעה':[['אריק איינשטיין','סע לאט'],['פאר טסי','דרך השלום'],['סטטיק ובן אל','כביש החוף'],['משה פרץ','קרמלה'],['עומר אדם','שני משוגעים'],['פאר טסי','בוקר טוב'],['איתי לוי','הנה זה בא'],['שלמה ארצי','תתארו לכם']],
 'נוסטלגיה מזרחית':[['זוהר ארגוב','הפרח בגני'],['חיים משה','לינדה'],['זהבה בן','טיפת מזל'],['ישי לוי','ריקוד רומנטי'],['אביהו מדינה','לנר ולבשמים'],['ג\'ו עמר','יום זה לישראל']],
 'ארץ ישראל':[['אריק איינשטיין','אני ואתה'],['שלמה ארצי','תתארו לכם'],['כוורת','יו יה'],['יהורם גאון','שלום לך ארץ נהדרת'],['הגבעטרון','ים השיבולים'],['עוזי חיטמן','כאן'],['אילנית','בשנה הבאה'],['בועז שרעבי','הלוואי']]
};
const moodResults=new Map;
function homeMoodSpec(spec){return homeVibes.includes(spec)||legacyMoodSpecs.includes(spec);}
function moodBase(spec){return spec.moodAlias||spec.name;}
function moodSafeTrack(t,spec){const raw=t.title+' '+t.artist;return !!t.id&&!state.lessSuggestions?.[t.id]&&(!t.dur||t.dur>=100&&t.dur<=600)&&!/(נחמן|ברסלב|nachman|breslov|dj\s*set|די\s*ג[׳']?יי|סט\s+של|full album|האלבום המלא|קריוקי|karaoke|remix|רמיקס|mash\s*up|קאבר|cover)/i.test(raw)&&(!/ballad|בלדה|בלדות/i.test(raw)||/דיכאון|געגוע/.test(moodBase(spec)));}
function balanceMoodTracks(list,spec){
 const ids=new Set,titles=new Set,groups=new Map;
 for(const t of list){if(!moodSafeTrack(t,spec)||ids.has(t.id))continue;const name=t._moodArtist||t.artist,key=autoplayArtistKey(name),title=autoplayTitle({...t,artist:name});if(titles.has(title))continue;ids.add(t.id);titles.add(title);if(!groups.has(key))groups.set(key,[]);if(groups.get(key).length<2)groups.get(key).push({...t,_moodArtist:name,_domainScope:spec.name});}
 const out=[];for(let i=0;i<2;i++)for(const group of groups.values())if(group[i])out.push(group[i]);return out.slice(0,24);
}
async function loadMoodSongs(spec,onProgress=()=>{}){
 const base=moodBase(spec),cached=moodResults.get(base);if(cached&&Date.now()-cached.at<300000){const ready=balanceMoodTracks(cached.tracks,spec);onProgress(ready);return ready;}
 if(base==='שבת'){
  const tracks=balanceMoodTracks(balancedShabbatTracks().map(t=>({...t,_moodArtist:t.artist})),spec);moodResults.set(base,{at:Date.now(),tracks});onProgress(tracks);return tracks;
 }
 const choices=moodSongChoices[base]||spec.songs||[],found=[];
 // Known scoped catalog entries are candidates; no generic artist expansion.
 for(const [artist,title]of choices){const known=popMediterraneanTracks.find(t=>autoplayArtistMatch(artist,t.artist)&&normTxt(t.title).includes(normTxt(title)))||shabbatTracks.find(t=>autoplayArtistMatch(artist,t.artist)&&normTxt(t.title)===normTxt(title));if(known)found.push({...known,_moodArtist:artist});}
 let ready=balanceMoodTracks(found,spec);if(new Set(ready.map(t=>t._moodArtist)).size>=4)onProgress(ready);
 await Promise.allSettled(choices.map(async([artist,title])=>{
  if(found.some(t=>t._moodArtist===artist&&normTxt(t.title).includes(normTxt(title))))return;
  const items=await within(searchMusicCached(artist+' '+title),12000);
  const t=items.filter(t=>normTxt(t.title).includes(normTxt(title))&&normTxt(t.title+' '+t.artist).includes(normTxt(artist))&&moodSafeTrack(t,spec)).sort((a,b)=>Number(b.official||/רשמי|official|פונוקול/i.test(b.artist))-Number(a.official||/רשמי|official|פונוקול/i.test(a.artist)))[0];
  if(t){found.push({...t,_moodArtist:artist});ready=balanceMoodTracks(found,spec);if(new Set(ready.map(t=>t._moodArtist)).size>=4)onProgress(ready);}
 }));
 ready=balanceMoodTracks(found,spec);if(new Set(ready.map(t=>t._moodArtist)).size<2)return [];
 moodResults.set(base,{at:Date.now(),tracks:ready});onProgress(ready);return ready;
}
const vibeBeforeDiversity=buildHomeVibe;
buildHomeVibe=function(spec){return homeMoodSpec(spec)?loadMoodSongs(spec):vibeBeforeDiversity(spec);};
function renderMoodSongPage(spec,tracks,done){
 const box=$('alTracks');box.replaceChildren();const artists=[...new Set(tracks.map(t=>t._moodArtist))];$('alMeta').textContent=tracks.length+' שירים · '+artists.length+' אמנים';
 const start=document.createElement('button');start.className='domain-more';start.textContent='▶ נגן את המיקס';start.disabled=!tracks.length;start.onclick=()=>{state.shuffle=false;state.repeat='off';playQueue(tracks,0);};box.append(start);
 const note=document.createElement('p');note.className='catalog-note dim';note.textContent=tracks.length?'שירים באווירה הזאת · אמנים מתחלפים, בלי סטים של DJ':done?'אין כרגע מספיק אמנים מתאימים למיקס. נסה שוב.':'מחפש שירים מכמה אמנים...';box.append(note);
 tracks.forEach((t,i)=>box.append(trackRow({...t,artist:t._moodArtist},{artistLink:true,onPlay:()=>{state.shuffle=false;playQueue(tracks,i);}})));
 if(!done){const loading=document.createElement('p');loading.className='catalog-note dim';loading.textContent='עוד אמנים נטענים...';box.append(loading);}
 if(tracks[0])$('alArt').src=sqThumb(tracks[0].id);
}
const openBeforeMoodDiversity=openMusicDomain;
openMusicDomain=async function(spec){
 if(!homeMoodSpec(spec)){$('page-album').classList.remove('mood-song-page');return openBeforeMoodDiversity(spec);}
 const seq=++alSeq;alCur=null;alTracks=[];document.querySelectorAll('.genre-start').forEach(x=>x.remove());$('page-album').classList.remove('genre-detail','release-list','phone-genre','from-artist');$('alTitle').textContent=spec.name;$('alArtist').textContent=spec.desc;$('alArtist').classList.remove('link');$('alArt').src='';$('alPlay').style.display='none';$('alShuffle').style.display='none';$('page-album').classList.add('mood-song-page');openPage('page-album');renderMoodSongPage(spec,[],false);
 const tracks=await loadMoodSongs(spec,ready=>{if(seq===alSeq)renderMoodSongPage(spec,ready,false);});if(seq!==alSeq)return;alTracks=tracks;renderMoodSongPage(spec,tracks,true);window._lastMoodResult={name:spec.name,tracks};
};
function replaceLegacyMoodShelf(){
 const box=$('listenBody');for(const section of [...box.children])if(section.querySelector('.asec-title,.secttl,h2')?.textContent.includes('שירים לפי מצב רוח')&&section.id!=='diverseLegacyMoods')section.remove();
 if(box.querySelector('#diverseLegacyMoods'))return;const{sec,body}=sectionEl('שירים לפי מצב רוח','hscroll heroes');sec.id='diverseLegacyMoods';sec.classList.add('home-featured');for(const[i,spec]of legacyMoodSpecs.entries())body.append(heroCard({title:spec.name,kicker:'מיקס של כמה אמנים',desc:spec.desc,grad:GRADS[i],img:'',tap:()=>openMusicDomain(spec)}));box.append(sec);
}
const listenBeforeMoodDiversity=renderListen;renderListen=async function(){await listenBeforeMoodDiversity();replaceLegacyMoodShelf();};replaceLegacyMoodShelf();
const moodPageStyle=document.createElement('style');moodPageStyle.textContent='@media(max-width:819px){#page-album.mood-song-page.on{position:absolute;inset:0;width:auto;height:auto;transform:none;border-radius:0}#page-album.mood-song-page .albumhead{padding-top:72px}#page-album.mood-song-page .albumart{width:180px;height:180px}#page-album.mood-song-page .ascroll{inset:0;padding-bottom:160px}}';document.head.append(moodPageStyle);
const albumBeforeMoodPage=openAlbum;openAlbum=function(...args){$('page-album').classList.remove('mood-song-page');return albumBeforeMoodPage(...args);};
// v171: unlimited artist contributions, round-robin batches of 30.
const moodPageQueries={
 'מזרחי דיכאון':['מזרחי דיכאון שירים','שירים מזרחיים עצובים','מזרחית כבדה'],
 'מזרחי שמח':['מזרחי שמח להיטים','שירים מזרחיים קצביים','מזרחית לריקודים'],
 'מזרחי טורקי':['מזרחי טורקי שירים','ערבסק מזרחי','שירים מזרחיים טורקיים'],
 'פופ שמח':['פופ ישראלי שמח','להיטי פופ ישראלי קצביים','פופ ישראלי לריקודים'],
 'אהבה':['שירי אהבה ישראלים קצביים','אהבה מזרחית קצבית','שירים רומנטיים קצביים'],
 'שקט של ערב':['שירים ישראלים נעימים לערב','שירים שקטים ישראלים בלי בלדות','שירים נעימים ישראלים'],
 'געגוע':['שירי געגוע ישראלים','שירים מזרחיים געגועים','שירים ישראלים נוסטלגיה געגוע'],
 'מסיבה':['להיטים ישראלים למסיבה','מזרחית לריקודים','פופ ישראלי מסיבה'],
 'נסיעה':['שירים ישראלים לנסיעה','להיטים ישראלים לדרך','מזרחית קצבית לנסיעה'],
 'שבת':['שירי שבת','זמירות שבת','פיוטי שבת'],
 'נוסטלגיה מזרחית':['קלאסיקות מזרחיות','להיטים מזרחיים נוסטלגיה','מזרחית ישנה שירים'],
 'ארץ ישראל':['שירי ארץ ישראל','קלאסיקות זמר עברי','שירים ישראלים נוסטלגיה']
};
const moodPaging=new Map;
function balanceMoodTracks(list,spec){
 const ids=new Set,titles=new Set,groups=new Map;
 for(const t of list){if(!moodSafeTrack(t,spec)||ids.has(t.id))continue;const name=t._moodArtist||t.artist,key=autoplayArtistKey(name),title=autoplayTitle({...t,artist:name});if(titles.has(title))continue;ids.add(t.id);titles.add(title);if(!groups.has(key))groups.set(key,[]);groups.get(key).push({...t,_moodArtist:name,_domainScope:spec.name});}
 const out=[];for(let i=0;i<Math.max(0,...[...groups.values()].map(g=>g.length));i++)for(const group of groups.values())if(group[i])out.push(group[i]);return out;
}
function moodArtistName(t,spec){
 const names=[...(moodSongChoices[moodBase(spec)]||[]).map(x=>x[0]),...popMediterraneanArtists.map(a=>a.name),...shabbatArtists.map(a=>a.name),'אייל גולן','זהבה בן','שריף','אבי ביטר','זוהר ארגוב','חיים משה','ישי לוי','שלמה ארצי','אריק איינשטיין','עידן רייכל','בועז שרעבי','כוורת','יהורם גאון','הגבעטרון','אילנית','עוזי חיטמן','סטטיק ובן אל','נועה קירל'];
 return names.find(n=>normTxt(t.title+' '+t.artist).includes(normTxt(n))||autoplayArtistMatch(n,t.artist))||null;
}
function moodSearchEligible(t,spec){
 if(!moodSafeTrack(t,spec)||setSignals(t)>=2)return false;
 const raw=t.title+' '+t.artist;if(/מחרוזת|medley|mix\b|אוסף|מיטב|שעה|hour|playlist|פלייליסט|רצף|כל השירים/i.test(raw)&&moodBase(spec)!=='שבת')return false;
 // Explicit sad moods are the only mood pages that accept ballad-tagged results.
 if(!/דיכאון|געגוע/.test(moodBase(spec))&&/צליל מיתר|בדד|ממעמקים|עוף גוזל|לתת|עטור מצחך|האהבה הישנה|הלוואי/.test(t.title))return false;
 const name=moodArtistName(t,spec);const allowed=moodBase(spec)==='שבת'?shabbatArtists.map(a=>a.name):(moodSongChoices[moodBase(spec)]||[]).map(x=>x[0]);if(!name||!allowed.includes(name))return false;
 if(moodBase(spec)==='שבת'&&!/שבת|shabbat|shabbos|הבדלה|לנר ולבשמים|לכה דודי|שלום עליכם|צור משלו|יום זה לישראל|יה ריבון/.test(t.title))return false;
 return true;
}
function newMoodCursor(spec){
 const broad=moodPageQueries[moodBase(spec)]||[];const artists=moodBase(spec)==='שבת'?shabbatArtists.map(a=>a.name):[...new Set((moodSongChoices[moodBase(spec)]||[]).map(x=>x[0]))];const queries=[...broad,...artists.map(name=>name+' '+(broad[0]||spec.name)),...(moodBase(spec)==='שבת'?artists.flatMap(name=>[name+' לכה דודי',name+' שלום עליכם',name+' כי אשמרה שבת',name+' יה ריבון']):[])];
 return {spec,tracks:[],pool:[],seen:new Set,cursors:queries.map(q=>({q,next:null,started:false,done:false})),busy:false,done:false};
}
async function nextMoodPage(cursor){
 if(cursor.busy)return [];cursor.busy=true;let successes=0;
 try{
  for(let round=0;round<6&&cursor.pool.length<30;round++){
   const active=cursor.cursors.filter(c=>!c.done);if(!active.length)break;
   const results=await Promise.allSettled(active.map(async c=>{
    const path=c.started?'/nextpage/search?q='+encodeURIComponent(c.q)+'&filter=music_songs&nextpage='+encodeURIComponent(c.next):'/search?q='+encodeURIComponent(c.q)+'&filter=music_songs';
    const j=await within(pipedFetch(path,6000),12000);successes++;c.started=true;c.next=j.nextpage;c.done=!c.next||c.next==='null';
    return (j.items||[]).filter(x=>x.type==='stream').map(mapStream).filter(t=>moodSearchEligible(t,cursor.spec)).map(t=>({...t,_moodArtist:moodArtistName(t,cursor.spec)}));
   }));
   for(const r of results)if(r.status==='fulfilled')cursor.pool.push(...r.value);
   cursor.pool=balanceMoodTracks(cursor.pool,cursor.spec).filter(t=>!cursor.seen.has(autoplayTitle({...t,artist:t._moodArtist})));
  }
  // Avoid publishing a one-artist batch even if that is all a source returned.
  const balanced=balanceMoodTracks(cursor.pool,cursor.spec);if(new Set(balanced.map(t=>t._moodArtist)).size<2){if(!successes&&!cursor.pool.length)throw Error('mood search unavailable');cursor.done=cursor.cursors.every(c=>c.done);return [];}
  const page=balanced.slice(0,30);const taken=new Set(page.map(t=>t.id));cursor.pool=balanced.filter(t=>!taken.has(t.id));page.forEach(t=>cursor.seen.add(autoplayTitle({...t,artist:t._moodArtist})));cursor.tracks.push(...page);cursor.done=!cursor.pool.length&&cursor.cursors.every(c=>c.done);return page;
 }finally{cursor.busy=false;}
}
async function startPagedMood(spec){
 const base=moodBase(spec);let cursor=moodPaging.get(base);
 if(!cursor){cursor=newMoodCursor(spec);moodPaging.set(base,cursor);
  const starters=await loadMoodSongs(spec);cursor.pool=balanceMoodTracks(starters,spec);
  // Shabbat starts from the complete catalog, no per-artist truncation.
  if(base==='שבת')cursor.pool=balanceMoodTracks(balancedShabbatTracks().map(t=>({...t,_moodArtist:t.artist})),spec);
 }
 if(!cursor.tracks.length)await nextMoodPage(cursor);return cursor;
}
function renderPagedMood(spec,cursor){
 const tracks=cursor.tracks.map(t=>({...t,_domainScope:spec.name}));renderMoodSongPage(spec,tracks,true);$('alMeta').textContent=tracks.length+' שירים · '+new Set(tracks.map(t=>t._moodArtist)).size+' אמנים';
 const button=document.createElement('button');button.className='domain-more mood-load-more';button.textContent=cursor.done?'כל השירים המתאימים מהמקור נטענו':'טען עוד 30 שירים';button.disabled=cursor.done||cursor.busy;
 const seq=alSeq;
 async function more(){if(cursor.done||cursor.busy||seq!==alSeq)return;button.disabled=true;button.textContent='טוען עוד שירים...';try{const page=await nextMoodPage(cursor);if(seq!==alSeq)return;const scroller=$('page-album').querySelector('.ascroll'),at=scroller.scrollTop;renderPagedMood(spec,cursor);scroller.scrollTop=at;if(page.length<30&&!cursor.done)toast('אין כרגע מספיק שירים מתאימים נוספים. אפשר לנסות שוב.');}catch{button.disabled=false;button.textContent='הטעינה לא זמינה · נסה שוב';}}
 button.onclick=more;$('alTracks').append(button);
 // One automatic page per arrival at the bottom. No infinite retry loop.
 if(cursor.observer)cursor.observer.disconnect();const root=$('page-album').querySelector('.ascroll');let scrolled=false;root.onscroll=()=>{scrolled=true;if(root.scrollTop+root.clientHeight>=root.scrollHeight-120)more();};cursor.observer=new IntersectionObserver(entries=>{if(scrolled&&entries.some(e=>e.isIntersecting)){scrolled=false;more();}},{root:$('page-album').querySelector('.ascroll'),rootMargin:'80px'});cursor.observer.observe(button);
 window._lastMoodResult={name:spec.name,tracks};window._activeMoodCursor=cursor;
}
const openBeforeMoodPaging=openMusicDomain;
openMusicDomain=async function(spec){
 if(!homeMoodSpec(spec))return openBeforeMoodPaging(spec);
 for(const c of moodPaging.values())c.observer?.disconnect();
 const seq=++alSeq;alCur=null;alTracks=[];$('page-album').classList.remove('genre-detail','release-list','phone-genre','from-artist');$('page-album').classList.add('mood-song-page');$('alTitle').textContent=spec.name;$('alArtist').textContent=spec.desc;$('alArt').src='';$('alPlay').style.display='none';$('alShuffle').style.display='none';openPage('page-album');renderMoodSongPage(spec,[],false);
 try{const cursor=await startPagedMood(spec);if(seq!==alSeq)return;alTracks=cursor.tracks;renderPagedMood(spec,cursor);}catch{if(seq===alSeq)renderMoodSongPage(spec,[],true);}
};
const advanceBeforeMoodPaging=advance;
advance=async function(direction,automatic){
 const cur=current(),cursor=cur?._domainScope?[...moodPaging.values()].find(c=>c.spec.name===cur._domainScope||moodBase(c.spec)===moodBase([...homeVibes,...legacyMoodSpecs].find(s=>s.name===cur._domainScope)||{})):null;
 if(direction>0&&cursor&&state.qi>=state.queue.length-3&&!cursor.done&&!cursor.busy){const loading=nextMoodPage(cursor);if(state.qi<state.queue.length-1){loading.then(page=>{if(!state.queue.some(t=>t._domainScope===cur._domainScope))return;const ids=new Set(state.queue.map(t=>t.id));state.queue.push(...page.filter(t=>!ids.has(t.id)).map(t=>({...t,_domainScope:cur._domainScope})));save();});return advanceBeforeMoodPaging(direction,automatic);}const page=await loading;if(current()!==cur)return;if(page.length){const ids=new Set(state.queue.map(t=>t.id));state.queue.push(...page.filter(t=>!ids.has(t.id)).map(t=>({...t,_domainScope:cur._domainScope})));save();}}
 return advanceBeforeMoodPaging(direction,automatic);
};
