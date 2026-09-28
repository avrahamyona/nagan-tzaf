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
  const key = new Request(`https://avi-music-cache.local/fmt-v2/${vid}`);
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
      const fmt = {
        url: best.url,
        mime: (best.mimeType || 'video/mp4').split(';')[0],
        bitrate: best.bitrate || 0,
        contentLength: parseInt(best.contentLength || '0', 10) || 0,
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

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const md = url.pathname.match(/^\/debug\/([A-Za-z0-9_-]{11})\/?$/);
    if (md) return json(await debugClients(md[1]));
    const m = url.pathname.match(/^\/(audio|url)\/([A-Za-z0-9_-]{11})\/?$/);
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
