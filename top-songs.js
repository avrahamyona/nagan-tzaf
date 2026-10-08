// v204: artist "top songs" built from the artist's own releases, ranked by play counts.
(function(){
const KEY='avi_top_v1_',TTL=12*3600*1000;
function plays(text){const m=String(text||'').replace(/,/g,'').match(/([\d.]+)\s*([KMB])?/i);if(!m)return 0;const n=parseFloat(m[1]);if(!Number.isFinite(n))return 0;return Math.round(n*({K:1e3,M:1e6,B:1e9}[(m[2]||'').toUpperCase()]||1));}
function titleKey(t){return String(t||'').toLowerCase().replace(/\(.*?\)|\[.*?\]/g,'').replace(/[^\p{L}\p{N}]+/gu,'');}
async function releaseTracks(a){
 const id=a.plId;if(!/^OLAK5uy_[A-Za-z0-9_-]{10,80}$/.test(id||''))return [];
 const r=await fetch(STREAM_API_DEFAULT+'/album/'+encodeURIComponent(id),{signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error('http');
 const j=await r.json();if(j.playlistId!==id||!Array.isArray(j.tracks))return [];
 return j.tracks.filter(t=>/^[A-Za-z0-9_-]{11}$/.test(t.id||'')&&t.verifiedId===id&&t.title).map(t=>({id:t.id,title:t.title,artist:a.artistName||t.artist||'',dur:0,ch:'',plays:plays(t.playCountText),album:a}));
}
async function computeTop(artist){
 const chId=artist.chId;let cached=null;try{cached=JSON.parse(localStorage.getItem(KEY+chId)||'null');}catch{}
 if(cached&&Date.now()-cached.at<TTL&&Array.isArray(cached.tracks)&&cached.tracks.length)return cached.tracks;
 const releases=(artist.catalogAlbums||[]).filter(a=>releaseKind(a)!=='live'&&/^OLAK5uy_/.test(a.plId||'')).slice(0,40);
 const all=[];let failed=0,i=0;
 async function worker(){while(i<releases.length&&failed<4){const a=releases[i++];try{all.push(...await releaseTracks(a));}catch{failed++;}}}
 await Promise.all([worker(),worker(),worker(),worker()]);
 const best=new Map();
 for(const t of all){const k=titleKey(t.title)||t.id;const o=best.get(k);if(!o||t.plays>o.plays)best.set(k,t);}
 const ranked=[...best.values()].filter(t=>t.plays>0).sort((a,b)=>b.plays-a.plays).slice(0,10).map(({plays:p,...t})=>t);
 if(ranked.length>=3&&failed<4){try{localStorage.setItem(KEY+chId,JSON.stringify({at:Date.now(),tracks:ranked}));}catch{}}
 return ranked.length>=3?ranked:[];
}
function applyTop(artist,top){
 if(aCur!==artist||!top.length)return;
 const box=$('aBody');const sec=[...box.querySelectorAll('section.asec')].find(s=>/^שירים מובילים/.test(s.querySelector('.asec-title')?.textContent||''));
 if(!sec)return;
 const body=sec.querySelector('.asec-body');body.replaceChildren();
 aSongs=top;
 top.slice(0,8).forEach((t,i)=>body.appendChild(trackRow(t,{artistLink:true,onPlay:()=>playQueue(top,i)})));
 const oldHead=sec.querySelector('.asec-title');const head=oldHead.cloneNode(true);oldHead.replaceWith(head);head.disabled=false;head.addEventListener('click',()=>openArtistSongCatalog(top));
 if(!sec.querySelector('.all-songs-btn')){const b=document.createElement('button');b.type='button';b.className='ppill all-songs-btn';b.textContent='כל השירים';b.addEventListener('click',()=>openArtistSongCatalog(top));sec.appendChild(b);}
}
const before=renderArtistBody;
renderArtistBody=function(songs,albums,videos,playlists){
 before.apply(this,arguments);
 const artist=aCur;if(!artist||!(albums||[]).length)return;
 const sec=[...$('aBody').querySelectorAll('section.asec')].find(s=>/^שירים מובילים/.test(s.querySelector('.asec-title')?.textContent||''));
 if(sec&&!sec.querySelector('.all-songs-btn')){const b=document.createElement('button');b.type='button';b.className='ppill all-songs-btn';b.textContent='כל השירים';b.addEventListener('click',()=>openArtistSongCatalog(aSongs));sec.appendChild(b);}
 computeTop(artist).then(top=>applyTop(artist,top)).catch(()=>{});
};
})();
