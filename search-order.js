// v213: a song search shows only albums with verified membership.
const albumSearchBeforeMembership=searchPlaylists;
function membershipKey(s){return normTxt(String(s||'').replace(/\([^)]*\)|\[[^\]]*\]/g,'').replace(/\s*[|｜].*$/,'').replace(/ - Topic$| - הערוץ הרשמי$|official channel/gi,'')).replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
function membershipTitle(t){let title=String(t.title||'');const artist=membershipKey(t.artist);const parts=title.split(/\s+[-–]\s+/);if(parts.length>1&&membershipKey(parts[0])===artist)title=parts.slice(1).join(' - ');return membershipKey(title);}
async function songSearchIdentity(q,albums){
 const key=membershipKey(q);if(albums.some(a=>membershipKey(a.title)===key))return null;
 let tracks;try{tracks=await searchMusicCached(q);}catch{return {unavailable:true};}
 if(tracks.some(t=>membershipKey(t.artist)===key))return null;
 const exact=tracks.filter(t=>{const title=membershipTitle(t),artist=membershipKey(t.artist);return title&&[title,artist+' '+title,title+' '+artist].includes(key);});
 if(!exact.length)return null;
 // Search ranking chooses the intended recording; never join same-title songs by another artist.
 const seed=exact.find(t=>t.musicCatalog)||exact[0];return {title:membershipTitle(seed),artist:membershipKey(seed.artist),ids:new Set(exact.filter(t=>membershipKey(t.artist)===membershipKey(seed.artist)).map(t=>t.id))};
}
searchPlaylists=async function(q,filter='music_albums'){
 const albums=await albumSearchBeforeMembership(q,filter);if(filter!=='music_albums'||!albums.length)return albums;
 const identity=await songSearchIdentity(q,albums);if(!identity)return albums;if(identity.unavailable)return [];
 const found=[];let cursor=0;
 // Bound source concurrency; unknown tracklists never become recommendations.
 await Promise.all(Array.from({length:Math.min(3,albums.length)},async()=>{
  while(cursor<albums.length){const index=cursor++,album=albums[index];let result;
   try{result=await loadAlbumTracks(album);}catch{continue;}
   const match=(result?.tracks||[]).find(t=>identity.ids.has(t.id)||membershipTitle(t)===identity.title&&(membershipKey(t.artist||album.artistName)===identity.artist));
   if(match)found.push({index,album:{...album,matchedSongId:match.id,matchedSongTitle:match.title}});
  }
 }));
 return found.sort((a,b)=>a.index-b.index).map(x=>x.album);
};
// Keep the full Songs section intact; only lift lyric results above it.
function orderSearchResults(){
 const box=$('resBody'),lyrics=[...box.querySelectorAll(':scope > .js-lyr')];if(!lyrics.length)return;
 const ordered=[...lyrics,...[...box.children].filter(x=>!lyrics.includes(x))];
 if(ordered.every((x,i)=>box.children[i]===x))return;
 rankObserver.disconnect();for(const x of ordered)box.appendChild(x);rankObserver.observe(box,{childList:true});
}
const rankObserver=new MutationObserver(orderSearchResults);rankObserver.observe($('resBody'),{childList:true});
