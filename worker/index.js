/**
 * Avi Music - private audio extraction proxy (Cloudflare Worker)
 *
 * GET /audio/:vid  -> audio/mp4 bytes (CORS, Range-aware, chunked upstream)
 * GET /url/:vid    -> { url, mime, bitrate } (absolute worker URL; compat)
 * GET /healthz     -> "ok"
 *
 * Extraction: YouTube Innertube player API (IOS -> MWEB -> WEB clients).
 * googlevideo URLs are IP-bound, so the worker proxies the bytes itself.
 * Upstream rejects open-ended ranges, so all upstream fetches use bounded
 * chunk ranges (CHUNK bytes) stitched into one downstream stream.
 * Format metadata is cached per-colo (Cache API) for up to 5.5 hours
 * (googlevideo URLs live ~6h).
 */

const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const CLIENTS = [
  // ANDROID returns a progressive (non-fragmented) mp4 that plays in a plain
  // <audio> element; adaptive audio-only formats are DASH-fragmented and don't.
  { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 34, hl: 'en' },
  { clientName: 'IOS', clientVersion: '20.10.4', deviceModel: 'iPhone16,2', hl: 'en' },
  { clientName: 'MWEB', clientVersion: '2.20250925.01.00', hl: 'en' },
  { clientName: 'WEB', clientVersion: '2.20250925.01.00', hl: 'en' },
];
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const CHUNK = 4 * 1024 * 1024;      // upstream chunk size
const MAX_BYTES = 300 * 1024 * 1024; // absolute cap per stream
const FMT_CACHE_TTL = 5.5 * 3600;   // seconds

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Type',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function extractFormat(vid) {
  const cache = caches.default;
  const key = new Request(`https://avi-music-cache.local/fmt-v4/${vid}`);
  const hit = await cache.match(key);
  if (hit) {
    const j = await hit.json();
    if (j.exp > Date.now()) return j.fmt;
  }
  for (let pass = 0; pass < 2; pass++)
  for (const client of CLIENTS) {
    try {
      const r = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
        body: JSON.stringify({ context: { client }, videoId: vid }),
      });
      if (!r.ok) continue;
      const j = await r.json();
      const ps = j.playabilityStatus || {};
      if (ps.status !== 'OK') continue;
      const sd = j.streamingData || {};
      // Prefer a muxed progressive mp4 (itag 18): playable as-is in <audio>.
      const muxed = (sd.formats || []).filter(f => f.url && /video\/mp4/.test(f.mimeType || ''));
      const adaptive = sd.adaptiveFormats || [];
      const auds = adaptive.filter(f => f.url && /audio\//.test(f.mimeType || ''));
      if (!muxed.length && !auds.length) continue;
      const mp4 = auds.filter(f => /audio\/mp4/.test(f.mimeType));
      const best = muxed.length
        ? muxed.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0]
        : (mp4.length ? mp4 : auds).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
      let clen = parseInt(best.contentLength || '0', 10) || 0;
      // Estimate from bitrate x duration; googlevideo's reported total can be
      // wildly wrong (observed 2.8GB on a 25MB file), so prefer the estimate
      // whenever the declared/probed size looks inconsistent.
      const durSec = parseInt((j.videoDetails || {}).lengthSeconds || '0', 10) || 0;
      const est = (durSec && best.bitrate) ? Math.ceil((best.bitrate / 8) * durSec * 1.05) : 0;
      if (!clen) {
        try {
          const p = await fetch(best.url, { headers: { Range: 'bytes=0-0', 'User-Agent': UA } });
          const cr = p.headers.get('content-range') || '';
          const mm = /\/(\d+)$/.exec(cr);
          if (mm) clen = parseInt(mm[1], 10) || 0;
          if (p.body) p.body.cancel().catch(() => {});
        } catch (e) { /* leave 0 */ }
      }
      if (est && (!clen || clen > est * 3 || clen < est / 3)) clen = est;
      if (!clen) continue; // cannot range-stream an unknown-length source safely
      const fmt = {
        url: best.url,
        mime: (best.mimeType || 'video/mp4').split(';')[0],
        bitrate: best.bitrate || 0,
        contentLength: clen,
      };
      const resp = new Response(JSON.stringify({ exp: Date.now() + FMT_CACHE_TTL * 1000, fmt }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${FMT_CACHE_TTL}` },
      });
      cache.put(key, resp).catch(() => {});
      return fmt;
    } catch (e) { /* try next client */ }
  }
  throw new Error('no playable audio format');
}

async function fetchChunk(url, start, end) {
  const r = await fetch(url, { headers: { Range: `bytes=${start}-${end}`, 'User-Agent': UA } });
  if (!(r.status === 206 || r.status === 200) || !r.body) throw new Error('upstream ' + r.status);
  return r.body;
}

function streamAudio(fmt, rangeHeader) {
  let start = 0;
  let end = fmt.contentLength > 0 ? fmt.contentLength - 1 : MAX_BYTES - 1;
  let partial = false;
  if (rangeHeader) {
    const m = /bytes=(\d+)(?:-(\d+))?/.exec(rangeHeader);
    if (m) {
      partial = true;
      start = parseInt(m[1], 10) || 0;
      if (m[2]) end = Math.min(end, parseInt(m[2], 10));
    }
  }
  end = Math.min(end, start + MAX_BYTES - 1);
  const total = end - start + 1;
  let pos = start;
  let cancelled = false;
  const stream = new ReadableStream({
    async pull(controller) {
      if (cancelled || pos > end) { controller.close(); return; }
      const chunkEnd = Math.min(pos + CHUNK - 1, end);
      try {
        const body = await fetchChunk(fmt.url, pos, chunkEnd);
        const reader = body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        pos = chunkEnd + 1;
        if (pos > end) controller.close();
      } catch (e) {
        // If we already delivered bytes, a failed tail chunk (e.g. estimated
        // length overshoots the real EOF) must look like a clean end of file,
        // not a network error.
        if (pos > start) { controller.close(); return; }
        controller.error(e);
      }
    },
    cancel() { cancelled = true; },
  });
  const headers = {
    ...CORS,
    'Content-Type': fmt.mime,
    'Accept-Ranges': 'bytes',
    'Content-Length': String(total),
    'Cache-Control': 'no-store',
  };
  if (partial) headers['Content-Range'] = `bytes ${start}-${end}/${fmt.contentLength || total}`;
  return new Response(stream, { status: partial ? 206 : 200, headers });
}

async function debugClients(vid) {
  const out = [];
  for (const client of CLIENTS) {
    try {
      const r = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
        body: JSON.stringify({ context: { client }, videoId: vid }),
      });
      const j = await r.json();
      const sd = j.streamingData || {};
      out.push({
        client: client.clientName,
        http: r.status,
        playability: (j.playabilityStatus || {}).status,
        muxed: (sd.formats || []).map(f => f.itag),
        adaptiveAudioMp4: (sd.adaptiveFormats || []).filter(f => /audio\/mp4/.test(f.mimeType || '')).length,
      });
    } catch (e) { out.push({ client: client.clientName, error: String(e) }); }
  }
  return out;
}


function parseLyricTitle(t) {
  t = t.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
  let m = t.match(/^(.*?)\s+lyrics\s+by\s+(.+?)\s*(?:[-\u2013|].*)?$/i);
  if (m) return { track: m[1].trim(), artist: m[2].trim() };
  t = t.replace(/\s*[-\u2013|]\s*(genius|azlyrics|musixmatch|lyrics on demand|songfacts|youtube|lyrics\.com|metrolyrics|shironet).*$/i, '');
  t = t.replace(/\s+lyrics(?=\s*[-\u2013|])/i, '').replace(/\s*lyrics\s*$/i, '').trim();
  m = t.match(/^(.+?)\s*[-\u2013]\s*(.+)$/);
  if (m) return { artist: m[1].trim(), track: m[2].trim() };
  return t ? { track: t, artist: '' } : null;
}

function parseVideoTitle(t, uploader) {
  t = t.replace(/[\(\[][^\)\]]*(official|lyric|video|audio|\u05e7\u05dc\u05d9\u05e4|\u05de\u05d9\u05dc\u05d9\u05dd)[^\)\]]*[\)\]]/gi, ' ').replace(/\s+/g, ' ').trim();
  const m = t.match(/^(.+?)\s*[-\u2013]\s*(.+)$/);
  if (m) return { artist: m[1].trim(), track: m[2].trim() };
  return t ? { track: t, artist: uploader || '' } : null;
}

async function lyricsSearch(url) {
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) return json({ error: 'q required' }, 400);
  const words = q.toLowerCase().split(/\s+/).filter(x => x.length > 1);
  const cands = [];
  const dbg = {};
  // A) YouTube search via Piped: YouTube matches lyric lines (lyric videos, official audio)
  if (words.length >= 3) {
    for (const base of ['https://api.piped.private.coffee', 'https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de']) {
      try {
        const r = await fetch(base + '/search?q=' + encodeURIComponent(q) + '&filter=videos', { signal: AbortSignal.timeout(6000) });
        dbg['piped_' + base.split('//')[1]] = r.status;
        if (!r.ok) continue;
        const j = await r.json();
        const items = (j.items || []).filter(it => it.type === 'stream').slice(0, 8);
        for (const it of items) {
          const c = parseVideoTitle(String(it.title || ''), String(it.uploaderName || ''));
          if (c && c.track) cands.push(c);
        }
        if (items.length) break;
      } catch (e) { dbg['piped_' + base.split('//')[1]] = String(e); }
    }
  }
  // B) LRCLIB metadata search as extra candidates
  try {
    const r = await fetch('https://lrclib.net/api/search?q=' + encodeURIComponent(q));
    const arr = await r.json();
    if (Array.isArray(arr)) for (const it of arr.slice(0, 4)) {
      if (it.trackName && it.artistName) cands.push({ track: it.trackName, artist: it.artistName });
    }
  } catch {}
  // strict confirm against LRCLIB lyric text: every query word must appear, and one line must contain them all
  const out = []; const seen = new Set();
  for (const c of cands) {
    if (out.length >= 3) break;
    const key = (c.artist + '|' + c.track).toLowerCase();
    if (seen.has(key)) continue; seen.add(key);
    try {
      const u = new URL('https://lrclib.net/api/search');
      u.searchParams.set('track_name', c.track);
      if (c.artist) u.searchParams.set('artist_name', c.artist);
      const r = await fetch(u);
      const arr = await r.json();
      if (!Array.isArray(arr)) continue;
      const hit = arr.find(it => {
        const lyr = (it.plainLyrics || '').toLowerCase();
        return lyr && words.every(x => lyr.includes(x));
      });
      if (hit) {
        const lines = (hit.plainLyrics || '').split('\n').map(s => s.trim()).filter(Boolean);
        const line = lines.find(l => words.every(x => l.toLowerCase().includes(x)));
        if (line) out.push({ title: hit.trackName, artist: hit.artistName, line });
      }
    } catch {}
  }
  return json(url.searchParams.has('dbg') ? { matches: out, dbg } : { matches: out });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const md = url.pathname.match(/^\/debug\/([A-Za-z0-9_-]{11})\/?$/);
    if (md) return json(await debugClients(md[1]));
    const m = url.pathname.match(/^\/(audio|url)\/([A-Za-z0-9_-]{11})\/?$/);
    if (url.pathname === '/lyrics') return lyricsSearch(url);
    if (url.pathname === '/healthz') return new Response('ok', { headers: CORS });
    if (!m) return json({ error: 'not found' }, 404);
    const [, kind, vid] = m;
    try {
      const fmt = await extractFormat(vid);
      if (kind === 'url') {
        return json({ url: `${url.origin}/audio/${vid}`, mime: fmt.mime, bitrate: fmt.bitrate });
      }
      return streamAudio(fmt, request.headers.get('Range'));
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 502);
    }
  },
};
