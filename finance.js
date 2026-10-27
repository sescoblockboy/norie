/* Norie Finance plug-in — load AFTER the main script:  <script src="finance.js"></script>
   Adds a Finance tab (telebirr / CBE / Awash), an SMS parser, a cloud inbox pull and a setup card in Settings. */
(function(){
'use strict';

/*PARSE_START*/
const BANKS={
  telebirr:{n:'telebirr',s:/tele\s?birr|^\+?(?:251)?127$/i,t:/tele\s?birr/i},
  cbe:{n:'CBE',s:/\bcbe\b|commercial\s*bank/i,t:/\bcbe\b|commercial\s*bank/i},
  awash:{n:'Awash',s:/awash/i,t:/awash/i}
};
const num=s=>parseFloat(String(s).replace(/,/g,''));
function bankOf(from,text){
  for(const k in BANKS)if(BANKS[k].s.test(String(from||'').trim()))return k;
  for(const k in BANKS)if(BANKS[k].t.test(text||''))return k;
  return null;
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
  const IN=/credit|received|deposit|refund|cash in/i,OUT=/debit|transferr|\bsent\b|paid|payment|withdraw|purchas|bought|airtime|recharge|\bbill/i;
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
/*PARSE_END*/

/* ---------- state ---------- */
const F=()=>{S.fin=(S.fin&&Array.isArray(S.fin.tx))?S.fin:{tx:[],del:{}};S.fin.del=S.fin.del||{};S.fin.subs=Array.isArray(S.fin.subs)?S.fin.subs:[];return S.fin};
const hsh=s=>{let h=5381;for(let i=0;i<s.length;i++)h=(h*33^s.charCodeAt(i))>>>0;return h.toString(36)};
const ETB=v=>Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
function ingest(items){
  const f=F(),have=new Set(f.tx.map(t=>t.id));let n=0;
  for(const it of items||[]){
    const p=parse(it.text,it.from);if(!p)continue;
    p.id='f'+hsh(p.bank+'|'+String(it.text).replace(/\s+/g,' ').trim());
    if(have.has(p.id)||f.del[p.id])continue;
    p.ts=+it.ts||p.when||Date.now();delete p.when;f.tx.push(p);have.add(p.id);n++;
  }
  if(n){f.tx.sort((a,b)=>b.ts-a.ts);if(f.tx.length>2000)f.tx.length=2000;save()}
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

/* ---------- views ---------- */
let mode='all'; /* all | cards | telebirr | cbe | awash */
Object.assign(ICONS,{arrowUp:_p('M12 19V5','m5 12 7-7 7 7'),arrowDown:_p('M12 5v14','m19 12-7 7-7-7')});
const mstart=()=>{const d=new Date();d.setDate(1);d.setHours(0,0,0,0);return d.getTime()};
function stats(list){const m=mstart();let i=0,o=0;list.forEach(t=>{if(t.ts>=m){t.dir==='in'?i+=t.amt:o+=t.amt}});return{i,o}}
const latestBal=l=>{const t=l.find(x=>x.bal!=null);return t?t.bal:null};
function rowF(t){
  return `<div class="frow" data-ftx="${t.id}"><div class="fic ${t.dir}">${ic(t.dir==='in'?'arrowDown':'arrowUp',16)}</div>
  <div class="fm"><div class="ft">${esc(t.who||(t.dir==='in'?'Money in':'Money out'))}</div><div class="fs">${BANKS[t.bank].n} · ${fmtT(t.ts)}${t.bal!=null?' · Bal '+ETB(t.bal):''}</div></div>
  <div class="fa ${t.dir==='in'?'pos':'neg'}">${t.dir==='in'?'+':'−'}${ETB(t.amt)}</div></div>`;
}
function listHTML(list){
  if(!list.length)return`<div class="empty glass">${ic('dollar',24)}<div style="margin-top:6px">No transactions yet.</div></div>`;
  const g=new Map();list.slice(0,200).forEach(t=>{const k=sod(t.ts);if(!g.has(k))g.set(k,[]);g.get(k).push(t)});
  return [...g].map(([k,a])=>`<h2>${dayLabel(k)}</h2><div class="card glass">${a.map(rowF).join('')}</div>`).join('');
}
function cardsHTML(){
  const f=F();
  return Object.keys(BANKS).map(k=>{
    const l=f.tx.filter(t=>t.bank===k),s=stats(l),b=latestBal(l);
    return `<div class="fcard glass" data-fbank="${k}"><div class="fbadge b-${k}">${esc(BANKS[k].n[0].toUpperCase())}</div>
    <div class="fci"><div class="fcn">${BANKS[k].n}</div><div class="fcs">${l.length} transaction${l.length===1?'':'s'}${l[0]?' · last '+dayLabel(l[0].ts):''}</div>
    <div class="fcm"><span class="pos">+${ETB(s.i)}</span><span class="neg">−${ETB(s.o)}</span><i>this month</i></div></div>
    <div class="fcb"><small>Balance</small><b>${b==null?'—':ETB(b)}</b></div></div>`;
  }).join('');
}
/* ---------- subscriptions: what they cost over time ---------- */
const PER={week:['Weekly',52/12],month:['Monthly',1],year:['Yearly',1/12]};
const perMo=s=>s.amt*(PER[s.per]||PER.month)[1];
function subCardHTML(income){
  const subs=F().subs,m=subs.reduce((a,s)=>a+perMo(s),0);
  const head=`<div class="fsh"><b class="lb">${ic('repeat',16)}Subscriptions</b><button class="chip on" data-fsubadd>+ Add</button></div>`;
  if(!subs.length)return `<div class="fsub glass">${head}<p class="fcap" style="margin:6px 2px 2px">Add the subscriptions you pay for and see what they cost you over 1 month, 6 months and a year.</p></div>`;
  const pct=income>0?Math.round(m/income*100):null;
  return `<div class="fsub glass">${head}
  <div class="fsbig"><b class="neg">−${ETB(m)}</b><small>ETB every month</small></div>
  <div class="fspr"><div><small>1 month</small><b>${ETB(m)}</b></div><div><small>6 months</small><b>${ETB(m*6)}</b></div><div><small>1 year</small><b>${ETB(m*12)}</b></div></div>
  ${pct!=null?`<p class="fcap" style="margin:8px 2px 4px">That’s about <b class="neg">${pct}%</b> of the money you received this month.</p>`:''}
  <div class="fsl">${subs.slice().sort((a,b)=>perMo(b)-perMo(a)).map(s=>`<div class="fsr" data-fsub="${s.id}"><div class="fm"><div class="ft">${esc(s.name)}</div><div class="fs">${PER[s.per][0]}${s.per==='month'?'':' · '+ETB(perMo(s))+' / mo'}</div></div><div class="fa neg">−${ETB(s.amt)}</div></div>`).join('')}</div></div>`;
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
window.vFinance=function(){
  const f=F(),bank=BANKS[mode]?mode:null;
  const list=bank?f.tx.filter(t=>t.bank===bank):f.tx,s=stats(list);
  const cap=mode==='all'?'Tap “All” to split by bank':mode==='cards'?'Tap a bank to open it · tap “All” for every transaction':'Tap “All” to see every transaction';
  const body=mode==='cards'?cardsHTML():(f.tx.length||bank)?listHTML(list):
    `<div class="empty glass">${ic('dollar',26)}<div style="margin-top:8px;font-weight:700;color:var(--ink)">No transactions yet</div>
     <div style="margin-top:4px;font-size:13px">Set up the iPhone Shortcut once and your bank SMS will appear here.</div>
     <div class="btns"><button class="btn main small" data-fsetup>Open setup</button></div></div>`;
  return `<h1>${ic('dollar',26)}${bank?BANKS[bank].n:'Finance'}</h1><p class="sub">${mode==='cards'?'By bank':bank?list.length+' transactions':'All banks · '+f.tx.length+' transactions'}</p>
  <div class="fsum glass"><div class="fs1"><small>Money in</small><b class="pos">+${ETB(s.i)}</b></div><div class="fs1"><small>Money out</small><b class="neg">−${ETB(s.o)}</b></div><div class="fs1"><small>Net · month</small><b>${s.i-s.o<0?'−':''}${ETB(Math.abs(s.i-s.o))}</b></div></div>
  ${bank?'':subCardHTML(s.i)}
  <div class="chips fchips"><button class="chip ${mode==='all'?'on':''}" data-fall>All</button>${mode==='cards'||bank?'<span class="fcur">'+(bank?BANKS[bank].n:'By bank')+'</span>':''}</div>
  <p class="fcap">${cap}</p>
  ${body}
  <div class="btns"><button class="btn small" data-fpaste>Paste SMS</button><button class="btn small" data-fpull>Refresh</button></div>`;
};

/* tab + render hooks (no edit to render() needed) */
TABS.splice(4,0,['finance','dollar','Finance']);
const _render=render;
render=function(){
  if(tab!=='finance')return _render();
  bar();ORc=null;RBc=null;
  $('#app').innerHTML=vFinance();
  $('#fab').style.display='none';
  if(typeof syncNorie==='function')syncNorie();
};

/* ---------- cloud inbox pull ---------- */
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
    const n=ingest(r.items);
    gasCall({action:'smsack',ids:r.items.map(x=>x.id)}).catch(()=>{});
    if(n){if(tab==='finance'&&!isTyping()&&!sheetOpen())render();flash('Finance: '+n+' new transaction'+(n>1?'s':''))}
    return n;
  }catch(_){return 0}finally{pulling=false}
}
const _lg=loadFromGas;
loadFromGas=async function(force){const r=await _lg(force);finPull();return r};

/* ---------- paste SMS modal ---------- */
function finAsk(){
  let o=document.getElementById('finask');if(o)o.remove();
  o=document.createElement('div');o.id='finask';
  o.style.cssText='position:fixed;inset:0;z-index:70;background:rgba(80,40,50,.35);display:grid;place-items:center;padding:20px';
  o.innerHTML=`<div class="glass" style="background:#fffaf3;padding:18px;width:min(420px,100%)"><b style="font-size:18px">Paste bank SMS</b>
  <textarea id="fa_t" style="margin-top:12px;min-height:130px" placeholder="Paste one or many messages. Leave a blank line between messages."></textarea>
  <label>Bank</label><select id="fa_b"><option value="">Auto-detect</option>${Object.keys(BANKS).map(k=>`<option value="${BANKS[k].n}">${BANKS[k].n}</option>`).join('')}</select>
  <div class="btns" style="margin-top:14px"><button class="btn small" id="fa_c">Cancel</button><button class="btn main small" id="fa_o">Add</button></div></div>`;
  document.body.append(o);
  o.querySelector('#fa_c').onclick=()=>o.remove();
  o.querySelector('#fa_o').onclick=()=>{
    const text=o.querySelector('#fa_t').value,from=o.querySelector('#fa_b').value;
    const msgs=text.replace(/\r/g,'').split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);
    if(!msgs.length)return;
    const n=ingest(msgs.map(m=>({from,text:m})));
    o.remove();
    flash(n?`Added ${n} of ${msgs.length} message${msgs.length>1?'s':''}`:(msgs.length>1?'Nothing new — no bank transactions found, or already added':'Couldn’t read that message (no bank or amount found), or already added'));
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
     <p>An iPhone Shortcut automation sends each bank SMS to your cloud script; Norie picks them up and sorts them into telebirr, CBE and Awash. Needs Cloud Sync.</p>
     <label>Your sync ID</label><input id="fin_uid" value="${esc(getUserKey())}" readonly>
     <label>Web App URL</label><input id="fin_url" value="${esc(url)}" readonly>
     <div class="btns"><button class="btn small" id="fin_copyurl">Copy URL</button><button class="btn small" id="fin_copyid">Copy ID</button></div>
     <ol class="steps">
       <li>Shortcuts app → <b>Automation</b> → <b>+</b> → <b>Message</b>.</li>
       <li>Message Contains: <b>ETB</b> (add a second one for <b>Birr</b> if a bank uses it). Choose <b>Run Immediately</b>.</li>
       <li>New blank automation → action <b>Get Contents of URL</b>. URL = the one above. Show More → Method <b>POST</b>, Request Body <b>JSON</b>.</li>
       <li>Add 4 fields: <b>action</b> = sms · <b>userId</b> = your sync ID · <b>from</b> = Shortcut Input › Sender · <b>text</b> = Shortcut Input › Content.</li>
       <li>Come back here and tap <b>Check connection</b>.</li>
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
  if(T.closest('[data-fall]')){mode=mode==='all'?'cards':'all';render();return}
  const fb=T.closest('[data-fbank]');if(fb){mode=fb.dataset.fbank;render();return}
  const fx=T.closest('[data-ftx]');
  if(fx){if(confirm('Delete this transaction?')){const f=F();f.del[fx.dataset.ftx]=Date.now();f.tx=f.tx.filter(t=>t.id!==fx.dataset.ftx);save();render()}return}
  if(T.closest('[data-fsetup]')){tab='settings';render();setTimeout(()=>{const d=document.getElementById('finsetup');if(d){d.open=true;d.scrollIntoView({block:'start'})}},60);return}
  if(T.closest('[data-fsubadd]')){finSubAsk();return}
  const fsb=T.closest('[data-fsub]');if(fsb){finSubAsk(F().subs.find(x=>x.id===fsb.dataset.fsub));return}
  if(T.closest('[data-fpaste]')){finAsk();return}
  if(T.closest('[data-fpull]')){
    if(!hasCloud()){flash('Cloud Sync is off — paste an SMS instead');return}
    const n=await finPull(true);flash(n?n+' new transaction'+(n>1?'s':''):'Up to date');return;
  }
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
.fchips{margin:6px 2px 2px;align-items:center}.fcur{font-size:13px;font-weight:700;color:var(--muted)}
.fcap{font-size:12px;color:var(--muted);margin:0 6px 6px}
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
render();
finPull(true);
})();
