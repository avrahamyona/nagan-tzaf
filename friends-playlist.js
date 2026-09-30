const friendsRepertoire={name:'שירים עם חברים',songs:[['פאר טסי','דרך השלום'],['ישי ריבו','סיבת הסיבות'],['עומר אדם','שני משוגעים'],['משה פרץ','קרמלה']]};
function addFriendsPlaylist(){
 const box=$('listenBody');if(box.querySelector('#friendsPlaylistShelf'))return;
 const{sec,body}=sectionEl('שירים עם חברים','hscroll heroes');sec.id='friendsPlaylistShelf';sec.classList.add('home-featured');
 let ready=null;const card=heroCard({title:'שירים עם חברים',kicker:'להיטים לשיר ביחד',desc:'פאר טסי, ישי ריבו, עומר אדם ומשה פרץ',grad:GRADS[2],img:'',tap:async()=>{
 toast('פותח שירים עם חברים...');const tracks=ready||await buildHomeVibe(friendsRepertoire);if(tracks.length){sectionTracks('שירים עם חברים',tracks);$('plOwner').textContent='Avi Music · להיטים לשיר ביחד';}else toast('המבחר לא זמין כרגע');
 }});body.appendChild(card);box.appendChild(sec);
 buildHomeVibe(friendsRepertoire).then(tracks=>{ready=tracks;if(!tracks.length||!card.isConnected)return;const image=document.createElement('img');image.src=sqThumb(tracks[0].id);image.alt='';card.prepend(image);}).catch(()=>{});
}
const listenBeforeFriends=renderListen;renderListen=async function(){await listenBeforeFriends();addFriendsPlaylist();};addFriendsPlaylist();
