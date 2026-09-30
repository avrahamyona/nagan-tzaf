// A source-returned proxy URL includes its upstream image host. Prefer that image.
function directArtistImage(src){
 try{const u=new URL(src);const host=u.searchParams.get('host');if(u.hostname==='proxy.piped.private.coffee'&&['yt3.googleusercontent.com','lh3.googleusercontent.com','yt3.ggpht.com'].includes(host)){const upstream=new URL('https://'+host+u.pathname);for(const[k,v]of u.searchParams)if(k!=='host')upstream.searchParams.set(k,v);return upstream.href;}}catch{}
 return src||'';
}
const verifiedPortraitCache=new Map;
async function artistPortrait(a){
 const key=a.ch||a.id;if(!key)return directArtistImage(a.avatar||'');
 if(!verifiedPortraitCache.has(key))verifiedPortraitCache.set(key,(async()=>{try{const profile=await within(pipedFetch('/channel/'+key),12000);if(profile.id===key&&profile.avatarUrl)return directArtistImage(profile.avatarUrl);}catch{}return directArtistImage(a.avatar||'');})());
 return verifiedPortraitCache.get(key);
}
function domainArtistCard(a,i){
 const card=circleBeforePortraits(a.name,'',GRADS[i%GRADS.length],()=>openArtist(a.ch,a.name,a.avatar));card.querySelector('.cs').textContent='פתח אמן';const bg=card.querySelector('.cc-bg');
 const candidates=[];const add=url=>{if(url&&!candidates.includes(url))candidates.push(url);};add(directArtistImage(a.avatar));add(a.avatar);
 let at=0;const image=document.createElement('img');image.alt=a.name;image.referrerPolicy='no-referrer';image.decoding='async';
 const tryNext=()=>{if(at<candidates.length)image.src=candidates[at++];};
 image.onload=()=>{if(image.naturalWidth>24){a.avatar=image.src;bg.replaceChildren(image);}};
 image.onerror=tryNext;tryNext();artistPortrait(a).then(url=>{add(url);if(!image.naturalWidth)tryNext();});return card;
}
// Existing circle shelves get the same first-party image route and exact-name lookup.
const circleBeforePortraits=circleArtistCard;
circleArtistCard=function(name,avatar,grad,tap){
 const card=circleBeforePortraits(name,directArtistImage(avatar),grad,tap);const bg=card.querySelector('.cc-bg');
 const current=bg?.querySelector('img');if(current)current.referrerPolicy='no-referrer';
 if(!avatar){(async()=>{try{const result=await within(pipedFetch('/search?q='+encodeURIComponent(name)+'&filter=music_artists'),12000);const found=(result.items||[]).find(x=>x.type==='channel'&&x.verified&&artistKey(x.name)===artistKey(name));if(!found)return;const url=directArtistImage(found.thumbnail);if(!url)return;const image=document.createElement('img');image.alt=name;image.referrerPolicy='no-referrer';image.onload=()=>{if(image.naturalWidth>24&&bg.isConnected)bg.replaceChildren(image);};image.src=url;}catch{}})();}
 return card;
};
