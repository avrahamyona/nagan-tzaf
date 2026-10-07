// Apple Music + Google Takeout import and taste screen. Standalone and guarded: if anything here fails, the rest of the site is untouched.
(function(){try{
const TK='avi_taste_v1',MK='avi_applematch_v2',AK='avi_apple_source_v1',IK='avi_apple_imports_v1';
const ld=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))||d;}catch(e){return d;}};
const sv=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}};
const norm=s=>String(s||'').toLowerCase().replace(/[\u0591-\u05C7]/g,'').replace(/\(.*?\)|\[.*?\]/g,' ').replace(/\b(feat|ft)\b\.?.*$/,' ').replace(/ - topic$/i,'').replace(/official (music )?video|official audio|lyrics?|audio|remastered( \d+)?/g,' ').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const VAR=/\b(cover|remix|karaoke|instrumental|tribute|drum|piano|guitar|slowed|reverb|sped up|nightcore|8d|live|reaction|tutorial)\b/i;
const BAD=/נחמן|nachman|\bdj set\b|\bmegamix\b|\bnonstop\b/i;
function seconds(t){if(Number.isFinite(Number(t.dur))&&Number(t.dur)>0)return Number(t.dur);const a=String(t.time||'').split(':').map(Number);return a.length>1&&a.every(Number.isFinite)?a.reduce((n,v)=>n*60+v,0):0;}
function permitted(t){return !/נחמן|nachman|nahman|\bdj set\b|\bmegamix\b|\bnonstop\b/i.test(String(t.title||'')+' '+String(t.artist||''))&&seconds(t)<=900;}
function sameSong(w,g){if(!permitted(w)||!permitted(g))return false;const wt=norm(w.title),wa=norm(w.artist),ga=norm(g.artist);if(!wt||!wa||!ga)return false;
 const artistMatches=ga===wa||ga==='the '+wa;if(!artistMatches)return false;
 let gt=norm(g.title);if(gt.startsWith(wa+' '))gt=gt.slice(wa.length+1);if(gt.endsWith(' '+wa))gt=gt.slice(0,-wa.length-1);
 return gt===wt&&!(VAR.test(g.title)&&!VAR.test(w.title))&&!(VAR.test(w.title)&&!VAR.test(g.title));}
async function matchTrack(t,cache){if(!permitted(t))return null;const key=String(t.title).trim().toLowerCase()+'|'+String(t.artist).trim().toLowerCase();if(cache[key])return sameSong(t,cache[key])?cache[key]:null;let found=null;
 for(const q of [t.title+' '+t.artist,t.title+' '+t.artist+' audio']){try{const r=await searchMusic(q);found=(r||[]).find(x=>sameSong(t,x))||null;}catch(e){found=null;}if(found)break;}
 cache[key]=found?{id:found.id,title:found.title,artist:String(found.artist||'').replace(/ - Topic$/i,''),dur:found.dur||0,ch:found.ch||'',album:found.album||null}:null;return cache[key];}
function parseApple(text){let j;try{j=JSON.parse(text);}catch(e){return null;}if(!j||typeof j!=='object'||Array.isArray(j))return null;
 const tr=a=>(Array.isArray(a)?a:[]).filter(x=>x&&x.title&&x.artist).map(x=>({title:String(x.title),artist:String(x.artist),time:String(x.time||''),dur:seconds(x),favorite:x.favorite===true}));
 const library=tr(j.library),favorites=Array.isArray(j.favorites)?tr(j.favorites):library.filter(t=>t.favorite);
 return{playlists:(Array.isArray(j.playlists)?j.playlists:[]).map(p=>({name:String(p.name||'פלייליסט'),tracks:tr(p.tracks)})),library,favorites,recent:tr(j.recent),artists:(Array.isArray(j.artists)?j.artists:[]).map(a=>String(a&&a.name||a)).filter(Boolean),homeText:String(j.apple_home_snapshot?.text||''),recentText:String(j.apple_recent_view?.text||''),note:String(j.capture_note||'')};}
function addTaste(t){const o=ld(TK,{total:0,artists:{},songs:{},hours:new Array(24).fill(0)});o.total+=t.total||0;
 for(const k in t.artists||{})o.artists[k]=(o.artists[k]||0)+t.artists[k];for(const k in t.songs||{})o.songs[k]=(o.songs[k]||0)+t.songs[k];
 (t.hours||[]).forEach((v,i)=>{o.hours[i]=(o.hours[i]||0)+v;});sv(TK,o);return o;}
function parseTakeout(text){let a;try{a=JSON.parse(text);}catch(e){return null;}if(!Array.isArray(a))return null;const artists={},songs={},hours=new Array(24).fill(0);let n=0;
 for(const e of a){const sub=e.subtitles&&e.subtitles[0]?String(e.subtitles[0].name||''):'';if(!(/music/i.test(e.header||'')||/ - Topic$/i.test(sub))||!e.title||/^Watched https?:/.test(e.title))continue;
  const title=String(e.title).replace(/^Watched /,''),ar=sub.replace(/ - Topic$/i,'');if(!ar)continue;n++;artists[ar]=(artists[ar]||0)+1;const k=title+'\u0001'+ar;songs[k]=(songs[k]||0)+1;const d=new Date(e.time);if(!isNaN(d))hours[d.getHours()]++;}
 return{total:n,artists,songs,hours};}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function pick(){return new Promise(res=>{const i=document.createElement('input');i.type='file';i.accept='.json,application/json';i.onchange=()=>{const f=i.files&&i.files[0];if(!f)return res(null);const r=new FileReader();r.onload=()=>res(String(r.result||''));r.onerror=()=>res(null);r.readAsText(f);};i.click();});}
const page=document.createElement('div');page.id='page-apple-import';page.className='page';page.dir='rtl';
page.innerHTML='<div class="ascroll"><div class="stats-wrap"><button class="stats-back">חזרה לספריה</button><h1>ייבוא וטעם מוזיקלי</h1><p>ייבוא מ-Apple Music: בחר קובץ JSON עם פלייליסטים, ספרייה והאזנות אחרונות. כל שיר מותאם לאותו שיר ואותו אמן, בלי תחליפים. שיר שלא נמצא מדולג.</p><button id="aiApple">בחירת קובץ Apple Music</button><p>היסטוריית האזנה מ-Google Takeout: בחר את watch-history.json.</p><button id="aiTakeout">בחירת קובץ Takeout</button><p id="aiStatus" role="status" aria-live="polite"></p><div id="aiMiss"></div><div id="aiTaste"></div><div id="aiAppleSource"></div><p class="stats-note">הכול נשמר רק במכשיר הזה.</p></div></div>';
const importStyle=document.createElement('style');importStyle.textContent='#page-apple-import .stats-wrap{padding:24px 20px 110px;max-width:760px;margin:auto}#page-apple-import button{display:inline-block;padding:12px 16px;border-radius:12px;background:var(--card2);color:var(--text);margin:8px 0}#page-apple-import pre{line-height:1.5;overflow-wrap:anywhere}@media(min-width:820px){#page-apple-import{right:232px;width:calc(100% - 232px)}}';document.head.appendChild(importStyle);
document.body.append(page);page.querySelector('.stats-back').onclick=()=>closePage(page.id);
const st=m=>{document.getElementById('aiStatus').textContent=m;};
function paintAppleSource(){const d=ld(AK,null),el=document.getElementById('aiAppleSource');if(!d){el.innerHTML='';return;}el.innerHTML='<h2>צילום הספרייה מ-Apple Music</h2><p>זהו צילום חד-פעמי, לא סנכרון חי. המועדפים נשמרים בנפרד משאר הספרייה.</p>'+(d.homeText?'<h3>מסך הבית וההמלצות במקור</h3><pre style="white-space:pre-wrap;font:inherit">'+esc(d.homeText.slice(0,12000))+'</pre>':'')+(d.recentText?'<h3>תצוגת האזנות אחרונות במקור</h3><p>התצוגה עשויה לכלול אלבומים, פלייליסטים ותחנות. היא אינה היסטוריית שירים מלאה.</p><pre style="white-space:pre-wrap;font:inherit">'+esc(d.recentText.slice(0,8000))+'</pre>':'');}
function paintTaste(){const o=ld(TK,null),el=document.getElementById('aiTaste');if(!o||!o.total&&!Object.keys(o.artists).length){el.innerHTML='';return;}
 const ar=Object.keys(o.artists).sort((a,b)=>o.artists[b]-o.artists[a]).slice(0,10),so=Object.keys(o.songs).sort((a,b)=>o.songs[b]-o.songs[a]).slice(0,10);const pk=o.hours.indexOf(Math.max.apply(null,o.hours));
 el.innerHTML='<h2>הטעם שלך</h2><p>'+(o.total?o.total+' האזנות · ':'')+(Math.max.apply(null,o.hours)>0?'שעת שיא '+(pk<10?'0':'')+pk+':00':'')+'</p><h3>אמנים מובילים</h3>'+ar.map(a=>'<p>'+esc(a)+' · '+o.artists[a]+'</p>').join('')+(so.length?'<h3>שירים מובילים</h3>'+so.map(k=>'<p>'+esc(k.split('\u0001').join(' - '))+' · '+o.songs[k]+'</p>').join(''):'');}
document.getElementById('aiTakeout').onclick=async()=>{const t=await pick();if(!t)return;const r=parseTakeout(t);if(!r||!r.total){st('לא נמצאו האזנות מוזיקה בקובץ. ודא שזה watch-history.json.');return;}addTaste(r);st('יובאו '+r.total+' האזנות');paintTaste();};
async function applyApple(t){const btn=document.getElementById('aiApple');if(btn.disabled)return;const d=parseApple(t);
 if(!d||!(d.playlists.length||d.library.length||d.recent.length)){st('הקובץ לא בפורמט הנכון.');return;}
 const fingerprint=JSON.stringify(d),imports=ld(IK,[]);if(imports.includes(fingerprint)){st('הקובץ הזה כבר יובא במכשיר הזה.');return;}
 btn.disabled=true;const cache=ld(MK,{}),miss=[],filtered=[];let done=0,ok=0;const total=d.playlists.reduce((n,p)=>n+p.tracks.length,0)+d.library.length+d.favorites.length+d.recent.length;
 const run=async list=>{const out=[];for(const x of list){done++;if(!permitted(x)){filtered.push(x.title+' - '+x.artist);continue;}const m=await matchTrack(x,cache);if(m){ok++;out.push(m);}else miss.push(x.title+' - '+x.artist);st('מתאים שירים: '+done+'/'+total);if(done%20===0)sv(MK,cache);}return out;};
 try{
  const staged=[];for(const p of d.playlists)staged.push({name:p.name,tracks:await run(p.tracks),sourceCount:p.tracks.length});
  const library=await run(d.library),favorites=await run(d.favorites),rec=await run(d.recent);
  if(d.library.length)staged.push({name:'ספריית Apple Music',tracks:library,sourceCount:d.library.length});
  for(const p of staged){if(p.sourceCount&&!p.tracks.length)continue;let name=String(p.name).trim().slice(0,160)||'פלייליסט',n=2;const base=name;while(Object.prototype.hasOwnProperty.call(state.playlists,name)||['__proto__','constructor','prototype'].includes(name))name=base+' ('+(n++)+')';state.playlists[name]=p.tracks;}
  for(const m of favorites)state.fav[m.id]=m;
  if(rec.length){const have=new Set(rec.map(x=>x.id));state.history=rec.concat(state.history.filter(x=>!have.has(x.id))).slice(0,60);}
  const ar={};d.library.concat(d.recent).filter(permitted).forEach(x=>{ar[x.artist]=(ar[x.artist]||0)+1;});addTaste({total:0,artists:ar,songs:{},hours:[]});
  sv(AK,{homeText:d.homeText,recentText:d.recentText,note:d.note});save();renderLibrary();imports.push(fingerprint);sv(IK,imports.slice(-4));st('הותאמו '+ok+' מתוך '+total+' רשומות. '+filtered.length+' סוננו לפי ההעדפות שלך.');paintAppleSource();
 }catch(e){st('הייבוא נעצר. ההתאמות נשמרו, אפשר לנסות שוב.');}
 sv(MK,cache);document.getElementById('aiMiss').innerHTML=(miss.length?'<h3>לא נמצאו התאמות מדויקות</h3>'+[...new Set(miss)].slice(0,60).map(m=>'<p>'+esc(m)+'</p>').join(''):'')+(filtered.length?'<h3>סוננו לפי ההעדפות שלך</h3>'+[...new Set(filtered)].slice(0,40).map(m=>'<p>'+esc(m)+'</p>').join(''):'');paintTaste();btn.disabled=false;}
document.getElementById('aiApple').onclick=async()=>{const t=await pick();if(t)await applyApple(t);};
window.aviImport={applyApple,parseApple,parseTakeout,sameSong,permitted};
const prevLib=renderLibrary;renderLibrary=function(){prevLib();try{const row=document.createElement('button');row.className='librow stats-entry';row.textContent='ייבוא וטעם מוזיקלי';row.onclick=()=>{paintTaste();paintAppleSource();openPage(page.id);};$('libRows').append(row);}catch(e){}};renderLibrary();
}catch(e){console.warn('apple-import disabled',e);}})();
