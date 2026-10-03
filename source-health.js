// Direct-only source recovery. A byte probe is transport health, not proof of decoded sound.
const directHealth=new Map,sourceHealthCache=new Map;
let activeDirectAttempt=null,consecutiveUnavailable=0;
function healthOf(id){const h=directHealth.get(id);return h&&Date.now()-h.at<300000?h:null;}
function markDirectHealth(id,status,url=null){directHealth.set(id,{status,url,at:Date.now()});if(directHealth.size>150)directHealth.delete(directHealth.keys().next().value);}
async function healthyDirectSource(id,excluded=new Set,soft=false){
 const h=healthOf(id);if(h?.url&&!excluded.has(h.url)){try{return await directByteProbe(h.url,4000);}catch{markDirectHealth(id,soft?'probe-failed':'failed');}}
 const jobs=PIPED_HOSTS.map(async base=>{
  const controller=new AbortController,timer=setTimeout(()=>controller.abort(),5000);
  try{const r=await fetch(base+'/streams/'+encodeURIComponent(id),{signal:controller.signal});if(!r.ok)throw Error('metadata');const rows=playableDirectCandidates(await r.json()).filter(x=>!excluded.has(x.url));
   for(const media of rows.slice(0,2)){try{return await directByteProbe(media.url,4000);}catch{}}
   throw Error('no healthy direct source');
  }finally{clearTimeout(timer);}
 });
 try{const url=await Promise.any(jobs);markDirectHealth(id,'bytes',url);return url;}catch{markDirectHealth(id,soft?'probe-failed':'failed');return null;}
}
async function cachedHealthySource(id){
 const entry=sourceHealthCache.get(id);if(entry&&Date.now()-entry.at<180000)return entry.promise;
 const promise=healthyDirectSource(id,new Set(),true);sourceHealthCache.set(id,{at:Date.now(),promise});
 if(sourceHealthCache.size>80)sourceHealthCache.delete(sourceHealthCache.keys().next().value);return promise;
}
async function otherSongRecordings(track){
 const title=autoplayTitle(track);if(!title||!track.artist)return [];
 try{const tracks=await within(searchMusicCached(track.artist+' '+title),10000);
  return tracks.filter(t=>t.id!==track.id&&autoplayTitle(t)===title&&autoplayAllowed(t)&&
   (songArtistIdentity(t)===songArtistIdentity(track)||t.ch&&t.ch===track.ch||artistKey(t.artist)===artistKey(track.artist)))
   .sort((a,b)=>Number(a.official||a.musicCatalog)-Number(b.official||b.musicCatalog)).reverse().slice(0,3);
 }catch{return [];}
}
function currentAttempt(a){return activeDirectAttempt===a&&a.generation===playGen&&current()?.id===a.track.id&&!videoMode;}
function stopAttemptTimer(a){clearTimeout(a?.timer);clearTimeout(directLoadTimeout);}
function armAttempt(a,ms=8000){stopAttemptTimer(a);a.timer=setTimeout(()=>{if(currentAttempt(a)&&!userPaused&&audioEl.readyState<3)recoverHealthyPlayback(a);},ms);}
function startHealthySource(a,url,mediaId=a.track.id){
 if(!currentAttempt(a)||(a.options.autoplay!==false&&userPaused))return;audioEl.pause();a.urls.add(url);a.mediaId=mediaId;window._streamDiag=mediaId===a.track.id?'direct-health-source':'direct-alternate-recording';
 audioEl.dataset.vid=a.track.id;setAudioSrc(url);seekWhenReady(audioEl,mediaId===a.track.id?a.options.startAt:0);armAttempt(a);
 if(a.options.autoplay!==false){userPaused=false;audioEl.play().catch(e=>{if(!currentAttempt(a))return;if(noteAutoplayBlock(e)){stopAttemptTimer(a);streamConnecting=false;syncPlayUI(true);}else recoverHealthyPlayback(a);});}
 else{stopAttemptTimer(a);streamConnecting=false;syncPlayUI(true);}
}
async function skipUnavailableAttempt(a){
 if(!currentAttempt(a))return;stopAttemptTimer(a);markDirectHealth(a.track.id,'failed');
 if(userPaused||a.options.autoplay===false||a.options.startAt>0){directUnavailableBeforeHealth();return;}
 consecutiveUnavailable++;
 if(consecutiveUnavailable>8){directUnavailableBeforeHealth();toast('אין כרגע מקור ישיר זמין בתור. הניגון נעצר.');return;}
 // No wrap, no shuffle lottery, no repeat-one loop on an unplayable recording.
 if(!state.priorityQueue?.length&&state.qi>=state.queue.length-1&&state.singleAutoplay&&state.autoNext)await ensureUpNext();
 if(!currentAttempt(a)||userPaused)return;
 let next=null;
 if(state.priorityQueue?.length){state.priorityCurrent=state.priorityQueue.shift();next=state.priorityCurrent;}
 else if(state.qi+1<state.queue.length){state.priorityCurrent=null;state.qi++;next=current();}
 if(!next){directUnavailableBeforeHealth();toast('אין כרגע שיר זמין נוסף בתור.');return;}
 toast('ההקלטה לא זמינה כרגע. עובר לשיר הבא.');pushHistory(next);loadTrack(next);paintNow();save();if($('queueSheet').classList.contains('open'))renderQueue();
}
async function recoverHealthyPlayback(a){
 if(!currentAttempt(a)||a.recovering||a.options.autoplay!==false&&userPaused)return;
 a.recovering=true;stopAttemptTimer(a);streamConnecting=true;if([...a.urls].some(u=>u.startsWith(STREAM_API)))primaryUnavailableUntil=Date.now()+300000;
 try{
  if(!a.sourcesTried){a.sourcesTried=true;const url=await healthyDirectSource(a.track.id,a.urls);if(!currentAttempt(a))return;if(url){a.recovering=false;startHealthySource(a,url);return;}}
  if(!a.versions)a.versions=await otherSongRecordings(a.track);
  while(a.versions.length){const version=a.versions.shift();if(!currentAttempt(a))return;const url=await healthyDirectSource(version.id,a.urls);if(!currentAttempt(a))return;if(url){a.recovering=false;a.alternate=version;startHealthySource(a,url,version.id);toast('נמצאה הקלטה חלופית של אותו שיר ואמן.');return;}}
  a.recovering=false;await skipUnavailableAttempt(a);
 }finally{a.recovering=false;}
}
const directUnavailableBeforeHealth=directSongUnavailable;
directSongUnavailable=function(){if(activeDirectAttempt&&currentAttempt(activeDirectAttempt)){recoverHealthyPlayback(activeDirectAttempt);return;}directUnavailableBeforeHealth();};
retryDirectSource=function(){if(activeDirectAttempt)recoverHealthyPlayback(activeDirectAttempt);};
const loadBeforeHealth=loadTrack;
loadTrack=function(track,options={}){
 if(!track||videoMode){stopAttemptTimer(activeDirectAttempt);activeDirectAttempt=null;return loadBeforeHealth(track,options);}
 stopAttemptTimer(activeDirectAttempt);clearTimeout(ytRetryTimer);pendingLoad=null;pendingSeek.delete(audioEl);audioEl.pause();
 const opts={autoplay:true,...options};playGen++;lastCur=-1;streamConnecting=true;engine='audio';userPaused=opts.autoplay===false;
 const a={track,options:opts,generation:playGen,urls:new Set,versions:null,sourcesTried:false,recovering:false};activeDirectAttempt=a;audioEl.dataset.vid=track.id;paintEngineBadge();
 const h=healthOf(track.id);
 if(h?.url){startHealthySource(a,h.url,h.mediaId||track.id);return;}
 if(h?.status==='failed'||Date.now()<primaryUnavailableUntil){recoverHealthyPlayback(a);return;}
 const url=fastDirectUrl(track.id);if(url){startHealthySource(a,url);stopAttemptTimer(a);a.timer=setTimeout(()=>{if(currentAttempt(a)&&!userPaused&&audioEl.readyState<3){primaryUnavailableUntil=Date.now()+300000;recoverHealthyPlayback(a);}},4000);}
 else recoverHealthyPlayback(a);
};
audioEl.addEventListener('playing',()=>{const a=activeDirectAttempt;if(!a||!currentAttempt(a))return;stopAttemptTimer(a);consecutiveUnavailable=0;markDirectHealth(a.mediaId||a.track.id,'decoded',audioEl.currentSrc);if(a.alternate){markDirectHealth(a.track.id,'alternate',audioEl.currentSrc);directHealth.get(a.track.id).mediaId=a.mediaId;}});
audioEl.addEventListener('waiting',()=>{const a=activeDirectAttempt;if(a&&currentAttempt(a)&&!userPaused){stopAttemptTimer(a);const at=audioEl.currentTime;a.timer=setTimeout(()=>{if(currentAttempt(a)&&!userPaused&&audioEl.currentTime<=at+.25)recoverHealthyPlayback(a);},10000);}});
// Prefer byte-verified candidates without holding up the selected song or claiming audio was decoded.
const relatedBeforeHealth=buildRelatedAutoplay;
buildRelatedAutoplay=async function(seed,existing){
 const tracks=await relatedBeforeHealth(seed,existing);
 const checks=await Promise.allSettled(tracks.slice(0,8).map(async t=>({track:t,url:await cachedHealthySource(t.id)})));
 const ready=checks.filter(r=>r.status==='fulfilled'&&r.value.url).map(r=>r.value.track);
 const unknown=tracks.filter(t=>{const h=healthOf(t.id);return !h||h.status==='probe-failed';});
 const preferred=balancedAutoplay([...ready,...unknown],seed,existing);
 // Never empty when candidates exist: fall back to non-probed candidates.
 return preferred.length?preferred:balancedAutoplay(tracks,seed,existing);
};
