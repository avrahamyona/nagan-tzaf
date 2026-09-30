// Phone category pages: real repertoire artwork and scoped multi-artist mixes.
const mobileGenre=()=>matchMedia('(max-width:819px)').matches;
function shuffledGenreSongs(tracks){const list=uniqueSongList(tracks).slice();for(let i=list.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[list[i],list[j]]=[list[j],list[i]];}return list;}
function startGenreSongs(tracks,random=true){const list=random?shuffledGenreSongs(tracks):uniqueSongList(tracks);if(!list.length)return toast('אין כרגע שירים זמינים בתחום');state.shuffle=false;playQueue(list,0);}
const appendBeforePhoneGenres=appendDomainSongList;
appendDomainSongList=function(box,spec,data){
 if(mobileGenre()&&Object.values(categoryDomains).includes(spec)){
  $('page-album').classList.add('phone-genre');
  const start=document.createElement('button');start.className='genre-start';start.type='button';start.textContent='▶ התחל';start.addEventListener('click',()=>startGenreSongs(data.tracks));$('page-album').querySelector('.albumhead').appendChild(start);
  const {sec,body}=sectionEl('המלצות','hscroll');sec.classList.add('genre-recommendations');
  const groups=new Map;for(const t of data.tracks){const key=songArtistIdentity(t);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);}
  const artists=[...groups.values()];
  const mixes=[artists.flatMap(a=>a.filter((_,i)=>i%2===0)),artists.flatMap(a=>a.filter((_,i)=>i%2===1))].filter(a=>a.length);
  mixes.forEach((tracks,i)=>{
   const card=document.createElement('button');card.type='button';card.className='genre-mix';
   const art=document.createElement('div');art.className='genre-mix-art';for(const track of tracks.slice(0,4)){const img=document.createElement('img');img.src=sqThumb(track.id);img.alt='';art.appendChild(img);}card.appendChild(art);
   const title=document.createElement('strong');title.textContent='מיקס '+(i+1)+' · '+spec.name;card.appendChild(title);
   const label=document.createElement('small');label.textContent=[...new Map(tracks.map(t=>[songArtistIdentity(t),data.artists.find(a=>a.ch===t.ch)?.name||t.artist.replace(/ - Topic$/i,'')])).values()].join(' · ');card.appendChild(label);
   card.addEventListener('click',()=>startGenreSongs(tracks));body.appendChild(card);
  });box.appendChild(sec);
 }
 return appendBeforePhoneGenres(box,spec,data);
};
const openDomainBeforePhoneGenres=openMusicDomain;
openMusicDomain=async function(spec){$('page-album').classList.remove('phone-genre');document.querySelectorAll('.genre-start').forEach(x=>x.remove());return openDomainBeforePhoneGenres(spec);};
// Remove mobile-only controls when reusing this page for an ordinary release.
const albumBeforePhoneGenres=openAlbum;
openAlbum=function(...args){$('page-album').classList.remove('phone-genre');document.querySelectorAll('.genre-start').forEach(x=>x.remove());return albumBeforePhoneGenres(...args);};
const phoneGenreStyle=document.createElement('style');phoneGenreStyle.textContent=`
.genre-start,.genre-recommendations{display:none}
@media(max-width:819px){
 #page-album.phone-genre .albumhead{padding-top:72px;text-align:right}
 #page-album.phone-genre .albumart{display:block;width:calc(100% - 32px);height:200px;object-fit:cover;border-radius:18px;margin:0 auto 22px}
 #page-album.phone-genre .pttl{padding-inline:16px;font-size:30px}
 #page-album.phone-genre .psub,#page-album.phone-genre .pmeta{padding-inline:16px;text-align:right}
 .phone-genre .genre-start{display:block;margin:20px 16px 0;padding:12px 30px;background:var(--accent);color:white;font:inherit;font-weight:700;border-radius:24px}
 .genre-recommendations{display:block;margin-bottom:26px}
 .genre-mix{flex:0 0 220px;color:var(--text);text-align:right;background:var(--card);border-radius:14px;overflow:hidden;padding-bottom:14px}
 .genre-mix-art{display:flex;height:150px;overflow:hidden;margin-bottom:12px}
 .genre-mix-art img{min-width:0;flex:1;object-fit:cover}
 .genre-mix strong,.genre-mix small{display:block;padding:0 12px}.genre-mix small{margin-top:8px;color:var(--dim);font-size:12px;line-height:1.5}
}`;document.head.appendChild(phoneGenreStyle);
