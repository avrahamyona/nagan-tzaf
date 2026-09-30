// Shared song rows, menus and queue actions use the same icons and gestures.
const gestureIcons={
 'queue-first':'<path d="M4 8h12M4 12h16M4 16h16M4 20h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M18 2v6m-2-4 2-2 2 2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
 'queue-last':'<path d="M4 4h16M4 8h16M4 12h16M4 16h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M18 16v6m-2-2 2 2 2-2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
 'playlist-add':'<path d="M4 5h10M4 10h10M4 15h10M4 20h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="19" cy="8" r="3.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M19 6v4m-2-2h4" stroke="currentColor" stroke-width="1.5"/>',
 'artist-person':'<circle cx="12" cy="6.5" r="3"/><path d="M5 21v-3c0-4 3-6 7-6s7 2 7 6v3z"/>',
 'credits-info':'<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 11v6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="12" cy="7.5" r="1.1"/>',
 'less-thumb':'<path d="M8 3h8c2 0 3 1 3 3l-1 6c-.2 1-1 2-2 2h-3v5c0 2-2 3-3 1l-4-7V5c0-1 1-2 2-2zM3 4h3v9H3z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>'
};
const defs=document.querySelector('svg defs')||document.querySelector('svg');
for(const [name,paths]of Object.entries(gestureIcons)){const symbol=document.createElementNS('http://www.w3.org/2000/svg','symbol');symbol.id='i-'+name;symbol.setAttribute('viewBox','0 0 24 24');symbol.innerHTML=paths;defs.append(symbol);}
function gestureIcon(name){return '<svg aria-hidden="true"><use href="#i-'+name+'"/></svg>';}
$('ssQueueNext').querySelector('use').setAttribute('href','#i-queue-first');$('ssQueueLast').querySelector('use').setAttribute('href','#i-queue-last');$('ssAdd').querySelector('use').setAttribute('href','#i-playlist-add');$('ssLess').querySelector('use').setAttribute('href','#i-less-thumb');
$('ssArtist').querySelector('use').setAttribute('href','#i-artist-person');
$('ssQueueNext').querySelector('span').textContent='הוספה לתחילת התור';$('ssQueueLast').querySelector('span').textContent='הוספה לסוף התור';$('ssAdd').querySelector('span').textContent='הוספה לפלייליסט';$('ssAlbum').querySelector('span').textContent='מעבר לאלבום';$('ssArtist').querySelector('span').textContent='מעבר לאמן';$('ssLess').querySelector('span').textContent='פחות הצעות';
$('songShortcutFav').querySelector('span').textContent='הוספה למועדפים';
const creditButton=document.createElement('button');creditButton.id='ssCredits';creditButton.className='sheetrow';creditButton.innerHTML=gestureIcon('credits-info')+'<span>הצגת הקרדיטים</span>';$('ssLess').before(creditButton);
creditButton.onclick=()=>{const track=sheetTrack;closeSheet('songSheet');if(!track)return;const box=document.createElement('div');box.className='credits-dialog';box.role='dialog';box.setAttribute('aria-label','קרדיטים');const title=document.createElement('h2');title.textContent=track.title;const artist=document.createElement('p');artist.textContent='אמן / ערוץ המקור: '+(track.artist||'לא ידוע');const note=document.createElement('p');note.textContent='המקור אינו מספק קרדיטים מאומתים לכתיבה, לחן והפקה. לא נציג שמות בניחוש.';const close=document.createElement('button');close.textContent='סגור';close.onclick=()=>box.remove();box.append(title,artist,note,close);document.body.append(box);};
const openBeforeGestures=openSongSheet;
openSongSheet=function(track,options={}){
 openBeforeGestures(track,options);
 setIcon($('ssFav'),state.fav[track.id]?'star':'star');$('ssFav').querySelector('span').textContent=state.fav[track.id]?'הסרה מהמועדפים':'הוספה למועדפים';
 $('songShortcutFav').querySelector('span').textContent=state.fav[track.id]?'הסרה מהמועדפים':'הוספה למועדפים';
 $('ssAlbum').disabled=!track.album?.plId;$('ssAlbum').classList.remove('hidden');
 if(!track.album?.plId)verifiedAlbumFor(track).then(album=>{if(sheetTrack?.id===track.id&&album?.plId){$('ssAlbum').disabled=false;sheetOpts.verifiedAlbum=album;}});
 const sheet=$('songSheet');sheet.classList.add('apple-song-menu');
 // Keep the entire action panel inside the viewport, with a lifted source preview.
 sheet.style.bottom='auto';sheet.style.top='';sheet.style.left='';
 if(options.sourceRow){const r=options.sourceRow.getBoundingClientRect(),height=Math.min(sheet.scrollHeight,innerHeight-130);sheet.style.left=Math.max(16,Math.min(innerWidth-sheet.offsetWidth-16,r.left+12))+'px';sheet.style.top=Math.max(options.preview?108:24,Math.min(innerHeight-height-90,r.top+20))+'px';}
};
// Long hold also works with mouse. Original touch hold is shared by all trackRow calls.
const holdBeforeGestures=attachSongRowHold;
attachSongRowHold=function(row,track,options){
 holdBeforeGestures(row,track,options);let timer=null,origin=null,consumed=false;
 row.addEventListener('pointerdown',event=>{if(event.pointerType!=='mouse'||event.button!==0||event.target.closest('button,a,input,.artist-link,.qhandle'))return;origin={x:event.clientX,y:event.clientY};timer=setTimeout(()=>{consumed=true;openSongSheet(track,{...(options.sheet||{}),preview:true,sourceRow:row,onPlay:options.onPlay});},430);});
 const cancel=()=>{clearTimeout(timer);origin=null;};for(const type of ['pointerup','pointercancel'])row.addEventListener(type,cancel);
 row.addEventListener('pointermove',e=>{if(origin&&(Math.abs(e.clientX-origin.x)>12||Math.abs(e.clientY-origin.y)>12))cancel();});
 row.addEventListener('click',e=>{if(consumed){e.preventDefault();e.stopImmediatePropagation();consumed=false;}},true);
 row.addEventListener('contextmenu',e=>{e.preventDefault();cancel();consumed=true;openSongSheet(track,{...(options.sheet||{}),preview:true,sourceRow:row,onPlay:options.onPlay});});
};
const swipeBeforeGestures=attachTrackSwipe;
attachTrackSwipe=function(row,track){
 if(row.dataset.gestureSwipe)return;row.dataset.gestureSwipe='1';swipeBeforeGestures(row,track);
 const next=row.querySelector('.swipe-next'),last=row.querySelector('.swipe-end');next.innerHTML=gestureIcon('queue-first')+'<span>הבא בתור</span>';last.innerHTML=gestureIcon('queue-last')+'<span>בסוף התור</span>';
 let origin=null;row.addEventListener('touchstart',e=>{if(e.touches.length===1)origin={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});
 row.addEventListener('touchmove',e=>{if(!origin)return;const dx=e.touches[0].clientX-origin.x,dy=e.touches[0].clientY-origin.y;if(Math.abs(dx)>Math.abs(dy)*1.3&&Math.abs(dx)>12){row.classList.add('gesture-dragging');row.style.setProperty('--gesture-drag',Math.max(-120,Math.min(120,dx))+'px');}},{passive:true});
 const finish=()=>{origin=null;row.classList.remove('gesture-dragging');row.style.removeProperty('--gesture-drag');};row.addEventListener('touchend',finish);row.addEventListener('touchcancel',finish);
 for(const button of [next,last])button.addEventListener('click',()=>{row.classList.remove('swipe-open-start','swipe-open-end');row.animate([{transform:'scale(.985)'},{transform:'scale(1)'}],{duration:220});});
};
const rowBeforeGestures=trackRow;
trackRow=function(track,options={}){return rowBeforeGestures(track,{...options,queueSwipe:true});};
// Existing displayed rows are rebuilt on their next view render; patch queue labels everywhere.
function patchQueueActionIcons(){for(const button of document.querySelectorAll('button')){const label=(button.getAttribute('aria-label')||button.textContent||'').trim();if(!button.querySelector('svg'))continue;if(/תחילת התור|נגן הבא|הבא בתור/.test(label))button.querySelector('use')?.setAttribute('href','#i-queue-first');else if(/סוף התור/.test(label))button.querySelector('use')?.setAttribute('href','#i-queue-last');}}
new MutationObserver(patchQueueActionIcons).observe(document.body,{childList:true,subtree:true});patchQueueActionIcons();
const badgeBeforeGestures=paintEngineBadge;paintEngineBadge=function(){badgeBeforeGestures();if($('engineBadge'))$('engineBadge').innerHTML=$('engineBadge').innerHTML.replace(/v\d+/g,'v149');};if($('verChip')?.lastChild)$('verChip').lastChild.textContent='v149';paintEngineBadge();
