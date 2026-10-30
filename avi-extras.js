/* avi-extras.js — v221: podcasts area, sleep timer, playlist share/join codes.
   Hooks into the core player through window.avi (exposed at the end of 2-v151-app.js). */
(() => {
  if (!window.avi) return;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const st = () => window.avi.state();
  const save = () => window.avi.save();
  st().podLib ||= [];
  st().podPos ||= {};

  const fmtDur = sec => {
    sec = Math.round(sec || 0);
    if (sec >= 3600) return Math.floor(sec / 3600) + ':' + String(Math.floor(sec % 3600 / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  };
  const fmtDate = iso => { try { return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; } };

  /* ---------- podcast catalog (Apple's public iTunes API, no account) ---------- */
  const ITUNES = 'https://itunes.apple.com';
  async function searchShows(q) {
    const r = await fetch(ITUNES + '/search?media=podcast&entity=podcast&limit=24&country=IL&term=' + encodeURIComponent(q));
    if (!r.ok) throw new Error('http ' + r.status);
    return (await r.json()).results || [];
  }
  async function loadShow(showId) {
    const r = await fetch(ITUNES + '/lookup?id=' + encodeURIComponent(showId) + '&entity=podcastEpisode&limit=200&country=IL');
    if (!r.ok) throw new Error('http ' + r.status);
    const res = (await r.json()).results || [];
    return { show: res.find(x => x.kind === 'podcast') || null, episodes: res.filter(x => x.kind === 'podcast-episode') };
  }

  const epToTrack = (show, ep) => ({
    id: 'pod:' + show.collectionId + ':' + ep.trackId,
    title: ep.trackName || 'פרק',
    artist: show.collectionName,
    dur: Math.round((ep.trackTimeMillis || 0) / 1000),
    ch: show.artistName || '',
    pod: { url: ep.episodeUrl, art: show.art600 || show.art, show: show.collectionName, showId: show.collectionId, date: ep.releaseDate || '' },
  });
  const showMeta = s => ({ id: s.collectionId, name: s.collectionName, artist: s.artistName || '', art: (s.artworkUrl600 || s.artworkUrl100 || '').replace('100x100', '600x600') });

  /* ---------- podcast view ---------- */
  let podView = { mode: 'home', show: null, episodes: [], sortNew: true };
  const followed = id => st().podLib.some(x => x.id === id);

  function podCard(s) {
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'card sq podcard';
    el.innerHTML = `<img loading="lazy" src="${esc(s.art || s.artworkUrl600 || s.artworkUrl100)}" alt=""><span class="pct">${esc(s.name || s.collectionName)}</span><span class="pcs dim">${esc(s.artist || s.artistName || '')}</span>`;
    el.addEventListener('click', () => openShow(s.id || s.collectionId, showMeta(s.collectionId ? s : { collectionId: s.id, collectionName: s.name, artistName: s.artist, artworkUrl600: s.art })));
    return el;
  }

  function renderPodHome() {
    const box = $('podBody'); if (!box) return;
    box.innerHTML = '';
    if (st().podLib.length) {
      const h = document.createElement('h2'); h.className = 'secttl'; h.textContent = 'עוקב אחרי';
      const grid = document.createElement('div'); grid.className = 'podgrid';
      st().podLib.forEach(s => grid.appendChild(podCard(s)));
      box.append(h, grid);
    }
    const h2 = document.createElement('h2'); h2.className = 'secttl'; h2.textContent = 'חיפוש פודקאסטים';
    const res = document.createElement('div'); res.id = 'podResults'; res.className = 'podgrid';
    box.append(h2, res);
    if (podView.lastResults) podView.lastResults.forEach(s => res.appendChild(podCard(s)));
  }

  async function runPodSearch() {
    const q = ($('podSearch')?.value || '').trim();
    if (!q) return;
    const res = $('podResults'); if (!res) return;
    res.innerHTML = '<div class="dim podnote">מחפש…</div>';
    try {
      const shows = await searchShows(q);
      podView.lastResults = shows;
      res.innerHTML = '';
      if (!shows.length) { res.innerHTML = '<div class="dim podnote">לא נמצאו פודקאסטים.</div>'; return; }
      shows.forEach(s => res.appendChild(podCard(s)));
    } catch { res.innerHTML = '<div class="dim podnote">החיפוש נכשל - בדקו חיבור ונסו שוב.</div>'; }
  }

  async function openShow(showId, meta) {
    const box = $('podBody'); if (!box) return;
    podView = { mode: 'show', show: meta || { id: showId }, episodes: [], sortNew: true };
    box.innerHTML = '<div class="dim podnote">טוען פרקים…</div>';
    let data;
    try { data = await loadShow(showId); }
    catch { box.innerHTML = '<div class="dim podnote">טעינת הפודקאסט נכשלה.</div>'; return; }
    if (podView.mode !== 'show') return;
    const show = { ...(meta || {}), ...(data.show ? showMeta(data.show) : {}) };
    if (!show.name && data.show) show.name = data.show.collectionName;
    show.id = showId;
    podView.show = show; podView.episodes = data.episodes;
    renderShow();
  }

  function renderShow() {
    const box = $('podBody'); if (!box || podView.mode !== 'show') return;
    const s = podView.show;
    const eps = podView.episodes.slice().sort((a, b) => (podView.sortNew ? 1 : -1) * (new Date(a.releaseDate) - new Date(b.releaseDate)));
    box.innerHTML = '';
    const head = document.createElement('div'); head.className = 'podhero';
    head.innerHTML = `
      <button class="pageback" id="podBack"><svg><use href="#i-chev-back"/></svg></button>
      <img class="podheroart" src="${esc(s.art || '')}" alt="">
      <div class="podherometa">
        <h2>${esc(s.name || '')}</h2>
        <div class="dim">${esc(s.artist || '')}</div>
        <div class="podheroactions">
          <button id="podFollow" class="ppill">${followed(s.id) ? 'עוקב ✓' : 'עקוב'}</button>
          <button id="podSort" class="ppill">${podView.sortNew ? 'חדש קודם' : 'ישן קודם'}</button>
        </div>
      </div>`;
    const list = document.createElement('div'); list.className = 'tracklist';
    if (!eps.length) list.innerHTML = '<div class="dim podnote">לא נמצאו פרקים בקטלוג.</div>';
    eps.forEach(ep => {
      const t = epToTrack(s, ep);
      window.avi.podArtMap[t.id] = t.pod.art;
      const pos = st().podPos[t.id] || 0;
      const row = document.createElement('button');
      row.type = 'button'; row.className = 'trackrow podrow';
      row.innerHTML = `
        <div class="podrowmeta">
          <span class="t">${esc(t.title)}</span>
          <span class="a dim">${fmtDate(ep.releaseDate)}${t.dur ? ' · ' + fmtDur(t.dur) : ''}${pos && t.dur ? ' · נשאר ' + fmtDur(Math.max(0, t.dur - pos)) : ''}</span>
          ${ep.description ? `<span class="d dim">${esc(String(ep.description).replace(/<[^>]+>/g, ' ').slice(0, 140))}</span>` : ''}
        </div>
        <svg class="podplay"><use href="#i-play"/></svg>`;
      row.addEventListener('click', () => {
        const tracks = eps.map(e2 => epToTrack(s, e2));
        window.avi.playQueue(tracks, tracks.findIndex(x => x.id === t.id));
      });
      list.appendChild(row);
    });
    box.append(head, list);
    $('podBack').addEventListener('click', () => { podView = { mode: 'home', show: null, episodes: [], sortNew: true, lastResults: podView.lastResults }; renderPodHome(); });
    $('podFollow').addEventListener('click', () => {
      const lib = st().podLib;
      const i = lib.findIndex(x => x.id === s.id);
      if (i >= 0) { lib.splice(i, 1); window.avi.toast('הוסר מהמעקב'); }
      else { lib.unshift({ id: s.id, name: s.name, artist: s.artist, art: s.art }); window.avi.toast('נוסף למעקב'); }
      save(); renderShow();
    });
    $('podSort').addEventListener('click', () => { podView.sortNew = !podView.sortNew; renderShow(); });
  }

  $('podSearchGo')?.addEventListener('click', runPodSearch);
  $('podSearch')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); runPodSearch(); } });
  document.querySelector('[data-tab="podcasts"]')?.addEventListener('click', () => setTimeout(renderPodHome, 0));
  renderPodHome();

  /* ---------- resume positions for podcast episodes ---------- */
  let lastPosSave = 0;
  setInterval(() => {
    const mi = window.avi.mediaInfo?.();
    if (!mi || !mi.pod) return;
    const pos = st().podPos;
    if (mi.dur && mi.cur > mi.dur - 8) { if (pos[mi.id]) { delete pos[mi.id]; save(); } return; }
    if (!mi.paused && mi.cur > 5) {
      pos[mi.id] = Math.floor(mi.cur);
      if (Date.now() - lastPosSave > 15000) { lastPosSave = Date.now(); save(); }
    }
  }, 5000);
  // re-register artwork for restored queues
  (function registerArts() {
    const scan = arr => (arr || []).forEach(t => { if (t?.pod?.art) window.avi.podArtMap[t.id] = t.pod.art; });
    scan(st().queue); scan(st().history); scan(st().priorityQueue);
    Object.values(st().playlists || {}).forEach(scan);
  })();

  /* ---------- sleep timer ---------- */
  let sleepTimer = null, sleepUntil = 0, sleepTrack = null, sleepPoll = null;
  const cSleep = $('cSleep');
  function sleepOff(silent) {
    clearTimeout(sleepTimer); clearInterval(sleepPoll);
    sleepTimer = null; sleepTrack = null; sleepUntil = 0;
    cSleep?.classList.remove('on');
    if (!silent) window.avi.toast('טיימר השינה בוטל');
  }
  function sleepFire() {
    window.avi.pausePlayback();
    sleepOff(true);
    window.avi.toast('טיימר השינה עצר את הניגון');
  }
  function setSleepMinutes(mins) {
    sleepOff(true);
    sleepUntil = Date.now() + mins * 60000;
    sleepTimer = setTimeout(sleepFire, mins * 60000);
    cSleep?.classList.add('on');
    window.avi.toast(`טיימר שינה: ${mins} דקות`);
  }
  function setSleepTrackEnd() {
    const mi = window.avi.mediaInfo?.();
    if (!mi) return window.avi.toast('שום דבר לא מתנגן כרגע');
    sleepOff(true);
    sleepTrack = mi.id;
    sleepPoll = setInterval(() => {
      const cur = window.avi.mediaInfo?.();
      if (!cur || cur.id !== sleepTrack) { sleepOff(true); return; }
      if (cur.dur && cur.dur - cur.cur <= 1.2) sleepFire();
    }, 1000);
    cSleep?.classList.add('on');
    window.avi.toast('טיימר שינה: עד סוף השיר');
  }
  cSleep?.addEventListener('click', () => {
    const active = !!(sleepTimer || sleepTrack);
    $('sleepCancelRow')?.classList.toggle('hidden', !active);
    $('sleepActiveNote')?.classList.toggle('hidden', !active);
    if (active && sleepUntil) $('sleepActiveNote').textContent = 'פעיל: עוד ' + Math.max(1, Math.round((sleepUntil - Date.now()) / 60000)) + ' דקות';
    else if (active) $('sleepActiveNote').textContent = 'פעיל: עד סוף השיר';
    window.avi.openSheet('sleepSheet');
  });
  document.querySelectorAll('#sleepSheet [data-mins]').forEach(b => b.addEventListener('click', () => { setSleepMinutes(+b.dataset.mins); window.avi.closeSheet('sleepSheet'); }));
  $('sleepTrackRow')?.addEventListener('click', () => { setSleepTrackEnd(); window.avi.closeSheet('sleepSheet'); });
  $('sleepCancelRow')?.addEventListener('click', () => { sleepOff(); window.avi.closeSheet('sleepSheet'); });

  /* ---------- playlist share / join codes (self-contained, no server) ---------- */
  const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  async function encodePl(name, tracks) {
    const payload = JSON.stringify({ n: name, t: tracks.map(t => ({ i: t.id, t: t.title, a: t.artist, d: t.dur || 0 })) });
    const cs = new CompressionStream('deflate-raw');
    const out = new Response(new Blob([payload]).stream().pipeThrough(cs));
    return 'AVI1.' + b64u(await out.arrayBuffer());
  }
  async function decodePl(code) {
    code = code.trim();
    if (!code.startsWith('AVI1.')) throw new Error('bad prefix');
    const ds = new DecompressionStream('deflate-raw');
    const out = new Response(new Blob([unb64u(code.slice(5))]).stream().pipeThrough(ds));
    const j = JSON.parse(await new Response(out.body).text());
    if (!j || !Array.isArray(j.t) || !j.n) throw new Error('bad payload');
    return { name: String(j.n).slice(0, 80), tracks: j.t.slice(0, 500).map(x => ({ id: String(x.i), title: String(x.t), artist: String(x.a || ''), dur: +x.d || 0 })).filter(x => x.id && x.title) };
  }
  $('plShare')?.addEventListener('click', async () => {
    const ctx = window.avi.plCtx?.();
    if (!ctx || ctx.kind !== 'pl' || !ctx.tracks.length) return window.avi.toast('אי אפשר לשתף כאן');
    try {
      const code = await encodePl(ctx.name, ctx.tracks);
      $('shareCodeBox').textContent = code;
      window.avi.openSheet('shareSheet');
    } catch { window.avi.toast('יצירת הקוד נכשלה'); }
  });
  $('shareCopy')?.addEventListener('click', async () => {
    const code = $('shareCodeBox')?.textContent || '';
    try { await navigator.clipboard.writeText(code); window.avi.toast('הקוד הועתק'); }
    catch {
      const ta = $('shareCodeBox'); const r = document.createRange(); r.selectNodeContents(ta);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      window.avi.toast('סמנו והעתיקו את הקוד');
    }
  });
  $('joinPl')?.addEventListener('click', () => { $('joinCodeInput').value = ''; window.avi.openSheet('joinSheet'); });
  $('joinGo')?.addEventListener('click', async () => {
    const code = ($('joinCodeInput')?.value || '').trim();
    if (!code) return;
    try {
      const { name, tracks } = await decodePl(code);
      if (!tracks.length) throw new Error('empty');
      let finalName = name, n = 2;
      while (st().playlists[finalName]) finalName = name + ' (' + n++ + ')';
      st().playlists[finalName] = tracks;
      save(); window.avi.renderLibrary();
      window.avi.closeSheet('joinSheet');
      window.avi.toast(`הרשימה "${finalName}" נוספה (${tracks.length} שירים)`);
    } catch { window.avi.toast('הקוד לא תקין - בדקו שהועתק במלואו'); }
  });
})();
