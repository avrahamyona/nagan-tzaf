// v169: direct media only. Metadata races never wait for byte probes.
const directHealth=new Map,sourceHealthCache=new Map,resolvedDirect=new Map,directDiscoveries=new Map,directCandidatePools=new Map;
let activeDirectAttempt=null,consecutiveUnavailable=0;
function healthOf(id){const h=directHealth.get(id);return h&&Date.now()-h.at<90000?h:null;}
function markDirectHealth(id,status,url=null){directHealth.set(id,{status,url,at:Date.now()});if(directHealth.size>100)directHealth.delete(directHealth.keys().next().value);}
function cachedDirect(id,excluded=new Set){const x=resolvedDirect.get(id);if(x&&Date.now()-x.at<90000&&!excluded.has(x.url))return x.url;return null;}
function rememberDirect(id,url){if(!url)return;resolvedDirect.set(id,{url,at:Date.now()});if(resolvedDirect.size>60)resolvedDirect.delete(resolvedDirect.keys().next().value);}
function cancelDirectDiscovery(id){const x=directDiscoveries.get(id);if(x){x.cancel();directDiscoveries.delete(id);}}
function discoverDirect(id,excluded=new Set){
 const cached=cachedDirect(id,excluded);if(cached)return Promise.resolve(cached);
 const pool=directCandidatePools.get(id);if(pool&&Date.now()-pool.at<90000){const candidate=pool.urls.find(u=>!excluded.has(u));if(candidate){rememberDirect(id,candidate);return Promise.resolve(candidate);}}
 const running=directDiscoveries.get(id);if(running&&!excluded.size)return running.promise;
 const controllers=[],job={cancel(){controllers.forEach(c=>c.abort());}};
 const jobs=PIPED_HOSTS.map(async base=>{
  const c=new AbortController;controllers.push(c);const timer=setTimeout(()=>c.abort(),2400);
  try{const r=await fetch(base+'/streams/'+encodeURIComponent(id),{signal:c.signal});if(!r.ok)throw Error('metadata');const rows=playableDirectCandidates(await r.json());const old=directCandidatePools.get(id);directCandidatePools.set(id,{at:Date.now(),urls:[...new Set([...(old?.urls||[]),...rows.map(x=>x.url)])]});if(directCandidatePools.size>60)directCandidatePools.delete(directCandidatePools.keys().next().value);const candidates=rows.filter(x=>!excluded.has(x.url));if(!candidates.length)throw Error('no media');return candidates[0].url;}finally{clearTimeout(timer);}
 });
 job.promise=Promise.any(jobs).then(url=>{rememberDirect(id,url);return url;},()=>null).finally(()=>{job.cancel();if(directDiscoveries.get(id)===job)directDiscoveries.delete(id);});
 if(!excluded.size)directDiscoveries.set(id,job);return job.promise;
}
// Compatibility entry points also use the short, non-probing discovery path.
alternateDirectUrl=id=>discoverDirect(id);
resolveAudioUrl=id=>{const h=healthOf(id);return h?.url?Promise.resolve(h.url):discoverDirect(id);};
async function healthyDirectSource(id,excluded=new Set,soft=false){return discoverDirect(id,excluded);}
async function cachedHealthySource(id){return discoverDirect(id);}
function recordingIdentity(t){const prefix=String(t.title||'').match(/^\s*(.{2,60}?)\s*[-–|]\s*/);return prefix?{...t,artist:prefix[1]}:t;}
function sameSongRecording(seed,t){seed=recordingIdentity(seed);
 const title=autoplayTitle(seed),other=autoplayTitle({...t,artist:seed.artist});if(!title||!other||t.id===seed.id)return false;
 const titleMatch=title===other||other.length>title.length&&other.includes(title)&&other.length<title.length+40;
 const artist=autoplayArtistKey(seed.artist).replace(/הערוץהרשמי|officialchannel/g,'');
 const credited=autoplayArtistMatch(seed.artist,t.artist)||!!artist&&autoplayArtistKey(t.title).includes(artist)||!!seed.ch&&seed.ch===t.ch;
 return titleMatch&&credited&&!/(karaoke|instrumental|קריוקי|ללא מילים|מחרוזת|full album)/i.test(t.title);
}
async function otherSongRecordings(track){track=recordingIdentity(track);
 const title=autoplayTitle(track);if(!title||!track.artist)return [];
 const artist=String(track.artist).replace(/הערוץ הרשמי|official channel| - topic/gi,'').trim();
 const results=await Promise.allSettled([artist+' '+title,artist+' '+title+' מילים'].map(q=>within(searchMusicCached(q),5000)));
 const seen=new Set;return results.flatMap(r=>r.status==='fulfilled'?r.value:[]).filter(t=>sameSongRecording(track,t)&&!seen.has(t.id)&&seen.add(t.id)).sort((a,b)=>Number(b.official||b.musicCatalog)-Number(a.official||a.musicCatalog)).slice(0,6);
}
function searchingRecording(show){let el=$('directSearchStatus');if(!el){el=document.createElement('div');el.id='directSearchStatus';el.setAttribute('role','status');el.style.cssText='position:fixed;bottom:150px;left:50%;transform:translateX(-50%);z-index:150;background:#333;color:white;padding:9px 16px;border-radius:18px;font-size:13px;white-space:nowrap;pointer-events:none';document.body.appendChild(el);}el.textContent='מחפש הקלטה אחרת';el.hidden=!show;}
function currentAttempt(a){return activeDirectAttempt===a&&a.generation===playGen&&current()?.id===a.track.id&&!videoMode;}
function stopFastDeadline(a){clearTimeout(a?.deadline);clearTimeout(a?.versionTimer);}
function stopAttemptTimer(a){clearTimeout(a?.timer);clearTimeout(directLoadTimeout);}
function armAttempt(a,ms=4500){stopAttemptTimer(a);a.timer=setTimeout(()=>{if(currentAttempt(a)&&!userPaused&&audioEl.readyState<3)recoverHealthyPlayback(a);},ms);}
function startHealthySource(a,url,mediaId=a.track.id){
 if(!currentAttempt(a)||a.skipping||(a.options.autoplay!==false&&userPaused))return;if(!url)return;
 audioEl.pause();a.urls.add(url);a.mediaId=mediaId;window._streamDiag=mediaId===a.track.id?'direct-fast-source':'direct-alternate-recording';
 audioEl.dataset.vid=a.track.id;setAudioSrc(url);seekWhenReady(audioEl,mediaId===a.track.id?a.options.startAt:0);armAttempt(a);
 if(a.options.autoplay!==false){userPaused=false;audioEl.play().catch(e=>{if(!currentAttempt(a))return;if(noteAutoplayBlock(e)){stopAttemptTimer(a);streamConnecting=false;syncPlayUI(true);}else recoverHealthyPlayback(a);});}
 else{stopAttemptTimer(a);streamConnecting=false;syncPlayUI(true);}
}
async function skipUnavailableAttempt(a){
 // Historical name retained for callers. Never skip the chosen song.
 if(!currentAttempt(a)||a.skipping)return;a.skipping=true;stopFastDeadline(a);stopAttemptTimer(a);cancelDirectDiscovery(a.track.id);markDirectHealth(a.track.id,'failed');resolvedDirect.delete(a.track.id);searchingRecording(false);directUnavailableBeforeHealth();toast('השיר הזה אינו זמין כרגע במקורות הישירים. לא עברנו לשיר אחר.');
}
async function recoverHealthyPlayback(a){
 if(!currentAttempt(a)||a.skipping||a.recovering||a.options.autoplay!==false&&userPaused)return;
 a.recovering=true;stopAttemptTimer(a);
 // Retry an edge/transient transport once for this same media ID, never another song.
 const media=a.mediaId||a.track.id;
 a.workerRetried=a.workerRetried||new Set;
 const primary=fastDirectUrl(media);
 if(primary&&!a.workerRetried.has(media)){
  a.workerRetried.add(media);a.recovering=false;
  const fresh=primary+(primary.includes('?')?'&':'?')+'retry='+Date.now();
  startHealthySource(a,fresh,media);return;
 }
streamConnecting=true;a.options.startAt=Math.max(a.options.startAt||0,audioEl.currentTime||0);searchingRecording(true);
 const cached=resolvedDirect.get(a.track.id);if(cached&&a.urls.has(cached.url))resolvedDirect.delete(a.track.id);const health=healthOf(a.track.id);if(health?.url&&a.urls.has(health.url))directHealth.delete(a.track.id);
 // A failed recording never blacklists the primary for unrelated songs.
 try{
  if((a.sourceAttempts||0)<3){
   a.sourceAttempts=(a.sourceAttempts||0)+1;
   if(a.sourceAttempts>1)await new Promise(r=>setTimeout(r,300*a.sourceAttempts));
   if(!currentAttempt(a)||a.skipping||userPaused)return;
   let url=await (a.discovery||discoverDirect(a.track.id,a.urls));a.discovery=null;
   if(url&&a.urls.has(url))url=await discoverDirect(a.track.id,a.urls);
   if(!currentAttempt(a)||a.skipping||userPaused)return;
   if(url&&!a.urls.has(url)){a.recovering=false;startHealthySource(a,url);return;}
  }
  if(!a.versions)a.versions=await (a.versionWork||otherSongRecordings(a.track));
  while(a.versions.length){const version=a.versions.shift();if(!currentAttempt(a)||a.skipping||userPaused)return;const url=fastDirectUrl(version.id)||await discoverDirect(version.id,a.urls);if(!currentAttempt(a)||a.skipping||userPaused)return;if(url){a.recovering=false;a.alternate=version;startHealthySource(a,url,version.id);toast('נמצאה הקלטה אחרת של אותו שיר ואמן.');return;}}
  if((a.sourceAttempts||0)<3){a.recovering=false;setTimeout(()=>recoverHealthyPlayback(a),300);return;}
  a.recovering=false;await skipUnavailableAttempt(a);
 }finally{a.recovering=false;}
}
const directUnavailableBeforeHealth=directSongUnavailable;
directSongUnavailable=function(){if(activeDirectAttempt&&currentAttempt(activeDirectAttempt)){recoverHealthyPlayback(activeDirectAttempt);return;}directUnavailableBeforeHealth();};
retryDirectSource=function(){if(activeDirectAttempt)recoverHealthyPlayback(activeDirectAttempt);};
const loadBeforeHealth=loadTrack;
loadTrack=function(track,options={}){
 stopFastDeadline(activeDirectAttempt);stopAttemptTimer(activeDirectAttempt);if(activeDirectAttempt)cancelDirectDiscovery(activeDirectAttempt.track.id);
 if(!track||videoMode){activeDirectAttempt=null;return loadBeforeHealth(track,options);}
 clearTimeout(ytRetryTimer);pendingLoad=null;pendingSeek.delete(audioEl);audioEl.pause();audioEl.removeAttribute('src');audioEl.load();
 const opts={autoplay:true,...options};playGen++;lastCur=-1;streamConnecting=true;engine='audio';userPaused=opts.autoplay===false;
 const a={track,options:opts,generation:playGen,urls:new Set,versions:null,sourcesTried:false,recovering:false,startedAt:performance.now()};activeDirectAttempt=a;audioEl.dataset.vid=track.id;paintEngineBadge();
 searchingRecording(false);
 if(opts.autoplay!==false){
  // Bounded exhaustive same-song recovery, never an unrelated-song swap.
  a.deadline=setTimeout(()=>{if(currentAttempt(a)&&!userPaused&&!a.played)skipUnavailableAttempt(a);},24000);
  a.versionTimer=setTimeout(()=>{if(!currentAttempt(a)||userPaused||a.played)return;searchingRecording(true);a.versionWork=otherSongRecordings(track).then(versions=>{if(!currentAttempt(a)||a.skipping||a.played)return [];a.versions=versions;versions.slice(0,2).forEach(v=>prefetchFastDirect(v.id));return versions;});},700);
 }
 const decoded=healthOf(track.id);const url=decoded?.status==='decoded'?decoded.url:null;
 if(url){startHealthySource(a,url,healthOf(track.id)?.mediaId||track.id);return;}
 // Start source discovery with the primary, not after a 4-9 second failure wait.
 a.discovery=discoverDirect(track.id);
 const primary=fastDirectUrl(track.id);
 if(primary){startHealthySource(a,primary);armAttempt(a,4500);a.discovery.then(async u=>{
  if(!u)return;const left=4500-(performance.now()-a.startedAt);if(left>0)await new Promise(r=>setTimeout(r,left));
  if(!currentAttempt(a)||a.skipping||userPaused||a.recovering||audioEl.readyState>=3||audioEl.currentTime>0)return;
  a.sourcesTried=true;a.discovery=null;startHealthySource(a,u);
 });}else recoverHealthyPlayback(a);
};
audioEl.addEventListener('playing',()=>{const a=activeDirectAttempt;if(!a||!currentAttempt(a))return;a.played=true;searchingRecording(false);stopFastDeadline(a);stopAttemptTimer(a);cancelDirectDiscovery(a.track.id);a.discovery=null;consecutiveUnavailable=0;markDirectHealth(a.mediaId||a.track.id,'decoded',audioEl.currentSrc);rememberDirect(a.mediaId||a.track.id,audioEl.currentSrc);window._directStartMs=Math.round(performance.now()-a.startedAt);if(a.alternate){markDirectHealth(a.track.id,'alternate',audioEl.currentSrc);directHealth.get(a.track.id).mediaId=a.mediaId;}});
audioEl.addEventListener('waiting',()=>{const a=activeDirectAttempt;if(a&&currentAttempt(a)&&!userPaused){const at=audioEl.currentTime;stopAttemptTimer(a);a.timer=setTimeout(()=>{if(currentAttempt(a)&&!userPaused&&audioEl.currentTime<=at+.25)recoverHealthyPlayback(a);},at>0?7000:4500);}});
// Prefetch URLs only: two upcoming songs and the first two visible search rows.
function prefetchFastDirect(id){if(id&&id!==current()?.id&&!cachedDirect(id))discoverDirect(id);}
prewarmDirectTrack=prefetchFastDirect;
prewarmUpcomingDirect=function(){if(videoMode||userPaused||!current())return;for(const t of [...(state.priorityQueue||[]),...state.queue.slice(state.qi+1)].slice(0,2))prefetchFastDirect(t.id);};
let searchPrefetchTimer;new MutationObserver(()=>{clearTimeout(searchPrefetchTimer);searchPrefetchTimer=setTimeout(()=>{if(document.hidden)return;for(const row of [...$('resBody').querySelectorAll('.row[data-vid]')].slice(0,2))prefetchFastDirect(row.dataset.vid);},150);}).observe($('resBody'),{childList:true,subtree:true});
// Queue candidates are never gated by transport tests. Prepare just the next two.
const relatedBeforeHealth=buildRelatedAutoplay;
buildRelatedAutoplay=async function(seed,existing){const tracks=await relatedBeforeHealth(seed,existing);const result=balancedAutoplay(tracks,seed,existing);result.slice(0,2).forEach(t=>prefetchFastDirect(t.id));return result;};

// v176: resumed browser audio graphs can remain suspended after interruption.
function resumeDirectAudioGraph(){
 if(typeof actx!=='undefined'&&actx&&actx.state!=='running'&&actx.state!=='closed')return actx.resume().catch(()=>{});
 return Promise.resolve();
}
const startHealthyBeforeResume176=startHealthySource;
startHealthySource=function(a,url,mediaId=a.track.id){if(a.options.autoplay!==false)resumeDirectAudioGraph();return startHealthyBeforeResume176(a,url,mediaId);};
const toggleBeforeResume176=togglePlay;
togglePlay=function(){
 if(videoMode||!current()||!activeAudio())return toggleBeforeResume176();
 if(!audioEl.paused&&!userPaused)return toggleBeforeResume176();
 const track=current(),pos=audioEl.currentTime||0;userPaused=false;
 resumeDirectAudioGraph();
 if(!audioEl.src||audioEl.dataset.vid!==track.id||audioEl.error||activeDirectAttempt?.skipping){loadTrack(track,{autoplay:true,startAt:pos});return;}
 const generation=playGen;
 audioEl.play().catch(e=>{
  if(generation!==playGen||current()?.id!==track.id||userPaused)return;
  if(noteAutoplayBlock(e)){syncPlayUI(true);return;}
  loadTrack(track,{autoplay:true,startAt:pos});
 });
};
// A trusted tap must resume the graph inside the gesture, not after a network await.
document.addEventListener('pointerdown',()=>{if(typeof actx!=='undefined'&&actx&&actx.state==='suspended')resumeDirectAudioGraph();},{capture:true,passive:true});
audioEl.addEventListener('playing',resumeDirectAudioGraph);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!userPaused&&current())resumeDirectAudioGraph();});
window.addEventListener('pageshow',()=>{if(!userPaused&&current())resumeDirectAudioGraph();});

// Catalog extraction can be LOGIN_REQUIRED on a cold worker edge. This upload
// was checked live: exact song and singer, not a same-title different artist.
const verifiedSameRecording177={
 'w1Vz7nJohU8':[{id:'wKX5v00LOLQ',title:'נהוראי תורג׳מן -פאפית (קאבר)',artist:'Nehoray Turgeman Official',dur:159,ch:'UCcg-2cROHRU2yIomYJWXaaQ'}]
};
const recordingsBefore177=otherSongRecordings;
otherSongRecordings=async function(track){
 const pinned=(verifiedSameRecording177[track.id]||[]).filter(t=>sameSongRecording(track,t));
 if(pinned.length){
  // A verified candidate is enough to start recovery without waiting for search.
  recordingsBefore177(track).catch(()=>{});
  return pinned.map(t=>({...t}));
 }
 return recordingsBefore177(track);
};
