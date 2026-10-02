// v159: vertical detail-page scrolling cannot trigger the legacy pull-dismiss.
(function(){
 let start=null;
 const pageAt=target=>{
  if(!$('player').classList.contains('hidden')||document.querySelector('.sheetbox.open')||$('lyrView').classList.contains('open'))return null;
  const page=[...document.querySelectorAll('.page.on')].at(-1);
  return page?.contains(target)?page:null;
 };
 document.addEventListener('touchstart',e=>{
  start=null;if(e.touches.length!==1)return;
  const page=pageAt(e.target);if(!page)return;
  const t=e.touches[0];start={page,x:t.clientX,y:t.clientY,vertical:false,edge:t.clientX>=innerWidth-28,
   control:!!e.target.closest('input,textarea,select,button,a,video,iframe,.row,.hscroll,.swipe-track,.volrow,.karaoke')};
 },{capture:true,passive:true});
 document.addEventListener('touchmove',e=>{
  if(!start)return;if(e.touches.length!==1){start.vertical=true;return;}
  const dx=Math.abs(e.touches[0].clientX-start.x),dy=Math.abs(e.touches[0].clientY-start.y);
  if(dy>12&&dy>dx*1.1)start.vertical=true;
 },{capture:true,passive:true});
 document.addEventListener('touchend',e=>{
  const s=start;start=null;if(!s||!s.page.classList.contains('on'))return;
  const t=e.changedTouches[0];if(!t)return;
  const dx=s.x-t.clientX,dy=Math.abs(s.y-t.clientY);
  // Stop only custom event handlers, never prevent native scrolling.
  if(s.vertical||dy>70||dy>Math.abs(dx)/1.5){e.stopImmediatePropagation();return;}
  if(innerWidth<820&&!s.control&&!s.edge&&dx>=75){e.stopImmediatePropagation();closePage(s.page.id);}
 },{capture:true,passive:true});
 document.addEventListener('touchcancel',()=>{start=null;},{capture:true,passive:true});
})();
