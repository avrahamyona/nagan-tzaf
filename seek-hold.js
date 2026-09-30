/* v154: symmetric, elapsed-time seeking. No negative playbackRate on iOS. */
(function(){
 const HOLD_MS=200, INITIAL_RATE=8, FAST_RATE=16;
 let active=null;
 function media(){return activeAudio()?M():null;}
 function position(){const m=media();return m?m.currentTime:livePosition();}
 function seek(pos){
  const m=media();if(!m)return;
  const duration=Number.isFinite(m.duration)?m.duration:1e9;
  const ranges=m.seekable;
  const end=ranges?.length?ranges.end(ranges.length-1):duration;
  const limit=Math.min(duration,end);
  const target=Math.max(0,Math.min(Math.max(0,limit-.05),pos));
  pendingSeek.delete(m);try{m.currentTime=target;}catch{return;}
  const dur=m.duration||0;if(dur>0){$('seek').value=target/dur*1000;paintSeekFill();}
  $('tCur').textContent=fmt(target);
  if($('queueSheet').classList.contains('open'))syncQueueTransport(m.paused);
 }
 function update(){
  const s=active;if(!s?.long)return;
  const elapsed=(performance.now()-s.at)/1000;
  const distance=Math.min(elapsed,2)*INITIAL_RATE+Math.max(0,elapsed-2)*FAST_RATE;
  seek(s.start+s.direction*distance);
 }
 function finish(commit=true){
  const s=active;if(!s)return;
  clearTimeout(s.delay);clearInterval(s.interval);
  if(s.long)update();active=null;s.button.classList.remove('is-pressing');
  if(s.long){userPaused=s.savedUserPaused;if(s.wasPlaying&&media()===s.media&&!document.hidden)s.media.play().catch(()=>{});}
  if(s.button.hasPointerCapture?.(s.pointer))try{s.button.releasePointerCapture(s.pointer);}catch{}
  if(!s.long&&commit)s.tap();
 }
 const controls=[['cPrev',-1,()=>advance(-1,false)],['cNext',1,()=>next()],['queuePrev',-1,()=>advance(-1,false)],['queueNext',1,()=>next()],['cBack10',-1,()=>seek(position()-10)],['cFwd10',1,()=>seek(position()+10)]];
 for(const[id,direction,tap]of controls){
  const button=$(id);if(!button)continue;
  button.addEventListener('pointerdown',e=>{
   if(e.button!==0||!media())return;
   e.preventDefault();e.stopImmediatePropagation();finish(false);
   const s=active={button,direction,tap,pointer:e.pointerId,long:false};
   button.classList.add('is-pressing');try{button.setPointerCapture(e.pointerId);}catch{}
   s.delay=setTimeout(()=>{if(active!==s)return;s.long=true;s.media=media();s.wasPlaying=!s.media.paused;s.savedUserPaused=userPaused;userPaused=true;s.start=position();s.media.pause();s.at=performance.now();s.interval=setInterval(update,80);},HOLD_MS);
  },true);
  button.addEventListener('pointerup',e=>{if(active?.button!==button)return;e.preventDefault();e.stopImmediatePropagation();finish(true);},true);
  for(const type of ['pointercancel','lostpointercapture'])button.addEventListener(type,e=>{if(active?.button!==button)return;e.stopImmediatePropagation();finish(false);},true);
  button.addEventListener('click',e=>{if(!media())return;e.preventDefault();e.stopImmediatePropagation();if(e.detail===0)tap();},true);
 }
 window.addEventListener('blur',()=>finish(false));
 document.addEventListener('visibilitychange',()=>{if(document.hidden)finish(false);});
})();
