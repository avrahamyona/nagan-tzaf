// v183: queue buttons act directly, never click controls outside their overlay.
(function(){
for(const id of ['queueShuffle','queueRepeat']){const old=$(id),button=old.cloneNode(true);old.replaceWith(button);button.addEventListener('click',()=>{if(id==='queueShuffle')state.shuffle=!state.shuffle;else state.repeat=state.repeat==='off'?'all':state.repeat==='all'?'one':'off';save();paintNow();renderQueue();toast(id==='queueShuffle'?(state.shuffle?'נגינה אקראית':'נגינה לפי הסדר'):(state.repeat==='off'?'בלי חזרה':state.repeat==='all'?'חזרה על הרשימה':'חזרה על השיר'));});}
const advanceBeforeRepeatAll=advance;advance=async function(dir,auto){if(dir>0&&state.repeat==='all'&&!state.priorityQueue?.length&&!state.priorityCurrent&&!state.shuffle&&state.qi>=state.queue.length-1){recordPlayed(current());state.qi=0;const t=current();if(t)pushHistory(t);loadTrack(t);paintNow();save();if($('queueSheet').classList.contains('open'))renderQueue();return;}return advanceBeforeRepeatAll(dir,auto);};
})();
const albumRequests=new Map();
function albumDuration(t){if(Number.isFinite(Number(t.dur))&&Number(t.dur)>0)return Number(t.dur);const d=String(t.duration||'').trim();return /^\d+(?::\d{1,2}){1,2}$/.test(d)?d.split(':').reduce((n,v)=>n*60+Number(v),0):0;}
async function fetchAlbumTracksExact(a) {
  // Fetch the exact playlist from the first-party Worker, with Piped as a
  // parallel fallback; the fastest nonempty, identity-checked source wins.
  const id = a.plId;
  const errors=[];let cached=null;try{cached=JSON.parse(localStorage.getItem('avi_album_'+id)||'null');}catch{}
  const worker = (async () => {
    if (!/^OLAK5uy_[A-Za-z0-9_-]{10,80}$/.test(id)) return null;
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 18000);
    try {
      const r = await fetch(STREAM_API_DEFAULT + '/album/' + encodeURIComponent(id), { signal: ctl.signal });
      if (!r.ok){const err=await r.json().catch(()=>({}));errors.push(/429/.test(err.error||'')||r.status===429?'throttled':'source');return null;}
      const j = await r.json();
      if (j.playlistId !== id || !Array.isArray(j.tracks)) return null;
      const tracks = j.tracks.filter(t => /^[A-Za-z0-9_-]{11}$/.test(t.id || '') && t.verifiedId === id && t.title)
        .map(t => ({ id: t.id, title: t.title, artist: a.artistName || t.artist || '', dur: albumDuration(t), ch: '' }));
      return tracks.length ? { tracks, name: j.title || a.title, uploader: a.artistName || '' } : null;
    } catch { return null; } finally { clearTimeout(timer); }
  })();
  const piped = (async () => {
    try {
      const j = await pipedFetch('/playlists/' + id, 9000);
      const tracks = (j?.relatedStreams || []).filter(x => x.url && x.type === 'stream').map(mapStream).filter(t => t.id);
      return tracks.length ? { tracks, name: j.name || a.title, uploader: j.uploader || a.artistName || '' } : null;
    } catch { return null; }
  })();
  const winner = await Promise.any([worker.then(x => x || Promise.reject()), piped.then(x => x || Promise.reject())]).catch(() => null);
  if(winner){try{localStorage.setItem('avi_album_'+id,JSON.stringify({...winner,savedAt:Date.now(),playlistId:id}));}catch{}return winner;}
  if(cached?.playlistId===id&&Array.isArray(cached.tracks)&&cached.tracks.length&&Date.now()-cached.savedAt<86400000)return {...cached,cached:true};
  return { tracks: [], name:a.title,uploader:a.artistName||'',error:errors.includes('throttled')?'throttled':'source'};
}
loadAlbumTracks=async function(a){
 const id=a?.plId;if(typeof id!=='string'||!/^[A-Za-z0-9_-]{10,100}$/.test(id))return {tracks:[],name:a?.title||'',uploader:a?.artistName||'',error:'source'};
 if(albumRequests.has(id))return albumRequests.get(id);
 const pending=fetchAlbumTracksExact(a);albumRequests.set(id,pending);
 try{return await pending;}finally{if(albumRequests.get(id)===pending)albumRequests.delete(id);}
};
const albumBeforeReliability=openAlbum;openAlbum=async function(a) {
  $('page-album').classList.remove('mood-song-page','genre-detail','phone-genre');const seq = ++alSeq;
  // Album opened from an artist page must appear above that page.
  $('page-album').classList.toggle('from-artist', $('page-artist').classList.contains('on'));
  $('page-album').classList.remove('release-list');
  $('page-album').style.setProperty('--album-cover', a.thumb ? `url("${a.thumb.replace(/["\\]/g, '')}")` : 'none');
  $('alPlay').style.display = ''; $('alShuffle').style.display = '';
  $('alArtist').classList.toggle('link', !!a.artistName);
  alTracks = []; alCur = a;
  $('alArt').src = a.thumb || '';
  $('alTitle').textContent = a.title;
  $('alArtist').textContent = a.artistName || '';
  $('alMeta').textContent = a.sub || '';
  $('alTracks').innerHTML = '<div class="empty"><p>טוען...</p></div>';
  openPage('page-album');
  try {
    const { tracks, name, uploader, error, cached } = await loadAlbumTracks(a);
    if (seq !== alSeq) return;
    alTracks = tracks.map(t => ({ ...t, album: a }));
    $('alTitle').textContent = name.replace(/^Album [–-] /i, '');
    $('alArtist').textContent = uploader;
    $('alArtist').classList.toggle('link', !!uploader);
    $('alMeta').textContent = alTracks.length ? alTracks.length + ' שירים'+(cached?' · עותק שמור':'') : error==='throttled'?'המקור מגביל כרגע את הבקשות':'לא ניתן לטעון כרגע מהמקור';
    $('alPlay').style.display = alTracks.length ? '' : 'none';
    $('alShuffle').style.display = alTracks.length ? '' : 'none';
    const box = $('alTracks'); box.replaceChildren();
    if (!alTracks.length) {const message=document.createElement('div');message.className='empty';const text=document.createElement('p');text.textContent=error==='throttled'?'המקור מגביל כרגע את הבקשות. זה לא אומר שאין שירים באלבום. נסה מאוחר יותר.':'לא ניתן לטעון כרגע את רשימת השירים מהמקור. נסה מאוחר יותר.';message.append(text);box.append(message);return;}
    alTracks.forEach((t, i) => box.appendChild(trackRow(t, {
      num: i + 1, noArt: true, artistLink: true,
      onPlay: () => playQueue(alTracks, i),
    })));
  } catch { if (seq === alSeq) $('alTracks').innerHTML = '<div class="empty"><p>לא הצלחתי לטעון את השירים של האלבום כרגע.</p></div>'; }
}
