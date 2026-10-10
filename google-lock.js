window.AVI_ACCOUNT_CONFIG={clientId:'238419392106-2qjigh5svc1lgjuvepe27lilgjfu79qp.apps.googleusercontent.com',worker:'https://avi-music-account-staging.avi-music.workers.dev'};
// Owner-only account gate with first-party full-page redirect.
(function(){'use strict';
 const cfg=window.AVI_ACCOUNT_CONFIG;if(!cfg?.worker)return;
 const FLOW_KEY='avi_account_redirect_v1',SESSION_KEY='avi_account_session_v1';
 const encode=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 const valid=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{43}$/.test(s);
 async function hash(s){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
 async function api(path,body){const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12000);try{const r=await fetch(cfg.worker+path,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:ctl.signal});const j=await r.json();if(!r.ok)throw Error(j.error||'redirect_failed');return j;}finally{clearTimeout(timer);}}
 window.aviStartRedirect=async()=>{const msg=document.getElementById('aviAccountMessage'),button=document.getElementById('redirectLogin');try{if(button)button.disabled=true;if(msg)msg.textContent='מכין התחברות בחלון מלא...';const verifier=encode(crypto.getRandomValues(new Uint8Array(32)));sessionStorage.setItem(FLOW_KEY,JSON.stringify({verifier,started:Date.now()}));const r=await api('/g/redirect-start',{verifierHash:await hash(verifier),returnPath:location.pathname==='/nagan-tzaf/index.html'?'/nagan-tzaf/index.html':'/nagan-tzaf/'});if(!valid(r.nonce)||r.loginUrl!==cfg.worker+'/g/redirect-login?nonce='+r.nonce)throw Error('invalid_start');sessionStorage.setItem(FLOW_KEY,JSON.stringify({verifier,nonce:r.nonce,started:Date.now()}));location.assign(r.loginUrl);}catch{sessionStorage.removeItem(FLOW_KEY);if(msg)msg.textContent='לא ניתן להתחיל התחברות כרגע. נסה שוב.';if(button)button.disabled=false;}};
 window.aviCompleteRedirect=async()=>{const p=new URLSearchParams(location.hash.slice(1));if(!p.has('avi_code')&&!p.has('avi_nonce'))return false;
 const code=p.get('avi_code'),nonce=p.get('avi_nonce');history.replaceState(null,'',location.pathname+location.search);
 let f;try{f=JSON.parse(sessionStorage.getItem(FLOW_KEY)||'null');sessionStorage.removeItem(FLOW_KEY);}catch{}
 if(!f||!valid(code)||!valid(nonce)||!valid(f.verifier)||f.nonce!==nonce||Date.now()-f.started>300000)throw Error('redirect_state');
 const r=await api('/g/redirect-exchange',{nonce,code,verifier:f.verifier});if(!valid(r.token)||typeof r.profile?.email!=='string')throw Error('invalid_session');
 localStorage.setItem(SESSION_KEY,JSON.stringify({token:r.token}));return true;
 };
})();

(function(){try{
const cfg=window.AVI_ACCOUNT_CONFIG;if(!cfg?.clientId||!cfg?.worker)return;
const SESSION_KEY='avi_account_session_v1';let token='',profile=null;
try{token=JSON.parse(localStorage.getItem(SESSION_KEY)||'null')?.token||'';}catch{}
const boot=document.getElementById('aviAccountBoot');const gate=document.createElement('div');gate.id='aviAccountGate';gate.dir='rtl';gate.innerHTML='<div class="avi-account-login"><h1>Avi Music</h1><p id="aviAccountMessage">בודק התחברות...</p><div id="aviGoogleSignIn"></div><button id="aviAccountRetry" hidden>ניסיון נוסף</button><p class="avi-account-note">גישה לנגן הראשי דרך חשבון הבעלים. הקוד והגרסאות הישנות נשארים ציבוריים. סנכרון מלא עדיין בבנייה.</p></div>';
const css=document.createElement('style');css.textContent='#aviAccountGate{position:fixed;inset:0;z-index:10000;background:var(--bg,#101014);color:var(--text,#fff);display:grid;place-items:center;padding:24px;box-sizing:border-box}.avi-account-login{max-width:420px;text-align:center}.avi-account-login h1{color:#fa2d55;font-size:36px}#aviGoogleSignIn{display:flex;justify-content:center;margin:24px 0}.avi-account-note{font-size:13px;color:#999;line-height:1.6}#redirectLogin{background:#fa2d55;color:#fff;border:0;border-radius:12px;padding:12px 20px;font:inherit;cursor:pointer}#redirectLogin:disabled{opacity:.65}#aviAccountRetry{background:#303035;border-radius:12px;padding:12px;color:white}';document.head.append(css);document.body.append(gate);if(boot)boot.remove();
const lockedElements=[...document.body.children].filter(e=>!['SCRIPT','STYLE','SVG'].includes(e.tagName)&&e!==gate).map(e=>({el:e,wasInert:e.inert}));for(const x of lockedElements)x.el.inert=true;
const message=t=>document.getElementById('aviAccountMessage').textContent=t;
async function api(path,options={}){const headers={'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...options.headers};const ctl=new AbortController(),timeout=setTimeout(()=>ctl.abort(),12000);try{const r=await fetch(cfg.worker+path,{...options,headers,credentials:'omit',signal:ctl.signal});let body;try{body=await r.json();}catch{throw Error('invalid_response');}if(!r.ok){const error=Error(body.error||'account_unavailable');error.status=r.status;throw error;}return body;}finally{clearTimeout(timeout);}}
function showAccount(p){if(typeof p?.email!=='string')throw Error('no_access');profile=p;for(const x of lockedElements)x.el.inert=x.wasInert;gate.hidden=true;gate.style.display='none';document.dispatchEvent(new CustomEvent('avi-account-ready',{detail:{profile:p}}));}
async function signIn(credential,nonce){message('מאמת התחברות...');try{const result=await api('/g/sign-in',{method:'POST',body:JSON.stringify({credential,nonce})});try{localStorage.setItem(SESSION_KEY,JSON.stringify({token:result.token}));}catch{message('לא ניתן לזכור את ההתחברות בדפדפן הזה. נסה מחוץ לגלישה פרטית.');return;}token=result.token;showAccount(result.profile);}catch(e){message(e.message==='no_access'?'אין לחשבון הזה גישה לאזור האישי.':'לא ניתן להתחבר כרגע. הנתונים לא שונו.');document.getElementById('aviAccountRetry').hidden=false;}}
async function loadGoogle(){if(window.google?.accounts?.id)return;await new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.onload=ok;s.onerror=()=>no(Error('google_unavailable'));document.head.append(s);});}
async function login(){for(const x of lockedElements)x.el.inert=true;gate.style.display='grid';gate.hidden=false;document.getElementById('aviAccountRetry').hidden=true;message('כניסה עם Google בחלון מלא');const holder=document.getElementById('aviGoogleSignIn');holder.replaceChildren();const b=document.createElement('button');b.id='redirectLogin';b.textContent='המשך לכניסה עם Google';b.onclick=window.aviStartRedirect;holder.append(b);}
async function restore(){if(!token)return login();try{const data=await api('/g/session');showAccount(data.profile);}catch(e){if(e.status===401||e.status===403){token='';try{localStorage.removeItem(SESSION_KEY);}catch{}return login();}message('לא ניתן לבדוק התחברות כרגע. נסה שוב בלי לשנות נתונים.');document.getElementById('aviAccountRetry').hidden=false;}}
document.getElementById('aviAccountRetry').onclick=restore;
window.aviAccount={api,get profile(){return profile;},async logout(){if(token){try{await api('/g/logout',{method:'POST',body:'{}'});}catch{message('לא ניתן לבטל את ההתחברות כרגע. נסה שוב.');return false;}}token='';profile=null;try{localStorage.removeItem(SESSION_KEY);}catch{}await login();return true;}};
(async()=>{try{const completed=await window.aviCompleteRedirect();if(completed)token=JSON.parse(localStorage.getItem(SESSION_KEY)).token;await restore();}catch{message('ההתחברות לא הושלמה. נסה שוב בחלון מלא.');document.getElementById('aviAccountRetry').hidden=false;}})();
}catch(e){const boot=document.getElementById('aviAccountBoot');if(boot)boot.textContent='לא ניתן לבדוק התחברות כרגע. רענן את הדף כדי לנסות שוב.';console.error('account client unavailable',{kind:e?.name});}})();


// Guarded profile integration. Not loaded by the live site yet.
(function(){
'use strict';
if(!window.AVI_ACCOUNT_CONFIG?.clientId)return;
let verified=null;
function paint(){
 const p=verified;if(!p)return;
 const page=document.getElementById('page-local-profile'),button=document.getElementById('aviProfileButton');if(!page||!button)return;
 for(const avatar of [button,page.querySelector('.profile-identity .avi-avatar')]){if(!avatar)continue;avatar.replaceChildren();if(p.picture){const img=document.createElement('img');img.src=p.picture;img.referrerPolicy='no-referrer';img.alt='';img.onerror=()=>{avatar.replaceChildren();avatar.textContent=p.name?.charAt(0)||'א';};avatar.append(img);}else avatar.textContent=p.name?.charAt(0)||'א';}
 const name=page.querySelector('#aviProfileName');if(name)name.textContent=p.name||'הפרופיל שלי';
 const sub=page.querySelector('.profile-sub');if(sub)sub.textContent=p.email;
 const editor=page.querySelector('#aviProfileEdit');if(editor){editor.hidden=true;editor.style.display='none';}
 const form=page.querySelector('.profile-edit');if(form)form.hidden=true;
 const notes=page.querySelectorAll('.profile-note');if(notes[0])notes[0].textContent='השם והתמונה מגיעים מחשבון Google שאומת. נתוני החשבון האישיים מוגנים בהתחברות.';const detail=page.querySelector('.profile-detail');if(detail)detail.textContent='נתוני החשבון האישיים מוגנים בהתחברות. ספרייה מקומית והיסטוריה מקומית במכשיר הזה אינן מסתנכרנות עדיין. הקוד והגרסאות הישנות נשארים ציבוריים.';if(notes[1])notes[1].textContent='הקוד והגרסאות הישנות נשארים ציבוריים. שמירת התחברות תלויה בדפדפן; ניקוי נתונים או גלישה פרטית עלולים לחייב כניסה מחדש.';
 if(!page.querySelector('#aviAccountLogout')){const logout=document.createElement('button');logout.id='aviAccountLogout';logout.className='profile-row';logout.textContent='יציאה מהחשבון';logout.onclick=async()=>{logout.disabled=true;try{if(await window.aviAccount.logout()){verified=null;location.reload();}}finally{logout.disabled=false;}};page.querySelector('#aviProfileLinks')?.append(logout);}
}
document.addEventListener('avi-account-ready',e=>{verified=e.detail?.profile;paint();});
document.addEventListener('click',e=>{if(e.target.closest('#aviProfileButton'))queueMicrotask(paint);});
})();

// Repair center (v197): owner-only list of reported problems, open on the right and handled on the left.
(function(){
'use strict';
if(window.aviRepairCenter)return;window.aviRepairCenter=true;
const css=document.createElement('style');
css.textContent='#aviRepairCenter{position:fixed;inset:0;z-index:2147482000;background:#f6f6f8;color:#171717;direction:rtl;font:16px/1.5 Arial,sans-serif;display:flex;flex-direction:column}#aviRepairCenter[hidden]{display:none}#aviRepairCenter header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:#fff;border-bottom:1px solid #e3e3e8}#aviRepairCenter h2{margin:0;font-size:20px}#aviRepairClose{border:0;background:#eee;border-radius:50%;width:38px;height:38px;font-size:18px;cursor:pointer}#aviRepairScroll{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;padding:14px}#aviRepairCols{display:flex;gap:12px;align-items:flex-start}.aviRepairCol{flex:1;min-width:0}.aviRepairCol h3{margin:0 0 10px;font-size:15px}.aviRepairCard{background:#fff;border-radius:14px;padding:11px 12px;margin-bottom:10px;box-shadow:0 1px 4px #0001;word-break:break-word;font-size:14px}.aviRepairCard small{display:block;color:#666;margin-top:6px}.aviRepairEta{color:#b45309;font-weight:700}.aviRepairDone{color:#15803d;font-weight:700}.aviRepairEmpty{color:#888;padding:6px 2px;font-size:14px}#aviRepairSummary{margin:18px 0 28px;padding:14px;border-radius:14px;background:#171717;color:#fff;text-align:center;font-weight:700}';
document.head.append(css);
const el=document.createElement('div');el.id='aviRepairCenter';el.hidden=true;el.setAttribute('role','dialog');el.setAttribute('aria-label','מרכז התיקונים');
const head=document.createElement('header'),title=document.createElement('h2'),close=document.createElement('button');
title.textContent='מרכז התיקונים';close.id='aviRepairClose';close.type='button';close.textContent='✕';close.setAttribute('aria-label','סגירה');head.append(title,close);
const scroll=document.createElement('div');scroll.id='aviRepairScroll';el.append(head,scroll);document.body.append(el);
close.onclick=()=>{el.hidden=true;};
const fmt=t=>{try{return new Date(t).toLocaleString('he-IL',{dateStyle:'short',timeStyle:'short'});}catch{return '';}};
function card(r,done){
 const c=document.createElement('div');c.className='aviRepairCard';
 const t=document.createElement('div');t.textContent=r.text;c.append(t);
 const s=document.createElement('small');s.textContent='דווח: '+fmt(r.created_at);c.append(s);
 const x=document.createElement('small');
 if(done){x.className='aviRepairDone';x.textContent='טופל'+(r.handled_at?' · '+fmt(r.handled_at):'');}
 else{x.className='aviRepairEta';x.textContent=r.eta?'עוד '+r.eta+' עד שיהיה מוכן':'ההערכה תתעדכן בקרוב';}
 c.append(x);return c;
}
function column(name,rows,done){
 const col=document.createElement('div');col.className='aviRepairCol';
 const h=document.createElement('h3');h.textContent=name+' ('+rows.length+')';col.append(h);
 if(!rows.length){const e=document.createElement('div');e.className='aviRepairEmpty';e.textContent=done?'עדיין אין תיקונים שטופלו.':'אין דיווחים שממתינים.';col.append(e);}
 for(const r of rows)col.append(card(r,done));return col;
}
function render(data){
 const rows=(data&&data.reports)||[];
 const open=rows.filter(r=>r.status!=='handled').sort((a,b)=>a.created_at-b.created_at);
 const done=rows.filter(r=>r.status==='handled').sort((a,b)=>(b.handled_at||b.created_at)-(a.handled_at||a.created_at));
 const cols=document.createElement('div');cols.id='aviRepairCols';cols.append(column('לא טופלו',open,false),column('טופלו',done,true));
 const sum=document.createElement('div');sum.id='aviRepairSummary';
 sum.textContent=open.length?(data.overall_eta?'הערכה כוללת: עוד '+data.overall_eta+' עד שכל התיקונים יהיו מוכנים':'ההערכה הכוללת תתעדכן בקרוב'):'כל התיקונים שדווחו טופלו';
 scroll.replaceChildren(cols,sum);
}
async function openCenter(){
 el.hidden=false;scroll.textContent='טוען...';
 try{render(await window.aviAccount.api('/g/reports?after=0'));}catch{scroll.textContent='לא ניתן לטעון את מרכז התיקונים כרגע. נסה שוב.';}
}
function addRow(){
 const links=document.getElementById('aviProfileLinks');if(!links||document.getElementById('aviRepairRow'))return;
 const b=document.createElement('button');b.id='aviRepairRow';b.type='button';b.className='profile-row';b.textContent='מרכז התיקונים';b.onclick=openCenter;
 const logout=document.getElementById('aviAccountLogout');if(logout&&logout.parentNode===links)links.insertBefore(b,logout);else links.append(b);
}
document.addEventListener('avi-account-ready',()=>setTimeout(addRow,0));
document.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('#aviProfileButton'))setTimeout(addRow,60);},true);
setTimeout(addRow,1500);
})();
