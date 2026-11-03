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
  /* each bank's own signature wins (an Awash message can mention "Commercial Bank of Ethiopia" as the sender of the money) */
  if(/banking with cbe|cbe\.com\.et|mbreciept/i.test(tx))return 'cbe';
  if(/awash[_ ]?bank|awashbank|call 8980/i.test(tx))return 'awash';
  if(/telebirr|ethio\s*telecom/i.test(tx))return 'telebirr';
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
  if(dir==='out'){   /* what really left the account = amount + service fee + VAT */
    const tot=txt.match(/\btotal(?:\s+of)?\s+(?:ETB|Birr)\.?\s*([\d,]+(?:\.\d+)?)/i);
    if(tot&&num(tot[1])>=amt&&num(tot[1])<=amt*1.2+30)amt=num(tot[1]);
    else{const fee=txt.match(/service\s+(?:fee|charge)\s+(?:is\s+|of\s+)?(?:ETB|Birr)\.?\s*([\d,]+(?:\.\d+)?)/i),vat=txt.match(/VAT[^.]{0,50}?(?:ETB|Birr)\.?\s*([\d,]+(?:\.\d+)?)/i);
      if(fee&&num(fee[1])<amt)amt=Math.round((amt+num(fee[1])+(vat?num(vat[1]):0))*100)/100}
  }
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
const SHORTCUT_LINK_SEND='https://www.icloud.com/shortcuts/a93f484f2ce34d2b9f6ff18625389b53';   /* "Norie send queue global": uploads queue.txt to the account (key NOT included) */
const SHORTCUT_LINK_READ='https://www.icloud.com/shortcuts/f8169cda8318480f96860d342038ed58';      /* iCloud link: "Norie Read Queue" = Get File queue.txt -> Copy to Clipboard */
/* MODE: Private = nothing leaves the phone (no cloud). Auto = the shared cloud (bank SMS + Telegram while the app is closed).
   People who already have a cloud URL stay on Auto; everybody else starts on Private. */
const isAuto=()=>!!(S.settings.gasUrl||'').trim();
function setMode(m){
  const s=S.settings;
  if(m==='auto'){
    const A=window.NorieAccount,kept=(s.gasUrlKept||'').trim();
    if(A&&(!kept||(kept===A.SENT&&!A.signedIn()))){A.open();return}   /* account cloud: sign in first */
    const u=(kept||NORIE_CLOUD_URL||'').trim();
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
const F=()=>{S.fin=(S.fin&&Array.isArray(S.fin.tx))?S.fin:{tx:[],del:{}};S.fin.del=S.fin.del||{};S.fin.subs=Array.isArray(S.fin.subs)?S.fin.subs:[];S.fin.wi=Array.isArray(S.fin.wi)?S.fin.wi:[];S.fin.pay=Array.isArray(S.fin.pay)?S.fin.pay:[];S.fin.zero=S.fin.zero||{on:false,u:0};return S.fin};
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
  o.fin.zero=((fa.zero&&fa.zero.u)||0)>=((fb.zero&&fb.zero.u)||0)?(fa.zero||{on:false,u:0}):(fb.zero||{on:false,u:0});
  {const pm=new Map();[...(fb.pay||[]),...(fa.pay||[])].forEach(x=>{if(del[x.id])return;const old=pm.get(x.id);if(!old||(x.u||0)>=(old.u||0))pm.set(x.id,x)});o.fin.pay=[...pm.values()].sort((x,y)=>x.id<y.id?-1:1)}
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
/* a payment out of one of your banks that lands in another of your banks (same amount, within 15 min)
   is MOVING money, not spending or earning it, so it is left out of spending / income totals */
let _xk=null,_xs=null;
function xferSet(){
  const f=F(),k=f.tx.length+'|'+(f.tx[0]&&f.tx[0].id)+'|'+(f.tx[f.tx.length-1]&&f.tx[f.tx.length-1].id);
  if(_xk===k&&_xs)return _xs;
  const set=new Set(),ins=f.tx.filter(t=>t.dir==='in'),used=new Set();
  f.tx.filter(t=>t.dir==='out').forEach(o=>{
    const m=ins.find(i=>!used.has(i.id)&&i.bank!==o.bank&&Math.abs(i.ts-o.ts)<=15*60000&&i.amt<=o.amt+.005&&o.amt-i.amt<=Math.min(60,o.amt*.1));
    if(m){used.add(m.id);set.add(o.id);set.add(m.id)}
  });
  _xk=k;_xs=set;return set;
}
const isX=t=>xferSet().has(t.id);
const mstart=()=>{const d=new Date();d.setDate(1);d.setHours(0,0,0,0);return d.getTime()};
function stats(list){const m=mstart();let i=0,o=0;list.forEach(t=>{if(t.ts>=m&&!isX(t)){t.dir==='in'?i+=t.amt:o+=t.amt}});return{i,o}}
/* newest balance; if several messages share the newest minute, take the one no other message leads up to */
const latestBal=l=>{
  const a=l.filter(x=>x.bal!=null);if(!a.length)return null;
  const top=a.filter(x=>Math.abs(x.ts-a[0].ts)<=60000);
  if(top.length>1){
    const prevOf=y=>y.dir==='in'?y.bal-y.amt:y.bal+y.amt;
    const last=top.find(x=>!top.some(y=>y!==x&&Math.abs(prevOf(y)-x.bal)<.02));
    if(last)return last.bal;
  }
  return a[0].bal;
};
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
  <div class="fm"><div class="ft">${esc(t.who||(t.dir==='in'?'Money in':'Money out'))}</div><div class="fs">${isX(t)?'Own transfer · ':''}${fmtT(t.ts)}${t.bal!=null?' · Bal '+M(ETB(t.bal)):''}</div></div>
  <div class="fa ${isX(t)?'':t.dir==='in'?'pos':'neg'}">${M((t.dir==='in'?'+':'−')+ETB(t.amt))}</div></div>`;
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

/* ---------- numbers: commas while you type ---------- */
function commaIn(el){
  if(!el)return;
  const fmt=()=>{
    const pos=el.selectionStart,before=el.value.length;
    let v=el.value.replace(/[^\d.]/g,'');
    const i=v.indexOf('.');
    if(i>=0)v=v.slice(0,i+1)+v.slice(i+1).replace(/\./g,'').slice(0,2);
    const parts=v.split('.');
    el.value=(parts[0]||'').replace(/^0+(?=\d)/,'').replace(/\B(?=(\d{3})+(?!\d))/g,',')+(parts[1]!==undefined?'.'+parts[1]:'');
    try{const np=Math.max(0,(pos||0)+(el.value.length-before));el.setSelectionRange(np,np)}catch(_){}
  };
  el.addEventListener('input',fmt);
  if(el.value)fmt();
}
const numVal=el=>parseFloat(String(el.value).replace(/,/g,''));
const fmtIn=v=>v==null||v===''?'':Number(v).toLocaleString('en-US',{maximumFractionDigits:2});

/* ---------- payroll: salary and other regular pay ---------- */
const PAYPER={week:['Weekly',52/12],biweek:['Every 2 weeks',26/12],month:['Monthly',1],year:['Yearly',1/12]};
const payMo=p=>p.amt*(PAYPER[p.per]||PAYPER.month)[1];
const payTot=()=>F().pay.reduce((a,p)=>a+payMo(p),0);
function payCardHTML(A){
  const pay=F().pay,m=payTot(),sm=F().subs.reduce((a,s)=>a+perMo(s),0);
  const head=`<div class="fsh"><b class="lb">${ic('dollar',16)}Payroll &amp; salary</b><button class="chip on" data-fpayadd>+ Add</button></div>`;
  if(!pay.length)return `<div class="fsub glass">${head}<p class="fcap" style="margin:6px 2px 2px">Add salary or regular pay to forecast 1 month, 6 months and 1 year.</p></div>`;
  const v=(x)=>`<b class="${x<0?'neg':''}">${M((x<0?'−':'')+ETB0(Math.abs(x)))}</b>`;
  const rows=[['Income',m],['After subscriptions',m-sm]];
  if(A&&A.enough&&A.mOut>0)rows.push(['At your usual spending',m-A.mOut]);
  return `<div class="fsub glass">${head}
  <div class="fsbig"><b class="pos">${M('+'+ETB(m))}</b><small>ETB every month</small></div>
  <div class="fpt"><span></span><i>1 month</i><i>6 months</i><i>1 year</i>
  ${rows.map(([n,x])=>`<span>${n}</span>${v(x)}${v(x*6)}${v(x*12)}`).join('')}</div>
  <div class="fsl">${pay.slice().sort((a,b)=>payMo(b)-payMo(a)).map(p=>`<div class="fsr" data-fpay="${p.id}"><div class="fm"><div class="ft">${esc(p.name)}</div><div class="fs">${PAYPER[p.per][0]}${p.per==='month'?'':' · '+M(ETB(payMo(p)))+' / mo'}</div></div><div class="fa pos">${M('+'+ETB(p.amt))}</div></div>`).join('')}</div></div>`;
}
function finPayAsk(pay){
  let o=document.getElementById('finpay');if(o)o.remove();
  o=document.createElement('div');o.id='finpay';
  o.style.cssText='position:fixed;inset:0;z-index:70;background:rgba(80,40,50,.35);display:grid;place-items:center;padding:20px';
  o.innerHTML=`<div class="glass" style="background:#fffaf3;padding:18px;width:min(380px,100%)"><b style="font-size:18px">${pay?'Edit pay':'Add pay'}</b>
  <label>Name</label><input id="fp_n" value="${esc(pay?pay.name:'')}" placeholder="e.g. Salary, Freelance, Rent income" autocomplete="off">
  <label>Amount (ETB)</label><input id="fp_a" value="${pay?fmtIn(pay.amt):''}" inputmode="decimal" placeholder="0.00" autocomplete="off">
  <label>Paid</label><select id="fp_p">${Object.keys(PAYPER).map(k=>`<option value="${k}" ${(pay?pay.per:'month')===k?'selected':''}>${PAYPER[k][0]}</option>`).join('')}</select>
  <div class="btns" style="margin-top:14px"><button class="btn small" id="fp_c">Cancel</button>${pay?'<button class="btn danger small" id="fp_d">Delete</button>':''}<button class="btn main small" id="fp_o">Save</button></div></div>`;
  document.body.append(o);
  commaIn(o.querySelector('#fp_a'));
  o.addEventListener('click',e=>{if(e.target===o)o.remove()});
  o.querySelector('#fp_c').onclick=()=>o.remove();
  const d=o.querySelector('#fp_d');
  if(d)d.onclick=()=>{const f=F();f.del[pay.id]=Date.now();f.pay=f.pay.filter(x=>x.id!==pay.id);save();o.remove();render()};
  o.querySelector('#fp_o').onclick=()=>{
    const name=o.querySelector('#fp_n').value.trim(),amt=numVal(o.querySelector('#fp_a'));
    if(!name){o.querySelector('#fp_n').focus();return}
    if(!isFinite(amt)||amt<=0){o.querySelector('#fp_a').focus();return}
    const f=F(),per=o.querySelector('#fp_p').value;
    if(pay)Object.assign(pay,{name:name.slice(0,40),amt,per,u:Date.now()});
    else f.pay.push({id:'p'+uid(),name:name.slice(0,40),amt,per,u:Date.now()});
    save();o.remove();render();
  };
  setTimeout(()=>o.querySelector('#fp_n').focus(),60);
}

/* ---------- subscriptions ---------- */
const PER={day:['Daily',365/12],week:['Weekly',52/12],month:['Monthly',1],year:['Yearly',1/12]};
const perMo=s=>s.amt*(PER[s.per]||PER.month)[1];
let selSub=null;
function subCardHTML(income){
  const subs=F().subs,m=subs.reduce((a,s)=>a+perMo(s),0);
  const sel=selSub?subs.find(x=>x.id===selSub):null;if(selSub&&!sel)selSub=null;
  const head=`<div class="fsh"><b class="lb">${ic('repeat',16)}Subscriptions</b><button class="chip on" data-fsubadd>+ Add</button></div>`;
  if(!subs.length)return `<div class="fsub glass">${head}<p class="fcap" style="margin:6px 2px 2px">Add what you pay regularly to see its daily, monthly and yearly cost.</p></div>`;
  const v=sel?perMo(sel):m,pct=income>0?Math.round(v/income*100):null,share=m>0?Math.round(perMo(sel||{amt:0,per:'month'})/m*100):0;
  const who=sel?`<div class="fsel"><div><small>Showing only</small><b>${esc(sel.name)}</b></div><div class="fselb"><button class="chip" data-fsubedit>Edit</button><button class="chip on" data-fsuball>Show all</button></div></div>`:'';
  const cap=pct!=null?`<p class="fcap" style="margin:8px 2px 4px"><b class="neg">${pct}%</b> of monthly income${sel&&subs.length>1?` · ${share}% of subscriptions`:''}</p>`:'';
  return `<div class="fsub glass">${head}${who}
  <div class="fsbig"><b class="neg">${M('−'+ETB(v))}</b><small>ETB every month${sel?' · '+esc(sel.name):' · all'}</small></div>
  <div class="fspr f4"><div><small>Per day</small><b>${M(ETB(v*12/365))}</b></div><div><small>1 month</small><b>${M(ETB0(v))}</b></div><div><small>6 months</small><b>${M(ETB0(v*6))}</b></div><div><small>1 year</small><b>${M(ETB0(v*12))}</b></div></div>
  ${cap}
  <div class="fsl">${subs.slice().sort((a,b)=>perMo(b)-perMo(a)).map(s=>`<div class="fsr${s.id===selSub?' sel':''}" data-fsub="${s.id}"><div class="fm"><div class="ft">${esc(s.name)}</div><div class="fs">${PER[s.per][0]}${s.per==='month'?'':' · '+M(ETB(perMo(s)))+' / mo'}</div></div><div class="fa neg">${M('−'+ETB(s.amt))}</div></div>`).join('')}</div></div>`;
}
function finSubAsk(sub){
  let o=document.getElementById('finsub');if(o)o.remove();
  o=document.createElement('div');o.id='finsub';
  o.style.cssText='position:fixed;inset:0;z-index:70;background:rgba(80,40,50,.35);display:grid;place-items:center;padding:20px';
  o.innerHTML=`<div class="glass" style="background:#fffaf3;padding:18px;width:min(380px,100%)"><b style="font-size:18px">${sub?'Edit subscription':'New subscription'}</b>
  <label>Name</label><input id="fs_n" value="${esc(sub?sub.name:'')}" placeholder="e.g. Netflix, Spotify, gym" autocomplete="off">
  <label>Amount (ETB)</label><input id="fs_a" value="${sub?fmtIn(sub.amt):''}" inputmode="decimal" placeholder="0.00" autocomplete="off">
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
  commaIn(o.querySelector('#fs_a'));
  setTimeout(()=>o.querySelector('#fs_n').focus(),60);
}

/* ---------- smart advisor (all numbers are estimates from your SMS history) ---------- */
const MED=a=>{const s=a.slice().sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2};
const norm=w=>String(w||'').toLowerCase().replace(/[^a-z]+/g,' ').trim();
function detectRec(f){
  const t0=sod(Date.now()),g=new Map();
  f.tx.filter(t=>t.dir==='out'&&!isX(t)&&t.who&&t.ts>=t0-130*DAY).forEach(t=>{const k=norm(t.who);if(k.length<3)return;(g.get(k)||g.set(k,[]).get(k)).push(t)});
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
  const sum=(l,dir)=>l.filter(t=>t.dir===dir&&!isX(t)).reduce((a,t)=>a+t.amt,0);
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
  const pay=new Map();cur.filter(t=>t.dir==='out'&&!isX(t)).forEach(t=>{const k=t.who||'Other';pay.set(k,(pay.get(k)||0)+t.amt)});
  const top=[...pay].sort((a,b)=>b[1]-a[1]).slice(0,3);
  const enough=f.tx.length>=5&&span>=7;
  const tips=[];
  if(!enough)tips.push(['info','Import a few weeks of SMS for better forecasts.']);
  else{
    if(runway!=null){
      if(runway<10)tips.push(['warn',`Balance lasts ~${Math.floor(runway)} days at this pace. Cut extras.`]);
      else if(runway<30)tips.push(['info',`Balance lasts ~${Math.floor(runway)} days at this pace.`]);
      else tips.push(['good',`Balance lasts ~${Math.floor(runway)} days. Comfortable.`]);
    }
    if(save_!=null){
      if(save_<0)tips.push(['warn',`You spend ~ETB ${ETB0(mOut-mIn)} more than you earn each month.`]);
      else if(save_<.1)tips.push(['info',`You keep ~${Math.round(save_*100)}% of income. Aim for 10–20%.`]);
      else tips.push(['good',`You keep ~${Math.round(save_*100)}% of income. Nice.`]);
    }
    if(chg!=null&&chg>.2)tips.push(['warn',`Spending is up ${Math.round(chg*100)}% vs. this point last month.`]);
    else if(chg!=null&&chg<-.1)tips.push(['good',`Spending is down ${Math.round(-chg*100)}% vs. this point last month.`]);
    if(top.length&&spent>0&&top[0][1]/spent>.35&&top[0][0]!=='Other')tips.push(['info',`${Math.round(top[0][1]/spent*100)}% of this month’s spending went to ${top[0][0]}.`]);
  }
  if(f.subs.length){
    const big=f.subs.slice().sort((a,b)=>perMo(b)-perMo(a))[0];
    if(subPct!=null&&subPct>.15)tips.push(['warn',`Subscriptions take ~${Math.round(subPct*100)}% of income.`]);
    else if(subPct!=null&&subPct>.08)tips.push(['info',`Subscriptions take ~${Math.round(subPct*100)}% of income.`]);
    tips.push(['info',`Biggest subscription: ${big.name}, ETB ${ETB0(perMo(big)*12)}/year.`]);
  }
  if(rec.length)tips.push(['info',`${rec.length} possible subscription${rec.length>1?'s':''} found — see Subscriptions.`]);
  return{B,dailyOut,spent,got,projSpend,runway,endBal,mIn,mOut,sm,rec,top,tips,left,subPct,enough};
}

/* ---------- 60 / 40 plan: 60% to spend (daily budget), 40% locked as backup ---------- */
const PLAN_DAYS=30;
const planEnd=()=>Date.now()+PLAN_DAYS*DAY;
function planInfo(A){
  const f=F(),B=A.B,now=Date.now(),t0=sod(now);
  const zero=!!(f.zero&&f.zero.on);
  let p=!zero&&f.plan&&f.plan.end>now?f.plan:null;
  const end=p?p.end:planEnd();
  const base=p?p.total:(zero?0:(B.n?B.tot:null));
  if(base==null||(!zero&&!(base>0)))return null;
  const wiList=F().wi,wi=wiList.reduce((a,x)=>a+x.amt,0),total=base+wi;
  const start=p?p.start:now,spendable=total*.6,reserve=total*.4;
  const out=(from)=>f.tx.filter(t=>t.dir==='out'&&!isX(t)&&t.ts>=from).reduce((a,t)=>a+t.amt,0);
  const remaining=Math.max(0,spendable-(p?out(start):0));
  const daysLeft=Math.max(1,Math.ceil((end-now)/DAY));
  const spentToday=zero?0:out(Math.max(t0,start));
  const allow=(remaining+spentToday)/daysLeft;
  const lasts=A.dailyOut>0?remaining/A.dailyOut:null;
  return{zero,saved:!!p,at:p?p.start:null,total,base,wi,wiList,spendable,reserve,remaining,daysLeft,allow,spentToday,leftToday:allow-spentToday,lasts,pace:A.dailyOut};
}
function planHTML(A){
  const P=planInfo(A);
  const head=`<div class="fsh"><b class="lb">${ic('dollar',16)}Spending plan</b><span class="fpill ok">60 / 40</span></div>`;
  if(!P)return `<div class="fsub glass">${head}<p class="fcap" style="margin:6px 2px 2px">Import your bank SMS to get your daily budget.</p></div>`;
  const over=P.pace>P.allow&&P.pace>0;
  const tip=P.pace>0?`<div class="tip ${over?'warn':'good'}"><i></i><span>${esc(MT(over?`Your usual ETB ${ETB0(P.pace)}/day is above budget — the 60% lasts ${Math.floor(P.lasts)} day${Math.floor(P.lasts)===1?'':'s'}.`:`Your usual ETB ${ETB0(P.pace)}/day fits the budget.`))}</span></div>`:'';
  const usedPct=Math.max(0,Math.min(100,Math.round((1-(P.spendable?P.remaining/P.spendable:0))*100)));
  return `<div class="fsub glass">${head}
  <div class="fsbig"><b>${M(ETB0(P.allow))}</b><small>ETB per day · ${P.daysLeft} days</small></div>
  <div class="fspr"><div><small>Spend 60%</small><b>${M(ETB0(P.spendable))}</b></div><div><small>Backup 40%</small><b class="pos">${M(ETB0(P.reserve))}</b></div><div><small>Left today</small><b class="${P.leftToday<0?'neg':''}">${M(ETB0(P.leftToday))}</b></div></div>
  <div class="fbar"><i style="width:${usedPct}%"></i></div>
  <p class="fcap" style="margin:6px 2px">${P.zero?`Starting from <b>0</b>${P.wi>0?` + ${M(ETB0(P.wi))} what-if = <b>${M(ETB0(P.total))}</b>`:' — add an amount to plan from scratch'}`:P.wi>0?`${M(ETB0(P.base))} balance + ${M(ETB0(P.wi))} extra = <b>${M(ETB0(P.total))}</b>`:`Balance ${M(ETB0(P.base))}`}${P.saved?' · locked '+esc(fmtD(P.at)):''}</p>
  ${tip}
  <div class="fwi"><div class="fwih"><b>What if I earn more?</b><button class="fzc${P.zero?' on':''}" data-fzero>${P.zero?'From 0 ✓':'Start from 0'}</button></div>
    <div class="fwq">${[5000,10000,20000].map(v=>`<button class="fq" data-fwq="${v}">+${ETB0(v)}</button>`).join('')}<button class="fq oth" data-fwi>Other</button></div>
    ${P.wiList.length?`<div class="fwic">${P.wiList.map(x=>`<span class="fwc">+${M(ETB0(x.amt))}<button data-fwix="${x.id}" aria-label="Remove +${ETB0(x.amt)}">×</button></span>`).join('')}</div>`:''}</div>
  ${P.zero?'':`<div class="btns" style="margin:8px 0 2px"><button class="btn main small" data-fplan>${P.saved?'Re-lock':'Lock in this plan'}</button>${P.saved?'<button class="btn small" data-fplanx>Clear</button>':''}</div>`}</div>`;
}

function finWhatIf(){
  const P=planInfo(advise());if(!P){flash('Import your bank SMS first');return}
  let o=document.getElementById('finwi');if(o)o.remove();
  o=document.createElement('div');o.id='finwi';
  o.style.cssText='position:fixed;inset:0;z-index:70;background:rgba(80,40,50,.35);display:grid;place-items:center;padding:20px';
  o.innerHTML=`<div class="glass" style="background:#fffaf3;padding:18px;width:min(380px,100%)"><b style="font-size:18px">What if I earn more?</b>
  <div class="hint" style="margin:4px 0 0">Pretend money: added to your balance for planning only. Remove it any time.</div>
  <label>Extra money (ETB)</label><input id="fw_a" inputmode="decimal" placeholder="e.g. 5000" autocomplete="off">
  <label>…or: I want to spend this much per day (ETB)</label><input id="fw_d" inputmode="decimal" placeholder="e.g. 800" autocomplete="off">
  <div class="fwp" id="fw_p"></div>
  <div class="btns" style="margin-top:14px"><button class="btn small" id="fw_c">Cancel</button><button class="btn main small" id="fw_o">Add</button></div></div>`;
  document.body.append(o);
  const A=o.querySelector('#fw_a'),D=o.querySelector('#fw_d'),Pv=o.querySelector('#fw_p');
  commaIn(A);commaIn(D);
  const num=el=>parseFloat(String(el.value).replace(/,/g,''));
  const row=(n,v,c)=>`<div><span>${n}</span><b class="${c||''}">${v}</b></div>`;
  const prev=()=>{
    const x=num(A),ok=isFinite(x)&&x>0,add=ok?x:0,tot=P.total+add,sp=tot*.6,rem=P.remaining+add*.6,day=(rem+P.spentToday)/P.daysLeft;
    Pv.innerHTML=row('Balance now',M(ETB0(P.total)))+(ok?row('Extra','+'+M(ETB0(add)),'pos')+row('New total',M(ETB0(tot))):'')+
      row('Spend 60%',M(ETB0(sp)))+row('Backup 40%',M(ETB0(tot*.4)),'pos')+row('Per day · '+P.daysLeft+' days','<u>'+M(ETB0(day))+'</u>');
  };
  prev();
  A.oninput=()=>{D.value='';prev()};
  D.oninput=()=>{const w=num(D);if(!isFinite(w)||w<=0){A.value='';prev();return}
    const need=(w*P.daysLeft-(P.remaining+P.spentToday))/.6;
    if(need<=0){A.value='';prev()}
    else{A.value=fmtIn(Math.ceil(need));prev()}};
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
  <div class="fact">${isAuto()?`<button class="chip" data-ffetch>${ic('save',14)}Fetch new SMS</button>`:`<button class="chip" data-frun>${ic('save',14)}Import new SMS</button>`}<button class="chip" data-fpaste>${ic('save',14)}Paste SMS</button></div>
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
let repDay=null;
function weekBars(){
  const f=F(),t0=sod(Date.now()),a=[];
  for(let i=6;i>=0;i--){const d0=t0-i*DAY,l=f.tx.filter(t=>t.ts>=d0&&t.ts<d0+DAY&&!isX(t));a.push({d:d0,out:l.filter(t=>t.dir==='out'),inn:l.filter(t=>t.dir==='in')})}
  const sel=(repDay!=null&&repDay>=t0-6*DAY&&repDay<=t0)?repDay:t0;
  const sum=l=>l.reduce((x,t)=>x+t.amt,0),mx=Math.max(1,...a.map(x=>sum(x.out)));
  const cur=a.find(x=>x.d===sel)||a[6],tot=sum(cur.out),inn=sum(cur.inn);
  const bars=`<div class="fwk">${a.map(x=>`<button class="${x.d===sel?'sel':''}${x.d===t0?' td':''}" data-fday="${x.d}" aria-label="${esc(dayLabel(x.d))}"><i style="height:${Math.max(4,Math.round(sum(x.out)/mx*100))}%"></i><small>${'SMTWTFS'[new Date(x.d).getDay()]}<br><b>${new Date(x.d).getDate()}</b></small></button>`).join('')}</div>`;
  const xs=f.tx.filter(t=>t.ts>=cur.d&&t.ts<cur.d+DAY&&t.dir==='out'&&isX(t)),items=cur.out.slice().sort((p,q)=>q.ts-p.ts).map(t=>`<div class="fsr" style="cursor:default"><div class="fm"><div class="ft">${esc(t.who||'Money out')}</div><div class="fs">${fmtT(t.ts)}</div></div><div class="fa neg">${M('−'+ETB(t.amt))}</div></div>`).join('');
  const detail=`<div class="fday"><div class="fdh"><b>${esc(dayLabel(cur.d))}</b><span>${new Date(cur.d).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span></div>
    <div class="fspr" style="margin-top:6px"><div><small>Spent</small><b class="${tot?'neg':''}">${M(ETB0(tot))}</b></div><div><small>Received</small><b class="${inn?'pos':''}">${M(ETB0(inn))}</b></div><div><small>Net</small><b class="${inn-tot<0?'neg':inn-tot>0?'pos':''}">${M((inn-tot<0?'−':inn-tot>0?'+':'')+ETB0(Math.abs(inn-tot)))}</b></div></div>
    <p class="fcap" style="margin:6px 2px 0">${inn-tot<0?`Net spent today: <b class="neg">${M(ETB(tot-inn))}</b>`:inn-tot>0?`Net gained: <b class="pos">${M(ETB(inn-tot))}</b>`:'Break-even'} · ${cur.out.length} payment${cur.out.length===1?'':'s'}</p>
    ${items?`<div class="fsl" style="margin-top:4px">${items}</div><div class="fdt"><span>Spent</span><b class="neg">${M('−'+ETB(tot))}</b></div>`:`<p class="fcap" style="margin:8px 2px 0">Nothing spent on this day.</p>`}${xs.length?`<p class="fcap" style="margin:6px 2px 0">Not counted: ${xs.length} own transfer${xs.length>1?'s':''} (${M(ETB0(xs.reduce((a,t)=>a+t.amt,0)))}) between your banks.</p>`:''}</div>`;
  return bars+detail;
}
function vAdvice(){
  const A=advise(),tabs=[['plan','Plan'],['report','Report'],['subs','Subscriptions']];
  const seg=`<div class="chips fchips fseg">${tabs.map(([k,n])=>`<button class="chip ${advTab===k?'on':''}" data-fadv="${k}">${n}</button>`).join('')}</div>`;
  let body='';
  if(advTab==='plan'){
    body=`${planHTML(A)}${payCardHTML(A)}`;
  }else if(advTab==='report'){
    const net=A.got-A.spent,sr=A.mIn>0?Math.round((A.mIn-A.mOut)/A.mIn*100):null;
    const top=A.top.length?`<h2>Top spending</h2><div class="card glass">${A.top.map(([n,v])=>`<div class="frow"><div class="fm"><div class="ft">${esc(n)}</div></div><div class="fa neg">${M('−'+ETB(v))}</div></div>`).join('')}</div>`:'';
    body=`<div class="fsub glass"><div class="fsh"><b class="lb">This month</b>${sr!=null?`<span class="fpill ${sr<10?'bad':'ok'}">Saving ${sr}%</span>`:''}</div>
    <div class="fspr" style="margin-top:2px"><div><small>Money in</small><b class="pos">${M(ETB0(A.got))}</b></div><div><small>Money out</small><b class="neg">${M(ETB0(A.spent))}</b></div><div><small>Net</small><b class="${net<0?'neg':'pos'}">${M((net<0?'−':'')+ETB0(Math.abs(net)))}</b></div></div></div>
    <div class="fsub glass"><div class="fsh"><b class="lb">Last 7 days</b><small class="fcap" style="margin:0">tap a day</small></div>${weekBars()}
    ${A.endBal!=null?`<p class="fcap" style="margin:8px 2px 2px">Month-end balance at this pace: <b class="${A.endBal<0?'neg':''}">${M('ETB '+ETB0(A.endBal))}</b></p>`:''}</div>
    ${top}
    <div class="card glass" style="margin-top:12px">${A.tips.slice(0,3).map(t=>`<div class="tip ${t[0]}"><i></i><span>${esc(MT(t[1]))}</span></div>`).join('')}</div>`;
  }else{
    const rec=A.rec.length?`<h2>Looks recurring</h2><div class="card glass">${A.rec.map((r,i)=>`<div class="frow"><div class="fm"><div class="ft">${esc(r.name)}</div><div class="fs">~ETB ${M(ETB(r.amt))} ${r.per==='week'?'weekly':'monthly'} · next ~${fmtD(r.next)}</div></div><button class="chip on" data-fadd="${i}">+ Add</button></div>`).join('')}</div>`:'';
    body=`${subCardHTML(payTot()>0?payTot():A.mIn)}${rec}`;
  }
  return `${backBtn('home','Master card')}<h1>${ic('activity',26)}Smart advisor</h1><p class="sub">Plan · report · subscriptions</p>${seg}${body}
  <p class="fcap" style="margin:12px 8px 0;text-align:center">Estimates from your SMS, not financial advice.</p>`;
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
  if(!manual&&Date.now()-lastPull<3000)return 0;
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
/* check the inbox every ~4 s while Norie is open (it used to ride on a 25 s throttle, so new bank messages took up to ~30 s to show) */
setInterval(()=>{if(!document.hidden&&hasCloud()&&!pulling)finPull()},4000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')finPull(true)});
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
function finAsk(pre){
  let o=document.getElementById('finask');if(o)o.remove();
  o=document.createElement('div');o.id='finask';
  o.style.cssText='position:fixed;inset:0;z-index:70;background:rgba(80,40,50,.35);display:grid;place-items:center;padding:20px';
  o.innerHTML=`<div class="glass" style="background:#fffaf3;padding:18px;width:min(420px,100%)"><b style="font-size:18px">Import bank SMS</b>
  <div class="hint" style="margin:4px 0 0">Only CBE, Awash Bank and telebirr are accepted — the bank name or its link (e.g. awashbank) anywhere in the message is enough. If a message has neither, pick the bank below.</div>
  <textarea id="fa_t" style="margin-top:12px;min-height:140px" placeholder="Paste one message or your whole history. Put a blank line between messages.">${esc(pre||'')}</textarea>
  <label>Bank</label><select id="fa_b"><option value="">Auto-detect</option>${Object.keys(BANKS).map(k=>`<option value="${BANKS[k].n}">${BANKS[k].n}</option>`).join('')}</select>
  <div class="btns" style="margin-top:14px"><button class="btn small" id="fa_c">Cancel</button><button class="btn main small" id="fa_o">Import</button></div></div>`;
  document.body.append(o);
  o.onclick=e=>{if(e.target===o)o.remove()};
  o.querySelector('#fa_c').onclick=()=>o.remove();
  o.querySelector('#fa_o').onclick=()=>{
    const text=o.querySelector('#fa_t').value,from=o.querySelector('#fa_b').value;
    const q=/#{5}/.test(text)?qParse(text):null;
    const msgs=q?[]:splitMsgs(text,from);
    if(!msgs.length&&!q)return;
    const r=ingest(q?q.map(m=>({from:from||m.from,text:m.text,ts:m.ts})):msgs.map(m=>({from,text:m})));
    o.remove();
    const bits=[];
    if(r.dup)bits.push(r.dup+' duplicate'+(r.dup>1?'s':'')+' skipped');
    if(r.bad)bits.push(r.bad+' not read ('+r.reason+')');
    flash(r.added?`Imported ${r.added} transaction${r.added>1?'s':''}${bits.length?' · '+bits.join(' · '):''}`:(bits.length?'Nothing new — '+bits.join(' · '):'Nothing to import'));
    if(tab==='finance')render();
  };
}

/* ---------- Private mode: import the phone's own queue file (no cloud) ---------- */
function qParse(text){
  /* tolerant: works even if the shortcut glued the date, sender and message together */
  return String(text||'').replace(/\r/g,'').split(/#{5,}/).map(c=>c.trim()).filter(Boolean).map(c=>{
    let ts=0,from='',body=c;
    const m=c.match(/^(\d{4}-\d\d-\d\d(?:[T ]\d\d:\d\d(?::\d\d)?(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)?)?)\s*/);
    if(m){const t=Date.parse(m[1].replace(' ','T'));if(isFinite(t)){ts=t;body=c.slice(m[0].length)}}
    const g=body.match(/^(\+?\d{3,15}|[A-Za-z][A-Za-z0-9_.-]{1,15}?)(?=(?:Dear|Hello|Hi)\b)/);
    if(g){from=g[1];body=body.slice(g[0].length)}
    else{const L=body.split('\n'),l0=(L[0]||'').trim();
      if(L.length>=2&&l0&&l0.length<=30&&!/^(dear|hello|hi)\b/i.test(l0)&&!/\d{1,2}[:\/]\d\d/.test(l0)){from=l0;body=L.slice(1).join('\n')}}
    return{from,text:body.trim(),ts};
  }).filter(x=>x.text);
}
const qItems=text=>qParse(text).filter(x=>SENDER_OK(x.from));
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
  const all=qParse(t),items=all.filter(x=>SENDER_OK(x.from));
  if(!items.length){
    const bad=[...new Set(all.map(x=>x.from||'(no sender)'))].slice(0,3).join(', ');
    flash(!t.trim()?'The clipboard is empty — Norie Read Queue did not copy anything':all.length?`Clipboard has ${all.length} message${all.length>1?'s':''} but none from CBE / 127 / Awash (senders: ${bad})`:`Clipboard has ${t.length} characters but no messages ending in #####`);
    finAsk(t);return;
  }
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
window.finQItems=qItems;window.finQParse=qParse;window.finAdvise=advise;window.finPlan=planInfo;window.finClipImport=finClipImport;window.finSetMode=setMode;

/* ---------- settings: setup card ---------- */
const _vs=vSettings;
vSettings=function(){return _vs()+setupHTML()};
function setupHTML(){
  const auto=isAuto(),url=(S.settings.gasUrl||'').trim(),st=stGet();
  const badge=!auto?['Private',''] :st==='ok'?['Auto ✓','ok']:st==='old'?['Cloud update needed','no']:['Auto',''];
  const btn=(href,label,primary)=>href?`<a class="btn ${primary?'main ':''}small" href="${esc(href)}" target="_blank" rel="noopener" style="text-decoration:none;text-align:center">${label}</a>`:'';
  const modeBar=`<div class="fspr" style="margin:0 0 12px"><div data-fmode="private" style="cursor:pointer;${!auto?'background:var(--pink);color:#fff':''}"><b>Private</b><br><small>stays on this phone</small></div><div data-fmode="auto" style="cursor:pointer;${auto?'background:var(--pink);color:#fff':''}"><b>Auto</b><br><small>uses Norie cloud</small></div></div>`;
  const st_=(t,b)=>`<li class="fst"><div>${t}</div>${b?`<div class="fstb">${b}</div>`:''}</li>`;
  const priv=`
     <p><b>Private mode.</b> Everything stays on this phone. No account, no cloud.</p>
     <ol class="fstl">
       ${st_('Install the three shortcuts.',btn(SHORTCUT_LINK_MAKE,'Make Queue',0)+btn(SHORTCUT_LINK_PRIVATE,'Norie Bank SMS',1)+btn(SHORTCUT_LINK_READ,'Read Queue',0))}
       ${st_('Open <b>Make Queue</b> in Shortcuts and tap ▶ once.')}
       ${st_('Shortcuts → <b>Automation</b> → <b>+</b> → <b>Message</b> → contains <b>ETB</b> → <b>Run Immediately</b> → <b>Run Shortcut</b> → <b>Norie Bank SMS</b>.')}
       ${st_('Back here, tap <b>Import new SMS</b> whenever you want your latest messages.')}
     </ol>
     <div class="btns"><button class="btn main small" id="fin_clip">Import from clipboard</button><button class="btn small" data-fpaste>Paste an SMS</button></div>
     <div class="hint" style="margin-top:8px">Telegram reminders arrive only while Norie is open in Private mode. Use Auto for reminders while the app is closed.</div>`;
  const cloud=`
     <p><b>Auto mode.</b> Bank messages and Telegram reminders keep working when Norie is closed.</p>
     <ol class="fstl">
       ${st_('Sign in: Settings → <b>Account</b> (top of this page).')}
       ${st_('Install the three shortcuts.',btn(SHORTCUT_LINK_MAKE,'Make Queue',0)+btn(SHORTCUT_LINK_PRIVATE,'Norie Bank SMS',1)+btn(SHORTCUT_LINK_SEND,'Send queue',1))}
       ${st_('Open <b>Make Queue</b> in Shortcuts and tap ▶ once.')}
       ${st_('Open <b>Norie send queue global</b> → ••• → in <b>Get contents of URL</b> set <b>p_secret</b> to your key, then Done.','<button class="btn small" id="fin_copyid">Copy my key</button>')}
       ${st_('Shortcuts → <b>Automation</b> → <b>+</b> → <b>Message</b> → contains <b>ETB</b> → <b>Run Immediately</b>. Add two <b>Run Shortcut</b> actions: <b>Norie Bank SMS</b>, then <b>Norie send queue global</b>.')}
     </ol>
     <div class="btns"><button class="btn main small" id="fin_check">Check connection</button><button class="btn small" data-fpaste>Paste an SMS</button>${(window.NorieAccount&&window.NorieAccount.signedIn())?'':'<button class="btn small danger" id="fin_reset">New sync ID</button>'}</div>
     <div class="hl" id="fin_msg">Your key is private. Never share it.</div>`;
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
  const fdy=T.closest('[data-fday]');if(fdy){keep(()=>{repDay=+fdy.dataset.fday});return}
  const fq=T.closest('[data-fwq]');if(fq){keep(()=>{F().wi.push({id:'w'+uid(),amt:+fq.dataset.fwq,u:Date.now()});save()});flash('Added +'+ETB0(+fq.dataset.fwq));return}
  if(T.closest('[data-ffetch]')){const b=T.closest('[data-ffetch]');b.disabled=true;const t0=Date.now();const n=await finPull(true);b.disabled=false;flash(n?'Got '+n+' new transaction'+(n>1?'s':''):'Up to date ✓ ('+((Date.now()-t0)/1000).toFixed(1)+'s)');return}
  if(T.closest('[data-fzero]')){const f=F();f.zero={on:!f.zero.on,u:Date.now()};save();render();flash(f.zero.on?'Starting from 0 — add an amount':'Back to your real balance');return}
  if(T.closest('[data-fpayadd]')){finPayAsk();return}
  const fpy=T.closest('[data-fpay]');if(fpy){finPayAsk(F().pay.find(z=>z.id===fpy.dataset.fpay));return}
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
  if(T.id==='fin_copyid'){copy(getUserKey(),'Key copied');return}
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
    if(window.NorieAccount&&window.NorieAccount.diag&&(S.settings.gasUrl||'')===NorieAccount.SENT){
      out.textContent='Checking…';
      const d=await NorieAccount.diag(),b=document.getElementById('st_fin');
      let m,ok=false;
      if(!d.signedIn)m='✗ Not signed in. The app can’t receive anything until you sign in (Settings → Account).';
      else if(d.keyOk===false)m='✗ Signed in as '+d.email+', but the server does not accept your key ('+(d.err||'bad key')+'). Use Settings → Account → More → Copy shortcut key, and paste exactly that into p_secret in “Norie send queue global”.';
      else if(d.keyOk===null)m='✗ Could not reach the server — check your internet.';
      else{ok=true;await finPull(true);m='✓ Signed in as '+d.email+'. Key ends …'+d.keyTail+' (the p_secret in your shortcut must end the same way). '+(d.pending?d.pending+' message(s) were waiting and have been fetched.':'Inbox is empty: nothing has reached your account yet. If your shortcut just ran, its upload failed — open “Norie send queue global”, tap ▶ and read the result.');}
      out.textContent=m;if(b){b.textContent=ok?'Ready ✓':'Fix needed';b.className='stb '+(ok?'ok':'no')}
      return;
    }
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
.fwk{display:flex;align-items:flex-end;gap:6px;height:118px;margin:10px 0 0}
.fwk button{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:4px;border:0;background:none;padding:0;font:inherit;cursor:pointer;border-radius:12px}
.fwk i{display:block;width:100%;border-radius:8px 8px 4px 4px;background:rgba(244,104,127,.3)}
.fwk button.sel{background:rgba(244,104,127,.1)}.fwk button.sel i{background:linear-gradient(180deg,#ff9aab,var(--pink))}
.fwk small{font-size:10.5px;color:var(--muted);font-weight:600;line-height:1.25;text-align:center}.fwk small b{font-size:12.5px;color:var(--ink)}.fwk .td small b{color:var(--pink)}
.fzc{border:0;border-radius:12px;padding:6px 11px;background:rgba(0,0,0,.07);color:var(--muted);font:inherit;font-weight:700;font-size:12px;cursor:pointer}.fzc.on{background:var(--pink);color:#fff}.fwc button{width:26px!important;height:26px!important}
.fstl{list-style:none;padding:0;margin:10px 0;counter-reset:s}.fst{counter-increment:s;position:relative;display:flex;flex-direction:column;gap:8px;padding:10px 12px 10px 46px;margin-bottom:8px;border-radius:14px;background:rgba(255,255,255,.65);font-size:13.5px;line-height:1.45;color:var(--ink)}.fst::before{content:counter(s);position:absolute;left:12px;top:10px;width:24px;height:24px;border-radius:50%;background:var(--pink);color:#fff;font-weight:800;font-size:12px;display:grid;place-items:center}.fstb{display:flex;flex-wrap:wrap;gap:8px}.fstb .btn{flex:1 1 auto;min-width:96px}
.fwq{display:flex;gap:7px;margin:10px 0 2px}.fq{flex:1;min-height:40px;border:0;border-radius:14px;background:rgba(244,104,127,.13);color:var(--pink);font:inherit;font-weight:800;font-size:14px;cursor:pointer}.fq:active{transform:scale(.96)}.fq.oth{background:rgba(255,255,255,.8);color:var(--ink);box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}
.fwl{margin-top:8px;display:grid;gap:6px}.fwr{display:flex;align-items:center;gap:8px;padding:6px 6px 6px 12px;border-radius:14px;background:rgba(255,255,255,.75);font-size:13.5px}.fwr span{flex:1;color:var(--muted);font-weight:600}.fwr b{font-size:15px}.fwx{min-height:34px;padding:0 12px;border:0;border-radius:11px;background:rgba(244,104,127,.14);color:var(--pink);font:inherit;font-weight:700;font-size:12.5px;cursor:pointer}
.fz{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;margin-top:8px;padding:0 12px;border:0;border-radius:14px;background:rgba(255,255,255,.7);font:inherit;font-weight:700;font-size:13.5px;color:var(--ink);text-align:left;cursor:pointer}.fz i{width:34px;height:20px;border-radius:12px;background:rgba(0,0,0,.18);position:relative;flex:none;transition:background .2s}.fz i::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .2s}.fz.on i{background:var(--pink)}.fz.on i::after{transform:translateX(14px)}
.fwp{margin-top:10px;padding:8px 10px;border-radius:14px;background:rgba(255,255,255,.7);display:grid;gap:5px}.fwp div{display:flex;justify-content:space-between;font-size:13.5px}.fwp span{color:var(--muted);font-weight:600}.fwp u{text-decoration:none;color:var(--pink);font-size:16px}.fwp div:last-child{border-top:1px dashed rgba(0,0,0,.12);padding-top:6px}
.fdt{display:flex;justify-content:space-between;padding:8px 4px 0;border-top:1px dashed rgba(0,0,0,.14);margin-top:4px;font-size:14px}.fdt span{color:var(--muted);font-weight:700}
.fday{margin-top:10px;padding:10px 11px;border-radius:16px;background:rgba(255,255,255,.65)}.fdh{display:flex;justify-content:space-between;align-items:baseline}.fdh b{font-size:15px}.fdh span{font-size:12px;color:var(--muted);font-weight:600}
.fspr.f4 b{font-size:13.5px}.fspr.f4>div{padding-left:2px;padding-right:2px}
.fpt{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:7px 6px;font-size:12px;align-items:center;margin:8px 0 6px}.fpt i{font-style:normal;font-size:10.5px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:var(--muted);text-align:right}.fpt span{color:var(--muted);font-weight:600;font-size:12px}.fpt b{text-align:right;font-variant-numeric:tabular-nums;font-size:12.5px}
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
