// Songs become playable as soon as verified results arrive; albums are not a gate.
window.genreProgressHooks=new Map;
const completedGenreData=new Map;
const buildBeforeGenreSpeed=buildMusicDomain;
buildMusicDomain=async function(spec){
 const cached=completedGenreData.get(spec);if(cached&&Date.now()-cached.at<600000)return cached.data;
 const data=await buildBeforeGenreSpeed(spec);if(genreSpecSet.has(spec)&&data.tracks.length)completedGenreData.set(spec,{data,at:Date.now()});return data;
};
const openBeforeGenreSpeed=openMusicDomain;
openMusicDomain=async function(spec){
 if(!genreSpecSet.has(spec))return openBeforeGenreSpeed(spec);
 const expected=alSeq+1;let shown=0;
 window.genreProgressHooks.set(spec.name,tracks=>{
  if(expected!==alSeq||!$('page-album').classList.contains('on'))return;
  const scoped=uniqueSongList(tracks).map(t=>({...t,_domainScope:spec.name}));if(!scoped.length||scoped.length<=shown)return;shown=scoped.length;
  const box=$('alTracks');box.replaceChildren();document.querySelectorAll('.genre-start').forEach(x=>x.remove());
  const start=document.createElement('button');start.type='button';start.className='domain-more fast-genre-start';start.textContent='▶ התחל עכשיו';start.onclick=()=>startGenreSongs(scoped);box.append(start);
  const note=document.createElement('p');note.className='catalog-note dim';note.textContent='אפשר כבר לנגן · שאר השירים, האמנים והאלבומים נטענים ברקע';box.append(note);
  const {sec,body}=sectionEl('שירים זמינים בתחום');scoped.slice(0,30).forEach((t,i)=>body.append(trackRow(t,{artistLink:true,onPlay:()=>playQueue(scoped,i)})));box.append(sec);
  $('alArt').src=sqThumb(scoped[0].id);if(mobileGenre())$('page-album').classList.add('phone-genre');
  prewarmDirectTrack(scoped[0].id);
 });
 try{return await openBeforeGenreSpeed(spec);}finally{if(alSeq===expected)window.genreProgressHooks.delete(spec.name);}
};
const paintBadgeBeforeGenreSpeed=paintEngineBadge;
paintEngineBadge=function(){paintBadgeBeforeGenreSpeed();if($('engineBadge'))$('engineBadge').innerHTML=$('engineBadge').innerHTML.replace(/v\d+/g,'v148');};
if($('verChip')?.lastChild)$('verChip').lastChild.textContent='v148';paintEngineBadge();
