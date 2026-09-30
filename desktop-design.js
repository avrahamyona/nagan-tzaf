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
