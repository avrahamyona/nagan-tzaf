const APP_VERSION = 'v103';
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
  'https://pipedapi.reallyaweso.me',
  'https://pipedapi.leptons.xyz',
];
let pipedBase = localStorage.getItem('nagan_piped') || null;

async function pipedFetch(path, timeoutMs = 9000) {
  const hosts = pipedBase ? [pipedBase, ...PIPED_HOSTS.filter(h => h !== pipedBase)] : PIPED_HOSTS;
  const deadline = Date.now() + Math.min(15000, Math.max(8000, timeoutMs * 1.5));
  let lastErr = null;
  for (let i = 0; i < hosts.length; i++) {
    const base = hosts[i];
    const remaining = deadline - Date.now();
    if (remaining < 700) break;
    const ctl = new AbortController();
    const budget = Math.min(timeoutMs, Math.max(700, Math.ceil(remaining / (hosts.length - i))));
    const to = setTimeout(() => ctl.abort(), budget);
    try {
      const r = await fetch(base + path, { signal: ctl.signal });
      if (!r.ok) throw new Error('http ' + r.status);
      const j = await r.json();
      pipedBase = base; localStorage.setItem('nagan_piped', base);
      return j;
    } catch (e) { lastErr = e; }
    finally { clearTimeout(to); }
  }
  throw lastErr || new Error('no piped host');
}
function within(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('search timeout')), ms); })])
    .finally(() => clearTimeout(timer));
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
  const fetchF = f => pipedFetch('/search?q=' + encodeURIComponent(q) + '&filter=' + f)
    .then(j => (j.items || [])
      .filter(it => it.type === 'stream' && it.url)
      .map(mapStream)
      .filter(t => t.id));
  if (filter !== 'music_songs') return fetchF(filter);
  // music_songs only covers the YouTube Music catalog; plain YouTube uploads
  // (piyyutim, concerts, rare tracks) are only found via the videos filter.
  const [songs, vids] = await Promise.allSettled([fetchF('music_songs'), fetchF('videos')]);
  const seen = new Set(); const out = [];
  for (const r of [songs, vids]) {
    if (r.status !== 'fulfilled') continue;
    for (const t of r.value) if (!seen.has(t.id)) { seen.add(t.id); out.push(t); }
  }
  // relevance-sort the merged list: music_songs alone fills the first 20 slots,
  // which would bury videos-only results (live piyyutim, rare uploads).
  return out.map((t, i) => [t, i]).sort((a, b) => scoreTrack(b[0], q) - scoreTrack(a[0], q) || a[1] - b[1]).map(x => x[0]);
}

function normTxt(s) { return String(s || '').toLowerCase().replace(/[\u0591-\u05C7]/g, '').replace(/["'\u201C\u201D\u05F4\u05F3.,!?:;()\[\]\-]/g, ' ').replace(/\s+/g, ' ').trim(); }
function scoreTrack(t, q) {
  const nq = normTxt(q); if (!nq) return 0;
  const nt = normTxt(t.title), na = normTxt(t.artist);
  let s = 0;
  if (nt === nq) s += 120;
  else if (nt.includes(nq)) s += 80;
  else if (nt.startsWith(nq.split(' ')[0] || '')) s += 5;
  const words = nq.split(' ').filter(w => w.length > 1);
  let hits = 0;
  for (const w of words) { if (nt.includes(w)) { hits++; s += 12; } else if (na.includes(w)) s += 4; }
  if (words.length && hits === words.length) s += 40;
  if (na && nq.includes(na)) s += 15;
  return s;
}
/* search cache: repeat/rephrased queries feel instant (5 min TTL) */
const searchCache = new Map();
function searchMusicCached(q) {
  const k = q.trim().toLowerCase();
  const hit = searchCache.get(k);
  if (hit && Date.now() - hit.t < 5 * 60 * 1000) return Promise.resolve(hit.r);
  return searchMusic(q).then(r => { searchCache.set(k, { t: Date.now(), r }); if (searchCache.size > 60) searchCache.delete(searchCache.keys().next().value); return r; });
}

async function searchChannels(q) {
  // music_artists covers YouTube Music profiles only; real-world channels
  // (piyyut publishers, personal channels) exist only in the channels filter.
  const mapCh = it => ({
    chId: chFromUrl(it.url),
    name: it.name || '',
    avatar: it.thumbnail || '',
    subs: it.subscriberCount > 0 ? it.subscriberCount : 0,
    verified: !!it.verified,
  });
  const [artists, chans] = await Promise.allSettled([
    pipedFetch('/search?q=' + encodeURIComponent(q) + '&filter=music_artists'),
    pipedFetch('/search?q=' + encodeURIComponent(q) + '&filter=channels'),
  ]);
  const seen = new Set(); const out = [];
  for (const r of [artists, chans]) {
    if (r.status !== 'fulfilled') continue;
    for (const it of (r.value.items || [])) {
      if (it.type !== 'channel' || !it.url) continue;
      const c = mapCh(it);
      if (c.chId && !seen.has(c.chId)) { seen.add(c.chId); out.push(c); }
    }
  }
  // auto-generated Topic channels rank below real channels
  out.sort((a, b) => (b.subs || 0) - (a.subs || 0));
  const real = out.filter(c => !/ - Topic$/.test(c.name));
  return real.length ? [...real, ...out.filter(c => / - Topic$/.test(c.name))] : out;
}
/* An album's uploader is often a Topic profile. Navigate to the verified
   official channel only when a matching channel search confirms its identity. */
const officialArtistCache = new Map();
async function officialArtistFor(name, sourceId = '') {
  if (!name) return null;
  const key = normTxt(name.replace(/ - Topic$/i, ''));
  if (!key) return null;
  if (!officialArtistCache.has(key)) {
    const pending = (async () => {
      const query = name.replace(/ - Topic$/i, '');
      const [artistSearch, channelSearch] = await Promise.allSettled([
        pipedFetch('/search?q=' + encodeURIComponent(query) + '&filter=music_artists'),
        pipedFetch('/search?q=' + encodeURIComponent(query) + '&filter=channels'),
      ]);
      const ids = new Set([sourceId]);
      let topicId = sourceId;
      if (artistSearch.status === 'fulfilled') for (const x of artistSearch.value.items || []) {
        if (x.type === 'channel' && x.verified && / - Topic$/i.test(x.name || '')) {
          const id = chFromUrl(x.url);
          ids.add(id);
          if (!topicId && normTxt(x.name.replace(/ - Topic$/i, '')) === key) topicId = id;
        }
      }
      const candidates = channelSearch.status === 'fulfilled' ? (channelSearch.value.items || []) : [];
      let sourceAlbums = null;
      if (topicId) {
        const source = await fetch(STREAM_API_DEFAULT + '/artist/' + encodeURIComponent(topicId), {signal:AbortSignal.timeout(7500)});
        if (!source.ok) return null;
        const releases = await source.json();
        if (releases.channelId !== topicId || !Array.isArray(releases.releases)) return null;
        sourceAlbums = new Set(releases.releases.map(a => a.plId));
      }
      for (const candidate of candidates) {
        const id = chFromUrl(candidate.url);
        if (!id || ids.has(id) || !candidate.verified || / - Topic$/i.test(candidate.name || '')) continue;
        const channel = await pipedFetch('/channel/' + id, 8000).catch(() => null);
        if (!channel || channel.id !== id || !channel.verified ||
            !Array.isArray(channel.tabs) || !channel.tabs.some(t => /albums|releases/i.test(t.name))) continue;
        if (sourceAlbums) {
          // Overlapping exact playlist IDs bind this official channel to
          // the album's Topic profile, even across Hebrew/English aliases.
          const albumTab = channel.tabs.find(t => /albums|releases/i.test(t.name));
          const j = await pipedFetch('/channels/tabs?data=' + encodeURIComponent(albumTab.data) + '&id=' + id, 10000).catch(() => null);
          const listed = (j?.content || []).filter(x => x.type === 'playlist' && chFromUrl(x.uploaderUrl) === id).map(mapAlbum);
          if (!listed.some(a => sourceAlbums.has(a.plId))) continue;
        } else if (!normTxt(candidate.name).includes(key) && !key.includes(normTxt(candidate.name))) continue;
        return { chId:id, name:channel.name, avatar:channel.avatarUrl || candidate.thumbnail || '', sourceId:topicId };
      }
      return null;
    })().catch(() => null);
    officialArtistCache.set(key, pending);
    pending.then(x => { if (!x) officialArtistCache.delete(key); });
  }
  return officialArtistCache.get(key);
}
async function openOfficialArtist(name, sourceId = '', avatar = '') {
  const official = await officialArtistFor(name, sourceId);
  if (official) return openArtist(official.chId, official.name, official.avatar || avatar, official.sourceId || sourceId);
  if (sourceId) return openArtist(sourceId, name, avatar);
  return searchArtistAndOpen(name);
}
/* Artist portraits come from exact channel matches, never a song cover. */
const artistPortraitCache = new Map();
function artistPortrait(name, chId = '') {
  const key = chId || normTxt(name);
  if (!key) return Promise.resolve('');
  if (!artistPortraitCache.has(key)) {
    artistPortraitCache.set(key, (async () => {
      try {
        if (chId) {
          const channel = await pipedFetch('/channel/' + chId, 8000);
          if (channel?.avatarUrl && (!channel.id || channel.id === chId)) return channel.avatarUrl;
        }
        const matches = await searchChannels(name);
        const exact = matches.find(c => chId ? c.chId === chId :
          normTxt(c.name.replace(/ - Topic$/i, '')) === normTxt(name));
        return exact?.avatar || '';
      } catch { return ''; }
    })());
  }
  return artistPortraitCache.get(key);
}
function fillArtistPortrait(card, name, chId = '') {
  if (card.querySelector('img')) {
    const img = card.querySelector('img');
    if (img.getAttribute('src')) return;
  }
  artistPortrait(name, chId).then(url => {
    if (!url || !card.isConnected) return;
    const img = document.createElement('img'); img.loading = 'lazy'; img.alt = name;
    img.onerror = () => {
      const fallback = document.createElement('div');
      fallback.className = placeholder?.classList.contains('stph') ? 'stph' : placeholder?.classList.contains('cc-ph') ? 'cc-ph' : 'artistph';
      const letter = document.createElement('span'); letter.textContent = name.trim()[0] || ''; fallback.appendChild(letter);
      img.replaceWith(fallback);
    };
    const placeholder = card.querySelector('.stph,.cc-ph,.artistph');
    img.src = url;
    if (placeholder) placeholder.replaceWith(img);
    else {
      const old = card.querySelector('img');
      if (old) old.replaceWith(img);
    }
  });
}
// Verify a lyric hit against one real line. Short paraphrases may swap Hebrew
// pronouns or omit filler words, but cannot match on a single generic word.
const LYRIC_FILLER = new Set(['אני','את','אתה','היא','הוא','הם','אנחנו','לי','לו','לה','לנו','שלי','שלו','שלה','לפי','ש','כי','זה','זו','אחד','אחת']);
function lyricWords(s) {
  return normTxt(s).split(' ').map(w => w === 'שלא' ? 'לא' : w)
    .filter(w => w.length > 1 && !LYRIC_FILLER.has(w));
}
function lyricLineScore(line, query) {
  const nq = normTxt(query), nl = normTxt(line);
  if (!nq || !nl) return 0;
  if (nl.includes(nq)) return 100;
  const words = lyricWords(query);
  if (words.length === 1) return words[0].length >= 4 && lyricWords(line).includes(words[0]) ? 70 : 0;
  if (words.length < 2) return 0; // do not guess from one common word
  const lineWords = lyricWords(line);
  const hits = words.filter(w => lineWords.includes(w)).length;
  // Require two independent anchors on the same line, and most of the query.
  // A user's "לא אכפת לי מכלום" can match "שלא אכפת לו מכלום".
  if (hits < 2 || hits / words.length < .8) return 0;
  const neg = /(?:^| )(?:לא|שלא)(?: |$)/.test(nq);
  if (neg && !/(?:^| )(?:לא|שלא)(?: |$)/.test(nl)) return 0;
  return 50 + 30 * hits / words.length;
}
async function searchLyrics(q) {
  if (!normTxt(q)) return [];
  const matchedLine = it => {
    const lines = String(it.plainLyrics || '').split('\n').map(x => x.trim()).filter(Boolean);
    return lines.map(line => ({ line, score: lyricLineScore(line, q) }))
      .sort((a, b) => b.score - a.score)[0] || { line: '', score: 0 };
  };
  const matches = [], seen = new Set();
  const add = it => {
    if (/\(paused\)/i.test(it.trackName || '')) return;
    const hit = matchedLine(it);
    const title = it.trackName || '', artist = it.artistName || '';
    const key = normTxt(title).replace(/\s*\(paused\)$/i, '');
    if (hit.score && title && artist && !seen.has(key)) {
      seen.add(key); matches.push({ title, artist, line: hit.line, score: hit.score });
    }
  };
  try {
    const r = await fetch(STREAM_API + '/lyrics?q=' + encodeURIComponent(q));
    if (r.ok) (await r.json()).matches?.forEach(x => {
      const score = lyricLineScore(x.line, q);
      if (x.title && x.artist && score) {
        const key = normTxt(x.title).replace(/\s*\(paused\)$/i, '');
        if (!seen.has(key)) { seen.add(key); matches.push({ ...x, score }); }
      }
    });
  } catch {}
  if (matches.length >= 5) return matches.sort((a,b) => b.score - a.score).map(({score,...x}) => x);
  try {
    const r = await fetch('https://lrclib.net/api/search?q=' + encodeURIComponent(q));
    if (r.ok) (await r.json()).slice(0, 12).forEach(add);
  } catch {}
  if (matches.length >= 5) return matches.sort((a,b) => b.score - a.score).map(({score,...x}) => x);
  try {
    const j = await pipedFetch('/search?q=' + encodeURIComponent(q) + '&filter=videos');
    const candidates = (j.items || []).filter(x => x.type === 'stream').slice(0, 8);
    for (const item of candidates) {
      if (matches.length >= 5) break;
      const title = String(item.title || '').replace(/\s*\([^)]*(?:prod\.?|official|lyric|video)[^)]*\)\s*/gi, ' ').trim();
      const parts = title.split(/\s+[-–]\s+/);
      if (parts.length < 2) continue;
      const artist = parts.shift().trim(), track = parts.join(' - ').split(/\s*[|｜]\s*/)[0].trim();
      if (!artist || !track) continue;
      const url = 'https://lrclib.net/api/search?track_name=' + encodeURIComponent(track);
      try {
        const r = await fetch(url);
        if (r.ok) (await r.json()).slice(0, 16).forEach(add);
      } catch {}
    }
  } catch {}
  return matches.sort((a,b) => b.score - a.score).map(({score,...x}) => x);
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
    artistName: x.uploaderName || '', artistId: chFromUrl(x.uploaderUrl),
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
  shuffle: false, repeat: 'off', autoNext: true,
  volume: 90,
  lessSuggestions: {}, // videoId -> suppress from auto-suggestions
  fav: {},            // videoId -> true
  favArtists: {},     // chId -> {name, avatar}
  albums: {},         // plId -> {plId,title,thumb,sub}
  history: [],        // recent tracks, newest first (max 60)
  playedHistory: [],  // completed queue transitions, newest first (max 60)
  station: null,      // {seed, name} when radio autoplay is on
  resume: null,       // {pos, playing, vid} last known playback point
};
try {
  const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
  if (saved) state = Object.assign(state, saved);
  delete state.recentSearches;
  // migrate v1
  const old = JSON.parse(localStorage.getItem('nagan_state_v1') || 'null');
  if (old && old.playlists && !saved) { state.playlists = old.playlists; state.queue = old.queue || []; state.qi = old.qi || 0; }
} catch {}
function save() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      playlists: state.playlists, queue: state.queue, qi: state.qi,
      shuffle: state.shuffle, repeat: state.repeat, autoNext: state.autoNext, volume: state.volume,
      fav: state.fav, favArtists: state.favArtists, albums: state.albums, lessSuggestions: state.lessSuggestions,
      history: state.history.slice(0, 60), playedHistory: state.playedHistory.slice(0, 60), station: state.station, resume: state.resume,
    }));
  } catch {}
}
function pushHistory(t) {
  if (!t || !t.id) return;
  state.history = state.history.filter(x => x.id !== t.id);
  state.history.unshift({ id: t.id, title: t.title, artist: t.artist, dur: t.dur, ch: t.ch, album: t.album || null });
  if (state.history.length > 60) state.history.length = 60;
}
function recordPlayed(t) {
  if (!t?.id) return;
  state.playedHistory ||= [];
  state.playedHistory.unshift({id:t.id,title:t.title,artist:t.artist,dur:t.dur,ch:t.ch,album:t.album||null});
  state.playedHistory.length = Math.min(state.playedHistory.length,60);
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
function setAudioSrc(url) {
  // karaoke's Web Audio graph goes silent on CORS-tainted media; only the
  // worker sends CORS headers, so opt into CORS just for worker URLs.
  if (url && url.includes('workers.dev')) audioEl.crossOrigin = 'anonymous';
  else audioEl.removeAttribute('crossorigin');
  audioEl.src = url;
  registerMediaControls();
}
audioEl.preload = 'none';
const clipEl = $('clipEl');
let userPaused = false;
let playGen = 0;
let resumeToastAt = 0;
function noteAutoplayBlock(e) {
  if (!e || e.name !== 'NotAllowedError') return false;
  if (Date.now() - resumeToastAt > 60000) { resumeToastAt = Date.now(); toast('הקש ניגון כדי להמשיך'); }
  return true;
}
function armAutoResume(el) {
  const tryResume = g => {
    if (playGen !== g || userPaused) return;
    if (el !== M() || !el.paused || el.ended) return;
    el.play().catch((e) => {
      noteAutoplayBlock(e);
      // iOS sometimes kills the media pipeline on interruption: reload and retry from the same spot.
      if (playGen !== g || userPaused || el !== M()) return;
      const pos = el.currentTime || 0;
      try { el.load(); } catch {}
      const h = () => {
        el.removeEventListener('canplay', h);
        if (playGen !== g || userPaused || el !== M()) return;
        try { el.currentTime = pos; } catch {}
        el.play().catch((e) => noteAutoplayBlock(e));
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
  el.addEventListener('play', () => { userPaused = false; resumeToastAt = 0; });
  // If the retries all failed (iOS blocked gesture-less play), catch the next
  // opportunity: app returns to foreground / window focus.
  const onForeground = () => {
    if (userPaused || !(engine === 'audio' || engine === 'clip')) return;
    if (el !== M() || !el.paused || el.ended || !el.src) return;
    el.play().catch((e) => noteAutoplayBlock(e));
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) onForeground(); });
  window.addEventListener('focus', onForeground);
  window.addEventListener('pageshow', onForeground);
}
const pendingSeek = new WeakMap();
function seekWhenReady(el, seconds) {
  const pos = Math.max(0, Number(seconds) || 0);
  if (!pos) return;
  const record = { pos, src: el.currentSrc || el.src };
  pendingSeek.set(el, record);
  const apply = () => {
    if (pendingSeek.get(el) !== record || (el.currentSrc || el.src) !== record.src) return;
    if (el.readyState < 1) return;
    try {
      el.currentTime = el.duration && Number.isFinite(el.duration) ? Math.min(pos, Math.max(0, el.duration - .25)) : pos;
      if (Math.abs(el.currentTime - pos) < 1 || el.currentTime >= pos - 1) pendingSeek.delete(el);
    } catch {}
  };
  apply();
  if (pendingSeek.get(el) === record) {
    el.addEventListener('loadedmetadata', apply, { once: true });
    el.addEventListener('canplay', apply, { once: true });
  }
}
function livePosition() {
  const t = current();
  if (!t) return 0;
  const el = engine === 'clip' || engine === 'clip-pending' ? clipEl : audioEl;
  if ((engine === 'audio' || engine === 'clip' || engine === 'clip-pending') && el.src)
    return Math.max(el.currentTime || 0, pendingSeek.get(el)?.pos || 0);
  if ((engine === 'yt' || engine === 'yt-pending') && ytReady && yt.getCurrentTime)
    return yt.getCurrentTime() || 0;
  return state.resume && state.resume.vid === t.id ? state.resume.pos || 0 : 0;
}
const M = () => (engine === 'clip') ? clipEl : audioEl;
(function verChip() {
  const c = document.createElement('div');
  c.id = 'verChip'; c.innerHTML = '<span class="edot" id="verChipDot" style="background:#8e8e93"></span>' + APP_VERSION; c.title = 'גרסה';
  c.addEventListener('click', () => showStreamDiag());
  document.body.appendChild(c);
})();
let engine = 'yt'; // 'audio' | 'yt' | 'yt-pending'
let restoreAttempt = false; // resuming after relaunch/background: failure must not skip
let audioRetry = 0;
function showStreamDiag() {
  const d = window._streamDiag;
  toast(d ? ('אבחון: ' + d) : 'אין נתוני אבחון עדיין', 6000);
}
let streamConnecting = false;
function paintEngineBadge() {
  const b = document.getElementById('engineBadge');
  if (!b) return;
  if (!b.__wired) { b.__wired = true; b.style.cursor = 'pointer'; b.addEventListener('click', showStreamDiag); }
  const directPlaying = engine === 'audio' && !videoMode && !streamConnecting &&
    audioEl.dataset.vid === state.queue[state.qi]?.id && !audioEl.paused && audioEl.readyState >= 2;
  const clipPlaying = engine === 'clip' && !clipEl.paused && clipEl.readyState >= 2;
  const map = directPlaying ? ['שמע ישיר', '#34c759'] : clipPlaying ? ['קליפ ישיר', '#34c759'] :
    streamConnecting || engine === 'yt-pending' || engine === 'clip-pending' ? ['מתחבר...', '#ff3b30'] :
    engine === 'yt' && state.queue[state.qi] ? ['יוטיוב', '#ff3b30'] :
    engine === 'clip-unavailable' ? ['לא זמין', '#ff3b30'] :
    state.queue[state.qi] ? ['מושהה', '#8e8e93'] : ['', '#8e8e93'];
  b.innerHTML = (map[0] ? '<span class="edot" style="background:' + map[1] + '"></span>' + map[0] + ' · ' : '') + APP_VERSION;
  const vd = document.getElementById('verChipDot');
  if (vd) vd.style.background = map[1];
}
paintEngineBadge();
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
      try { yt.stopVideo(); } catch {}
      streamConnecting = true; engine = 'audio'; playGen++;
      audioEl.dataset.vid = t.id; paintEngineBadge();
      setAudioSrc(url);
      try { audioEl.currentTime = pos; } catch {}
      if (playing) audioEl.play().catch(() => { streamConnecting = false; syncPlayUI(true); });
      else { streamConnecting = false; syncPlayUI(true); }
    });
  }, 45000);
}
function useYtEngine(t, startAt) {
  if (videoMode) { clipUnavailable(); return; }
  streamConnecting = false; engine = 'yt'; paintEngineBadge(); playGen++;
  try { clipEl.pause(); clipEl.removeAttribute('src'); clipEl.load(); clipEl.style.display = 'none'; $('ytplayer').style.display = ''; } catch {}
  try { audioEl.pause(); audioEl.removeAttribute('src'); audioEl.load(); } catch {}
  lastCur = -1;
  if (ytReady) yt.loadVideoById(startAt ? { videoId: t.id, startSeconds: startAt } : t.id);
  else pendingLoad = t.id;
}
async function resolveClipUrl(vid) {
  // A visible clip requires a muxed video+audio format. Never hand an audio-only URL to <video>.
  if (STREAM_API) {
    try {
      const base = STREAM_API.replace(/\/$/, '');
      const r = await fetch(base + '/url/' + vid);
      if (r.ok) {
        const j = await r.json();
        if (j.mime === 'video/mp4' && j.url) return j.url;
      }
    } catch {}
  }
  try {
    const j = await pipedFetch('/streams/' + vid, 8000);
    const muxed = (j.videoStreams || []).filter(v => v.url && v.videoOnly === false && /video\/mp4/i.test(v.mimeType || ''));
    return muxed.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0]?.url || null;
  } catch { return null; }
}
function clipUnavailable() {
  try { clipEl.pause(); clipEl.removeAttribute('src'); clipEl.load(); } catch {}
  streamConnecting = false; engine = 'clip-unavailable'; paintEngineBadge(); syncPlayUI(true);
  toast('לא נמצא קליפ ישיר ללא פרסומות. לא נעבור לנגן של יוטיוב.');
}
function useClipEngine(t, startAt, autoplay) {
  clearTimeout(ytRetryTimer);
  streamConnecting = true; engine = 'clip-pending'; paintEngineBadge(); playGen++;
  try { audioEl.pause(); audioEl.removeAttribute('src'); audioEl.load(); } catch {}
  try { yt.stopVideo(); } catch {}
  clipEl.dataset.vid = t.id;
  clipEl.style.display = 'block';
  $('ytplayer').style.display = 'none';
  resolveClipUrl(t.id).then(url => {
    if (clipEl.dataset.vid !== t.id || !videoMode) return;
    if (!url) { clipUnavailable(); return; }
    engine = 'clip'; paintEngineBadge();
    clipEl.src = url;
    registerMediaControls();
    seekWhenReady(clipEl, startAt);
    if (autoplay !== false) clipEl.play().catch(() => syncPlayUI(true));
  });
}

function loadTrack(t, opts = {}) {
  if (!t) return;
  restoreAttempt = !!(opts.startAt && opts.autoplay);
  clearTimeout(ytRetryTimer);
  window._streamDiag = '';
  lastCur = -1;
  streamConnecting = true; engine = 'audio'; playGen++;
  audioEl.dataset.vid = t.id; paintEngineBadge();
  audioRetry = 0;
  const hasGesture = !!(navigator.userActivation && navigator.userActivation.isActive);
  if (hasGesture && ytReady) {
    engine = 'yt-pending'; paintEngineBadge();
    yt.loadVideoById(opts.startAt ? { videoId: t.id, startSeconds: opts.startAt } : t.id);
  }
  resolveAudioUrl(t.id).then(url => {
    if (audioEl.dataset.vid !== t.id || videoMode) return;
    if (!url) {
      streamConnecting = false;
      if (engine === 'yt-pending') { engine = 'yt'; paintEngineBadge(); }
      else useYtEngine(t, opts.startAt);
      scheduleAudioRetry(t);
      return;
    }
    try { yt.stopVideo(); } catch {}
    const wasPlaying = engine === 'yt-pending' && ytReady && yt.getPlayerState() === YT.PlayerState.PLAYING;
    engine = 'audio'; paintEngineBadge();
    setAudioSrc(url);
    seekWhenReady(audioEl, opts.startAt);
    if (wasPlaying || hasGesture || opts.autoplay) audioEl.play().catch((e) => {
      if (noteAutoplayBlock(e)) { streamConnecting = false; syncPlayUI(true); return; }
      if (audioEl.dataset.vid === t.id && !videoMode) useYtEngine(t, Math.max(audioEl.currentTime || 0, opts.startAt || 0));
    });
    else { streamConnecting = false; syncPlayUI(true); }
  });
}
clipEl.addEventListener('ended', () => advance(1, true));
clipEl.addEventListener('playing', () => { streamConnecting = false; syncPlayUI(false); });
clipEl.addEventListener('waiting', paintEngineBadge);
clipEl.addEventListener('play', () => syncPlayUI(false));
clipEl.addEventListener('pause', () => syncPlayUI(true));
clipEl.addEventListener('error', () => {
  const t = current();
  if (!t || !videoMode || clipEl.dataset.vid !== t.id) return;
  clipUnavailable();
});
audioEl.addEventListener('ended', () => advance(1, true));
armAutoResume(audioEl);
armAutoResume(clipEl);
audioEl.addEventListener('playing', () => { streamConnecting = false; syncPlayUI(false); });
audioEl.addEventListener('waiting', paintEngineBadge);
audioEl.addEventListener('play', () => { restoreAttempt = false; syncPlayUI(false); });
audioEl.addEventListener('pause', () => syncPlayUI(true));
audioEl.addEventListener('error', () => {
  if (audioEl.error) window._streamDiag = (window._streamDiag || '') + ' elerr:' + audioEl.error.code;
  const t = current();
  if (!t || videoMode || audioEl.dataset.vid !== t.id) return;
  if (audioRetry++ < 1) {
    resolveAudioUrl(t.id).then(url => {
      if (url && audioEl.dataset.vid === t.id && !videoMode) { setAudioSrc(url); audioEl.play().catch(() => {}); }
      else useYtEngine(t);
    });
  } else useYtEngine(t);
});
const activeAudio = () => (engine === 'audio' && !videoMode) || engine === 'clip';

function onPlayerState(st) {
  if (st === YT.PlayerState.PLAYING && (engine === 'audio' || engine === 'clip')) {
    // The embed won a buffering race against the direct engine - kill it (double playback + ads).
    try { yt.stopVideo(); } catch {}
    return;
  }
  if (st === YT.PlayerState.PLAYING) { streamConnecting = false; restoreAttempt = false; registerMediaControls(); syncPlayUI(false); }
  else if (st === YT.PlayerState.PAUSED) { syncPlayUI(true); }
  else if (st === YT.PlayerState.ENDED) { if (engine === 'yt') advance(1, true); }
}
let errGuard = 0;
function onTrackError() {
  const t = current();
  if (restoreAttempt) {
    restoreAttempt = false;
    toast(`לא הצלחתי להמשיך את "${t ? t.title : ''}" כרגע - נסה שוב בעוד רגע`);
    syncPlayUI(true);
    return;
  }
  toast(`השיר "${t ? t.title : ''}" לא זמין לנגינה מוטמעת - מדלג`);
  errGuard++;
  if (errGuard < 8) setTimeout(() => advance(1, true), 700);
  setTimeout(() => { errGuard = 0; }, 15000);
}


const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/* Apple Music style lyric-match snippet: match words highlighted, a word or two of context around them */
function renderLyricSnippet(el, line, q) {
  const words = String(line || '').split(/\s+/);
  const qws = String(q || '').toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const isQ = w => qws.some(x => w.toLowerCase().includes(x));
  let first = -1, last = -1;
  words.forEach((w, i) => { if (isQ(w)) { if (first < 0) first = i; last = i; } });
  if (first < 0) { el.textContent = '\u201C' + line + '\u201D'; return; }
  const a = Math.max(0, first - 2), b = Math.min(words.length, last + 4);
  el.innerHTML = '\u201C' + (a > 0 ? '\u2026 ' : '')
    + words.slice(a, b).map(w => isQ(w) ? '<b>' + escHtml(w) + '</b>' : escHtml(w)).join(' ')
    + (b < words.length ? ' \u2026' : '') + '\u201D';
}

/* ---------- queue ---------- */
const current = () => state.queue[state.qi] || null;

function playQueue(tracks, idx, opts = {}) {
  recordPlayed(current());
  state.queue = tracks.slice(); state.qi = idx || 0;
  state.station = opts.station || null;
  const t = current();
  if (!t) return;
  pushHistory(t);
  loadTrack(t);
  paintNow(); save();
  ensureUpNext();
}

/* Recommendations are drawn from actual plays and likes on this device.
   A related item alone is not a taste signal: keep only known artist identities. */
let upNextFilling = false;
function tasteArtists() {
  const weights = new Map(), hist = state.history || [];
  hist.forEach((t, i) => {
    if (!t.artist) return;
    const key = t.ch || normTxt(t.artist);
    const entry = weights.get(key) || { name: t.artist, ch: t.ch || '', weight: 0 };
    entry.weight += 1 + (hist.length - i) / Math.max(hist.length, 1);
    weights.set(key, entry);
  });
  Object.entries(state.favArtists || {}).forEach(([ch, a]) => {
    if (!a?.name) return;
    const entry = weights.get(ch) || { name: a.name, ch, weight: 0 };
    entry.weight += 3;
    weights.set(ch, entry);
  });
  return [...weights.values()].sort((a, b) => b.weight - a.weight);
}
function artistMatchesTaste(t, artists) {
  const name = normTxt(t.artist);
  return artists.some(a => (a.ch && t.ch && a.ch === t.ch) ||
    (name && normTxt(a.name) && (name === normTxt(a.name) || name.includes(normTxt(a.name)) || normTxt(a.name).includes(name))));
}
async function ensureUpNext() {
  if (!state.autoNext || !state.queue.length) return;
  if (upNextFilling) {
    return; // the in-flight refill will finish against the current queue state
  }
  const ahead = state.queue.length - state.qi - 1;
  if (ahead >= 10) return;
  const desired = 10 - ahead;
  const seed = state.queue[state.queue.length - 1], artists = tasteArtists();
  if (seed?.artist) artists.push({ name: seed.artist, ch: seed.ch || '', weight: 1 });
  if (!seed?.id) return;
  upNextFilling = true;
  const queueToken = state.queue;
  try {
    const inQ = new Set(state.queue.map(t => t.id));
    const candidates = [];
    const add = t => {
      if (!t?.id || inQ.has(t.id) || state.lessSuggestions?.[t.id] || !artistMatchesTaste(t, artists)) return;
      inQ.add(t.id); candidates.push(t);
    };
    try {
      const j = await pipedFetch('/streams/' + seed.id, 8000);
      (j.relatedStreams || []).filter(s => s.url && s.type === 'stream').map(mapStream).forEach(add);
    } catch {}
    if (candidates.length < desired && artists.length) {
      const searches = await Promise.allSettled(artists.slice(0, 5).map(a => within(searchMusicCached(a.name), 9000)));
      searches.forEach(r => { if (r.status === 'fulfilled') r.value.forEach(add); });
    }
    if (!candidates.length && seed.artist) {
      try { (await within(searchMusic(seed.artist), 9000)).forEach(add); } catch {}
    }
    // Do not use stale queue offsets if the user changed tracks during network calls.
    if (state.autoNext && state.queue === queueToken && candidates.length) {
      const nowAhead = Math.max(0, state.queue.length - state.qi - 1);
      const fresh = candidates.filter(t => !state.queue.some(q => q.id === t.id));
      state.queue.push(...fresh.slice(0, Math.max(0, 10 - nowAhead)));
      save(); if ($('queueSheet').classList.contains('open')) renderQueue();
    }
  } finally {
    upNextFilling = false;
    if (state.autoNext && state.queue !== queueToken) ensureUpNext();
  }
}

async function stationRefill() {
  const st = state.station;
  if (!st) return false;
  const seed = current(), artists = tasteArtists();
  if (!seed?.id) return false;
  try {
    const j = await pipedFetch('/streams/' + seed.id, 8000);
    const rel = (j.relatedStreams || []).filter(s => s.url && s.type === 'stream')
      .map(mapStream).filter(t => t.id && !state.queue.some(q => q.id === t.id) &&
        !state.lessSuggestions?.[t.id] && (state.station.artist
          ? normTxt(t.artist.replace(/ - Topic$/i, '')) === normTxt(state.station.artist) &&
            (!state.station.chId || !t.ch || t.ch === state.station.chId)
          : artistMatchesTaste(t, artists)));
    if (!rel.length) {
      const name = state.station.artist || seed.artist;
      if (name) {
        try {
          const found = await within(searchMusic(name), 9000);
          for (const t of found) if (t.id && !state.queue.some(q => q.id === t.id) && !state.lessSuggestions?.[t.id] &&
            (state.station.artist ? normTxt(t.artist.replace(/ - Topic$/i, '')) === normTxt(state.station.artist) : normTxt(t.artist) === normTxt(name))) rel.push(t);
        } catch {}
      }
    }
    if (!rel.length) return false;
    if (state.station.artist) {
      for (let i = rel.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rel[i], rel[j]] = [rel[j], rel[i]];
      }
    }
    state.queue = state.queue.concat(rel.slice(0, 12));
    save();
    return true;
  } catch { return false; }
}
async function advance(dir, auto) {
  if (!state.queue.length) return;
  if (auto && state.repeat === 'one') { loadTrack(current()); return; }
  let n = state.qi;
  if (state.shuffle && !state.station?.artist && state.queue.length > 2) {
    do { n = Math.floor(Math.random() * state.queue.length); } while (n === state.qi);
  } else {
    n = state.qi + dir;
    if (n >= state.queue.length) {
      if (state.station) {
        const ok = await stationRefill();
        if (ok) { n = state.qi; } // stay on last index; refill appended, +1 below
        n = state.qi + dir;
        if (n >= state.queue.length) { syncPlayUI(true); return; }
      } else if (auto && state.autoNext) {
        await ensureUpNext();
        n = state.qi + dir;
        if (n >= state.queue.length) { syncPlayUI(true); return; }
      } else if (state.repeat === 'all' || !auto) n = 0;
      else { syncPlayUI(true); return; }
    }
    if (n < 0) n = state.queue.length - 1;
  }
  if (n !== state.qi) recordPlayed(current());
  state.qi = n;
  const t = current();
  if (t) pushHistory(t);
  loadTrack(t); paintNow(); save(); ensureUpNext();
  if ($('queueSheet').classList.contains('open')) renderQueue();
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
    if (!M().src || M().dataset.vid !== t.id) { loadTrack(t, { startAt: takeRestorePos(), autoplay: true }); return; }
    if (M().paused) { userPaused = false; M().play().catch(() => {}); } else { userPaused = true; M().pause(); }
    return;
  }
  if (!ytReady) return;
  const rp = takeRestorePos();
  if (rp) { loadTrack(t, { startAt: rp, autoplay: true }); return; }
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
    registerMediaControls(); // iOS may reset its transport set after metadata changes.
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
function registerMediaControls() {
  if (!('mediaSession' in navigator)) return;
  // iOS may choose its lock-screen transport controls only after the media
  // element starts playing. Refresh the same actions on each actual play,
  // including switches from direct audio to a clip or YouTube fallback.
  const actions = [
    ['play', () => { userPaused = false; if (activeAudio()) M().play().catch(() => {}); else ytReady && yt.playVideo(); }],
    ['pause', () => { userPaused = true; if (activeAudio()) M().pause(); else ytReady && yt.pauseVideo(); }],
    ['nexttrack', next], ['previoustrack', () => advance(-1, false)],
    ...(IS_IOS ? [['seekbackward', null], ['seekforward', null], ['seekto', null]] : []),
    // iOS can prefer its seek UI over next/previous when seekto is exposed.
    // Leave arbitrary seeking in the app, but do not advertise it on its lock screen.
    ...(!IS_IOS ? [['seekto', d => {
      if (d.seekTime == null) return;
      if (activeAudio()) M().currentTime = d.seekTime;
      else if (ytReady) yt.seekTo(d.seekTime, true);
    }]] : []),
  ];
  for (const [action, handler] of actions) {
    try { navigator.mediaSession.setActionHandler(action, handler); }
    catch {} // One unsupported action must not prevent registering the skip actions.
  }
}
registerMediaControls();
for (const el of [audioEl, clipEl]) {
  el.addEventListener('play', registerMediaControls);
  el.addEventListener('playing', registerMediaControls);
  el.addEventListener('loadedmetadata', registerMediaControls);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) registerMediaControls(); });
window.addEventListener('pageshow', registerMediaControls);

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
    if (d > 0) { $('seek').value = Math.round((c / d) * 1000); paintSeekFill(); }
    $('tCur').textContent = fmt(c);
    $('tRem').textContent = d > 0 ? fmtRem(c, d) : '-0:00';
  }
  if ($('queueSheet').classList.contains('open')) syncQueueTransport(paused);
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
  $('player').classList.toggle('art-paused', paused);
  paintEngineBadge();
  try { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = paused ? 'paused' : 'playing'; } catch {}
  if ($('queueSheet').classList.contains('open')) syncQueueTransport(paused);
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
    const r1 = mix(r, 49, .40), g1 = mix(g, 48, .40), b1 = mix(b, 50, .40);
    document.documentElement.style.setProperty('--np-dark1', `rgb(${r1},${g1},${b1})`);
    document.documentElement.style.setProperty('--np-dark2', `rgb(${mix(r, 29, .22)},${mix(g, 29, .22)},${mix(b, 31, .22)})`);
    const r2 = mix(r, 244, .5), g2 = mix(g, 244, .5), b2 = mix(b, 246, .5);
    document.documentElement.style.setProperty('--np-bg1', `rgb(${r2},${g2},${b2})`);
    document.documentElement.style.setProperty('--np-bg2', `rgb(${mix(r, 255, .25)},${mix(g, 255, .25)},${mix(b, 255, .25)})`);
  } catch {}
}
let miniCollapsed = false;
function paintNow() {
  if (!$('lyrView').classList.contains('hidden') && current() && lyrSync.vid !== current().id) openLyrics();
  const t = current();
  if (!t) { $('mini').classList.add('hidden'); return; }
  $('mini').classList.remove('hidden');
  $('mini').classList.toggle('collapsed', miniCollapsed);
  $('mCollapse').setAttribute('aria-expanded', String(!miniCollapsed));
  $('mArt').src = thumb(t.id);
  $('mTitle').textContent = t.title; $('mArtist').textContent = t.artist;
  const art = $('pArt');
  art.crossOrigin = 'anonymous';
  const setArt = (q) => { art.dataset.q = q; art.src = sqThumb(t.id, q); };
  art.onload = () => {
    // YouTube answers a missing maxres/hq with a 200 120x90 placeholder
    if (art.naturalWidth <= 121 && art.dataset.q !== 'mq') { setArt(art.dataset.q === 'maxres' ? 'hq' : 'mq'); return; }
    tintPlayer(art);
  };
  art.onerror = () => {
    const q = art.dataset.q;
    if (q === 'maxres') setArt('hq');
    else if (q === 'hq') setArt('mq');
    else art.onerror = null;
  };
  if (art.dataset.vid !== t.id) { art.dataset.vid = t.id; setArt('maxres'); }
  else if (art.complete && art.naturalWidth === 0) setArt('maxres');
  $('pTitle').textContent = t.title; $('pArtist').textContent = t.artist;
  $('pArtist').classList.toggle('link', !!t.artist);
  $('cShuffle').classList.toggle('on', state.shuffle);
  $('cRepeat').classList.toggle('on', state.repeat !== 'off');
  setIcon($('cRepeat'), state.repeat === 'one' ? 'repeat1' : 'repeat');
  setIcon($('pFav'), state.fav[t.id] ? 'heart-fill' : 'heart');
  $('pFav').classList.toggle('on', !!state.fav[t.id]);
  updateMediaSession();
  registerMediaControls();
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
  const artistName = opts.sub || t.artist;
  row.querySelector('.a').textContent = artistName;
  if (opts.artistLink && artistName) {
    const artist = row.querySelector('.a');
    artist.classList.add('artist-link');
    artist.setAttribute('role', 'button');
    artist.setAttribute('tabindex', '0');
    artist.setAttribute('aria-label', 'פתח אמן ' + artistName);
    const open = e => {
      if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      e.stopPropagation();
      if (e.type === 'keydown') e.preventDefault();
      closePlayer();
      openOfficialArtist(artistName, t.ch || '');
    };
    artist.addEventListener('click', open);
    artist.addEventListener('keydown', open);
  }
  row.addEventListener('click', () => opts.onPlay && opts.onPlay());
  attachSongRowHold(row, t, opts);
  row.querySelector('.dots').addEventListener('click', e => { e.stopPropagation(); openSongSheet(t, opts.sheet || {}); });
  if (opts.queueSwipe && t.id) attachTrackSwipe(row, t);
  return row;
}
function attachSongRowHold(row, t, opts) {
  let timer = null, start = null, consumed = false;
  row.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || e.target.closest('button, .qhandle, input, a, .artist-link')) return;
    start = { x:e.clientX, y:e.clientY }; consumed = false;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!start || row.classList.contains('swipe-open-start') || row.classList.contains('swipe-open-end')) return;
      consumed = true; openSongSheet(t, { ...(opts.sheet || {}), preview:true, sourceRow:row, onPlay:opts.onPlay });
    }, 430);
  });
  row.addEventListener('pointermove', e => {
    if (start && (Math.abs(e.clientX-start.x)>12 || Math.abs(e.clientY-start.y)>12)) { clearTimeout(timer); start=null; }
  });
  const finish=()=>{clearTimeout(timer);start=null;};
  for(const type of ['pointerup','pointercancel','lostpointercapture']) row.addEventListener(type,finish);
  row.addEventListener('contextmenu', e => {
    if (e.pointerType === 'mouse' || consumed) return;
    e.preventDefault(); consumed=true; openSongSheet(t,{...(opts.sheet||{}),preview:true,sourceRow:row,onPlay:opts.onPlay});
  });
  row.addEventListener('click', e=>{
    if (!consumed) return;
    e.preventDefault(); e.stopImmediatePropagation(); consumed=false;
  },true);
}
// In search/library rows, swipe toward the left for play-next and toward
// the right for add-to-end / remove. Actions remain explicit buttons, not
// automatic side effects of brushing across a row.
function attachTrackSwipe(row, t) {
  row.classList.add('swipe-track');
  const actions = document.createElement('div'); actions.className = 'swipe-actions';
  const nextBtn = document.createElement('button'); nextBtn.className = 'swipe-next';
  nextBtn.textContent = '+'; nextBtn.setAttribute('aria-label', 'נגן הבא');
  const endBtn = document.createElement('button'); endBtn.className = 'swipe-end';
  endBtn.textContent = '↓'; endBtn.setAttribute('aria-label', 'הוסף לסוף התור');
  const removeBtn = document.createElement('button'); removeBtn.className = 'swipe-remove';
  removeBtn.textContent = '▤'; removeBtn.setAttribute('aria-label', 'הסר מהספריה');
  // Removal is only valid for a saved-library row, never a public search hit.
  if (state.fav?.[t.id] || (state.playlists && Object.values(state.playlists).some(list => list.some(x => x.id === t.id))))
    actions.append(removeBtn);
  actions.append(endBtn, nextBtn); row.append(actions);
  const queueIt = placement => {
    if (!current()) { toast('התחל לנגן שיר לפני הוספה לתור'); return; }
    if (placement === 'next') state.queue.splice(state.qi + 1, 0, t);
    else state.queue.push(t);
    save(); row.classList.remove('swipe-open-start', 'swipe-open-end');
    if ($('queueSheet').classList.contains('open')) renderQueue();
    toast(placement === 'next' ? 'נוסף להבא בתור' : 'נוסף לסוף התור');
  };
  nextBtn.addEventListener('click', e => { e.stopPropagation(); queueIt('next'); });
  endBtn.addEventListener('click', e => { e.stopPropagation(); queueIt('end'); });
  removeBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (state.fav?.[t.id]) delete state.fav[t.id];
    state.playlists && Object.values(state.playlists).forEach(list => {
      for (let i = list.length - 1; i >= 0; i--) if (list[i].id === t.id) list.splice(i, 1);
    });
    save(); row.remove(); toast('הוסר מהספריה');
  });
  let start = null, suppressClick = false;
  row.addEventListener('touchstart', e => {
    if (e.touches.length === 1) start = { x:e.touches[0].clientX, y:e.touches[0].clientY };
  }, { passive:true });
  row.addEventListener('touchend', e => {
    if (!start) return;
    const x = e.changedTouches[0].clientX - start.x, y = e.changedTouches[0].clientY - start.y;
    start = null;
    if (Math.abs(x) < 48 || Math.abs(x) < Math.abs(y) * 1.2) return;
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 350);
    row.classList.toggle('swipe-open-start', x < 0);
    row.classList.toggle('swipe-open-end', x > 0);
  }, { passive:true });
  row.addEventListener('click', e => {
    if (e.target.closest('.swipe-actions')) return;
    if (suppressClick) { e.stopImmediatePropagation(); e.preventDefault(); return; }
    if (row.classList.contains('swipe-open-start') || row.classList.contains('swipe-open-end')) {
      if (!e.target.closest('.swipe-actions')) {
        e.stopImmediatePropagation(); row.classList.remove('swipe-open-start','swipe-open-end');
      }
    }
  }, true);
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
  row.innerHTML = `<div class="artistph" aria-hidden="true"></div><div class="meta"><div class="t"></div><div class="a"></div></div><svg class="chev"><use href="#i-chev-fwd"/></svg>`;
  const portrait = row.querySelector('.artistph');
  portrait.textContent = c.name.trim()[0] || '';
  if (c.avatar) {
    const img = document.createElement('img'); img.loading = 'lazy'; img.alt = '';
    img.onerror = () => img.replaceWith(portrait);
    img.src = c.avatar; portrait.replaceWith(img);
  }
  row.querySelector('.t').textContent = c.name.replace(/ - Topic$/i, '');
  if (c.verified) row.querySelector('.t').insertAdjacentHTML('beforeend', ' <svg style="width:13px;height:13px;vertical-align:-1px;color:#fa2d48"><use href="#i-check"/></svg>');
  row.querySelector('.a').textContent = 'אמן';
  row.addEventListener('click', () => { closePlayer(); openArtist(c.chId, c.name, c.avatar); });
  if (!c.avatar) fillArtistPortrait(row, c.name, c.chId);
  return row;
}

/* ---------- sheets ---------- */
const openSheet = id => { const sheet=$(id); sheet._hideTicket=(sheet._hideTicket||0)+1; sheet.classList.remove('hidden','is-closing'); requestAnimationFrame(() => sheet.classList.add('open')); $('scrim').classList.add('on'); };
const closeSheet = id => { const sheet=$(id); if(id==='songSheet' && sheet.classList.contains('has-preview')) sheet.classList.add('is-closing'); sheet.classList.remove('open'); const ticket=(sheet._hideTicket=(sheet._hideTicket||0)+1); setTimeout(() => { if(sheet._hideTicket===ticket) { sheet.classList.add('hidden'); sheet.classList.remove('is-closing'); } }, id==='songSheet' && sheet.classList.contains('has-preview') ? 360 : 240); if (!document.querySelector('.sheetbox.open')) $('scrim').classList.remove('on'); };
const closeAllSheets = () => document.querySelectorAll('.sheetbox').forEach(s => closeSheet(s.id));
$('scrim').addEventListener('click', closeAllSheets);
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => {
  const t = b.dataset.close;
  if (t.startsWith('page-')) closePage(t); else closeSheet(t);
}));

/* Album identity comes from the exact playlist membership, never a title-only guess. */
const albumLookup = new Map();
async function verifiedAlbumFor(t) {
  if (!t?.id) return null;
  if (t.album?.plId) return t.album;
  if (albumLookup.has(t.id)) return albumLookup.get(t.id);
  const lookup = (async () => {
    try {
      const candidates = await searchPlaylists([t.title, t.artist].filter(Boolean).join(' '), 'music_albums');
      for (const a of candidates.slice(0, 5)) {
        if (t.artist && a.artistName) {
          const ta = normTxt(t.artist), aa = normTxt(a.artistName);
          const parts = ta.split(' ').filter(w => w.length > 2);
          if (!aa.includes(ta) && !ta.includes(aa) && !parts.some(w => aa.includes(w))) continue;
        }
        try {
          const { tracks } = await loadAlbumTracks(a);
          if (tracks.some(x => x.id === t.id)) return a;
        } catch {}
      }
    } catch {}
    return null;
  })();
  albumLookup.set(t.id, lookup);
  lookup.then(a => { if (!a) albumLookup.delete(t.id); });
  return lookup;
}
let destinationSeq = 0, destinationTrack = null, destinationAlbum = null;
function openSongDestinationSheet(t) {
  if (!t?.artist) return;
  destinationTrack = t; destinationAlbum = t.album?.plId ? t.album : null;
  const seq = ++destinationSeq;
  $('destinationArtist').textContent = t.artist;
  $('destAlbum').classList.toggle('hidden', !destinationAlbum);
  $('destAlbumLabel').textContent = destinationAlbum ? destinationAlbum.title : '';
  $('destAlbumStatus').textContent = destinationAlbum ? '' : 'בודק אלבום...';
  openSheet('destinationSheet');
  positionDestinationSheet();
  setTimeout(() => { if (seq === destinationSeq && $('destinationSheet').classList.contains('open')) positionDestinationSheet(); }, 280);
  if (!destinationAlbum) verifiedAlbumFor(t).then(a => {
    if (seq !== destinationSeq || destinationTrack?.id !== t.id) return;
    destinationAlbum = a;
    $('destAlbum').classList.toggle('hidden', !a);
    $('destAlbumLabel').textContent = a ? a.title : '';
    $('destAlbumStatus').textContent = a ? '' : 'אלבום לא זמין לשיר הזה';
    positionDestinationSheet();
  });
}
function positionDestinationSheet() {
  const sheet = $('destinationSheet'), anchor = $('pArtist').getBoundingClientRect();
  const width = Math.min(247, innerWidth - 32), height = sheet.offsetHeight || (destinationAlbum ? 132 : 100);
  const top = anchor.top >= height + 28 ? anchor.top - height - 12 : anchor.bottom + 12;
  sheet.style.left = Math.max(16, Math.min(innerWidth - width - 16, anchor.right - width)) + 'px';
  sheet.style.top = Math.max(16, Math.min(innerHeight - height - 16, top)) + 'px';
}
$('destArtist').addEventListener('click', () => {
  const t = destinationTrack;
  closeSheet('destinationSheet'); closePlayer();
  if (!t?.artist) return;
  openOfficialArtist(t.artist, t.ch || '');
});
$('destAlbum').addEventListener('click', () => {
  const a = destinationAlbum;
  if (!a?.plId) return;
  closeSheet('destinationSheet');
  animateAlbumRoute(a);
});

function animateAlbumRoute(a) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { openAlbum(a); closePlayer(); return; }
  const source = $('pArt'), rect = source.getBoundingClientRect();
  const cover = document.createElement('img');
  cover.className = 'album-route-cover'; cover.alt = '';
  const art = a.thumb || source.currentSrc || source.src;
  cover.src = art;
  if (!a.thumb) a = { ...a, thumb: art };
  cover.style.left = rect.left + 'px'; cover.style.top = rect.top + 'px';
  cover.style.width = rect.width + 'px'; cover.style.height = rect.height + 'px';
  document.body.appendChild(cover);
  openAlbum(a);
  closePlayer();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const target = $('alArt').getBoundingClientRect();
    cover.style.left = target.left + 'px'; cover.style.top = target.top + 'px';
    cover.style.width = target.width + 'px'; cover.style.height = target.height + 'px';
    cover.style.opacity = '.35';
  }));
  setTimeout(() => cover.remove(), 360);
}

let sheetTrack = null, sheetOpts = {};
function openSongSheet(t, opts = {}) {
  sheetTrack = t; sheetOpts = opts;
  $('songSheetHead').innerHTML = `<img src="${thumb(t.id)}" alt=""><div class="meta"><div class="t"></div><div class="a dim"></div></div>`;
  $('songSheetHead').querySelector('.t').textContent = t.title;
  $('songSheetHead').querySelector('.a').textContent = t.artist;
  setIcon($('ssFav'), state.fav[t.id] ? 'heart-fill' : 'heart');
  $('ssFav').querySelector('span').textContent = state.fav[t.id] ? 'בטל אהבתי' : 'אהבתי';
  $('ssArtist').classList.toggle('hidden', !t.artist);
  $('ssAlbum').classList.toggle('hidden', !t.album?.plId);
  $('ssAlbumName').textContent=t.album?.title||'';
  if (!t.album?.plId) verifiedAlbumFor(t).then(a=>{if(sheetTrack?.id!==t.id || !a)return; $('ssAlbum').classList.remove('hidden'); $('ssAlbumName').textContent=a.title; sheetOpts.verifiedAlbum=a;});
  $('ssQueueNext').classList.toggle('hidden', !current());
  $('ssQueueLast').classList.toggle('hidden', !current());
  $('ssRemove').classList.toggle('hidden', !opts.onRemove);
  const preview=$('songPreview'), sheet=$('songSheet');
  sheet.classList.remove('is-closing');
  preview.classList.toggle('hidden', !opts.preview);
  sheet.classList.toggle('has-preview', !!opts.preview);
  $('songPreviewTitle').textContent=t.title; $('songPreviewArtist').textContent=t.artist||'';
  $('songPreviewArt').src=thumb(t.id);
  if (opts.preview && opts.sourceRow?.isConnected && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // Animate the source row into the preview card. Leave the panel untransformed
    // so the preview's fixed layout can be measured without stacking transforms.
    sheet._hideTicket=(sheet._hideTicket||0)+1;
    sheet.classList.remove('row-preview-motion', 'open', 'hidden');
    const from=opts.sourceRow.getBoundingClientRect(), to=preview.getBoundingClientRect();
    const fromX=from.left+from.width/2, toX=to.left+to.width/2;
    const fromY=from.top+from.height/2, toY=to.top+to.height/2;
    preview.style.setProperty('--preview-x', (fromX-toX)+'px');
    preview.style.setProperty('--preview-y', (fromY-toY)+'px');
    preview.style.setProperty('--preview-scale', Math.min(1,Math.max(.38,from.width/to.width)).toFixed(3));
    sheet.classList.add('row-preview-motion');
    // The first frame paints the collapsed source before expanding it.
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(!sheet.classList.contains('row-preview-motion') || sheet.classList.contains('hidden')) return;
      sheet.classList.add('open'); $('scrim').classList.add('on');
    }));
  } else { sheet._sourceRow = null; sheet.classList.remove('row-preview-motion'); openSheet('songSheet'); }
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
$('songShortcutShare').addEventListener('click',()=>$('ssShare').click());
$('songShortcutFav').addEventListener('click',()=>$('ssFav').click());
$('songShortcutAdd').addEventListener('click',()=>$('ssAdd').click());
$('songPreviewPlay').addEventListener('click',()=>{const play=sheetOpts.onPlay;closeSheet('songSheet');if(play)play();else if(sheetTrack)playQueue([sheetTrack],0);});
$('ssAdd').addEventListener('click', () => { closeSheet('songSheet'); if (sheetTrack) openAddSheet(sheetTrack); });
$('ssArtist').addEventListener('click', () => { closeSheet('songSheet'); if (sheetTrack?.artist) { if($('queueSheet').classList.contains('open'))closeSheet('queueSheet'); closePlayer(); openOfficialArtist(sheetTrack.artist, sheetTrack.ch || ''); } });
$('ssRemove').addEventListener('click', () => { closeSheet('songSheet'); if (sheetOpts.onRemove) sheetOpts.onRemove(); });
$('ssAlbum').addEventListener('click',()=>{const a=sheetTrack?.album?.plId?sheetTrack.album:sheetOpts.verifiedAlbum;closeSheet('songSheet');if(a){if($('queueSheet').classList.contains('open'))closeSheet('queueSheet');closePlayer();openAlbum(a);}});
$('ssLyrics').addEventListener('click',()=>{const t=sheetTrack;closeSheet('songSheet');if(t){if(current()?.id===t.id){if($('queueSheet').classList.contains('open'))closeSheet('queueSheet');openLyrics();}else toast('המילים זמינות לשיר המתנגן');}});

function shareSong(t) {
  const url = location.origin + location.pathname + '?song=' + t.id;
  const data = { title: 'Avi Music', text: t.title + (t.artist ? ' · ' + t.artist : ''), url };
  if (navigator.share) return navigator.share(data).catch(e => { if (e?.name !== 'AbortError') toast('לא הצלחתי לשתף'); });
  return navigator.clipboard.writeText(url).then(() => toast('הקישור לשיר הועתק')).catch(() => toast(url, 6000));
}
$('ssShare').addEventListener('click', () => { const t = sheetTrack; closeSheet('songSheet'); if (t) shareSong(t); });
$('ssQueueNext').addEventListener('click', () => {
  const t = sheetTrack; closeSheet('songSheet'); if (!t || !current()) return;
  state.queue.splice(state.qi + 1, 0, t); save(); if ($('queueSheet').classList.contains('open')) renderQueue(); toast('נוסף להבא בתור');
});
$('ssQueueLast').addEventListener('click', () => {
  const t = sheetTrack; closeSheet('songSheet'); if (!t || !current()) return;
  state.queue.push(t); save(); if ($('queueSheet').classList.contains('open')) renderQueue(); toast('נוסף לסוף התור');
});
$('ssStation').addEventListener('click', async () => {
  const t = sheetTrack; closeSheet('songSheet'); if (!t) return;
  try {
    const j = await pipedFetch('/streams/' + t.id, 8000);
    const rel = (j.relatedStreams || []).filter(x => x.url && x.type === 'stream')
      .map(mapStream).filter(x => x.id && x.id !== t.id);
    playQueue([t, ...rel], 0, { station: { seed: t.id, name: 'התחנה של ' + (t.artist || t.title) } });
  } catch { toast('יצירת התחנה לא זמינה כרגע'); }
});
$('ssArtist').addEventListener('click', () => {
  const t = sheetTrack; closeSheet('songSheet');
  if (!t?.ch && t?.artist) searchArtistAndOpen(t.artist);
});
$('ssLess').addEventListener('click', () => {
  if (!sheetTrack) return;
  const t = sheetTrack; state.lessSuggestions ||= {};
  state.lessSuggestions[t.id] = true; save(); closeSheet('songSheet');
  toast('נציג פחות הצעות מהשיר הזה');
});


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
      else { state.playlists[name].push(t); save(); toast(`נוסף ל"${name}"`); }
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
  save(); closeAllSheets(); toast(`נוסף ל"${name}"`);
});

/* The player queue is a full-height overlay with controls kept available below it. */
const qHead = txt => { const h = document.createElement('div'); h.className = 'qsect'; h.textContent = txt; return h; };
function queueRowOptions(row, t) {
  const dot = row.querySelector('.dots');
  if (!dot) return;
  const replacement = dot.cloneNode(true);
  dot.replaceWith(replacement);
  replacement.addEventListener('click', e => {
    e.stopPropagation();
    openSongSheet(t, {preview:true,sourceRow:row});
  });
}
let queueHistoryVisible = false;
function renderQueue() {
  const box = $('queueList'), cur = current();
  queueDragEvents?.abort(); queueDragEvents = new AbortController(); box.replaceChildren();
  $('queueTitle').textContent = cur?.title || '';
  $('queueArtist').textContent = cur?.artist || '';
  $('queueArt').src = cur?.id ? sqThumb(cur.id, 'hq') : '';
  $('queueArt').onerror = () => { if (cur?.id && $('queueArt').dataset.fallback !== cur.id) { $('queueArt').dataset.fallback = cur.id; $('queueArt').src = thumb(cur.id); } };
  $('queueHero').classList.toggle('hidden', !cur);
  $('queueFav').classList.toggle('on', !!(cur && state.fav[cur.id]));
  setIcon($('queueFav'), cur && state.fav[cur.id] ? 'star-fill' : 'star');
  for (const [id, on] of [['queueShuffle', state.shuffle], ['queueRepeat', state.repeat !== 'off'], ['queueAuto', state.autoNext], ['queueMix', false]])
    $(id).classList.toggle('on', !!on);
  setIcon($('queueRepeat'), state.repeat === 'one' ? 'repeat1' : 'repeat');
  if (queueHistoryVisible) {
    box.appendChild(qHead('ניגן קודם'));
    const played = state.playedHistory || [];
    if (!played.length) { const empty=document.createElement('div'); empty.className='qhist-empty'; empty.textContent='השירים שתשמע מכאן והלאה יופיעו כאן'; box.appendChild(empty); }
    played.forEach(t => {
      const row=trackRow(t,{onPlay:()=>{playQueue([t],0);renderQueue();}});
      row.classList.add('qhist'); queueRowOptions(row,t); box.appendChild(row);
    });
  }
  box.appendChild(qHead('תור'));
  const ahead = state.queue.slice(state.qi + 1);
  ahead.forEach((t, i) => {
    const row = trackRow(t, { onPlay: () => {
      if (row.classList.contains('swiped')) { row.classList.remove('swiped'); return; }
      recordPlayed(current()); state.qi += 1 + i; pushHistory(t); loadTrack(t); paintNow(); save(); renderQueue(); ensureUpNext();
    } });
    row.classList.add('qnext'); queueRowOptions(row, t);
    const remove = document.createElement('button'); remove.className = 'qremove'; remove.setAttribute('aria-label', 'הסר מהתור'); remove.textContent = '✕';
    remove.addEventListener('click', e => { e.stopPropagation(); state.queue.splice(state.qi + 1 + i, 1); save(); renderQueue(); });
    row.appendChild(remove);
    let touchStart; row.addEventListener('touchstart', e => { if (e.touches.length === 1) touchStart = {x:e.touches[0].clientX,y:e.touches[0].clientY}; }, {passive:true});
    row.addEventListener('touchend', e => { if (!touchStart) return; const t=e.changedTouches[0];
      if (t.clientX - touchStart.x > 55 && Math.abs(t.clientY - touchStart.y)<45) row.classList.add('swiped');
      if (touchStart.x - t.clientX > 55 && Math.abs(t.clientY - touchStart.y)<45) row.classList.remove('swiped'); touchStart=null; }, {passive:true});
    const handle = document.createElement('span'); handle.className = 'qhandle'; handle.textContent = '☰'; handle.setAttribute('aria-label', 'גרור לשינוי סדר');
    row.appendChild(handle); attachQueueDrag(handle, row, state.qi + 1 + i);
    box.appendChild(row);
  });
  const add = document.createElement('button'); add.className = 'qadd'; add.innerHTML = '<span class="qadd-icon">+</span><span>הוספת שירים לתור</span>';
  add.addEventListener('click', () => { closeSheet('queueSheet'); switchTab('search'); $('searchInput').focus(); }); box.appendChild(add);
  const label = document.createElement('div'); label.className = 'qautonote';
  label.textContent = state.autoNext ? '∞ הפעלה אינסופית · שמירת עד 10 שירים בהמשך התור' : '∞ הפעלה אינסופית כבויה'; box.appendChild(label);
  syncQueueTransport();
}
function syncQueueTransport(knownPaused) {
  const paused = knownPaused == null ? (activeAudio() ? M().paused : (ytReady && yt.getPlayerState ? yt.getPlayerState() !== YT.PlayerState.PLAYING : true)) : knownPaused;
  setIcon($('queuePlay'), paused ? 'play' : 'pause');
  if (!$('queueSeek').matches(':active')) { $('queueSeek').value = $('seek').value; $('queueSeek').style.setProperty('--queue-progress', (+$('seek').value / 10) + '%'); }
  $('queueElapsed').textContent = $('tCur').textContent;
  $('queueRemaining').textContent = $('tRem').textContent;
}
$('cQueue').addEventListener('click', () => { queueHistoryVisible=false; renderQueue(); openSheet('queueSheet'); });
$('pQueueTop').addEventListener('click', () => $('cQueue').click());
(function queuePullHistory(){
  const list=$('queueList'); let start=null;
  list.addEventListener('touchstart', e=>{
    if(e.touches.length!==1 || e.target.closest('button, input, .qhandle')) return;
    start=list.scrollTop <= 2 ? {x:e.touches[0].clientX,y:e.touches[0].clientY}:null;
  },{passive:true});
  list.addEventListener('touchend', e=>{
    if(!start) return;
    const dx=e.changedTouches[0].clientX-start.x, dy=e.changedTouches[0].clientY-start.y; start=null;
    if(dy > 65 && dy > Math.abs(dx)*1.4 && !queueHistoryVisible) { queueHistoryVisible=true; renderQueue(); list.scrollTop=0; }
  },{passive:true});
  list.addEventListener('touchcancel',()=>{start=null},{passive:true});
})();
$('queueClose').addEventListener('click', () => closeSheet('queueSheet'));
// The top grab/header dismisses the queue; the song list keeps its own vertical scroll.
(function queueTopDismiss() {
  const sheet = $('queueSheet');
  let start = null;
  sheet.addEventListener('touchstart', e => {
    if (e.touches.length !== 1 || e.target.closest('button, input, #queueList')) return;
    const y = e.touches[0].clientY;
    const headerBottom = $('queueHero').getBoundingClientRect().bottom;
    start = y <= headerBottom ? { x:e.touches[0].clientX, y } : null;
  }, { passive:true });
  sheet.addEventListener('touchend', e => {
    if (!start || !sheet.classList.contains('open')) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (dy > 65 && dy > Math.abs(dx) * 1.4) closeSheet('queueSheet');
    start = null;
  }, { passive:true });
  sheet.addEventListener('touchcancel', () => { start = null; }, { passive:true });
})();
$('queueMore').addEventListener('click', () => { const t=current(); if (t) { closeSheet('queueSheet'); setTimeout(() => openSongSheet(t), 250); } });
$('queueFav').addEventListener('click', () => { if (current()) { toggleFav(current()); renderQueue(); } });
function holdSkip(btn, direction) {
  let timer = null, running = false, rewind = null, started = 0, finished = false;
  const stop = e => {
    if (finished) return; finished = true;
    clearTimeout(timer); timer = null;
    if (rewind) { clearInterval(rewind); rewind = null; }
    if (running) {
      if (activeAudio()) M().playbackRate = 1;
      else if (ytReady) { try { yt.setPlaybackRate(1); } catch {} }
    }
    btn.classList.remove('is-pressing');
    const wasLong = running; running = false;
    if (!wasLong && e?.type === 'pointerup' && Date.now() - started < 700) {
      if (direction > 0) next(); else advance(-1, false);
    }
  };
  btn.addEventListener('pointerdown', e => {
    e.preventDefault(); finished = false; started = Date.now();
    if (btn.classList.contains('skipbtn')) btn.classList.add('is-pressing');
    if (btn.setPointerCapture) btn.setPointerCapture(e.pointerId);
    timer = setTimeout(() => {
      running = true;
      if (direction > 0) {
        if (activeAudio()) M().playbackRate = 2;
        else if (ytReady) { try { yt.setPlaybackRate(2); } catch {} }
      } else {
        // HTML media playbackRate=-2 is unsupported on iOS; rewind by seeking.
        rewind = setInterval(() => {
          if (activeAudio()) M().currentTime = Math.max(0, M().currentTime - .2);
          else if (ytReady) yt.seekTo(Math.max(0, yt.getCurrentTime() - .2), true);
        }, 100);
      }
    }, 300);
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(event, stop);
  btn.addEventListener('click', e => {
    if (e.detail) { e.preventDefault(); return; }
    if (direction > 0) next(); else advance(-1, false);
  });
}
for (const [id, direction] of [['queuePrev', -1], ['queueNext', 1], ['cPrev', -1], ['cNext', 1]]) holdSkip($(id), direction);
$('queuePlay').addEventListener('click', () => { togglePlay(); setTimeout(syncQueueTransport, 150); });
$('queueSeek').addEventListener('input', e => { e.target.style.setProperty('--queue-progress', (+e.target.value / 10) + '%'); $('seek').value = e.target.value; $('seek').dispatchEvent(new Event('input', { bubbles:true })); });
$('queueSeek').addEventListener('change', e => { $('seek').value = e.target.value; $('seek').dispatchEvent(new Event('change', { bubbles:true })); });
$('queueShuffle').addEventListener('click', () => { $('cShuffle').click(); renderQueue(); });
$('queueRepeat').addEventListener('click', () => { $('cRepeat').click(); renderQueue(); });
$('queueAuto').addEventListener('click', () => {
  state.autoNext = !state.autoNext; save(); renderQueue();
  if (state.autoNext) ensureUpNext();
});
$('queueMix').addEventListener('click', () => {
  toast('מעבר חלק עדיין לא זמין');
});
let queueDragEvents;
function attachQueueDrag(handle, row, sourceIndex) {
  const list = $('queueList');
  let pointer = null, startY = 0, grabOffset = 0;
  let moving = false, raf = 0, lastY = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rows = () => [...list.querySelectorAll('.qnext')];
  const visualTop = () => {
    const rect = row.getBoundingClientRect();
    const y = Number(row.dataset.dragY || 0);
    return rect.top - y;
  };
  const positionLift = () => {
    const y = lastY - grabOffset - visualTop();
    row.dataset.dragY = String(y);
    row.style.transform = `translateY(${y}px) scale(1.035)`;
  };
  const reflow = () => {
    if (pointer === null || !moving) return;
    const bounds = list.getBoundingClientRect();
    const edge = 55;
    const velocity = lastY < bounds.top + edge ? -10 : lastY > bounds.bottom - edge ? 10 : 0;
    if (velocity) list.scrollTop += velocity;
    const others = rows().filter(x => x !== row);
    const center = lastY - grabOffset + row.offsetHeight / 2;
    const sheetTop = $('queueSheet').getBoundingClientRect().top;
    const target = others.find(x => center < sheetTop + x.offsetTop - list.scrollTop + x.offsetHeight / 2);
    const before = target || list.querySelector('.qadd');
    const at = row.nextElementSibling;
    if (before !== at) {
      const old = new Map(others.map(x => [x, x.getBoundingClientRect().top]));
      list.insertBefore(row, before);
      for (const other of others) {
        const dy = old.get(other) - other.getBoundingClientRect().top;
        if (Math.abs(dy) < 1 || reduced) continue;
        other.getAnimations().forEach(a => a.cancel());
        other.animate([{transform:`translateY(${dy}px)`},{transform:'translateY(0)'}],
          {duration:210,easing:'cubic-bezier(.2,.8,.2,1)'});
      }
    }
    positionLift();
    raf = requestAnimationFrame(reflow);
  };
  const move = e => {
    if (e.pointerId !== pointer) return;
    lastY = e.clientY;
    if (!moving && Math.abs(lastY - startY) < 6) return;
    if (!moving) {
      moving = true;
      row.classList.add('qdragging');
      list.classList.add('qreordering');
      row.style.zIndex = '4';
      // The list keeps pointer capture while DOM siblings move underneath.
      raf = requestAnimationFrame(reflow);
    }
    positionLift();
  };
  const end = e => {
    if (e.pointerId !== pointer) return;
    const wasMoving = moving;
    pointer = null; moving = false;
    cancelAnimationFrame(raf); raf = 0;
    if (list.hasPointerCapture?.(e.pointerId)) list.releasePointerCapture(e.pointerId);
    list.classList.remove('qreordering');
    row.classList.remove('qdragging');
    row.style.transform = ''; row.style.zIndex = ''; delete row.dataset.dragY;
    if (!wasMoving || e.type !== 'pointerup') return;
    const destination = rows().indexOf(row);
    if (destination < 0 || destination === sourceIndex - state.qi - 1) return;
    const [item] = state.queue.splice(sourceIndex, 1);
    state.queue.splice(state.qi + 1 + destination, 0, item);
    save();
    if (reduced) renderQueue();
    else {
      row.animate([{transform:'scale(1.035)'},{transform:'scale(1)'}], {duration:160,easing:'ease-out'});
      setTimeout(() => { if (row.isConnected) renderQueue(); }, 165);
    }
  };
  handle.addEventListener('pointerdown', e => {
    if (pointer !== null || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    pointer = e.pointerId; startY = lastY = e.clientY;
    grabOffset = e.clientY - row.getBoundingClientRect().top;
    list.setPointerCapture(e.pointerId);
  });
  list.addEventListener('pointermove', move, {signal:queueDragEvents.signal});
  list.addEventListener('pointerup', end, {signal:queueDragEvents.signal});
  list.addEventListener('pointercancel', end, {signal:queueDragEvents.signal});
  list.addEventListener('lostpointercapture', end, {signal:queueDragEvents.signal});
}
/* share: deep link into OUR app (?song=<id>) - the future app share mechanism */
$('cOpenYT').addEventListener('click', async () => {
  const t = current(); if (!t) return;
  const url = location.origin + location.pathname + '?song=' + t.id;
  const data = { title: 'Avi Music', text: t.title + (t.artist ? ' · ' + t.artist : ''), url };
  if (navigator.share) { try { await navigator.share(data); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(url); toast('הקישור לשיר הועתק'); } catch { toast(url, 6000); }
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
    if (e.target.closest('button, input, a, video, .volrow, #ytwrap, .pmeta2')) return;
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
$('mini').addEventListener('click', e => { if (!e.target.closest('button')) openPlayer(); });
$('mCollapse').addEventListener('click', () => {
  miniCollapsed = !miniCollapsed;
  $('mini').classList.toggle('collapsed', miniCollapsed);
  $('mCollapse').setAttribute('aria-expanded', String(!miniCollapsed));
  $('mCollapse').setAttribute('aria-label', miniCollapsed ? 'הרחב את הנגן הממוזער' : 'מזער את הנגן הממוזער');
});
$('mOptions').addEventListener('click', () => { const t = current(); if (t) openSongSheet(t); });

/* ---------- player controls ---------- */
$('mPlay').addEventListener('click', togglePlay);
$('cPlay').addEventListener('click', togglePlay);
$('mNext').addEventListener('click', next);
$('pFav').addEventListener('click', () => { const t = current(); if (t) toggleFav(t); });
$('pDots').addEventListener('click', () => { const t = current(); if (t) openSongSheet(t); });
$('pArtist').addEventListener('click', () => openSongDestinationSheet(current()));
$('pTitle').addEventListener('click', () => openSongDestinationSheet(current()));
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
$('cLyrics').addEventListener('click', openLyrics);

/* ---------- AirPlay / cast ---------- */
$('cCast').addEventListener('click', async () => {
  try {
    // iOS Safari exposes AirPlay only on video elements
    if (clipEl.webkitShowPlaybackTargetPicker) {
      if (engine === 'audio' && audioEl.src && !videoMode) {
        // route the current audio stream through the video element so AirPlay can pick it up
        const pos = audioEl.currentTime || 0, wasPlaying = !audioEl.paused;
        clipEl.dataset.vid = audioEl.dataset.vid;
        clipEl.src = audioEl.src;
        try { clipEl.currentTime = pos; } catch {}
        audioEl.pause();
        engine = 'clip'; paintEngineBadge();
        if (wasPlaying) clipEl.play().catch(() => {});
      } else if (engine === 'yt') {
        toast('שידור זמין במצב שמע ישיר או קליפ');
        return;
      }
      clipEl.webkitShowPlaybackTargetPicker();
      return;
    }
    const el = activeAudio() ? M() : null;
    if (el && el.remote && el.remote.prompt) { await el.remote.prompt(); return; }
    toast('שידור לא נתמך בדפדפן הזה');
  } catch (e) { /* user cancelled the picker */ }
});


/* ---------- lyrics view (in-app, Apple Music style) ---------- */
const lyrSync = { lines: null, timer: 0, vid: '', lastCur: -1, manualUntil: 0 };
function parseLRC(s) {
  const out = [];
  const re = /\[(\d+):(\d+(?:\.\d+)?)\]/g;
  for (const row of s.split('\n')) {
    const txt = row.replace(re, '').trim();
    if (!txt) continue;
    re.lastIndex = 0;
    let m; while ((m = re.exec(row))) out.push({ t: +m[1] * 60 + +m[2], text: txt });
  }
  return out.sort((a, b) => a.t - b.t);
}
// The catalogue often carries uploader suffixes; normalize them, but never display
// another song's lyrics just because a fuzzy search returned something.
function lyricQueryTitle(s) {
  return String(s || '').normalize('NFKC')
    .replace(/[\u05F3\u2018\u2019\u0060\u00B4]/g, "'")
    .replace(/[\u05F4\u201C\u201D]/g, '"')
    .replace(/\s*[-–—]\s*(?:topic|הערוץ הרשמי|official(?: music)? (?:video|audio))\s*$/i, '')
    .replace(/\s*\((?:official(?: music)? (?:video|audio)|audio only|lyrics?)\)\s*$/i, '')
    .trim();
}
function lyricKey(s) { return normTxt(lyricQueryTitle(s)).replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
function lyricMatch(x, t) {
  const title = lyricKey(t.title), artist = lyricKey(t.artist);
  const xt = lyricKey(x.trackName || x.name), xa = lyricKey(x.artistName);
  if (!title || !xt || !(xt === title || (xt.includes(title) && title.length > 6))) return false;
  if (artist && xa && xa !== artist && !xa.includes(artist) && !artist.includes(xa)) return false;
  if (t.dur && x.duration && Math.abs(x.duration - t.dur) > 8) return false;
  return !!(x.syncedLyrics || x.plainLyrics || x.instrumental);
}
async function lyricRequest(url, ms = 7000) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (r.ok) return await r.json();
      if (r.status !== 429 && r.status !== 503) return null;
    } catch { /* bounded retry on a transient network error */ }
    finally { clearTimeout(timer); }
    if (!attempt) await new Promise(resolve => setTimeout(resolve, 450));
  }
  return null;
}
const lyricCache = new Map();
async function fetchLyrics(t) {
  if (!t?.title || !t?.artist) return null;
  const title = lyricQueryTitle(t.title);
  const artist = lyricQueryTitle(t.artist);
  const key = [title, artist, Math.round(t.dur || 0)].join('|');
  const cached = lyricCache.get(key);
  if (cached && Date.now() - cached.at < (cached.value ? 60 * 60 * 1000 : 2 * 60 * 1000)) return cached.value;
  const q = new URLSearchParams({ track_name: title, artist_name: artist });
  if (t.dur) q.set('duration', Math.round(t.dur));
  let j = await lyricRequest('https://lrclib.net/api/get?' + q);
  if (j && lyricMatch(j, t)) { lyricCache.set(key, { at: Date.now(), value: j }); return j; }
  const variants = [title];
  // A punctuation-neutral query helps Hebrew geresh and curly quotes, which
  // LRCLIB indexes inconsistently. The returned artist/title/duration still
  // have to match; this only changes the lookup words, not the identity check.
  const punctuationNeutral = title.replace(/[\u05F3'\u2018\u2019\u0060\u00B4]/g, '');
  if (punctuationNeutral !== title) variants.push(punctuationNeutral);
  const urls = [];
  for (const v of variants) urls.push('https://lrclib.net/api/search?track_name=' + encodeURIComponent(v) + '&artist_name=' + encodeURIComponent(artist));
  urls.push('https://lrclib.net/api/search?q=' + encodeURIComponent([punctuationNeutral, artist].filter(Boolean).join(' ')));
  for (const url of [...new Set(urls)]) {
    const arr = await lyricRequest(url);
    if (!Array.isArray(arr)) continue;
    const matches = arr.filter(x => lyricMatch(x, t));
    if (matches.length) {
      j = matches.sort((a, b) => Number(!!b.syncedLyrics) - Number(!!a.syncedLyrics) ||
        Math.abs((a.duration || t.dur || 0) - (t.dur || 0)) - Math.abs((b.duration || t.dur || 0) - (t.dur || 0)))[0];
      lyricCache.set(key, { at: Date.now(), value: j }); return j;
    }
  }
  lyricCache.set(key, { at: Date.now(), value: null });
  return null;
}
function curTimeS() { return activeAudio() ? (M().currentTime || 0) : (ytReady && yt.getCurrentTime ? yt.getCurrentTime() : 0); }
function seekAbsS(s) {
  if (activeAudio()) { try { M().currentTime = s; } catch {} }
  else if (ytReady && yt.seekTo) yt.seekTo(s, true);
}
async function openLyrics() {
  const t = current(); if (!t) return;
  lyrSync.vid = t.id; lyrSync.lines = null; lyrSync.lastCur = -1; lyrSync.manualUntil = 0; clearInterval(lyrSync.timer);
  $('lyrView').classList.remove('hidden');
  requestAnimationFrame(() => $('lyrView').classList.add('open'));
  $('lyrTitle').textContent = t.title;
  $('lyrArtist').textContent = t.artist;
  $('lyrBg').style.backgroundImage = "url('" + sqThumb(t.id) + "')";
  const body = $('lyrBody');
  body.innerHTML = '<div class="lyrnote2 dim">טוען מילים…</div>';
  const j = await fetchLyrics(t);
  if (lyrSync.vid !== t.id || $('lyrView').classList.contains('hidden')) return;
  if (j && j.instrumental) { body.innerHTML = '<div class="lyrnote2 dim">שיר אינסטרומנטלי</div>'; return; }
  if (!j || (!j.syncedLyrics && !j.plainLyrics)) {
    body.innerHTML = '<div class="lyrnote2 dim">אין מילים מאומתות לשיר הזה כרגע <button type="button" id="lyrRetry">נסה שוב</button></div>';
    $('lyrRetry').addEventListener('click', () => openLyrics());
    return;
  }
  if (j.syncedLyrics) {
    const lines = parseLRC(j.syncedLyrics);
    if (lines.length) { renderSyncedLyrics(lines); return; }
  }
  renderPlainLyrics(j.plainLyrics || '');
}
function renderSyncedLyrics(lines) {
  lyrSync.lines = lines;
  const body = $('lyrBody'); body.innerHTML = '';
  for (const l of lines) {
    const d = document.createElement('div'); d.className = 'lyrline'; d.dir = 'auto'; d.textContent = l.text;
    d.addEventListener('click', () => seekAbsS(l.t));
    body.appendChild(d);
  }
  clearInterval(lyrSync.timer);
  lyrSync.timer = setInterval(paintLyrics, 250);
  paintLyrics();
}
function paintLyrics() {
  const lines = lyrSync.lines;
  if (!lines || !$('lyrView').classList.contains('open')) return;
  const c = curTimeS();
  let cur = 0;
  for (let i = 0; i < lines.length; i++) { if (lines[i].t <= c + 0.2) cur = i; else break; }
  const els = $('lyrBody').children;
  for (let i = 0; i < els.length; i++) els[i].className = 'lyrline' + (i === cur ? ' cur' : i < cur ? ' past' : '');
  const el = els[cur];
  if (el && cur !== lyrSync.lastCur && Date.now() > lyrSync.manualUntil) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  lyrSync.lastCur = cur;
}
function renderPlainLyrics(txt) {
  lyrSync.lines = null; clearInterval(lyrSync.timer);
  const body = $('lyrBody'); body.innerHTML = '';
  for (const row of txt.split('\n')) {
    const d = document.createElement('div'); d.className = 'lyrline plain'; d.dir = 'auto'; d.textContent = row.trim() || '\u00A0';
    body.appendChild(d);
  }
}

(() => {
  const b = $('lyrBody');
  if (!b) return;
  const manual = () => { lyrSync.manualUntil = Date.now() + 6000; };
  b.addEventListener('pointerdown', manual);
  b.addEventListener('wheel', manual, { passive: true });
})();

/* ---------- karaoke: center-channel vocal attenuation (Web Audio) ---------- */
let actx = null, kara = null, karaAmt = 0;
function ensureKaraoke() {
  if (kara) return true;
  if (!audioEl.src) return false;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const src = actx.createMediaElementSource(audioEl);
    const split = actx.createChannelSplitter(2);
    const invR = actx.createGain(); invR.gain.value = -1;
    const invL = actx.createGain(); invL.gain.value = -1;
    const wetL = actx.createGain(); // out L = L - R (center cancels)
    const wetR = actx.createGain(); // out R = R - L
    src.connect(split);
    split.connect(wetL, 0); split.connect(invR, 1); invR.connect(wetL);
    split.connect(wetR, 1); split.connect(invL, 0); invL.connect(wetR);
    const dry = actx.createGain(); const wet = actx.createGain();
    src.connect(dry); dry.connect(actx.destination);
    wetL.connect(wet); wetR.connect(wet); wet.connect(actx.destination);
    wet.gain.value = 0;
    kara = { dry, wet };
    return true;
  } catch { return false; }
}
function setKaraoke(amt) {
  karaAmt = amt;
  $('karaokeBtn').classList.toggle('on', amt > 0);
  if (amt > 0 && !(engine === 'audio' && !videoMode && audioEl.crossOrigin === 'anonymous')) { toast('קריוקי זמין במצב שמע ישיר'); return; }
  if (amt > 0) {
    if (!ensureKaraoke()) { toast('קריוקי לא זמין לשיר הזה'); return; }
    if (actx.state === 'suspended') actx.resume().catch(() => {});
  }
  if (!kara) return;
  kara.dry.gain.value = 1 - amt;
  kara.wet.gain.value = amt;
}
$('karaokeBtn').addEventListener('click', () => {
  const s = $('karaokeSlider');
  if (s.classList.contains('hidden')) {
    s.classList.remove('hidden');
    if (karaAmt === 0) { s.value = 70; setKaraoke(0.7); }
  } else {
    s.classList.add('hidden');
    s.value = 0; setKaraoke(0);
  }
});
$('karaokeSlider').addEventListener('input', () => setKaraoke($('karaokeSlider').value / 100));

function closeLyrics() {
  clearInterval(lyrSync.timer);
  $('lyrView').classList.remove('open');
  setTimeout(() => $('lyrView').classList.add('hidden'), 400);
}
$('lyrClose').addEventListener('click', closeLyrics);

const volEl = $('vol');
volEl.value = state.volume;
function applyVolume() {
  const v = state.volume;
  try { audioEl.volume = v / 100; } catch {}
  try { clipEl.volume = v / 100; } catch {}
  if (ytReady && yt.setVolume) yt.setVolume(v);
  if (volEl) {
    volEl.value = v;
    volEl.style.setProperty('--vol-fill', `${100 - v}%`);
  }
}
volEl.addEventListener('input', () => {
  state.volume = +volEl.value; save();
  applyVolume();
});
applyVolume();
const seekEl = $('seek');
function paintSeekFill() { seekEl.style.setProperty('--seek-fill', `${(+seekEl.value / 10).toFixed(1)}%`); }
paintSeekFill();
function seekDuration() {
  if (activeAudio()) return M().duration || 0;
  return ytReady && yt.getDuration ? yt.getDuration() || 0 : 0;
}
function applySeek() {
  const d = seekDuration();
  if (!(d > 0)) return;
  const time = (+seekEl.value / 1000) * d;
  if (activeAudio()) M().currentTime = time;
  else if (ytReady && yt.seekTo) yt.seekTo(time, true);
}
seekEl.addEventListener('input', () => {
  seeking = true; paintSeekFill();
  const d = seekDuration();
  if (d > 0) { $('tCur').textContent = fmt((+seekEl.value / 1000) * d); $('tRem').textContent = fmtRem((+seekEl.value / 1000) * d, d); }
  applySeek();
});
seekEl.addEventListener('change', () => { applySeek(); seeking = false; });
seekEl.addEventListener('pointerup', () => { seeking = false; });
seekEl.addEventListener('pointercancel', () => { seeking = false; });
seekEl.addEventListener('blur', () => { seeking = false; });

/* Song-only playback. Keep the video element solely for native AirPlay routing. */
let videoMode = false;

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
function tabGlassVertical(bar) {
  const btns = bar ? bar.querySelectorAll('.tabbtn') : [];
  return btns.length > 1 && btns[1].offsetTop > btns[0].offsetTop + 4;
}
function moveTabGlass() {
  const g = document.querySelector('.tabglass');
  const b = document.querySelector('.tabbtn.on');
  if (!g || !b) return;
  const vertical = tabGlassVertical(b.parentElement);
  g.style.left = b.offsetLeft + 'px';
  g.style.width = b.offsetWidth + 'px';
  if (vertical) { g.style.top = b.offsetTop + 'px'; g.style.height = b.offsetHeight + 'px'; }
  else { g.style.top = (b.offsetTop + 5) + 'px'; g.style.height = Math.max(0, b.offsetHeight - 10) + 'px'; }
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
  if (name === 'search') renderSearchHome();
}
function activateTab(b) {
  const currentTab = document.querySelector('.tabbtn.on')?.dataset.tab;
  if (b.dataset.tab === currentTab) {
    const page = document.querySelector('.page.on');
    if (page) { closePage(page.id); return; }
    if (currentTab === 'search') {
      const input = $('searchInput'); input.value = ''; hideSugg();
      $('clearSearch').classList.add('hidden');
      $('searchHome').classList.remove('hidden'); $('searchRes').classList.add('hidden');
      renderSearchHome(); $('view-search').scrollTo({ top: 0, behavior: 'smooth' }); return;
    }
    const view = $('view-' + currentTab); if (view) view.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  switchTab(b.dataset.tab);
}
document.querySelectorAll('.tabbtn').forEach(b => b.addEventListener('click', () => activateTab(b)));
/* Pull down to dismiss the topmost overlay. A scrollable child must be at its top;
   controls and the queue keep their own gestures. */
(function globalSwipeDismiss() {
  let gesture = null;
  const scrollableParent = (target, boundary) => {
    for (let node = target; node && node !== boundary; node = node.parentElement) {
      if (node.scrollHeight > node.clientHeight + 3 &&
          /auto|scroll/.test(getComputedStyle(node).overflowY)) return node;
    }
    return null;
  };
  document.addEventListener('touchstart', e => {
    gesture = null;
    if (e.touches.length !== 1) return;
    const target = e.target;
    if (target.closest('input, textarea, select, video, iframe, .qhandle, .swipe-track, .volrow, .karaoke')) return;
    const openSheets = [...document.querySelectorAll('.sheetbox.open')];
    const sheet = openSheets.at(-1);
    if (sheet) {
      if (sheet.id === 'queueSheet' || !sheet.contains(target)) return;
      const scroller = scrollableParent(target, sheet);
      if (scroller && scroller.scrollTop > 2) return;
      gesture = { x:e.touches[0].clientX, y:e.touches[0].clientY, overlay:sheet, scroller,
        close:()=>closeSheet(sheet.id) };
      return;
    }
    const lyrics = $('lyrView');
    if (lyrics.classList.contains('open') === false) {
      // The full player already has its own vertical drag behavior.
      if (!$('player').classList.contains('hidden')) return;
      const page = [...document.querySelectorAll('.page.on')].at(-1);
      if (!page || !page.contains(target)) return;
      const scroller = scrollableParent(target, page);
      if (scroller && scroller.scrollTop > 2) return;
      gesture = { x:e.touches[0].clientX, y:e.touches[0].clientY, overlay:page, scroller,
        close:()=>closePage(page.id) };
    } else if (lyrics.contains(target)) {
      const scroller = scrollableParent(target, lyrics);
      if (scroller && scroller.scrollTop > 2) return;
      gesture = { x:e.touches[0].clientX, y:e.touches[0].clientY, overlay:lyrics, scroller,
        close:closeLyrics };
    }
  }, { passive:true });
  document.addEventListener('touchend', e => {
    const start = gesture; gesture = null;
    if (!start || e.changedTouches.length !== 1 || !start.overlay.isConnected) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (start.scroller && start.scroller.scrollTop > 2) return;
    if (dy > 75 && dy > Math.abs(dx) * 1.35) start.close();
  }, { passive:true });
  document.addEventListener('touchcancel', () => { gesture = null; }, { passive:true });
})();

/* iPhone RTL edge-back: swipe from the right edge toward the left on a detail page. */
(function rtlEdgeBack() {
  let start = null;
  document.addEventListener('touchstart', e => {
    if (window.innerWidth >= 820 || e.touches.length !== 1) return;
    const t = e.touches[0];
    start = t.clientX >= window.innerWidth - 28 ? { x: t.clientX, y: t.clientY } : null;
  }, { passive: true });
  document.addEventListener('touchend', e => {
    if (!start || e.changedTouches.length !== 1) { start = null; return; }
    const t = e.changedTouches[0], dx = start.x - t.clientX, dy = Math.abs(start.y - t.clientY);
    start = null;
    if (dx < 75 || dy > 70 || dx < dy * 1.5) return;
    const visibleSheet = [...document.querySelectorAll('.sheetbox.open')].at(-1);
    if (visibleSheet) { closeSheet(visibleSheet.id); return; }
    const page = [...document.querySelectorAll('.page.on')].at(-1);
    if (page) { closePage(page.id); return; }
    if (!$('player').classList.contains('hidden')) { closePlayer(); return; }
    if (!$('lyrView').classList.contains('hidden')) { closeLyrics(); return; }
  }, { passive: true });
})();


/* Draggable tab highlight: short taps must work even if iOS does not synthesize
   a click after pointer capture, and a drag settles under the release point. */
(function tabGlassDrag() {
  const bar = $('tabbar'), g = document.querySelector('.tabglass');
  if (!bar || !g) return;
  let active = false, dragging = false, vertical = false;
  let startP = 0, basePos = 0, baseSize = 0, pid = null;
  let lastP = 0, lastT = 0, v = 0, handledPointerTap = false, handledDrag = false;
  const pos = e => vertical ? e.clientY : e.clientX;
  const buttons = () => [...bar.querySelectorAll('.tabbtn')];
  const nearest = clientP => {
    const rect = bar.getBoundingClientRect();
    const localP = clientP - (vertical ? rect.top : rect.left);
    return buttons().reduce((best, b) => {
      const center = (vertical ? b.offsetTop + b.offsetHeight / 2 : b.offsetLeft + b.offsetWidth / 2);
      const distance = Math.abs(center - localP);
      return distance < best.distance ? { b, distance } : best;
    }, { b: null, distance: Infinity }).b;
  };
  const bounds = () => {
    const btns = buttons(), first = btns[0], last = btns.at(-1);
    return vertical
      ? [first.offsetTop, last.offsetTop + last.offsetHeight]
      : [Math.min(first.offsetLeft, last.offsetLeft), Math.max(first.offsetLeft + first.offsetWidth, last.offsetLeft + last.offsetWidth)];
  };
  bar.addEventListener('pointerdown', e => {
    if (!e.target.closest('.tabbtn')) return;
    active = true; dragging = false; pid = e.pointerId;
    // A previous drag may not have produced a click. Never suppress a later tap.
    handledDrag = false; handledPointerTap = false;
    vertical = tabGlassVertical(bar);
    startP = lastP = pos(e); lastT = performance.now(); v = 0;
    basePos = vertical ? g.offsetTop : g.offsetLeft;
    baseSize = vertical ? g.offsetHeight : g.offsetWidth;
    try { bar.setPointerCapture(pid); } catch {}
  });
  bar.addEventListener('pointermove', e => {
    if (!active || e.pointerId !== pid) return;
    const p = pos(e), now = performance.now();
    v = .75 * v + .25 * ((p - lastP) / Math.max(1, now - lastT) * 16);
    lastP = p; lastT = now;
    if (!dragging) {
      if (Math.abs(p - startP) <= 10) return;
      dragging = true;
      g.style.transition = 'none';
    }
    const stretch = 1 + Math.min(Math.abs(v) * .015, .18);
    const size = baseSize * stretch;
    const [mn, mx] = bounds();
    let x = basePos + (p - startP) - (size - baseSize) / 2;
    x = Math.max(mn, Math.min(Math.max(mn, mx - size), x));
    if (vertical) { g.style.top = x + 'px'; g.style.height = size + 'px'; }
    else { g.style.left = x + 'px'; g.style.width = size + 'px'; }
  });
  const end = e => {
    if (!active || e.pointerId !== pid) return;
    active = false;
    const wasDragging = dragging;
    dragging = false;
    try { if (bar.hasPointerCapture(pid)) bar.releasePointerCapture(pid); } catch {}
    g.style.transition = '';
    if (e.type === 'pointercancel') { moveTabGlass(); return; }
    const target = nearest(pos(e));
    if (target) {
      // Handle the tap on pointerup instead of relying on an iOS click that
      // capture may cancel. Capture-phase click below prevents double action.
      handledPointerTap = !wasDragging;
      handledDrag = wasDragging;
      if (wasDragging) switchTab(target.dataset.tab);
      else activateTab(target);
    }
    moveTabGlass();
  };
  bar.addEventListener('pointerup', end);
  bar.addEventListener('pointercancel', end);
  bar.addEventListener('click', e => {
    if (handledPointerTap || handledDrag) {
      e.stopPropagation(); e.preventDefault();
      handledPointerTap = false; handledDrag = false;
    }
  }, true);
})();

window.addEventListener('resize', moveTabGlass);
window.addEventListener('load', () => setTimeout(moveTabGlass, 50));
setTimeout(moveTabGlass, 300);
function openPage(id) { $(id).classList.add('on'); }
function closePage(id) { $(id).classList.remove('on'); }

/* ---------- card helpers ---------- */
function sectionEl(title, bodyClass) {
  const sec = document.createElement('section');
  sec.className = 'asec';
  const head = document.createElement('div'); head.className = 'asec-head';
  const h = document.createElement('button'); h.className = 'asec-title'; h.type = 'button';
  h.textContent = title; h.disabled = true;
  const chev = document.createElement('span'); chev.className = 'asec-chev'; chev.setAttribute('aria-hidden', 'true'); chev.textContent = '‹';
  h.appendChild(chev);
  const body = document.createElement('div');
  body.className = 'asec-body ' + (bodyClass || 'list');
  head.appendChild(h);
  sec.append(head, body);
  if (body.classList.contains('hscroll')) {
    const arrows = document.createElement('div'); arrows.className = 'asec-arrows';
    for (const [glyph, step, label] of [['‹', 1, 'הקודם'], ['›', -1, 'הבא']]) {
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'asec-arrow';
      btn.textContent = glyph; btn.setAttribute('aria-label', label + ' - ' + title);
      btn.addEventListener('click', () => {
        const cards = [...body.children].filter(x => x.getBoundingClientRect().width > 0);
        if (!cards.length) return;
        const viewport = body.getBoundingClientRect();
        const first = cards.findIndex(x => {
          const r = x.getBoundingClientRect();
          return r.left >= viewport.left - 3 && r.right <= viewport.right + 3;
        });
        // `cards` are in reading order; scrollIntoView handles RTL scrollLeft.
        // For the next button move one card forward, not an assumed pixel sign.
        const index = Math.max(0, first);
        const target = cards[Math.min(cards.length - 1, Math.max(0, index - step))];
        target.scrollIntoView({behavior:'smooth',block:'nearest',inline:'start'});
      });
      arrows.appendChild(btn);
    }
    head.appendChild(arrows);
  }
  return { sec, body, heading: h };
}
function sectionTracks(title, items) {
  const tracks = (items || []).filter(t => t && t.id);
  if (!tracks.length) return toast('אין שירים נוספים להצגה');
  openPlName = title; openPlKind = 'section'; openPlTracks = () => tracks;
  $('plTitle').textContent = title;
  $('plOwner').textContent = 'Avi Music';
  paintPlArt($('plArt'), tracks);
  $('plRename').style.display = 'none'; $('plDelete').style.display = 'none';
  renderPlTracks(); openPage('page-playlist');
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
  if (a.artistName) {
    const artist = el.querySelector('.cs');
    artist.textContent = a.artistName;
    artist.classList.add('artist-link');
    artist.setAttribute('role', 'button');
    artist.setAttribute('tabindex', '0');
    artist.setAttribute('aria-label', 'פתח אמן ' + a.artistName);
    const open = e => {
      if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      e.stopPropagation();
      if (e.type === 'keydown') e.preventDefault();
      closePlayer(); openOfficialArtist(a.artistName, a.artistId || '');
    };
    artist.addEventListener('click', open);
    artist.addEventListener('keydown', open);
  }
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
  if (!avatar) el.querySelector('.stph span').textContent = name.trim()[0] || '';
  else el.querySelector('img').onerror = () => {
    const ph = document.createElement('div'); ph.className = 'stph'; ph.style.background = g;
    const letter = document.createElement('span'); letter.textContent = name.trim()[0] || ''; ph.appendChild(letter);
    el.querySelector('img')?.replaceWith(ph);
  };
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

  /* ---- personalization seeds ---- */
  const seeds = tasteArtists().map(a => a.name);
  const firstByArtist = a => h.find(t => normTxt(t.artist) === normTxt(a));

  const playSearch = async (q, stationName) => {
    toast('בונה את ' + (stationName || q) + '...');
    try {
      const items = await searchMusic(q);
      const matching = tasteArtists().filter(a => normTxt(a.name) === normTxt(q));
      const chosen = items.filter(t => artistMatchesTaste(t, matching));
      if (chosen.length) playQueue(chosen, 0, stationName ? { station: { seed: chosen[0].id, name: stationName } } : {});
      else toast('לא נמצאו שירים מתאימים');
    } catch { toast('החיפוש לא זמין כרגע'); }
  };

  /* ---- 1. בחירות מובילות עבורך: driven by this device's actual listening ---- */
  if (seeds.length) {
    const { sec, body } = sectionEl('בחירות מובילות עבורך', 'hscroll heroes');
    sec.classList.add('home-featured');
    seeds.slice(0, 6).forEach((name, i) => {
      const track = firstByArtist(name);
      body.appendChild(heroCard({ title: 'המיקס של ' + name, kicker: 'במיוחד עבורך',
        desc: 'עוד שירים של ' + name, grad: GRADS[i % GRADS.length],
        img: track ? sqThumb(track.id, 'hq') : '',
        tap: () => playSearch(name, 'המיקס של ' + name) }));
    });
    box.appendChild(sec);
  }

  /* ---- 2. הושמעו לאחרונה ---- */
  if (h.length) {
    const { sec, body, heading } = sectionEl('הושמעו לאחרונה', 'hscroll');
    heading.disabled = h.length <= 12;
    heading.addEventListener('click', () => sectionTracks('הושמעו לאחרונה', state.history));
    h.slice(0, 12).forEach(t => body.appendChild(sqCapCard(t, () => playQueue(h, h.indexOf(t)), t.artist)));
    box.appendChild(sec);
  } else {
    const { sec, body } = sectionEl('הושמעו לאחרונה', 'hscroll');
    body.innerHTML = '<div class="empty inline"><p>נגן משהו ונתחיל להכיר את הטעם שלך.</p></div>';
    box.appendChild(sec);
  }

  /* Listening-led categories: use this device's actual plays, not a hard-coded genre guess. */
  if (seeds.length) {
    const { sec, body, heading } = sectionEl('עוד מהאמנים שלך', 'hscroll bigsq');
    let artistItems = [];
    heading.addEventListener('click', () => sectionTracks('עוד מהאמנים שלך', artistItems));
    body.innerHTML = '<div class="empty inline"><p>טוען...</p></div>';
    box.appendChild(sec);
    Promise.allSettled(seeds.slice(0, 4).map(name => within(searchMusicCached(name), 17000)))
      .then(results => {
        if (!sec.isConnected) return;
        const found = new Set(); artistItems = [];
        results.forEach((result, i) => {
          if (result.status !== 'fulfilled') return;
          const artist = normTxt(seeds[i]);
          // Match the artist metadata, rather than treating query relevance as proof.
          for (const t of result.value) {
            if (!t.id || found.has(t.id) || !normTxt(t.artist).includes(artist)) continue;
            found.add(t.id); artistItems.push(t);
          }
        });
        if (!artistItems.length) { sec.remove(); return; }
        heading.disabled = artistItems.length <= 12;
        body.replaceChildren();
        artistItems.slice(0, 12).forEach(t => body.appendChild(sqCapCard(t, () => playQueue(artistItems, artistItems.indexOf(t)), t.artist)));
      }).catch(() => sec.remove());
  }

  /* ---- network sections: paint as they land ---- */
  const fillSec = (mkSec, q, cardFn, limit) => {
    const { sec, body, heading } = mkSec();
    let allItems = [];
    heading.addEventListener('click', () => sectionTracks(heading.firstChild.textContent, allItems));
    body.innerHTML = '<div class="empty inline"><p>טוען...</p></div>';
    box.appendChild(sec);
    searchMusicCached(q).then(items => {
      allItems = items.filter(t => artistMatchesTaste(t, tasteArtists()));
      heading.disabled = allItems.length <= (limit || 12);
      body.innerHTML = '';
      if (!allItems.length) { sec.remove(); return; }
      allItems.slice(0, limit || 12).forEach(t => body.appendChild(cardFn(t, allItems)));
    }).catch(() => sec.remove());
  };

  /* 3. השירים החדשים הטובים ביותר: list rows */
  {
    const { sec, body, heading } = sectionEl('השירים החדשים הטובים ביותר', 'list');
    let allItems = [];
    heading.addEventListener('click', () => sectionTracks('השירים החדשים הטובים ביותר', allItems));
    body.innerHTML = '<div class="empty inline"><p>טוען...</p></div>';
    box.appendChild(sec);
    searchMusicCached('שירים חדשים ישראל').then(items => {
      allItems = items.filter(t => artistMatchesTaste(t, tasteArtists()));
      heading.disabled = allItems.length <= 8;
      body.innerHTML = '';
      if (!allItems.length) { sec.remove(); return; }
      allItems.slice(0, 8).forEach(t => body.appendChild(trackRow(t, { onPlay: () => playQueue(allItems, allItems.indexOf(t)) })));
    }).catch(() => sec.remove());
  }

  /* 4. חדש השבוע: big squares */
  fillSec(() => sectionEl('מוזיקה חדשה', 'hscroll bigsq'), 'שירים פופולריים ישראל', (t, items) => sqCapCard(t, () => playQueue(items, items.indexOf(t)), t.artist));

  /* 5. כולם מקשיבים ל...: wide cards */
  fillSec(() => sectionEl('כולם מקשיבים ל...', 'hscroll wide'), 'להיטים ישראלים', (t, items) => wideCapCard(t, () => playQueue(items, items.indexOf(t))));

  /* 6. פלייליסטים במיוחד עבורך: no generic mood labels without evidence in listening history. */
  if (h.length >= 2) {
    const { sec, body } = sectionEl('פלייליסטים במיוחד עבורך', 'hscroll heroes');
    sec.classList.add('home-featured');
    seeds.slice(0, 5).forEach((name, i) => {
      const related = h.filter(t => normTxt(t.artist) === normTxt(name));
      if (!related.length) return;
      body.appendChild(heroCard({ title: name, kicker: 'במיוחד עבורך',
        desc: related.slice(0, 2).map(t => t.title).join(' · '),
        grad: GRADS[i % GRADS.length], img: sqThumb(related[0].id, 'hq'),
        tap: () => playSearch(name, name) }));
    });
    if (body.children.length) box.appendChild(sec);
  }

  const playFavoriteArtistStation = async (name, chId) => {
    toast('מפעיל את התחנה של ' + name + '...');
    try {
      const songs = (await searchMusicCached(name)).filter(t =>
        normTxt(t.artist.replace(/ - Topic$/i, '')) === normTxt(name) &&
        (!chId || !t.ch || t.ch === chId));
      if (!songs.length) return toast('לא נמצאו שירים של ' + name);
      // Shuffle the matching artist's songs once, including the first song.
      const queue = songs.slice();
      for (let i = queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [queue[i], queue[j]] = [queue[j], queue[i]];
      }
      state.shuffle = true;
      playQueue(queue, 0, { station: { seed: queue[0].id, name, artist: name, chId } });
      save();
    } catch { toast('התחנה לא זמינה כרגע'); }
  };

  /* 7. אומנים מועדפים: circle cards */
  {
    const favs = Object.entries(state.favArtists).map(([chId, a]) => ({ chId, name: a.name, avatar: a.avatar }));
    const names = [...new Set([...favs.map(f => f.name), ...seeds])].slice(0, 8);
    if (names.length) {
      const { sec, body } = sectionEl('אומנים מועדפים', 'hscroll circles');
      names.forEach((n, i) => {
        const f = favs.find(x => x.name === n);
        body.appendChild(circleArtistCard(n, f && f.avatar, GRADS[i % GRADS.length], () => playFavoriteArtistStation(n, f?.chId || '')));
      });
      box.appendChild(sec);
      // Channel portraits are fetched from artist results; never substitute song-cover art for a person.
      names.forEach(async (n, i) => {
        const card = body.children[i];
        if (!card || card.querySelector('.cc-bg img')) return;
        try {
          const matches = await searchChannels(n);
          const exact = matches.find(c => normTxt(c.name.replace(/ - Topic$/i, '')) === normTxt(n));
          if (!exact || !exact.avatar || !card.isConnected) return;
          const bg = card.querySelector('.cc-bg');
          bg.innerHTML = '';
          const img = document.createElement('img'); img.loading = 'lazy'; img.alt = n; img.src = exact.avatar;
          bg.appendChild(img);
          // Portrait loading must not replace the station action on this card.
        } catch {}
      });
    }
  }

  /* Stations and mood mixes use the actual listening profile, never a fixed artist list. */
  if (seeds.length) {
    const { sec, body } = sectionEl('תחנות מומלצות לפי האמנים שלך', 'hscroll');
    seeds.slice(0, 8).forEach(name => {
      const favorite = Object.entries(state.favArtists).find(([, a]) => normTxt(a.name) === normTxt(name));
      const card = stationCard(name, favorite?.[1].avatar || '', () => playFavoriteArtistStation(name, favorite?.[0] || ''));
      body.appendChild(card);
      if (!favorite?.[1].avatar) fillArtistPortrait(card, name, favorite?.[0] || '');
    });
    box.appendChild(sec);

    const moodSpecs = [
      { name:'שמחה', query:'שירים שמחים מקפיצים', hue:'linear-gradient(135deg,#ffcb38,#fd4964)' },
      { name:'עצב', query:'שירים עצובים שקטים', hue:'linear-gradient(135deg,#6876a9,#2d385f)' },
      { name:'ריכוז', query:'שירים רגועים לריכוז', hue:'linear-gradient(135deg,#97b3a6,#466c6a)' },
    ];
    const { sec:moodSec, body:moodBody } = sectionEl('שירים לפי מצב רוח', 'hscroll heroes');
    moodSec.classList.add('home-featured');
    moodSpecs.forEach(spec => {
      const artist = seeds.find(n => state.history.some(t => normTxt(t.artist) === normTxt(n)));
      const card = heroCard({ title:spec.name, kicker:'מיקס מותאם להאזנה שלך', desc:artist || '',
        grad:spec.hue, img:'', tap:async () => {
          toast('בונה את המיקס של ' + spec.name + '...');
          try {
            const artists=tasteArtists();
            const results=await Promise.allSettled(seeds.slice(0,4).map(name =>
              within(searchMusicCached(name + ' ' + spec.query), 17000)));
            const seen=new Set(), tracks=[];
            results.forEach(r => { if(r.status!=='fulfilled') return;
              r.value.forEach(t => { if(!t.id || seen.has(t.id) || !artistMatchesTaste(t,artists)) return;
                seen.add(t.id); tracks.push(t); }); });
            if (tracks.length) playQueue(tracks,0);
            else toast('אין כרגע שירים מתאימים ל' + spec.name);
          } catch { toast('המיקס לא זמין כרגע'); }
        }});
      moodBody.appendChild(card);
    });
    box.appendChild(moodSec);
  }

  /* 8. הוצאות אחרונות: big squares */
  fillSec(() => sectionEl('סינגלים חדשים', 'hscroll bigsq'), 'סינגלים חדשים ישראל', (t, items) => sqCapCard(t, () => playQueue(items, items.indexOf(t)), t.artist));

  listenLoaded = Date.now();
}

/* hero card: full-bleed ~68vw x ~84vw, big bold overlay, kicker+desc at bottom */
function heroCard(hc) {
  const el = document.createElement('div');
  el.className = 'herocard';
  el.innerHTML = `
    ${hc.img ? `<img loading="lazy" crossorigin="anonymous" src="${hc.img}" alt="">` : ''}
    <div class="hc-bg" style="background:${hc.grad}"></div>
    <div class="hc-scrim"></div>
    <div class="hc-tx">
      <div class="hc-title"></div>
      <div class="hc-kicker"></div>
      <div class="hc-desc"></div>
    </div>`;
  el.querySelector('.hc-title').textContent = hc.title;
  el.querySelector('.hc-kicker').textContent = hc.kicker;
  el.querySelector('.hc-desc').textContent = hc.desc;
  el.addEventListener('click', hc.tap);
  return el;
}
/* square card, caption below (Apple Home style) */
function sqCapCard(t, onTap, sub) {
  const el = document.createElement('div');
  el.className = 'card sqcap';
  el.innerHTML = `<img loading="lazy" src="${thumb(t.id, 'hq')}" alt=""><div class="ct"></div><div class="cs dim"></div>`;
  el.querySelector('.ct').textContent = t.title;
  el.querySelector('.cs').textContent = sub != null ? sub : (t.artist || '');
  el.addEventListener('click', onTap);
  return el;
}
/* wide landscape card, caption below */
function wideCapCard(t, onTap) {
  const el = document.createElement('div');
  el.className = 'card widecap';
  el.innerHTML = `<img loading="lazy" src="${thumb(t.id, 'hq')}" alt=""><div class="ct"></div><div class="cs dim"></div>`;
  el.querySelector('.ct').textContent = t.title;
  el.querySelector('.cs').textContent = t.artist || '';
  el.addEventListener('click', onTap);
  return el;
}
/* favorite artist: circle photo on tinted card */
function circleArtistCard(name, avatar, grad, onTap) {
  const el = document.createElement('div');
  el.className = 'card circlecard';
  el.innerHTML = `<div class="cc-bg" style="background:${grad}">${avatar ? `<img loading="lazy" src="${avatar}" alt="">` : `<div class="cc-ph"><span></span></div>`}</div><div class="ct"></div><div class="cs dim">התחנה שלו</div>`;
  if (!avatar) el.querySelector('.cc-ph span').textContent = name.trim()[0] || '';
  el.querySelector('.ct').textContent = name;
  el.addEventListener('click', onTap);
  return el;
}

/* ---------- חדש (New music and discovery) ---------- */
let browseLoaded = 0;
async function renderBrowse() {
  if (Date.now() - browseLoaded < 10 * 60 * 1000 && $('browseBody').children.length) return;
  browseLoaded = Date.now();
  const box = $('browseBody');
  box.replaceChildren();
  const topics = document.createElement('div');
  topics.className = 'new-topics';
  box.appendChild(topics);
  const categories = [
    { title:'רדיו', subtitle:'התחנות שלך', action:() => switchTab('radio'), query:'להיטים ישראלים' },
    { title:'אימון', subtitle:'קצב לאימון', query:'מוזיקה לאימון קצבית' },
    { title:'נסיעה', subtitle:'שירים לדרך', query:'שירים לנסיעה ישראל' },
  ];
  categories.forEach(({title,subtitle,action,query}) => {
    const card = document.createElement('button'); card.type = 'button'; card.className = 'new-topic';
    card.innerHTML = '<span class="new-topic-art"></span><span class="new-topic-copy"><strong></strong><small></small></span>';
    card.querySelector('strong').textContent = title;
    card.querySelector('small').textContent = subtitle;
    topics.appendChild(card);
    card.disabled = !action;
    if (action) card.addEventListener('click', action);
    searchMusicCached(query).then(items => {
      if (!card.isConnected) return;
      const cover = items.find(t => t.id);
      if (cover) {
        const img = document.createElement('img'); img.src = thumb(cover.id, 'hq'); img.alt = '';
        img.onerror = () => img.remove();
        card.querySelector('.new-topic-art').appendChild(img);
      }
      if (!action && items.length) { card.disabled = false; card.addEventListener('click', () => sectionTracks(title, items)); }
      if (!action && !items.length) card.title = 'לא זמין כרגע';
    }).catch(() => { if (!action) { card.disabled = true; card.title = 'לא זמין כרגע'; } });
  });
  const sections = [
    ['מוזיקה חדשה', 'שירים חדשים ישראל'],
    ['להיטי ישראל', 'להיטים ישראלים'],
    ['מזרחית וים-תיכונית', 'מוזיקה מזרחית להיטים'],
    ['מוזיקה ערבית', 'اغاني عربية'],
  ];
  sections.forEach(([title, query]) => {
    const {sec, body, heading} = sectionEl(title, 'hscroll');
    box.appendChild(sec);
    searchMusicCached(query).then(items => {
      if (!sec.isConnected) return;
      body.replaceChildren();
      if (!items.length) { body.innerHTML = '<div class="empty"><p>לא זמין כרגע</p></div>'; return; }
      heading.disabled = false;
      heading.addEventListener('click', () => sectionTracks(title, items));
      items.slice(0, 12).forEach(t => body.appendChild(sqCard(t, () => playQueue(items, items.indexOf(t)), t.artist)));
    }).catch(() => { body.innerHTML = '<div class="empty"><p>לא זמין כרגע</p></div>'; });
  });
}

/* ---------- רדיו ---------- */
async function renderRadio() {
  const box = $('radioBody');
  box.innerHTML = '';
  const hero = document.createElement('div');
  hero.className = 'radiohero';
  const seedT = state.history[0];
  hero.innerHTML = `${seedT ? `<img alt="" src="${thumb(seedT.id, 'hq')}">` : '<div class="rh-placeholder" aria-hidden="true"></div>'}<div class="rh-ov"><div class="rh-k">תחנה אישית</div><div class="rh-t">הרדיו שלך</div><div class="rh-s">שירים שאתה אוהב ועוד כמוהם</div></div>`;
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
      const q = [seed, ...rel.filter(t => artistMatchesTaste(t, tasteArtists()))];
      playQueue(q, 0, { station: { seed: seed.id, name: 'הרדיו שלך' } });
    } catch { toast('לא זמין כרגע'); }
  });
  box.appendChild(hero);
  const { sec, body } = sectionEl('תחנות של אמנים', 'hscroll');
  const favs = Object.entries(state.favArtists).map(([chId, a]) => ({ chId, name: a.name, avatar: a.avatar }));
  const hist = [...new Set(state.history.map(t => t.artist).filter(Boolean))].slice(0, 6).map(n => ({ name: n, avatar: '', chId: state.history.find(t => t.artist === n)?.ch || '' }));
  const list = favs.length ? favs.concat(hist.filter(x => !favs.some(f => f.name === x.name))).slice(0, 8) : (hist.length ? hist : [
    { name: 'אייל גולן' }, { name: 'עומר אדם' }, { name: 'איתי לוי' }, { name: 'מושיק עפיה' }, { name: 'נועה קירל' }, { name: 'עידן רייכל' },
  ]);
  list.forEach(a => {
    const card = stationCard(a.name, a.avatar, async () => {
      toast('מפעיל את התחנה של ' + a.name + '...');
      try {
        const items = await searchMusic(a.name);
        if (items.length) playQueue(items, 0, { station: { seed: items[0].id, name: a.name } });
        else toast('לא נמצאו שירים');
      } catch { toast('החיפוש לא זמין כרגע'); }
    });
    body.appendChild(card);
    if (!a.avatar) fillArtistPortrait(card, a.name, a.chId || '');
  });
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
  mkRow('שירים אהובים', 'i-heart-fill', favList().length, () => openLocalPlaylist('שירים אהובים'));
  mkRow('הושמע לאחרונה', 'i-clock', state.history.length, () => openRecent());
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
  $('plRename').style.display = ''; $('plDelete').style.display = '';
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
  $('plRename').style.display = 'none'; $('plDelete').style.display = 'none';
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
    onPlay: () => playQueue(songs, i), artistLink: true,
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
let alSeq = 0;
async function loadAlbumTracks(a) {
  // Fetch the exact playlist from the first-party Worker, with Piped as a
  // parallel fallback; the fastest nonempty, identity-checked source wins.
  const id = a.plId;
  const worker = (async () => {
    if (!/^OLAK5uy_[A-Za-z0-9_-]{10,80}$/.test(id)) return null;
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 7500);
    try {
      const r = await fetch(STREAM_API_DEFAULT + '/album/' + encodeURIComponent(id), { signal: ctl.signal });
      if (!r.ok) return null;
      const j = await r.json();
      if (j.playlistId !== id || !Array.isArray(j.tracks)) return null;
      const tracks = j.tracks.filter(t => /^[A-Za-z0-9_-]{11}$/.test(t.id || '') && t.verifiedId === id && t.title)
        .map(t => ({ id: t.id, title: t.title, artist: a.artistName || t.artist || '', dur: Number(t.dur) || 0, ch: '' }));
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
  return winner || { tracks: [], name: a.title, uploader: a.artistName || '' };
}
async function openAlbum(a) {
  const seq = ++alSeq;
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
    const { tracks, name, uploader } = await loadAlbumTracks(a);
    if (seq !== alSeq) return;
    alTracks = tracks.map(t => ({ ...t, album: a }));
    $('alTitle').textContent = name.replace(/^Album [–-] /i, '');
    $('alArtist').textContent = uploader;
    $('alArtist').classList.toggle('link', !!uploader);
    $('alMeta').textContent = alTracks.length ? alTracks.length + ' שירים' : 'רשימת שירים לא זמינה';
    $('alPlay').style.display = alTracks.length ? '' : 'none';
    $('alShuffle').style.display = alTracks.length ? '' : 'none';
    const box = $('alTracks'); box.replaceChildren();
    if (!alTracks.length) { box.innerHTML = '<div class="empty"><p>רשימת השירים של האלבום לא זמינה כרגע.</p></div>'; return; }
    alTracks.forEach((t, i) => box.appendChild(trackRow(t, {
      num: i + 1, noArt: true, artistLink: true,
      onPlay: () => playQueue(alTracks, i),
    })));
  } catch { if (seq === alSeq) $('alTracks').innerHTML = '<div class="empty"><p>לא הצלחתי לטעון את השירים של האלבום כרגע.</p></div>'; }
}
$('alArtist').addEventListener('click', () => {
  const name = $('alArtist').textContent;
  if (name) { closePlayer(); openOfficialArtist(name, alCur?.artistId || ''); }
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


let searchScope = 'all';
$('searchScope').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
  searchScope = b.dataset.scope;
  $('searchScope').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  if (lastQuery) runSearch(lastQuery, curPill); else renderSearchHome();
}));
const SEARCH_CATEGORIES = [
  ['מוזיקה עברית', 'מוזיקה עברית', ''],
  ['מזרחית', 'מוזיקה מזרחית', ''], ['פופ', 'פופ ישראלי', ''], ['מוזיקה יהודית', 'מוזיקה יהודית', ''],
  ['הופעות', 'הופעות חיות', ''], ['שירי אהבה', 'שירי אהבה', ''], ['רוק', 'רוק ישראלי', ''], ['מוזיקה חדשה', 'שירים חדשים ישראל', '']
];
/* Search home shows played songs and artists, never previously typed search words. */
function renderSearchHome() {
  const box = $('searchHome'); box.replaceChildren();
  const cats = document.createElement('div'); cats.className = 'search-category-grid';
  SEARCH_CATEGORIES.forEach(([name, query, image]) => {
    const button = document.createElement('button'); button.className = 'search-category'; button.type = 'button';
    button.textContent = name;
    if (image) { const img = document.createElement('img'); img.src = image; img.alt = ''; button.appendChild(img); }
    button.addEventListener('click', () => { $('searchInput').value = query; runSearch(query, curPill); });
    cats.appendChild(button);
  });
  if (searchScope === 'all') box.appendChild(cats);
  const recent = (state.history || []).filter(t => t && t.id).slice(0, 12);
  if (recent.length) {
    const h = document.createElement('h2'); h.className = 'secttl'; h.textContent = 'הושמעו לאחרונה'; box.appendChild(h);
    const all = state.history.filter(t => t && t.id);
    recent.forEach(t => box.appendChild(trackRow(t, { artistLink: true, onPlay: () => playQueue(all, all.findIndex(x => x.id === t.id)) })));
  }
  const artists = [...new Set((state.history || []).map(t => t.artist).filter(Boolean))].slice(0, 6);
  if (artists.length) {
    const h = document.createElement('h2'); h.className = 'secttl'; h.textContent = 'אמנים שהאזנת להם'; box.appendChild(h);
    artists.forEach(name => {
      const row = document.createElement('button'); row.type = 'button'; row.className = 'row';
      row.innerHTML = '<div class="meta"><div class="t"></div></div>';
      row.querySelector('.t').textContent = name;
      row.addEventListener('click', () => { closePlayer(); searchArtistAndOpen(name); });
      box.appendChild(row);
    });
  }
}
function hideSugg() { $('suggBox').replaceChildren(); $('suggBox').classList.add('hidden'); }

let searchSeq = 0;
const input = $('searchInput');
input.addEventListener('input', () => {
  $('clearSearch').classList.toggle('hidden', !input.value);
  hideSugg();
  if (!input.value.trim()) {
    $('searchHome').classList.remove('hidden'); $('searchRes').classList.add('hidden');
    hideNetNote(); renderSearchHome();
  }
});
input.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault(); hideSugg(); input.blur();
    runSearch(input.value.trim(), curPill);
  }
});
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
  box.innerHTML = '<div class="empty js-loading"><p>מחפש...</p></div>';
  if (searchScope === 'library' && !vid) {
    const saved = [...(state.history || []), ...favList(), ...(state.queue || [])]
      .filter(t => t?.id && (normTxt(t.title).includes(normTxt(q)) || normTxt(t.artist).includes(normTxt(q))));
    const seen = new Set(), unique = saved.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
    box.replaceChildren();
    if (!unique.length) box.innerHTML = '<div class="empty"><p>לא נמצאו שירים בספריה.</p></div>';
    else unique.forEach((t, i) => box.appendChild(trackRow(t, { artistLink: true, queueSwipe: true, onPlay: () => playQueue(unique, i) })));
    return;
  }
  if (vid) {
    const t = { id: vid, title: 'שיר מיוטיוב', artist: '', dur: 0 };
    box.innerHTML = '';
    box.appendChild(trackRow(t, { artistLink: true, onPlay: () => playQueue([t], 0) }));
    enrichTitle(t);
    return;
  }
  try {
    if (pill === 'artists') {
      const chans = await within(searchChannels(q), 17000);
      if (seq !== searchSeq) return;
      hideNetNote();
      box.innerHTML = chans.length ? '' : '<div class="empty"><p>לא נמצאו אמנים.</p></div>';
      chans.forEach(c => box.appendChild(artistHit(c)));
      return;
    }
    if (pill === 'albums') {
      const albs = await within(searchPlaylists(q, 'music_albums'), 17000);
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
    // top / songs — incremental: paint as each source lands (songs first), don't gate on slow ones
    const jobs = { songs: within(searchMusicCached(q), 17000), lyrics: within(searchLyrics(q), 17000), albums: within(searchPlaylists(q, 'music_albums'), 17000) };
    if (pill === 'top') jobs.artists = within(searchChannels(q), 17000);
    const res = {};
    let songsDone = false, lyricsDone = false, searchFailed = false;
    const clearLoading = () => { if (box.querySelector('.js-loading')) box.replaceChildren(); };
    const done = () => {
      if (seq !== searchSeq || !songsDone || !lyricsDone) return;
      clearLoading();
      if (searchFailed && !box.children.length) { box.innerHTML = '<div class="empty"><p>החיפוש לא זמין כרגע. נסה שוב מאוחר יותר.</p></div>'; return; }
      if (!box.children.length) box.innerHTML = '<div class="empty"><p>לא נמצאו תוצאות. נסו ניסוח אחר, או הדביקו קישור יוטיוב.</p></div>';
    };
    Object.entries(jobs).forEach(([k, p]) => Promise.resolve(p).then(r => {
      if (seq !== searchSeq) return;
      res[k] = r || [];
      clearLoading();
      if (k === 'songs') { songsDone = true; paintSearchSongs(); }
      if (k === 'lyrics') { lyricsDone = true; paintSearchLyrics(); }
      if (k === 'artists' && pill === 'top' && res.artists.length && !$('resArtistHit')) {
        const ah = artistHit(res.artists[0]); ah.id = 'resArtistHit';
        const albumRows = box.querySelector('.js-albums');
        const albumHeading = box.querySelector('.secttl.js-albums');
        if (albumRows && albumHeading && normTxt(res.albums?.[0]?.title) === normTxt(q)) albumRows.after(ah);
        else box.prepend(ah);
      }
      if (k === 'albums') paintSearchAlbums();
      hideNetNote(); done();
    }).catch(() => { if (k === 'songs') { songsDone = true; searchFailed = true; } if (k === 'lyrics') lyricsDone = true; done(); }));
    const paintSearchSongs = () => {
      if (seq !== searchSeq) return;
      box.querySelectorAll('.js-songs').forEach(x => x.remove());
      const songs = res.songs || [];
      if (!songs.length) return;
      const h = document.createElement('h2'); h.className = 'secttl js-songs'; h.textContent = 'שירים';
      const frag = document.createDocumentFragment();
      songs.slice(0, 20).forEach((t, i) => frag.appendChild(trackRow(t, { artistLink: true, queueSwipe: true, onPlay: () => playQueue(songs, i) })));
      const wrap = document.createElement('div'); wrap.className = 'js-songs'; wrap.appendChild(frag);
      const anchorLyr = box.querySelector('.js-lyr');
      box.insertBefore(h, anchorLyr); box.insertBefore(wrap, anchorLyr);
    };
    const paintSearchLyrics = () => {
      if (seq !== searchSeq) return;
      box.querySelectorAll('.js-lyr').forEach(x => x.remove());
      const lyr = (res.lyrics || []).filter(x => x.line);
      if (!lyr.length) return;
      const h = document.createElement('h2'); h.className = 'secttl js-lyr'; h.textContent = 'נמצא במילים';
      box.appendChild(h);
      lyr.slice(0, 5).forEach(x => {
        const row = document.createElement('button');
        row.className = 'row lyrrow js-lyr';
        row.innerHTML = '<div class="lyrnote"><svg style="width:20px;height:20px"><use href="#i-lyrics"/></svg></div><div class="meta"><div class="t"></div><div class="a"></div><div class="lyrsnip dim"></div></div>';
        row.querySelector('.t').textContent = x.title;
        row.querySelector('.a').textContent = x.artist;
        renderLyricSnippet(row.querySelector('.lyrsnip'), x.line, q);
        row.querySelector('.lyrsnip').prepend(document.createTextNode('מילים: '));
        row.addEventListener('click', async () => {
          try {
            const songs = await searchMusic(x.artist + ' ' + x.title);
            if (songs.length) playQueue(songs, 0);
            else toast('לא נמצאה התאמה ביוטיוב');
          } catch { toast('החיפוש לא זמין כרגע'); }
        });
        box.appendChild(row);
      });
    };
    const paintSearchAlbums = () => {
      if (seq !== searchSeq || !res.albums?.length) return;
      box.querySelectorAll('.js-albums').forEach(x => x.remove());
      const nq = normTxt(q);
      const exact = res.albums.filter(a => normTxt(a.title) === nq);
      if (exact.length) {
        const h = document.createElement('h2'); h.className = 'secttl js-albums'; h.textContent = 'אלבומים';
        const wrap = document.createElement('div'); wrap.className = 'js-albums';
        exact.slice(0, 3).forEach(a => {
          const row = document.createElement('button'); row.type = 'button'; row.className = 'row album-search-row';
          const image = document.createElement('img'); image.src = a.thumb || ''; image.alt = '';
          const meta = document.createElement('div'); meta.className = 'meta';
          const title = document.createElement('div'); title.className = 't'; title.textContent = a.title;
          const artist = document.createElement('div'); artist.className = 'a'; artist.textContent = 'אלבום · ' + (a.artistName || '');
          meta.append(title, artist); row.append(image, meta);
          row.addEventListener('click', () => openAlbum(a)); wrap.appendChild(row);
        });
        box.prepend(wrap); box.prepend(h); return;
      }
      if (pill !== 'top') return;
      const h = document.createElement('h2'); h.className = 'secttl js-albums'; h.textContent = 'אלבומים';
      box.appendChild(h);
      const wrap = document.createElement('div'); wrap.className = 'hscroll js-albums';
      res.albums.slice(0, 10).forEach(a => wrap.appendChild(albumCardEl(a)));
      box.appendChild(wrap);
    };
    return;
  } catch (e) {
    if (seq !== searchSeq) return;
    box.innerHTML = '<div class="empty"><p>החיפוש לא זמין כרגע.</p><p class="dim">אפשר תמיד להדביק כאן קישור של שיר מיוטיוב ולנגן ישירות.</p></div>';
    showNetNote('שירות החיפוש החיצוני לא עונה כרגע.');
  }
}
async function enrichTitle(t) {
  try {
    const j = await pipedFetch('/streams/' + t.id, 7000);
    if (j && j.title) { t.title = j.title; t.artist = j.uploader || ''; t.dur = j.duration || 0; t.ch = chFromUrl(j.uploaderUrl) || t.ch || ''; save(); paintPlayingRows(); paintNow(); return; }
  } catch {}
  try {
    const r = await fetch('https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=' + t.id + '&format=json');
    if (r.ok) { const j = await r.json(); t.title = j.title || t.title; t.artist = j.author_name || t.artist; save(); paintPlayingRows(); paintNow(); }
  } catch {}
}

/* ---------- דף אמן ---------- */
let aSongs = [], aSeq = 0, aCur = null;
async function openArtist(chId, name, avatar, topicId = '') {
  const seq = ++aSeq;
  aCur = { chId, name, avatar, topicId };
  $('page-album').classList.remove('from-artist');
  openPage('page-artist');
  $('aName').textContent = name || 'אמן';
  $('aBanner').style.backgroundImage = avatar ? `url("${avatar}")` : '';
  $('aBanner').style.setProperty('--artist-portrait', avatar ? `url("${avatar}")` : 'none');
  $('page-artist').classList.toggle('noimg', !avatar);
  $('aBody').innerHTML = '<div class="empty"><p>טוען...</p></div>';
  $('page-artist').querySelector('.ascroll').scrollTop = 0;
  setIcon($('aFav'), state.favArtists[chId] ? 'star-fill' : 'star');
  $('aFav').classList.toggle('on', !!state.favArtists[chId]);

  let channel = null, songs = [], albums = [], playlists = [], videos = [];
  try { channel = await pipedFetch('/channel/' + chId, 8000); } catch {}
  if (seq !== aSeq) return;
  if (channel && !channel.error) {
    if (channel.name) { const dn = channel.name.replace(/ - Topic$/i, ''); if (!name || normTxt(dn) === normTxt(name)) { $('aName').textContent = dn; aCur.name = dn; } }
    if (channel.avatarUrl) aCur.avatar = channel.avatarUrl;
    // Channel banners may be abstract branding or thin text strips; a portrait
    // is a better hero source when the image service supports a larger size.
    const portrait = (channel.avatarUrl || '').replace(/=s160(?=-)/, '=s800');
    const bn = portrait || channel.bannerUrl;
    if (bn) { $('aBanner').style.backgroundImage = `url("${bn}")`; $('aBanner').style.setProperty('--artist-portrait', `url("${bn}")`); $('page-artist').classList.remove('noimg'); }
    else if (!avatar) {
      try {
        const cs = await searchChannels(aCur.name || name);
        if (cs.length && cs[0].avatar) { aCur.avatar = cs[0].avatar; $('aBanner').style.backgroundImage = `url("${cs[0].avatar}")`; $('aBanner').style.setProperty('--artist-portrait', `url("${cs[0].avatar}")`); $('page-artist').classList.remove('noimg'); }
      } catch {}
    }
    songs = (channel.relatedStreams || [])
      .filter(s => s.url && s.type === 'stream' && chFromUrl(s.uploaderUrl) === chId)
      .map(mapStream).filter(t => t.id).slice(0, 10);
  }
  const jobs = [];
  jobs.push((async () => {
    if (!songs.length) {
      try { songs = (await searchMusic(aCur.name || name)).filter(t => t.ch === chId).slice(0, 30); }
      catch {}
    }
  })());
  jobs.push((async () => {
    const isOfficial = channel?.verified && channel.id === chId &&
      Array.isArray(channel.tabs) && channel.tabs.some(t => /albums|releases/i.test(t.name));
    if (isOfficial) {
      const readTab = async (kind) => {
        const tab = channel.tabs.find(t => kind.test(t.name || ''));
        if (!tab?.data) return {list:[],nextpage:''};
        const j = await pipedFetch('/channels/tabs?data=' + encodeURIComponent(tab.data) + '&id=' + chId, 10000);
        const rows = Array.isArray(j) ? j : (j.content || []);
        // Channel tabs are owner-scoped, and every listed item must still bind to this ID.
        const list = rows.filter(x => x.type === 'playlist' && x.url && chFromUrl(x.uploaderUrl) === chId)
          .map(mapAlbum).filter(a => a.plId);
        return {list,nextpage:j.nextpage && j.nextpage !== 'null' ? j.nextpage : ''};
      };
      try {
        const [a,p] = await Promise.allSettled([readTab(/albums|releases/i),readTab(/playlists/i)]);
        if (a.status === 'fulfilled') { albums = a.value.list; if (seq === aSeq) aCur.albumNextpage = ''; }
        if (p.status === 'fulfilled') { playlists = p.value.list; if (seq === aSeq) aCur.playlistNextpage = ''; }
      } catch {}
      if (seq === aSeq) aCur.releaseVerified = false;
      // The Topic release shelf has dates; use it only if complete, and keep
      // owner-scope album lists separate from this chronology metadata.
      if (topicId && /^UC[A-Za-z0-9_-]{22}$/.test(topicId)) {
        try {
          const r = await fetch(STREAM_API_DEFAULT + '/artist/' + encodeURIComponent(topicId), {signal:AbortSignal.timeout(7500)});
          if (r.ok) {
            const j = await r.json();
            if (j.channelId === topicId && !j.partial && Array.isArray(j.releases)) {
              const dated = j.releases.filter(a => a.artistId === topicId && /^\d{4}-\d{2}-\d{2}$/.test(a.date || ''));
              if (dated.length && seq === aSeq) {
                aCur.latestRelease = {...dated.sort((a,b)=>b.date.localeCompare(a.date))[0],artistId:chId,artistName:name};
              }
            }
          }
        } catch {}
      }
      return;
    }
    // A Topic page is allowed as a fallback only when no verified official
    // channel was found. Reject incomplete release pages as newest chronology.
    if (/^UC[A-Za-z0-9_-]{22}$/.test(chId)) {
      try {
        const r = await fetch(STREAM_API_DEFAULT + '/artist/' + encodeURIComponent(chId), {signal:AbortSignal.timeout(7500)});
        if (r.ok) {
          const j = await r.json();
          if (j.channelId === chId && Array.isArray(j.releases)) {
            albums = j.releases.filter(a => a.artistId === chId && /^OLAK5uy_[A-Za-z0-9_-]{10,80}$/.test(a.plId || '') && a.title);
            if (seq === aSeq) { aCur.releaseVerified = !j.partial && albums.every(a => /^\d{4}-\d{2}-\d{2}$/.test(a.date || '')); aCur.albumNextpage = ''; }
            return;
          }
        }
      } catch {}
    }
    let searched = [];
    try { searched = await searchPlaylists(name, 'music_albums'); } catch {}
    albums = searched.filter(a => a.artistId === chId);
    if (seq === aSeq) aCur.releaseVerified = false;
  })());
  jobs.push((async () => {
    try {
      const filter = channel?.verified && channel.tabs?.length ? 'videos' : 'music_videos';
      const query = channel?.verified && channel.tabs?.length ? aCur.name : name;
      const j = await pipedFetch('/search?q=' + encodeURIComponent(query) + '&filter=' + filter, 8000);
      videos = (j.items || []).filter(x => x.type === 'stream' && x.url).map(mapStream)
        .filter(t => t.id && t.ch === chId);
    } catch {}
  })());
  await Promise.allSettled(jobs);
  if (seq !== aSeq) return;
  renderArtistBody(songs, albums, videos, playlists);
}
async function searchArtistAndOpen(name) {
  try {
    const official = await officialArtistFor(name);
    if (official) return openArtist(official.chId, official.name, official.avatar);
    const chans = await searchChannels(name);
    const exact = chans.find(c => normTxt(c.name.replace(/ - Topic$/i, '')) === normTxt(name));
    if (exact) return openArtist(exact.chId, exact.name, exact.avatar);
  } catch {}
  toast('לא מצאתי את דף האמן');
}
function releaseKind(release) {
  // The upstream release shelf mixes albums, EPs and singles. Classify only
  // when it exposes an explicit track/video count; never infer from title.
  const text = String(release.sub || '').trim();
  const match = text.match(/^(\d+)\s*(?:songs?|tracks?|videos?|שירים?|רצועות?|קליפים?)$/i) || text.match(/^(\d+)$/);
  if (!match) return 'unknown';
  const count = Number(match[1]);
  return count === 1 ? 'single' : count >= 2 && count <= 6 ? 'short' : count >= 7 ? 'album' : 'unknown';
}
function renderArtistBody(songs, albums, videos, playlists = []) {
  const box = $('aBody'); box.innerHTML = '';
  aSongs = songs;
  const artistName = aCur?.name || 'האמן';
  const visibleAlbums = albums;
  if (aCur?.latestRelease || (visibleAlbums.length && aCur?.releaseVerified)) {
    const latest = aCur.latestRelease || visibleAlbums[0];
    const lc = document.createElement('button');
    lc.type = 'button';
    lc.className = 'latestcard';
    lc.setAttribute('aria-label', 'פתח אלבום חדש: ' + latest.title);
    lc.innerHTML = `<img src="${latest.thumb}" alt=""><div><div class="lc-k">אלבום חדש</div><div class="lc-t"></div><div class="lc-s dim"></div></div><span class="lc-chev" aria-hidden="true">‹</span>`;
    lc.querySelector('.lc-t').textContent = latest.title;
    lc.querySelector('.lc-s').textContent = latest.sub;
    lc.addEventListener('click', () => openAlbum(latest));
    box.appendChild(lc);
  }
  if (songs.length) {
    const { sec, body, heading } = sectionEl('שירים מובילים');
    heading.disabled = songs.length <= 8;
    heading.addEventListener('click', () => sectionTracks('שירים של ' + artistName, songs));
    songs.slice(0, 8).forEach((t, i) => body.appendChild(trackRow(t, { artistLink: true, onPlay: () => playQueue(songs, i) })));
    box.appendChild(sec);
  }
  if (visibleAlbums.length) {
    const shelves = [
      ['album', 'אלבומים (7+ רצועות)'], ['short', 'EP והוצאות קצרות (2–6)'], ['single', 'הוצאות עם רצועה אחת'], ['unknown', 'הוצאות נוספות']
    ];
    for (const [kind, label] of shelves) {
      const matches = visibleAlbums.filter(a => releaseKind(a) === kind);
      if (!matches.length) continue;
      const { sec, body, heading } = sectionEl(label, 'hscroll');
      heading.disabled = false;
      heading.addEventListener('click', () => openArtistAlbums(matches, label + ' של ' + artistName));
      matches.slice(0, 12).forEach(a => body.appendChild(albumCardEl(a)));
      box.appendChild(sec);
    }
  }
  if (playlists.length) {
    const { sec, body, heading } = sectionEl('פלייליסטים', 'hscroll');
    heading.disabled = !playlists.length;
    heading.addEventListener('click', () => openArtistAlbums(playlists, 'פלייליסטים של ' + artistName, aCur?.playlistNextpage, aCur?.chId, artistName));
    playlists.slice(0, 12).forEach(a => body.appendChild(albumCardEl(a)));
    box.appendChild(sec);
  }
  if (videos.length) {
    const { sec, body, heading } = sectionEl('קליפים', 'hscroll');
    heading.disabled = false;
    heading.addEventListener('click', () => openArtistClips(videos, artistName));
    videos.slice(0, 12).forEach(v => body.appendChild(artistClipCard(v)));
    box.appendChild(sec);
  }
  if (!songs.length && !albums.length && !playlists.length && !videos.length)
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
async function openArtistAlbums(albums, title, nextpage = '', artistId = '', artistName = '') {
  $('page-album').classList.toggle('from-artist', $('page-artist').classList.contains('on'));
  const seq = ++alSeq; alTracks = []; alCur = null;
  $('page-album').classList.add('release-list');
  $('page-album').style.setProperty('--album-cover', 'none');
  const box = $('alTracks'); box.replaceChildren();
  $('alArt').src = albums[0]?.thumb || '';
  $('alTitle').textContent = title;
  $('alArtist').textContent = '';
  $('alArtist').classList.remove('link');
  $('alArt').alt = '';
  $('alMeta').textContent = albums.length + ' הוצאות';
  $('alPlay').style.display = 'none'; $('alShuffle').style.display = 'none';
  const wrap = document.createElement('div'); wrap.className = 'artist-albums-grid';
  const seen = new Set(albums.map(a => a.plId));
  albums.forEach(a => wrap.appendChild(albumCardEl(a)));
  box.appendChild(wrap); openPage('page-album');
  if (!nextpage) return;
  const more = document.createElement('button'); more.className = 'ppill';
  more.textContent = 'עוד אלבומים ו-EP'; box.appendChild(more);
  more.addEventListener('click', async () => {
    if (!nextpage) return;
    more.disabled = true; more.textContent = 'טוען...';
    try {
      const j = await pipedFetch('/nextpage/search?nextpage=' + encodeURIComponent(nextpage) + '&q=' + encodeURIComponent(artistName) + '&filter=music_albums', 8000);
      const moreAlbums = (j.items || []).filter(x => x.type === 'playlist' && x.url)
        .map(mapAlbum).filter(a => a.plId && (a.artistId === artistId || normTxt(a.artistName) === normTxt(artistName)) && !seen.has(a.plId));
      if (seq !== alSeq) return;
      moreAlbums.forEach(a => { seen.add(a.plId); wrap.appendChild(albumCardEl(a)); });
      nextpage = j.nextpage && j.nextpage !== 'null' ? j.nextpage : '';
      $('alMeta').textContent = seen.size + ' הוצאות';
      if (!nextpage) more.remove(); else { more.disabled = false; more.textContent = 'עוד אלבומים ו-EP'; }
    } catch { more.disabled = false; more.textContent = 'נסה שוב לטעון עוד'; }
  });
}
function artistClipCard(v) {
  const el = document.createElement('button');
  el.type = 'button'; el.className = 'card vid';
  el.setAttribute('aria-label', 'נגן ' + v.title);
  el.innerHTML = `<img loading="lazy" src="${thumb(v.id)}" alt=""><div class="ct"></div><div class="cs dim"></div>`;
  el.querySelector('.ct').textContent = v.title;
  el.querySelector('.cs').textContent = v.dur ? fmt(v.dur) : '';
  el.addEventListener('click', () => { playQueue([v], 0); openPlayer(); });
  return el;
}
function openArtistClips(videos, artistName) {
  openArtistAlbums([], 'קליפים של ' + artistName);
  $('alMeta').textContent = videos.length + ' קליפים';
  const grid = $('alTracks').querySelector('.artist-albums-grid');
  videos.forEach(v => grid.appendChild(artistClipCard(v)));
}
function shareArtist() {
  if (!aCur?.chId) return;
  const url = 'https://www.youtube.com/channel/' + encodeURIComponent(aCur.chId);
  if (navigator.share) return navigator.share({ title: aCur.name, url }).catch(e => { if (e?.name !== 'AbortError') toast('לא הצלחתי לשתף'); });
  return navigator.clipboard.writeText(url).then(() => toast('הקישור לאמן הועתק')).catch(() => toast(url, 6000));
}
$('aShare').addEventListener('click', shareArtist);
$('aDots').addEventListener('click', () => {
  if (!aCur?.chId) return;
  $('artistSheetTitle').textContent = aCur.name || $('aName').textContent;
  $('artistSheetPlay').disabled = !aSongs.length;
  $('artistSheetFav').querySelector('span').textContent = state.favArtists[aCur.chId] ? 'הסר אמן מהמועדפים' : 'הוסף אמן למועדפים';
  openSheet('artistSheet');
});
$('artistSheetPlay').addEventListener('click', () => { closeSheet('artistSheet'); $('aPlay').click(); });
$('artistSheetFav').addEventListener('click', () => { closeSheet('artistSheet'); $('aFav').click(); });
$('artistSheetShare').addEventListener('click', () => { closeSheet('artistSheet'); shareArtist(); });

/* ---------- background continuity: save position, resume on return ---------- */
function captureResume() {
  const t = current();
  if (!t) return;
  let c = 0, paused = true;
  if (activeAudio()) { if (!M().src) return; c = livePosition(); paused = M().paused; }
  else if (engine === 'clip-pending') { c = livePosition(); paused = !(state.resume && state.resume.playing); }
  else { if (!ytReady || !yt.getCurrentTime) return; c = yt.getCurrentTime() || 0; paused = yt.getPlayerState() !== YT.PlayerState.PLAYING; }
  // A failed media reload must not overwrite a later saved position with zero.
  if (c < 1 && state.resume && state.resume.vid === t.id && state.resume.pos > 1) c = state.resume.pos;
  state.resume = { pos: c, playing: !paused, vid: t.id };
}
function saveResume() { captureResume(); save(); }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    saveResume();
    // Chrome on Windows marks a fully COVERED window as hidden and pauses video
    // elements in it - which freezes the YT embed engine. Move playback to the
    // plain audio element (keeps playing while hidden) before that happens.
    if (engine === 'yt' && !videoMode && ytReady && yt.getPlayerState && yt.getPlayerState() === YT.PlayerState.PLAYING) {
      const t = current();
      if (t) resolveAudioUrl(t.id).then(url => {
        if (!url || engine !== 'yt' || !current() || current().id !== t.id) return;
        const pos = yt.getCurrentTime ? yt.getCurrentTime() : 0;
        try { yt.stopVideo(); } catch {}
        engine = 'audio'; playGen++; paintEngineBadge();
        audioEl.dataset.vid = t.id;
        setAudioSrc(url);
        seekWhenReady(audioEl, pos);
        audioEl.play().catch(() => {});
      });
    }
    return;
  }
  const t = current();
  if (!t) return;
  // still playing (iOS let the audio run in the background)? just repaint.
  const stillPlaying = activeAudio() ? (M().src && !M().paused)
    : (ytReady && yt.getPlayerState && yt.getPlayerState() === YT.PlayerState.PLAYING);
  if (stillPlaying) { captureResume(); save(); syncPlayUI(false); paintNow(); return; }
  const r = state.resume;
  if (r && r.playing && r.vid === t.id) {
    // playback was suspended: pick up exactly where it stopped
    loadTrack(t, { startAt: Math.max(livePosition(), r.pos), autoplay: true });
    toast('ממשיכים מאיפה שעצרנו');
  } else {
    syncPlayUI(true);
    paintNow();
  }
});
setInterval(() => { if (current() && !document.hidden) saveResume(); }, 5000);
window.addEventListener('pagehide', saveResume);
window.addEventListener('freeze', saveResume);

/* restore position for the first play after a fresh launch */
let restorePos = (state.resume && state.resume.pos) || 0;
const takeRestorePos = () => { const p = restorePos; restorePos = 0; return p; };

/* Local-clock appearance: re-evaluate after midnight, on focus and on return
   from background without requiring a reload or network access. */
function applyClockTheme() {
  const hour = new Date().getHours();
  const dark = hour >= 19 || hour < 7;
  document.documentElement.classList.toggle('dark', dark);
  const themeMeta = document.getElementById('themeColor');
  if (themeMeta) themeMeta.content = dark ? '#111114' : '#ffffff';
}
applyClockTheme();
setInterval(applyClockTheme, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) applyClockTheme(); });
window.addEventListener('focus', applyClockTheme);

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

/* deep link: open Avi Music straight into a shared song */
(function deepLink() {
  const sid = new URLSearchParams(location.search).get('song');
  if (!sid || !/^[A-Za-z0-9_-]{11}$/.test(sid)) return;
  const t = { id: sid, title: 'שיר משותף', artist: '', dur: 0 };
  playQueue([t], 0);
  enrichTitle(t);
})();
