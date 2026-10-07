// Google sign-in lock (device flow). OFF until GOOGLE_CLIENT_ID is set: with an empty id this script does nothing.
(function(){try{
const CFG={GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',OWNER_EMAIL:'avrahamyona10@gmail.com',WORKER:'https://avi-music-audio.avi-music.workers.dev'};
window.aviLockConfig=CFG;
if(!CFG.GOOGLE_CLIENT_ID)return;
const AK='avi_auth_v1',SCOPE='openid email profile https://www.googleapis.com/auth/youtube.readonly';
const form=o=>Object.keys(o).map(k=>encodeURIComponent(k)+'='+encodeURIComponent(o[k])).join('&');
const post=async(p,b)=>(await fetch(CFG.WORKER+'/g'+p,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form(b)})).json().catch(()=>({}));
const ld=()=>{try{return JSON.parse(localStorage.getItem(AK));}catch(e){return null;}};
const sv=a=>localStorage.setItem(AK,JSON.stringify(a));
async function token(){const a=ld();if(!a)return null;if(a.exp>Date.now())return a.access;if(!a.refresh)return null;const j=await post('/token',{client_id:CFG.GOOGLE_CLIENT_ID,client_secret:CFG.GOOGLE_CLIENT_SECRET,refresh_token:a.refresh,grant_type:'refresh_token'});if(!j.access_token){if(j.error==='invalid_grant')localStorage.removeItem(AK);return null;}sv({access:j.access_token,refresh:a.refresh,exp:Date.now()+(j.expires_in||3600)*1000-60000});return j.access_token;}
async function check(){const t=await token().catch(()=>null);if(!t)return ld()&&ld().refresh?'offline':'out';try{const r=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+t}});if(r.status===401){localStorage.removeItem(AK);return 'out';}const u=await r.json();if(u.email_verified!==false&&String(u.email||'').toLowerCase()===CFG.OWNER_EMAIL)return 'ok';localStorage.removeItem(AK);return 'denied';}catch(e){return 'offline';}}
const ov=document.createElement('div');ov.dir='rtl';ov.style.cssText='position:fixed;inset:0;z-index:99999;background:#111114;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:inherit';
const show=m=>{ov.innerHTML='<h1>Avi Music</h1><p>האפליקציה פרטית. התחבר עם חשבון Google של הבעלים.</p><button id="glBtn" style="margin-top:12px;background:#fa2d48;color:#fff;border:0;border-radius:22px;padding:10px 26px;font-weight:700">התחברות עם Google</button><div id="glCode"></div><p id="glMsg" style="color:#ff6b6b">'+(m||'')+'</p>';ov.querySelector('#glBtn').onclick=go;};
async function go(){const msg=ov.querySelector('#glMsg');msg.textContent='';try{const d=await post('/device/code',{client_id:CFG.GOOGLE_CLIENT_ID,scope:SCOPE});if(!d.device_code)throw Error('no code');
 ov.querySelector('#glCode').innerHTML='<p>פתח את הקישור והכנס את הקוד:</p><h2 dir="ltr" style="letter-spacing:4px">'+d.user_code+'</h2><a dir="ltr" style="color:#fa2d48" target="_blank" rel="noopener" href="'+d.verification_url+'">'+d.verification_url+'</a><p>ממתין לאישור...</p>';
 const end=Date.now()+(d.expires_in||600)*1000;let wait=Math.max(3,d.interval||5);
 while(Date.now()<end){await new Promise(r=>setTimeout(r,wait*1000));const j=await post('/token',{client_id:CFG.GOOGLE_CLIENT_ID,client_secret:CFG.GOOGLE_CLIENT_SECRET,device_code:d.device_code,grant_type:'urn:ietf:params:oauth:grant-type:device_code'});
  if(j.access_token){sv({access:j.access_token,refresh:j.refresh_token||'',exp:Date.now()+(j.expires_in||3600)*1000-60000});const s=await check();if(s==='ok'){ov.remove();return;}show(s==='denied'?'החשבון הזה לא מורשה.':'ההתחברות לא הושלמה.');return;}
  if(j.error==='slow_down')wait+=5;else if(j.error&&j.error!=='authorization_pending')throw Error(j.error);}
 throw Error('expired');}catch(e){show('ההתחברות נכשלה, נסה שוב.');}}
document.body.append(ov);ov.innerHTML='<p>...</p>';
check().then(s=>{if(s==='ok'||s==='offline')ov.remove();else show(s==='denied'?'החשבון הזה לא מורשה.':'');}).catch(()=>show(''));
}catch(e){console.warn('google-lock disabled',e);}})();
