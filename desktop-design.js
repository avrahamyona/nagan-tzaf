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
// v156: glyph direction and content direction agree in every shared carousel.
(function(){
 const sectionBeforeArrowFix=sectionEl;
 sectionEl=function(...args){const result=sectionBeforeArrowFix(...args);fixCarouselArrows(result.sec);return result;};
 function fixCarouselArrows(root){
  for(const section of root.matches?.('.asec')?[root]:root.querySelectorAll('.asec')){
   const body=section.querySelector('.asec-body.hscroll');if(!body)continue;
   for(const original of section.querySelectorAll('.asec-arrow')){
    if(original.dataset.directionFixed)return;
    const button=original.cloneNode(true),right=original.textContent.trim()==='›';
    button.dataset.directionFixed='1';button.setAttribute('aria-label',(right?'גלול ימינה':'גלול שמאלה')+' - '+section.querySelector('.asec-title')?.textContent.replace('‹','').trim());
    button.addEventListener('click',()=>{
     // In RTL, increasing scrollLeft moves cards left; decreasing moves right.
     const rtl=getComputedStyle(body).direction==='rtl';
     body.scrollBy({left:(right?(rtl?-1:1):(rtl?1:-1))*Math.max(250,body.clientWidth*.8),behavior:'smooth'});
    });original.replaceWith(button);
   }
  }
 }
 fixCarouselArrows(document);
})();
