async function openPersonalArtistDomain(name){
 const artist=tasteArtists().find(a=>artistKey(a.name)===artistKey(name));if(!artist)return;
 return openMusicDomain({name:'שירים של '+name,desc:'המלצות מהאמן שאתה שומע',songs:[],artists:[artist],loadTracks:async()=>songDiscovery(await within(searchMusicCached(name),17000)).filter(t=>artistMatchesTaste(t,[artist])).slice(0,24)});
}
