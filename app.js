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

function chFromUrl(u) {
  const m = String(u || '').match(/\/channel\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : '';
}
function mapStream(it) {
  return {
    id: vidFromUrl(it.url),
    title: it.title || '',
    artist: it.uploaderName || '',
    dur: it.duration > 0 ? it.duration : 0,
    ch: chFromUrl(it.uploaderUrl),
  };
}
async function searchMusic(q, filter = 'music_songs') {
  const j = await pipedFetch('/search?q=' + encodeURIComponent(q) + '&filter=' + filter);
  return (j.items || [])
    .filter(it => it.type === 'stream' && it.url)
    .map(mapStream)
    .filter(t => t.id);
}
async function searchChannels(q) {
  const j = await pipedFetch('/search?q=' + encodeURIComponent(q) + '&filter=music_artists');
  return (j.items || [])
    .filter(it => it.type === 'channel' && it.url)
    .map(it => ({
      chId: chFromUrl(it.url),
      name: it.name || '',
      avatar: it.thumbnail || '',
      subs: it.subscriberCount > 0 ? it.subscriberCount : 0,
      verified: !!it.verified,
    }))
    .filter(c => c.chId);
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

/* ---------- audio engine: ad-free direct streams, embed as fallback ---------- */
const audioEl = document.createElement('audio');
audioEl.preload = 'none';
let engine = 'yt'; // 'audio' | 'yt'
let audioRetry = 0;
const STREAM_API = localStorage.getItem('nagan_stream_api') || ''; // own proxy when deployed

function pickAudio(j) {
  const as = ((j && j.audioStreams) || []).filter(a => a.url);
  if (!as.length) throw new Error('no audio streams');
  const mp4 = as.filter(a => /audio\/mp4/.test(a.mimeType || ''));
  return (mp4.length ? mp4 : as).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0].url;
}
async function resolveAudioUrl(vid) {
  // 1) own proxy, when deployed
  if (STREAM_API) {
    try {
      const r = await fetch(STREAM_API.replace(/\/$/, '') + '/audio/' + vid);
      if (r.ok) { const j = await r.json(); if (j.url) return j.url; }
    } catch {}
  }
  // 2) race all Piped hosts in parallel - first valid audio stream wins
  try {
    return await Promise.any(PIPED_HOSTS.map(base => (async () => {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 9000);
      try {
        const r = await fetch(base + '/streams/' + vid, { signal: ctl.signal });
        clearTimeout(to);
        if (!r.ok) throw new Error('http ' + r.status);
        return pickAudio(await r.json());
      } finally { clearTimeout(to); }
    })()));
  } catch {}
  return null;
}

/* iOS unlock: a media element that was play()ed inside a real user gesture
   may be played programmatically afterwards - so prime it on the first tap. */
(function primeAudioUnlock() {
  const unlock = () => {
    try { const p = audioEl.play(); if (p && p.then) p.then(() => audioEl.pause()).catch(() => {}); } catch {}
    document.removeEventListener('pointerdown', unlock, true);
  };
  document.addEventListener('pointerdown', unlock, true);
})();

function useYtEngine(t, startAt) {
  engine = 'yt';
  try { audioEl.pause(); audioEl.removeAttribute('src'); audioEl.load(); } catch {}
  lastCur = -1;
  if (ytReady) yt.loadVideoById(startAt ? { videoId: t.id, startSeconds: startAt } : t.id);
  else pendingLoad = t.id;
}

function loadTrack(t, opts = {}) {
  if (!t) return;
  lastCur = -1;
  if (videoMode) { useYtEngine(t, opts.startAt); return; }
  // song mode: ad-free direct audio first, official embed as graceful fallback
  engine = 'audio';
  audioEl.dataset.vid = t.id;
  audioRetry = 0;
  // Inside a real tap, start the embed immediately so playback begins at once;
  // if an ad-free stream resolves, we hand over to it. Otherwise the embed just plays on.
  const hasGesture = !!(navigator.userActivation && navigator.userActivation.isActive);
  if (hasGesture && ytReady) {
    engine = 'yt-pending';
    yt.loadVideoById(opts.startAt ? { videoId: t.id, startSeconds: opts.startAt } : t.id);
  }
  resolveAudioUrl(t.id).then(url => {
    if (audioEl.dataset.vid !== t.id || videoMode) return;
    if (!url) { // seamless fallback
      if (engine === 'yt-pending') engine = 'yt';
      else useYtEngine(t, opts.startAt);
      return;
    }
    try { yt.pauseVideo(); } catch {}
    const wasPlaying = engine === 'yt-pending' && ytReady && yt.getPlayerState() === YT.PlayerState.PLAYING;
    engine = 'audio';
    audioEl.src = url;
    if (opts.startAt) { try { audioEl.currentTime = opts.startAt; } catch {} }
    if (wasPlaying || hasGesture) audioEl.play().catch(() => { useYtEngine(t, opts.startAt); });
    else if (audioEl.src) syncPlayUI(true);
    else syncPlayUI(true);
  });
}

audioEl.addEventListener('ended', () => advance(1, true));
audioEl.addEventListener('play', () => syncPlayUI(false));
audioEl.addEventListener('pause', () => syncPlayUI(true));
audioEl.addEventListener('error', () => {
  const t = current();
  if (!t || videoMode || audioEl.dataset.vid !== t.id) return;
  if (audioRetry++ < 1) { // one fresh resolve, then embed
    resolveAudioUrl(t.id).then(url => {
      if (url && audioEl.dataset.vid === t.id && !videoMode) { audioEl.src = url; audioEl.play().catch(() => {}); }
      else useYtEngine(t);
    });
  } else useYtEngine(t);
});
const activeAudio = () => engine === 'audio' && !videoMode;

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
  const t = current();
  if (!t) return;
  if (activeAudio()) {
    if (!audioEl.src || audioEl.dataset.vid !== t.id) { loadTrack(t); return; }
    if (audioEl.paused) audioEl.play().catch(() => {}); else audioEl.pause();
    return;
  }
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
    navigator.mediaSession.setActionHandler('play', () => { if (activeAudio()) audioEl.play().catch(() => {}); else ytReady && yt.playVideo(); });
    navigator.mediaSession.setActionHandler('pause', () => { if (activeAudio()) audioEl.pause(); else ytReady && yt.pauseVideo(); });
    navigator.mediaSession.setActionHandler('nexttrack', next);
    navigator.mediaSession.setActionHandler('previoustrack', prev);
    navigator.mediaSession.setActionHandler('seekto', d => {
      if (d.seekTime == null) return;
      if (activeAudio()) audioEl.currentTime = d.seekTime;
      else if (ytReady) yt.seekTo(d.seekTime, true);
    });
  }
} catch {}

/* ---------- progress clock: poll-based, because onStateChange is unreliable on some embeds ---------- */
let lastCur = -1, endArmed = false;
setInterval(() => {
  if (!current()) return;
  let d = 0, c = 0, paused = true;
  if (activeAudio()) {
    if (!audioEl.src) return;
    d = audioEl.duration || 0; c = audioEl.currentTime || 0; paused = audioEl.paused;
  } else {
    if (!ytReady) return;
    d = yt.getDuration ? (yt.getDuration() || 0) : 0;
    c = yt.getCurrentTime ? (yt.getCurrentTime() || 0) : 0;
    // playing = the clock is moving (embed events are unreliable on some devices)
    paused = !(c > lastCur + 0.05);
    lastCur = c;
  }
  syncPlayUI(paused);
  if (!seeking) {
    if (d > 0) $('seek').value = Math.round((c / d) * 1000);
    $('tCur').textContent = fmt(c); $('tDur').textContent = fmt(d);
  }
  // end-of-track detection without events (audio 'ended' also fires, this is belt+braces)
  if (d > 2 && c >= d - 0.7 && !paused) {
    if (!endArmed) { endArmed = true; setTimeout(() => { endArmed = false; }, 3000); advance(1, true); }
  }
  try {
    if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && d > 0)
      navigator.mediaSession.setPositionState({ duration: d, position: Math.min(c, d), playbackRate: 1 });
  } catch {}
}, 500);
const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

/* ---------- UI: now playing ---------- */
function setIcon(btn, name) { const u = btn.querySelector('use'); if (u) u.setAttribute('href', '#i-' + name); }
function syncPlayUI(paused) {
  setIcon($('mPlay'), paused ? 'play' : 'pause');
  setIcon($('cPlay'), paused ? 'play' : 'pause');
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
  $('pArtist').classList.toggle('link', !!t.ch);
  $('cOpenYT').href = 'https://music.youtube.com/watch?v=' + t.id;
  $('cShuffle').classList.toggle('on', state.shuffle);
  $('cRepeat').classList.toggle('on', state.repeat !== 'off');
  setIcon($('cRepeat'), state.repeat === 'one' ? 'repeat1' : 'repeat');
  updateMediaSession();
  paintRows();
}

function restoreLast() {
  const t = current();
  if (!t) return;
  // restore paused: nothing loads until the user presses play (audio resolves then)
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
let searchTimer = null, searchSeq = 0, searchMode = 'songs';
const input = $('searchInput');
document.querySelectorAll('#segMode .segb').forEach(b => b.addEventListener('click', () => {
  searchMode = b.dataset.mode;
  document.querySelectorAll('#segMode .segb').forEach(x => x.classList.toggle('on', x === b));
  input.placeholder = searchMode === 'artists' ? 'חפש אמן...' : 'שירים, אמנים, או קישור יוטיוב';
  const q = input.value.trim();
  if (q) { clearTimeout(searchTimer); runSearch(q); }
}));
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
  if (searchMode === 'artists') {
    try {
      const chans = await searchChannels(q);
      if (seq !== searchSeq) return;
      hideNetNote();
      $('results').innerHTML = '';
      if (!chans.length) { $('results').innerHTML = '<div class="empty"><p>לא נמצאו אמנים. נסו ניסוח אחר.</p></div>'; return; }
      chans.forEach(c => $('results').appendChild(artistCard(c)));
    } catch (e) {
      if (seq !== searchSeq) return;
      $('results').innerHTML = '<div class="empty"><p>החיפוש לא זמין כרגע.</p><p class="dim">אפשר גם לחפש שיר ולפתוח את האמן משם.</p></div>';
      showNetNote('שירות החיפוש החיצוני לא עונה כרגע.');
    }
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
    if (j && j.title) { t.title = j.title; t.artist = j.uploader || ''; t.dur = j.duration || 0; t.ch = chFromUrl(j.uploaderUrl) || t.ch || ''; save(); paintRows(); paintNow(); }
  } catch {}
}

/* ---------- playlists ---------- */
function switchTab(name) {
  document.querySelectorAll('.tabbtn[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  $('view-search').classList.toggle('on', name === 'search');
  $('view-playlists').classList.toggle('on', name === 'playlists');
  $('view-playlist').classList.remove('on');
  if (name === 'playlists') renderPlaylists();
}
document.querySelectorAll('.tabbtn[data-tab]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

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
  const artEl = $('plArt');
  if (songs.length) artEl.innerHTML = `<img src="${thumb(songs[0].id, 'hq')}" alt="">`;
  else artEl.innerHTML = '<svg><use href="#i-note"/></svg>';
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

/* ---------- song/video toggle ---------- */
let videoMode = false;
document.querySelectorAll('#svToggle .sv').forEach(b => b.addEventListener('click', () => {
  const toVideo = b.dataset.mode === 'video';
  if (toVideo === videoMode) return;
  const t = current();
  let pos = 0, wasPlaying = false;
  if (t) {
    if (videoMode) { // leaving video (yt) -> song (audio)
      pos = ytReady && yt.getCurrentTime ? yt.getCurrentTime() : 0;
      wasPlaying = ytReady && yt.getPlayerState() === YT.PlayerState.PLAYING;
      try { yt.pauseVideo(); } catch {}
    } else { // leaving song (audio) -> video (yt)
      pos = audioEl.src ? (audioEl.currentTime || 0) : 0;
      wasPlaying = !!(audioEl.src && !audioEl.paused);
      try { audioEl.pause(); } catch {}
    }
  }
  videoMode = toVideo;
  document.querySelectorAll('#svToggle .sv').forEach(x => x.classList.toggle('on', x === b));
  document.body.classList.toggle('vid', videoMode);
  $('ytwrap').classList.toggle('vid', videoMode && $('sheet').classList.contains('open'));
  if (t) {
    if (videoMode) {
      useYtEngine(t, pos);
      if (!wasPlaying) setTimeout(() => { try { yt.pauseVideo(); } catch {} }, 1400);
    } else {
      engine = 'audio'; audioEl.dataset.vid = t.id;
      resolveAudioUrl(t.id).then(url => {
        if (audioEl.dataset.vid !== t.id || videoMode) return;
        if (!url) { useYtEngine(t, pos); return; }
        audioEl.src = url;
        try { audioEl.currentTime = pos; } catch {}
        if (wasPlaying) audioEl.play().catch(() => syncPlayUI(true));
      });
    }
  }
}));

/* ---------- sheets ---------- */
function closeSheets() {
  $('sheet').classList.remove('open'); $('addSheet').classList.remove('open'); $('scrim').classList.remove('on');
}
const sheetObserver = new MutationObserver(() => {
  const open = $('sheet').classList.contains('open');
  $('ytwrap').classList.toggle('vid', videoMode && open);
});
sheetObserver.observe($('sheet'), { attributes: true, attributeFilter: ['class'] });
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
$('cBack10').addEventListener('click', () => { if (activeAudio()) audioEl.currentTime = Math.max(0, audioEl.currentTime - 10); else if (ytReady) yt.seekTo(Math.max(0, yt.getCurrentTime() - 10), true); });
$('cFwd10').addEventListener('click', () => { if (activeAudio()) audioEl.currentTime = Math.min(audioEl.duration || 1e9, audioEl.currentTime + 10); else if (ytReady) yt.seekTo(yt.getCurrentTime() + 10, true); });

/* long-press on video = 2x while held (YouTube style) */
(function () {
  const t = $('vidTouch'); let holdTimer = null, ff = false, downAt = 0;
  const start = e => {
    downAt = Date.now();
    holdTimer = setTimeout(() => {
      ff = true; if (ytReady && yt.setPlaybackRate) yt.setPlaybackRate(2);
      $('ffwd').classList.remove('hidden');
    }, 380);
  };
  const end = () => {
    clearTimeout(holdTimer);
    if (ff) { ff = false; if (ytReady && yt.setPlaybackRate) yt.setPlaybackRate(1); $('ffwd').classList.add('hidden'); }
    else if (Date.now() - downAt < 380) togglePlay(); // short tap on the video = play/pause
  };
  t.addEventListener('pointerdown', start);
  t.addEventListener('pointerup', end);
  t.addEventListener('pointercancel', end);
  t.addEventListener('pointerleave', end);
})();
$('cShuffle').addEventListener('click', () => { state.shuffle = !state.shuffle; save(); paintNow(); toast(state.shuffle ? 'נגינה אקראית 🔀' : 'נגינה לפי הסדר'); });
$('cRepeat').addEventListener('click', () => {
  state.repeat = state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off';
  save(); paintNow();
  toast(state.repeat === 'off' ? 'בלי חזרה' : state.repeat === 'all' ? 'חזרה על הרשימה 🔁' : 'חזרה על השיר 🔂');
});
$('cAdd').addEventListener('click', () => { const t = current(); if (t) openAddSheet(t); });
$('vol').addEventListener('input', () => {
  state.volume = +$('vol').value; save();
  audioEl.volume = state.volume / 100;
  if (ytReady && yt.setVolume) yt.setVolume(state.volume);
});
$('vol').value = state.volume;
if (IS_IOS) { const vr = document.querySelector('.volrow'); if (vr) vr.style.display = 'none'; } // iOS web can't set volume
const seekEl = $('seek');
seekEl.addEventListener('input', () => { seeking = true; });
seekEl.addEventListener('change', () => {
  if (activeAudio()) { if (audioEl.duration) audioEl.currentTime = (seekEl.value / 1000) * audioEl.duration; }
  else if (ytReady && yt.getDuration) yt.seekTo((seekEl.value / 1000) * yt.getDuration(), true);
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


/* ---------- artist pages (Apple Music style) ---------- */
let aSongs = [], aSeq = 0;

function fmtSubs(n) {
  if (!n || n <= 0) return '';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M מעוקבים';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K מעוקבים';
  return n + ' מעוקבים';
}

function artistCard(c) {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `
    <img loading="lazy" class="round" src="${c.avatar || ''}" alt="">
    <div class="meta"><div class="t"></div><div class="a"></div></div>
    <svg class="chev"><use href="#i-chev"/></svg>`;
  row.querySelector('.t').textContent = c.name + (c.verified ? ' ✔︎' : '');
  row.querySelector('.a').textContent = fmtSubs(c.subs) || 'אמן';
  row.addEventListener('click', () => openArtist(c.chId, c.name, c.avatar));
  return row;
}

function aSection(title) {
  const sec = document.createElement('section');
  sec.className = 'asec';
  const h = document.createElement('h3'); h.textContent = title;
  const body = document.createElement('div'); body.className = 'asec-body';
  sec.append(h, body);
  return { sec, body };
}

async function openArtist(chId, name, avatar) {
  const seq = ++aSeq;
  $('artistSheet').classList.remove('hidden');
  document.body.classList.add('noscroll');
  $('aName').textContent = name || 'אמן';
  $('aSubs').textContent = '';
  $('aAvatar').src = avatar || '';
  $('aBanner').style.backgroundImage = avatar ? `url("${avatar}")` : '';
  $('aBody').innerHTML = '<div class="empty"><p>טוען...</p></div>';
  $('artistSheet').querySelector('.ascroll').scrollTop = 0;

  let channel = null, songs = [], albums = [], videos = [];
  try { channel = await pipedFetch('/channel/' + chId, 8000); } catch {}
  if (seq !== aSeq) return;
  if (channel && !channel.error) {
    if (channel.name) $('aName').textContent = channel.name;
    if (channel.avatarUrl) $('aAvatar').src = channel.avatarUrl;
    const bn = channel.bannerUrl || channel.avatarUrl;
    if (bn) $('aBanner').style.backgroundImage = `url("${bn}")`;
    $('aSubs').textContent = fmtSubs(channel.subscriberCount);
    songs = (channel.relatedStreams || [])
      .filter(s => s.url && s.type === 'stream')
      .map(mapStream).filter(t => t.id).slice(0, 10);
  }
  const jobs = [];
  jobs.push((async () => {
    if (songs.length) return;
    try { songs = (await searchMusic(name)).slice(0, 10); } catch {}
  })());
  jobs.push((async () => {
    if (channel && Array.isArray(channel.tabs)) {
      const rel = channel.tabs.find(t => /releases/i.test(t.name || ''));
      if (rel && rel.data) {
        try {
          const j = await pipedFetch('/channels/tabs?data=' + encodeURIComponent(rel.data) + '&id=' + chId, 8000);
          const list = Array.isArray(j) ? j : (j.content || []);
          albums = list.filter(x => x.type === 'playlist' && x.url).map(mapAlbum).filter(a => a.plId);
          if (albums.length) return;
        } catch {}
      }
    }
    try {
      const j = await pipedFetch('/search?q=' + encodeURIComponent(name) + '&filter=music_albums', 8000);
      albums = (j.items || []).filter(x => x.type === 'playlist' && x.url).map(mapAlbum).filter(a => a.plId);
    } catch {}
  })());
  jobs.push((async () => {
    try {
      const j = await pipedFetch('/search?q=' + encodeURIComponent(name) + '&filter=music_videos', 8000);
      videos = (j.items || []).filter(x => x.type === 'stream' && x.url).map(mapStream).filter(t => t.id).slice(0, 10);
    } catch {}
  })());
  await Promise.allSettled(jobs);
  if (seq !== aSeq) return;
  renderArtistBody(songs, albums, videos);
}

function mapAlbum(x) {
  const m = String(x.url || '').match(/list=([A-Za-z0-9_-]+)/);
  return {
    plId: m ? m[1] : '',
    title: x.name || x.title || '',
    thumb: x.thumbnail || '',
    sub: x.videos > 0 ? x.videos + ' שירים' : (x.uploaderName || ''),
  };
}

function renderArtistBody(songs, albums, videos) {
  const box = $('aBody'); box.innerHTML = '';
  aSongs = songs;
  if (songs.length) {
    const { sec, body } = aSection('שירים מובילים');
    body.classList.add('list');
    songs.forEach((t, i) => body.appendChild(trackRow(t, { onPlay: () => playQueue(songs, i), onAdd: true })));
    box.appendChild(sec);
  }
  if (albums.length) {
    const { sec, body } = aSection('אלבומים');
    body.classList.add('hscroll');
    albums.slice(0, 12).forEach(a => body.appendChild(albumCard(a)));
    box.appendChild(sec);
  }
  if (videos.length) {
    const { sec, body } = aSection('קליפים');
    body.classList.add('hscroll');
    videos.forEach(v => body.appendChild(videoCard(v)));
    box.appendChild(sec);
  }
  if (!songs.length && !albums.length && !videos.length)
    box.innerHTML = '<div class="empty"><p>לא נמצא תוכן לאמן הזה כרגע.</p></div>';
}

function albumCard(a) {
  const el = document.createElement('div');
  el.className = 'card sq';
  el.innerHTML = `<img loading="lazy" src="${a.thumb}" alt=""><div class="ct"></div><div class="cs dim"></div>`;
  el.querySelector('.ct').textContent = a.title;
  el.querySelector('.cs').textContent = a.sub;
  el.addEventListener('click', () => playAlbum(a));
  return el;
}

function videoCard(v) {
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML = `<img loading="lazy" src="${thumb(v.id)}" alt=""><div class="ct"></div><div class="cs dim"></div>`;
  el.querySelector('.ct').textContent = v.title;
  el.querySelector('.cs').textContent = v.dur ? fmt(v.dur) : '';
  el.addEventListener('click', () => {
    playQueue([v], 0);
    // straight into video mode, like tapping a clip in YouTube Music
    videoMode = true;
    document.querySelectorAll('#svToggle .sv').forEach(x => x.classList.toggle('on', x.dataset.mode === 'video'));
    document.body.classList.add('vid'); $('ytwrap').classList.add('vid');
    $('sheet').classList.add('open'); $('scrim').classList.add('on');
  });
  return el;
}

async function playAlbum(a) {
  toast('טוען את האלבום...');
  try {
    const j = await pipedFetch('/playlists/' + a.plId, 9000);
    const tracks = (j.relatedStreams || []).filter(s => s.url && s.type === 'stream').map(mapStream).filter(t => t.id);
    if (!tracks.length) throw new Error('empty');
    playQueue(tracks, 0);
    toast(`מנגן את "${a.title}" 🎵`);
  } catch { toast('לא הצלחתי לטעון את האלבום כרגע'); }
}

$('aClose').addEventListener('click', () => { ++aSeq; $('artistSheet').classList.add('hidden'); document.body.classList.remove('noscroll'); });
$('aPlay').addEventListener('click', () => { if (aSongs.length) playQueue(aSongs, 0); else toast('אין שירים לנגן עדיין'); });
$('aShuffle').addEventListener('click', () => {
  if (!aSongs.length) return toast('אין שירים לנגן עדיין');
  state.shuffle = true; playQueue(aSongs, Math.floor(Math.random() * aSongs.length)); toast('מנגן אקראי 🔀');
});
$('pArtist').addEventListener('click', () => { const t = current(); if (t && t.ch) openArtist(t.ch, t.artist, ''); });
