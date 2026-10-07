// Apple Music + Google Takeout import and taste screen. Standalone and guarded: if anything here fails, the rest of the site is untouched.
(function(){try{
const TK='avi_taste_v1',MK='avi_applematch_v1';
const ld=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))||d;}catch(e){return d;}};
const sv=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}};
const norm=s=>String(s||'').toLowerCase().replace(/[\u0591-\u05C7]/g,'').replace(/\(.*?\)|\[.*?\]/g,' ').replace(/\b(feat|ft)\b\.?.*$/,' ').replace(/ - topic$/i,'').replace(/official (music )?video|official audio|lyrics?|audio|remastered( \d+)?/g,' ').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const VAR=/\b(cover|remix|karaoke|instrumental|tribute|drum|piano|guitar|slowed|reverb|sped up|nightcore|8d|live|reaction|tutorial)\b/i;
const BAD=/נחמן|nachman|\bdj set\b|\bmegamix\b|\bnonstop\b/i;
function sameSong(w,g){const wt=norm(w.title),gt=norm(g.title),wa=norm(w.artist),ga=norm(g.artist);if(!wt||!gt)return false;
 const ok=gt===wt||gt.indexOf(wt)>=0||wt.indexOf(gt)>=0;const first=wa.split(/ (?:and|&|x|,) /)[0].trim();return ok&&(!wa||ga.indexOf(first||wa)>=0)&&!(BAD.test(g.title+' '+g.artist)&&!BAD.test(w.title+' '+w.artist))&&!(g.dur>900)&&!(VAR.test(g.title)&&!VAR.test(w.title));}
async function matchTrack(t,cache){const key=norm(t.title)+'|'+norm(t.artist);if(cache[key]!==undefined)return cache[key];let found=null;
 for(const q of [t.title+' '+t.artist,t.title+' '+t.artist+' audio']){try{const r=await searchMusic(q);found=(r||[]).find(x=>sameSong(t,x))||null;}catch(e){found=null;}if(found)break;}
 cache[key]=found?{id:found.id,title:found.title,artist:String(found.artist||'').replace(/ - Topic$/i,''),dur:found.dur||0,ch:found.ch||'',album:found.album||null}:null;return cache[key];}
function parseApple(text){let j;try{j=JSON.parse(text);}catch(e){return null;}if(!j||typeof j!=='object')return null;
 const tr=a=>(Array.isArray(a)?a:[]).filter(x=>x&&x.title).map(x=>({title:String(x.title),artist:String(x.artist||'')}));
 return{playlists:(Array.isArray(j.playlists)?j.playlists:[]).map(p=>({name:String(p.name||'פלייליסט'),tracks:tr(p.tracks)})).filter(p=>p.tracks.length),library:tr(j.library),recent:tr(j.recent),artists:(Array.isArray(j.artists)?j.artists:[]).map(a=>String(a&&a.name||a)).filter(Boolean)};}
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
page.innerHTML='<div class="ascroll"><div class="stats-wrap"><button class="stats-back">חזרה לספריה</button><h1>ייבוא וטעם מוזיקלי</h1><p>ייבוא מ-Apple Music: בחר קובץ JSON עם פלייליסטים, ספרייה והאזנות אחרונות. כל שיר מותאם לאותו שיר ואותו אמן, בלי תחליפים. שיר שלא נמצא מדולג.</p><button id="aiApple">בחירת קובץ Apple Music</button><p>היסטוריית האזנה מ-Google Takeout: בחר את watch-history.json.</p><button id="aiTakeout">בחירת קובץ Takeout</button><p id="aiStatus" role="status" aria-live="polite"></p><div id="aiMiss"></div><div id="aiTaste"></div><p class="stats-note">הכול נשמר רק במכשיר הזה.</p></div></div>';
document.body.append(page);page.querySelector('.stats-back').onclick=()=>closePage(page.id);
const st=m=>{document.getElementById('aiStatus').textContent=m;};
function paintTaste(){const o=ld(TK,null),el=document.getElementById('aiTaste');if(!o||!o.total&&!Object.keys(o.artists).length){el.innerHTML='';return;}
 const ar=Object.keys(o.artists).sort((a,b)=>o.artists[b]-o.artists[a]).slice(0,10),so=Object.keys(o.songs).sort((a,b)=>o.songs[b]-o.songs[a]).slice(0,10);const pk=o.hours.indexOf(Math.max.apply(null,o.hours));
 el.innerHTML='<h2>הטעם שלך</h2><p>'+(o.total?o.total+' האזנות · ':'')+(Math.max.apply(null,o.hours)>0?'שעת שיא '+(pk<10?'0':'')+pk+':00':'')+'</p><h3>אמנים מובילים</h3>'+ar.map(a=>'<p>'+esc(a)+' · '+o.artists[a]+'</p>').join('')+(so.length?'<h3>שירים מובילים</h3>'+so.map(k=>'<p>'+esc(k.split('\u0001').join(' - '))+' · '+o.songs[k]+'</p>').join(''):'');}
document.getElementById('aiTakeout').onclick=async()=>{const t=await pick();if(!t)return;const r=parseTakeout(t);if(!r||!r.total){st('לא נמצאו האזנות מוזיקה בקובץ. ודא שזה watch-history.json.');return;}addTaste(r);st('יובאו '+r.total+' האזנות');paintTaste();};
async function applyApple(t){const btn=document.getElementById('aiApple');if(btn.disabled)return;const d=parseApple(t);
 if(!d||!(d.playlists.length||d.library.length||d.recent.length)){st('הקובץ לא בפורמט הנכון.');return;}
 btn.disabled=true;const cache=ld(MK,{}),miss=[];let done=0,ok=0;const total=d.playlists.reduce((n,p)=>n+p.tracks.length,0)+d.library.length+d.recent.length;
 const run=async list=>{const out=[];for(const x of list){const m=await matchTrack(x,cache);done++;if(m){ok++;out.push(m);}else miss.push(x.title+' - '+x.artist);st('מתאים שירים: '+done+'/'+total);if(done%20===0)sv(MK,cache);}return out;};
 try{
  for(const p of d.playlists){const tracks=await run(p.tracks);if(!tracks.length)continue;let name=String(p.name).trim().slice(0,160)||'פלייליסט',n=2;const base=name;while(Object.prototype.hasOwnProperty.call(state.playlists,name)||['__proto__','constructor','prototype'].includes(name))name=base+' ('+(n++)+')';state.playlists[name]=tracks;}
  for(const m of await run(d.library))state.fav[m.id]=m;
  const rec=await run(d.recent);const have=new Set(rec.map(x=>x.id));state.history=rec.concat(state.history.filter(x=>!have.has(x.id))).slice(0,60);
  const ar={};d.artists.forEach(n=>{ar[n]=(ar[n]||0)+10;});d.library.concat(d.recent).forEach(x=>{if(x.artist)ar[x.artist]=(ar[x.artist]||0)+1;});addTaste({total:0,artists:ar,songs:{},hours:[]});
  save();renderLibrary();st('הותאמו '+ok+' מתוך '+total+' שירים');
 }catch(e){st('הייבוא נעצר. אפשר להריץ שוב, ההתאמות נשמרו.');}
 sv(MK,cache);document.getElementById('aiMiss').innerHTML=miss.length?'<h3>לא נמצאו</h3>'+miss.slice(0,40).map(m=>'<p>'+esc(m)+'</p>').join(''):'';paintTaste();btn.disabled=false;}
document.getElementById('aiApple').onclick=async()=>{const t=await pick();if(t)await applyApple(t);};
window.aviImport={applyApple,parseApple,parseTakeout,sameSong};
const prevLib=renderLibrary;renderLibrary=function(){prevLib();try{const row=document.createElement('button');row.className='librow stats-entry';row.textContent='ייבוא וטעם מוזיקלי';row.onclick=()=>{paintTaste();openPage(page.id);};$('libRows').append(row);}catch(e){}};renderLibrary();
}catch(e){console.warn('apple-import disabled',e);}})();
