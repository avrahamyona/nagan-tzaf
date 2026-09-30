// Device-local listening seeds plus current catalog similarity, never a fixed artist group.
async function musicNeighbors(seed){
 let id=seed.ch;
 if(!/^UC[\w-]{22}$/.test(id||'')){const artist=(await within(searchChannels(seed.name),12000)).find(a=>artistKey(a.name)===artistKey(seed.name));id=artist?.id||artist?.chId;}
 if(!id)return [];
 const r=await fetch(STREAM_API_DEFAULT+'/similar-artists/'+encodeURIComponent(id),{signal:AbortSignal.timeout(12000)});if(!r.ok)return [];
 const j=await r.json();return j.source==='youtube-music-fans-might-also-like'?j.artists||[]:[];
}
async function buildPersonalMix(){
 const tastes=tasteArtists();if(!tastes.length)return {tracks:[],names:[]};
 const seed=tastes[0],neighbors=await musicNeighbors(seed);
 const known=new Set(tastes.map(a=>a.ch));const related=neighbors.sort((a,b)=>Number(known.has(b.id))-Number(known.has(a.id))).slice(0,3);
 const artists=[seed,...related.map(a=>({name:a.name,ch:a.id}))];
 const rows=await Promise.allSettled(artists.map(async a=>songDiscovery(await within(searchMusicCached(a.name),17000)).filter(t=>t.ch===a.ch||artistKey(t.artist)===artistKey(a.name)).filter(t=>setSignals(t)<2&&(!t.dur||t.dur<=600)&&!/(האלבום המלא|full album|complete album)/i.test(t.title)).slice(0,6)));
 const groups=rows.map(r=>r.status==='fulfilled'?r.value:[]);const seen=new Set,tracks=[];
 for(let i=0;i<6;i++)for(const g of groups){const t=g[i];if(t&&!seen.has(t.id)){seen.add(t.id);tracks.push(t);}}
 return {tracks,names:artists.filter((a,i)=>groups[i].length).map(a=>a.name)};
}
function addPersonalMix(){
 const box=$('listenBody');if(box.querySelector('#personalArtistMix')||!tasteArtists().length)return;
 const target=[...box.children].find(sec=>sec.querySelector('.asec-title')?.textContent.replace('›','').replace('‹','').trim()==='בחירות מובילות עבורך');if(!target)return;const body=target.querySelector('.asec-body');if(!body)return;
 const seed=tasteArtists()[0],track=state.history.find(t=>t.ch===seed.ch||artistKey(t.artist)===artistKey(seed.name));
 let busy=false;const card=heroCard({title:'המיקס שלך',kicker:'לפי ההאזנה שלך',desc:seed.name+' ואמנים דומים',grad:GRADS[0],img:track?sqThumb(track.id):'',tap:async()=>{
 if(busy)return;busy=true;toast('בונה את המיקס שלך...');try{const mix=await buildPersonalMix();if(mix.names.length<2||!mix.tracks.length)return toast('אין כרגע מספיק אמנים מתאימים למיקס');sectionTracks('המיקס שלך',mix.tracks);$('plOwner').textContent=mix.names.join(' · ');}catch{toast('המיקס לא זמין כרגע');}finally{busy=false;}
 }});card.id='personalArtistMix';body.prepend(card);
}
const listenBeforeMix=renderListen;renderListen=async function(){await listenBeforeMix();addPersonalMix();};addPersonalMix();
