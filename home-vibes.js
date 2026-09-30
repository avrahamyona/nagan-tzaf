// Small repertoire-led Home playlists, not a broad query mislabeled as mood.
const homeVibes=[
 {name:'מזרחי דיכאון',desc:'שירי נשמה ומזרחית כבדה',songs:[['אבי ביטר','חבר ואח'],['זהבה בן','טיפת מזל'],['שריף','ממשיכה לבד']]},
 {name:'מזרחי שמח',desc:'קצב לריקודים ולשמחה',songs:[['משה פרץ','קרמלה'],['פאר טסי','מה נשאר לך']]},
 {name:'מזרחי טורקי',desc:'ערבסק והשפעה טורקית',songs:[['זהבה בן','טיפת מזל'],['עופר לוי','יום הרווקים']]},
 {name:'ארץ ישראל',desc:'קלאסיקות של הזמר העברי',songs:[['אריק איינשטיין','אני ואתה'],['אריק איינשטיין','עטור מצחך']]}
];
const vibeTrackCache=new Map;
async function buildHomeVibe(spec){
 const results=await Promise.allSettled(spec.songs.map(async([artist,title])=>{
 const items=await within(searchMusicCached(artist+' '+title),17000);
 return items.filter(t=>normTxt(t.title).includes(normTxt(title))&&normTxt(t.title+' '+t.artist).includes(normTxt(artist))&&t.dur>=120&&t.dur<=600&&!/(רמיקס|remix|קריוקי|karaoke|mash up|קאבר|cover)/i.test(t.title)).sort((a,b)=>Number(/רשמי|official|פונוקול/i.test(b.artist))-Number(/רשמי|official|פונוקול/i.test(a.artist)))[0];
 }));
 const tracks=results.flatMap(r=>r.status==='fulfilled'&&r.value?[r.value]:[]);return tracks;
}
function addHomeVibes(){
 const box=$('listenBody');if(box.querySelector('#homeVibeShelf'))return;
 const {sec,body}=sectionEl('אווירה ומצב רוח','hscroll heroes');sec.id='homeVibeShelf';sec.classList.add('home-featured');
 for(const [i,spec]of homeVibes.entries()){
 const card=heroCard({title:spec.name,kicker:'מבחר שירים',desc:spec.desc,grad:GRADS[i%GRADS.length],img:'',tap:async()=>{
 toast('פותח את '+spec.name+'...');let tracks=vibeTrackCache.get(spec.name);
 if(!tracks){tracks=await buildHomeVibe(spec);if(tracks.length)vibeTrackCache.set(spec.name,tracks);}
 if(tracks?.length){sectionTracks(spec.name,tracks);$('plOwner').textContent='Avi Music · מבחר ראשוני';}else toast('המבחר לא זמין כרגע');
 }});body.appendChild(card);
 buildHomeVibe(spec).then(tracks=>{if(!card.isConnected||!tracks.length)return;vibeTrackCache.set(spec.name,tracks);if(card){const image=document.createElement('img');image.src=sqThumb(tracks[0].id);image.alt='';card.prepend(image);}}).catch(()=>{});
 }
 const anchor=[...box.children].find(x=>x.querySelector('h2')?.textContent.includes('הושמעו לאחרונה'));if(anchor)anchor.after(sec);else box.appendChild(sec);
}
const listenBeforeVibes=renderListen;renderListen=async function(){await listenBeforeVibes();addHomeVibes();};addHomeVibes();

const vibeStyle=document.createElement('style');vibeStyle.textContent='#homeVibeShelf .herocard{height:260px}';document.head.appendChild(vibeStyle);
$('plPlay').addEventListener('click',()=>{if(openPlKind==='section')state.shuffle=false;},true);
