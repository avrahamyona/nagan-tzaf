// Render each verified section as soon as it arrives, and reuse complete genre results.
let progressiveGenre=null;
function showGenreProgress(){
 const p=progressiveGenre;if(!p||p.seq!==alSeq||!$('page-album').classList.contains('on'))return;
 const scroll=$('alTracks').parentElement.scrollTop;
 renderCompleteGenre(p.spec,p.data);
 const box=$('alTracks');box.querySelectorAll('.catalog-note').forEach(n=>{if(n.textContent.includes('המקור החזיר'))n.remove();});
 const sections=box.querySelectorAll('.asec');
 for(const [i,ready]of [p.data.artists.length,p.data.releases.length,p.data.tracks.length,p.data.tracks.length].entries())if(!ready&&sections[i]){sections[i].querySelector('.asec-body').textContent='טוען...';}
 $('alTracks').parentElement.scrollTop=scroll;
}
window.genreSectionProgress=function(spec,result){
 const p=progressiveGenre;if(!p||p.spec!==spec)return;
 if(result.artist&&!p.data.artists.some(a=>a.ch===result.artist.ch))p.data.artists.push(result.artist);
 if(result.releases)for(const a of result.releases)if(!p.data.releases.some(r=>r.plId===a.plId))p.data.releases.push(a);
 showGenreProgress();
};
const openBeforeProgress=openMusicDomain;
openMusicDomain=async function(spec){
 if(!genreSpecSet.has(spec))return openBeforeProgress(spec);
 const cached=genreDataByName.get(spec.name);const now=performance.now();
 if(cached?._completedAt&&now-cached._completedAt<600000){
  ++alSeq;alCur=null;alTracks=[];$('page-album').classList.add('genre-detail','release-list');$('alTitle').textContent=spec.name;$('alArtist').textContent=spec.desc;$('alMeta').textContent='שירים · אמנים · אלבומים ו-EP';$('alPlay').style.display='none';$('alShuffle').style.display='none';openPage('page-album');renderCompleteGenre(spec,cached);return;
 }
 const p={spec,seq:alSeq+1,data:{tracks:[],artists:[],releases:[]}};progressiveGenre=p;
 const work=openBeforeProgress(spec);
 // Wrap the already-installed song callback instead of replacing its generation guards.
 const before=window.genreProgressHooks.get(spec.name);
 window.genreProgressHooks.set(spec.name,tracks=>{if(progressiveGenre!==p||p.seq!==alSeq)return;p.data.tracks=uniqueSongList(tracks).slice(0,30).map(t=>({...t,_domainScope:spec.name}));showGenreProgress();});
 showGenreProgress();
 try{await work;const data=genreDataByName.get(spec.name);if(data)data._completedAt=performance.now();}finally{if(progressiveGenre===p)progressiveGenre=null;}
};
