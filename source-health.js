// v168: direct media only. Metadata races never wait for byte probes.
const directHealth=new Map,sourceHealthCache=new Map,resolvedDirect=new Map,directDiscoveries=new Map;
let activeDirectAttempt=null,consecutiveUnavailable=0;
function healthOf(id){const h=directHealth.get(id);return h&&Date.now()-h.at<90000?h:null;}
function markDirectHealth(id,status,url=null){directHealth.set(id,{status,url,at:Date.now()});if(directHealth.size>100)directHealth.delete(directHealth.keys().next().value);}
function cachedDirect(id,excluded=new Set){const x=resolvedDirect.get(id);if(x&&Date.now()-x.at<90000&&!excluded.has(x.url))return x.url;return null;}
function rememberDirect(id,url){if(!url)return;resolvedDirect.set(id,{url,at:Date.now()});if(resolvedDirect.size>60)resolvedDirect.delete(resolvedDirect.keys().next().value);}
function cancelDirectDiscovery(id){const x=directDiscoveries.get(id);if(x){x.cancel();directDiscoveries.delete(id);}}
function discoverDirect(id,excluded=new Set){
 const cached=cachedDirect(id,excluded);if(cached)return Promise.resolve(cached);
 const running=directDiscoveries.get(id);if(running&&!excluded.size)return running.promise;
 const controllers=[],job={cancel(){controllers.forEach(c=>c.abort());}};
 const jobs=PIPED_HOSTS.map(async base=>{
  const c=new AbortController;controllers.push(c);const timer=setTimeout(()=>c.abort(),2400);
  try{const r=await fetch(base+'/streams/'+encodeURIComponent(id),{signal:c.signal});if(!r.ok)throw Error('metadata');const candidates=playableDirectCandidates(await r.json()).filter(x=>!excluded.has(x.url));if(!candidates.length)throw Error('no media');return candidates[0].url;}finally{clearTimeout(timer);}
 });
 job.promise=Promise.any(jobs).then(url=>{rememberDirect(id,url);return url;},()=>null).finally(()=>{job.cancel();if(directDiscoveries.get(id)===job)directDiscoveries.delete(id);});
 if(!excluded.size)directDiscoveries.set(id,job);return job.promise;
}
// Compatibility entry points also use the short, non-probing discovery path.
alternateDirectUrl=id=>discoverDirect(id);
resolveAudioUrl=id=>{const h=healthOf(id);return h?.url?Promise.resolve(h.url):discoverDirect(id);};
async function healthyDirectSource(id,excluded=new Set,soft=false){return discoverDirect(id,excluded);}
async function cachedHealthySource(id){return discoverDirect(id);}
async function otherSongRecordings(track){
 const title=autoplayTitle(track);if(!title||!track.artist)return [];
 try{const tracks=await within(searchMusicCached(track.artist+' '+title),4000);return tracks.filter(t=>t.id!==track.id&&autoplayTitle(t)===title&&autoplayAllowed(t)&&(songArtistIdentity(t)===songArtistIdentity(track)||t.ch&&t.ch===track.ch||artistKey(t.artist)===artistKey(track.artist))).sort((a,b)=>Number(a.official||a.musicCatalog)-Number(b.official||b.musicCatalog)).reverse().slice(0,2);}catch{return [];}
}
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
 if(!currentAttempt(a)||a.skipping)return;a.skipping=true;stopFastDeadline(a);stopAttemptTimer(a);cancelDirectDiscovery(a.track.id);markDirectHealth(a.track.id,'failed');resolvedDirect.delete(a.track.id);
 if(userPaused||a.options.autoplay===false||a.options.startAt>0){directUnavailableBeforeHealth();return;}
 consecutiveUnavailable++;if(consecutiveUnavailable>8){directUnavailableBeforeHealth();toast('אין כרגע מקור ישיר זמין בתור. הניגון נעצר.');return;}
 if(!state.priorityQueue?.length&&state.qi>=state.queue.length-1&&state.singleAutoplay&&state.autoNext)try{await within(ensureUpNext(),1800);}catch{}
 if(!currentAttempt(a)||userPaused)return;
 let next=null;if(state.priorityQueue?.length){state.priorityCurrent=state.priorityQueue.shift();next=state.priorityCurrent;}else if(state.qi+1<state.queue.length){state.priorityCurrent=null;state.qi++;next=current();}
 if(!next){directUnavailableBeforeHealth();toast('אין כרגע שיר זמין נוסף בתור.');return;}
 toast('ההקלטה לא זמינה כרגע. עובר לשיר הבא.');pushHistory(next);loadTrack(next);paintNow();save();if($('queueSheet').classList.contains('open'))renderQueue();
}
async function recoverHealthyPlayback(a){
 if(!currentAttempt(a)||a.skipping||a.recovering||a.options.autoplay!==false&&userPaused)return;
 a.recovering=true;stopAttemptTimer(a);streamConnecting=true;const cached=resolvedDirect.get(a.track.id);if(cached&&a.urls.has(cached.url))resolvedDirect.delete(a.track.id);const health=healthOf(a.track.id);if(health?.url&&a.urls.has(health.url))directHealth.delete(a.track.id);
 if([...a.urls].some(u=>u.startsWith(STREAM_API)))primaryUnavailableUntil=Date.now()+60000;
 try{
  if((a.sourceAttempts||0)<2){a.sourceAttempts=(a.sourceAttempts||0)+1;let url=await (a.discovery||discoverDirect(a.track.id,a.urls));a.discovery=null;if(url&&a.urls.has(url))url=await discoverDirect(a.track.id,a.urls);if(!currentAttempt(a))return;if(url&&!a.urls.has(url)){a.recovering=false;startHealthySource(a,url);return;}}
  if(!a.versions)a.versions=await (a.versionWork||otherSongRecordings(a.track));
  while(a.versions.length){const version=a.versions.shift();if(!currentAttempt(a))return;const url=await discoverDirect(version.id,a.urls);if(!currentAttempt(a))return;if(url){a.recovering=false;a.alternate=version;startHealthySource(a,url,version.id);toast('נמצאה הקלטה חלופית של אותו שיר ואמן.');return;}}
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
 if(opts.autoplay!==false){
  // One overall startup budget. Retries cannot keep extending it.
  a.deadline=setTimeout(()=>{if(currentAttempt(a)&&!userPaused&&!a.played)skipUnavailableAttempt(a);},3000);
  a.versionTimer=setTimeout(()=>{if(!currentAttempt(a)||userPaused||a.played)return;
   a.versionWork=otherSongRecordings(track).then(versions=>{if(!currentAttempt(a)||a.skipping||a.played)return [];a.versions=versions;versions.slice(0,2).forEach(v=>prefetchFastDirect(v.id));return versions;});
   a.versionWork.then(async versions=>{for(const v of versions){if(!currentAttempt(a)||a.skipping||a.played)return;const u=cachedDirect(v.id)||await discoverDirect(v.id);if(!currentAttempt(a)||a.skipping||a.played)return;if(u){a.alternate=v;startHealthySource(a,u,v.id);toast('המקור מתעכב. מנגן הקלטה אחרת של אותו שיר.');return;}}});
  },700);
 }
 const url=cachedDirect(track.id)||healthOf(track.id)?.url;
 if(url){startHealthySource(a,url,healthOf(track.id)?.mediaId||track.id);return;}
 // Start source discovery with the primary, not after a 4-9 second failure wait.
 a.discovery=discoverDirect(track.id);
 const primary=Date.now()<primaryUnavailableUntil?null:fastDirectUrl(track.id);
 if(primary){startHealthySource(a,primary);armAttempt(a,2400);a.discovery.then(async u=>{
  if(!u)return;const left=350-(performance.now()-a.startedAt);if(left>0)await new Promise(r=>setTimeout(r,left));
  if(!currentAttempt(a)||a.skipping||userPaused||a.recovering||audioEl.readyState>=3||audioEl.currentTime>0)return;
  a.sourcesTried=true;a.discovery=null;startHealthySource(a,u);
 });}else recoverHealthyPlayback(a);
};
audioEl.addEventListener('playing',()=>{const a=activeDirectAttempt;if(!a||!currentAttempt(a))return;a.played=true;stopFastDeadline(a);stopAttemptTimer(a);cancelDirectDiscovery(a.track.id);a.discovery=null;consecutiveUnavailable=0;markDirectHealth(a.mediaId||a.track.id,'decoded',audioEl.currentSrc);rememberDirect(a.mediaId||a.track.id,audioEl.currentSrc);window._directStartMs=Math.round(performance.now()-a.startedAt);if(a.alternate){markDirectHealth(a.track.id,'alternate',audioEl.currentSrc);directHealth.get(a.track.id).mediaId=a.mediaId;}});
audioEl.addEventListener('waiting',()=>{const a=activeDirectAttempt;if(a&&currentAttempt(a)&&!userPaused){const at=audioEl.currentTime;stopAttemptTimer(a);a.timer=setTimeout(()=>{if(currentAttempt(a)&&!userPaused&&audioEl.currentTime<=at+.25)recoverHealthyPlayback(a);},at>0?5000:2400);}});
// Prefetch URLs only: two upcoming songs and the first two visible search rows.
function prefetchFastDirect(id){if(id&&id!==current()?.id&&!cachedDirect(id))discoverDirect(id);}
prewarmDirectTrack=prefetchFastDirect;
prewarmUpcomingDirect=function(){if(videoMode||userPaused||!current())return;for(const t of [...(state.priorityQueue||[]),...state.queue.slice(state.qi+1)].slice(0,2))prefetchFastDirect(t.id);};
let searchPrefetchTimer;new MutationObserver(()=>{clearTimeout(searchPrefetchTimer);searchPrefetchTimer=setTimeout(()=>{if(document.hidden)return;for(const row of [...$('resBody').querySelectorAll('.row[data-vid]')].slice(0,2))prefetchFastDirect(row.dataset.vid);},150);}).observe($('resBody'),{childList:true,subtree:true});
// Queue candidates are never gated by transport tests. Prepare just the next two.
const relatedBeforeHealth=buildRelatedAutoplay;
buildRelatedAutoplay=async function(seed,existing){const tracks=await relatedBeforeHealth(seed,existing);const result=balancedAutoplay(tracks,seed,existing);result.slice(0,2).forEach(t=>prefetchFastDirect(t.id));return result;};
