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

// YouTube Music metadata uses declared release years, never channel upload dates.
async function musicBrowse(body) {
 const day=new Date().toISOString().slice(0,10).replaceAll('-','');
 const r=await fetch('https://music.youtube.com/youtubei/v1/browse?alt=json', {
  method:'POST',headers:{'Content-Type':'application/json','Origin':'https://music.youtube.com','User-Agent':UA},
  body:JSON.stringify({context:{client:{clientName:'WEB_REMIX',clientVersion:'1.'+day+'.01.00',hl:'en'}},...body}),signal:AbortSignal.timeout(9000)
 });
 if(!r.ok)throw Error('music browse '+r.status);return r.json();
}
const text = v => (v?.runs || []).map(r => r.text || '').join('');
function releaseRow(item) {
 const r=item?.musicTwoRowItemRenderer; if(!r)return null;
 const endpoint=r.navigationEndpoint?.browseEndpoint || r.title?.runs?.[0]?.navigationEndpoint?.browseEndpoint;
 if(!/^MPRE[A-Za-z0-9_-]+$/.test(endpoint?.browseId || ''))return null;
 const params=endpoint.params || ''; let plId='';
 try {plId=atob(decodeURIComponent(params)).match(/OLAK5uy_[A-Za-z0-9_-]+/)?.[0] || '';}catch{}
 const runs=r.subtitle?.runs || [], year=runs.map(x=>x.text).find(x=>/^\d{4}$/.test(x||'')) || '';
 const thumb=r.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails?.at(-1)?.url || '';
 return {browseId:endpoint.browseId,plId,title:text(r.title),type:runs[0]?.text||'',releaseYear:year,dateSource:'youtube-music-release-year',thumb};
}
function parseAlbum(d,browseId,requestedPlaylistId='') {
 const c=d.contents?.twoColumnBrowseResultsRenderer;
 const h=c?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.musicResponsiveHeaderRenderer;
 if(!h)throw Error('album header missing');
 const playlistId=h.buttons?.map(x=>x.musicPlayButtonRenderer?.playNavigationEndpoint?.watchPlaylistEndpoint?.playlistId || x.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.playlistId).find(Boolean);
 if(!/^OLAK5uy_/.test(playlistId||''))throw Error('playlist identity missing');
 const artists=(h.straplineTextOne?.runs||[]).filter(r=>r.navigationEndpoint?.browseEndpoint?.browseId).map(r=>({name:r.text,id:r.navigationEndpoint.browseEndpoint.browseId}));
 const rows=c.secondaryContents?.sectionListRenderer?.contents?.[0]?.musicShelfRenderer?.contents || [];
 const tracks=rows.map(x=>x.musicResponsiveListItemRenderer).filter(Boolean).map(r=>{
  const cols=r.flexColumns||[], title=cols[0]?.musicResponsiveListItemFlexColumnRenderer?.text;
  const watch=title?.runs?.[0]?.navigationEndpoint?.watchEndpoint;
  if(watch?.playlistId!==playlistId)return null;
  const plays=cols.map(x=>text(x.musicResponsiveListItemFlexColumnRenderer?.text)).find(x=>/plays$/.test(x));
  return {id:watch.videoId,verifiedId:requestedPlaylistId||playlistId,title:text(title),artist:artists.map(x=>x.name).join(', '),playCountText:plays||'',videoType:watch.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType||'',duration:text(r.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text)};
 }).filter(x=>x && /^[\w-]{11}$/.test(x.id)&&x.title);
 return {browseId,requestedPlaylistId,playlistId,title:text(h.title),type:h.subtitle?.runs?.[0]?.text||'',releaseYear:(h.subtitle?.runs||[]).find(x=>/^\d{4}$/.test(x.text||''))?.text||'',artists,tracks};
}

async function albumTracks(id) {
 const cache=caches.default,key=new Request('https://avi-music-cache.local/album-v2/'+id);
 const hit=await cache.match(key);if(hit)return hit;
 const r=await fetch('https://music.youtube.com/playlist?list='+encodeURIComponent(id),{headers:{'User-Agent':UA},signal:AbortSignal.timeout(7000)});
 if(!r.ok)throw Error('music playlist '+r.status);
 const html=await r.text(),bid=html.match(/(MPRE[A-Za-z0-9_-]+)/)?.[1];
 if(!bid)throw Error('album browse identity missing');
 const album=parseAlbum(await musicBrowse({browseId:bid}),bid,id);
 if(!album.title||!album.tracks.length)throw Error('album unavailable');
 album.canonicalPlaylistId=album.playlistId;album.playlistId=id;
 const result=json(album);result.headers.set('Cache-Control','public, max-age=3600');cache.put(key,result.clone()).catch(()=>{});return result;
}

function musicSections(d) {
 return d.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer || null;
}
function rowsFromMusic(d) {
 const sections=musicSections(d)?.contents || d.continuationContents?.sectionListContinuation?.contents || [];
 const container=sections[0]?.gridRenderer || sections[0]?.musicCarouselShelfRenderer || d.continuationContents?.gridContinuation;
 return {items:container?.items||container?.contents||[],continuations:container?.continuations||[]};
}
async function musicSimilarArtists(id){
 const key=new Request('https://avi-music-cache.local/similar-v1/'+id),cache=caches.default;
 const hit=await cache.match(key);if(hit)return hit;
 const page=await musicBrowse({browseId:id});
 const header=page.header?.musicImmersiveHeaderRenderer||page.header?.musicVisualHeaderRenderer;
 if(!header?.title)throw Error('artist identity missing');
 const shelf=(musicSections(page)?.contents||[]).map(x=>x.musicCarouselShelfRenderer).find(r=>text(r?.header?.musicCarouselShelfBasicHeaderRenderer?.title)==='Fans might also like');
 const artists=(shelf?.contents||[]).map(x=>x.musicTwoRowItemRenderer).filter(Boolean).map(r=>({name:text(r.title),id:r.navigationEndpoint?.browseEndpoint?.browseId,avatar:r.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails?.at(-1)?.url||''})).filter(a=>/^UC[\w-]{22}$/.test(a.id||'')&&a.name&&a.id!==id);
 const result=json({artistId:id,artistName:text(header.title),source:'youtube-music-fans-might-also-like',artists});
 result.headers.set('Cache-Control','public, max-age=86400');cache.put(key,result.clone()).catch(()=>{});return result;
}
async function musicArtistReleases(id) {
 const key=new Request('https://avi-music-cache.local/artist-music-v1/'+id),cache=caches.default;
 const hit=await cache.match(key);if(hit)return hit;
 const page=await musicBrowse({browseId:id});
 const header=page.header?.musicImmersiveHeaderRenderer || page.header?.musicVisualHeaderRenderer;
 if(!header?.title)throw Error('music artist identity missing');
 const sourceArtistId=header.subscriptionButton?.subscribeButtonRenderer?.channelId||id;
 const sections=musicSections(page)?.contents||[],releases=[],seen=new Set();let partial=false;
 const add=(row,category,rank=0,recencyRank=0)=>{
  const r=releaseRow(row);if(!r||!r.plId)return;
  if(!seen.has(r.browseId)){r.artistId=id;r.artistName=text(header.title);r.releaseType=/single/i.test(r.type)?'single':/EP/i.test(r.type)?'ep':category==='singles'?'single':'album';r.popularityRank=rank;r.recencyRank=recencyRank;releases.push(r);seen.add(r.browseId);}
  else {const r= releases.find(x=>x.browseId===releaseRow(row).browseId);if(rank)r.popularityRank=rank;if(recencyRank)r.recencyRank=recencyRank;}
 };
 for(const section of sections){
  const shelf=section.musicCarouselShelfRenderer,title=text(shelf?.header?.musicCarouselShelfBasicHeaderRenderer?.title);
  const category=title==='Albums'?'albums':title==='Singles & EPs'?'singles':null;if(!category)continue;
  for(const item of shelf.contents||[])add(item,category);
  const endpoint=shelf.header.musicCarouselShelfBasicHeaderRenderer.moreContentButton?.buttonRenderer?.navigationEndpoint?.browseEndpoint||shelf.header.musicCarouselShelfBasicHeaderRenderer.title?.runs?.[0]?.navigationEndpoint?.browseEndpoint;
  if(!endpoint){partial=true;continue;}
  try {
   const base={browseId:endpoint.browseId,params:endpoint.params},first=await musicBrowse(base);
   const options=musicSections(first)?.header?.musicSideAlignedItemRenderer?.endItems?.[0]?.musicSortFilterButtonRenderer?.menu?.musicMultiSelectMenuRenderer?.options||[];
   const sortToken=name=>{
    const option=options.map(x=>x.musicMultiSelectMenuItemRenderer).find(x=>text(x?.title)===name);
    return option?.selectedCommand?.commandExecutorCommand?.commands?.find(x=>x.browseSectionListReloadEndpoint)?.browseSectionListReloadEndpoint?.continuation?.reloadContinuationData?.continuation;
   };
   const recencyToken=sortToken('Recency');
   let current=recencyToken?await musicBrowse({...base,continuation:recencyToken}):first,recencyRank=0;
   for(let i=0;i<6;i++){
    const rows=rowsFromMusic(current);rows.items.forEach(x=>add(x,category,0,recencyToken?++recencyRank:0));
    const token=rows.continuations?.[0]?.nextContinuationData?.continuation;
    if(!token)break;if(i===5){partial=true;break;}
    current=await musicBrowse({...base,continuation:token});
   }
   if(category==='albums'){
    const token=sortToken('Popularity');
    if(token){const sorted=rowsFromMusic(await musicBrowse({...base,continuation:token}));sorted.items.forEach((x,i)=>add(x,category,i+1));}
   }
  }catch{partial=true;}
 }
 if(!releases.length)throw Error('music releases unavailable');
 const result=json({artistId:id,sourceArtistId,artistName:text(header.title),dateSource:'youtube-music-release-year',releases,partial});
 result.headers.set('Cache-Control','public, max-age=3600');cache.put(key,result.clone()).catch(()=>{});return result;
}
async function artistReleases(id){
 try{return await musicArtistReleases(id);}catch{
  const response=await legacyArtistReleases(id),data=await response.json();
  data.releases=data.releases.map(r=>({...r,uploadDate:r.date,date:'',dateSource:'unknown'}));data.partial=true;
  return json(data);
 }
}

// Artist releases are scoped to the exact channel response's "Albums & Singles" shelf.
// A release's uploader channel may differ from its Topic channel; do not rely
// on the release's author ID for channel identity. Never parse recommendations.
async function legacyArtistReleases(id) {
  const key = new Request('https://avi-music-cache.local/artist-v2/' + id), cache = caches.default;
  const hit = await cache.match(key); if (hit) return hit;
  const browse = async params => {
    const r = await fetch('https://www.youtube.com/youtubei/v1/browse?key=' + INNERTUBE_KEY, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: '2.20250925.01.00', hl: 'en' } }, ...params }),
      signal: AbortSignal.timeout(7000),
    });
    if (!r.ok) throw new Error('browse ' + r.status);
    return r.json();
  };
  const page = await browse({browseId:id});
  if (page.metadata?.channelMetadataRenderer?.externalId !== id) throw new Error('channel identity mismatch');
  const sections = page.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
  const shelf = sections.map(x=>x.shelfRenderer).find(x => /Albums & Singles/i.test(x?.title?.runs?.[0]?.text || ''));
  if (!shelf) throw new Error('release shelf unavailable');
  const releases = [], seen = new Set();
  const add = (id,title,thumb,byline,count) => {
    if (!/^OLAK5uy_[A-Za-z0-9_-]{10,80}$/.test(id || '') || !title || seen.has(id)) return;
    const dateText = (byline || '').match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, \d{4}\b/)?.[0] || '';
    const timestamp = dateText ? Date.parse(dateText + ' UTC') : NaN;
    releases.push({plId:id,title,thumb:thumb || '',artistName:page.metadata.channelMetadataRenderer.title.replace(/ - Topic$/i,''),artistId:page.metadata.channelMetadataRenderer.externalId,
      date: Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0,10) : '',
      sub:count || ''}); seen.add(id);
  };
  for (const row of shelf.content?.horizontalListRenderer?.items || []) {
    const x=row.lockupViewModel;
    if (x?.contentType !== 'LOCKUP_CONTENT_TYPE_ALBUM') continue;
    const meta=x.metadata?.lockupMetadataViewModel;
    add(x.contentId,meta?.title?.content,x.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.image?.sources?.[0]?.url,
      (meta?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts || []).map(v=>v.text?.content || '').join(' '),
      x.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.overlays?.[0]?.thumbnailOverlayBadgeViewModel?.thumbnailBadges?.[0]?.thumbnailBadgeViewModel?.text);
  }
  let token=shelf.title?.runs?.[0]?.navigationEndpoint?.showEngagementPanelEndpoint?.engagementPanel?.engagementPanelSectionListRenderer?.content?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents?.[0]?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
  // The all-releases panel includes more singles than the carousel. Bounded paging.
  for (let i=0;token && i<4;i++) {
    const data=await browse({continuation:token});
    const continuationItems=data.onResponseReceivedEndpoints?.[0]?.appendContinuationItemsAction?.continuationItems || [];
    const grid=continuationItems[0]?.gridRenderer;
    const items=grid?.items || continuationItems;
    if (!items.length) break;
    for (const item of items) {
      const x=item.gridPlaylistRenderer;
      if (!x) continue;
      add(x.playlistId,x.title?.runs?.[0]?.text,x.thumbnail?.thumbnails?.[0]?.url,
        (x.shortBylineText?.runs || []).map(v=>v.text || '').join(''),x.videoCountText?.runs?.[0]?.text);
    }
    token=items.at(-1)?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
  }
  if (!releases.length) throw new Error('no releases');
  releases.sort((a,b)=>(b.date || '').localeCompare(a.date || '') || a.title.localeCompare(b.title));
  const result=json({channelId:id,channelName:page.metadata.channelMetadataRenderer.title,releases,partial:!!token});
  result.headers.set('Cache-Control',token ? 'no-store' : 'public, max-age=1800');
  if (!token) cache.put(key,result.clone()).catch(()=>{});
  return result;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const similarId=url.pathname.match(/^\/similar-artists\/(UC[A-Za-z0-9_-]{22})\/?$/)?.[1];
    if(similarId){try{return await musicSimilarArtists(similarId);}catch(e){return json({error:String(e?.message||e)},502);}}
    const musicArtistId = url.pathname.match(/^\/music-artist\/(UC[A-Za-z0-9_-]{22})\/?$/)?.[1];
    if(musicArtistId){try{return await musicArtistReleases(musicArtistId);}catch(e){return json({error:String(e?.message||e)},502);}}
    const artistId = url.pathname.match(/^\/artist\/(UC[A-Za-z0-9_-]{22})\/?$/)?.[1];
    if (artistId) {
      try { return await legacyArtistReleases(artistId); }
      catch (e) { return json({ error: String(e?.message || e) }, 502); }
    }
    const albumId = url.pathname.match(/^\/album\/(OLAK5uy_[A-Za-z0-9_-]{10,80})\/?$/)?.[1];
    if (albumId) {
      try { return await albumTracks(albumId); }
      catch (e) { return json({ error: String(e?.message || e) }, 502); }
    }
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
