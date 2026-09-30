// Explicit lyrics modes. Untimed text never gets made-up timestamps.
const lyricsModes={data:null,mode:'plain'};
function lyricMatch(x,t){
 const title=lyricKey(t.title),artist=lyricKey(t.artist),xt=lyricKey(x.trackName||x.name),xa=lyricKey(x.artistName);
 if(!title||!artist||xt!==title||!xa||xa!==artist)return false;
 // Timing is version-specific; plain lyrics can safely span recordings of the same song.
 if(x.syncedLyrics&&t.dur&&x.duration&&Math.abs(x.duration-t.dur)>8)return !!x.plainLyrics;
 return !!(x.syncedLyrics||x.plainLyrics||x.instrumental);
}
function lyricsModeUI(){
 if($('lyricsModeBar'))return;
 const bar=document.createElement('div');bar.id='lyricsModeBar';bar.className='lyrics-modebar';
 for(const [mode,label] of [['synced','מתואם'],['plain','מילים רגילות']]){
 const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.mode=mode;b.onclick=()=>chooseLyricsMode(mode);bar.appendChild(b);
 }
 const source=document.createElement('div');source.id='lyricsSource';source.className='lyrics-source';
 $('lyrBody').before(bar,source);
 const cover=document.createElement('img');cover.id='lyricsCover';cover.alt='';cover.className='lyrics-cover';document.querySelector('.lyrhead').prepend(cover);
}
function chooseLyricsMode(mode){
 const j=lyricsModes.data;if(!j)return;
 const lines=parseLRC(j.syncedLyrics||'');
 const validSync=lines.length&&(!j.duration||!current()?.dur||Math.abs(j.duration-current().dur)<=8);
 if(mode==='synced'&&!validSync)return;
 lyricsModes.mode=mode;$('lyrView').dataset.lyricsMode=mode;
 document.querySelectorAll('#lyricsModeBar button').forEach(b=>{b.disabled=b.dataset.mode==='synced'&&!validSync;b.setAttribute('aria-pressed',String(b.dataset.mode===mode));});
 $('lyrBody').scrollTop=0;
 if(mode==='synced')renderSyncedLyrics(lines);
 else renderPlainLyrics(j.plainLyrics||lines.map(l=>l.text).join('\n'));
 $('lyricsSource').textContent=(mode==='synced'?'מילים מתואמות':'גלילה עצמאית')+' · '+(j.source||'LRCLIB');
}
async function openLyrics(force=false){
 const t=current();if(!t)return;lyricsModeUI();
 const request=++lyrSync.request;clearTimeout(lyrSync.hideTimer);clearInterval(lyrSync.timer);
 lyrSync.vid=t.id;lyrSync.lines=null;lyrSync.lastCur=-1;lyrSync.manualUntil=0;lyricsModes.data=null;
 $('lyrView').classList.remove('hidden');requestAnimationFrame(()=>$('lyrView').classList.add('open'));
 $('lyrTitle').textContent=t.title;$('lyrArtist').textContent=t.artist;$('lyricsCover').src=sqThumb(t.id);
 $('lyrBg').style.backgroundImage="url('"+sqThumb(t.id)+"')";
 $('lyrBody').textContent='טוען מילים...';$('lyricsSource').textContent='';document.querySelectorAll('#lyricsModeBar button').forEach(b=>b.disabled=true);
 const j=await fetchLyrics(t,force);
 if(request!==lyrSync.request||current()?.id!==t.id||$('lyrView').classList.contains('hidden'))return;
 if(j?.instrumental){$('lyrBody').textContent='שיר אינסטרומנטלי';return;}
 if(!j||(!j.syncedLyrics&&!j.plainLyrics)){
 $('lyrBody').replaceChildren();const note=document.createElement('div');note.className='lyrnote2';note.textContent='אין מילים מאומתות לשיר הזה כרגע';
 const retry=document.createElement('button');retry.type='button';retry.textContent='נסה שוב';retry.onclick=()=>openLyrics(true);note.append(document.createElement('br'),retry);$('lyrBody').append(note);return;
 }
 lyricsModes.data=j;chooseLyricsMode(parseLRC(j.syncedLyrics||'').length&&(!j.duration||!t.dur||Math.abs(j.duration-t.dur)<=8)?'synced':'plain');
}
const lyricsStyle=document.createElement('style');lyricsStyle.textContent=`
.lyrics-cover{width:56px;height:56px;border-radius:8px;object-fit:cover;flex-shrink:0}.lyrmeta{flex:1}.lyrics-modebar{display:flex;gap:4px;margin:4px 20px 8px;padding:3px;border-radius:10px;background:rgba(128,128,128,.15)}.lyrics-modebar button{flex:1;border:0;border-radius:8px;background:none;color:inherit;padding:8px;font:inherit;font-size:13px}.lyrics-modebar button[aria-pressed=true]{background:rgba(128,128,128,.25);font-weight:700}.lyrics-modebar button:disabled{opacity:.38}.lyrics-source{font-size:11px;opacity:.65;padding:0 24px 8px;text-align:right}.lyrview[data-lyrics-mode=plain] .lyrbody{padding:12px 28px 80px}.lyrview[data-lyrics-mode=plain] .lyrline{margin:0;line-height:1.5;font-size:23px;font-weight:700;filter:none;transform:none;color:#25252a}.lyrview[data-lyrics-mode=synced] .lyrline{font-size:27px;line-height:1.6;margin:22px 0}.lyrview[data-lyrics-mode=synced] .lyrline.cur{filter:none}html.dark .lyrview[data-lyrics-mode=plain] .lyrline{color:rgba(255,255,255,.95)}@media(min-width:820px){.lyrview[data-lyrics-mode=plain] .lyrline{font-size:21px}}
`;document.head.appendChild(lyricsStyle);
$('cLyrics').addEventListener('click',e=>{e.stopImmediatePropagation();openLyrics();},true);
const lyricScrollFix=document.createElement('style');lyricScrollFix.textContent='.lyrbody{min-height:0}.lyrhead,.lyrics-modebar,.lyrics-source,.karaoke{flex-shrink:0}.lyrview[data-lyrics-mode=plain] .lyrline{overflow-wrap:anywhere}';document.head.appendChild(lyricScrollFix);
