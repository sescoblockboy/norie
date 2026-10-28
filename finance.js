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
  const i=txt.search(IN),o=txt.search(OUT);
  let dir=null;if(i>=0&&(o<0||i<o))dir='in';else if(o>=0)dir='out';
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

/* ---------- state ---------- */
const F=()=>{S.fin=(S.fin&&Array.isArray(S.fin.tx))?S.fin:{tx:[],del:{}};S.fin.del=S.fin.del||{};S.fin.subs=Array.isArray(S.fin.subs)?S.fin.subs:[];return S.fin};
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
function ingest(items){
  const f=F(),have=new Set(f.tx.map(t=>t.id));let added=0,dup=0,bad=0,reason='';
  for(const it of items||[]){
    const p=parse(it.text,it.from);if(!p){bad++;if(!reason)reason=why(it.text,it.from);continue}
    p.id='f'+hsh(p.bank+'|'+String(it.text).replace(/\s+/g,' ').trim());
    p.ts=+it.ts||p.when||Date.now();delete p.when;
    if(have.has(p.id)||f.del[p.id]||f.tx.some(t=>same(p,t))){dup++;continue}
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
function subCardHTML(income){
  const subs=F().subs,m=subs.reduce((a,s)=>a+perMo(s),0);
  const head=`<div class="fsh"><b class="lb">${ic('repeat',16)}Subscriptions</b><button class="chip on" data-fsubadd>+ Add</button></div>`;
  if(!subs.length)return `<div class="fsub glass">${head}<p class="fcap" style="margin:6px 2px 2px">Add what you pay for regularly and see the cost over 1 month, 6 months and a year.</p></div>`;
  const pct=income>0?Math.round(m/income*100):null;
  return `<div class="fsub glass">${head}
  <div class="fsbig"><b class="neg">${M('−'+ETB(m))}</b><small>ETB every month</small></div>
  <div class="fspr"><div><small>1 month</small><b>${M(ETB0(m))}</b></div><div><small>6 months</small><b>${M(ETB0(m*6))}</b></div><div><small>1 year</small><b>${M(ETB0(m*12))}</b></div></div>
  ${pct!=null?`<p class="fcap" style="margin:8px 2px 4px">About <b class="neg">${pct}%</b> of your average monthly income.</p>`:''}
  <div class="fsl">${subs.slice().sort((a,b)=>perMo(b)-perMo(a)).map(s=>`<div class="fsr" data-fsub="${s.id}"><div class="fm"><div class="ft">${esc(s.name)}</div><div class="fs">${PER[s.per][0]}${s.per==='month'?'':' · '+M(ETB(perMo(s)))+' / mo'}</div></div><div class="fa neg">${M('−'+ETB(s.amt))}</div></div>`).join('')}</div></div>`;
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
  <div class="fact"><button class="chip" data-fpaste>${ic('save',14)}Paste SMS</button></div>
  ${empty?`<p class="fcap" style="text-align:center">No messages yet — paste your bank SMS, or <a href="#" data-fsetup>set up the iPhone Shortcut</a>.</p>`:''}
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
function vAdvice(){
  const A=advise();
  const rec=A.rec.length?`<h2>Looks recurring</h2><div class="card glass">${A.rec.map((r,i)=>`<div class="frow"><div class="fm"><div class="ft">${esc(r.name)}</div><div class="fs">~ETB ${M(ETB(r.amt))} ${r.per==='week'?'weekly':'monthly'} · next ~${fmtD(r.next)}</div></div><button class="chip on" data-fadd="${i}">+ Add</button></div>`).join('')}</div>`:'';
  const top=A.top.length?`<h2>Top spending this month</h2><div class="card glass">${A.top.map(([n,v])=>`<div class="frow"><div class="fm"><div class="ft">${esc(n)}</div></div><div class="fa neg">${M('−'+ETB(v))}</div></div>`).join('')}</div>`:'';
  return `${backBtn('home','Master card')}<h1>${ic('activity',26)}Smart advisor</h1><p class="sub">Forecast from your SMS history</p>
  <div class="fsub glass"><div class="fspr" style="margin-top:0">
    <div><small>Spend / day</small><b>${M(ETB0(A.dailyOut))}</b></div>
    <div><small>Month-end spend</small><b>${M(ETB0(A.projSpend))}</b></div>
    <div><small>Balance lasts</small><b>${A.runway==null?'—':Math.floor(A.runway)+' d'}</b></div></div>
    ${A.endBal!=null?`<p class="fcap" style="margin:10px 2px 2px">If no more money comes in, your balance at month end is about <b class="${A.endBal<0?'neg':''}">${M('ETB '+ETB0(A.endBal))}</b> (${A.left} day${A.left===1?'':'s'} left).</p>`:''}</div>
  <h2>Advice</h2><div class="card glass">${A.tips.map(t=>`<div class="tip ${t[0]}"><i></i><span>${esc(MT(t[1]))}</span></div>`).join('')}</div>
  <h2>Subscriptions</h2>${subCardHTML(A.mIn)}
  ${rec}${top}
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
  if(tab!=='finance'){if(!hide)lockNow();return _render()}
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

/* ---------- settings: setup card ---------- */
const _vs=vSettings;
vSettings=function(){return _vs()+setupHTML()};
function setupHTML(){
  const url=(S.settings.gasUrl||'').trim(),st=stGet();
  const badge=!url?['Needs Cloud',''] :st==='ok'?['Ready ✓','ok']:st==='old'?['Update Code.gs','no']:['Not checked',''];
  return `<details class="glass setrow" id="finsetup">
   <summary><b class="lb">${ic('dollar')}Finance (bank SMS)</b><span class="stb ${badge[1]}" id="st_fin">${badge[0]}</span></summary>
   <div class="setwrap">
     <p>Two small Shortcuts: one saves every bank SMS to a file on your phone (works offline), the other sends the file to Norie whenever there is internet.</p>
     <label>Your sync ID</label><input id="fin_uid" value="${esc(getUserKey())}" readonly>
     <label>Web App URL</label><input id="fin_url" value="${esc(url)}" readonly>
     <div class="btns"><button class="btn small" id="fin_copyurl">Copy URL</button><button class="btn small" id="fin_copyid">Copy ID</button></div>
     <ol class="steps">
       <li><b>Shortcut “Norie Send Queue”</b>: Get File <b>queue.txt</b> → Text (the File) → Get Contents of URL (POST, JSON: <b>action</b>=smsq, <b>userId</b>=your sync ID, <b>q</b>=Text) → if <b>status</b> is <b>ok</b>, save an empty Text over queue.txt.</li>
       <li><b>Automation “Message”</b> (sender: CBE / 127 / Awash Bank): Text = date, Sender, Content, <b>#####</b> → Append to Text File queue.txt → Run Shortcut Norie Send Queue. Run Immediately.</li>
       <li><b>Automation “Wi-Fi”</b> + <b>“Airplane Mode off”</b>: Run Shortcut Norie Send Queue.</li>
       <li>Tap <b>Check connection</b> below.</li>
     </ol>
     <div class="btns"><a class="btn small gold" href="shortcuts://" style="text-decoration:none;text-align:center">Open Shortcuts</a><button class="btn main small" id="fin_check">Check connection</button></div>
     <div class="hl" id="fin_msg">The cloud script (Code.gs) also needs the small Finance addition — see finance-cloud.gs.</div>
     <div class="btns"><button class="btn small" data-fpaste>Paste an SMS manually</button></div>
   </div>
  </details>`;
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
  const fsb=T.closest('[data-fsub]');if(fsb){finSubAsk(F().subs.find(x=>x.id===fsb.dataset.fsub));return}
  const fa=T.closest('[data-fadd]');
  if(fa){const r=lastRec[+fa.dataset.fadd];if(r){F().subs.push({id:'s'+uid(),name:String(r.name).slice(0,40),amt:r.amt,per:r.per,u:Date.now()});save();render();flash('Added to subscriptions')}return}
  if(T.closest('[data-fpaste]')){finAsk();return}
  if(T.id==='fin_copyurl'){copy(S.settings.gasUrl||'','URL copied');return}
  if(T.id==='fin_copyid'){copy(getUserKey(),'ID copied');return}
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

window.finParse=parse;
dedupeAll();
render();
finPull(true);
})();
