// Category cards and singalong cards use the same artists / releases / songs view.
const categoryDomains={
 'מוזיקה עברית':{name:'מוזיקה עברית',desc:'זמר עברי וקלאסיקות ישראליות',songs:homeVibes.find(s=>s.name==='ארץ ישראל').songs},
 'מוזיקה מזרחית':{name:'מזרחית',desc:'נשמה, קלאסיקות וקצב',songs:[...homeVibes.find(s=>s.name==='נוסטלגיה מזרחית').songs,...homeVibes.find(s=>s.name==='מזרחי שמח').songs]},
 'פופ ישראלי':{name:'פופ',desc:'פופ ישראלי בקצב',songs:homeVibes.find(s=>s.name==='פופ שמח').songs},
 'מוזיקה יהודית':{name:'מוזיקה יהודית',desc:'פיוט ושירים של נשמה',songs:homeVibes.find(s=>s.name==='שבת').songs},
 'הופעות חיות':{name:'הופעות',desc:'ביצועים חיים של אמנים ישראלים',songs:[],artists:[{name:'שלמה ארצי'},{name:'אריק איינשטיין'},{name:'אייל גולן'}],loadTracks:async()=>songDiscovery(await searchMusicCached('שלמה ארצי הופעה חיה')).filter(t=>/שלמה ארצי/.test(t.title+' '+t.artist)&&/הופעה|בהופעה|live|קיסריה/i.test(t.title)).slice(0,12)},
 'שירים חדשים ישראל':{name:'מוזיקה חדשה',desc:'שירים מתוך ההוצאות החדשות של האמנים',songs:[],artists:[{name:'עומר אדם'},{name:'פאר טסי'},{name:'אייל גולן'}],recent:true,loadTracks:async()=>{const result=await Promise.allSettled([{name:'עומר אדם',ch:'UCZF1s9c5bnnzDXqH7MN_IDg'},{name:'פאר טסי',ch:'UCu1oAzWm7xC76DEZdSKxlXw'},{name:'אייל גולן',ch:'UC563QXCF2iFpPh9KugnXxUQ'}].map(async a=>{const catalog=await catalogForTaste(a);const latest=catalog.filter(r=>Number(r.releaseYear)>=new Date().getFullYear()-1).sort((a,b)=>(a.recencyRank||9999)-(b.recencyRank||9999)).slice(0,2);const r=await Promise.allSettled(latest.map(loadAlbumTracks));return r.flatMap(x=>x.status==='fulfilled'?x.value.tracks.slice(0,4):[]);}));return result.flatMap(x=>x.status==='fulfilled'?x.value:[]);}}

};
const piyyutDomainArtists=[{name:'משה חבושה'},{name:'ציון יחזקאל',ch:'UCHJEA-zPIdyjpIiUmwF7rNg'},{name:'יובל טייב',ch:'UCJ9MOj5CuA0gaehrxG5usMw'},{name:'יחיאל נהרי',ch:'UCNGMSfhi-Mh_B_Fc5hQbX-w'},{name:'עופר לוי'}];
const arabicDomainArtists=[{name:'אום כולתום',ch:'UCMi73zodlL6dMA8tyJDOClw'},{name:'מוחמד עבד אל-והאב',ch:'UCfpEX-nBOXPu0h-hDnS8Kqg'},{name:'פריד אל-אטרש',ch:'UCLlXnM1R9aMay2f-fg85EPw'},{name:'עבד אל-חלים חאפז',ch:'UC2AunJnbADpAliYHtSOrnfw'}];
arabicCategoryNames.forEach((name,k)=>categoryDomains[name]={name,desc:k?'קלאסיקות בערבית':'פיוט ומקאמים בעברית',songs:[],artists:k?arabicDomainArtists:piyyutDomainArtists,loadTracks:()=>arabicRepertoire(k)});
const domainSearchBeforeExpansion=runSearch;
runSearch=async function(q,pill){const spec=categoryDomains[q];if(!spec||searchScope==='library'||(pill&&pill!=='top'))return domainSearchBeforeExpansion(q,pill);return openMusicDomain(spec);};
// Fill each style's singalong list from the compatible, verified mood repertoire.
const friendMoodMap=['מזרחי שמח','מזרחי דיכאון','אהבה','מזרחי שמח','נוסטלגיה מזרחית','פופ שמח','ארץ ישראל'];
friendsPlaylists.forEach((spec,i)=>{const seen=new Set(spec.songs.map(x=>x.join('|')));for(const pair of homeVibes.find(s=>s.name===friendMoodMap[i]).songs){if(!seen.has(pair.join('|'))){spec.songs.push(pair);seen.add(pair.join('|'));}}});

for(const q of ['מוזיקה עברית','מוזיקה מזרחית','פופ ישראלי','מוזיקה יהודית','הופעות חיות'])categoryDomains[q].expand=true;categoryDomains['הופעות חיות'].live=true;
