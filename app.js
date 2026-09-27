'use strict';
/* ============ נגן צף — v1 ============
   Static PWA. Playback via the official YouTube IFrame player (hidden, off-screen).
   Search via public Piped API instances with failover; paste-a-link always works.
   Playlists live in localStorage on the device. */

const $ = id => document.getElementById(id);
const IS_IOS = /iPhone|iPod|iPad/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/* ---------- Piped search (with failover) ---------- */
const PIPED_HOSTS = [
  'https://api.piped.private.coffee',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.drgns.space',
  'https://pipedapi.reallyaweso.me',
  'https://pipedapi.leptons.xyz',
];
let pipedBase = localStorage.getItem('nagan_piped') || null;

async function pipedFetch(path, timeoutMs = 9000) {
  const hosts = pipedBase ? [pipedBase, ...PIPED_HOSTS.filter(h => h !== pipedBase)] : PIPED_HOSTS;
  let lastErr = null;
  for (const base of hosts) {
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), timeoutMs);
      const r = await fetch(base + path, { signal: ctl.signal });
      clearTimeout(to);
      if (!r.ok) throw new Error('http ' + r.status);
      const j = await r.json();
      pipedBase = base; localStorage.setItem('nagan_piped', base);
      return j;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('no piped host');
}

async function searchMusic(q) {
  const j = await pipedFetch('/search?q=' + encodeURIComponent(q) + '&filter=music_songs');
  return (j.items || [])
    .filter(it => it.type === 'stream' && it.url)
    .map(it => ({
      id: vidFromUrl(it.url),
      title: it.title || '',
      artist: it.uploaderName || '',
      dur: it.duration > 0 ? it.duration : 0,
    }))
    .filter(t => t.id);
}

function vidFromUrl(s) {
  if (!s) return '';
  const m = String(s).match(/(?:v=|youtu\.be\/|shorts\/|\/watch\/|embed\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{11}$/.test(s.trim()) ? s.trim() : '';
}
const thumb = (id, q) => `https://i.ytimg.com/vi/${id}/${q || 'mq'}default.jpg`;

/* ---------- state ---------- */
const LS_KEY = 'nagan_state_v1';
let state = {
  playlists: { 'מועדפים ❤️': [] },
  queue: [], qi: 0,
  shuffle: false, repeat: 'off', // off | all | one
  volume: 90,
};
try {
  const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
  if (saved && saved.playlists) state = Object.assign(state, saved);
} catch {}
function save() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      playlists: state.playlists, queue: state.queue, qi: state.qi,
      shuffle: state.shuffle, repeat: state.repeat, volume: state.volume,
    }));
  } catch {}
}

/* ---------- YouTube player engine ---------- */
let yt = null, ytReady = false, pendingLoad = null, seeking = false;
window.onYouTubeIframeAPIReady = function () {
  yt = new YT.Player('ytplayer', {
    height: '180', width: '320',
    host: 'https://www.youtube-nocookie.com',
    playerVars: {
      autoplay: 0, controls: 0, disablekb: 1, fs: 0, rel: 0,
      modestbranding: 1, iv_load_policy: 3, playsinline: 1, origin: location.origin,
    },
    events: {
      onReady() {
        ytReady = true;
        yt.setVolume(state.volume);
        if (pendingLoad) { yt.loadVideoById(pendingLoad); pendingLoad = null; }
        restoreLast();
      },
      onStateChange(e) { onPlayerState(e.data); },
      onError() { onTrackError(); },
    },
  });
};
(function loadYT() {
  const s = document.createElement('script');
  s.src = 'https://www.youtube.com/iframe_api';
  s.onerror = () => showNetNote('הנגן של יוטיוב חסום כרגע ברשת הזאת. חיפוש ועיון עדיין עובדים.');
  document.head.appendChild(s);
})();

function loadTrack(t) {
  if (!t) return;
  if (ytReady) yt.loadVideoById(t.id);
  else pendingLoad = t.id;
}

function onPlayerState(st) {
  if (st === YT.PlayerState.PLAYING) { syncPlayUI(false); }
  else if (st === YT.PlayerState.PAUSED) { syncPlayUI(true); }
  else if (st === YT.PlayerState.ENDED) { advance(1, true); }
}

let errGuard = 0;
function onTrackError() {
  const t = current();
  toast(`השיר "${t ? t.title : ''}" לא זמין לנגינה מוטמעת - מדלג`);
  errGuard++;
  if (errGuard < 8) setTimeout(() => advance(1, true), 700);
  setTimeout(() => { errGuard = 0; }, 15000);
}

/* ---------- queue ---------- */
const current = () => state.queue[state.qi] || null;

function playQueue(tracks, idx) {
  state.queue = tracks.slice(); state.qi = idx || 0;
  const t = current();
  if (!t) return;
  loadTrack(t);
  paintNow(); save();
}

function advance(dir, auto) {
  if (!state.queue.length) return;
  if (auto && state.repeat === 'one') { loadTrack(current()); return; }
  let n = state.qi;
  if (state.shuffle && state.queue.length > 2) {
    do { n = Math.floor(Math.random() * state.queue.length); } while (n === state.qi);
  } else {
    n = state.qi + dir;
    if (n >= state.queue.length) {
      if (state.repeat === 'all' || !auto) n = 0;
      else { syncPlayUI(true); return; } // end of queue
    }
    if (n < 0) n = state.queue.length - 1;
  }
  state.qi = n; loadTrack(current()); paintNow(); save();
}

const next = () => advance(1, false);
const prev = () => {
  if (ytReady && yt.getCurrentTime && yt.getCurrentTime() > 4) { yt.seekTo(0, true); return; }
  advance(-1, false);
};
function togglePlay() {
  if (!current()) return;
  if (!ytReady) return;
  const st = yt.getPlayerState();
  if (st === YT.PlayerState.PLAYING) yt.pauseVideo(); else yt.playVideo();
}

/* ---------- media session (lock screen) ---------- */
function updateMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const t = current();
  if (!t) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title, artist: t.artist, album: 'נגן צף',
      artwork: [
        { src: thumb(t.id, 'mq'), sizes: '320x180', type: 'image/jpeg' },
        { src: thumb(t.id, 'hq'), sizes: '480x360', type: 'image/jpeg' },
      ],
    });
  } catch {}
}
try {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => ytReady && yt.playVideo());
    navigator.mediaSession.setActionHandler('pause', () => ytReady && yt.pauseVideo());
    navigator.mediaSession.setActionHandler('nexttrack', next);
    navigator.mediaSession.setActionHandler('previoustrack', prev);
    navigator.mediaSession.setActionHandler('seekto', d => { if (ytReady && d.seekTime != null) yt.seekTo(d.seekTime, true); });
  }
} catch {}

/* ---------- progress clock ---------- */
setInterval(() => {
  if (!ytReady || seeking) return;
  const d = yt.getDuration ? yt.getDuration() : 0;
  const c = yt.getCurrentTime ? yt.getCurrentTime() : 0;
  if (d > 0) $('seek').value = Math.round((c / d) * 1000);
  $('tCur').textContent = fmt(c); $('tDur').textContent = fmt(d);
  try {
    if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && d > 0)
      navigator.mediaSession.setPositionState({ duration: d, position: Math.min(c, d), playbackRate: 1 });
  } catch {}
}, 500);
const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

/* ---------- UI: now playing ---------- */
function syncPlayUI(paused) {
  $('mPlay').textContent = paused ? '▶' : '⏸';
  $('cPlay').textContent = paused ? '▶' : '⏸';
  try { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = paused ? 'paused' : 'playing'; } catch {}
  paintRows();
}

function paintNow() {
  const t = current();
  if (!t) { $('mini').classList.add('hidden'); return; }
  $('mini').classList.remove('hidden');
  $('mArt').src = thumb(t.id); $('mTitle').textContent = t.title; $('mArtist').textContent = t.artist;
  $('pArt').src = thumb(t.id, 'hq');
  $('pArt').onerror = () => { $('pArt').src = thumb(t.id); };
  $('pTitle').textContent = t.title; $('pArtist').textContent = t.artist;
  $('cOpenYT').href = 'https://music.youtube.com/watch?v=' + t.id;
  $('cShuffle').classList.toggle('on', state.shuffle);
  $('cRepeat').classList.toggle('on', state.repeat !== 'off');
  $('cRepeat').textContent = state.repeat === 'one' ? '🔂' : '🔁';
  updateMediaSession();
  paintRows();
}

function restoreLast() {
  const t = current();
  if (!t) return;
  // restore paused: cue only, no autoplay
  try { yt.cueVideoById(t.id); } catch {}
  paintNow(); syncPlayUI(true);
}

/* ---------- UI: rows ---------- */
function trackRow(t, opts = {}) {
  const row = document.createElement('div');
  row.className = 'row' + (current() && current().id === t.id ? ' playing' : '');
  row.dataset.vid = t.id;
  row.innerHTML = `
    <img loading="lazy" src="${thumb(t.id)}" alt="">
    <div class="meta"><div class="t"></div><div class="a"></div></div>
    ${t.dur ? `<span class="dur">${fmt(t.dur)}</span>` : ''}`;
  row.querySelector('.t').textContent = t.title;
  row.querySelector('.a').textContent = t.artist;
  row.addEventListener('click', () => opts.onPlay && opts.onPlay());
  if (opts.onAdd) {
    const b = document.createElement('button');
    b.className = 'iconbtn'; b.textContent = '＋'; b.title = 'הוסף לרשימה';
    b.addEventListener('click', e => { e.stopPropagation(); openAddSheet(t); });
    row.appendChild(b);
  }
  if (opts.onRemove) {
    const b = document.createElement('button');
    b.className = 'iconbtn'; b.textContent = '🗑️'; b.title = 'הסר';
    b.addEventListener('click', e => { e.stopPropagation(); opts.onRemove(); });
    row.appendChild(b);
  }
  return row;
}
function paintRows() {
  const cur = current();
  document.querySelectorAll('.row').forEach(r => {
    r.classList.toggle('playing', !!(cur && r.dataset.vid === cur.id));
  });
}

/* ---------- search ---------- */
let searchTimer = null, searchSeq = 0;
const input = $('searchInput');
input.addEventListener('input', () => {
  $('clearSearch').classList.toggle('hidden', !input.value);
  clearTimeout(searchTimer);
  const q = input.value.trim();
  if (!q) { $('results').innerHTML = ''; $('homeHint').classList.remove('hidden'); hideNetNote(); return; }
  searchTimer = setTimeout(() => runSearch(q), 450);
});
input.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(searchTimer); runSearch(input.value.trim()); } });
$('clearSearch').addEventListener('click', () => { input.value = ''; input.dispatchEvent(new Event('input')); input.focus(); });

async function runSearch(q) {
  if (!q) return;
  switchTab('search');
  const vid = vidFromUrl(q);
  const seq = ++searchSeq;
  $('homeHint').classList.add('hidden');
  $('results').innerHTML = '<div class="empty"><p>מחפש...</p></div>';

  if (vid) { // a pasted YouTube link / id
    const t = { id: vid, title: 'שיר מיוטיוב', artist: '', dur: 0 };
    $('results').innerHTML = '';
    $('results').appendChild(trackRow(t, { onPlay: () => playQueue([t], 0), onAdd: true }));
    enrichTitle(t);
    return;
  }
  try {
    const items = await searchMusic(q);
    if (seq !== searchSeq) return;
    hideNetNote();
    $('results').innerHTML = '';
    if (!items.length) { $('results').innerHTML = '<div class="empty"><p>לא נמצאו תוצאות. נסו ניסוח אחר, או הדביקו קישור יוטיוב.</p></div>'; return; }
    items.forEach((t, i) => $('results').appendChild(trackRow(t, {
      onPlay: () => playQueue(items, i), onAdd: true,
    })));
  } catch (e) {
    if (seq !== searchSeq) return;
    $('results').innerHTML = '<div class="empty"><p>החיפוש לא זמין כרגע.</p><p class="dim">אפשר תמיד להדביק כאן קישור של שיר מיוטיוב ולנגן ישירות.</p></div>';
    showNetNote('שירות החיפוש החיצוני לא עונה כרגע. הדביקת קישור יוטיוב עובדת תמיד.');
  }
}

async function enrichTitle(t) {
  try {
    const j = await pipedFetch('/streams/' + t.id, 7000);
    if (j && j.title) { t.title = j.title; t.artist = j.uploader || ''; t.dur = j.duration || 0; save(); paintRows(); paintNow(); }
  } catch {}
}

/* ---------- playlists ---------- */
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  $('view-search').classList.toggle('on', name === 'search');
  $('view-playlists').classList.toggle('on', name === 'playlists');
  $('view-playlist').classList.remove('on');
  if (name === 'playlists') renderPlaylists();
}
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

function renderPlaylists() {
  const box = $('playlists'); box.innerHTML = '';
  const names = Object.keys(state.playlists);
  if (!names.length) { box.innerHTML = '<div class="empty"><p>עוד אין רשימות. צרו אחת!</p></div>'; return; }
  names.forEach(name => {
    const songs = state.playlists[name];
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<div class="pl-ic">🎶</div><div class="meta"><div class="t"></div><div class="a"></div></div><span class="dur">${songs.length}</span>`;
    row.querySelector('.t').textContent = name;
    row.querySelector('.a').textContent = songs.length ? songs.map(s => s.title).slice(0, 2).join(' · ') : 'ריקה';
    row.addEventListener('click', () => openPlaylist(name));
    box.appendChild(row);
  });
}

let openPl = null;
function openPlaylist(name) {
  openPl = name;
  switchTab('playlists');
  $('view-playlists').classList.remove('on');
  $('view-playlist').classList.add('on');
  $('plName').textContent = name;
  renderPlSongs();
}
function renderPlSongs() {
  const songs = state.playlists[openPl] || [];
  $('plCount').textContent = songs.length + ' שירים';
  const box = $('plSongs'); box.innerHTML = '';
  if (!songs.length) { box.innerHTML = '<div class="empty"><p>הרשימה ריקה. חפשו שירים ולחצו ＋ כדי להוסיף.</p></div>'; return; }
  songs.forEach((t, i) => box.appendChild(trackRow(t, {
    onPlay: () => playQueue(songs, i),
    onRemove: () => { songs.splice(i, 1); save(); renderPlSongs(); renderPlaylists(); },
  })));
}
$('plBack').addEventListener('click', () => switchTab('playlists'));
$('plPlayAll').addEventListener('click', () => {
  const s = state.playlists[openPl] || [];
  if (s.length) playQueue(s, 0); else toast('הרשימה ריקה');
});
$('plShufflePlay').addEventListener('click', () => {
  const s = state.playlists[openPl] || [];
  if (!s.length) return toast('הרשימה ריקה');
  state.shuffle = true; playQueue(s, Math.floor(Math.random() * s.length)); toast('מנגן אקראי 🔀');
});
$('plRename').addEventListener('click', () => {
  const nn = (prompt('שם חדש לרשימה:', openPl) || '').trim();
  if (!nn || nn === openPl) return;
  if (state.playlists[nn]) return toast('כבר יש רשימה בשם הזה');
  state.playlists[nn] = state.playlists[openPl];
  delete state.playlists[openPl];
  openPl = nn; save(); openPlaylist(nn);
});
$('plDelete').addEventListener('click', () => {
  if (!confirm(`למחוק את הרשימה "${openPl}"?`)) return;
  delete state.playlists[openPl];
  save(); switchTab('playlists');
});
$('newPlaylistBtn').addEventListener('click', () => {
  const name = (prompt('שם הרשימה:') || '').trim();
  if (!name) return;
  if (state.playlists[name]) return toast('כבר יש רשימה בשם הזה');
  state.playlists[name] = []; save(); renderPlaylists();
});

/* ---------- add-to-playlist sheet ---------- */
let addTarget = null;
function openAddSheet(t) {
  addTarget = t;
  const box = $('addList'); box.innerHTML = '';
  Object.keys(state.playlists).forEach(name => {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<div class="pl-ic">🎶</div><div class="meta"><div class="t"></div><div class="a"></div></div>`;
    row.querySelector('.t').textContent = name;
    row.querySelector('.a').textContent = (state.playlists[name] || []).length + ' שירים';
    row.addEventListener('click', () => {
      const exists = (state.playlists[name] || []).some(x => x.id === t.id);
      if (exists) toast('השיר כבר ברשימה הזאת');
      else { state.playlists[name].push(t); save(); toast(`נוסף ל"${name}" ✔`); }
      closeSheets();
    });
    box.appendChild(row);
  });
  $('addSheet').classList.add('open'); $('scrim').classList.add('on');
}
$('addNew').addEventListener('click', () => {
  const name = (prompt('שם הרשימה:') || '').trim();
  if (!name) return;
  if (!state.playlists[name]) state.playlists[name] = [];
  state.playlists[name].push(addTarget);
  save(); closeSheets(); toast(`נוסף ל"${name}" ✔`);
});

/* ---------- sheets ---------- */
function closeSheets() {
  $('sheet').classList.remove('open'); $('addSheet').classList.remove('open'); $('scrim').classList.remove('on');
}
$('scrim').addEventListener('click', closeSheets);
$('sheetGrab').addEventListener('click', closeSheets);
$('addGrab').addEventListener('click', closeSheets);
$('mMeta').addEventListener('click', () => { $('sheet').classList.add('open'); $('scrim').classList.add('on'); });
$('mArt').addEventListener('click', () => { $('sheet').classList.add('open'); $('scrim').classList.add('on'); });

/* ---------- player controls ---------- */
$('mPlay').addEventListener('click', togglePlay);
$('cPlay').addEventListener('click', togglePlay);
$('mNext').addEventListener('click', next);
$('cNext').addEventListener('click', next);
$('cPrev').addEventListener('click', prev);
$('cShuffle').addEventListener('click', () => { state.shuffle = !state.shuffle; save(); paintNow(); toast(state.shuffle ? 'נגינה אקראית 🔀' : 'נגינה לפי הסדר'); });
$('cRepeat').addEventListener('click', () => {
  state.repeat = state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off';
  save(); paintNow();
  toast(state.repeat === 'off' ? 'בלי חזרה' : state.repeat === 'all' ? 'חזרה על הרשימה 🔁' : 'חזרה על השיר 🔂');
});
$('cAdd').addEventListener('click', () => { const t = current(); if (t) openAddSheet(t); });
const seekEl = $('seek');
seekEl.addEventListener('input', () => { seeking = true; });
seekEl.addEventListener('change', () => {
  if (ytReady && yt.getDuration) yt.seekTo((seekEl.value / 1000) * yt.getDuration(), true);
  seeking = false;
});

/* ---------- toast + notes ---------- */
let toastTimer = null;
function toast(msg, ms = 2600) {
  const el = $('toast');
  el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}
function showNetNote(msg) { $('netNote').textContent = msg; $('netNote').classList.remove('hidden'); }
function hideNetNote() { $('netNote').classList.add('hidden'); }

/* ---------- info + iOS tip ---------- */
$('infoBtn').addEventListener('click', () => $('infoModal').classList.remove('hidden'));
$('infoClose').addEventListener('click', () => $('infoModal').classList.add('hidden'));
if (IS_IOS && !localStorage.getItem('nagan_ios_tip')) {
  setTimeout(() => $('iosTip').classList.remove('hidden'), 2500);
}
$('iosTipOk').addEventListener('click', () => {
  $('iosTip').classList.add('hidden');
  localStorage.setItem('nagan_ios_tip', '1');
});

/* ---------- keep mini player alive when tab hidden ---------- */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && current()) syncPlayUI(ytReady ? yt.getPlayerState() !== YT.PlayerState.PLAYING : true);
});

/* ---------- service worker ---------- */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
