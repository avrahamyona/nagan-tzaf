const desktopBackdrop=document.createElement('div');desktopBackdrop.id='desktopPlayerBackdrop';desktopBackdrop.className='hidden';desktopBackdrop.setAttribute('aria-hidden','true');document.body.appendChild(desktopBackdrop);
function syncDesktopBackdrop(){desktopBackdrop.classList.toggle('hidden',$('player').classList.contains('hidden'));}
new MutationObserver(syncDesktopBackdrop).observe($('player'),{attributes:true,attributeFilter:['class']});syncDesktopBackdrop();
desktopBackdrop.addEventListener('click',()=>{$('pDown').click();});

const desktopArtistRenderer=renderArtistBody;renderArtistBody=function(songs,albums,videos,playlists=[]){
 desktopArtistRenderer(songs,albums,videos,playlists);
 if(!matchMedia('(min-width:820px)').matches)return;
 const box=$('aBody');let card=box.querySelector('.latestcard');
 if(!card&&aCur?.releaseMetadata){const latest=albums.filter(a=>a.releaseYear&&a.recencyRank).sort((a,b)=>a.recencyRank-b.recencyRank)[0];if(latest){
  card=document.createElement('button');card.type='button';card.className='latestcard';const image=document.createElement('img');image.src=latest.thumb;image.alt='';image.referrerPolicy='no-referrer';card.appendChild(image);
  const meta=document.createElement('div');const label=document.createElement('div');label.className='lc-k';label.textContent='מההוצאות האחרונות בקטלוג';const title=document.createElement('div');title.className='lc-t';title.textContent=latest.title;const sub=document.createElement('div');sub.className='lc-s dim';sub.textContent=latest.releaseYear+' · לפי קטלוג האמן';meta.append(label,title,sub);card.appendChild(meta);const chevron=document.createElement('span');chevron.className='lc-chev';chevron.textContent='‹';card.appendChild(chevron);card.setAttribute('aria-label','פתח הוצאה: '+latest.title);card.addEventListener('click',()=>openAlbum(latest));box.prepend(card);
 }}
 if(card){card.querySelector('img').referrerPolicy='no-referrer';}
};
// v158: physical left/right controls move cards in the same screen direction.
(function(){
 const before=sectionEl;
 sectionEl=function(...args){const result=before(...args);fix(result.sec);return result;};
 function fix(root){
  for(const section of root.matches?.('.asec')?[root]:root.querySelectorAll('.asec')){
   const body=section.querySelector('.asec-body.hscroll');if(!body)continue;
   const originals=[...section.querySelectorAll('.asec-arrow')];
   originals.forEach((original,i)=>{
    if(original.dataset.directionFixed)return;
    const button=original.cloneNode(false),right=i===originals.length-1;
    button.dataset.directionFixed='1';button.dataset.contentDirection=right?'right':'left';
    button.style.direction='ltr';
    button.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="'+(right?'M9 5l7 7-7 7':'M15 5l-7 7 7 7')+'" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    button.setAttribute('aria-label',(right?'הזז תוכן משמאל לימין':'הזז תוכן מימין לשמאל')+' - '+section.querySelector('.asec-title')?.textContent.replace('‹','').trim());
    button.addEventListener('click',()=>{
     // A negative scroll delta moves actual cards right in both RTL and LTR.
     body.scrollBy({left:(right?-1:1)*Math.max(250,body.clientWidth*.8),behavior:'smooth'});
    });original.replaceWith(button);
   });
  }
 }
 fix(document);
})();
// Expand the full desktop player from the mini-player's exact rectangle.
(function(){
 const player=$('player');let hidden=player.classList.contains('hidden'),animation=null;
 new MutationObserver(()=>{
  const next=player.classList.contains('hidden');
  if(next===hidden)return;hidden=next;animation?.cancel();
  if(next||!matchMedia('(min-width:820px)').matches||matchMedia('(prefers-reduced-motion:reduce)').matches)return;
  const mini=$('mini').getBoundingClientRect(),full=player.getBoundingClientRect();
  if(!mini.width||!mini.height)return;
  const dx=mini.left+mini.width/2-(full.left+full.width/2),dy=mini.top+mini.height/2-(full.top+full.height/2);
  animation=player.animate([
   {transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(${mini.width/full.width},${mini.height/full.height})`,borderRadius:'40px',opacity:.7},
   {transform:'translate(-50%,-50%) scale(1,1)',borderRadius:'24px',opacity:1}
  ],{duration:280,easing:'cubic-bezier(.2,.8,.2,1)'});
 }).observe(player,{attributes:true,attributeFilter:['class']});
})();
