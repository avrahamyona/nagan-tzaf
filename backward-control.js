// A short Back tap restarts the current song after its opening three seconds.
// All player, queue, keyboard and system previous-track routes use advance.
const advanceBeforeBackwardControl=advance;
advance=async function(direction,automatic){
 if(direction!==-1||automatic||!current()||livePosition()<3)return advanceBeforeBackwardControl(direction,automatic);
 const track=current();let playing=false;
 if(engine==='audio'||engine==='clip'||engine==='clip-pending'){
  const media=engine==='audio'?audioEl:clipEl;
  playing=!media.paused;pendingSeek.delete(media);
  try{media.currentTime=0;}catch{return;}
 }else if((engine==='yt'||engine==='yt-pending')&&ytReady&&yt.seekTo){
  playing=yt.getPlayerState?.()===1;yt.seekTo(0,true);
 }else return;
 state.resume={vid:track.id,pos:0,playing};
 $('seek').value=0;paintSeekFill();$('tCur').textContent=fmt(0);
 if($('queueSheet').classList.contains('open'))syncQueueTransport(!playing);
 save();
};
