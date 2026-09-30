function youtubePlaylistId(value){
 let url;try{url=new URL(value.trim());}catch{throw Error('הדבק קישור מלא לפלייליסט ביוטיוב');}
 if(url.protocol!=='https:'||!['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be'].includes(url.hostname.toLowerCase()))throw Error('נדרש קישור לפלייליסט ביוטיוב');
 const id=url.searchParams.get('list');if(!/^[A-Za-z0-9_-]{10,100}$/.test(id||'')||/^(RD|WL|LL)/.test(id))throw Error('נדרש פלייליסט רגיל, לא מיקס אוטומטי או רשימה פרטית');return id;
}
async function importYoutubePlaylist(link){
 const id=youtubePlaylistId(link),response=await fetch(STREAM_API_DEFAULT+'/playlist/'+encodeURIComponent(id),{signal:AbortSignal.timeout(90000)});
 if(!response.ok)throw Error('לא ניתן לקרוא את הפלייליסט. בדוק שהוא ציבורי או לא רשום; רשימה פרטית אינה זמינה.');
 const data=await response.json();if(data.playlistId!==id||data.complete!==true||!Array.isArray(data.tracks))throw Error('הייבוא לא הושלם. לא נשמרה רשימה חלקית.');
 const tracks=data.tracks.filter(t=>/^[A-Za-z0-9_-]{11}$/.test(t.id||'')&&t.title).map(t=>({id:t.id,title:String(t.title),artist:String(t.artist||''),ch:String(t.ch||''),dur:Number(t.dur)||0}));
 if(!tracks.length)throw Error('אין שירים זמינים לייבוא ברשימה הזו.');
 const base=String(data.title||'פלייליסט מיוטיוב').trim().slice(0,160)||'פלייליסט מיוטיוב';let name=base,n=2;
 while(Object.prototype.hasOwnProperty.call(state.playlists,name)||['__proto__','constructor','prototype','שירים אהובים'].includes(name))name=base+' ('+(n++)+')';
 // Commit only after a complete source response. Existing playlists are never overwritten.
 state.playlists[name]=tracks;save();renderLibrary();return{name,count:tracks.length,skipped:Number(data.skipped)||0};
}
const importPage=document.createElement('div');importPage.id='page-playlist-import';importPage.className='page';importPage.dir='rtl';
importPage.innerHTML='<div class="ascroll"><div class="stats-wrap"><button class="stats-back">חזרה לספריה</button><h1>ייבוא פלייליסט</h1><p>הדבק קישור לפלייליסט יוטיוב ציבורי או לא רשום. השירים יישמרו בספריה שלך וינוגנו בניגון ישיר, בלי גשר יוטיוב.</p><form id="playlistImportForm"><label for="playlistImportLink">קישור לפלייליסט</label><input id="playlistImportLink" type="url" placeholder="https://www.youtube.com/playlist?list=..." required dir="ltr" autocomplete="off"><button id="playlistImportSubmit" type="submit">ייבוא לספריה</button></form><p id="playlistImportStatus" role="status" aria-live="polite"></p><button id="playlistImportOpen" hidden>פתח את הפלייליסט</button><p class="stats-note">נשמר במכשיר הזה. זה עותק חד-פעמי, בלי סנכרון או שינוי ביוטיוב. סרטונים פרטיים, שנמחקו או חסומים עשויים לא להיות זמינים. מקסימום 2,000 שירים ו-20 עמודים; רשימה שחורגת לא תיובא חלקית.</p></div></div>';
document.body.append(importPage);importPage.querySelector('.stats-back').onclick=()=>closePage(importPage.id);
$('playlistImportForm').onsubmit=async event=>{event.preventDefault();if($('playlistImportSubmit').disabled)return;$('playlistImportSubmit').disabled=true;$('playlistImportOpen').hidden=true;$('playlistImportStatus').textContent='קורא את כל השירים ברשימה...';try{const result=await importYoutubePlaylist($('playlistImportLink').value);$('playlistImportStatus').textContent='נוספו '+result.count+' שירים אל "'+result.name+'"'+(result.skipped?' · '+result.skipped+' סרטונים לא זמינים הושמטו':'');$('playlistImportOpen').hidden=false;$('playlistImportOpen').onclick=()=>{closePage(importPage.id);openLocalPlaylist(result.name);};}catch(error){$('playlistImportStatus').textContent=error.name==='TimeoutError'?'המקור לא הגיב בזמן. נסה שוב; לא נשמרה רשימה חלקית.':error.message;}finally{$('playlistImportSubmit').disabled=false;}};
const libraryBeforePlaylistImport=renderLibrary;
renderLibrary=function(){libraryBeforePlaylistImport();const row=document.createElement('button');row.className='librow stats-entry';row.textContent='ייבוא פלייליסט מיוטיוב';row.onclick=()=>openPage(importPage.id);$('libRows').append(row);};renderLibrary();
const paintBadgeBeforeImport=paintEngineBadge;
paintEngineBadge=function(){paintBadgeBeforeImport();if($('engineBadge'))$('engineBadge').innerHTML=$('engineBadge').innerHTML.replace(/v\d+/g,'v147');};
if($('verChip')?.lastChild)$('verChip').lastChild.textContent='v147';paintEngineBadge();
