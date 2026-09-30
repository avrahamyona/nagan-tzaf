// Enrich search-played songs from exact album playlist membership, never title similarity.
const oldAlbumFor=verifiedAlbumFor;
verifiedAlbumFor=async function(t){
 if(!t?.id)return null;if(t.album?.plId)return t.album;
 const cached=albumLookup.get(t.id);if(cached){const a=await cached;if(a)return a;}
 const lookup=(async()=>{
  try{
   const releases=await catalogForTaste({name:t.artist,ch:t.ch});
   const candidates=releases.filter(a=>['album','short'].includes(releaseKind(a))).sort((a,b)=>Number(/חלק/.test(b.title))-Number(/חלק/.test(a.title))||(a.recencyRank||9999)-(b.recencyRank||9999)).slice(0,16);
   for(let start=0;start<candidates.length;start+=4){
    const matches=await Promise.allSettled(candidates.slice(start,start+4).map(async a=>{const{tracks}=await loadAlbumTracks(a);return tracks.some(x=>x.id===t.id)?a:null;}));
    const found=matches.find(r=>r.status==='fulfilled'&&r.value);if(found)return found.value;
   }
  }catch{}
  albumLookup.delete(t.id);return oldAlbumFor(t);
 })();
 albumLookup.set(t.id,lookup);const a=await lookup;if(a){t.album=a;return a;}albumLookup.delete(t.id);return null;
};
