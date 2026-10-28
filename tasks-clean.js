/* Norie Tasks Clean — load AFTER the main script (and after finance.js):  <script src="tasks-clean.js"></script>
   1) Long task text becomes a short, clean title in Today / Upcoming / Lists (the full text is never lost).
   2) Tapping a task opens a tidy report (title, facts, details, notes). "Edit" opens the normal editor.
   Titles are always saved exactly as you type them. */
(function(){
'use strict';

const LIM=46;
const FILL=/^(?:(?:please|pls|kindly)\s+)?(?:remind me (?:to|about|of)|don'?t forget(?: to)?|do not forget(?: to)?|remember to|i (?:need|have|want|must|should|gotta|got) to|(?:we|you) (?:need|have|must|should) to|need to|have to|gotta|must|reminder(?: to|:)?|to ?do:?|task:?)\s+/i;
const TAILW=/\s+(?:and|or|to|the|a|an|of|for|with|in|on|at|by|from|that|is|are|my|your|our|so|but|as)$/i;
const BOUND=/[.!?;:](?=\s|$)|\s[—–-]\s|,\s|\s(?:because|since|so that|which|but|however|also|and then|then|after that)\s/gi;

function cleanTitle(src){
  let s=String(src==null?'':src).replace(/\s+/g,' ').trim();
  if(!s)return '';
  if(s.length<=LIM)return s;
  const noFill=s.replace(FILL,'');
  if(noFill.length>=8)s=noFill;
  let head=null;
  for(const m of s.matchAll(BOUND)){const strong=/^(?:[.!?;:]|\s[—–-]\s)/.test(m[0]);if(m.index>=(strong?8:20)){head=s.slice(0,m.index);break}}
  if(head&&head.length<=LIM)s=head;
  if(s.length>LIM){
    let c=s.slice(0,LIM-1),i=c.lastIndexOf(' ');
    if(i>=20)c=c.slice(0,i);
    while(TAILW.test(c))c=c.replace(TAILW,'');
    s=c.replace(/[\s,;:\-–—]+$/,'')+'…';
  }
  s=s.replace(/[\s,;:\-–—]+$/,'');
  return s.charAt(0).toUpperCase()+s.slice(1);
}

/* split free text into tidy points */
function pts(text){
  const out=[];
  String(text||'').replace(/\r/g,'').split('\n').forEach(line=>{
    line.trim().replace(/([.!?;])\s+/g,'$1\n').replace(/\s[—–]\s|\s-\s/g,'\n').replace(/,\s+(?=(?:and|then|also|but|so|because|after|before|while)\b)/gi,'\n').split('\n').forEach(x=>out.push(x));
  });
  return out.map(x=>x.replace(/^[\s•\-*]+/,'').replace(/[,;\s]+$/,'').trim()).filter(x=>x.length>1).map(x=>x.charAt(0).toUpperCase()+x.slice(1));
}
const bul=a=>!a.length?'':a.length===1?`<p class="trp">${esc(a[0])}</p>`:`<ul class="trl">${a.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;

/* ---------- 1) clean titles in every row ---------- */
const _row=rowHTML;
rowHTML=function(t,c){
  const ct=cleanTitle(t.title);
  return ct===t.title?_row(t,c):_row(Object.assign({},t,{title:ct}),c);
};

/* ---------- 2) tidy report on tap ---------- */
let cur=null;
function nagLabel(n){return n==null?'':n===0?'Once only':n>=60?(n/60)+' hour':'Every '+n+' min'}
function openReport(t){
  cur=t.id;
  let full=String(t.title||'').replace(/\s+/g,' ').trim(),notes=String(t.notes||'').trim();
  /* tasks saved by the earlier version: short title + full sentence as the first paragraph of Notes */
  const first=notes.split('\n\n')[0].replace(/\s+/g,' ').trim();
  if(first.length>full.length&&cleanTitle(first)===full){full=first;notes=notes.split('\n\n').slice(1).join('\n\n').trim()}
  const L=listOf(t.list);
  const late=t.due&&!t.done&&t.due<Date.now(),rp=t.repeat&&t.repeat!=='none';
  const facts=[
    t.due?['When',`<span class="${late?'late':''}">${esc(dayLabel(t.due))}, ${esc(fmtT(t.due))}${late?' · overdue':''}</span>`]:['When','<span class="mu">No date</span>'],
    ['List',`${listIc(L,14)} ${esc(L.name)}`],
    rp?['Repeats',esc(repLabel(t))]:null,
    t.prio?['Priority',`<span class="late">${t.prio===2?'Important':'Medium'}</span>`]:null,
    nagLabel(t.nag)?['Reminder',esc(nagLabel(t.nag))]:null,
    t.created?['Added',esc(fmtD(t.created))]:null,
    t.done?['Status','Done']:null
  ].filter(Boolean);
  const det=notes?`<div class="trs2">Notes</div><div class="trf">${esc(notes)}</div>`:'';
  let o=document.getElementById('trep');if(o)o.remove();
  o=document.createElement('div');o.id='trep';
  o.innerHTML=`<div class="trb" data-rx></div><div class="trc" role="dialog" aria-label="Task details"><div class="grab"></div>
    <div class="trt${full.length>70?' lg':''}">${esc(full||'Untitled')}</div>
    <div class="trk">${facts.map(([k,v])=>`<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
    ${det}
    <div class="btns"><button class="btn main" data-rdone>${t.done?'Reopen':(isRep(t)?'Done for today':'Mark done')}</button><button class="btn" data-redit>Edit</button><button class="btn danger" data-rdel>Delete</button></div></div>`;
  document.body.append(o);
  requestAnimationFrame(()=>o.classList.add('on'));
}
function closeReport(){const o=document.getElementById('trep');if(!o)return;o.classList.remove('on');setTimeout(()=>o.remove(),240);cur=null}

document.getElementById('app').addEventListener('click',e=>{
  const T=e.target;
  if(T.closest('[data-c]'))return;
  const r=T.closest('.row');if(!r||!r.dataset.id)return;
  const t=S.tasks.find(x=>x.id===r.dataset.id);if(!t)return;
  e.stopImmediatePropagation();
  openReport(t);
},true);

document.addEventListener('click',e=>{
  const o=document.getElementById('trep');if(!o||!o.contains(e.target))return;
  const T=e.target,t=S.tasks.find(x=>x.id===cur);
  if(T.closest('[data-rx]')){closeReport();return}
  if(!t)return;
  if(T.closest('[data-rdone]')){closeReport();complete(t.id);return}
  if(T.closest('[data-redit]')){closeReport();openSheet(t);return}
  if(T.closest('[data-rdel]')){if(confirm('Delete task?')){closeReport();dismissToast(t.id);S.tasks=S.tasks.filter(x=>x!==t);save();render()}return}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeReport()});

window.cleanTitle=cleanTitle;

/* ---------- styles ---------- */
const css=document.createElement('style');
css.textContent=`
#trep{position:fixed;inset:0;z-index:40;pointer-events:none}
#trep .trb{position:absolute;inset:0;background:rgba(80,40,50,.3);opacity:0;transition:opacity .22s}
#trep.on{pointer-events:auto}#trep.on .trb{opacity:1}
#trep .trc{position:absolute;left:0;right:0;bottom:0;margin:0 auto;width:min(680px,100%);max-height:88vh;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:18px 20px calc(env(safe-area-inset-bottom) + 20px);border-radius:30px 30px 0 0;background:rgba(255,250,243,.99);box-shadow:0 -10px 34px rgba(120,60,70,.18);transform:translate3d(0,105%,0);transition:transform .26s cubic-bezier(.2,.9,.25,1)}
#trep.on .trc{transform:translate3d(0,0,0)}
#trep .grab{width:42px;height:5px;border-radius:5px;background:rgba(120,90,90,.25);margin:0 auto 16px}
#trep .trt.lg{font-size:20px;line-height:1.3;letter-spacing:-.2px}
#trep .trt{font-size:24px;font-weight:800;line-height:1.2;letter-spacing:-.4px;margin:0 2px 14px;word-break:break-word}
#trep .trk{border-radius:18px;background:rgba(255,255,255,.7);box-shadow:inset 0 1px 0 #fff;padding:2px 14px}
#trep .trk>div{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:11px 0;font-size:14.5px}
#trep .trk>div+div{border-top:1px solid rgba(160,120,100,.14)}
#trep .trk span{color:var(--muted);font-weight:600}#trep .trk b{font-weight:600;text-align:right;display:inline-flex;align-items:center;gap:5px}
#trep .late{color:var(--pink)}#trep .mu{color:var(--muted);font-weight:500}
#trep .trs2{font-size:11.5px;font-weight:700;letter-spacing:.8px;color:var(--gold);margin:18px 4px 6px;text-transform:uppercase}
#trep .trf{margin:0 4px;font-size:15.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word}
#trep .trp{margin:0 4px;font-size:15px;line-height:1.5}
#trep .trl{margin:0;padding:0 4px 0 22px;font-size:15px;line-height:1.45}#trep .trl li{margin:5px 0;padding-left:2px}
#trep .trl li::marker{color:var(--pink)}
#trep .btns{margin-top:22px}
`;
document.head.appendChild(css);
})();
