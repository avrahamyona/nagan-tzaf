// Cloud imports stay separate from device-local playlists. Never overwrite either.
(function(){
'use strict';
let playlists=[],generation=0;
const label='פלייליסטים מהחשבון שלך';
function safeTrack(row){
 if(row.match_status!=='matched'||!/^[-_A-Za-z0-9]{11}$/.test(row.matched_id||'')||!row.title||!row.artist)return null;
 return {id:row.matched_id,title:row.title,artist:row.artist,album:row.album||null,dur:Number(row.duration_seconds)||0,ch:''};
}
async function loadTracks(id){
 const tracks=[];let after=-1;
 for(let pages=0;pages<100;pages++){
  const result=await window.aviAccount.api('/g/playlist-items?id='+encodeURIComponent(id)+'&after='+after);
  for(const row of result.items||[]){const track=safeTrack(row);if(track)tracks.push(track);}
  if(result.next===null||result.next===undefined)return tracks;
  if(!Number.isSafeInteger(result.next)||result.next<=after)throw Error('invalid_cursor');
  after=result.next;
 }
 throw Error('too_many_pages');
}
function paint(){
 document.getElementById('aviCloudPlaylists')?.remove();
 if(!window.aviAccount?.profile||!playlists.length)return;
 const box=document.createElement('div');box.id='aviCloudPlaylists';
 const heading=document.createElement('h3');heading.textContent=label;box.append(heading);
 for(const p of playlists){
  const button=document.createElement('button');button.className='librow';button.textContent=p.name+(p.source_complete?'':' · ייבוא חלקי');
  button.onclick=async()=>{if(button.disabled)return;button.disabled=true;try{const tracks=await loadTracks(p.source_id);if(!window.aviAccount.profile)return;if(!tracks.length){toast('לא נמצאו עדיין שירים עם התאמה מדויקת בפלייליסט הזה');return;}sectionTracks(p.name+(p.source_complete?'':' · ייבוא חלקי'),tracks);}catch{toast('לא ניתן לטעון את הפלייליסט כרגע. הנתונים לא שונו.');}finally{button.disabled=false;}};
  box.append(button);
 }
 document.getElementById('libRows')?.append(box);
}
const previous=renderLibrary;renderLibrary=function(){const result=previous.apply(this,arguments);paint();return result;};
async function hydrate(){const current=++generation;try{const result=await window.aviAccount.api('/g/playlists');if(current!==generation||!window.aviAccount.profile)return;playlists=(result.playlists||[]).filter(p=>typeof p.source_id==='string'&&typeof p.name==='string');paint();}catch{}}
document.addEventListener('avi-account-ready',hydrate);
if(window.aviAccount?.profile)hydrate();
window.aviCloudLibrary={safeTrack,loadTracks};
})();
