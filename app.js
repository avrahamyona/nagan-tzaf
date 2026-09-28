'use strict';
/* ============ מוזיקה — Apple Music clone (v11) ============
   Static PWA. Playback: official YouTube IFrame embed (hidden) + ad-free direct
   audio via public Piped instances when available. Content: YouTube via Piped.
   All data lives in localStorage on the device. */

const $ = id => document.getElementById(id);
const IS_IOS = /iPhone|iPod|iPad/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/* ---------- Piped (with failover) ---------- */
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
async function searchPlaylists(q, filter = 'music_albums') {
  const j = await pipedFetch('/search?q=' + encodeURIComponent(q) + '&filter=' + filter, 8000);
  return (j.items || []).filter(x => x.type === 'playlist' && x.url).map(mapAlbum).filter(a => a.plId);
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
function vidFromUrl(s) {
  if (!s) return '';
  const m = String(s).match(/(?:v=|youtu\.be\/|shorts\/|\/watch\/|embed\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{11}$/.test(s.trim()) ? s.trim() : '';
}
const thumb = (id, q) => `https://i.ytimg.com/vi/${id}/${q || 'mq'}default.jpg`;
const sqThumb = (id, q) => `https://i.ytimg.com/vi/${id}/${q || 'hq'}default.jpg`;
const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const fmtRem = (c, d) => '-' + fmt(Math.max(0, (d || 0) - (c || 0)));

/* ---------- state ---------- */
const LS_KEY = 'nagan_state_v2';
let state = {
  playlists: { 'שירים אהובים': [] },
  queue: [], qi: 0,
  shuffle: false, repeat: 'off',
  volume: 90,
  fav: {},            // videoId -> true
  favArtists: {},     // chId -> {name, avatar}
  albums: {},         // plId -> {plId,title,thumb,sub}
  history: [],        // recent tracks, newest first (max 40)
  station: null,      // {seed, name} when radio autoplay is on
  resume: null,       // {pos, playing, vid} last known playback point
};
try {
  const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
  if (saved) state = Object.assign(state, saved);
  // migrate v1
  const old = JSON.parse(localStorage.getItem('nagan_state_v1') || 'null');
  if (old && old.playlists && !saved) { state.playlists = old.playlists; state.queue = old.queue || []; state.qi = old.qi || 0; }
} catch {}
function save() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      playlists: state.playlists, queue: state.queue, qi: state.qi,
      shuffle: state.shuffle, repeat: state.repeat, volume: state.volume,
      fav: state.fav, favArtists: state.favArtists, albums: state.albums,
      history: state.history.slice(0, 40), resume: state.resume,
    }));
  } catch {}
}
function pushHistory(t) {
  if (!t || !t.id) return;
  state.history = state.history.filter(x => x.id !== t.id);
  state.history.unshift({ id: t.id, title: t.title, artist: t.artist, dur: t.dur, ch: t.ch });
  if (state.history.length > 40) state.history.length = 40;
}
const favList = () => state.playlists['שירים אהובים'] || (state.playlists['שירים אהובים'] = []);

/* ---------- YouTube embed engine ---------- */
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

/* ---------- audio engine: ad-free direct streams, embed fallback ---------- */
const audioEl = document.createElement('audio');
audioEl.preload = 'none';
const clipEl = $('clipEl');
let userPaused = false;
let playGen = 0;
function armAutoResume(el) {
  const tryResume = g => {
    if (playGen !== g || userPaused) return;
    if (el !== M() || !el.paused || el.ended) return;
    el.play().catch(() => {
      // iOS sometimes kills the media pipeline on interruption: reload and retry from the same spot.
      if (playGen !== g || userPaused || el !== M()) return;
      const pos = el.currentTime || 0;
      try { el.load(); } catch {}
      const h = () => {
        el.removeEventListener('canplay', h);
        if (playGen !== g || userPaused || el !== M()) return;
        try { el.currentTime = pos; } catch {}
        el.play().catch(() => {});
      };
      el.addEventListener('canplay', h);
    });
  };
  el.addEventListener('pause', () => {
    if (userPaused || el.ended) return;
    if (!(engine === 'audio' || engine === 'clip')) return;
    if (el !== M()) return;
    const g = playGen;
    [500, 1500, 3000, 6000, 12000, 25000].forEach(ms => setTimeout(() => tryResume(g), ms));
  });
  el.addEventListener('play', () => { userPaused = false; });
  // If the retries all failed (iOS blocked gesture-less play), catch the next
  // opportunity: app returns to foreground / window focus.
  const onForeground = () => {
    if (userPaused || !(engine === 'audio' || engine === 'clip')) return;
    if (el !== M() || !el.paused || el.ended || !el.src) return;
    el.play().catch(() => {});
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) onForeground(); });
  window.addEventListener('focus', onForeground);
  window.addEventListener('pageshow', onForeground);
}
const M = () => (engine === 'clip') ? clipEl : audioEl;
let engine = 'yt'; // 'audio' | 'yt' | 'yt-pending'
let audioRetry = 0;
const APP_VERSION = 'v24b';
function showStreamDiag() {
  const d = window._streamDiag;
  toast(d ? ('אבחון: ' + d) : 'אין נתוני אבחון עדיין', 6000);
}
function paintEngineBadge() {
  const b = document.getElementById('engineBadge');
  if (!b) return;
  if (!b.__wired) { b.__wired = true; b.style.cursor = 'pointer'; b.addEventListener('click', showStreamDiag); }
  const map = { audio: ['שמע ישיר', '#34c759'], clip: ['קליפ ישיר', '#34c759'], yt: ['יוטיוב', '#ff3b30'], 'yt-pending': ['מתחבר...', '#ff9500'] };
  const m = map[engine] || ['', ''];
  b.innerHTML = m[0] ? '<span class="edot" style="background:' + m[1] + '"></span>' + m[0] + ' · ' + APP_VERSION : '';
}
const STREAM_API_DEFAULT = 'https://avi-music-audio.avi-music.workers.dev';
const STREAM_API = new URLSearchParams(location.search).get('streamapi') || localStorage.getItem('nagan_stream_api') || STREAM_API_DEFAULT;

function pickAudio(j) {
  const as = ((j && j.audioStreams) || []).filter(a => a.url);
  if (!as.length) throw new Error('no audio streams');
  const mp4 = as.filter(a => /audio\/mp4/.test(a.mimeType || ''));
  return (mp4.length ? mp4 : as).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0].url;
}
async function resolveAudioUrl(vid) {
  if (STREAM_API) {
    const base = STREAM_API.replace(/\/$/, '');
    // Fast path: worker proxies audio bytes directly. Extraction can be flaky
    // per edge location, so probe twice before giving up.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(base + '/audio/' + vid, { headers: { Range: 'bytes=0-0' } });
        if (r.ok || r.status === 206) return base + '/audio/' + vid;
        window._streamDiag = 'probe' + (attempt + 1) + ': HTTP ' + r.status;
      } catch (e) {
        window._streamDiag = 'probe' + (attempt + 1) + ': ' + (e.name === 'AbortError' ? 'timeout' : 'network-ERR');
      }
      if (!attempt) await new Promise(r => setTimeout(r, 1500));
    }
  }
  try {
    const u = await Promise.any(PIPED_HOSTS.map(base => (async () => {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 9000);
      try {
        const r = await fetch(base + '/streams/' + vid, { signal: ctl.signal });
        clearTimeout(to);
        if (!r.ok) throw new Error('http ' + r.status);
        return pickAudio(await r.json());
      } finally { clearTimeout(to); }
    })()));
    return u;
  } catch { window._streamDiag = (window._streamDiag || '') + ' piped:fail'; }
  return null;
}
(function primeAudioUnlock() {
  const unlock = () => {
    try { const p = audioEl.play(); if (p && p.then) p.then(() => audioEl.pause()).catch(() => {}); } catch {}
    document.removeEventListener('pointerdown', unlock, true);
  };
  document.addEventListener('pointerdown', unlock, true);
})();

let ytRetryTimer = null;
function scheduleAudioRetry(t) {
  clearTimeout(ytRetryTimer);
  ytRetryTimer = setTimeout(() => {
    if (videoMode || engine !== 'yt' || !current() || current().id !== t.id) return;
    resolveAudioUrl(t.id).then(url => {
      if (videoMode || engine !== 'yt' || !current() || current().id !== t.id) return;
      if (!url) { scheduleAudioRetry(t); return; }
      const pos = ytReady && yt.getCurrentTime ? yt.getCurrentTime() : 0;
      const playing = ytReady && yt.getPlayerState() === YT.PlayerState.PLAYING;
      try { yt.pauseVideo(); } catch {}
      engine = 'audio'; playGen++; paintEngineBadge();
      audioEl.dataset.vid = t.id;
      audioEl.src = url;
      try { audioEl.currentTime = pos; } catch {}
      if (playing) audioEl.play().catch(() => {}); else syncPlayUI(true);
    });
  }, 45000);
}
function useYtEngine(t, startAt) {
  engine = 'yt'; paintEngineBadge(); playGen++;
  try { clipEl.pause(); clipEl.removeAttribute('src'); clipEl.load(); clipEl.style.display = 'none'; $('ytplayer').style.display = ''; } catch {}
  try { audioEl.pause(); audioEl.removeAttribute('src'); audioEl.load(); } catch {}
  lastCur = -1;
  if (ytReady) yt.loadVideoById(startAt ? { videoId: t.id, startSeconds: startAt } : t.id);
  else pendingLoad = t.id;
}
function useClipEngine(t, startAt, autoplay) {
  clearTimeout(ytRetryTimer);
  engine = 'clip'; paintEngineBadge(); playGen++;
  try { audioEl.pause(); audioEl.removeAttribute('src'); audioEl.load(); } catch {}
  try { yt.pauseVideo(); } catch {}
  clipEl.dataset.vid = t.id;
  clipEl.style.display = 'block';
  $('ytplayer').style.display = 'none';
  resolveAudioUrl(t.id).then(url => {
    if (clipEl.dataset.vid !== t.id || !videoMode) return;
    if (!url) { useYtEngine(t, startAt); return; }
    clipEl.src = url;
    if (startAt) { try { clipEl.currentTime = startAt; } catch {} }
    if (autoplay !== false) clipEl.play().catch(() => syncPlayUI(true));
  });
}

function loadTrack(t, opts = {}) {
  if (!t) return;
  clearTimeout(ytRetryTimer);
  window._streamDiag = '';
  lastCur = -1;
  if (videoMode) { useClipEngine(t, opts.startAt, true); return; }
  engine = 'audio'; paintEngineBadge(); playGen++;
  audioEl.dataset.vid = t.id;
  audioRetry = 0;
  const hasGesture = !!(navigator.userActivation && navigator.userActivation.isActive);
  if (hasGesture && ytReady) {
    engine = 'yt-pending'; paintEngineBadge();
    yt.loadVideoById(opts.startAt ? { videoId: t.id, startSeconds: opts.startAt } : t.id);
  }
  resolveAudioUrl(t.id).then(url => {
    if (audioEl.dataset.vid !== t.id || videoMode) return;
    if (!url) {
      if (engine === 'yt-pending') { engine = 'yt'; paintEngineBadge(); }
      else useYtEngine(t, opts.startAt);
      scheduleAudioRetry(t);
      return;
    }
    try { yt.pauseVideo(); } catch {}
    const wasPlaying = engine === 'yt-pending' && ytReady && yt.getPlayerState() === YT.PlayerState.PLAYING;
    engine = 'audio'; paintEngineBadge();
    audioEl.src = url;
    if (opts.startAt) { try { audioEl.currentTime = opts.startAt; } catch {} }
    if (wasPlaying || hasGesture || opts.autoplay) audioEl.play().catch(() => { useYtEngine(t, opts.startAt); });
    else syncPlayUI(true);
  });
}
clipEl.addEventListener('ended', () => advance(1, true));
clipEl.addEventListener('play', () => syncPlayUI(false));
clipEl.addEventListener('pause', () => syncPlayUI(true));
clipEl.addEventListener('error', () => {
  const t = current();
  if (!t || !videoMode || clipEl.dataset.vid !== t.id) return;
  useYtEngine(t, clipEl.currentTime || 0);
});
audioEl.addEventListener('ended', () => advance(1, true));
armAutoResume(audioEl);
armAutoResume(clipEl);
audioEl.addEventListener('play', () => syncPlayUI(false));
audioEl.addEventListener('pause', () => syncPlayUI(true));
audioEl.addEventListener('error', () => {
  if (audioEl.error) window._streamDiag = (window._streamDiag || '') + ' elerr:' + audioEl.error.code;
  const t = current();
  if (!t || videoMode || audioEl.dataset.vid !== t.id) return;
  if (audioRetry++ < 1) {
    resolveAudioUrl(t.id).then(url => {
      if (url && audioEl.dataset.vid === t.id && !videoMode) { audioEl.src = url; audioEl.play().catch(() => {}); }
      else useYtEngine(t);
    });
  } else useYtEngine(t);
});
const activeAudio = () => (engine === 'audio' && !videoMode) || engine === 'clip';

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

function playQueue(tracks, idx, opts = {}) {
  state.queue = tracks.slice(); state.qi = idx || 0;
  state.station = opts.station || null;
  const t = current();
  if (!t) return;
  pushHistory(t);
  loadTrack(t);
  paintNow(); save();
}
async function stationRefill() {
  const st = state.station;
  if (!st) return false;
  const seed = current();
  try {
    const j = await pipedFetch('/streams/' + (seed ? seed.id : st.seed), 8000);
    const rel = (j.relatedStreams || []).filter(s => s.url && s.type === 'stream')
      .map(mapStream).filter(t => t.id && !state.queue.some(q => q.id === t.id));
    if (!rel.length) return false;
    state.queue = state.queue.concat(rel.slice(0, 12));
    save();
    return true;
  } catch { return false; }
}
async function advance(dir, auto) {
  if (!state.queue.length) return;
  if (auto && state.repeat === 'one') { loadTrack(current()); return; }
  let n = state.qi;
  if (state.shuffle && state.queue.length > 2) {
    do { n = Math.floor(Math.random() * state.queue.length); } while (n === state.qi);
  } else {
    n = state.qi + dir;
    if (n >= state.queue.length) {
      if (state.station) {
        const ok = await stationRefill();
        if (ok) { n = state.qi; } // stay on last index; refill appended, +1 below
        n = state.qi + dir;
        if (n >= state.queue.length) { syncPlayUI(true); return; }
      } else if (state.repeat === 'all' || !auto) n = 0;
      else { syncPlayUI(true); return; }
    }
    if (n < 0) n = state.queue.length - 1;
  }
  state.qi = n;
  const t = current();
  if (t) pushHistory(t);
  loadTrack(t); paintNow(); save();
}
const next = () => advance(1, false);
const prev = () => {
  if (ytReady && yt.getCurrentTime && yt.getCurrentTime() > 4) { yt.seekTo(0, true); return; }
  if (activeAudio() && M().currentTime > 4) { M().currentTime = 0; return; }
  advance(-1, false);
};
function togglePlay() {
  const t = current();
  if (!t) return;
  if (activeAudio()) {
    if (!M().src || M().dataset.vid !== t.id) { loadTrack(t, { startAt: takeRestorePos() }); return; }
    if (M().paused) { userPaused = false; M().play().catch(() => {}); } else { userPaused = true; M().pause(); }
    return;
  }
  if (!ytReady) return;
  const rp = takeRestorePos();
  if (rp && yt.getDuration && !yt.getCurrentTime()) { yt.loadVideoById({ videoId: t.id, startSeconds: rp }); return; }
  const st = yt.getPlayerState();
  if (st === YT.PlayerState.PLAYING) yt.pauseVideo(); else yt.playVideo();
}

/* ---------- media session ---------- */
const artCache = {}; // vid -> Promise<artwork[]|null>
function squareArtwork(vid) {
  if (artCache[vid]) return artCache[vid];
  artCache[vid] = (async () => {
    for (const q of ['maxres', 'sd', 'hq']) {
      try {
        const img = await new Promise((res, rej) => {
          const i = new Image();
          i.crossOrigin = 'anonymous';
          i.onload = () => res(i);
          i.onerror = rej;
          i.src = thumb(vid, q);
        });
        const w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) continue;
        if (q === 'maxres' && w < 400) continue; // placeholder image, try next
        const s = Math.min(w, h);
        const c = document.createElement('canvas');
        c.width = c.height = 512;
        c.getContext('2d').drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, 512, 512);
        const d512 = c.toDataURL('image/jpeg', 0.88);
        c.width = c.height = 256;
        c.getContext('2d').drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, 256, 256);
        const d256 = c.toDataURL('image/jpeg', 0.85);
        return [
          { src: d512, sizes: '512x512', type: 'image/jpeg' },
          { src: d256, sizes: '256x256', type: 'image/jpeg' },
        ];
      } catch {}
    }
    return null;
  })();
  return artCache[vid];
}
function updateMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const t = current();
  if (!t) return;
  const setMeta = artwork => {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title, artist: t.artist, album: 'Avi Music', artwork,
      });
    } catch {}
  };
  // Instant metadata with the plain thumbs; upgraded to full-bleed square
  // artwork as soon as the cropped version is ready (iOS lock screen takes it).
  setMeta([
    { src: thumb(t.id, 'mq'), sizes: '320x180', type: 'image/jpeg' },
    { src: thumb(t.id, 'hq'), sizes: '480x360', type: 'image/jpeg' },
  ]);
  squareArtwork(t.id).then(art => {
    if (art && current() && current().id === t.id) setMeta(art);
  });
}
try {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => { userPaused = false; if (activeAudio()) M().play().catch(() => {}); else ytReady && yt.playVideo(); });
    navigator.mediaSession.setActionHandler('pause', () => { userPaused = true; if (activeAudio()) M().pause(); else ytReady && yt.pauseVideo(); });
    navigator.mediaSession.setActionHandler('nexttrack', next);
    navigator.mediaSession.setActionHandler('previoustrack', prev);
    navigator.mediaSession.setActionHandler('seekto', d => {
      if (d.seekTime == null) return;
      if (activeAudio()) M().currentTime = d.seekTime;
      else if (ytReady) yt.seekTo(d.seekTime, true);
    });
  }
} catch {}

/* ---------- progress clock ---------- */
let lastCur = -1, endArmed = false;
setInterval(() => {
  if (!current()) return;
  let d = 0, c = 0, paused = true;
  if (activeAudio()) {
    if (!M().src) return;
    d = M().duration || 0; c = M().currentTime || 0; paused = M().paused;
  } else {
    if (!ytReady) return;
    d = yt.getDuration ? (yt.getDuration() || 0) : 0;
    c = yt.getCurrentTime ? (yt.getCurrentTime() || 0) : 0;
    paused = !(c > lastCur + 0.05);
    lastCur = c;
  }
  syncPlayUI(paused);
  if (!seeking) {
    if (d > 0) $('seek').value = Math.round((c / d) * 1000);
    $('tCur').textContent = fmt(c);
    $('tRem').textContent = d > 0 ? fmtRem(c, d) : '-0:00';
  }
  if (d > 2 && c >= d - 0.7 && !paused) {
    if (!endArmed) { endArmed = true; setTimeout(() => { endArmed = false; }, 3000); advance(1, true); }
  }
  try {
    if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && d > 0)
      navigator.mediaSession.setPositionState({ duration: d, position: Math.min(c, d), playbackRate: 1 });
  } catch {}
}, 500);

/* ---------- now-playing UI ---------- */
function setIcon(btn, name) { const u = btn && btn.querySelector('use'); if (u) u.setAttribute('href', '#i-' + name); }
function syncPlayUI(paused) {
  setIcon($('mPlay'), paused ? 'play' : 'pause');
  setIcon($('cPlay'), paused ? 'play' : 'pause');
  try { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = paused ? 'paused' : 'playing'; } catch {}
  paintPlayingRows();
}
function tintPlayer(img) {
  // extract dominant color from the artwork for the full-screen wash
  try {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 24;
    const cx = cv.getContext('2d');
    cx.drawImage(img, 0, 0, 24, 24);
    const d = cx.getImageData(0, 0, 24, 24).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 16) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
    const mix = (c, t, w) => Math.round(c * w + t * (1 - w));
    const r1 = mix(r, 244, .5), g1 = mix(g, 244, .5), b1 = mix(b, 246, .5);
    document.documentElement.style.setProperty('--np-bg1', `rgb(${r1},${g1},${b1})`);
    document.documentElement.style.setProperty('--np-bg2', `rgb(${mix(r, 255, .25)},${mix(g, 255, .25)},${mix(b, 255, .25)})`);
  } catch {}
}
function paintNow() {
  const t = current();
  if (!t) { $('mini').classList.add('hidden'); return; }
  $('mini').classList.remove('hidden');
  $('mArt').src = thumb(t.id);
  $('mTitle').textContent = t.title; $('mArtist').textContent = t.artist;
  const art = $('pArt');
  art.crossOrigin = 'anonymous';
  art.onload = () => tintPlayer(art);
  art.src = sqThumb(t.id, 'maxres');
  art.onerror = () => { art.onerror = null; art.src = thumb(t.id, 'hq'); };
  $('pTitle').textContent = t.title; $('pArtist').textContent = t.artist;
  $('pArtist').classList.toggle('link', !!t.ch);
  $('cOpenYT').href = 'https://music.youtube.com/watch?v=' + t.id;
  $('cShuffle').classList.toggle('on', state.shuffle);
  $('cRepeat').classList.toggle('on', state.repeat !== 'off');
  setIcon($('cRepeat'), state.repeat === 'one' ? 'repeat1' : 'repeat');
  setIcon($('pFav'), state.fav[t.id] ? 'star-fill' : 'star');
  $('pFav').classList.toggle('on', !!state.fav[t.id]);
  updateMediaSession();
  paintPlayingRows();
}
function restoreLast() {
  const t = current();
  if (!t) return;
  paintNow(); syncPlayUI(true);
}

/* ---------- rows ---------- */
function trackRow(t, opts = {}) {
  const row = document.createElement('div');
  row.className = 'row' + (current() && current().id === t.id ? ' playing' : '');
  row.dataset.vid = t.id;
  row.innerHTML = `
    ${opts.num != null ? `<span class="num">${opts.num}</span>` : ''}
    ${opts.noArt ? '' : `<img loading="lazy" src="${thumb(t.id)}" alt="">`}
    <div class="meta"><div class="t"></div><div class="a"></div></div>
    ${t.dur ? `<span class="dur">${fmt(t.dur)}</span>` : ''}
    <button class="dots" aria-label="אפשרויות"><svg><use href="#i-dots"/></svg></button>`;
  row.querySelector('.t').textContent = t.title;
  row.querySelector('.a').textContent = opts.sub || t.artist;
  row.addEventListener('click', () => opts.onPlay && opts.onPlay());
  row.querySelector('.dots').addEventListener('click', e => { e.stopPropagation(); openSongSheet(t, opts.sheet || {}); });
  return row;
}
function paintPlayingRows() {
  const cur = current();
  document.querySelectorAll('.row').forEach(r => {
    r.classList.toggle('playing', !!(cur && r.dataset.vid === cur.id));
  });
}
function artistHit(c) {
  const row = document.createElement('div');
  row.className = 'artisthit';
  row.innerHTML = `<img loading="lazy" src="${c.avatar || ''}" alt=""><div class="meta"><div class="t"></div><div class="a"></div></div><svg class="chev"><use href="#i-chev-fwd"/></svg>`;
  row.querySelector('.t').textContent = c.name.replace(/ - Topic$/i, '') + (c.verified ? ' ✔︎' : '');
  row.querySelector('.a').textContent = 'אמן';
  row.addEventListener('click', () => openArtist(c.chId, c.name, c.avatar));
  return row;
}

/* ---------- sheets ---------- */
const openSheet = id => { $(id).classList.remove('hidden'); requestAnimationFrame(() => $(id).classList.add('open')); $('scrim').classList.add('on'); };
const closeSheet = id => { $(id).classList.remove('open'); setTimeout(() => $(id).classList.add('hidden'), 240); if (!document.querySelector('.sheetbox.open')) $('scrim').classList.remove('on'); };
const closeAllSheets = () => document.querySelectorAll('.sheetbox').forEach(s => closeSheet(s.id));
$('scrim').addEventListener('click', closeAllSheets);
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => {
  const t = b.dataset.close;
  if (t.startsWith('page-')) closePage(t); else closeSheet(t);
}));

let sheetTrack = null, sheetOpts = {};
function openSongSheet(t, opts = {}) {
  sheetTrack = t; sheetOpts = opts;
  $('songSheetHead').innerHTML = `<img src="${thumb(t.id)}" alt=""><div class="meta"><div class="t"></div><div class="a dim"></div></div>`;
  $('songSheetHead').querySelector('.t').textContent = t.title;
  $('songSheetHead').querySelector('.a').textContent = t.artist;
  setIcon($('ssFav'), state.fav[t.id] ? 'star-fill' : 'star');
  $('ssFav').querySelector('span').textContent = state.fav[t.id] ? 'הסר מהמועדפים' : 'הוסף למועדפים';
  $('ssArtist').classList.toggle('hidden', !t.ch);
  $('ssRemove').classList.toggle('hidden', !opts.onRemove);
  openSheet('songSheet');
}
function toggleFav(t) {
  if (state.fav[t.id]) {
    delete state.fav[t.id];
    const i = favList().findIndex(x => x.id === t.id);
    if (i >= 0) favList().splice(i, 1);
    toast('הוסר מהמועדפים');
  } else {
    state.fav[t.id] = 1;
    if (!favList().some(x => x.id === t.id)) favList().unshift(t);
    toast('נוסף למועדפים ★');
  }
  save(); paintNow(); renderLibrary();
}
$('ssFav').addEventListener('click', () => { if (sheetTrack) toggleFav(sheetTrack); closeSheet('songSheet'); });
$('ssAdd').addEventListener('click', () => { closeSheet('songSheet'); if (sheetTrack) openAddSheet(sheetTrack); });
$('ssArtist').addEventListener('click', () => { closeSheet('songSheet'); if (sheetTrack && sheetTrack.ch) openArtist(sheetTrack.ch, sheetTrack.artist, ''); });
$('ssRemove').addEventListener('click', () => { closeSheet('songSheet'); if (sheetOpts.onRemove) sheetOpts.onRemove(); });

let addTarget = null;
function openAddSheet(t) {
  addTarget = t;
  const box = $('addList'); box.innerHTML = '';
  Object.keys(state.playlists).forEach(name => {
    const row = document.createElement('button');
    row.className = 'sheetrow';
    row.innerHTML = `<svg><use href="#i-note"/></svg><span></span>`;
    row.querySelector('span').textContent = name;
    row.addEventListener('click', () => {
      const exists = (state.playlists[name] || []).some(x => x.id === t.id);
      if (exists) toast('השיר כבר ברשימה הזאת');
      else { state.playlists[name].push(t); save(); toast(`נוסף ל"${name}" ✔`); }
      closeAllSheets();
    });
    box.appendChild(row);
  });
  openSheet('addSheet');
}
$('addNew').addEventListener('click', () => {
  const name = (prompt('שם הרשימה:') || '').trim();
  if (!name) return;
  if (!state.playlists[name]) state.playlists[name] = [];
  state.playlists[name].push(addTarget);
  save(); closeAllSheets(); toast(`נוסף ל"${name}" ✔`);
});

/* queue sheet */
$('cQueue').addEventListener('click', () => {
  const box = $('queueList'); box.innerHTML = '';
  const up = state.queue.slice(state.qi);
  if (!up.length) { box.innerHTML = '<div class="empty"><p>התור ריק</p></div>'; }
  up.forEach((t, i) => box.appendChild(trackRow(t, {
    onPlay: () => { state.qi = state.qi + i; pushHistory(t); loadTrack(t); paintNow(); save(); closeSheet('queueSheet'); },
  })));
  openSheet('queueSheet');
});

/* ---------- player open/close ---------- */
const openPlayer = () => { $('player').classList.remove('hidden'); };
const closePlayer = () => { $('player').classList.add('hidden'); };
$('pDown').addEventListener('click', closePlayer);
(function playerDrag() {
  const p = $('player');
  let startY = null, dy = 0, dragging = false, pid = null;
  p.addEventListener('pointerdown', e => {
    if (p.classList.contains('hidden')) return;
    if (e.target.closest('button, input, a, video, .volrow, #ytwrap')) return;
    startY = e.clientY; dy = 0; dragging = true; pid = e.pointerId;
    p.style.transition = 'none';
    try { p.setPointerCapture(pid); } catch {}
  });
  p.addEventListener('pointermove', e => {
    if (!dragging || e.pointerId !== pid) return;
    dy = Math.max(0, e.clientY - startY);
    p.style.transform = 'translateY(' + dy + 'px)';
  });
  const end = e => {
    if (!dragging || (e && e.pointerId !== pid)) return;
    dragging = false;
    p.style.transition = '';
    p.style.transform = '';
    if (dy > 120) closePlayer();
    startY = null; dy = 0; pid = null;
  };
  p.addEventListener('pointerup', end);
  p.addEventListener('pointercancel', end);
})();
$('mini').addEventListener('click', e => { if (!e.target.closest('.mbtn')) openPlayer(); });

/* ---------- player controls ---------- */
$('mPlay').addEventListener('click', togglePlay);
$('cPlay').addEventListener('click', togglePlay);
$('mNext').addEventListener('click', next);
$('cNext').addEventListener('click', next);
$('cPrev').addEventListener('click', prev);
$('pFav').addEventListener('click', () => { const t = current(); if (t) toggleFav(t); });
$('pDots').addEventListener('click', () => { const t = current(); if (t) openSongSheet(t); });
$('pArtist').addEventListener('click', () => { const t = current(); if (t && t.ch) openArtist(t.ch, t.artist, ''); });
// tap = +/-10s; long-press = 2x scrub (forward) / stepped rewind (back), restore on release
function scrubHold(btn, dir) {
  let mode = null, pressTimer = null, rewTimer = null, longFired = false;
  const release = () => {
    clearTimeout(pressTimer); pressTimer = null;
    if (mode === 'audio2x') { try { M().playbackRate = 1; } catch {} }
    else if (mode === 'yt2x') { try { yt.setPlaybackRate(1); } catch {} }
    else if (mode === 'rew') { clearInterval(rewTimer); rewTimer = null; }
    mode = null;
  };
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    longFired = false;
    pressTimer = setTimeout(() => {
      longFired = true;
      if (dir > 0) {
        if (activeAudio()) { mode = 'audio2x'; try { M().playbackRate = 2; } catch {} }
        else if (ytReady) { mode = 'yt2x'; try { yt.setPlaybackRate(2); } catch {} }
      } else {
        mode = 'rew';
        rewTimer = setInterval(() => {
          if (activeAudio()) M().currentTime = Math.max(0, M().currentTime - 0.35);
          else if (ytReady) yt.seekTo(Math.max(0, yt.getCurrentTime() - 0.35), true);
        }, 100);
      }
    }, 280);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => btn.addEventListener(ev, release));
  btn.addEventListener('click', e => {
    if (longFired) { longFired = false; e.stopImmediatePropagation(); e.preventDefault(); return; }
    if (dir > 0) { if (activeAudio()) M().currentTime = Math.min(M().duration || 1e9, M().currentTime + 10); else if (ytReady) yt.seekTo(yt.getCurrentTime() + 10, true); }
    else { if (activeAudio()) M().currentTime = Math.max(0, M().currentTime - 10); else if (ytReady) yt.seekTo(Math.max(0, yt.getCurrentTime() - 10), true); }
  });
}
scrubHold($('cBack10'), -1);
scrubHold($('cFwd10'), 1);
(function () {
  const t = $('vidTouch'); let holdTimer = null, ff = false, downAt = 0;
  const start = () => {
    downAt = Date.now();
    holdTimer = setTimeout(() => { ff = true; if (ytReady && yt.setPlaybackRate) yt.setPlaybackRate(2); $('ffwd').classList.remove('hidden'); }, 380);
  };
  const end = () => {
    clearTimeout(holdTimer);
    if (ff) { ff = false; if (ytReady && yt.setPlaybackRate) yt.setPlaybackRate(1); $('ffwd').classList.add('hidden'); }
    else if (Date.now() - downAt < 380) togglePlay();
  };
  t.addEventListener('pointerdown', start);
  t.addEventListener('pointerup', end);
  t.addEventListener('pointercancel', end);
  t.addEventListener('pointerleave', end);
})();
$('cShuffle').addEventListener('click', () => { state.shuffle = !state.shuffle; save(); paintNow(); toast(state.shuffle ? 'נגינה אקראית' : 'נגינה לפי הסדר'); });
$('cRepeat').addEventListener('click', () => {
  state.repeat = state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off';
  save(); paintNow();
  toast(state.repeat === 'off' ? 'בלי חזרה' : state.repeat === 'all' ? 'חזרה על הרשימה' : 'חזרה על השיר');
});
$('cLyrics').addEventListener('click', () => {
  const t = current();
  if (t) window.open('https://www.google.com/search?q=' + encodeURIComponent(t.title + ' ' + t.artist + ' מילים'), '_blank');
});
const volEl = $('vol');
volEl.value = state.volume;
volEl.addEventListener('input', () => {
  state.volume = +volEl.value; save();
  audioEl.volume = state.volume / 100;
  if (ytReady && yt.setVolume) yt.setVolume(state.volume);
});
if (IS_IOS) document.querySelector('.volrow').style.display = 'none';
const seekEl = $('seek');
seekEl.addEventListener('input', () => { seeking = true; });
seekEl.addEventListener('change', () => {
  if (activeAudio()) { if (M().duration) M().currentTime = (seekEl.value / 1000) * M().duration; }
  else if (ytReady && yt.getDuration) yt.seekTo((seekEl.value / 1000) * yt.getDuration(), true);
  seeking = false;
});

/* ---------- song/video toggle ---------- */
let videoMode = false;
document.querySelectorAll('#svToggle .sv').forEach(b => b.addEventListener('click', () => {
  const toVideo = b.dataset.mode === 'video';
  if (toVideo === videoMode) return;
  const t = current();
  let pos = 0, wasPlaying = false;
  if (t) {
    if (videoMode) {
      if (engine === 'clip') {
        pos = clipEl.currentTime || 0;
        wasPlaying = !clipEl.paused;
        try { clipEl.pause(); } catch {}
      } else {
        pos = ytReady && yt.getCurrentTime ? yt.getCurrentTime() : 0;
        wasPlaying = ytReady && yt.getPlayerState() === YT.PlayerState.PLAYING;
        try { yt.pauseVideo(); } catch {}
      }
    } else {
      pos = audioEl.src ? (audioEl.currentTime || 0) : 0;
      wasPlaying = !!(audioEl.src && !audioEl.paused);
      try { audioEl.pause(); } catch {}
    }
  }
  videoMode = toVideo;
  document.querySelectorAll('#svToggle .sv').forEach(x => x.classList.toggle('on', x === b));
  document.body.classList.toggle('vid', videoMode);
  if (t) {
    if (videoMode) {
      useClipEngine(t, pos, wasPlaying);
    } else {
      try { clipEl.pause(); clipEl.removeAttribute('src'); clipEl.load(); clipEl.style.display = 'none'; $('ytplayer').style.display = ''; } catch {}
      engine = 'audio'; playGen++; paintEngineBadge(); audioEl.dataset.vid = t.id;
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

/* ---------- tabs & pages ---------- */
function moveTabGlass() {
  const g = document.querySelector('.tabglass');
  const b = document.querySelector('.tabbtn.on');
  if (!g || !b) return;
  g.style.width = b.offsetWidth + 'px';
  g.style.left = b.offsetLeft + 'px';
}
function switchTab(name) {
  document.querySelectorAll('.tabbtn').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  moveTabGlass();
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === 'view-' + name));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
  if (name === 'library') renderLibrary();
  if (name === 'listen') renderListen();
  if (name === 'browse') renderBrowse();
  if (name === 'radio') renderRadio();
}
document.querySelectorAll('.tabbtn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
window.addEventListener('resize', moveTabGlass);
window.addEventListener('load', () => setTimeout(moveTabGlass, 50));
setTimeout(moveTabGlass, 300);
function openPage(id) { $(id).classList.add('on'); }
function closePage(id) { $(id).classList.remove('on'); }

/* ---------- card helpers ---------- */
function sectionEl(title, bodyClass) {
  const sec = document.createElement('section');
  sec.className = 'asec';
  const h = document.createElement('h3'); h.textContent = title;
  const body = document.createElement('div');
  body.className = 'asec-body ' + (bodyClass || 'list');
  sec.append(h, body);
  return { sec, body };
}
function bigCard(t, kicker, onTap) {
  const el = document.createElement('div');
  el.className = 'bigcard';
  el.innerHTML = `<div class="bc-img"><img loading="lazy" src="${thumb(t.id, 'hq')}" alt=""><div class="bc-ov"><div class="bc-kicker"></div><div class="bc-title"></div><div class="bc-sub"></div></div></div>`;
  el.querySelector('.bc-kicker').textContent = kicker || '';
  el.querySelector('.bc-title').textContent = t.title;
  el.querySelector('.bc-sub').textContent = t.artist || '';
  el.addEventListener('click', onTap);
  return el;
}
function sqCard(t, onTap, sub) {
  const el = document.createElement('div');
  el.className = 'card sq';
  el.innerHTML = `<img loading="lazy" src="${thumb(t.id, 'hq')}" alt=""><div class="ct"></div><div class="cs dim"></div>`;
  el.querySelector('.ct').textContent = t.title;
  el.querySelector('.cs').textContent = sub != null ? sub : t.artist;
  el.addEventListener('click', onTap);
  return el;
}
function albumCardEl(a) {
  const el = document.createElement('div');
  el.className = 'card sq';
  el.innerHTML = `<img loading="lazy" src="${a.thumb}" alt=""><div class="ct"></div><div class="cs dim"></div>`;
  el.querySelector('.ct').textContent = a.title;
  el.querySelector('.cs').textContent = a.sub;
  el.addEventListener('click', () => openAlbum(a));
  return el;
}
function gradCard(title, color, onTap) {
  const el = document.createElement('div');
  el.className = 'gradcard';
  el.style.background = color;
  el.innerHTML = `<svg class="gc-note"><use href="#i-note"/></svg><div class="gc-title"></div>`;
  el.querySelector('.gc-title').textContent = title;
  el.addEventListener('click', onTap);
  return el;
}
function stationCard(name, avatar, onTap) {
  const el = document.createElement('div');
  el.className = 'stationcard';
  const g = GRADS[(name.charCodeAt(0) + name.length) % GRADS.length];
  el.innerHTML = (avatar
    ? `<img loading="lazy" src="${avatar}" alt="">`
    : `<div class="stph" style="background:${g}"><span></span></div>`) + `<div class="ct"></div><div class="cs"></div>`;
  if (!avatar) el.querySelector('.stph span').textContent = name.trim()[0] || '♪';
  el.querySelector('.ct').textContent = name;
  el.querySelector('.cs').textContent = 'התחנה של ' + name;
  el.addEventListener('click', onTap);
  return el;
}
const GRADS = ['linear-gradient(135deg,#fa2d48,#b3123a)', 'linear-gradient(135deg,#5e5ce6,#3634a3)', 'linear-gradient(135deg,#ff9f0a,#ff6b00)', 'linear-gradient(135deg,#30d158,#148a3d)', 'linear-gradient(135deg,#bf5af2,#7a1fa2)', 'linear-gradient(135deg,#64d2ff,#0a84ff)', 'linear-gradient(135deg,#ff6961,#c92a2a)', 'linear-gradient(135deg,#ffd60a,#ff9f0a)'];

/* ---------- האזנה (Listen Now) ---------- */
let listenLoaded = 0;
async function renderListen() {
  const box = $('listenBody');
  const h = state.history;
  box.innerHTML = '';
  // top picks from history
  if (h.length) {
    const { sec, body } = sectionEl('הבחירות המובילות', 'hscroll');
    h.slice(0, 8).forEach((t, i) => body.appendChild(bigCard(t, i === 0 ? 'מושמע עכשיו' : 'שוב לשמוע', () => playQueue(h, h.indexOf(t)))));
    box.appendChild(sec);
    const { sec: s2, body: b2 } = sectionEl('הושמע לאחרונה', 'hscroll');
    h.slice(0, 12).forEach(t => b2.appendChild(sqCard(t, () => playQueue(h, h.indexOf(t)), t.artist)));
    box.appendChild(s2);
  } else {
    box.innerHTML = '<div class="empty"><div class="big">🎵</div><h2>ברוכים הבאים</h2><p>נגן משהו ונתחיל להכיר את הטעם שלך.</p></div>';
  }
  // made for you: derived from history artists, else Israeli defaults
  const topArtists = [...new Set(h.map(t => t.artist).filter(Boolean))].slice(0, 4);
  const seeds = topArtists.length ? topArtists : ['אייל גולן', 'מושיק עפיה', 'אדם', 'עומר אדם'];
  const { sec: s3, body: b3 } = sectionEl(topArtists.length ? 'בשבילך' : 'פלייליסטים בשבילך', 'hscroll');
  seeds.forEach((a, i) => b3.appendChild(gradCard('המיקס של ' + a, GRADS[i % GRADS.length], async () => {
    toast('בונה מיקס של ' + a + '...');
    try {
      const items = await searchMusic(a);
      if (items.length) playQueue(items, 0, { station: { seed: items[0].id, name: a } });
      else toast('לא נמצאו שירים');
    } catch { toast('החיפוש לא זמין כרגע'); }
  })));
  box.appendChild(s3);
  // fresh section (network), loaded once per while
  if (Date.now() - listenLoaded > 10 * 60 * 1000) {
    listenLoaded = Date.now();
    const { sec: s4, body: b4 } = sectionEl('חם עכשיו בישראל', 'hscroll');
    b4.innerHTML = '<div class="empty"><p>טוען...</p></div>';
    box.appendChild(s4);
    try {
      const items = await searchMusic('השירים הכי שמועים בישראל');
      b4.innerHTML = '';
      items.slice(0, 12).forEach(t => b4.appendChild(sqCard(t, () => playQueue(items, items.indexOf(t)), t.artist)));
    } catch { s4.remove(); }
  }
}

/* ---------- עיון (Browse) ---------- */
let browseLoaded = 0;
async function renderBrowse() {
  if (Date.now() - browseLoaded < 10 * 60 * 1000 && $('browseBody').children.length) return;
  browseLoaded = Date.now();
  const box = $('browseBody');
  box.innerHTML = '<div class="empty"><p>טוען...</p></div>';
  const mk = (title) => { const { sec, body } = sectionEl(title, 'hscroll'); return { sec, body }; };
  box.innerHTML = '';
  const s1 = mk('השירים החדשים'); box.appendChild(s1.sec);
  const s2 = mk('להיטי ישראל'); box.appendChild(s2.sec);
  const s3 = mk('מזרחית וים-תיכונית'); box.appendChild(s3.sec);
  const s4 = mk('מוזיקה ערבית'); box.appendChild(s4.sec);
  const fill = async (body, q, vid) => {
    try {
      const items = await searchMusic(q, vid ? 'music_videos' : 'music_songs');
      body.innerHTML = '';
      items.slice(0, 12).forEach(t => body.appendChild(sqCard(t, () => playQueue(items, items.indexOf(t)), t.artist)));
    } catch { body.innerHTML = '<div class="empty"><p>לא זמין כרגע</p></div>'; }
  };
  fill(s1.body, 'שירים חדשים 2026 ישראל');
  fill(s2.body, 'להיטים ישראלים');
  fill(s3.body, 'מוזיקה מזרחית להיטים');
  fill(s4.body, 'اغاني عربية');
}

/* ---------- רדיו ---------- */
async function renderRadio() {
  const box = $('radioBody');
  box.innerHTML = '';
  const hero = document.createElement('div');
  hero.className = 'radiohero';
  const seedT = state.history[0];
  hero.innerHTML = `<img alt="" src="${seedT ? thumb(seedT.id, 'hq') : ''}"><div class="rh-ov"><div class="rh-k">תחנה אישית</div><div class="rh-t">הרדיו שלך</div><div class="rh-s">שירים שאתה אוהב ועוד כמוהם</div></div>`;
  hero.addEventListener('click', async () => {
    toast('מפעיל את הרדיו שלך...');
    try {
      let seed = seedT;
      if (!seed) {
        const items = await searchMusic('להיטים ישראלים');
        if (!items.length) throw 0;
        playQueue(items, 0, { station: { seed: items[0].id, name: 'הרדיו שלך' } });
        return;
      }
      const j = await pipedFetch('/streams/' + seed.id, 8000);
      const rel = (j.relatedStreams || []).filter(s => s.url && s.type === 'stream').map(mapStream).filter(t => t.id);
      const q = [seed, ...rel];
      playQueue(q, 0, { station: { seed: seed.id, name: 'הרדיו שלך' } });
    } catch { toast('לא זמין כרגע'); }
  });
  box.appendChild(hero);
  const { sec, body } = sectionEl('תחנות של אמנים', 'hscroll');
  const favs = Object.entries(state.favArtists).map(([chId, a]) => ({ chId, name: a.name, avatar: a.avatar }));
  const hist = [...new Set(state.history.map(t => t.artist).filter(Boolean))].slice(0, 6).map(n => ({ name: n, avatar: '' }));
  const list = favs.length ? favs.concat(hist.filter(x => !favs.some(f => f.name === x.name))).slice(0, 8) : (hist.length ? hist : [
    { name: 'אייל גולן' }, { name: 'עומר אדם' }, { name: 'איתי לוי' }, { name: 'מושיק עפיה' }, { name: 'נועה קירל' }, { name: 'עידן רייכל' },
  ]);
  list.forEach(a => body.appendChild(stationCard(a.name, a.avatar, async () => {
    toast('מפעיל את התחנה של ' + a.name + '...');
    try {
      const items = await searchMusic(a.name);
      if (items.length) playQueue(items, 0, { station: { seed: items[0].id, name: a.name } });
      else toast('לא נמצאו שירים');
    } catch { toast('החיפוש לא זמין כרגע'); }
  })));
  box.appendChild(sec);
}

/* ---------- ספריה ---------- */
function renderLibrary() {
  const rows = $('libRows');
  rows.innerHTML = '';
  const mkRow = (label, icon, count, onTap) => {
    const el = document.createElement('div');
    el.className = 'librow';
    el.innerHTML = `<div class="lic"><svg><use href="#${icon}"/></svg></div><div class="lt"></div><svg class="chev"><use href="#i-chev-fwd"/></svg>`;
    el.querySelector('.lt').textContent = count != null ? `${label} (${count})` : label;
    el.addEventListener('click', onTap);
    rows.appendChild(el);
  };
  mkRow('שירים אהובים', 'i-star-fill', favList().length, () => openLocalPlaylist('שירים אהובים'));
  mkRow('הושמע לאחרונה', 'i-queue', state.history.length, () => openRecent());
  mkRow('אמנים', 'i-tab-listen', Object.keys(state.favArtists).length, () => openLibArtists());
  mkRow('אלבומים', 'i-note', Object.keys(state.albums).length, () => openLibAlbums());
  const pls = $('libPls');
  pls.innerHTML = '';
  Object.keys(state.playlists).filter(n => n !== 'שירים אהובים').forEach(name => {
    const songs = state.playlists[name] || [];
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      ${songs.length ? `<img loading="lazy" src="${thumb(songs[0].id)}" alt="">` : `<div class="plph"><svg><use href="#i-note"/></svg></div>`}
      <div class="meta"><div class="t"></div><div class="a"></div></div>
      <button class="dots" aria-label="אפשרויות"><svg><use href="#i-dots"/></svg></button>`;
    row.querySelector('.t').textContent = name;
    row.querySelector('.a').textContent = songs.length + ' שירים';
    row.addEventListener('click', () => openLocalPlaylist(name));
    row.querySelector('.dots').addEventListener('click', e => {
      e.stopPropagation();
      if (confirm(`למחוק את "${name}"?`)) { delete state.playlists[name]; save(); renderLibrary(); }
    });
    pls.appendChild(row);
  });
}
$('newPl').addEventListener('click', () => {
  const name = (prompt('שם הרשימה:') || '').trim();
  if (!name) return;
  if (state.playlists[name]) return toast('כבר יש רשימה בשם הזה');
  state.playlists[name] = []; save(); renderLibrary();
});

/* ---------- דף פלייליסט (מקומי) ---------- */
let openPlName = null, openPlTracks = null, openPlKind = null;
function paintPlArt(box, songs) {
  box.innerHTML = '';
  box.classList.remove('single');
  const imgs = songs.slice(0, 4);
  if (!imgs.length) { box.classList.add('single'); box.innerHTML = '<svg><use href="#i-note"/></svg>'; return; }
  imgs.forEach(t => { const im = document.createElement('img'); im.src = thumb(t.id, 'hq'); box.appendChild(im); });
}
function openLocalPlaylist(name) {
  openPlName = name; openPlKind = 'pl';
  openPlTracks = () => state.playlists[name] || [];
  $('plTitle').textContent = name;
  $('plOwner').textContent = 'הרשימות שלי';
  const songs = openPlTracks();
  paintPlArt($('plArt'), songs);
  $('plMeta').textContent = songs.length + ' שירים';
  renderPlTracks();
  openPage('page-playlist');
}
function openRecent() {
  openPlKind = 'recent';
  openPlTracks = () => state.history;
  $('plTitle').textContent = 'הושמע לאחרונה';
  $('plOwner').textContent = 'ההיסטוריה שלך';
  const songs = openPlTracks();
  paintPlArt($('plArt'), songs);
  $('plMeta').textContent = songs.length + ' שירים';
  renderPlTracks();
  openPage('page-playlist');
}
function renderPlTracks() {
  const songs = openPlTracks();
  $('plMeta').textContent = songs.length + ' שירים';
  const box = $('plTracks'); box.innerHTML = '';
  if (!songs.length) { box.innerHTML = '<div class="empty"><p>הרשימה ריקה. חפשו שירים ולחצו ••• כדי להוסיף.</p></div>'; return; }
  songs.forEach((t, i) => box.appendChild(trackRow(t, {
    onPlay: () => playQueue(songs, i),
    sheet: openPlKind === 'pl' ? { onRemove: () => { songs.splice(i, 1); save(); renderPlTracks(); renderLibrary(); paintPlArt($('plArt'), songs); } } : {},
  })));
}
$('plPlay').addEventListener('click', () => { const s = openPlTracks(); if (s.length) playQueue(s, 0); else toast('הרשימה ריקה'); });
$('plShuffle').addEventListener('click', () => { const s = openPlTracks(); if (!s.length) return toast('הרשימה ריקה'); state.shuffle = true; playQueue(s, Math.floor(Math.random() * s.length)); toast('מנגן אקראי'); });
$('plRename').addEventListener('click', () => {
  if (openPlKind !== 'pl') return toast('אי אפשר לשנות שם כאן');
  const nn = (prompt('שם חדש לרשימה:', openPlName) || '').trim();
  if (!nn || nn === openPlName) return;
  if (state.playlists[nn]) return toast('כבר יש רשימה בשם הזה');
  state.playlists[nn] = state.playlists[openPlName];
  delete state.playlists[openPlName];
  openPlName = nn; save(); openLocalPlaylist(nn);
});
$('plDelete').addEventListener('click', () => {
  if (openPlKind !== 'pl') return toast('אי אפשר למחוק כאן');
  if (!confirm(`למחוק את הרשימה "${openPlName}"?`)) return;
  delete state.playlists[openPlName];
  save(); closePage('page-playlist'); renderLibrary();
});

/* ---------- דף אלבום ---------- */
let alCur = null, alTracks = [];
async function openAlbum(a) {
  alCur = a;
  $('alArt').src = a.thumb || '';
  $('alTitle').textContent = a.title;
  $('alArtist').textContent = a.artistName || '';
  $('alMeta').textContent = a.sub || '';
  $('alTracks').innerHTML = '<div class="empty"><p>טוען...</p></div>';
  openPage('page-album');
  try {
    const j = await pipedFetch('/playlists/' + a.plId, 9000);
    alTracks = (j.relatedStreams || []).filter(s => s.url && s.type === 'stream').map(mapStream).filter(t => t.id);
    if (j.name) $('alTitle').textContent = j.name;
    if (j.uploader) { $('alArtist').textContent = j.uploader; $('alArtist').classList.add('link'); }
    $('alMeta').textContent = alTracks.length + ' שירים';
    const box = $('alTracks'); box.innerHTML = '';
    alTracks.forEach((t, i) => box.appendChild(trackRow(t, {
      num: i + 1, noArt: true,
      onPlay: () => playQueue(alTracks, i),
    })));
  } catch { $('alTracks').innerHTML = '<div class="empty"><p>לא הצלחתי לטעון את האלבום כרגע</p></div>'; }
}
$('alArtist').addEventListener('click', () => {
  const name = $('alArtist').textContent;
  if (name) { searchArtistAndOpen(name); }
});
$('alPlay').addEventListener('click', () => { if (alTracks.length) playQueue(alTracks, 0); });
$('alShuffle').addEventListener('click', () => { if (!alTracks.length) return; state.shuffle = true; playQueue(alTracks, Math.floor(Math.random() * alTracks.length)); });

/* ---------- ספריה: אמנים ואלבומים שמורים ---------- */
function openLibArtists() {
  const box = $('resBody');
  switchTab('search');
  $('searchHome').classList.add('hidden');
  $('searchRes').classList.remove('hidden');
  $('pills').innerHTML = '';
  box.innerHTML = '<h2 class="secttl">האמנים שלי</h2>';
  const entries = Object.entries(state.favArtists);
  if (!entries.length) { box.innerHTML += '<div class="empty"><p>עוד לא שמרת אמנים. פתח דף אמן ולחץ על הכוכב.</p></div>'; return; }
  entries.forEach(([chId, a]) => box.appendChild(artistHit({ chId, name: a.name, avatar: a.avatar })));
}
function openLibAlbums() {
  const box = $('resBody');
  switchTab('search');
  $('searchHome').classList.add('hidden');
  $('searchRes').classList.remove('hidden');
  $('pills').innerHTML = '';
  box.innerHTML = '<h2 class="secttl">האלבומים שלי</h2>';
  const entries = Object.values(state.albums);
  if (!entries.length) { box.innerHTML += '<div class="empty"><p>עוד לא שמרת אלבומים.</p></div>'; return; }
  const wrap = document.createElement('div');
  wrap.className = 'hscroll';
  entries.forEach(a => wrap.appendChild(albumCardEl(a)));
  box.appendChild(wrap);
}

/* ---------- חיפוש ---------- */
const CATS = [
  ['מזרחית', 'linear-gradient(135deg,#fa2d48,#8f0e28)', 'מוזיקה מזרחית'],
  ['ישראלי', 'linear-gradient(135deg,#0a84ff,#0b3d91)', 'מוזיקה ישראלית'],
  ['ערבית', 'linear-gradient(135deg,#30d158,#0f6e2c)', 'اغاني عربية'],
  ['מוזיקה עולמית', 'linear-gradient(135deg,#bf5af2,#5e2a84)', 'world music hits'],
  ['פופ', 'linear-gradient(135deg,#ff9f0a,#c93400)', 'pop hits'],
  ['רגוע', 'linear-gradient(135deg,#64d2ff,#2a5a8f)', 'שירים רגועים'],
  ['חתונות ואירועים', 'linear-gradient(135deg,#ff6961,#8f1d1d)', 'שירי חתונה ישראלים'],
  ['להיטי ילדים', 'linear-gradient(135deg,#ffd60a,#c78a00)', 'שירי ילדים'],
];
(function buildCats() {
  const g = $('catGrid');
  CATS.forEach(([name, color, q]) => {
    const el = document.createElement('div');
    el.className = 'cat';
    el.style.background = color;
    const sp = document.createElement('span');
    sp.textContent = name;
    el.appendChild(sp);
    el.addEventListener('click', () => {
      switchTab('search');
      $('searchInput').value = q;
      runSearch(q, 'songs');
    });
    g.appendChild(el);
  });
})();

const PILLS = [['top', 'תוצאות מובילות'], ['songs', 'שירים'], ['artists', 'אמנים'], ['albums', 'אלבומים']];
let curPill = 'top', lastQuery = '';
(function buildPills() {
  const box = $('pills');
  PILLS.forEach(([key, label]) => {
    const b = document.createElement('button');
    b.className = 'pill' + (key === curPill ? ' on' : '');
    b.textContent = label;
    b.dataset.pill = key;
    b.addEventListener('click', () => {
      curPill = key;
      box.querySelectorAll('.pill').forEach(p => p.classList.toggle('on', p === b));
      if (lastQuery) runSearch(lastQuery, key);
    });
    box.appendChild(b);
  });
})();

let searchTimer = null, searchSeq = 0;
const input = $('searchInput');
input.addEventListener('input', () => {
  $('clearSearch').classList.toggle('hidden', !input.value);
  clearTimeout(searchTimer);
  const q = input.value.trim();
  if (!q) { $('searchHome').classList.remove('hidden'); $('searchRes').classList.add('hidden'); hideNetNote(); return; }
  searchTimer = setTimeout(() => runSearch(q, curPill), 450);
});
input.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(searchTimer); runSearch(input.value.trim(), curPill); } });
$('clearSearch').addEventListener('click', () => { input.value = ''; input.dispatchEvent(new Event('input')); input.focus(); });

async function runSearch(q, pill) {
  if (!q) return;
  lastQuery = q;
  switchTab('search');
  $('searchHome').classList.add('hidden');
  $('searchRes').classList.remove('hidden');
  const vid = vidFromUrl(q);
  const seq = ++searchSeq;
  const box = $('resBody');
  box.innerHTML = '<div class="empty"><p>מחפש...</p></div>';
  if (vid) {
    const t = { id: vid, title: 'שיר מיוטיוב', artist: '', dur: 0 };
    box.innerHTML = '';
    box.appendChild(trackRow(t, { onPlay: () => playQueue([t], 0) }));
    enrichTitle(t);
    return;
  }
  try {
    if (pill === 'artists') {
      const chans = await searchChannels(q);
      if (seq !== searchSeq) return;
      hideNetNote();
      box.innerHTML = chans.length ? '' : '<div class="empty"><p>לא נמצאו אמנים.</p></div>';
      chans.forEach(c => box.appendChild(artistHit(c)));
      return;
    }
    if (pill === 'albums') {
      const albs = await searchPlaylists(q, 'music_albums');
      if (seq !== searchSeq) return;
      hideNetNote();
      box.innerHTML = '';
      if (!albs.length) { box.innerHTML = '<div class="empty"><p>לא נמצאו אלבומים.</p></div>'; return; }
      const wrap = document.createElement('div');
      wrap.className = 'hscroll';
      albs.slice(0, 15).forEach(a => wrap.appendChild(albumCardEl(a)));
      box.appendChild(wrap);
      return;
    }
    // top / songs
    const jobs = { songs: searchMusic(q) };
    if (pill === 'top') { jobs.artists = searchChannels(q); jobs.albums = searchPlaylists(q, 'music_albums'); }
    const res = {};
    await Promise.all(Object.entries(jobs).map(async ([k, p]) => { try { res[k] = await p; } catch { res[k] = []; } }));
    if (seq !== searchSeq) return;
    hideNetNote();
    box.innerHTML = '';
    const songs = res.songs || [];
    if (pill === 'top' && res.artists && res.artists.length) box.appendChild(artistHit(res.artists[0]));
    if (songs.length) {
      const h = document.createElement('h2'); h.className = 'secttl'; h.textContent = 'שירים';
      box.appendChild(h);
      songs.slice(0, 20).forEach((t, i) => box.appendChild(trackRow(t, { onPlay: () => playQueue(songs, i) })));
    }
    if (pill === 'top' && res.albums && res.albums.length) {
      const h = document.createElement('h2'); h.className = 'secttl'; h.textContent = 'אלבומים';
      box.appendChild(h);
      const wrap = document.createElement('div');
      wrap.className = 'hscroll';
      res.albums.slice(0, 10).forEach(a => wrap.appendChild(albumCardEl(a)));
      box.appendChild(wrap);
    }
    if (!box.children.length) box.innerHTML = '<div class="empty"><p>לא נמצאו תוצאות. נסו ניסוח אחר, או הדביקו קישור יוטיוב.</p></div>';
  } catch (e) {
    if (seq !== searchSeq) return;
    box.innerHTML = '<div class="empty"><p>החיפוש לא זמין כרגע.</p><p class="dim">אפשר תמיד להדביק כאן קישור של שיר מיוטיוב ולנגן ישירות.</p></div>';
    showNetNote('שירות החיפוש החיצוני לא עונה כרגע.');
  }
}
async function enrichTitle(t) {
  try {
    const j = await pipedFetch('/streams/' + t.id, 7000);
    if (j && j.title) { t.title = j.title; t.artist = j.uploader || ''; t.dur = j.duration || 0; t.ch = chFromUrl(j.uploaderUrl) || t.ch || ''; save(); paintPlayingRows(); paintNow(); }
  } catch {}
}

/* ---------- דף אמן ---------- */
let aSongs = [], aSeq = 0, aCur = null;
async function openArtist(chId, name, avatar) {
  const seq = ++aSeq;
  aCur = { chId, name, avatar };
  openPage('page-artist');
  $('aName').textContent = name || 'אמן';
  $('aBanner').style.backgroundImage = avatar ? `url("${avatar}")` : '';
  $('aBody').innerHTML = '<div class="empty"><p>טוען...</p></div>';
  $('page-artist').querySelector('.ascroll').scrollTop = 0;
  setIcon($('aFav'), state.favArtists[chId] ? 'star-fill' : 'star');
  $('aFav').classList.toggle('on', !!state.favArtists[chId]);

  let channel = null, songs = [], albums = [], videos = [];
  try { channel = await pipedFetch('/channel/' + chId, 8000); } catch {}
  if (seq !== aSeq) return;
  if (channel && !channel.error) {
    if (channel.name) { const dn = channel.name.replace(/ - Topic$/i, ''); $('aName').textContent = dn; aCur.name = dn; }
    if (channel.avatarUrl) aCur.avatar = channel.avatarUrl;
    const bn = channel.bannerUrl || channel.avatarUrl;
    if (bn) $('aBanner').style.backgroundImage = `url("${bn}")`;
    else if (!avatar) {
      try {
        const cs = await searchChannels(aCur.name || name);
        if (cs.length && cs[0].avatar) { aCur.avatar = cs[0].avatar; $('aBanner').style.backgroundImage = `url("${cs[0].avatar}")`; }
      } catch {}
    }
    songs = (channel.relatedStreams || [])
      .filter(s => s.url && s.type === 'stream')
      .map(mapStream).filter(t => t.id).slice(0, 10);
  }
  const jobs = [];
  jobs.push((async () => { if (!songs.length) { try { songs = (await searchMusic(name)).slice(0, 10); } catch {} } })());
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
    try { albums = await searchPlaylists(name, 'music_albums'); } catch {}
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
async function searchArtistAndOpen(name) {
  try {
    const chans = await searchChannels(name);
    if (chans.length) return openArtist(chans[0].chId, chans[0].name, chans[0].avatar);
  } catch {}
  toast('לא מצאתי את דף האמן');
}
function renderArtistBody(songs, albums, videos) {
  const box = $('aBody'); box.innerHTML = '';
  aSongs = songs;
  if (albums.length) {
    const latest = albums[0];
    const lc = document.createElement('div');
    lc.className = 'latestcard';
    lc.innerHTML = `<img src="${latest.thumb}" alt=""><div><div class="lc-k">יצירה אחרונה</div><div class="lc-t"></div><div class="lc-s dim"></div></div>`;
    lc.querySelector('.lc-t').textContent = latest.title;
    lc.querySelector('.lc-s').textContent = latest.sub;
    lc.addEventListener('click', () => openAlbum(latest));
    box.appendChild(lc);
  }
  if (songs.length) {
    const { sec, body } = sectionEl('שירים מובילים');
    songs.forEach((t, i) => body.appendChild(trackRow(t, { onPlay: () => playQueue(songs, i) })));
    box.appendChild(sec);
  }
  if (albums.length) {
    const { sec, body } = sectionEl('אלבומים', 'hscroll');
    albums.slice(0, 12).forEach(a => body.appendChild(albumCardEl(a)));
    box.appendChild(sec);
  }
  if (videos.length) {
    const { sec, body } = sectionEl('קליפים', 'hscroll');
    videos.forEach(v => {
      const el = document.createElement('div');
      el.className = 'card vid';
      el.innerHTML = `<img loading="lazy" src="${thumb(v.id)}" alt=""><div class="ct"></div><div class="cs dim"></div>`;
      el.querySelector('.ct').textContent = v.title;
      el.querySelector('.cs').textContent = v.dur ? fmt(v.dur) : '';
      el.addEventListener('click', () => {
        playQueue([v], 0);
        videoMode = true;
        document.querySelectorAll('#svToggle .sv').forEach(x => x.classList.toggle('on', x.dataset.mode === 'video'));
        document.body.classList.add('vid');
        openPlayer();
      });
      body.appendChild(el);
    });
    box.appendChild(sec);
  }
  if (!songs.length && !albums.length && !videos.length)
    box.innerHTML = '<div class="empty"><p>לא נמצא תוכן לאמן הזה כרגע.</p></div>';
}
$('aPlay').addEventListener('click', () => { if (aSongs.length) playQueue(aSongs, 0, { station: { seed: aSongs[0].id, name: aCur ? aCur.name : '' } }); else toast('אין שירים לנגן עדיין'); });
$('aFav').addEventListener('click', () => {
  if (!aCur || !aCur.chId) return;
  if (state.favArtists[aCur.chId]) { delete state.favArtists[aCur.chId]; toast('הוסר מהאמנים שלך'); }
  else { state.favArtists[aCur.chId] = { name: aCur.name, avatar: aCur.avatar || '' }; toast('נשמר בספריה ★'); }
  save();
  setIcon($('aFav'), state.favArtists[aCur.chId] ? 'star-fill' : 'star');
  $('aFav').classList.toggle('on', !!state.favArtists[aCur.chId]);
});
$('aDots').addEventListener('click', () => {
  if (!aCur) return;
  if (state.favArtists[aCur.chId]) { delete state.favArtists[aCur.chId]; save(); toast('הוסר מהספריה'); setIcon($('aFav'), 'star'); $('aFav').classList.remove('on'); }
  else { state.favArtists[aCur.chId] = { name: aCur.name, avatar: aCur.avatar || '' }; save(); toast('נשמר בספריה ★'); setIcon($('aFav'), 'star-fill'); $('aFav').classList.add('on'); }
});

/* ---------- background continuity: save position, resume on return ---------- */
function captureResume() {
  const t = current();
  if (!t) return;
  let c = 0, paused = true;
  if (activeAudio()) { if (!M().src) return; c = M().currentTime || 0; paused = M().paused; }
  else { if (!ytReady || !yt.getCurrentTime) return; c = yt.getCurrentTime() || 0; paused = yt.getPlayerState() !== YT.PlayerState.PLAYING; }
  state.resume = { pos: c, playing: !paused, vid: t.id };
}
function saveResume() { captureResume(); save(); }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { saveResume(); return; }
  const t = current();
  if (!t) return;
  // still playing (iOS let the audio run in the background)? just repaint.
  const stillPlaying = activeAudio() ? (M().src && !M().paused)
    : (ytReady && yt.getPlayerState && yt.getPlayerState() === YT.PlayerState.PLAYING);
  if (stillPlaying) { syncPlayUI(false); paintNow(); return; }
  const r = state.resume;
  if (r && r.playing && r.vid === t.id) {
    // playback was suspended: pick up exactly where it stopped
    loadTrack(t, { startAt: Math.max(0, r.pos), autoplay: true });
    toast('ממשיכים מאיפה שעצרנו');
  } else {
    syncPlayUI(true);
    paintNow();
  }
});
window.addEventListener('pagehide', saveResume);
window.addEventListener('freeze', saveResume);

/* restore position for the first play after a fresh launch */
let restorePos = (state.resume && state.resume.pos) || 0;
const takeRestorePos = () => { const p = restorePos; restorePos = 0; return p; };

/* ---------- init ---------- */
renderListen();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.update();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => {});
  const hadController = !!navigator.serviceWorker.controller;
  let swReloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (swReloaded || !hadController) return; swReloaded = true;
    location.reload();
  });
}
