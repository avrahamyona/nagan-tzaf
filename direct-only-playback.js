// v163: accept muxed direct media with audio; avoid failed-primary retry loops.
// Song playback never starts the ad-bearing YouTube embed, even on failure.
function directSongUnavailable(){streamConnecting=false;engine='audio';userPaused=true;audioEl.pause();audioEl.removeAttribute('src');audioEl.load();paintEngineBadge();syncPlayUI(true);toast('השמע הישיר לא זמין כרגע. נסה שוב - לא נעבור לנגן עם פרסומות.');}
useYtEngine=function(){pendingLoad=null;try{yt.stopVideo();}catch{}directSongUnavailable();};
scheduleAudioRetry=function(){clearTimeout(ytRetryTimer);};
function fastDirectUrl(id){return STREAM_API?STREAM_API.replace(/\/$/,'')+'/audio/'+encodeURIComponent(id):null;}
function playableDirectCandidates(j){
 const audio=(j.audioStreams||[]).filter(a=>a.url&&/^https:\/\//.test(a.url)).sort((a,b)=>Number(/mp4/.test(b.mimeType||''))-Number(/mp4/.test(a.mimeType||''))||(b.bitrate||0)-(a.bitrate||0));
 const muxed=(j.videoStreams||[]).filter(v=>v.url&&v.videoOnly===false&&/video\/mp4/.test(v.mimeType||'')&&/^https:\/\//.test(v.url)).sort((a,b)=>(a.bitrate||0)-(b.bitrate||0));
 return [...audio,...muxed];
}
async function alternateDirectUrl(id){
 try{return await Promise.any(PIPED_HOSTS.map(async base=>{const controller=new AbortController;const timer=setTimeout(()=>controller.abort(),9000);try{const response=await fetch(base+'/streams/'+encodeURIComponent(id),{signal:controller.signal});if(!response.ok)throw Error('source');const candidates=playableDirectCandidates(await response.json());if(!candidates.length)throw Error('no direct media with audio');return candidates[0].url;}finally{clearTimeout(timer);}}));}catch{return null;}
}
resolveAudioUrl=function(id){
 const url=fastDirectUrl(id);if(url)return Promise.resolve(url);
 return alternateDirectUrl(id);
};
let directLoadTimeout=null,directFallbackUsed=false,directFallbackPending=false,primaryUnavailableUntil=0;
function beginDirectSource(track,url,options,generation){
 if(generation!==playGen||current()?.id!==track.id)return;
 if(!url){directSongUnavailable();return;}
 setAudioSrc(url);seekWhenReady(audioEl,options.startAt);
 if(options.autoplay!==false)audioEl.play().catch(e=>{if(generation!==playGen)return;if(noteAutoplayBlock(e)){streamConnecting=false;syncPlayUI(true);}});
 else{streamConnecting=false;syncPlayUI(true);}
}
loadTrack=function(track,options={}){
 if(!track)return;if(videoMode){useClipEngine(track,options.startAt,options.autoplay!==false);return;}
 clearTimeout(ytRetryTimer);clearTimeout(directLoadTimeout);pendingLoad=null;try{yt.stopVideo();}catch{}
 const opts={autoplay:true,...options};restoreAttempt=!!(opts.startAt&&opts.autoplay);lastCur=-1;streamConnecting=true;engine='audio';playGen++;directFallbackUsed=false;directFallbackPending=false;audioRetry=0;window._streamDiag='direct-only';
 pendingSeek.delete(audioEl);audioEl.dataset.vid=track.id;userPaused=opts.autoplay===false;paintEngineBadge();
 const generation=playGen,url=Date.now()<primaryUnavailableUntil?null:fastDirectUrl(track.id);
 if(url)beginDirectSource(track,url,opts,generation);else{directFallbackUsed=true;directFallbackPending=true;alternateDirectUrl(track.id).then(u=>{if(generation!==playGen)return;directFallbackPending=false;beginDirectSource(track,u,opts,generation);});}
 if(opts.autoplay!==false)directLoadTimeout=setTimeout(()=>{if(generation===playGen&&streamConnecting)retryDirectSource(track,opts,generation);},9000);
};
async function retryDirectSource(track,options,generation){
 if(generation!==playGen||videoMode||directFallbackPending)return;
 if(directFallbackUsed){directSongUnavailable();return;}directFallbackUsed=true;directFallbackPending=true;primaryUnavailableUntil=Date.now()+300000;window._streamDiag='direct-source-retry';
 const url=await alternateDirectUrl(track.id);if(generation!==playGen)return;directFallbackPending=false;
 beginDirectSource(track,url,options,generation);
 clearTimeout(directLoadTimeout);directLoadTimeout=setTimeout(()=>{if(generation===playGen&&streamConnecting)directSongUnavailable();},9000);
}
audioEl.addEventListener('error',event=>{event.stopImmediatePropagation();const track=current();if(track&&!videoMode)retryDirectSource(track,{autoplay:!userPaused,startAt:livePosition()},playGen);},true);
audioEl.addEventListener('playing',()=>clearTimeout(directLoadTimeout));
// Old lock-screen play handlers see audio engine and use the same audio element.
if(!videoMode&&(engine==='yt'||engine==='yt-pending')){pendingLoad=null;try{yt.stopVideo();}catch{}engine='audio';streamConnecting=false;syncPlayUI(true);}
// No embed surface is needed: clip mode already uses an ad-free direct video.
window.onYouTubeIframeAPIReady=function(){};
try{yt?.destroy?.();}catch{}
yt=null;ytReady=false;pendingLoad=null;
const oldEmbed=$('ytplayer');if(oldEmbed?.tagName==='IFRAME'){const placeholder=document.createElement('div');placeholder.id='ytplayer';oldEmbed.replaceWith(placeholder);}
$('ytplayer').style.display='none';
restoreLast();
