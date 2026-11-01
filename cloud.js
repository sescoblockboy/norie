/* Norie Account (Supabase) — load AFTER finance.js:  <script src="cloud.js"></script>
   Sign in with Google (or paste a sign-in code) -> tasks sync, bank-SMS inbox and Telegram reminders run on Supabase.
   It plugs into the existing cloud layer by replacing gasCall(), so the rest of the app is unchanged.
   Nothing here touches the Apps Script flow until the owner taps "Sign in" on this phone. */
(function(){
'use strict';

const SB_URL='https://medaaoiunclooqmmjrzq.supabase.co';
const SB_KEY='sb_publishable_Agv4PmjAqyrFtwYyCJTFbA_iY4ElXwv';   /* public by design — safe in the browser */
const ROOMS_URL='';        /* optional: an Apps Script URL used ONLY for live drawing rooms */
const SENT='supabase://norie';   /* stored in settings.gasUrl so hasCloud() is true everywhere */
const SK='norie.sb';

/* ---------- session ---------- */
const ld=()=>{try{return JSON.parse(localStorage.getItem(SK)||'null')}catch(_){return null}};
const sv=v=>{try{v?localStorage.setItem(SK,JSON.stringify(v)):localStorage.removeItem(SK)}catch(_){}};
let ses=ld();
const signedIn=()=>!!(ses&&ses.refresh_token);
const mk=(j,email)=>({access_token:j.access_token,refresh_token:j.refresh_token,expires_at:Math.floor(Date.now()/1000)+(+j.expires_in||3600),email:email||(j.user&&j.user.email)||(ses&&ses.email)||''});

async function raw(path,{method='GET',body,token,headers}={}){
  const h=Object.assign({apikey:SB_KEY,'Content-Type':'application/json'},headers||{});
  if(token)h.Authorization='Bearer '+token;
  const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),20000);
  try{
    const r=await fetch(SB_URL+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body),signal:ctl.signal});
    const t=await r.text();let j=null;try{j=t?JSON.parse(t):null}catch(_){}
    return{ok:r.ok,status:r.status,json:j};
  }finally{clearTimeout(to)}
}
let refreshing=null;
async function refresh(){
  if(!ses||!ses.refresh_token)throw new Error('auth');
  if(refreshing)return refreshing;
  refreshing=(async()=>{
    const r=await raw('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:ses.refresh_token}});
    if(!r.ok||!r.json||!r.json.access_token){
      if(r.status===400||r.status===401||r.status===403){ses=null;sv(null);paintAcct()}
      throw new Error('auth');
    }
    ses=mk(r.json,ses.email);sv(ses);return ses;
  })();
  try{return await refreshing}finally{refreshing=null}
}
async function tok(){
  if(!ses)throw new Error('auth');
  if(ses.expires_at*1000-Date.now()<60000)await refresh();
  return ses.access_token;
}
/* authed call with one automatic retry after a token refresh */
async function api(path,opt={}){
  let r=await raw(path,Object.assign({},opt,{token:await tok()}));
  if(r.status===401){await refresh();r=await raw(path,Object.assign({},opt,{token:ses.access_token}))}
  return r;
}
const rpc=async(name,args)=>{const r=await api('/rest/v1/rpc/'+name,{method:'POST',body:args||{}});if(!r.ok)throw new Error('rpc '+name+' '+r.status);return r.json};

/* ---------- plug into the existing cloud layer ---------- */
const _g=gasCall;
gasCall=async function(body){
  const url=(S.settings.gasUrl||'').trim();
  if(url!==SENT)return _g(body);
  if(!navigator.onLine)throw new Error('off');
  if(!signedIn())throw new Error('auth');
  switch(body&&body.action){
    case 'save':{
      const p=body.payload||{};
      const r=await rpc('norie_save',{p_state:p,p_updated:p.updatedAt||Date.now()});
      return Object.assign({},r,{cal:'Calendar sync is not on the account cloud yet — Telegram reminders work'});
    }
    case 'load':return rpc('norie_load',{p_since:body.since||0});
    case 'smspull':{
      const r=await api('/rest/v1/sms_inbox?select=id,sender,body,ts&order=created_at.asc&limit=100');
      if(!r.ok||!Array.isArray(r.json))return{status:'error'};
      const Q=window.finQParse||(t=>[{from:'',text:t,ts:0}]);
      return{status:'ok',items:r.json.map(x=>{
        const p=x.sender?{from:x.sender,text:x.body,ts:+x.ts||0}:(Q(x.body)[0]||{from:'',text:x.body,ts:0});
        return{id:x.id,from:p.from||'',text:p.text,ts:p.ts||0};
      })};
    }
    case 'smsack':{
      const ids=(body.ids||[]).filter(i=>/^[0-9a-f-]{36}$/i.test(i));
      for(let i=0;i<ids.length;i+=40){
        await api('/rest/v1/sms_inbox?id=in.('+ids.slice(i,i+40).join(',')+')',{method:'DELETE'});
      }
      return{status:'ok'};
    }
    case 'testcal':return{status:'ok',cal:'Calendar sync is not on the account cloud yet'};
    case 'room':{
      const ru=ROOMS_URL||S.settings.gasUrlOld||S.settings.gasUrlKept||'';
      if(!ru)return{status:'error',message:'drawing rooms are not available on this account yet'};
      const res=await fetch(ru,{method:'POST',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({userId:getUserKey()},body))});
      const t=await res.text();try{return JSON.parse(t)}catch(_){return{status:'ok'}}
    }
    default:return{status:'error',message:'unknown action'};
  }
};

/* ---------- sign in / out ---------- */
async function finishLogin(session,source){
  ses=session;sv(ses);
  try{const u=await raw('/auth/v1/user',{token:ses.access_token});if(u.ok&&u.json&&u.json.email){ses.email=u.json.email;sv(ses)}}catch(_){}
  let secret=null;
  try{secret=await rpc('norie_secret',{p_rotate:false})}catch(_){}
  const s=S.settings;
  if(secret)s.syncId=secret;              /* the shortcut key = the account's secret key */
  if((s.gasUrl||'').trim()&&s.gasUrl!==SENT)s.gasUrlOld=s.gasUrl;
  s.gasUrl=SENT;
  setCloudAt(0);
  save();
  render();
  flash('Signed in'+(ses.email?' as '+ses.email:''));
  try{await loadFromGas(true)}catch(_){}
  paintAcct();
}
const isStandalone=()=>{try{return navigator.standalone===true||matchMedia('(display-mode: standalone)').matches}catch(_){return false}};

function googleSignIn(){
  const back=location.origin+location.pathname;
  location.href=SB_URL+'/auth/v1/authorize?provider=google&redirect_to='+encodeURIComponent(back);
}
async function codeSignIn(code){
  code=String(code||'').trim();
  if(!code)return false;
  const r=await raw('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:code}});
  if(!r.ok||!r.json||!r.json.access_token){flash('That code didn’t work — copy it again from the signed-in page');return false}
  await finishLogin(mk(r.json),'code');return true;
}
async function signOut(){
  try{if(ses)await raw('/auth/v1/logout',{method:'POST',token:ses.access_token})}catch(_){}
  ses=null;sv(null);
  const s=S.settings;
  if(s.gasUrl===SENT)s.gasUrl=s.gasUrlOld||'';
  if(s.gasUrlKept===SENT)delete s.gasUrlKept;
  delete s.gasUrlOld;
  save();render();flash('Signed out — your tasks stay on this phone');
}

/* coming back from Google: tokens arrive in the address bar */
(function handleReturn(){
  const h=location.hash||'';
  if(!/access_token=|error_description=|error=/.test(h)&&!/[?&]error_description=/.test(location.search))return;
  const q=new URLSearchParams(h.replace(/^#/,'')||location.search.replace(/^\?/,''));
  try{history.replaceState(null,'',location.pathname)}catch(_){}
  if(q.get('error_description')||q.get('error')){setTimeout(()=>flash('Sign-in failed: '+(q.get('error_description')||q.get('error'))),400);return}
  if(q.get('access_token')&&q.get('refresh_token')){
    const s=mk({access_token:q.get('access_token'),refresh_token:q.get('refresh_token'),expires_in:q.get('expires_in')});
    /* iPhone web page in Safari: the Home Screen app has separate storage, so offer to hand the sign-in over */
    if(/iPhone|iPad|iPod/.test(navigator.userAgent)&&!isStandalone())setTimeout(()=>showHandoff(s),300);
    else setTimeout(()=>finishLogin(s,'google'),200);
  }
})();

/* ---------- screens ---------- */
function overlay(id,html){
  let o=document.getElementById(id);if(o)o.remove();
  o=document.createElement('div');o.id=id;
  o.style.cssText='position:fixed;inset:0;z-index:80;background:rgba(80,40,50,.35);display:grid;place-items:center;padding:20px';
  o.innerHTML=`<div class="glass" style="background:#fffaf3;padding:18px;width:min(400px,100%)">${html}</div>`;
  document.body.append(o);
  o.addEventListener('click',e=>{if(e.target===o)o.remove()});
  return o;
}
function openSignIn(){
  const o=overlay('sbsign',`<b style="font-size:18px">Sign in to Norie</b>
   <div class="hint" style="margin:6px 0 12px">Your tasks sync between devices, Telegram reminders keep working when the app is closed, and bank messages arrive by themselves. Only you can see your data.</div>
   <div class="btns" style="margin:0"><button class="btn main" id="sb_g" style="width:100%">Sign in with Google</button></div>
   <div class="hint" style="margin:14px 0 4px"><b>Using Norie from your Home Screen?</b> Tap <b>Sign in with Google</b> (it opens Safari), choose <b>I use the Home Screen app</b>, then come back here and tap <b>Paste &amp; sign in</b>:</div>
   <div class="btns" style="margin:8px 0 0"><button class="btn" id="sb_p" style="width:100%">Paste &amp; sign in</button></div>
   <input id="sb_c" placeholder="…or type the code here" autocomplete="off" autocapitalize="off" spellcheck="false" style="margin-top:10px">
   <div class="btns" style="margin-top:12px"><button class="btn small" id="sb_x">Cancel</button><button class="btn main small" id="sb_o">Use code</button></div>`);
  o.querySelector('#sb_p').onclick=async()=>{
    let t='';try{t=await navigator.clipboard.readText()}catch(_){flash('Paste was blocked — type or paste the code below');return}
    const ok=await codeSignIn(t);if(ok)o.remove();
  };
  o.querySelector('#sb_x').onclick=()=>o.remove();
  o.querySelector('#sb_g').onclick=googleSignIn;
  o.querySelector('#sb_o').onclick=async()=>{const ok=await codeSignIn(o.querySelector('#sb_c').value);if(ok)o.remove()};
}
function showHandoff(s){
  const o=overlay('sbhand',`<b style="font-size:18px">You’re signed in ✓</b>
   <div class="hint" style="margin:6px 0 12px">Where do you use Norie?</div>
   <div class="btns" style="margin:0 0 10px"><button class="btn main" id="sh_app" style="width:100%">I use the Home Screen app</button></div>
   <div class="hint" style="margin:0 0 12px">Copies a one-time code. Then open Norie from your Home Screen → Settings → Account → Sign in → <b>Paste &amp; sign in</b>.</div>
   <div class="btns" style="margin:0"><button class="btn" id="sh_here" style="width:100%">Use Norie here in Safari</button></div>`);
  o.onclick=null;
  o.querySelector('#sh_app').onclick=async()=>{
    try{await navigator.clipboard.writeText(s.refresh_token);o.remove();flash('Code copied — now open Norie from your Home Screen')}
    catch(_){o.querySelector('.hint').innerHTML='Copy failed. Select this code and copy it, then paste it in the Home Screen app:<div class="hl" style="word-break:break-all;font-size:12px;margin-top:8px">'+esc(s.refresh_token)+'</div>'}
    /* this tab is only a go-between: it keeps no sign-in, so it can never invalidate the app's session */
  };
  o.querySelector('#sh_here').onclick=()=>{o.remove();finishLogin(s,'google')};
}
function showCode(){
  if(!ses)return;
  const o=overlay('sbcode',`<b style="font-size:18px">Signed in ✓</b>
   <div class="hint" style="margin:6px 0 10px">Using Norie from your Home Screen? Copy this code, open the Home Screen app → Settings → Account → <b>Sign in</b>, and paste it. Keep it private.</div>
   <div class="hl" style="word-break:break-all;font-size:12px">${esc(ses.refresh_token)}</div>
   <div class="btns" style="margin-top:12px"><button class="btn small" id="sc_x">Close</button><button class="btn main small" id="sc_c">Copy sign-in code</button></div>`);
  o.querySelector('#sc_x').onclick=()=>o.remove();
  o.querySelector('#sc_c').onclick=async()=>{try{await navigator.clipboard.writeText(ses.refresh_token);flash('Code copied')}catch(_){flash('Select the code and copy it')}};
}

const _vs=vSettings;
vSettings=function(){return _vs()+acctHTML()};
function acctHTML(){
  const on=signedIn(),key=on?(S.settings.syncId||''):'';
  const badge=on?['Signed in ✓','ok']:['Signed out',''];
  return `<details class="glass setrow" id="sbacct"><summary><b class="lb">${ic('user')}Account</b><span class="stb ${badge[1]}" id="st_acct">${badge[0]}</span></summary>
  <div class="setwrap">${on?`
    <p>Signed in${ses.email?' as <b>'+esc(ses.email)+'</b>':''}. Your tasks, Finance data and Telegram settings are saved to your private account.</p>
    <div class="btns"><button class="btn danger" id="sb_out" style="width:100%">Log out</button></div>
    <details style="margin-top:10px"><summary class="hint" style="cursor:pointer">More</summary>
      <div class="hl" style="margin-top:8px">Shortcut key (for the bank-SMS shortcut): <b style="word-break:break-all">${esc(key)}</b></div>
      <div class="btns"><button class="btn small" id="sb_ck">Copy shortcut key</button><button class="btn small" id="sb_cc">Copy sign-in code</button></div>
      <div class="hint" style="margin-top:6px">Bank SMS shortcut: POST to <b style="word-break:break-all">${esc(SB_URL)}/rest/v1/rpc/sms_ingest</b> with header <b>apikey</b> = the public key and JSON <b>p_secret</b> = your shortcut key, <b>p_q</b> = the queue text.</div>
      <div class="btns"><button class="btn small danger" id="sb_wipe">Delete my cloud data</button></div>
    </details>`
  :`<p>Sign in to sync your tasks between devices, keep Telegram reminders working when the app is closed, and get bank messages automatically.</p>
    <div class="btns"><button class="btn main" id="sb_in" style="width:100%">Sign in</button></div>
    <div class="hint" style="margin-top:8px">Not signed in: everything stays only on this phone.</div>`}
  </div></details>`;
}
function paintAcct(){const b=document.getElementById('st_acct');if(b){b.textContent=signedIn()?'Signed in ✓':'Signed out';b.className='stb '+(signedIn()?'ok':'')}}

document.getElementById('app').addEventListener('click',async e=>{
  const T=e.target;
  if(T.id==='sb_in'){openSignIn();return}
  if(T.id==='sb_out'){if(confirm('Sign out on this phone? Your tasks stay here.'))await signOut();return}
  if(T.id==='sb_ck'){try{await navigator.clipboard.writeText(S.settings.syncId||'');flash('Shortcut key copied')}catch(_){flash('Copy failed')}return}
  if(T.id==='sb_cc'){showCode();return}
  if(T.id==='sb_wipe'){
    if(!confirm('Delete ALL your data from the cloud (tasks, Finance, bank messages)? This phone keeps its own copy.'))return;
    try{await rpc('norie_wipe');flash('Cloud data deleted');await signOut()}catch(_){flash('Couldn’t delete — check your internet')}
    return;
  }
});

window.NorieAccount={signedIn,open:openSignIn,signOut,SENT};
window.__sb={ses:()=>ses,codeSignIn,finishLogin};
})();
