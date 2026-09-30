// Discovery lists collapse alternate uploads, but retain named live/remix versions.
function canonicalSongTitle(track){
 let title=String(track.title||'').normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g,'');
 const artist=String(track.artist||'').replace(/\s*-\s*Topic$/i,'').trim();
 if(artist&&title.toLowerCase().startsWith(artist.toLowerCase()))title=title.slice(artist.length).replace(/^\s*[-|:–]\s*/,'');
 title=title.replace(/\b(?:official\s*(?:music\s*)?(?:video|audio)|lyrics?(?:\s*video)?|hd|hq|4k)\b|קליפ רשמי|אודיו רשמי|קליפ מילים/gi,'').replace(/\(\s*\)/g,'');
 if(track.ch==='UCLlXnM1R9aMay2f-fg85EPw')title=title.replace(/Ya Alby/gi,'Ya Albi');
 return normTxt(title).replace(/[^\p{L}\p{N}\s]/gu,'').replace(/\s+/g,' ').trim();
}
function songArtistIdentity(track){
 const catalogAliases={"Om Kolthoum":"omkolthoum","Mohamed Abdel Wahab":"mohamedabdelwahab","Mohamed Abd El Wahab":"mohamedabdelwahab","Farid El Atrash":"faridalatrash","Farid Al Atrash":"faridalatrash","Farid al-Atrash":"faridalatrash"};
 return catalogAliases[track.artist]||artistKey(track.artist)||track.ch||"";
}
function uniqueSongList(tracks){
 const ids=new Set,keys=new Set;
 return tracks.filter(t=>{if(!t?.id||ids.has(t.id))return false;const name=canonicalSongTitle(t);const artist=songArtistIdentity(t);const key=artist&&name?artist+'|'+name:t.id;if(keys.has(key))return false;ids.add(t.id);keys.add(key);return true;});
}
const songDiscoveryBeforeIntegrity=songDiscovery;
songDiscovery=function(items){return uniqueSongList(songDiscoveryBeforeIntegrity(items));};
const vibeBeforeIntegrity=buildHomeVibe;
buildHomeVibe=async function(spec){return uniqueSongList(await vibeBeforeIntegrity(spec));};
const arabicBeforeIntegrity=arabicRepertoire;
arabicRepertoire=async function(kind){
 let songs=await arabicBeforeIntegrity(kind);
 // A full Cleopatra recording and its split parts are the same work; prefer full.
 if(kind===1&&songs.some(t=>/^Cleopatra$/i.test(t.title)))songs=songs.filter(t=>!/^Cleopatra\s*\(Pt\s*\d+\)/i.test(t.title));
 return uniqueSongList(songs).map(t=>({...t,_domainScope:arabicCategoryNames[kind]}));
};
const domainBuildBeforeIntegrity=buildMusicDomain;
buildMusicDomain=async function(spec){const data=await domainBuildBeforeIntegrity(spec);data.tracks=uniqueSongList(data.tracks).map(t=>({...t,_domainScope:spec.name}));return data;};
const viewsBeforeIntegrity=byKnownViews;
byKnownViews=function(tracks){return viewsBeforeIntegrity(uniqueSongList(tracks));};
const browserBeforeIntegrity=domainSongBrowser;
domainSongBrowser=function(spec,data){const next=browserBeforeIntegrity(spec,data);return async function(){const batch=await next();const old=new Set(uniqueSongList(data.tracks).map(t=>(songArtistIdentity(t))+'|'+canonicalSongTitle(t)));batch.tracks=uniqueSongList(batch.tracks).filter(t=>!old.has((songArtistIdentity(t))+'|'+canonicalSongTitle(t))).map(t=>({...t,_domainScope:spec.name}));return batch;};};
const playQueueBeforeIntegrity=playQueue;
playQueue=function(tracks,index,options={}){const selected=tracks[index||0];const unique=uniqueSongList(tracks);const at=Math.max(0,unique.findIndex(t=>t.id===selected?.id||((songArtistIdentity(t))===(songArtistIdentity(selected||{}))&&canonicalSongTitle(t)===canonicalSongTitle(selected||{}))));return playQueueBeforeIntegrity(unique,at,options);};
const upNextBeforeIntegrity=ensureUpNext;
ensureUpNext=async function(){if(current()?._domainScope)return;return upNextBeforeIntegrity();};
// At a scoped list's end stop, never fill it with personal recommendations.
const advanceBeforeIntegrity=advance;
advance=async function(direction,automatic){
 if(automatic&&direction===1&&current()?._domainScope&&state.qi===state.queue.length-1&&state.repeat!=='all'&&state.repeat!=='one'){syncPlayUI(true);return;}
 return advanceBeforeIntegrity(direction,automatic);
};

const sectionBeforeIntegrity=sectionTracks;
sectionTracks=function(title,tracks){return sectionBeforeIntegrity(title,uniqueSongList(tracks));};
