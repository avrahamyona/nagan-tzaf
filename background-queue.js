// Keep one unlocked audio element, and prepare URLs before the current song ends.
// This improves background handoff; it cannot override operating-system suspension.
try{if(navigator.audioSession)navigator.audioSession.type='playback';}catch{}
const preparedAudio=new Map;
const resolveAudioBeforeBackground=resolveAudioUrl;
resolveAudioUrl=function(id){
 const cached=preparedAudio.get(id);
 if(cached&&Date.now()-cached.at<240000)return cached.promise;
 const entry={at:Date.now(),url:null,promise:null};
 entry.promise=resolveAudioBeforeBackground(id).then(url=>{entry.url=url;if(!url)preparedAudio.delete(id);return url;}).catch(()=>{preparedAudio.delete(id);return null;});
 preparedAudio.set(id,entry);
 for(const[key,value]of preparedAudio)if(Date.now()-value.at>=240000)preparedAudio.delete(key);
 return entry.promise;
};
function prepareQueueAudio(){
 if(videoMode||userPaused||!current())return;
 const upcoming=state.queue.slice(state.qi+1,state.qi+3);
 if(state.repeat==='one')upcoming.unshift(current());
 else if(state.repeat==='all'&&upcoming.length<2)upcoming.push(...state.queue.slice(0,2-upcoming.length));
 for(const track of upcoming)if(track?.id)resolveAudioUrl(track.id);
 if(state.station&&state.queue.length-state.qi<=2&&!window.stationPreparing){
  window.stationPreparing=true;stationRefill().finally(()=>{window.stationPreparing=false;for(const t of state.queue.slice(state.qi+1,state.qi+3))if(t?.id)resolveAudioUrl(t.id);});
 }
}
const ensureUpNextBeforeBackground=ensureUpNext;
ensureUpNext=async function(){try{return await ensureUpNextBeforeBackground();}finally{prepareQueueAudio();}};
audioEl.addEventListener('playing',prepareQueueAudio);
audioEl.addEventListener('error',()=>preparedAudio.delete(audioEl.dataset.vid),true);
const loadTrackBeforeBackground=loadTrack;
loadTrack=function(track,options={}){
 if(!track)return;
 const opts={autoplay:true,...options};
 const cached=preparedAudio.get(track.id);
 if(videoMode||!cached?.url||Date.now()-cached.at>=240000)return loadTrackBeforeBackground(track,opts);
 restoreAttempt=!!(opts.startAt&&opts.autoplay);clearTimeout(ytRetryTimer);lastCur=-1;
 streamConnecting=true;engine='audio';playGen++;audioRetry=0;window._streamDiag='prepared-next';
 pendingSeek.delete(audioEl);audioEl.dataset.vid=track.id;
 try{yt.stopVideo();}catch{}
 setAudioSrc(cached.url);seekWhenReady(audioEl,opts.startAt);paintEngineBadge();registerMediaControls();
 if(opts.autoplay!==false){userPaused=false;audioEl.play().catch(e=>{noteAutoplayBlock(e);streamConnecting=false;syncPlayUI(true);});}
 else{streamConnecting=false;syncPlayUI(true);}
};
// A timeupdate clock and an ended event can report the same boundary together.
const advanceBeforeBackgroundQueue=advance;
let backgroundAdvanceBusy=false,backgroundAdvanceAt=0;
advance=async function(direction,automatic){
 if(automatic&&(backgroundAdvanceBusy||Date.now()-backgroundAdvanceAt<1000))return;
 if(!automatic)return advanceBeforeBackgroundQueue(direction,automatic);
 backgroundAdvanceBusy=true;backgroundAdvanceAt=Date.now();
 try{return await advanceBeforeBackgroundQueue(direction,automatic);}finally{backgroundAdvanceBusy=false;}
};
