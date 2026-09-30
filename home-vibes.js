// Small repertoire-led Home playlists, not a broad query mislabeled as mood.
const homeVibes=[
 {name:'מזרחי דיכאון',desc:'שירי נשמה ומזרחית כבדה',songs:[['אבי ביטר','חבר ואח'],['זהבה בן','טיפת מזל'],['שריף','ממשיכה לבד']]},
 {name:'מזרחי שמח',desc:'קצב לריקודים ולשמחה',songs:[['משה פרץ','קרמלה'],['פאר טסי','מה נשאר לך']]},
 {name:'מזרחי טורקי',desc:'ערבסק והשפעה טורקית',songs:[['זהבה בן','טיפת מזל'],['עופר לוי','יום הרווקים']]},
 {name:'פופ שמח',desc:'קצב ישראלי וצבע',songs:[['סטטיק ובן אל','סלסולים'],['נועה קירל','פאוץ'],['עומר אדם','שני משוגעים']]},
 {name:'אהבה',desc:'שירים לשניים',songs:[['אייל גולן','צליל מיתר'],['עידן רייכל','ממעמקים']]},
 {name:'שקט של ערב',desc:'שירים לנשום איתם',songs:[['שלמה ארצי','ירח'],['אריק איינשטיין','סע לאט']]},
 {name:'געגוע',desc:'זיכרונות ושירים מהלב',songs:[['אריק איינשטיין','עוף גוזל'],['שלמה ארצי','האהבה הישנה']]},
 {name:'מסיבה',desc:'לעלות את הקצב',songs:[['סטטיק ובן אל','סלסולים'],['משה פרץ','קרמלה'],['פאר טסי','דרך השלום']]},
 {name:'נסיעה',desc:'שירים לדרך',songs:[['אריק איינשטיין','סע לאט'],['פאר טסי','דרך השלום']]},
 {name:'שבת',desc:'שירים של נשמה ומנוחה',songs:[['ישי ריבו','סיבת הסיבות'],['יובל טייב','מחרוזת הבדלה']]},
 {name:'נוסטלגיה מזרחית',desc:'קלאסיקות של נשמה',songs:[['זוהר ארגוב','הפרח בגני'],['חיים משה','אהבת חיי']]},
 {name:'ארץ ישראל',desc:'קלאסיקות של הזמר העברי',songs:[['אריק איינשטיין','אני ואתה'],['אריק איינשטיין','עטור מצחך']]}
];
// Expand the short starters with already verified repertoire, keeping each mood scoped.
const moodExtras={
 'מזרחי דיכאון':[['עופר לוי','יום הרווקים'],['זוהר ארגוב','בדד'],['אייל גולן','צליל מיתר']],
 'מזרחי שמח':[['עומר אדם','שני משוגעים'],['סטטיק ובן אל','סלסולים'],['פאר טסי','דרך השלום'],['משה פרץ','זיקוקים']],
 'מזרחי טורקי':[['זוהר ארגוב','בדד'],['אבי ביטר','חבר ואח'],['שריף','ממשיכה לבד'],['עופר לוי','לא יכול בלעדיה']],
 'פופ שמח':[['סטטיק ובן אל','כביש החוף'],['עדן חסון','שמישהו יעצור אותי'],['משה פרץ','קרמלה']],
 'אהבה':[['ישי לוי','ריקוד רומנטי'],['חיים משה','אהבת חיי'],['בועז שרעבי','לתת'],['שלמה ארצי','האהבה הישנה']],
 'שקט של ערב':[['אריק איינשטיין','עטור מצחך'],['עידן רייכל','ממעמקים'],['בועז שרעבי','לתת'],['שלמה ארצי','האהבה הישנה']],
 'געגוע':[['אריק איינשטיין','עטור מצחך'],['אייל גולן','צליל מיתר'],['חיים משה','אהבת חיי'],['עידן רייכל','ממעמקים']],
 'מסיבה':[['סטטיק ובן אל','כביש החוף'],['עומר אדם','שני משוגעים'],['נועה קירל','פאוץ']],
 'נסיעה':[['סטטיק ובן אל','כביש החוף'],['אריק איינשטיין','אני ואתה'],['משה פרץ','קרמלה'],['עומר אדם','שני משוגעים']],
 'שבת':[['משה חבושה','אל בעניי'],['ציון יחזקאל','אל גליל'],['יחיאל נהרי','אל בעניי הבט'],['עופר לוי','פיוטי סליחות']],
 'נוסטלגיה מזרחית':[['זוהר ארגוב','בדד'],['זהבה בן','טיפת מזל'],['בועז שרעבי','לתת'],['עופר לוי','יום הרווקים']],
 'ארץ ישראל':[['אריק איינשטיין','עוף גוזל'],['אריק איינשטיין','סע לאט'],['שלמה ארצי','ירח'],['שלמה ארצי','האהבה הישנה']]
};
for(const spec of homeVibes)spec.songs.push(...(moodExtras[spec.name]||[]));
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
 const card=heroCard({title:spec.name,kicker:'שירים, אמנים ואלבומים',desc:spec.desc,grad:GRADS[i%GRADS.length],img:'',tap:async()=>{
 await openMusicDomain(spec);
 }});body.appendChild(card);
 buildHomeVibe({songs:spec.songs.slice(0,1)}).then(tracks=>{if(!card.isConnected||!tracks.length)return;if(card){const image=document.createElement('img');image.src=sqThumb(tracks[0].id);image.alt='';card.prepend(image);}}).catch(()=>{});
 }
 const anchor=[...box.children].find(x=>x.querySelector('h2')?.textContent.includes('הושמעו לאחרונה'));if(anchor)anchor.after(sec);else box.appendChild(sec);
}
const listenBeforeVibes=renderListen;renderListen=async function(){await listenBeforeVibes();addHomeVibes();};addHomeVibes();

const vibeStyle=document.createElement('style');vibeStyle.textContent='#homeVibeShelf .herocard{height:260px}';document.head.appendChild(vibeStyle);
$('plPlay').addEventListener('click',()=>{if(openPlKind==='section')state.shuffle=false;},true);
