// Warm only a tiny byte range and race a verified alternate while buffering.
const warmedDirect=new Map;
async function directByteProbe(url,timeout=5000){
 if(!url)throw Error('no direct source');
 const controller=new AbortController,timer=setTimeout(()=>controller.abort(),timeout);
 try{
  const response=await fetch(url,{headers:{Range:'bytes=0-1023'},signal:controller.signal});
  if(!response.ok){await response.body?.cancel();throw Error('direct source unavailable');}
  const reader=response.body?.getReader();
  if(reader){try{const first=await reader.read();if(first.done||!first.value?.length)throw Error('empty direct source');}finally{await reader.cancel();}}
  return url;
 }finally{clearTimeout(timer);}
}
async function prewarmDirectTrack(id){
 const url=fastDirectUrl(id);if(!url)return;
 const now=Date.now();for(const[key,at]of warmedDirect)if(now-at>=180000)warmedDirect.delete(key);
 if(warmedDirect.has(id))return;warmedDirect.set(id,now);
 try{await directByteProbe(url);}catch{warmedDirect.delete(id);}
}
function prewarmUpcomingDirect(){
 if(videoMode||userPaused||!current())return;
 const upcoming=state.queue.slice(state.qi+1,state.qi+3);
 if(state.repeat==='one')upcoming.unshift(current());
 else if(state.repeat==='all'&&upcoming.length<2)upcoming.push(...state.queue.slice(0,2-upcoming.length));
 for(const track of upcoming.slice(0,2))if(track?.id)prewarmDirectTrack(track.id);
}
const prepareBeforeSpeed=prepareQueueAudio;
prepareQueueAudio=function(){prepareBeforeSpeed();prewarmUpcomingDirect();};
audioEl.addEventListener('playing',prewarmUpcomingDirect);
const loadBeforeSpeed=loadTrack;
loadTrack=function(track,options={}){
 loadBeforeSpeed(track,options);
 if(!track||videoMode||options.autoplay===false)return;
 const generation=playGen;
 const pending=()=>generation===playGen&&!videoMode&&!userPaused&&streamConnecting&&!(audioEl.readyState>=2&&!audioEl.paused);
 setTimeout(async()=>{
  if(!pending()||directFallbackUsed)return;
  try{
   const url=await alternateDirectUrl(track.id);if(!pending()||directFallbackUsed||!url)return;
   await directByteProbe(url,5000);if(!pending()||directFallbackUsed)return;
   directFallbackUsed=true;clearTimeout(directLoadTimeout);pendingSeek.delete(audioEl);
   window._streamDiag='verified-direct-race';
   beginDirectSource(track,url,{autoplay:true,startAt:options.startAt||0},generation);
   directLoadTimeout=setTimeout(()=>{if(generation===playGen&&streamConnecting)directSongUnavailable();},9000);
  }catch{/* Keep the original stream running; its existing timeout owns failure. */}
 },600);
};
const paintBadgeBeforeSpeed=paintEngineBadge;
paintEngineBadge=function(){paintBadgeBeforeSpeed();const badge=$('engineBadge');if(badge)badge.innerHTML=badge.innerHTML.replace(/v\d+/g,'v145');};
if($('verChip')?.lastChild)$('verChip').lastChild.textContent='v145';
paintEngineBadge();
