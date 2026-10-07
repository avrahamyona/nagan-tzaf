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
 if(!/דיכאון|געגוע/.test(moodBase(spec))&&/צליל מיתר|בדד|ממעמקים|עוף גוזל|לתת|עטור מצחך|האהבה הישנה|הלוואי|שירי דיכאון|בעצבות|חורף בחלון|ברגעים שאת הולכת|כבר לא|דמעות|כאב|בוכה|נשבר|פרידה|בלעדיך|בלעדייך/.test(t.title))return false;
 const name=moodArtistName(t,spec);const allowed=moodBase(spec)==='שבת'?shabbatArtists.map(a=>a.name):(moodSongChoices[moodBase(spec)]||[]).map(x=>x[0]);if(!name||!allowed.includes(name))return false;
 if(moodBase(spec)==='שבת'&&!/שבת|shabbat|shabbos|הבדלה|לנר ולבשמים|לכה דודי|שלום עליכם|צור משלו|יום זה לישראל|יה ריבון|דרור יקרא|מזמור שיר ליום/.test(t.title))return false;
 return true;
}
function newMoodCursor(spec){
 const broad=moodPageQueries[moodBase(spec)]||[];const artists=moodBase(spec)==='שבת'?shabbatArtists.map(a=>a.name):[...new Set((moodSongChoices[moodBase(spec)]||[]).map(x=>x[0]))];const queries=[...broad,...artists.map(name=>name+' '+(broad[0]||spec.name)),...(moodBase(spec)==='שבת'?artists.flatMap(name=>[name+' לכה דודי',name+' שלום עליכם',name+' כי אשמרה שבת',name+' יה ריבון',name+' צור משלו',name+' יום זה לישראל',name+' דרור יקרא',name+' מזמור שיר ליום השבת']):[])];
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
// v172: original mood illustrations, no clip thumbnails on mood surfaces.
const addedMoodActivities=[
 ['בוקר טוב','להתחיל את היום בחיוך','פופ שמח','sun',['שירים ישראלים לבוקר','להיטים ישראלים בוקר טוב']],
 ['קפה של בוקר','קצב נעים לקפה הראשון','שקט של ערב','cup',['שירים ישראלים לקפה','מוזיקה ישראלית נעימה לבוקר']],
 ['אימון','אנרגיה לתנועה','מזרחי שמח','bolt',['שירים מזרחיים לאימון','להיטים ישראלים קצביים לאימון']],
 ['ריצה','קצב לרגליים','מסיבה','run',['שירים ישראלים לריצה','להיטים קצביים לריצה']],
 ['הליכה','לצאת ולנשום','נסיעה','path',['שירים ישראלים להליכה','מוזיקה ישראלית לדרך']],
 ['מוטיבציה','עוד קצת כוח להמשיך','מזרחי שמח','bolt',['שירים ישראלים מוטיבציה','מזרחית קצבית אנרגיה']],
 ['עבודה','שירים שמחזיקים את הקצב','שקט של ערב','grid',['שירים ישראלים לעבודה','מוזיקה ישראלית נעימה']],
 ['לימודים','פחות רעש, יותר ריכוז','שקט של ערב','book',['שירים ישראלים לריכוז','מוזיקה ישראלית נעימה ללימודים']],
 ['נרגעים','להוריד הילוך בלי בלדות','שקט של ערב','wave',['שירים ישראלים רגועים','מוזיקה ישראלית נעימה לערב']],
 ['מבשלים','קצב טוב במטבח','נסיעה','cup',['שירים ישראלים לבישול','להיטים ישראלים כיף']],
 ['ארוחת ערב','מוזיקה נעימה סביב השולחן','אהבה','cup',['שירים ישראלים לארוחת ערב','שירי אהבה קצביים']],
 ['מארחים','מבחר טוב לכל החברים','פופ שמח','spark',['שירים ישראלים לאירוח','להיטים ישראלים שמחים']],
 ['עם חברים','שירים שכיף לשיר יחד','נוסטלגיה מזרחית','spark',['קלאסיקות מזרחיות לשיר ביחד','להיטים מזרחיים נוסטלגיה']],
 ['מתארגנים לצאת','הערב מתחיל כאן','מסיבה','spark',['להיטים ישראלים לפני מסיבה','מזרחית קצבית לריקודים']],
 ['סוף שבוע','חופש וקצב ישראלי','פופ שמח','sun',['שירים ישראלים לסוף שבוע','להיטים ישראלים שמחים']],
 ['לילה מאוחר','שירים נעימים אחרי שהיום נגמר','שקט של ערב','moon',['שירים ישראלים ללילה','מוזיקה ישראלית נעימה לערב']],
 ['יום גשום','געגוע ושירים מהלב','געגוע','rain',['שירים ישראלים געגוע גשם','שירים ישראלים עצובים']],
 ['לב שבור','מותר להרגיש הכול','מזרחי דיכאון','heart',['שירים מזרחיים עצובים פרידה','מזרחית דיכאון לב שבור']]
];
for(const[name,desc,source,art,queries]of addedMoodActivities){const spec={name,desc,songs:(moodSongChoices[source]||[]).map(x=>x.slice()),_moodArt:art,_moodSource:source};homeVibes.push(spec);moodSongChoices[name]=spec.songs;moodPageQueries[name]=queries;}
const moodBaseBeforeThemes=moodBase;
moodBase=function(spec){if(spec._moodSource&&/דיכאון|געגוע/.test(spec._moodSource))return spec._moodSource;return moodBaseBeforeThemes(spec);};
const moodArtKinds={'מזרחי דיכאון':'rain','מזרחי שמח':'sun','מזרחי טורקי':'wave','פופ שמח':'spark','אהבה':'heart','שקט של ערב':'moon','געגוע':'rain','מסיבה':'spark','נסיעה':'path','שבת':'candle','נוסטלגיה מזרחית':'record','ארץ ישראל':'hill','שמחה':'sun','עצב':'rain','ריכוז':'book'};
const moodArtPalettes={sun:['#ef6439','#ffcb66'],cup:['#583e72','#d4a67f'],bolt:['#573bec','#e0ff61'],run:['#11677b','#58e6bd'],path:['#21498d','#8dd8f5'],grid:['#243b66','#9cbbeb'],book:['#164f55','#7ddab6'],wave:['#235080','#6dd5e3'],spark:['#8034b0','#fa78b7'],moon:['#202952','#9d9bfa'],rain:['#243755','#8eb4d8'],heart:['#972548','#ff8e9c'],candle:['#614924','#f8ce7c'],record:['#75432e','#ffc985'],hill:['#2f6550','#c5df8e']};
const moodArtPaths={sun:'<circle cx="240" cy="190" r="62"/><path d="M240 90v-30m0 260v-30M140 190h-30m260 0h-30M170 120l-22-22m184 184-22-22m0-140 22-22M148 282l22-22"/>',cup:'<path d="M160 150h130v85a65 65 0 0 1-130 0zM290 165h25a32 32 0 0 1 0 64h-25M170 310h150M195 100l12-30m42 30 12-30"/>',bolt:'<path d="m255 60-110 150h80l-20 125 130-180h-90z"/>',run:'<circle cx="266" cy="85" r="22"/><path d="m260 120-55 75 70 38-42 91m-28-129-35 65-60 15m130-125 60 42 44-16"/>',path:'<path d="M180 330c-125-110 215-80 110-180S190 80 245 40M240 65l30 5m-38 95 30 15m-65 82 35 15"/>',grid:'<rect x="145" y="105" width="190" height="150" rx="14"/><path d="M240 255v55m-60 0h120m-130-150h140m-140 38h90"/>',book:'<path d="M240 140c-40-25-80-25-115-5v160c40-25 80-20 115 5 35-25 75-30 115-5V135c-35-20-75-20-115 5v160"/>',wave:'<path d="M100 160c60-70 80 70 140 0s80 70 140 0M100 215c60-70 80 70 140 0s80 70 140 0M100 270c60-70 80 70 140 0s80 70 140 0"/>',spark:'<path d="m240 65 32 94 98 31-98 33-32 97-32-97-98-33 98-31zM360 65v55m-28-27h56M110 285v50m-25-25h50"/>',moon:'<path d="M285 80c-120 0-185 175-60 240 65 35 130-10 145-50-115 15-155-90-85-190z"/>',rain:'<path d="M130 180c-25-60 50-95 80-65 30-70 135-30 120 25 60 0 70 70 20 80H145M165 260l-20 40m95-40-20 40m95-40-20 40"/>',heart:'<path d="M240 310 125 200C40 95 190 55 240 140c50-85 200-45 115 60z"/>',candle:'<path d="M185 300V165h110v135M170 320h140M240 60c-65 70 20 110 20 50 0-20-20-35-20-50z"/>',record:'<circle cx="240" cy="190" r="115"/><circle cx="240" cy="190" r="45"/><circle cx="240" cy="190" r="8"/><path d="M160 150c20-42 55-60 100-60M320 230c-20 42-55 60-100 60"/>',hill:'<path d="m80 280 110-140 105 140m-30-80 45-70 90 150M80 310h320"/><circle cx="295" cy="85" r="28"/>'};
// v173: one semantic drawing per card, and a separate editorial style for vibes.
const moodUniquePaths={
 'שמחה':moodArtPaths.sun,'עצב':moodArtPaths.rain,'ריכוז':moodArtPaths.book,
 'מזרחי דיכאון':'<path d="M125 280h230M155 280V155l170-35v140M155 175l170-35"/><ellipse cx="129" cy="280" rx="27" ry="19"/><ellipse cx="299" cy="260" rx="27" ry="19"/>',
 'מזרחי שמח':'<circle cx="240" cy="195" r="105"/><path d="M160 130l160 130M170 280l145-155m-135 95 85-70"/><circle cx="155" cy="260" r="15"/><circle cx="315" cy="130" r="15"/>',
 'מזרחי טורקי':'<path d="M180 300c-130-80-65-180 15-125l85-100 30 25-80 105c70 90-20 175-110 95M155 240l135-145M290 85l25-30m-10 45 30-25"/>',
 'פופ שמח':'<rect x="205" y="80" width="70" height="145" rx="35"/><path d="M175 165v30a65 65 0 0 0 130 0v-30M240 260v65m-55 0h110"/>',
 'אהבה':moodArtPaths.heart,'שקט של ערב':moodArtPaths.moon,
 'געגוע':'<path d="M115 175h250v145H115zM115 175l125 95 125-95M240 90c-35-50-105-5-50 35l50 35 50-35c55-40-15-85-50-35z"/>',
 'מסיבה':'<circle cx="240" cy="205" r="105"/><path d="M135 205h210M240 100v210M155 150h170m-170 110h170M210 105c-45 60-45 140 0 200m60-200c45 60 45 140 0 200M240 50v50"/>',
 'נסיעה':'<path d="m135 215 30-85h150l30 85v90H135zM145 215h190M175 305v25m130-25v25"/><circle cx="175" cy="260" r="15"/><circle cx="305" cy="260" r="15"/>',
 'שבת':moodArtPaths.candle,'נוסטלגיה מזרחית':moodArtPaths.record,'ארץ ישראל':moodArtPaths.hill,
 'בוקר טוב':'<path d="M100 250h280M155 235a85 85 0 0 1 170 0M240 120V85M150 150l-25-25m205 25 25-25M140 285h200M175 315h130"/>',
 'קפה של בוקר':moodArtPaths.cup,
 'אימון':moodArtPaths.bolt,
 'ריצה':moodArtPaths.run,
 'הליכה':'<path d="M125 245l40-100 50 20 5 80 90 25c35 10 55 30 45 50H110v-45zM160 260l65 5m-85-15 25-10"/>',
 'מוטיבציה':'<path d="m140 265 100-100 100 100M240 165v170M160 80h160M180 115h120"/>',
 'עבודה':moodArtPaths.grid,'לימודים':'<path d="M130 100h170v240H130zM170 150h90m-90 40h60m-60 40h40M265 300l25-65 65-130 30 15-65 130zM290 235l30 15"/>','נרגעים':moodArtPaths.wave,
 'מבשלים':'<path d="M145 180h190v85c0 65-190 65-190 0zM120 180h240M145 220h-35m225 0h35M190 115l10-35m40 35 10-35m40 35 10-35"/>',
 'ארוחת ערב':'<circle cx="240" cy="205" r="90"/><circle cx="240" cy="205" r="65"/><path d="M115 105v95m-20-95v60h40v-60M115 200v125M365 105v220m0-220c-40 25-40 95 0 95"/>',
 'מארחים':'<path d="M125 275h230M140 260a100 100 0 0 1 200 0M240 160v-30m-15 0h30M110 300h260"/>',
 'עם חברים':'<circle cx="240" cy="115" r="30"/><circle cx="140" cy="165" r="25"/><circle cx="340" cy="165" r="25"/><path d="M185 260v-50c0-70 110-70 110 0v50M90 310v-60c0-50 90-50 90 0v60m120 0v-60c0-50 90-50 90 0v60"/>',
 'מתארגנים לצאת':'<rect x="150" y="80" width="180" height="250" rx="15"/><path d="M175 330V105h130v225M280 205h5M195 130l35 35m0-35 35 35"/>',
 'סוף שבוע':'<path d="M160 145h160v150H160zM160 165h160M175 145l-30-75m160 75 30-75M155 295l-30 45m200-45 30 45M120 85h240"/>',
 'לילה מאוחר':'<circle cx="240" cy="200" r="105"/><path d="M240 125v80l60 35M125 85l20 20m-20 0 20-20M345 300l20 20m-20 0 20-20"/>',
 'יום גשום':'<path d="M105 220a135 135 0 0 1 270 0c-40-30-65-30-90 0-30-30-60-30-90 0-30-30-55-30-90 0zM240 90v235c0 40-55 40-55 0M150 75l-10 25m190-25-10 25"/>',
 'לב שבור':'<path d="M220 140c-50-85-175-30-95 60l90 90 30-55-45-35 45-45zM260 140c50-85 175-30 95 60l-90 90-15-55 40-35-40-45z"/>'
};
const moodEditorialPaths={
 'בוקר טוב':'<path d="M110 280h260M125 280V110h230v170M240 110v170M125 195h230"/><circle cx="295" cy="153" r="25"/><path d="M155 325h170"/>',
 'קפה של בוקר':'<path d="M165 140h135l-15 170H180zM150 140h165v-25H150zM190 190h85M190 230h85M210 85l10-30m40 30 10-30"/>',
 'אימון':'<path d="M175 205h130M110 170h35v70h-35zM145 140h30v130h-30zM305 140h30v130h-30zM335 170h35v70h-35z"/>',
 'ריצה':'<path d="M125 300c-40-60 40-140 115-140s155 80 115 140M145 290c-25-40 35-100 95-100s120 60 95 100M225 160v140m30-140v140M210 95h60m-60 30h60"/>',
 'הליכה':moodArtPaths.path,
 'מוטיבציה':'<path d="M100 310h70v-65h70v-65h70v-65h70M280 100l75-35m-75 0h75v75"/>',
 'עבודה':'<rect x="130" y="145" width="220" height="150" rx="20"/><path d="M195 145v-40h90v40M130 195c60 35 160 35 220 0M220 205v35h40v-35"/>',
 'לימודים':'<path d="m100 150 140-60 140 60-140 60zM155 175v75c55 35 115 35 170 0v-75M380 150v125m-15 35v-35h30v35M160 330h160"/>',
 'נרגעים':'<path d="M165 320c-90-110-35-200 135-215 30 160-35 230-135 215M165 320l135-215M200 260l-25-60m65 0 45 10"/>',
 'מבשלים':'<path d="M190 140c-50 10-65-70-15-80 30-60 100-45 110-5 65-10 80 70 25 85v70H190zM190 175h120M155 280h170M180 250v65m60-65v65m60-65v65"/>',
 'ארוחת ערב':'<path d="M140 170h200l-15 95c-10 40-160 40-170 0zM240 295v35m-55 0h110M200 95h80M220 125h40"/>',
 'מארחים':'<path d="M130 320V170l110-85 110 85v150H130M205 320v-85h70v85M155 205h25m120 0h25M240 170c-25-35-70-5-35 20l35 25 35-25c35-25-10-55-35-20z"/>',
 'עם חברים':'<path d="M110 125h180v110h-65l-45 45v-45h-70zM310 170h60v140h-70l-45 35v-35h-35v-45M145 165h110m-110 35h75"/>',
 'מתארגנים לצאת':'<path d="M170 110c35-70 105-70 140 0v160H170zM240 270v55m-50 0h100M210 105l55 55M200 140l45 45M120 125v50m-25-25h50"/>',
 'סוף שבוע':'<rect x="135" y="100" width="210" height="220" rx="15"/><path d="M135 155h210M185 80v40m110-40v40m-100 70h30v30h-30zm65 0h30v30h-30zm-65 65h30v30h-30zm65 0h30v30h-30z"/>',
 'לילה מאוחר':'<path d="M260 70c-100 0-145 145-50 200 50 30 110-5 125-40-90 10-130-75-75-160zM115 285v50m-25-25h50M350 100v40m-20-20h40M345 300v30m-15-15h30"/>',
 'יום גשום':'<rect x="125" y="95" width="230" height="230" rx="8"/><path d="M240 95v230M125 210h230M160 125l-10 25m45 5-10 25m105-55-10 25m45 5-10 25M175 245l-10 25m135-25-10 25M110 345h260"/>',
 'לב שבור':'<path d="M130 145c-50-75-165-20-95 55l90 85 40-45-45-25 45-45z" transform="translate(80 0)"/><path d="M270 145c50-75 165-20 95 55l-90 85-35-45 45-25-40-45zM220 80l-20 20m20 5-20 20"/>'
};
function moodArtwork(spec,withTitle=true,style=spec._moodVisual||'gradient'){
 const kind=spec._moodArt||moodArtKinds[spec.name]||moodArtKinds[moodBase(spec)]||'spark',colors=moodArtPalettes[kind],paths=(style==='editorial'?moodEditorialPaths[spec.name]:null)||moodUniquePaths[spec.name]||moodArtPaths[kind];
 const editorial=style==='editorial';
 const bg=editorial?'<rect width="480" height="480" rx="30" fill="#f6f1e8"/><rect x="24" y="24" width="432" height="432" rx="18" fill="none" stroke="'+colors[0]+'" stroke-width="2"/><circle cx="240" cy="202" r="145" fill="'+colors[1]+'" opacity=".24"/><path d="M52 355h376" stroke="'+colors[0]+'" stroke-width="2"/>':'<defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="'+colors[0]+'"/><stop offset="1" stop-color="'+colors[1]+'"/></linearGradient></defs><rect width="480" height="480" rx="30" fill="url(#g)"/><circle cx="415" cy="420" r="160" fill="white" opacity=".08"/><circle cx="40" cy="20" r="100" fill="white" opacity=".07"/>';
 const ink=editorial?colors[0]:'white';
 const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480">'+bg+'<g fill="none" stroke="'+ink+'" stroke-width="'+(editorial?6:9)+'" stroke-linecap="round" stroke-linejoin="round">'+paths+'</g>'+(withTitle?'<text x="240" y="410" fill="'+ink+'" font-family="Arial,sans-serif" font-size="34" font-weight="bold" text-anchor="middle" direction="rtl">'+spec.name+'</text>':'')+'</svg>';
 return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
function themedMoodCard(spec,i,style='gradient'){
 const pageSpec={...spec,_moodVisual:style},card=heroCard({title:spec.name,kicker:style==='editorial'?'אווירה ומצב רוח':'שירים לפי מצב רוח',desc:spec.desc,grad:GRADS[i%GRADS.length],img:moodArtwork(spec,false,style),tap:()=>openMusicDomain(pageSpec)});
 card.classList.add('themed-mood-card',style==='editorial'?'editorial-mood-card':'gradient-mood-card');card.dataset.moodName=spec.name;return card;
}
// Copies used for page style are still mood specs: check by semantic name, not object identity.
const homeMoodSpecBefore173=homeMoodSpec;
homeMoodSpec=function(spec){return homeMoodSpecBefore173(spec)||[...homeVibes,...legacyMoodSpecs].some(s=>s.name===spec.name);};
addHomeVibes=function(){const box=$('listenBody');box.querySelector('#homeVibeShelf')?.remove();const{sec,body}=sectionEl('אווירה ומצב רוח','hscroll heroes');sec.id='homeVibeShelf';sec.classList.add('home-featured');homeVibes.forEach((spec,i)=>body.append(themedMoodCard(spec,i,'editorial')));const anchor=[...box.children].find(x=>x.querySelector('.asec-title')?.textContent.includes('הושמעו לאחרונה'));if(anchor)anchor.after(sec);else box.prepend(sec);};
replaceLegacyMoodShelf=function(){const box=$('listenBody');for(const section of [...box.children])if(section.querySelector('.asec-title')?.textContent.includes('שירים לפי מצב רוח'))section.remove();const{sec,body}=sectionEl('שירים לפי מצב רוח','hscroll heroes');sec.id='diverseLegacyMoods';sec.classList.add('home-featured');[...legacyMoodSpecs,...homeVibes.filter(s=>s._moodSource)].forEach((spec,i)=>body.append(themedMoodCard(spec,i)));box.append(sec);};
const renderMoodBeforeThemes=renderMoodSongPage;
renderMoodSongPage=function(spec,tracks,done){renderMoodBeforeThemes(spec,tracks,done);const art=moodArtwork(spec);$('alArt').src=art;$('alArt').alt=spec.name;$('alArt').onerror=null;$('page-album').style.setProperty('--album-cover','none');};
const themeStyle=document.createElement('style');themeStyle.textContent='#homeVibeShelf .themed-mood-card,#diverseLegacyMoods .themed-mood-card{height:300px}#homeVibeShelf .themed-mood-card>img,#diverseLegacyMoods .themed-mood-card>img{object-fit:cover;opacity:1}#page-album.mood-song-page .albumhead::before{display:none}.themed-mood-card .hero-title{font-size:24px}#homeVibeShelf .editorial-mood-card{background:#f6f1e8;color:#273443}#homeVibeShelf .editorial-mood-card .hc-bg{display:none}#homeVibeShelf .editorial-mood-card .hc-scrim{background:linear-gradient(transparent 50%,#f6f1e8 88%)}#homeVibeShelf .editorial-mood-card .hc-title{color:#273443;text-shadow:none}#homeVibeShelf .editorial-mood-card .hc-kicker,#homeVibeShelf .editorial-mood-card .hc-desc{color:#586272}';document.head.append(themeStyle);addHomeVibes();replaceLegacyMoodShelf();

// The content release owns its badge. Old cached gesture scripts cannot label new content.
const CONTENT_RELEASE='v181';
function syncContentRelease(){
 for(const id of ['engineBadge','verChip']){
  const el=$(id);if(!el)continue;
  for(const node of el.childNodes)if(node.nodeType===Node.TEXT_NODE)node.textContent=node.textContent.replace(/v\d+/g,CONTENT_RELEASE);
  el.dataset.contentRelease=CONTENT_RELEASE;
 }
 document.documentElement.dataset.contentRelease=CONTENT_RELEASE;
}
const paintBadgeBeforeContentRelease=paintEngineBadge;
paintEngineBadge=function(){paintBadgeBeforeContentRelease();syncContentRelease();};
syncContentRelease();paintEngineBadge();
// Restore the loaded content's label after old UI routines and back/forward restoration.
for(const id of ['engineBadge','verChip'])if($(id))new MutationObserver(()=>{
 const el=$(id);if([...el.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&/v\d+/.test(n.textContent)&&!n.textContent.includes(CONTENT_RELEASE)))syncContentRelease();
}).observe($(id),{childList:true,characterData:true,subtree:true});
window.addEventListener('pageshow',syncContentRelease);
if('serviceWorker' in navigator)navigator.serviceWorker.ready.then(reg=>reg.update()).catch(()=>{});
