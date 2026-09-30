const friendsPlaylists=[
 {name:'חברים · הכל ביחד',desc:'מזרחי, פופ וקלאסיקות ישראליות',songs:[['פאר טסי','דרך השלום'],['ישי ריבו','סיבת הסיבות'],['עומר אדם','שני משוגעים'],['משה פרץ','קרמלה'],['אריק איינשטיין','אני ואתה'],['סטטיק ובן אל','סלסולים']]},
 {name:'חברים · מזרחי כבד',desc:'זוהר ארגוב, זהבה בן ועופר לוי',songs:[['זוהר ארגוב','בדד'],['זהבה בן','טיפת מזל'],['עופר לוי','יום הרווקים']]},
 {name:'חברים · מזרחי נעים',desc:'שירים לשיר מהלב',songs:[['אייל גולן','צליל מיתר'],['ישי לוי','ריקוד רומנטי'],['משה פרץ','זיקוקים']]},
 {name:'חברים · מזרחי פופ',desc:'קצב, סלסולים ופופ',songs:[['סטטיק ובן אל','סלסולים'],['עומר אדם','שני משוגעים'],['משה פרץ','קרמלה']]},
 {name:'חברים · ים תיכוני',desc:'קלאסיקות של חפלה',songs:[['חיים משה','אהבת חיי'],['זוהר ארגוב','הפרח בגני'],['בועז שרעבי','לתת']]},
 {name:'חברים · פופ',desc:'להיטים ישראליים בקצב',songs:[['סטטיק ובן אל','כביש החוף'],['נועה קירל','פאוץ'],['עדן חסון','שמישהו יעצור אותי']]},
 {name:'חברים · אריק וקלאסיקות',desc:'אריק איינשטיין ושירים ישראליים',songs:[['אריק איינשטיין','אני ואתה'],['אריק איינשטיין','עוף גוזל'],['אריק איינשטיין','סע לאט']]}
];
const friendsRepertoire=friendsPlaylists[0];
function addFriendsPlaylist(){
 const box=$('listenBody');if(box.querySelector('#friendsPlaylistShelf'))return;
 const{sec,body}=sectionEl('שירים עם חברים','hscroll heroes');sec.id='friendsPlaylistShelf';sec.classList.add('home-featured');
 friendsPlaylists.forEach((spec,i)=>{
  let ready=null,busy=false;const card=heroCard({title:spec.name,kicker:'לשיר ביחד',desc:spec.desc,grad:GRADS[i%GRADS.length],img:'',tap:async()=>{
   if(busy)return;busy=true;toast('פותח '+spec.name+'...');try{const tracks=ready||await buildHomeVibe(spec);if(tracks.length){sectionTracks(spec.name,tracks);$('plOwner').textContent='Avi Music · מבחר לשיר ביחד';}else toast('המבחר לא זמין כרגע');}finally{busy=false;}
  }});body.appendChild(card);
  // Load a cover song only, not every playlist, until the owner opens it.
  buildHomeVibe({songs:spec.songs.slice(0,1)}).then(tracks=>{if(!tracks.length||!card.isConnected)return;const image=document.createElement('img');image.src=sqThumb(tracks[0].id);image.alt='';card.prepend(image);}).catch(()=>{});
 });box.appendChild(sec);
}
const listenBeforeFriends=renderListen;renderListen=async function(){await listenBeforeFriends();addFriendsPlaylist();};addFriendsPlaylist();
