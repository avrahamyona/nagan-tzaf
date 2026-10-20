// v214: deterministic search section order; a song search shows the studio
// album plus live albums/performances with verified same-artist membership.
const albumSearchBeforeMembership=searchPlaylists;
function membershipKey(s){return normTxt(String(s||'').replace(/\([^)]*\)|\[[^\]]*\]/g,'').replace(/\s*[|｜].*$/,'').replace(/ - Topic$| - הערוץ הרשמי$|official channel/gi,'')).replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
function membershipTitle(t){let title=String(t.title||'');const artist=membershipKey(t.artist);const parts=title.split(/\s+[-–]\s+/);if(parts.length>1&&membershipKey(parts[0])===artist)title=parts.slice(1).join(' - ');return membershipKey(title);}
async function songSearchIdentity(q){
 const key=membershipKey(q);
 let tracks;try{tracks=await searchMusicCached(q);}catch{return {unavailable:true};}
 if(tracks.some(t=>membershipKey(t.artist)===key))return null;
 const exact=tracks.filter(t=>{const title=membershipTitle(t),artist=membershipKey(t.artist);return title&&[title,artist+' '+title,title+' '+artist].includes(key);});
 if(!exact.length)return null;
 // Search ranking chooses the intended recording; never join same-title songs by another artist.
 const seed=exact.find(t=>t.musicCatalog)||exact[0];return {title:membershipTitle(seed),artist:membershipKey(seed.artist),artistRaw:String(seed.artist||'').replace(/ - Topic$/i,''),seedCh:seed.ch||'',ids:new Set(exact.filter(t=>membershipKey(t.artist)===membershipKey(seed.artist)).map(t=>t.id))};
}
const liveAlbumRe=/\blive\b|הופעה|מופע|קונצרט/i;
// The same singer appears in Hebrew on albums and in English on recordings
// (אייל גולן = Eyal Golan). Channel search resolves both spellings to one
// channel, which is the identity bridge; results are cached per name pair.
const artistChCache=new Map();
async function sameArtistChannel(nameA,nameB){
 const key=membershipKey(nameA)+'|'+membershipKey(nameB);if(!membershipKey(nameA)||!membershipKey(nameB))return false;
 if(artistChCache.has(key))return artistChCache.get(key);
 let same=false;
 try{const [ca,cb]=await Promise.all([searchChannels(nameA),searchChannels(nameB)]);same=!!(ca[0]?.chId&&ca[0].chId===cb[0]?.chId);}catch{}
 artistChCache.set(key,same);return same;
}
searchPlaylists=async function(q,filter='music_albums'){
 const albums=await albumSearchBeforeMembership(q,filter);if(filter!=='music_albums')return albums;
 const identity=await songSearchIdentity(q);if(!identity)return albums;if(identity.unavailable)return [];
 // Recall: the plain song query rarely surfaces the studio album or the live
 // albums that contain the song, so title+artist album searches join the
 // candidate list. Each still proves membership through its tracklist below.
 const candidates=[...albums];
 const seen=new Set(albums.map(a=>a.plId||membershipKey(a.title)+'|'+membershipKey(a.artistName)));
 const extras=await Promise.allSettled([
  albumSearchBeforeMembership(identity.title+' '+identity.artist,'music_albums'),
  albumSearchBeforeMembership(identity.title+' '+identity.artist+' הופעה live','music_albums'),
 ]);
 for(const r of extras){if(r.status!=='fulfilled')continue;for(const a of r.value||[]){const id=a.plId||membershipKey(a.title)+'|'+membershipKey(a.artistName);if(seen.has(id))continue;seen.add(id);candidates.push(a);}}
 const found=[];let cursor=0;const total=Math.min(candidates.length,10);
 // Bound source concurrency; unknown tracklists never become recommendations.
 await Promise.all(Array.from({length:Math.min(4,total)},async()=>{
  while(cursor<total){const index=cursor++,album=candidates[index];let result;
   try{result=await loadAlbumTracks(album);}catch{continue;}
   const tracks=result?.tracks||[];
   let match=tracks.find(t=>identity.ids.has(t.id));
   if(!match)for(const t of tracks){
    if(membershipTitle(t)!==identity.title)continue;
    const raw=t.artist||album.artistName;
    if(membershipKey(raw)===identity.artist
      ||(identity.seedCh&&album.artistId===identity.seedCh)
      ||await sameArtistChannel(raw,identity.artistRaw)){match=t;break;}
   }
   if(match)found.push({index,live:liveAlbumRe.test(String(match.title))||liveAlbumRe.test(String(album.title))?1:0,album:{...album,matchedSongId:match.id,matchedSongTitle:match.title}});
  }
 }));
 // Studio album first, then live albums/performances, each in search order.
 return found.sort((a,b)=>a.live-b.live||a.index-b.index).map(x=>x.album);
};
// Deterministic section order: lyric matches ("תוצאות מובילות"), exact album
// rows (album-name queries), the artist card, the albums row, the songs
// section, then anything else. Async painters append in arrival order; this
// observer keeps the final layout stable regardless of which source lands first.
function searchSectionRank(x){
 const c=x.classList;
 if(c?.contains('js-lyr'))return 0;
 if(c?.contains('js-albums')){
  // Exact-title album rows (album-name queries) stay above the artist card;
  // the albums carousel for a song or artist sits under it, above the songs.
  const holder=x.matches('h2')?x.nextElementSibling:x;
  return holder?.querySelector?.('.album-search-row')?1:3;
 }
 if(x.id==='resArtistHit')return 2;
 if(c?.contains('js-songs'))return 4;
 return 5;
}
function orderSearchResults(){
 const box=$('resBody');if(!box)return;
 const kids=[...box.children];if(kids.length<2)return;
 const ranked=kids.map((x,i)=>({x,i,r:searchSectionRank(x)})).sort((a,b)=>a.r-b.r||a.i-b.i);
 if(ranked.every((k,i)=>box.children[i]===k.x))return;
 rankObserver.disconnect();for(const k of ranked)box.appendChild(k.x);rankObserver.observe(box,{childList:true});
}
const rankObserver=new MutationObserver(orderSearchResults);rankObserver.observe($('resBody'),{childList:true});
