// Actual listened time on this device, never inferred from a queued or tapped song.
const LISTEN_STATS_KEY='avi_listening_monthly_v1';
let listeningStats={startedAt:new Date().toISOString(),months:{},days:{}};
try{const saved=JSON.parse(localStorage.getItem(LISTEN_STATS_KEY));if(saved?.months&&saved.startedAt)listeningStats=saved;}catch{}
listeningStats.days ||= {};
let listeningSession=null,statsSavedAt=0;
const statsMonth=(date=new Date())=>date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0');
const statsDay=(date=new Date())=>statsMonth(date)+'-'+String(date.getDate()).padStart(2,'0');
function statsSongsFor(period,month=statsMonth()){
 const buckets=period==='month'?[listeningStats.months[month]]:period==='all'?Object.values(listeningStats.months):Object.entries(listeningStats.days).filter(([key])=>{const day=new Date();if(period==='week')day.setDate(day.getDate()-6);return key>=statsDay(day)&&key<=statsDay();}).map(([,bucket])=>bucket);
 const songs=new Map;for(const bucket of buckets)for(const song of Object.values(bucket?.songs||{})){const row=songs.get(song.id)||{...song,seconds:0,plays:0};row.seconds+=song.seconds;row.plays+=song.plays;songs.set(song.id,row);}
 return [...songs.values()].sort((a,b)=>b.plays-a.plays||b.seconds-a.seconds);
}
function persistListeningStats(){try{localStorage.setItem(LISTEN_STATS_KEY,JSON.stringify(listeningStats));statsSavedAt=Date.now();}catch{}}
function listenSession(el){
 const track=current();if(!track?.id||el.dataset.vid!==track.id)return null;
 const token=playGen+':'+track.id+':'+(el===clipEl?'clip':'audio');
 if(listeningSession?.token!==token)listeningSession={token,track:{id:track.id,title:track.title||'',artist:track.artist||'',ch:track.ch||'',dur:track.dur||0},seconds:0,counted:false,lastWall:null,lastMedia:null};
 return listeningSession;
}
function sampleListening(el,reset=false){
 if(el!== (videoMode?clipEl:audioEl))return;
 const session=listenSession(el);if(!session)return;
 const wall=Date.now(),media=el.currentTime;
 if(session.lastWall!==null&&!el.seeking&&!reset){
  const elapsed=(wall-session.lastWall)/1000,advanced=media-session.lastMedia;
  // Seeks cannot create listened time; media progress must agree with the clock.
  if(elapsed>0&&advanced>=0&&advanced<=elapsed*1.6+1){
   const seconds=Math.min(elapsed,advanced);if(seconds>0){
    const month=listeningStats.months[statsMonth()]||(listeningStats.months[statsMonth()]={songs:{}});
    const song=month.songs[session.track.id]||(month.songs[session.track.id]={...session.track,seconds:0,plays:0});
    const day=listeningStats.days[statsDay()]||(listeningStats.days[statsDay()]={songs:{}});const daySong=day.songs[session.track.id]||(day.songs[session.track.id]={...session.track,seconds:0,plays:0});
    song.seconds+=seconds;daySong.seconds+=seconds;session.seconds+=seconds;
    const threshold=session.track.dur>0?Math.min(30,session.track.dur/2):30;
    if(!session.counted&&session.seconds>=threshold){song.plays++;daySong.plays++;session.counted=true;}
    if(wall-statsSavedAt>10000)persistListeningStats();
   }
  }
 }
 session.lastWall=(!el.paused&&!el.seeking)?wall:null;session.lastMedia=media;
}
for(const el of [audioEl,clipEl]){
 el.addEventListener('playing',()=>sampleListening(el,true));
 el.addEventListener('timeupdate',()=>sampleListening(el));
 for(const name of ['pause','ended','waiting'])el.addEventListener(name,()=>{sampleListening(el);if(listeningSession)listeningSession.lastWall=null;persistListeningStats();});
 el.addEventListener('seeking',()=>sampleListening(el,true));
 el.addEventListener('seeked',()=>sampleListening(el,true));
}
window.addEventListener('pagehide',()=>{sampleListening(videoMode?clipEl:audioEl);persistListeningStats();});
const loadBeforeListeningStats=loadTrack;
loadTrack=function(track,options={}){sampleListening(videoMode?clipEl:audioEl);persistListeningStats();listeningSession=null;return loadBeforeListeningStats(track,options);};
const tasteBeforeListeningStats=tasteArtists;
tasteArtists=function(){
 const artists=tasteBeforeListeningStats(),weights=new Map(artists.map(a=>[a.ch||artistKey(a.name),{...a}]));
 for(const [period,factor] of [['day',4],['week',2],['month',1],['all',.25]])for(const song of statsSongsFor(period)){
  if(!song.artist||song.seconds<30)continue;
  const key=song.ch||artistKey(song.artist),a=weights.get(key)||{name:song.artist,ch:song.ch||'',weight:0};
  a.weight+=factor*(song.plays*2+Math.min(song.seconds/300,30));weights.set(key,a);
 }
 return [...weights.values()].sort((a,b)=>b.weight-a.weight);
};
const statsPage=document.createElement('div');statsPage.id='page-listening-stats';statsPage.className='page';statsPage.dir='rtl';
statsPage.innerHTML='<div class="ascroll"><div class="stats-wrap"><button class="stats-back">חזרה לספריה</button><h1>ההאזנה שלך</h1><div id="statsPeriods" class="stats-periods"><button data-period="day">היום</button><button data-period="week">7 ימים</button><button data-period="month">חודש</button><button data-period="all">כל הזמן</button></div><label for="statsMonth" id="statsMonthLabel">החודש הנבחר</label><select id="statsMonth"></select><div id="statsSummary"></div><h2>האמנים שלך</h2><div id="statsArtists"></div><h2>השירים שלך</h2><div id="statsSongs"></div><p class="stats-note">נשמר במכשיר הזה ומשמש גם להמלצות ולתחנות האמנים שלך. ההמלצות משלבות את היום, 7 הימים האחרונים, החודש וכל הזמן; בלי לקבוע איך אתה מרגיש לפי שיר אחד. המדידה מתחילה מהעדכון הזה, בלי להמציא נתוני עבר. האזנה נספרת אחרי 30 שניות, או חצי משיר קצר יותר. דילוג בזמן לא נספר.</p></div></div>';
document.body.appendChild(statsPage);statsPage.querySelector('.stats-back').onclick=()=>closePage(statsPage.id);
let statsPeriod='month';
for(const button of $('statsPeriods').children)button.onclick=()=>{statsPeriod=button.dataset.period;renderMonthlyListening();};
$('statsMonth').onchange=renderMonthlyListening;
function renderMonthlyListening(){
 sampleListening(videoMode?clipEl:audioEl);persistListeningStats();
 const selected=$('statsMonth').value,months=[...new Set([statsMonth(),...Object.keys(listeningStats.months)])].sort().reverse();
 $('statsMonth').replaceChildren(...months.map(month=>{const option=document.createElement('option');option.value=month;option.textContent=new Date(Number(month.slice(0,4)),Number(month.slice(5))-1,1).toLocaleDateString('he-IL',{month:'long',year:'numeric'});return option;}));
 $('statsMonth').value=months.includes(selected)?selected:months[0];
 for(const button of $('statsPeriods').children){button.classList.toggle('selected',button.dataset.period===statsPeriod);button.setAttribute('aria-pressed',button.dataset.period===statsPeriod);}
 $('statsMonth').hidden=$('statsMonthLabel').hidden=statsPeriod!=='month';
 const songs=statsSongsFor(statsPeriod,$('statsMonth').value),artists=new Map;
 for(const song of songs){const key=song.ch||artistKey(song.artist||'אמן לא ידוע'),artist=artists.get(key)||{name:song.artist||'אמן לא ידוע',seconds:0,plays:0};artist.seconds+=song.seconds;artist.plays+=song.plays;artists.set(key,artist);}
 const seconds=songs.reduce((sum,song)=>sum+song.seconds,0),plays=songs.reduce((sum,song)=>sum+song.plays,0);
 $('statsSummary').innerHTML='<div><strong>'+Math.floor(seconds/60)+'</strong><span>דקות האזנה</span></div><div><strong>'+plays+'</strong><span>האזנות</span></div><div><strong>'+songs.filter(s=>s.plays).length+'</strong><span>שירים שונים</span></div>';
 const artistBox=$('statsArtists');artistBox.replaceChildren();
 for(const artist of [...artists.values()].sort((a,b)=>b.plays-a.plays||b.seconds-a.seconds).slice(0,10)){const row=document.createElement('div');row.className='stats-artist';const title=document.createElement('b');title.textContent=artist.name;const detail=document.createElement('span');detail.textContent=artist.plays+' האזנות · '+Math.floor(artist.seconds/60)+' דקות';row.append(title,detail);artistBox.append(row);}
 const box=$('statsSongs');box.replaceChildren();for(const song of songs.slice(0,30)){const row=trackRow(song,{onPlay:()=>playQueue(songs,songs.findIndex(t=>t.id===song.id))});const detail=document.createElement('span');detail.className='stats-count';detail.textContent=song.plays+' האזנות';row.append(detail);box.append(row);}
 if(!songs.length){artistBox.textContent='עוד אין נתונים לתקופה הזו';box.textContent='נגן את השירים שלך, והסיכום יתמלא כאן.';}
}
function openMonthlyListening(){renderMonthlyListening();openPage(statsPage.id);}
const libraryBeforeListeningStats=renderLibrary;
renderLibrary=function(){libraryBeforeListeningStats();const row=document.createElement('button');row.className='librow stats-entry';row.textContent='ההאזנה שלך · יום, שבוע, חודש והכול';row.onclick=openMonthlyListening;$('libRows').append(row);};
renderLibrary();
const paintBadgeBeforeStats=paintEngineBadge;
paintEngineBadge=function(){paintBadgeBeforeStats();if($('engineBadge'))$('engineBadge').innerHTML=$('engineBadge').innerHTML.replace(/v\d+/g,'v146');};
if($('verChip')?.lastChild)$('verChip').lastChild.textContent='v146';paintEngineBadge();
const radioBeforeListeningStats=renderRadio;
renderRadio=async function(){
 await radioBeforeListeningStats();const seeds=tasteArtists().slice(0,6);if(!seeds.length)return;
 const{sec,body}=sectionEl('תחנות לפי ההאזנה שלך','hscroll');sec.id='statsArtistStations';
 for(const artist of seeds){const card=stationCard(artist.name,'',async()=>{toast('מפעיל את התחנה של '+artist.name+'...');try{const songs=songDiscovery(await searchMusicCached(artist.name)).filter(t=>artistMatchesTaste(t,[artist]));if(songs.length)playQueue(songs,0,{station:{seed:songs[0].id,name:artist.name}});else toast('לא נמצאו שירים זמינים');}catch{toast('התחנה לא זמינה כרגע');}});body.append(card);fillArtistPortrait(card,artist.name,artist.ch||'');}
 $('radioBody').prepend(sec);
};
