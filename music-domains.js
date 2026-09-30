// A domain combines explicit song choices, their artists, and catalog-bound releases.
const domainAlbumChoices={
 'עומר אדם':['חלק מהנצח','חמישה לילות'], 'אייל גולן':['צליל מיתר','בלעדייך'], 'שלמה ארצי':['ירח','שניים'],
 'אריק איינשטיין':['בדשא אצל אביגדור','על גבול האור','סע לאט'],
 'עידן רייכל':['ממעמקים'], 'משה פרץ':['כל המילים','מבט אל החיים'],
 'פאר טסי':['רדיו שטח'], 'זוהר ארגוב':['נכון להיום'],
 'זהבה בן':['טיפת מזל'], 'עופר לוי':['לא יכול בלעדיה'],
 'חיים משה':['אהבת חיי'], 'סטטיק ובן אל':['שבעה ירחים','לכאורה'],
 'ישי ריבו':['שטח אפור','תוכו רצוף אהבה']
};
async function buildMusicDomain(spec){
 let tracks=await buildHomeVibe(spec);if(!tracks.length){spec.songs.forEach(([artist,title])=>searchCache.delete((artist+' '+title).trim().toLowerCase()));tracks=await buildHomeVibe(spec);}
 const names=[...new Set(spec.songs.map(x=>x[0]))];
 const results=await Promise.allSettled(names.map(async name=>{
  const aliases={"עומר אדם":"Omer Adam","נועה קירל":"Noa Kirel","שלמה ארצי":"Shlomo Artzi","אריק איינשטיין":"Arik Einstein","אייל גולן":"Eyal Golan","זהבה בן":"Zehava Ben","פאר טסי":"Peer Tasi","משה פרץ":"Moshe Peretz","עידן רייכל":"Idan Raichel","ישי ריבו":"Ishay Ribo","אבי ביטר":"Avi Bitter","זוהר ארגוב":"Zohar Argov","עופר לוי":"Ofer Levi","חיים משה":"Haim Moshe"};
  const search=await within(pipedFetch('/search?q='+encodeURIComponent(name)+'&filter=music_artists'),12000);
  const match=(search.items||[]).find(c=>c.type==='channel'&&c.verified&&[name,aliases[name]].filter(Boolean).some(n=>artistKey(c.name)===artistKey(n)));
  const id=match&&chFromUrl(match.url);if(!id)return null;
  const artist={name,ch:id,avatar:match.thumbnail||''};
  const catalog=await catalogForTaste(artist);const choices=domainAlbumChoices[name]||[];
  const releases=catalog.filter(a=>['album','short'].includes(releaseKind(a))&&choices.some(title=>normTxt(a.title)===normTxt(title)));
  return {artist,releases};
 }));
 return {tracks,artists:results.flatMap(r=>r.status==='fulfilled'&&r.value?[r.value.artist]:[]),releases:results.flatMap(r=>r.status==='fulfilled'&&r.value?r.value.releases:[])};
}
async function openMusicDomain(spec){
 const seq=++alSeq;alCur=null;alTracks=[];
 $('page-album').classList.add('release-list');$('page-album').classList.remove('from-artist');
 $('alTitle').textContent=spec.name;$('alArtist').textContent=spec.desc;$('alArtist').classList.remove('link');$('alMeta').textContent='שירים · אמנים · אלבומים ו-EP';$('alArt').src='';$('alPlay').style.display='none';$('alShuffle').style.display='none';
 const box=$('alTracks');box.innerHTML='<div class="empty"><p>טוען את המבחר...</p></div>';openPage('page-album');
 try{const data=await buildMusicDomain(spec);if(seq!==alSeq)return;box.replaceChildren();$('alArt').src=data.releases[0]?.thumb||(data.tracks[0]?sqThumb(data.tracks[0].id):'');
  if(data.artists.length){const{sec,body}=sectionEl('אמנים מומלצים בתחום','hscroll circles');data.artists.forEach((a,i)=>{const card=circleArtistCard(a.name,a.avatar,GRADS[i%GRADS.length],()=>openArtist(a.ch,a.name,a.avatar));card.querySelector('.cs').textContent='פתח אמן';const img=card.querySelector('img');if(img){img.addEventListener('error',()=>{const fallback=document.createElement('div');fallback.className='cc-ph';const initial=document.createElement('span');initial.textContent=a.name[0];fallback.appendChild(initial);img.replaceWith(fallback);});}body.appendChild(card);});box.appendChild(sec);}
  const releases=sectionEl('אלבומים ו-EP מומלצים','hscroll');data.releases.forEach(a=>{const card=albumCardEl(a);const img=card.querySelector('img');img.referrerPolicy='no-referrer';img.src=a.thumb.replace(/=w\d+-h\d+.*$/,'=s544');releases.body.appendChild(card);});if(!data.releases.length)releases.body.innerHTML='<p class="catalog-note dim">עדיין אין בחירת אלבום מאומתת בתחום הזה.</p>';box.appendChild(releases.sec);
  if(data.tracks.length){const{sec,body,heading}=sectionEl('שירים בתחום');heading.disabled=false;heading.addEventListener('click',()=>sectionTracks(spec.name,data.tracks));data.tracks.forEach((t,i)=>body.appendChild(trackRow(t,{artistLink:true,onPlay:()=>playQueue(data.tracks,i)})));box.appendChild(sec);}
  if(!data.tracks.length){const unavailable=document.createElement('p');unavailable.className='catalog-note dim';unavailable.textContent='חיפוש השירים לא זמין כרגע. האמנים והאלבומים זמינים למעלה.';box.appendChild(unavailable);}
  const note=document.createElement('p');note.className='catalog-note dim';note.textContent='מבחר פתיחה לפי האווירה. אלבומים ו-EP יחד, רק כשזהותם מופיעה בקטלוג האמן.';box.appendChild(note);
 }catch{if(seq===alSeq)box.innerHTML='<div class="empty"><p>המבחר לא זמין כרגע.</p></div>';}
}

const domainStyle=document.createElement('style');domainStyle.textContent='#alTracks .circlecard .cc-bg{border-radius:50%;overflow:hidden}#alTracks .circlecard .cc-bg img{width:100%;height:100%;object-fit:cover}';document.head.appendChild(domainStyle);
