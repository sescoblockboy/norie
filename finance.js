/* Norie Finance plug-in — load AFTER the main script:  <script src="finance.js"></script>
   Master-card dashboard (telebirr / CBE / Awash), strict SMS import with duplicate removal,
   smart advisor (forecast, recurring payments, subscriptions) and a Settings setup card. */
(function(){
'use strict';

/*PARSE_START*/
const BANKS={
  telebirr:{n:'telebirr',s:/tele\s?birr|^\+?(?:251)?127$/i,t:/tele\s?birr|ethio\s*telecom/i},
  cbe:{n:'CBE',s:/\bcbe\b|commercial\s*bank/i,t:/\bcbe|commercial\s*bank|combanketh/i},
  awash:{n:'Awash',s:/awash/i,t:/awash/i}
};
/* any other bank = rejected, so only CBE / Awash / telebirr ever get in */
const OTHER=/dashen|abyssinia|zemen|wegagen|hibret|\bnib\b|oromia|cooperative|\bcoop\b|bunna|enat\s*bank|berhan|lion\s*bank|amhara\s*bank|siinqee|zamzam|hijra|global\s*bank|addis\s*bank|ahadu|gadaa|tsehay|shabelle|rammis|safaricom|m-?pesa/i;
const num=s=>parseFloat(String(s).replace(/,/g,''));
function bankOf(from,text){
  const fr=String(from||'').trim(),tx=String(text||'');
  for(const k in BANKS)if(BANKS[k].s.test(fr))return k;
  if(fr&&!/^\+?\d{3,}$/.test(fr)&&OTHER.test(fr))return null;
  let best=null,bi=1e9;
  for(const k in BANKS){const i=tx.search(BANKS[k].t);if(i>=0&&i<bi){bi=i;best=k}}
  if(!best)return null;
  const o=tx.search(OTHER);
  if(o>=0&&o<bi)return null;
  return best;
}
function parse(raw,from){
  const txt=String(raw||'').replace(/\s+/g,' ').trim();
  if(!txt)return null;
  const bank=bankOf(from,txt);if(!bank)return null;
  const MR=/\b(?:ETB|Birr|Br)\.?\s*([\d,]+(?:\.\d+)?)|([\d,]+\.\d{2})\s*(?:ETB|Birr)\b/gi;
  let amt=null,bal=null;
  for(const m of txt.matchAll(MR)){
    const v=num(m[1]||m[2]);if(!isFinite(v))continue;
    const before=txt.slice(Math.max(0,m.index-28),m.index).toLowerCase();
    if(/balance|\bbal\b/.test(before)){if(bal==null)bal=v}else if(amt==null)amt=v;
  }
  if(bal==null){const b=txt.match(/balance[^\d]{0,25}([\d,]+(?:\.\d+)?)/i);if(b)bal=num(b[1])}
  if(amt==null)return null;
  const IN=/credit|received|deposit|refund|cash in|salary/i,OUT=/debit|transfer|\bsent\b|paid|payment|withdraw|purchas|bought|airtime|recharge|\bbill|deduct|charge|spent/i;
  let dir=null;
  /* 1) the sentence about YOUR account: "your account ... has been debited / credited" */
  const own=txt.match(/\byour\s+(?:acc(?:oun)?t|a\/c)\b[^.]{0,70}?\b(debited|credited)\b/i);
  if(own)dir=/^debit/i.test(own[1])?'out':'in';
  /* 2) "you have received / sent / transferred / paid ..." */
  if(!dir){const y=txt.match(/\byou(?:'ve| have)?\s+(received|sent|transferred|transfered|paid|withdrawn|deposited|purchased|bought)\b/i);if(y)dir=/^(received|deposited)/i.test(y[1])?'in':'out'}
  /* 3) only one kind of word is present */
  const hasIn=IN.test(txt),hasOut=OUT.test(txt);
  if(!dir){if(hasOut&&!hasIn)dir='out';else if(hasIn&&!hasOut)dir='in'}
  /* 4) both present: the first one wins */
  if(!dir){const i=txt.search(IN),o=txt.search(OUT);if(i>=0&&(o<0||i<o))dir='in';else if(o>=0)dir='out'}
  if(!dir)return null;
  const w=txt.match(/\b(?:to|from)\s+([A-Za-z][A-Za-z0-9 .&'\-]{2,38}?)(?=\s+(?:on|at|with|ETB|Birr|Br|account|acc|Ref|Your|for|using|via)\b|[,.(]|$)/i);
  let who=w?w[1].trim():'';
  if(/^(your|the|my|a|an|account|acc)\b/i.test(who))who='';
  const r=txt.match(/(?:ref(?:erence)?(?:\s*(?:no|number|id))?|trans(?:action)?\s*(?:id|no|number)|txn\s*id|receipt\s*no)\W{0,4}([A-Z0-9]{6,})/i);
  let when=null;
  const d1=txt.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:[ ,T]+(\d{1,2}):(\d{2}))?/);
  if(d1){if(+d1[2]<=12){const dt=new Date(+d1[3],+d1[2]-1,+d1[1],+(d1[4]||12),+(d1[5]||0));if(isFinite(dt))when=dt.getTime()}}
  else{const d2=txt.match(/\b(\d{1,2})[- ]([A-Za-z]{3})[a-z]*[- ,]+(\d{4})/);
    if(d2){const mi='jan feb mar apr may jun jul aug sep oct nov dec'.split(' ').indexOf(d2[2].toLowerCase());if(mi>=0)when=new Date(+d2[3],mi,+d2[1],12,0).getTime()}}
  return{bank,dir,amt,bal,who,ref:r?r[1]:'',when,raw:txt.slice(0,400)};
}
function why(raw,from){
  const txt=String(raw||'').replace(/\s+/g,' ').trim();
  if(!bankOf(from,txt))return OTHER.test(txt)?'other bank':'no bank name or link';
  if(!/(?:ETB|Birr|Br)\.?\s*[\d,]+|[\d,]+\.\d{2}\s*(?:ETB|Birr)/i.test(txt))return 'no ETB amount';
  return 'no credit/debit wording';
}
/*PARSE_END*/

/* automatic messages are accepted ONLY when the sender is CBE, 127 (telebirr) or Awash Bank — a friend's number is always rejected */
const SENDER_OK=fr=>{fr=String(fr||'').trim();return !fr||/tele\s?birr|^\+?(?:251)?127$|cbe|commercial\s*bank|awash/i.test(fr)};

/* ===== EDIT THESE TWO LINES ONCE (then upload finance.js) =====
   NORIE_CLOUD_URL : your Apps Script Web App URL (…/exec). Every user shares it, so nobody ever sees Apps Script.
   SHORTCUT_LINK   : the iCloud link of the "Norie Bank SMS" shortcut (Shortcuts → ••• → Share → Copy iCloud Link). */
const NORIE_CLOUD_URL='';
const SHORTCUT_LINK='';
const SHORTCUT_LINK_PRIVATE='https://www.icloud.com/shortcuts/796cf2b88df641a5973b2a029c804e43';
const SHORTCUT_LINK_MAKE='https://www.icloud.com/shortcuts/f130f30c83f0476ab8bccabef351b5ed';   /* creates queue.txt once */   /* iCloud link: "Norie Bank SMS" that ONLY appends to queue.txt (no ID, no internet) */
const READ_NAME='Norie Read Queue Global';   /* exact name of the Read Queue shortcut */
const SHORTCUT_LINK_READ='https://www.icloud.com/shortcuts/f8169cda8318480f96860d342038ed58';      /* iCloud link: "Norie Read Queue" = Get File queue.txt -> Copy to Clipboard */
/* MODE: Private = nothing leaves the phone (no cloud). Auto = the shared cloud (bank SMS + Telegram while the app is closed).
   People who already have a cloud URL stay on Auto; everybody else starts on Private. */
const isAuto=()=>!!(S.settings.gasUrl||'').trim();
function setMode(m){
  const s=S.settings;
  if(m==='auto'){
    const u=(s.gasUrlKept||NORIE_CLOUD_URL||'').trim();
    if(!u){flash('Auto mode needs a cloud address — the app owner has not added one yet');return}
    s.gasUrl=u;getUserKey();
  }else{
    if((s.gasUrl||'').trim())s.gasUrlKept=s.gasUrl;
    s.gasUrl='';
  }
  save();render();
  flash(m==='auto'?'Auto mode on':'Private mode on — everything stays on this phone');
}

/* ---------- state ---------- */
const F=()=>{S.fin=(S.fin&&Array.isArray(S.fin.tx))?S.fin:{tx:[],del:{}};S.fin.del=S.fin.del||{};S.fin.subs=Array.isArray(S.fin.subs)?S.fin.subs:[];S.fin.wi=Array.isArray(S.fin.wi)?S.fin.wi:[];return S.fin};
const hsh=s=>{let h=5381;for(let i=0;i<s.length;i++)h=(h*33^s.charCodeAt(i))>>>0;return h.toString(36)};
const ETB=v=>Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const ETB0=v=>Math.round(Number(v)).toLocaleString('en-US');

/* two messages are the "same" transaction when: same bank+direction+amount AND
   (same reference) or (same balance-after) or (within 10 minutes) */
function same(p,t){
  if(t.bank!==p.bank||t.dir!==p.dir||Math.abs(t.amt-p.amt)>.005)return false;
  if(p.ref&&t.ref)return p.ref===t.ref;
  if(p.bal!=null&&t.bal!=null)return Math.abs(p.bal-t.bal)<.005;
  return Math.abs(t.ts-p.ts)<10*60000;
}
function fixDir(p,list){
  if(p.bal==null)return;
  let prev=null;
  for(const t of list){if(t.bank===p.bank&&t.bal!=null&&t.ts<p.ts&&t.id!==p.id&&(!prev||t.ts>prev.ts))prev=t}
  if(!prev)return;
  const d=p.bal-prev.bal;
  if(Math.abs(d-p.amt)<=0.011)p.dir='in';
  else if(d<0&&-d>=p.amt-0.011&&-d<=p.amt*1.1+10)p.dir='out';
}
function repairAll(){
  const f=F();let n=0;
  f.tx.forEach(t=>{const q=t.raw?parse(t.raw,BANKS[t.bank]?BANKS[t.bank].n:''):null;if(q&&q.bank===t.bank&&q.dir!==t.dir){t.dir=q.dir;n++}});
  f.tx.slice().sort((a,b)=>a.ts-b.ts).forEach(t=>{const d=t.dir;fixDir(t,f.tx);if(t.dir!==d)n++});
  if(n)save();
  return n;
}
function ingest(items){
  const f=F(),have=new Set(f.tx.map(t=>t.id));let added=0,dup=0,bad=0,reason='';
  for(const it of items||[]){
    const p=parse(it.text,it.from);if(!p){bad++;if(!reason)reason=why(it.text,it.from);continue}
    p.id='f'+hsh(p.bank+'|'+String(it.text).replace(/\s+/g,' ').trim());
    p.ts=+it.ts||p.when||Date.now();delete p.when;
    if(have.has(p.id)||f.del[p.id]||f.tx.some(t=>same(p,t))){dup++;continue}
    fixDir(p,f.tx);
    f.tx.push(p);have.add(p.id);added++;
  }
  if(added){f.tx.sort((a,b)=>b.ts-a.ts);if(f.tx.length>2000)f.tx.length=2000;save()}
  return{added,dup,bad,reason};
}
function dedupeAll(){
  const f=F(),keep=[],now=Date.now();let n=0;
  f.tx.slice().sort((a,b)=>a.ts-b.ts).forEach(t=>{
    if(keep.some(k=>same(t,k))){f.del[t.id]=now;n++}else keep.push(t);
  });
  if(n){f.tx=keep.sort((a,b)=>b.ts-a.ts);save()}
  return n;
}

/* ---------- merge across devices ---------- */
const _ms=mergeStates;
mergeStates=function(a,b){
  const o=_ms(a,b),fa=a.fin||{},fb=b.fin||{},del=Object.assign({},fb.del||{},fa.del||{}),m=new Map(),lim=Date.now()-60*864e5;
  for(const id in del)if(del[id]<lim)delete del[id];
  [...(fb.tx||[]),...(fa.tx||[])].forEach(t=>{if(!del[t.id])m.set(t.id,t)});
  const sm=new Map();
  [...(fb.subs||[]),...(fa.subs||[])].forEach(x=>{if(del[x.id])return;const old=sm.get(x.id);if(!old||(x.u||0)>=(old.u||0))sm.set(x.id,x)});
  o.fin={tx:[...m.values()].sort((x,y)=>y.ts-x.ts),del,subs:[...sm.values()].sort((x,y)=>x.id<y.id?-1:1)};
  {const wm=new Map();[...(fb.wi||[]),...(fa.wi||[])].forEach(x=>{if(!del[x.id])wm.set(x.id,x)});o.fin.wi=[...wm.values()]}
  {const pa=fa.plan,pb=fb.plan,pl=(pa&&(!pb||(pa.u||0)>=(pb.u||0)))?pa:pb;if(pl&&pl.end>Date.now()||pl&&pl.cleared)o.fin.plan=pl}
  return o;
};

/* ---------- helpers ---------- */
let mode='home'; /* home | banks | advice | telebirr | cbe | awash */
let dirF='all';  /* all | in | out (inside a bank) */
let lastRec=[];
let hide=true,hideT=null;
const DOTS='\u2022\u2022\u2022\u2022\u2022\u2022';
const M=x=>hide?DOTS:x;
const MT=x=>hide?String(x).replace(/ETB\s?[\d,]+(?:\.\d+)?/g,'ETB \u2022\u2022\u2022'):x;

/* ---------- Face ID gate (WebAuthn platform authenticator = Face ID / Touch ID / passcode on the phone) ---------- */
const LK='petal.finkey';
const b64=u=>btoa(String.fromCharCode(...new Uint8Array(u)));
const unb=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function faceUnlock(){
  if(!window.PublicKeyCredential||!navigator.credentials||!window.crypto)throw new Error('unsupported');
  const ch=crypto.getRandomValues(new Uint8Array(32));let id=null;
  try{id=localStorage.getItem(LK)}catch(_){}
  if(id){
    await navigator.credentials.get({publicKey:{challenge:ch,allowCredentials:[{type:'public-key',id:unb(id),transports:['internal']}],userVerification:'required',timeout:60000}});
  }else{
    const c=await navigator.credentials.create({publicKey:{challenge:ch,rp:{name:'Norie'},user:{id:crypto.getRandomValues(new Uint8Array(16)),name:'norie',displayName:'Norie'},
      pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],authenticatorSelection:{authenticatorAttachment:'platform',userVerification:'required'},timeout:60000,attestation:'none'}});
    try{localStorage.setItem(LK,b64(c.rawId))}catch(_){}
  }
}
function lockNow(){hide=true;clearTimeout(hideT)}
async function toggleHide(){
  if(!hide){lockNow();render();return}
  try{
    await faceUnlock();hide=false;render();
    clearTimeout(hideT);hideT=setTimeout(()=>{lockNow();if(tab==='finance')render()},120000);
  }catch(e){
    flash(e&&e.message==='unsupported'?'Face ID isn’t available here — open Norie from your Home Screen icon':'Face ID cancelled — amounts stay hidden');
  }
}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&!hide){lockNow();if(tab==='finance')render()}});
Object.assign(ICONS,{arrowUp:_p('M12 19V5','m5 12 7-7 7 7'),arrowDown:_p('M12 5v14','m19 12-7 7-7-7'),chevL:_p('m15 18-6-6 6-6'),eyeOff:_p('M9.88 9.88a3 3 0 1 0 4.24 4.24','M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68','M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61','M2 2l20 20')});
if(!ICONS.eye)ICONS.eye=_p('M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z')+'<circle cx="12" cy="12" r="3"/>';
const mstart=()=>{const d=new Date();d.setDate(1);d.setHours(0,0,0,0);return d.getTime()};
function stats(list){const m=mstart();let i=0,o=0;list.forEach(t=>{if(t.ts>=m){t.dir==='in'?i+=t.amt:o+=t.amt}});return{i,o}}
const latestBal=l=>{const t=l.find(x=>x.bal!=null);return t?t.bal:null};
function banksBal(){
  const f=F(),per={};let tot=0,n=0;
  for(const k in BANKS){const b=latestBal(f.tx.filter(t=>t.bank===k));per[k]=b;if(b!=null){tot+=b;n++}}
  return{tot,n,per};
}
const eyeBtn=()=>`<button class="feye dk" data-feye aria-label="Show or hide amounts">${ic(hide?'eyeOff':'eye',18)}</button>`;
const backBtn=(to,label)=>`<div class="ftop"><button class="fback" data-fgo="${to}">${ic('chevL',16)}${label}</button>${eyeBtn()}</div>`;

/* ---------- rows ---------- */
function rowF(t){
  return `<div class="frow" data-ftx="${t.id}"><div class="fic ${t.dir}">${ic(t.dir==='in'?'arrowDown':'arrowUp',16)}</div>
  <div class="fm"><div class="ft">${esc(t.who||(t.dir==='in'?'Money in':'Money out'))}</div><div class="fs">${fmtT(t.ts)}${t.bal!=null?' · Bal '+M(ETB(t.bal)):''}</div></div>
  <div class="fa ${t.dir==='in'?'pos':'neg'}">${M((t.dir==='in'?'+':'−')+ETB(t.amt))}</div></div>`;
}
function listHTML(list){
  if(!list.length)return`<div class="empty glass">${ic('dollar',24)}<div style="margin-top:6px">No transactions here.</div></div>`;
  const g=new Map();list.slice(0,200).forEach(t=>{const k=sod(t.ts);if(!g.has(k))g.set(k,[]);g.get(k).push(t)});
  return [...g].map(([k,a])=>`<h2>${dayLabel(k)}</h2><div class="card glass">${a.map(rowF).join('')}</div>`).join('');
}
function cardsHTML(){
  const f=F();
  return Object.keys(BANKS).map(k=>{
    const l=f.tx.filter(t=>t.bank===k),s=stats(l),b=latestBal(l);
    return `<div class="fcard glass" data-fgo="${k}"><div class="fbadge b-${k}">${esc(BANKS[k].n[0].toUpperCase())}</div>
    <div class="fci"><div class="fcn">${BANKS[k].n}</div><div class="fcs">${l.length} transaction${l.length===1?'':'s'}${l[0]?' · last '+dayLabel(l[0].ts):''}</div>
    <div class="fcm"><span class="pos">${M('+'+ETB(s.i))}</span><span class="neg">${M('−'+ETB(s.o))}</span><i>this month</i></div></div>
    <div class="fcb"><small>Balance</small><b>${b==null?'—':M(ETB(b))}</b></div></div>`;
  }).join('');
}

/* ---------- subscriptions ---------- */
const PER={week:['Weekly',52/12],month:['Monthly',1],year:['Yearly',1/12]};
const perMo=s=>s.amt*(PER[s.per]||PER.month)[1];
let selSub=null;
function subCardHTML(income){
  const subs=F().subs,m=subs.reduce((a,s)=>a+perMo(s),0);
  const sel=selSub?subs.find(x=>x.id===selSub):null;if(selSub&&!sel)selSub=null;
  const head=`<div class="fsh"><b class="lb">${ic('repeat',16)}Subscriptions</b><button class="chip on" data-fsubadd>+ Add</button></div>`;
  if(!subs.length)return `<div class="fsub glass">${head}<p class="fcap" style="margin:6px 2px 2px">Add what you pay for regularly and see the cost over 1 month, 6 months and a year.</p></div>`;
  const v=sel?perMo(sel):m,pct=income>0?Math.round(v/income*100):null,share=m>0?Math.round(perMo(sel||{amt:0,per:'month'})/m*100):0;
  const who=sel?`<div class="fsel"><div><small>Showing only</small><b>${esc(sel.name)}</b></div><div class="fselb"><button class="chip" data-fsubedit>Edit</button><button class="chip on" data-fsuball>Show all</button></div></div>`:'';
  const cap=sel
    ?`<p class="fcap" style="margin:8px 2px 4px">${PER[sel.per][0]} bill of ${M('ETB '+ETB(sel.amt))}${sel.per==='month'?'':' ≈ '+M(ETB(v))+' / month'}. ${subs.length>1?`It is <b>${share}%</b> of all your subscriptions`:''}${pct!=null?`${subs.length>1?' and ':'It is '}<b class="neg">${pct}%</b> of your average monthly income`:''}.</p>`
    :(pct!=null?`<p class="fcap" style="margin:8px 2px 4px">About <b class="neg">${pct}%</b> of your average monthly income. <span style="opacity:.8">Tap a subscription to see just that one.</span></p>`:`<p class="fcap" style="margin:8px 2px 4px">Tap a subscription to see just that one.</p>`);
  return `<div class="fsub glass">${head}${who}
  <div class="fsbig"><b class="neg">${M('−'+ETB(v))}</b><small>ETB every month${sel?' · '+esc(sel.name):' · all'}</small></div>
  <div class="fspr"><div><small>1 month</small><b>${M(ETB0(v))}</b></div><div><small>6 months</small><b>${M(ETB0(v*6))}</b></div><div><small>1 year</small><b>${M(ETB0(v*12))}</b></div></div>
  ${cap}
  <div class="fsl">${subs.slice().sort((a,b)=>perMo(b)-perMo(a)).map(s=>`<div class="fsr${s.id===selSub?' sel':''}" data-fsub="${s.id}"><div class="fm"><div class="ft">${esc(s.name)}</div><div class="fs">${PER[s.per][0]}${s.per==='month'?'':' · '+M(ETB(perMo(s)))+' / mo'}</div></div><div class="fa neg">${M('−'+ETB(s.amt))}</div></div>`).join('')}</div></div>`;
}
function finSubAsk(sub){
  let o=document.getElementById('finsub');if(o)o.remove();
  o=document.createElement('div');o.id='finsub';
  o.style.cssText='position:fixed;inset:0;z-index:70;background:rgba(80,40,50,.35);display:grid;place-items:center;padding:20px';
  o.innerHTML=`<div class="glass" style="background:#fffaf3;padding:18px;width:min(380px,100%)"><b style="font-size:18px">${sub?'Edit subscription':'New subscription'}</b>
  <label>Name</label><input id="fs_n" value="${esc(sub?sub.name:'')}" placeholder="e.g. Netflix, Spotify, gym" autocomplete="off">
  <label>Amount (ETB)</label><input id="fs_a" value="${sub?sub.amt:''}" inputmode="decimal" placeholder="0.00" autocomplete="off">
  <label>Billed</label><select id="fs_p">${Object.keys(PER).map(k=>`<option value="${k}" ${(sub?sub.per:'month')===k?'selected':''}>${PER[k][0]}</option>`).join('')}</select>
  <div class="btns" style="margin-top:14px"><button class="btn small" id="fs_c">Cancel</button>${sub?'<button class="btn danger small" id="fs_d">Delete</button>':''}<button class="btn main small" id="fs_o">Save</button></div></div>`;
  document.body.append(o);
  o.querySelector('#fs_c').onclick=()=>o.remove();
  const d=o.querySelector('#fs_d');
  if(d)d.onclick=()=>{const f=F();f.del[sub.id]=Date.now();f.subs=f.subs.filter(x=>x.id!==sub.id);save();o.remove();render()};
  o.querySelector('#fs_o').onclick=()=>{
    const name=o.querySelector('#fs_n').value.trim(),amt=parseFloat(o.querySelector('#fs_a').value.replace(/,/g,''));
    if(!name){o.querySelector('#fs_n').focus();return}
    if(!isFinite(amt)||amt<=0){o.querySelector('#fs_a').focus();return}
    const f=F(),per=o.querySelector('#fs_p').value;
    if(sub){Object.assign(sub,{name:name.slice(0,40),amt,per,u:Date.now()})}
    else f.subs.push({id:'s'+uid(),name:name.slice(0,40),amt,per,u:Date.now()});
    save();o.remove();render();
  };
  setTimeout(()=>o.querySelector('#fs_n').focus(),60);
}

/* ---------- smart advisor (all numbers are estimates from your SMS history) ---------- */
const MED=a=>{const s=a.slice().sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2};
const norm=w=>String(w||'').toLowerCase().replace(/[^a-z]+/g,' ').trim();
function detectRec(f){
  const t0=sod(Date.now()),g=new Map();
  f.tx.filter(t=>t.dir==='out'&&t.who&&t.ts>=t0-130*DAY).forEach(t=>{const k=norm(t.who);if(k.length<3)return;(g.get(k)||g.set(k,[]).get(k)).push(t)});
  const have=f.subs.map(s=>norm(s.name)),out=[];
  g.forEach((a,k)=>{
    if(a.length<2||have.some(h=>h&&(h.includes(k)||k.includes(h))))return;
    a.sort((x,y)=>x.ts-y.ts);
    const m=MED(a.map(x=>x.amt));if(a.some(x=>Math.abs(x.amt-m)>m*.2))return;
    const gaps=[];for(let i=1;i<a.length;i++)gaps.push((a[i].ts-a[i-1].ts)/DAY);
    const gap=MED(gaps),per=gap>=5&&gap<=9?'week':gap>=25&&gap<=36?'month':null;
    if(!per)return;
    const last=a[a.length-1];
    out.push({name:a[0].who,amt:m,per,last:last.ts,next:last.ts+(per==='week'?7:30)*DAY,n:a.length});
  });
  return out.sort((x,y)=>perMo(y)-perMo(x)).slice(0,6);
}
function advise(){
  const f=F(),now=Date.now(),t0=sod(now),B=banksBal(),d=new Date();
  const dim=new Date(d.getFullYear(),d.getMonth()+1,0).getDate(),left=dim-d.getDate();
  const ms=mstart(),pms=new Date(d.getFullYear(),d.getMonth()-1,1).getTime();
  const sum=(l,dir)=>l.filter(t=>t.dir===dir).reduce((a,t)=>a+t.amt,0);
  const first=f.tx.length?f.tx[f.tx.length-1].ts:now;
  const span=Math.max(1,Math.ceil((t0+DAY-sod(first))/DAY));
  const win=Math.min(30,span),l30=f.tx.filter(t=>t.ts>=t0+DAY-win*DAY);
  const dailyOut=sum(l30,'out')/win;
  const cur=f.tx.filter(t=>t.ts>=ms),spent=sum(cur,'out'),got=sum(cur,'in');
  const projSpend=spent+dailyOut*left;
  const w90=Math.min(90,span),l90=f.tx.filter(t=>t.ts>=t0+DAY-w90*DAY);
  const mIn=sum(l90,'in')/(w90/30),mOut=sum(l90,'out')/(w90/30);
  const save_=mIn>0?(mIn-mOut)/mIn:null;
  const prevSpent=sum(f.tx.filter(t=>t.ts>=pms&&t.ts<pms+d.getDate()*DAY),'out');
  const chg=(first<=pms+3*DAY&&prevSpent>0)?(spent-prevSpent)/prevSpent:null;
  const runway=B.n&&dailyOut>0?B.tot/dailyOut:null;
  const endBal=B.n?B.tot-dailyOut*left:null;
  const sm=f.subs.reduce((a,s)=>a+perMo(s),0),subPct=mIn>0?sm/mIn:null;
  const rec=detectRec(f);lastRec=rec;
  const pay=new Map();cur.filter(t=>t.dir==='out').forEach(t=>{const k=t.who||'Other';pay.set(k,(pay.get(k)||0)+t.amt)});
  const top=[...pay].sort((a,b)=>b[1]-a[1]).slice(0,3);
  const enough=f.tx.length>=5&&span>=7;
  const tips=[];
  if(!enough)tips.push(['info','Not much history yet — import more SMS (a few weeks) and these forecasts get a lot more accurate.']);
  else{
    if(runway!=null){
      if(runway<10)tips.push(['warn',`At your recent pace your balance lasts about ${Math.floor(runway)} days. Cut non-essential spending until your next income.`]);
      else if(runway<30)tips.push(['info',`Your balance covers roughly ${Math.floor(runway)} days at the current pace — fine, but keep an eye on it.`]);
      else tips.push(['good',`Your balance covers about ${Math.floor(runway)} days of spending. Comfortable cushion.`]);
    }
    if(save_!=null){
      if(save_<0)tips.push(['warn',`You are spending more than you receive (about ETB ${ETB0(mOut-mIn)} more per month). That drains your balance.`]);
      else if(save_<.1)tips.push(['info',`You keep only ~${Math.round(save_*100)}% of what comes in. Aim for 10–20% — even a small fixed amount set aside on payday helps.`]);
      else tips.push(['good',`You keep ~${Math.round(save_*100)}% of your income. Move part of it somewhere you won’t spend it.`]);
    }
    if(chg!=null&&chg>.2)tips.push(['warn',`Spending is up ${Math.round(chg*100)}% compared with the same point last month.`]);
    else if(chg!=null&&chg<-.1)tips.push(['good',`Spending is down ${Math.round(-chg*100)}% compared with the same point last month. Nice.`]);
    if(top.length&&spent>0&&top[0][1]/spent>.35&&top[0][0]!=='Other')tips.push(['info',`${Math.round(top[0][1]/spent*100)}% of this month’s spending went to ${top[0][0]}.`]);
  }
  if(f.subs.length){
    const big=f.subs.slice().sort((a,b)=>perMo(b)-perMo(a))[0];
    if(subPct!=null&&subPct>.15)tips.push(['warn',`Subscriptions take ~${Math.round(subPct*100)}% of your income. Review them — cancel what you haven’t used this month.`]);
    else if(subPct!=null&&subPct>.08)tips.push(['info',`Subscriptions take ~${Math.round(subPct*100)}% of your income. Worth a quick review.`]);
    tips.push(['info',`Biggest subscription: ${big.name} — ETB ${ETB0(perMo(big)*12)} a year. Is it still worth it?`]);
  }
  if(rec.length)tips.push(['info',`${rec.length} payment${rec.length>1?'s look':' looks'} recurring but ${rec.length>1?'aren’t':'isn’t'} in your subscriptions — see “Looks recurring” below.`]);
  return{B,dailyOut,spent,got,projSpend,runway,endBal,mIn,mOut,sm,rec,top,tips,left,subPct,enough};
}

/* ---------- 60 / 40 plan: 60% to spend (daily budget), 40% locked as backup ---------- */
const PLAN_DAYS=30;
const planEnd=()=>Date.now()+PLAN_DAYS*DAY;
function planInfo(A){
  const f=F(),B=A.B,now=Date.now(),t0=sod(now);
  let p=f.plan&&f.plan.end>now?f.plan:null;
  const end=p?p.end:planEnd();
  const base=p?p.total:(B.n?B.tot:null);
  if(base==null||!(base>0))return null;
  const wiList=F().wi,wi=wiList.reduce((a,x)=>a+x.amt,0),total=base+wi;
  const start=p?p.start:now,spendable=total*.6,reserve=total*.4;
  const out=(from)=>f.tx.filter(t=>t.dir==='out'&&t.ts>=from).reduce((a,t)=>a+t.amt,0);
  const remaining=Math.max(0,spendable-(p?out(start):0));
  const daysLeft=Math.max(1,Math.ceil((end-now)/DAY));
  const spentToday=out(Math.max(t0,start));
  const allow=(remaining+spentToday)/daysLeft;
  const lasts=A.dailyOut>0?remaining/A.dailyOut:null;
  return{saved:!!p,at:p?p.start:null,total,base,wi,wiList,spendable,reserve,remaining,daysLeft,allow,spentToday,leftToday:allow-spentToday,lasts,pace:A.dailyOut};
}
function planHTML(A){
  const P=planInfo(A);
  const head=`<div class="fsh"><b class="lb">${ic('dollar',16)}Spending plan · 60 / 40</b></div>`;
  if(!P)return `<div class="fsub glass">${head}<p class="fcap" style="margin:6px 2px 2px">Import your bank SMS so Norie knows your balance, then it will split it: 60% to spend day by day, 40% kept as backup.</p></div>`;
  const over=P.pace>P.allow&&P.pace>0,tip=P.pace>0
    ?(over?`<div class="tip warn"><i></i><span>${esc(MT(`Your usual pace is about ETB ${ETB0(P.pace)} a day — above this budget. At that pace the 60% lasts about ${Math.floor(P.lasts)} day${Math.floor(P.lasts)===1?'':'s'}, not until month end. Try to stay near ETB ${ETB0(P.allow)}.`))}</span></div>`
     :`<div class="tip good"><i></i><span>${esc(MT(`Your usual pace (about ETB ${ETB0(P.pace)} a day) fits inside this budget. Keep it up.`))}</span></div>`)
    :'';
  const usedPct=Math.max(0,Math.min(100,Math.round((1-(P.spendable?P.remaining/P.spendable:0))*100)));
  return `<div class="fsub glass">${head}
  <div class="fsbig"><b>${M(ETB0(P.allow))}</b><small>ETB you can spend per day · next ${P.daysLeft} day${P.daysLeft===1?'':'s'}</small></div>
  <div class="fspr"><div><small>Spend (60%)</small><b>${M(ETB0(P.spendable))}</b></div><div><small>Backup (40%)</small><b class="pos">${M(ETB0(P.reserve))}</b></div><div><small>Left today</small><b class="${P.leftToday<0?'neg':''}">${M(ETB0(P.leftToday))}</b></div></div>
  <div class="fbar"><i style="width:${usedPct}%"></i></div>
  <p class="fcap" style="margin:6px 2px 6px">${P.saved?`Saved ${esc(fmtD(P.at))} from a balance of ${M('ETB '+ETB0(P.base))}. ETB ${M(ETB0(P.remaining))} of the 60% is still unspent.`:`Based on your balance right now (${M('ETB '+ETB0(P.base))}). Lock it in to keep the backup saved.`}</p>
  <div class="fwi"><div class="fwih"><b>What if I earn more?</b><button class="chip on" data-fwi aria-label="Add a what-if amount">+ Add</button></div>
    ${P.wiList.length?`<div class="fwic">${P.wiList.map(x=>`<span class="fwc">+${M(ETB0(x.amt))}<button data-fwix="${x.id}" aria-label="Remove">×</button></span>`).join('')}</div><p class="fcap" style="margin:4px 2px 0">Pretend money — not in your real balance. Remove it any time.</p>`:`<p class="fcap" style="margin:4px 2px 0">Try an extra amount to see how much more you could spend per day.</p>`}</div>
  ${tip}
  <div class="btns" style="margin:4px 0 6px"><button class="btn main small" data-fplan>${P.saved?'Re-lock with current balance':'Lock in this plan'}</button>${P.saved?'<button class="btn small" data-fplanx>Clear</button>':''}</div></div>`;
}

function finWhatIf(){
  const P=planInfo(advise());if(!P){flash('Import your bank SMS first');return}
  let o=document.getElementById('finwi');if(o)o.remove();
  o=document.createElement('div');o.id='finwi';
  o.style.cssText='position:fixed;inset:0;z-index:70;background:rgba(80,40,50,.35);display:grid;place-items:center;padding:20px';
  o.innerHTML=`<div class="glass" style="background:#fffaf3;padding:18px;width:min(380px,100%)"><b style="font-size:18px">What if I earn more?</b>
  <div class="hint" style="margin:4px 0 0">Pretend amount only. It never touches your real balance and you can remove it later.</div>
  <label>Extra money (ETB)</label><input id="fw_a" inputmode="decimal" placeholder="e.g. 5000" autocomplete="off">
  <label>…or: I want to spend this much per day (ETB)</label><input id="fw_d" inputmode="decimal" placeholder="e.g. 800" autocomplete="off">
  <div class="hl" id="fw_p" style="margin-top:10px">Today you can spend about <b>${M(ETB0(P.allow))}</b> a day.</div>
  <div class="btns" style="margin-top:14px"><button class="btn small" id="fw_c">Cancel</button><button class="btn main small" id="fw_o">Add</button></div></div>`;
  document.body.append(o);
  const A=o.querySelector('#fw_a'),D=o.querySelector('#fw_d'),Pv=o.querySelector('#fw_p');
  const num=el=>parseFloat(String(el.value).replace(/,/g,''));
  const prev=()=>{const x=num(A);if(isFinite(x)&&x>0){const add=x*.6/P.daysLeft;Pv.innerHTML=`You could spend about <b>${M(ETB0(P.allow+add))}</b> a day (<b>+${M(ETB0(add))}</b>), and ETB ${M(ETB0(x*.4))} goes to backup.`}else Pv.innerHTML=`Today you can spend about <b>${M(ETB0(P.allow))}</b> a day.`};
  A.oninput=()=>{D.value='';prev()};
  D.oninput=()=>{const w=num(D);if(!isFinite(w)||w<=0){A.value='';prev();return}
    const need=(w*P.daysLeft-(P.remaining+P.spentToday))/.6;
    if(need<=0){A.value='';Pv.innerHTML='You can already spend that much per day. 🎉'}
    else{A.value=String(Math.ceil(need));prev();Pv.innerHTML=`To spend ETB <b>${M(ETB0(w))}</b> a day you would need about <b>${M(ETB0(need))}</b> extra over the next ${P.daysLeft} days.`}};
  o.querySelector('#fw_c').onclick=()=>o.remove();
  o.onclick=e=>{if(e.target===o)o.remove()};
  o.querySelector('#fw_o').onclick=()=>{
    const x=num(A);if(!isFinite(x)||x<=0){A.focus();return}
    F().wi.push({id:'w'+uid(),amt:Math.round(x*100)/100,u:Date.now()});save();o.remove();render();flash('What-if added — tap × to remove it');
  };
  setTimeout(()=>A.focus(),60);
}

/* ---------- screens ---------- */
function vHome(){
  const f=F(),B=banksBal(),s=stats(f.tx);
  const empty=!f.tx.length;
  return `<h1>${ic('dollar',26)}Finance</h1><p class="sub">${empty?'telebirr · CBE · Awash':B.n+' of 3 banks · '+f.tx.length+' transactions'}</p>
  <div class="fmaster" data-fgo="banks" role="button" aria-label="Open banks">
    <div class="fmtop"><div class="fmt">Total balance</div><button class="feye" data-feye aria-label="Show or hide balance">${ic(hide?'eyeOff':'eye',18)}</button></div>
    <div class="fmb"><small>ETB</small>${B.n?(hide?DOTS:ETB(B.tot)):'—'}</div>
    <div class="fmr"><span>${ic('arrowDown',13)}${hide?'•••':'+'+ETB(s.i)}</span><span>${ic('arrowUp',13)}${hide?'•••':'−'+ETB(s.o)}</span><i>this month</i></div>
    <div class="fmf"><div class="fmh">Tap to open your banks</div><div class="fmd">${Object.keys(BANKS).map(k=>`<i class="fdot b-${k}">${esc(BANKS[k].n[0].toUpperCase())}</i>`).join('')}</div></div>
  </div>
  <div class="fact">${isAuto()?'':`<button class="chip" data-frun>${ic('save',14)}Import new SMS</button>`}<button class="chip" data-fpaste>${ic('save',14)}Paste SMS</button></div>
  ${empty?`<p class="fcap" style="text-align:center">No messages yet — paste your bank SMS, or <a href="#" data-fsetup>set up automatic capture</a>.</p>`:''}
  <div class="fplus glass" data-fgo="advice"><div class="pl">${ic('plus',22)}</div><div><b>Smart advisor</b><small>Forecast, subscriptions &amp; money tips</small></div></div>`;
}
function vBanks(){
  const B=banksBal();
  return `${backBtn('home','Master card')}<h1>Your banks</h1><p class="sub">${B.n?'Total '+M(ETB(B.tot))+' ETB':'Tap a bank to see every transaction'}</p>${cardsHTML()}`;
}
function vBank(k){
  const f=F(),all=f.tx.filter(t=>t.bank===k),s=stats(all),b=latestBal(all);
  const list=dirF==='all'?all:all.filter(t=>t.dir===dirF);
  return `${backBtn('home','Master card')}<h1>${BANKS[k].n}</h1><p class="sub">${b==null?'No balance yet':'Balance '+M(ETB(b))+' ETB'} · ${all.length} transactions</p>
  <div class="fsum glass"><div class="fs1"><small>Money in</small><b class="pos">${M('+'+ETB(s.i))}</b></div><div class="fs1"><small>Money out</small><b class="neg">${M('−'+ETB(s.o))}</b></div><div class="fs1"><small>Net · month</small><b>${M((s.i-s.o<0?'−':'')+ETB(Math.abs(s.i-s.o)))}</b></div></div>
  <div class="chips fchips">${[['all','All'],['in','In'],['out','Out']].map(([v,n])=>`<button class="chip ${dirF===v?'on':''}" data-fdir="${v}">${n}</button>`).join('')}</div>
  ${listHTML(list)}`;
}
let advTab='plan';
function weekBars(){
  const f=F(),t0=sod(Date.now()),a=[];
  for(let i=6;i>=0;i--){const d0=t0-i*DAY;a.push({d:d0,v:f.tx.filter(t=>t.dir==='out'&&t.ts>=d0&&t.ts<d0+DAY).reduce((x,t)=>x+t.amt,0)})}
  const mx=Math.max(1,...a.map(x=>x.v));
  return `<div class="fwk">${a.map((x,i)=>`<div class="${i===6?'td':''}"><i style="height:${Math.max(3,Math.round(x.v/mx*100))}%"></i><small>${'SMTWTFS'[new Date(x.d).getDay()]}</small></div>`).join('')}</div>`;
}
function vAdvice(){
  const A=advise(),tabs=[['plan','Plan'],['report','Report'],['subs','Subscriptions']];
  const seg=`<div class="chips fchips fseg">${tabs.map(([k,n])=>`<button class="chip ${advTab===k?'on':''}" data-fadv="${k}">${n}</button>`).join('')}</div>`;
  let body='';
  if(advTab==='plan'){
    body=`${planHTML(A)}
    <div class="fsub glass"><div class="fspr" style="margin-top:0"><div><small>You spend / day</small><b>${M(ETB0(A.dailyOut))}</b></div><div><small>Balance lasts</small><b>${A.runway==null?'—':Math.floor(A.runway)+' days'}</b></div></div></div>`;
  }else if(advTab==='report'){
    const net=A.got-A.spent,sr=A.mIn>0?Math.round((A.mIn-A.mOut)/A.mIn*100):null;
    const top=A.top.length?`<h2>Where it went</h2><div class="card glass">${A.top.map(([n,v])=>`<div class="frow"><div class="fm"><div class="ft">${esc(n)}</div></div><div class="fa neg">${M('−'+ETB(v))}</div></div>`).join('')}</div>`:'';
    body=`<div class="fsub glass"><div class="fsh"><b class="lb">This month</b>${sr!=null?`<span class="fpill ${sr<10?'bad':'ok'}">Saving ${sr}%</span>`:''}</div>
    <div class="fspr" style="margin-top:2px"><div><small>Money in</small><b class="pos">${M(ETB0(A.got))}</b></div><div><small>Money out</small><b class="neg">${M(ETB0(A.spent))}</b></div><div><small>Net</small><b class="${net<0?'neg':'pos'}">${M((net<0?'−':'')+ETB0(Math.abs(net)))}</b></div></div></div>
    <div class="fsub glass"><div class="fsh"><b class="lb">Spending, last 7 days</b></div>${weekBars()}
    ${A.endBal!=null?`<p class="fcap" style="margin:8px 2px 2px">At this pace your balance at month end is about <b class="${A.endBal<0?'neg':''}">${M('ETB '+ETB0(A.endBal))}</b>.</p>`:''}</div>
    ${top}
    <h2>What to do</h2><div class="card glass">${A.tips.map(t=>`<div class="tip ${t[0]}"><i></i><span>${esc(MT(t[1]))}</span></div>`).join('')}</div>`;
  }else{
    const rec=A.rec.length?`<h2>Looks recurring</h2><div class="card glass">${A.rec.map((r,i)=>`<div class="frow"><div class="fm"><div class="ft">${esc(r.name)}</div><div class="fs">~ETB ${M(ETB(r.amt))} ${r.per==='week'?'weekly':'monthly'} · next ~${fmtD(r.next)}</div></div><button class="chip on" data-fadd="${i}">+ Add</button></div>`).join('')}</div>`:'';
    body=`${subCardHTML(A.mIn)}${rec}`;
  }
  return `${backBtn('home','Master card')}<h1>${ic('activity',26)}Smart advisor</h1><p class="sub">Forecast from your SMS history</p>${seg}${body}
  <p class="fcap" style="margin:14px 8px 0">Estimates based on your bank SMS — not professional financial advice.</p>`;
}
window.vFinance=function(){
  if(mode==='advice')return vAdvice();
  if(BANKS[mode])return vBank(mode);
  if(mode==='banks')return vBanks();
  return vHome();
};

/* tab + render hooks (no edit to render() needed) */
TABS.splice(4,0,['finance','dollar','Finance']);
const _render=render;
render=function(){
  if(tab!=='finance'){if(!hide)lockNow();const r=_render();if(tab==='settings')tgEnhance();return r}
  bar();ORc=null;RBc=null;
  $('#app').innerHTML=vFinance();
  $('#fab').style.display='none';
  if(typeof syncNorie==='function')syncNorie();
};

/* ---------- cloud inbox pull (automatic, no refresh button) ---------- */
const stGet=()=>{try{return localStorage.getItem('petal.finsms')}catch(_){return null}};
const stSet=v=>{try{localStorage.setItem('petal.finsms',v)}catch(_){}};
let pulling=false,lastPull=0;
async function finPull(manual){
  if(pulling||!hasCloud()||!navigator.onLine)return 0;
  if(!manual&&Date.now()-lastPull<25000)return 0;
  pulling=true;lastPull=Date.now();
  try{
    const r=await gasCall({action:'smspull'});
    if(!r||r.status==='error'||!Array.isArray(r.items)){stSet('old');return 0}
    stSet('ok');
    if(!r.items.length)return 0;
    const n=ingest(r.items.filter(x=>SENDER_OK(x.from))).added;
    gasCall({action:'smsack',ids:r.items.map(x=>x.id)}).catch(()=>{});
    if(n){if(tab==='finance'&&!isTyping()&&!sheetOpen())render();flash('Finance: '+n+' new transaction'+(n>1?'s':''))}
    if(r.items.length>=100)setTimeout(()=>finPull(true),700);
    return n;
  }catch(_){return 0}finally{pulling=false}
}
const _lg=loadFromGas;
loadFromGas=async function(force){const r=await _lg(force);finPull();return r};

/* ---------- paste / import SMS ---------- */
function splitMsgs(text,from){
  const out=[];
  text.replace(/\r/g,'').split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean).forEach(ch=>{
    const ls=ch.split('\n').map(x=>x.trim()).filter(Boolean);
    if(ls.length>1&&ls.filter(l=>parse(l,from)).length>=2)out.push(...ls);else out.push(ch);
  });
  return out;
}
function finAsk(){
  let o=document.getElementById('finask');if(o)o.remove();
  o=document.createElement('div');o.id='finask';
  o.style.cssText='position:fixed;inset:0;z-index:70;background:rgba(80,40,50,.35);display:grid;place-items:center;padding:20px';
  o.innerHTML=`<div class="glass" style="background:#fffaf3;padding:18px;width:min(420px,100%)"><b style="font-size:18px">Import bank SMS</b>
  <div class="hint" style="margin:4px 0 0">Only CBE, Awash Bank and telebirr are accepted — the bank name or its link (e.g. awashbank) anywhere in the message is enough. If a message has neither, pick the bank below.</div>
  <textarea id="fa_t" style="margin-top:12px;min-height:140px" placeholder="Paste one message or your whole history. Put a blank line between messages."></textarea>
  <label>Bank</label><select id="fa_b"><option value="">Auto-detect</option>${Object.keys(BANKS).map(k=>`<option value="${BANKS[k].n}">${BANKS[k].n}</option>`).join('')}</select>
  <div class="btns" style="margin-top:14px"><button class="btn small" id="fa_c">Cancel</button><button class="btn main small" id="fa_o">Import</button></div></div>`;
  document.body.append(o);
  o.onclick=e=>{if(e.target===o)o.remove()};
  o.querySelector('#fa_c').onclick=()=>o.remove();
  o.querySelector('#fa_o').onclick=()=>{
    const text=o.querySelector('#fa_t').value,from=o.querySelector('#fa_b').value;
    const msgs=splitMsgs(text,from);
    if(!msgs.length)return;
    const r=ingest(msgs.map(m=>({from,text:m})));
    o.remove();
    const bits=[];
    if(r.dup)bits.push(r.dup+' duplicate'+(r.dup>1?'s':'')+' skipped');
    if(r.bad)bits.push(r.bad+' not read ('+r.reason+')');
    flash(r.added?`Imported ${r.added} transaction${r.added>1?'s':''}${bits.length?' · '+bits.join(' · '):''}`:(bits.length?'Nothing new — '+bits.join(' · '):'Nothing to import'));
    if(tab==='finance')render();
  };
}

/* ---------- Private mode: import the phone's own queue file (no cloud) ---------- */
function qItems(text){
  return String(text||'').replace(/\r/g,'').split(/^#####[ \t]*$/m).map(c=>c.trim()).filter(Boolean).map(c=>{
    const L=c.split('\n'),ts=Date.parse(L[0]),ok=isFinite(ts)&&L.length>=3;
    return{from:ok?String(L[1]||'').trim():'',text:(ok?L.slice(2):L).join('\n').trim(),ts:ok?ts:0};
  }).filter(x=>x.text&&SENDER_OK(x.from));
}
function finReport(r){
  const bits=[];
  if(r.dup)bits.push(r.dup+' already had');
  if(r.bad)bits.push(r.bad+' not read');
  flash(r.added?`Imported ${r.added} new transaction${r.added>1?'s':''}${bits.length?' · '+bits.join(' · '):''}`:(bits.length?'Nothing new — '+bits.join(' · '):'No bank messages found'));
  if(tab==='finance'&&!isTyping()&&!sheetOpen())render();
}
async function finClipImport(){
  let t='';
  try{t=await navigator.clipboard.readText()}catch(_){flash('Paste was blocked — use “Paste SMS” instead');finAsk();return}
  const items=qItems(t);
  if(!items.length){flash('No CBE / 127 / Awash messages on the clipboard');return}
  finReport(ingest(items));
}
function finRunLocal(){
  try{sessionStorage.setItem('finwait','1')}catch(_){}
  location.href='shortcuts://run-shortcut?name='+encodeURIComponent(READ_NAME);
}
function finReadyAsk(){
  let o=document.getElementById('finready');if(o)o.remove();
  o=document.createElement('div');o.id='finready';
  o.style.cssText='position:fixed;inset:0;z-index:70;background:rgba(80,40,50,.35);display:grid;place-items:center;padding:20px';
  o.innerHTML=`<div class="glass" style="background:#fffaf3;padding:18px;width:min(360px,100%);text-align:center"><b style="font-size:18px">Your messages are ready</b>
  <div class="hint" style="margin:6px 0 14px">Tap Import. If iPhone asks to allow Paste, choose <b>Allow</b>.</div>
  <div class="btns" style="justify-content:center"><button class="btn small" id="fr_c">Not now</button><button class="btn main small" id="fr_o">Import</button></div></div>`;
  document.body.append(o);
  o.querySelector('#fr_c').onclick=()=>o.remove();
  o.querySelector('#fr_o').onclick=async()=>{o.remove();await finClipImport()};
}
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='visible')return;
  let w=null;try{w=sessionStorage.getItem('finwait');sessionStorage.removeItem('finwait')}catch(_){}
  if(w&&!isAuto())setTimeout(finReadyAsk,250);
});
window.finQItems=qItems;window.finAdvise=advise;window.finPlan=planInfo;window.finClipImport=finClipImport;window.finSetMode=setMode;

/* ---------- settings: setup card ---------- */
const _vs=vSettings;
vSettings=function(){return _vs()+setupHTML()};
function setupHTML(){
  const auto=isAuto(),url=(S.settings.gasUrl||'').trim(),st=stGet();
  const badge=!auto?['Private',''] :st==='ok'?['Auto ✓','ok']:st==='old'?['Cloud update needed','no']:['Auto',''];
  const btn=(href,label,primary)=>href?`<a class="btn ${primary?'main ':''}small" href="${esc(href)}" target="_blank" rel="noopener" style="text-decoration:none;text-align:center">${label}</a>`:'';
  const modeBar=`<div class="fspr" style="margin:0 0 12px"><div data-fmode="private" style="cursor:pointer;${!auto?'background:var(--pink);color:#fff':''}"><b>Private</b><br><small>stays on this phone</small></div><div data-fmode="auto" style="cursor:pointer;${auto?'background:var(--pink);color:#fff':''}"><b>Auto</b><br><small>uses Norie cloud</small></div></div>`;
  const priv=`
     <p><b>Private mode.</b> Your tasks and bank messages never leave this phone. No account, no cloud.</p>
     <ol class="steps">
       <li>Install the three shortcuts: ${btn(SHORTCUT_LINK_MAKE,'Make Queue',0)} ${btn(SHORTCUT_LINK_PRIVATE,'Norie Bank SMS',1)} ${btn(SHORTCUT_LINK_READ,'Norie Read Queue',0)}</li>
       <li>Open <b>Make Queue</b> in the Shortcuts app and tap ▶ once (it creates the file that stores your messages).</li>
       <li>Shortcuts app → <b>Automation</b> → <b>+</b> → <b>Message</b> → Message Contains <b>ETB</b> → <b>Run Immediately</b> → <b>Run Shortcut</b> → <b>Norie Bank SMS</b>.</li>
       <li>In Norie’s Finance tab tap <b>Import new SMS</b> whenever you want your latest messages in.</li>
     </ol>
     <div class="btns"><button class="btn main small" id="fin_clip">Import from clipboard</button><button class="btn small" data-fpaste>Paste an SMS manually</button></div>
     <div class="hint" style="margin-top:8px"><b>Telegram in Private mode:</b> a bot cannot schedule messages, so reminders reach Telegram only while Norie is open. Switch to Auto if you want them while the app is closed.</div>`;
  const cloud=`
     <p><b>Auto mode.</b> Bank messages arrive by themselves, and Telegram reminders fire even when Norie is closed. Your data is stored in the shared Norie cloud under your private ID.</p>
     ${SHORTCUT_LINK?`<div class="btns" style="margin-top:4px"><a class="btn main" id="fin_install" href="${esc(SHORTCUT_LINK)}" target="_blank" rel="noopener" style="text-decoration:none;text-align:center">Install the shortcut</a></div>`:`<div class="hl">The shortcut link isn’t added yet.</div>`}
     <ol class="steps">
       <li>Tap <b>Install the shortcut</b>. Your private ID is copied for you.</li>
       <li>When Shortcuts asks for your ID, tap the box, choose <b>Paste</b>, then <b>Add Shortcut</b>.</li>
       <li>Shortcuts app → <b>Automation</b> → <b>+</b> → <b>Message</b> → Message Contains <b>ETB</b> → <b>Run Immediately</b> → <b>Run Shortcut</b> → <b>Norie Bank SMS</b>.</li>
     </ol>
     <div class="btns"><button class="btn main small" id="fin_check">Check connection</button><button class="btn small" id="fin_copyid">Copy my ID</button></div>
     <div class="hl" id="fin_msg">Your ID is private and random: <b>${esc(getUserKey())}</b></div>
     <div class="btns"><button class="btn small" data-fpaste>Paste an SMS manually</button><button class="btn small danger" id="fin_reset">New sync ID</button></div>
     <div class="hint" style="margin-top:8px">Privacy: the person who runs Norie’s cloud could technically see stored data, so only use Auto if you trust them.</div>`;
  return `<details class="glass setrow" id="finsetup">
   <summary><b class="lb">${ic('dollar')}Finance &amp; sync mode</b><span class="stb ${badge[1]}" id="st_fin">${badge[0]}</span></summary>
   <div class="setwrap">
     <p>Bank messages from <b>CBE, 127 (telebirr) and Awash Bank</b> only.</p>
     ${modeBar}
     ${auto?cloud:priv}
   </div>
  </details>`;
}

/* ---------- Telegram: find the Chat ID automatically ---------- */
function tgEnhance(){
  const c=document.getElementById('tgc');if(!c||document.getElementById('tg_find'))return;
  const d=document.createElement('div');
  d.innerHTML=`<div class="btns" style="margin-top:8px"><button class="btn small" id="tg_find">Find my Chat ID</button></div>
  <div class="hint" style="margin-top:6px">1) Create your own bot with @BotFather and paste its token above. 2) Open YOUR bot in Telegram and send it any message (e.g. /start). 3) Tap <b>Find my Chat ID</b> — it fills in the number and sends a test.</div>`;
  c.insertAdjacentElement('afterend',d);
}

/* ---------- clicks ---------- */
const copy=async(txt,msg)=>{try{await navigator.clipboard.writeText(txt);flash(msg)}catch(_){flash('Copy failed — select the text and copy it')}};
$('#app').addEventListener('click',async e=>{
  const T=e.target;
  if(T.closest('[data-feye]')){await toggleHide();return}
  const go=T.closest('[data-fgo]');
  if(go){mode=go.dataset.fgo;dirF='all';render();scrollTo({top:0});return}
  const fd=T.closest('[data-fdir]');if(fd){dirF=fd.dataset.fdir;render();return}
  const fx=T.closest('[data-ftx]');
  if(fx){if(confirm('Delete this transaction?')){const f=F();f.del[fx.dataset.ftx]=Date.now();f.tx=f.tx.filter(t=>t.id!==fx.dataset.ftx);save();render()}return}
  if(T.closest('[data-fsetup]')){e.preventDefault();tab='settings';render();setTimeout(()=>{const d=document.getElementById('finsetup');if(d){d.open=true;d.scrollIntoView({block:'start'})}},60);return}
  if(T.closest('[data-fsubadd]')){finSubAsk();return}
  const keep=fn=>{const y=scrollY;fn();render();scrollTo(0,y)};
  if(T.closest('[data-fwi]')){finWhatIf();return}
  const fwx=T.closest('[data-fwix]');if(fwx){const f=F();f.del[fwx.dataset.fwix]=Date.now();f.wi=f.wi.filter(x=>x.id!==fwx.dataset.fwix);save();const y=scrollY;render();scrollTo(0,y);return}
  const fad=T.closest('[data-fadv]');if(fad){advTab=fad.dataset.fadv;render();scrollTo({top:0});return}
  const fsb=T.closest('[data-fsub]');if(fsb){const id=fsb.dataset.fsub;keep(()=>{selSub=selSub===id?null:id});return}
  if(T.closest('[data-fsuball]')){keep(()=>{selSub=null});return}
  if(T.closest('[data-fsubedit]')){const x=F().subs.find(z=>z.id===selSub);if(x)finSubAsk(x);return}
  if(T.closest('[data-fplan]')){const B=banksBal();if(!B.n||!(B.tot>0)){flash('No balance yet — import your bank SMS first');return}keep(()=>{F().plan={start:Date.now(),total:B.tot,end:planEnd(),u:Date.now()};save()});flash('Plan saved — 40% is set aside as backup');return}
  if(T.closest('[data-fplanx]')){keep(()=>{F().plan={cleared:1,end:0,u:Date.now()};save()});return}
  const fa=T.closest('[data-fadd]');
  if(fa){const r=lastRec[+fa.dataset.fadd];if(r){F().subs.push({id:'s'+uid(),name:String(r.name).slice(0,40),amt:r.amt,per:r.per,u:Date.now()});save();render();flash('Added to subscriptions')}return}
  if(T.closest('[data-frun]')){finRunLocal();return}
  if(T.closest('[data-fpaste]')){finAsk();return}
  const md=T.closest('[data-fmode]');if(md){setMode(md.dataset.fmode);return}
  if(T.id==='fin_clip'){finClipImport();return}
  if(T.id==='fin_copyurl'){copy(S.settings.gasUrl||'','URL copied');return}
  if(T.id==='fin_copyid'){copy(getUserKey(),'ID copied');return}
  if(T.closest('#fin_install')){try{navigator.clipboard.writeText(getUserKey())}catch(_){}flash('Your ID is copied — paste it when Shortcuts asks');return}
  if(T.id==='fin_reset'){
    if(!confirm('Make a brand-new private sync ID for this phone? Your tasks stay on this phone and are uploaded under the new ID. You will need to copy the setup code again.'))return;
    S.settings.syncId=newSyncId();save();render();
    if(getUserKey()!==S.settings.syncId)flash('Update index.html first (see instructions)');else flash('New private sync ID created');return;
  }
  if(T.id==='tg_find'){
    const tok=($('#tgt').value||'').trim(),st=document.getElementById('tgstat');
    const say=(m,ok)=>{if(!st)return flash(m);st.className='status '+(ok?'ok':'no');st.textContent=m};
    if(!/^\d{5,}:[\w-]{20,}$/.test(tok)){say('Paste your bot token first (from @BotFather).');return}
    say('Looking…',true);
    try{
      const r=await fetch('https://api.telegram.org/bot'+encodeURIComponent(tok)+'/getUpdates?limit=100'),j=await r.json();
      if(!j.ok){say(j.error_code===401?'That token isn’t valid — copy it again from @BotFather.':j.error_code===409?'This bot has a webhook set elsewhere — remove it, or type the Chat ID by hand.':'Telegram said: '+(j.description||'error'));return}
      const ch=[...j.result].reverse().map(u=>(u.message||u.edited_message||u.channel_post||(u.my_chat_member?{chat:u.my_chat_member.chat}:{})).chat).find(c=>c&&c.id);
      if(!ch){say('No message found yet. Open YOUR bot in Telegram, send it “hi”, then tap this again.');return}
      $('#tgc').value=String(ch.id);
      document.getElementById('tgsave').click();
    }catch(_){say('Couldn’t reach Telegram — check your internet.')}
    return;
  }
  if(T.id==='fin_check'){
    const out=document.getElementById('fin_msg');
    if(!hasCloud()){out.textContent='Set up Cloud Sync first (paste your Web App URL).';return}
    out.textContent='Checking…';
    await finPull(true);
    const s=stGet(),b=document.getElementById('st_fin');
    if(s==='ok'){out.textContent='Connected ✓ — the cloud script understands Finance. Send yourself a test bank SMS, or wait for the next real one.';if(b){b.textContent='Ready ✓';b.className='stb ok'}}
    else{out.textContent='The cloud script doesn’t know Finance yet. Add the code from finance-cloud.gs to Code.gs, then Deploy → Manage deployments → New version.';if(b){b.textContent='Update Code.gs';b.className='stb no'}}
    return;
  }
});

/* ---------- styles ---------- */
const css=document.createElement('style');
css.textContent=`
.bar{width:min(94vw,440px)}.bar button{font-size:10.5px}
.pos{color:#2f9e6a}.neg{color:var(--pink)}
.fback{border:0;font:inherit;font-size:13.5px;font-weight:700;color:var(--pink);background:rgba(255,255,255,.7);padding:7px 13px 7px 8px;border-radius:16px;display:inline-flex;align-items:center;gap:2px;cursor:pointer;margin:2px 0 6px;box-shadow:inset 0 1px 0 #fff}
.fmaster{position:relative;overflow:hidden;cursor:pointer;color:#fff;padding:22px 20px 16px;border-radius:28px;margin:4px 0 0;background:linear-gradient(135deg,#f4687f 0%,#ee7f8c 48%,#d9a53f 100%);box-shadow:0 16px 36px rgba(244,104,127,.34),inset 0 1.5px 0 rgba(255,255,255,.55);transition:transform .15s}
.fmaster:active{transform:scale(.985)}
.fmaster::before{content:"";position:absolute;right:-50px;top:-60px;width:190px;height:190px;border-radius:50%;background:rgba(255,255,255,.16)}
.fmaster::after{content:"";position:absolute;right:34px;bottom:-84px;width:160px;height:160px;border-radius:50%;background:rgba(255,255,255,.1)}
.fmaster>*{position:relative;z-index:1}
.fmtop{display:flex;align-items:center;justify-content:space-between}
.feye{border:0;color:#fff;background:rgba(255,255,255,.26);width:36px;height:36px;border-radius:50%;display:grid;place-items:center;cursor:pointer;padding:0;margin:-6px -6px 0 0}
.feye .ic{vertical-align:0}
.feye.dk{color:var(--muted);background:rgba(255,255,255,.7);margin:0;box-shadow:inset 0 1px 0 #fff}
.ftop{display:flex;align-items:center;gap:8px;margin:2px 0 6px}.ftop .fback{margin:0}
.fmt{font-size:12px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;opacity:.92}
.fmb{font-size:38px;font-weight:800;letter-spacing:-1px;margin:6px 0 4px;font-variant-numeric:tabular-nums;display:flex;align-items:baseline;gap:8px}
.fmb small{font-size:14px;font-weight:700;opacity:.85;letter-spacing:0}
.fmr{display:flex;gap:14px;font-size:13px;font-weight:700;align-items:center;flex-wrap:wrap}
.fmr span{display:inline-flex;align-items:center;gap:4px;font-variant-numeric:tabular-nums}.fmr i{font-style:normal;font-weight:500;opacity:.88;font-size:12px}
.fmf{display:flex;align-items:center;justify-content:space-between;margin-top:18px}
.fmh{font-size:12px;font-weight:600;opacity:.92}
.fmd{display:flex;padding-left:7px}
.fdot{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:800;color:#fff;border:2px solid rgba(255,255,255,.9);margin-left:-7px;font-style:normal}
.fact{display:flex;justify-content:center;margin:12px 0 4px}
.fact .chip{font-size:12.5px;padding:7px 13px;display:inline-flex;align-items:center;gap:6px;color:var(--muted)}
.fplus{display:flex;align-items:center;gap:13px;padding:14px 16px;margin-top:10px;cursor:pointer;border:1.5px dashed rgba(200,150,46,.55);background:rgba(255,253,243,.5)}
.fplus .pl{flex:none;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;color:#fff;background:linear-gradient(145deg,#ff9aab,var(--pink));box-shadow:0 6px 14px rgba(244,104,127,.35)}
.fplus b{font-size:15px}.fplus small{display:block;color:var(--muted);font-size:12px;margin-top:2px}
.fsum{display:flex;padding:12px 6px;margin:2px 0 8px}
.fs1{flex:1;text-align:center;min-width:0}.fs1 small{display:block;font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.6px}
.fs1 b{font-size:15px;font-variant-numeric:tabular-nums}
.fsub{padding:13px 14px 8px;margin:0 0 8px}
.fsh{display:flex;align-items:center;justify-content:space-between}.fsh .lb{font-size:14px}.fsh .lb .ic{color:var(--pink)}
.fsh .chip{padding:7px 12px;font-size:13px}
.fsbig{margin:8px 2px 2px;display:flex;align-items:baseline;gap:8px}.fsbig b{font-size:26px;letter-spacing:-.5px;font-variant-numeric:tabular-nums}.fsbig small{color:var(--muted);font-size:12px;font-weight:600}
.fspr{display:flex;gap:6px;margin-top:8px}
.fspr>div{flex:1;min-width:0;text-align:center;padding:9px 4px;border-radius:14px;background:rgba(255,255,255,.7)}
.fspr small{display:block;font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px}
.fspr b{font-size:14px;font-variant-numeric:tabular-nums}
.fsl{margin-top:6px}.fsr{display:flex;align-items:center;gap:10px;padding:9px 2px;cursor:pointer;border-top:1px solid rgba(160,120,100,.12)}
.fchips{margin:6px 2px 2px;align-items:center}
.fsr.sel{background:rgba(244,104,127,.1);border-radius:12px;padding-left:8px;padding-right:8px;margin:0 -6px}
.fsel{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:8px 0 0;padding:8px 10px;border-radius:14px;background:rgba(255,255,255,.7)}.fsel small{display:block;font-size:11px;color:var(--muted);font-weight:600}.fsel b{font-size:15px}.fselb{display:flex;gap:6px}
.fbar{height:8px;border-radius:8px;background:rgba(160,120,100,.18);overflow:hidden;margin:10px 2px 4px}.fbar i{display:block;height:100%;border-radius:8px;background:linear-gradient(90deg,#2f9e6a,var(--gold),var(--pink))}
.fseg{margin:6px 0 12px}.fseg .chip{flex:1;text-align:center;justify-content:center}
.fpill{font-size:12px;font-weight:700;padding:4px 10px;border-radius:12px}.fpill.ok{background:rgba(47,158,106,.14);color:#2f9e6a}.fpill.bad{background:rgba(244,104,127,.14);color:var(--pink)}
.fwk{display:flex;align-items:flex-end;gap:8px;height:92px;margin:10px 2px 0}.fwk>div{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:5px}.fwk i{display:block;width:100%;border-radius:8px 8px 4px 4px;background:rgba(244,104,127,.35)}.fwk .td i{background:linear-gradient(180deg,#ff9aab,var(--pink))}.fwk small{font-size:11px;color:var(--muted);font-weight:600}
.fwi{margin:8px 0 8px;padding:10px 11px;border-radius:16px;background:rgba(255,255,255,.65);border:1px dashed rgba(200,150,46,.5)}
.fwih{display:flex;align-items:center;justify-content:space-between}.fwih b{font-size:14px}
.fwic{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.fwc{display:inline-flex;align-items:center;gap:6px;padding:5px 6px 5px 11px;border-radius:14px;background:rgba(47,158,106,.14);color:#2f9e6a;font-weight:700;font-size:13.5px}
.fwc button{border:0;background:rgba(47,158,106,.2);color:#2f9e6a;width:22px;height:22px;border-radius:50%;font-size:15px;line-height:1;padding:0;cursor:pointer}
.fcap{font-size:12px;color:var(--muted);margin:0 6px 6px}
.tip{display:flex;gap:10px;padding:11px 14px;font-size:14px;line-height:1.4;position:relative}
.tip+.tip::before{content:"";position:absolute;top:0;left:32px;right:0;height:1px;background:rgba(160,120,100,.14)}
.tip i{flex:none;width:8px;height:8px;border-radius:50%;margin-top:6px}
.tip.warn i{background:var(--pink)}.tip.good i{background:#2f9e6a}.tip.info i{background:var(--gold)}
.frow{display:flex;align-items:center;gap:11px;padding:11px 14px;cursor:pointer;position:relative}
.frow+.frow::before{content:"";position:absolute;top:0;left:57px;right:0;height:1px;background:rgba(160,120,100,.14)}
.fic{flex:none;width:32px;height:32px;border-radius:50%;display:grid;place-items:center}
.fic.in{background:rgba(47,158,106,.14);color:#2f9e6a}.fic.out{background:rgba(244,104,127,.14);color:var(--pink)}
.fm{flex:1;min-width:0}.ft{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fs{font-size:12px;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fa{font-weight:700;font-size:15px;font-variant-numeric:tabular-nums;white-space:nowrap}
.fcard{display:flex;align-items:center;gap:13px;padding:15px 16px;margin-bottom:10px;cursor:pointer}
.fbadge{flex:none;width:46px;height:46px;border-radius:15px;display:grid;place-items:center;font-weight:800;font-size:20px;color:#fff}
.b-telebirr{background:linear-gradient(145deg,#ff9aab,var(--pink))}.b-cbe{background:linear-gradient(145deg,var(--gold2),var(--gold))}.b-awash{background:linear-gradient(145deg,#7fd1a8,#2f9e6a)}
.fci{flex:1;min-width:0}.fcn{font-weight:800;font-size:17px}.fcs{font-size:12px;color:var(--muted);margin-top:2px}
.fcm{font-size:12.5px;font-weight:700;margin-top:6px;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}.fcm i{font-style:normal;font-weight:500;color:var(--muted);font-size:11px}
.fcb{text-align:right}.fcb small{display:block;font-size:10.5px;text-transform:uppercase;font-weight:700;color:var(--muted);letter-spacing:.6px}.fcb b{font-size:15px;font-variant-numeric:tabular-nums}
`;
document.head.appendChild(css);

window.finParse=parse;window.finIngest=ingest;window.finRepair=repairAll;window.finState=F;
dedupeAll();
repairAll();
render();
finPull(true);
})();
