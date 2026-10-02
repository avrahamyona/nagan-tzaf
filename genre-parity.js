// v160: every Search tile uses the same complete genre sections and routing.
function renderCompleteGenre(spec,data){
 const box=$('alTracks');box.replaceChildren();document.querySelectorAll('.genre-start').forEach(x=>x.remove());
 if(mobileGenre())$('page-album').classList.add('phone-genre');
 const start=document.createElement('button');start.className='genre-start';start.type='button';start.textContent='▶ התחל';start.disabled=!data.tracks.length;start.onclick=()=>startGenreSongs(data.tracks);$('page-album').querySelector('.albumhead').appendChild(start);
 const artists=sectionEl('אמנים מומלצים בתחום','hscroll circles');
 data.artists.forEach((a,i)=>artists.body.append(domainArtistCard(a,i)));
 if(!data.artists.length)artists.body.textContent='האמנים לא זמינים כרגע מהמקור. נסה שוב.';box.append(artists.sec);
 const releases=sectionEl('אלבומים ו-EP מומלצים','hscroll');
 data.releases.forEach(a=>{const card=albumCardEl(a);const img=card.querySelector('img');if(img){img.referrerPolicy='no-referrer';img.src=a.thumb?.replace(/=w\d+-h\d+.*$/,'=s544')||'';}releases.body.append(card);});
 if(!data.releases.length)releases.body.textContent='אין כרגע הוצאות מאומתות מהמקור בתחום הזה.';box.append(releases.sec);
 const mixes=sectionEl('המלצות','hscroll');
 const groups=new Map;data.tracks.forEach(t=>{const key=t.ch||songArtistIdentity(t);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);});
 const lists=[...groups.values()];
 for(let i=0;i<2;i++){
  const tracks=lists.flatMap(a=>a.filter((_,j)=>j%2===i));if(!tracks.length)continue;
  const card=document.createElement('button');card.className='genre-mix';card.type='button';const art=document.createElement('div');art.className='genre-mix-art';tracks.slice(0,4).forEach(t=>{const img=document.createElement('img');img.src=sqThumb(t.id);img.alt='';art.append(img);});
  const title=document.createElement('strong');title.textContent='מיקס '+(i+1)+' · '+spec.name;const sub=document.createElement('small');sub.textContent=[...new Set(tracks.map(t=>data.artists.find(a=>a.ch===t.ch)?.name||t.artist))].join(' · ');card.append(art,title,sub);card.onclick=()=>startGenreSongs(tracks);mixes.body.append(card);
 }
 if(!data.tracks.length)mixes.body.textContent='המלצות יופיעו כששירים מתאימים יהיו זמינים.';box.append(mixes.sec);
 const songs=sectionEl('שירים בתחום');songs.heading.disabled=!data.tracks.length;songs.heading.onclick=()=>sectionTracks(spec.name,data.tracks);
 data.tracks.forEach((t,i)=>songs.body.append(trackRow(t,{artistLink:true,onPlay:()=>playQueue(data.tracks,i)})));
 if(!data.tracks.length)songs.body.textContent='השירים לא זמינים כרגע. לא נוסיף שירים לא מתאימים.';box.append(songs.sec);
 genreDataByName.set(spec.name,data);
 if(data._genreNext)box.append(genreMoreButton(data,()=>renderCompleteGenre(spec,data)));
 if(data.tracks.length<30){const note=document.createElement('p');note.className='catalog-note dim';note.textContent='המקור החזיר כרגע '+data.tracks.length+' שירים מתאימים.';box.append(note);}
 const art=$('alArt');art.onerror=()=>{art.onerror=null;if(data.tracks[0])art.src=sqThumb(data.tracks[0].id);};art.src=data.releases.find(r=>r.thumb)?.thumb||(data.tracks[0]?sqThumb(data.tracks[0].id):'');
}
const openGenreBeforeParity=openMusicDomain;
openMusicDomain=async function(spec){
 const isGenre=genreSpecSet.has(spec);const pending=openGenreBeforeParity(spec),seq=alSeq;
 if(isGenre){const box=$('alTracks');for(const title of ['אמנים מומלצים בתחום','אלבומים ו-EP מומלצים','המלצות','שירים בתחום']){const x=sectionEl(title,title.includes('שירים')?'list':'hscroll');x.body.textContent='טוען...';box.append(x.sec);}}
 const result=await pending;if(!isGenre||seq!==alSeq)return result;
 const data=genreDataByName.get(spec.name)||completedGenreData.get(spec)?.data;
 if(data)renderCompleteGenre(spec,data);return result;
};
const searchBeforeParity=runSearch;
runSearch=async function(q,pill){const spec=categoryDomains[q];if(!spec||searchScope==='library')return searchBeforeParity(q,pill);curPill='top';lastQuery=q;return openMusicDomain(spec);};
// Balance artists across a shuffled genre queue; never reshuffle at every skip.
function genrePlaybackUnique(tracks){
 const seen=new Set;return uniqueSongList(tracks).filter(t=>{
  let title=canonicalSongTitle(t);
  const names=[t.artist,...piyyutDomainArtists.map(a=>a.name),'יחזקאל ציון','Yehezkel Zion'];
  for(const name of names){const n=normTxt(name).replace(/[^\p{L}\p{N}\s]/gu,'').trim();if(n)title=title.replace(n,'').trim();}
  const key=(t.ch||songArtistIdentity(t))+'|'+title;if(seen.has(key))return false;seen.add(key);return true;
 });
}
startGenreSongs=function(tracks,random=true){
 const list=genrePlaybackUnique(tracks);if(!list.length)return toast('אין כרגע שירים זמינים בתחום');
 const groups=new Map;for(const t of list){const key=t.ch||songArtistIdentity(t);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);}
 const buckets=[...groups.values()].map(a=>random?shuffledGenreSongs(a):a);
 if(random)for(let i=buckets.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[buckets[i],buckets[j]]=[buckets[j],buckets[i]];}
 const ordered=[];while(buckets.some(a=>a.length))for(const a of buckets)if(a.length)ordered.push(a.shift());
 state.shuffle=false;state.repeat='off';playQueue(ordered,0);
};
const advanceBeforeGenreParity=advance;
advance=async function(direction,automatic){
 if(direction>0&&!state.priorityCurrent&&!state.priorityQueue?.length&&current()?._domainScope&&state.qi>=state.queue.length-1&&state.repeat==='off'){syncPlayUI(true);return;}
 return advanceBeforeGenreParity(direction,automatic);
};
const parityStyle=document.createElement('style');parityStyle.textContent='@media(min-width:820px){.genre-start{display:block;margin:20px auto;padding:12px 30px;border-radius:24px;background:var(--accent);color:white;font:inherit;font-weight:700}.genre-mix{flex:0 0 220px;color:var(--text);text-align:right;border-radius:14px;overflow:hidden;background:var(--card);padding-bottom:14px}.genre-mix-art{display:flex;height:150px;overflow:hidden}.genre-mix-art img{min-width:0;flex:1;object-fit:cover}.genre-mix strong,.genre-mix small{display:block;padding:8px 12px}.genre-mix small{color:var(--dim)}}';document.head.append(parityStyle);
const buildGenreBeforeParity=buildMusicDomain;
buildMusicDomain=async function(spec){const data=await buildGenreBeforeParity(spec);if(genreSpecSet.has(spec)){data.tracks=genrePlaybackUnique(data.tracks).map(t=>({...t,_domainScope:spec.name}));genreDataByName.set(spec.name,data);}return data;};
// Mark only real genre pages, never ordinary albums or song drilldowns.
const openGenreBeforeHero=openMusicDomain;
openMusicDomain=function(spec){$('page-album').classList.toggle('genre-detail',genreSpecSet.has(spec));return openGenreBeforeHero(spec);};
const albumBeforeGenreHero=openAlbum;
openAlbum=function(...args){$('page-album').classList.remove('genre-detail');return albumBeforeGenreHero(...args);};
const sectionBeforeGenreHero=sectionTracks;
sectionTracks=function(...args){$('page-album').classList.remove('genre-detail');return sectionBeforeGenreHero(...args);};
