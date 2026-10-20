// v212: use original image URLs only for known proxy image hosts.
function coverImageURL(src){
 if(typeof src!=='string')return '';
 try{const u=new URL(src),host=u.searchParams.get('host');
 if(u.hostname==='proxy.piped.private.coffee'&&['yt3.googleusercontent.com','lh3.googleusercontent.com','yt3.ggpht.com','i.ytimg.com','i9.ytimg.com'].includes(host)){
 u.searchParams.delete('host');return 'https://'+host+u.pathname+u.search;
 }}catch{}return src;
}
function trackCover(t){return coverImageURL(t?.thumb||t?.thumbnail||t?.album?.thumb)||thumb(t?.id);}
const streamBeforeCovers=mapStream;
mapStream=function(item){return {...streamBeforeCovers(item),thumb:coverImageURL(item.thumbnail||'')};};
const albumBeforeCovers=mapAlbum;
mapAlbum=function(item){const album=albumBeforeCovers(item);album.thumb=coverImageURL(album.thumb);return album;};
const rowBeforeCovers=trackRow;
trackRow=function(track,options){const row=rowBeforeCovers(track,options);const image=row.querySelector('img');if(image&&trackCover(track))image.src=trackCover(track);return row;};
const artistHitBeforeCovers=artistHit;
artistHit=function(artist){return artistHitBeforeCovers({...artist,avatar:coverImageURL(artist.avatar)});};
// YouTube HQ thumbnails are 4:3 files with baked-in black bars around 16:9 content.
// Use the bar-free 16:9 source and existing frame-specific cover crops everywhere.
function cleanThumbnailURL(src){return coverImageURL(src).replace(/(i\.ytimg\.com\/vi\/[\w-]+\/)hqdefault\.jpg/g,'$1mqdefault.jpg');}
function cleanThumbnail(el){
 if(el.tagName==='IMG'){const raw=el.getAttribute('src')||'',next=cleanThumbnailURL(raw);if(next!==raw){el.referrerPolicy='no-referrer';el.src=next;}}
 const bg=el.style?.backgroundImage;if(bg){const next=bg.replace(/url\(["']?(https:[^"')]+)["']?\)/g,(_,u)=>'url("'+cleanThumbnailURL(u)+'")');if(next!==bg)el.style.backgroundImage=next;}
}
function cleanThumbTree(root){if(root.nodeType!==1)return;cleanThumbnail(root);root.querySelectorAll('img,[style]').forEach(cleanThumbnail);}
cleanThumbTree(document.documentElement);
new MutationObserver(records=>{for(const r of records){if(r.type==='attributes')cleanThumbnail(r.target);else r.addedNodes.forEach(cleanThumbTree);}}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src','style']});

// Capture before local fallback handlers discard the failed source.
document.addEventListener('error',e=>{
 const img=e.target;if(img.tagName!=='IMG')return;
 const src=img.getAttribute('src')||'',direct=cleanThumbnailURL(src);
 if(direct!==src){e.stopImmediatePropagation();img.src=direct;return;}
 const m=src.match(/^https:\/\/(?:i|i9)\.ytimg\.com\/vi\/([\w-]{11})\//);if(!m)return;
 const step=img.dataset.coverRetryFor===m[1]?Number(img.dataset.coverRetry||0):0;
 const urls=['https://i.ytimg.com/vi/'+m[1]+'/mqdefault.jpg','https://i9.ytimg.com/vi/'+m[1]+'/hqdefault.jpg','https://i.ytimg.com/vi/'+m[1]+'/default.jpg'];
 let n=step;while(n<urls.length&&urls[n]===src)n++;
 if(n<urls.length){img.dataset.coverRetryFor=m[1];img.dataset.coverRetry=String(n+1);e.stopImmediatePropagation();img.src=urls[n];}
},true);
