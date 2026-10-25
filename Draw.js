/* Norie Draw: sketch systems, group them, zoom out -> names -> report */
function vDraw(){return '<div id="dwrap"></div>'}
(function(){
let cam={x:0,y:0,k:1},tool='pen',col='#3a2a30',cv,cx,live=null,P=new Map(),pin=null,drag=null,W=0,H=0,dpr=1,dirty=true,looping=false,hist=[],styled=false;
const root=()=>(S.draw=S.draw&&S.draw.items?S.draw:{items:[]}).items;
const cl=(v,a,b)=>Math.max(a,Math.min(b,v));
const s2w=(x,y)=>[(x-cam.x)/cam.k,(y-cam.y)/cam.k];
const COLS=['#3a2a30','#f4687f','#c8962e','#2f9e6a'];
const TOOLS=[['pen','Pen'],['text','Text'],['erase','Erase'],['group','Group'],['sel','Move']];

function bb(it){
  if(it.t==='s'){let a=1e15,b=1e15,c=-1e15,d=-1e15;for(let i=0;i<it.p.length;i+=2){a=Math.min(a,it.p[i]);c=Math.max(c,it.p[i]);b=Math.min(b,it.p[i+1]);d=Math.max(d,it.p[i+1])}return{x:a,y:b,w:c-a,h:d-b}}
  if(it.t==='t')return{x:it.x,y:it.y-it.s,w:it.v.length*it.s*.6,h:it.s};
  return{x:it.x,y:it.y,w:it.w,h:it.h};
}
function move(it,dx,dy){
  if(it.t==='s')for(let i=0;i<it.p.length;i+=2){it.p[i]+=dx;it.p[i+1]+=dy}
  else{it.x+=dx;it.y+=dy;if(it.t==='g')it.i.forEach(c=>move(c,dx,dy))}
}
const fade=(g,k)=>cl((Math.min(g.w*k,g.h*k*1.8)-150)/100,0,1);
const inside=(b,x,y)=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h;

function paint(c,items,k,al){
  for(const it of items){
    if(it.t==='s'){
      c.globalAlpha=al;c.strokeStyle=it.c;c.lineWidth=it.w;c.lineCap=c.lineJoin='round';
      c.beginPath();c.moveTo(it.p[0],it.p[1]);
      for(let i=2;i<it.p.length;i+=2)c.lineTo(it.p[i],it.p[i+1]);
      if(it.p.length===2)c.lineTo(it.p[0]+.01,it.p[1]);
      c.stroke();
    }else if(it.t==='t'){
      c.globalAlpha=al;c.fillStyle=it.c;c.font=`600 ${it.s}px -apple-system,Helvetica,sans-serif`;c.textAlign='left';c.fillText(it.v,it.x,it.y);
    }else{
      const f=fade(it,k),r=Math.min(it.w,it.h)*.08;
      if(f<1){
        c.globalAlpha=(1-f)*al;c.fillStyle='rgba(255,232,236,.97)';c.strokeStyle='#c8962e';c.lineWidth=2/k;
        c.beginPath();c.roundRect(it.x,it.y,it.w,it.h,r);c.fill();c.stroke();
        const fs=Math.min(it.h*.4,it.w*.9/Math.max(2,it.l.length*.58));
        c.fillStyle='#3a2a30';c.font=`800 ${fs}px -apple-system,Helvetica,sans-serif`;c.textAlign='center';c.textBaseline='middle';
        c.fillText(it.l,it.x+it.w/2,it.y+it.h/2);c.textBaseline='alphabetic';
      }
      if(f>0){
        c.globalAlpha=f*al;c.strokeStyle='#c8962e';c.lineWidth=1.5/k;c.setLineDash([8/k,6/k]);
        c.beginPath();c.roundRect(it.x,it.y,it.w,it.h,r);c.stroke();c.setLineDash([]);
        const fs=Math.min(18/k,it.h*.14);c.fillStyle='#c8962e';c.font=`800 ${fs}px -apple-system,Helvetica,sans-serif`;c.textAlign='left';
        c.fillText(it.l,it.x+fs*.5,it.y+fs*1.2);
        paint(c,it.i,k,f*al);
      }
    }
  }
  c.globalAlpha=1;
}
function frame(){
  if(cv&&cv.isConnected&&dirty){
    dirty=false;cx.setTransform(dpr,0,0,dpr,0,0);cx.clearRect(0,0,W,H);
    cx.save();cx.translate(cam.x,cam.y);cx.scale(cam.k,cam.k);
    paint(cx,root(),cam.k,1);
    if(live){
      if(live.t==='s')paint(cx,[live],cam.k,1);
      else if(live.t==='r'){cx.strokeStyle='#f4687f';cx.lineWidth=2/cam.k;cx.setLineDash([6/cam.k,5/cam.k]);cx.strokeRect(live.x,live.y,live.w,live.h);cx.setLineDash([])}
    }
    cx.restore();
  }
  requestAnimationFrame(frame);
}
/* deepest open group list containing the point */
function deepest(x,y){
  let list=root(),owner=null,go=true;
  while(go){go=false;for(let i=list.length-1;i>=0;i--){const g=list[i];if(g.t==='g'&&fade(g,cam.k)>.5&&inside(g,x,y)){list=g.i;owner=g;go=true;break}}}
  return{list,owner};
}
function hitGroup(x,y){
  const d=deepest(x,y);
  for(let i=d.list.length-1;i>=0;i--){const g=d.list[i];if(g.t==='g'&&inside(g,x,y))return{g,list:d.list}}
  return d.owner?{g:d.owner,list:null}:null;
}
function zoomTo(g){
  const k=Math.max(Math.min(W/(g.w*1.15),(H-170)/(g.h*1.15)),260/Math.min(g.w,g.h*1.8));
  cam.k=k;cam.x=W/2-(g.x+g.w/2)*k;cam.y=H/2-(g.y+g.h/2)*k;dirty=true;
}
function fit(){
  const it=root();if(!it.length){cam={x:W/2,y:H/2,k:1};dirty=true;return}
  let a=1e15,b=1e15,c=-1e15,d=-1e15;
  it.forEach(i=>{const q=bb(i);a=Math.min(a,q.x);b=Math.min(b,q.y);c=Math.max(c,q.x+q.w);d=Math.max(d,q.y+q.h)});
  const w=Math.max(c-a,40),h=Math.max(d-b,40),k=Math.min(W/(w*1.2),(H-190)/(h*1.2));
  cam.k=k;cam.x=W/2-(a+w/2)*k;cam.y=(H-40)/2-(b+h/2)*k;dirty=true;
}
function tidy(){
  const gs=root().filter(i=>i.t==='g');if(gs.length<2)return;
  const cols=Math.ceil(Math.sqrt(gs.length)),gap=60,cw=Math.max(...gs.map(g=>g.w)),ch=Math.max(...gs.map(g=>g.h));
  const x0=Math.min(...gs.map(g=>g.x)),y0=Math.min(...gs.map(g=>g.y));
  gs.forEach((g,n)=>move(g,x0+(n%cols)*(cw+gap)-g.x,y0+Math.floor(n/cols)*(ch+gap)-g.y));
  save();fit();
}
function erase(x,y){
  const d=deepest(x,y).list,r=14/cam.k;
  for(let i=d.length-1;i>=0;i--){
    const it=d[i];
    if(it.t==='s'){for(let j=0;j<it.p.length;j+=2)if(Math.hypot(it.p[j]-x,it.p[j+1]-y)<r){d.splice(i,1);dirty=true;return true}}
    else if(it.t==='t'&&inside(bb(it),x,y)){d.splice(i,1);dirty=true;return true}
  }
}
function makeGroup(r){
  const cxw=r.x+r.w/2,cyw=r.y+r.h/2,list=deepest(cxw,cyw).list;
  const mine=list.filter(it=>{const b=bb(it);return inside(r,b.x+b.w/2,b.y+b.h/2)});
  if(!mine.length){flash('Draw something inside the box first');return}
  const name=prompt('Name this system');if(!name||!name.trim())return;
  let a=r.x,b=r.y,c=r.x+r.w,d=r.y+r.h;
  mine.forEach(it=>{const q=bb(it);a=Math.min(a,q.x-8);b=Math.min(b,q.y-8);c=Math.max(c,q.x+q.w+8);d=Math.max(d,q.y+q.h+8)});
  const g={t:'g',id:Math.random().toString(36).slice(2,8),l:name.trim().slice(0,40),x:a,y:b-22/cam.k,w:c-a,h:d-b+22/cam.k,i:mine};
  mine.forEach(it=>list.splice(list.indexOf(it),1));list.push(g);save();dirty=true;
}
/* report: outline with thumbnails */
function thumb(g){
  const c=document.createElement('canvas'),w=150,h=100;c.width=w*2;c.height=h*2;c.style.cssText=`width:${w}px;height:${h}px;border-radius:12px;background:#fff8ee;flex:none`;
  const q=c.getContext('2d'),k=Math.min(w/g.w,h/g.h)*.88;q.scale(2,2);q.translate(w/2-(g.x+g.w/2)*k,h/2-(g.y+g.h/2)*k);q.scale(k,k);
  paint(q,[{...g,t:'g'}],k*1.6,1);return c;
}
function repNode(g,depth){
  const d=document.createElement('div');d.className='glass';d.style.cssText=`padding:10px;margin:8px 0 0 ${depth?14:0}px;border-radius:16px`;
  const top=document.createElement('div');top.style.cssText='display:flex;gap:12px;align-items:center';
  const info=document.createElement('div');const subs=g.i.filter(i=>i.t==='g');
  info.innerHTML=`<b style="font-size:${depth?15:18}px">${esc(g.l)}</b><div style="color:var(--muted);font-size:12.5px">${subs.length?subs.length+' subsystem'+(subs.length>1?'s':'')+': '+esc(subs.map(s=>s.l).join(', ')):'No subsystems'}</div>`;
  top.append(thumb(g),info);d.append(top);subs.forEach(s=>d.append(repNode(s,depth+1)));return d;
}
function report(){
  let o=document.getElementById('drep');if(o)o.remove();
  o=document.createElement('div');o.id='drep';
  o.style.cssText='position:fixed;inset:0;z-index:40;overflow:auto;background:rgba(255,248,238,.97);padding:calc(env(safe-area-inset-top) + 16px) 16px 120px';
  const gs=root().filter(i=>i.t==='g');
  o.innerHTML=`<div style="max-width:680px;margin:0 auto"><div class="sh-top"><b>System report</b><button class="x" id="drx">✕</button></div></div>`;
  const box=o.firstChild;
  if(!gs.length)box.insertAdjacentHTML('beforeend','<div class="empty glass">No systems yet. Draw, then use Group.</div>');
  gs.forEach(g=>box.append(repNode(g,0)));
  document.body.append(o);o.querySelector('#drx').onclick=()=>o.remove();
}
function css(){
  if(styled)return;styled=true;const s=document.createElement('style');
  s.textContent='#dwrap{position:fixed;inset:0;z-index:5}#dwrap canvas{position:absolute;inset:0;touch-action:none}#dtb{position:absolute;top:calc(env(safe-area-inset-top) + 8px);left:8px;right:8px;display:flex;gap:6px;overflow-x:auto;padding:2px;scrollbar-width:none}#dtb::-webkit-scrollbar{display:none}#dtb .chip{flex:none;box-shadow:0 2px 8px rgba(200,150,46,.15)}#dtb .sw2{width:30px;height:30px;border-radius:50%;border:3px solid #fff;flex:none;box-shadow:0 2px 6px rgba(0,0,0,.2)}#dtb .sw2.on{outline:2px solid var(--pink)}';
  document.head.append(s);
}
function toolbar(){
  const t=document.getElementById('dtb');
  t.innerHTML=TOOLS.map(([k,n])=>`<button class="chip ${tool===k?'on':''}" data-tl="${k}">${n}</button>`).join('')+COLS.map(c=>`<button class="sw2 ${col===c?'on':''}" style="background:${c}" data-col="${c}" aria-label="color"></button>`).join('')+'<button class="chip" data-a="undo">Undo</button><button class="chip" data-a="fit">Fit</button><button class="chip" data-a="tidy">Tidy</button><button class="chip" data-a="rep">Report</button>';
}
window.mountDraw=function(){
  css();const w=document.getElementById('dwrap');
  w.innerHTML='<canvas></canvas><div id="dtb"></div>';cv=w.firstChild;cx=cv.getContext('2d');
  const size=()=>{dpr=window.devicePixelRatio||1;W=innerWidth;H=innerHeight;cv.width=W*dpr;cv.height=H*dpr;cv.style.width=W+'px';cv.style.height=H+'px';dirty=true};
  size();if(!mountDraw.init){mountDraw.init=1;cam={x:W/2,y:H/2,k:1};addEventListener('resize',size)}
  toolbar();if(!looping){looping=true;requestAnimationFrame(frame)}
  document.getElementById('dtb').onclick=e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.tl){tool=b.dataset.tl}
    else if(b.dataset.col){col=b.dataset.col;tool='pen'}
    else if(b.dataset.a==='undo'){const h=hist.pop();if(h){const i=h[0].indexOf(h[1]);if(i>=0)h[0].splice(i,1);save();dirty=true}}
    else if(b.dataset.a==='fit')fit();
    else if(b.dataset.a==='tidy')tidy();
    else if(b.dataset.a==='rep')report();
    toolbar();
  };
  cv.addEventListener('wheel',e=>{e.preventDefault();const f=Math.exp(-e.deltaY*.0015),nk=cl(cam.k*f,.01,80);cam.x=e.clientX-(e.clientX-cam.x)*nk/cam.k;cam.y=e.clientY-(e.clientY-cam.y)*nk/cam.k;cam.k=nk;dirty=true},{passive:false});
  cv.addEventListener('pointerdown',e=>{
    cv.setPointerCapture(e.pointerId);P.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(P.size===2){live=null;drag=null;const[a,b]=[...P.values()];pin={d:Math.hypot(a.x-b.x,a.y-b.y)||1,mx:(a.x+b.x)/2,my:(a.y+b.y)/2,cam:{...cam}};return}
    if(P.size>2)return;
    const[x,y]=s2w(e.clientX,e.clientY);drag={sx:e.clientX,sy:e.clientY,lx:e.clientX,ly:e.clientY,moved:false,x0:x,y0:y,list:deepest(x,y).list};
    if(tool==='pen')live={t:'s',p:[x,y],c:col,w:2.6/cam.k};
    else if(tool==='group')live={t:'r',x,y,w:0,h:0};
    else if(tool==='erase')erase(x,y);
    else if(tool==='sel'){const h=hitGroup(x,y);drag.g=h&&h.list?h.g:null}
    dirty=true;
  });
  cv.addEventListener('pointermove',e=>{
    if(!P.has(e.pointerId))return;P.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pin&&P.size===2){
      const[a,b]=[...P.values()],d=Math.hypot(a.x-b.x,a.y-b.y),mx=(a.x+b.x)/2,my=(a.y+b.y)/2,c0=pin.cam,nk=cl(c0.k*d/pin.d,.01,80);
      const wx=(pin.mx-c0.x)/c0.k,wy=(pin.my-c0.y)/c0.k;cam.k=nk;cam.x=mx-wx*nk;cam.y=my-wy*nk;dirty=true;return;
    }
    if(!drag)return;
    const[x,y]=s2w(e.clientX,e.clientY),dx=e.clientX-drag.lx,dy=e.clientY-drag.ly;
    if(Math.hypot(e.clientX-drag.sx,e.clientY-drag.sy)>6)drag.moved=true;
    drag.lx=e.clientX;drag.ly=e.clientY;
    if(tool==='pen'&&live){live.p.push(x,y)}
    else if(tool==='group'&&live){live.x=Math.min(drag.x0,x);live.y=Math.min(drag.y0,y);live.w=Math.abs(x-drag.x0);live.h=Math.abs(y-drag.y0)}
    else if(tool==='erase')erase(x,y);
    else if(tool==='sel'&&drag.g&&drag.moved)move(drag.g,dx/cam.k,dy/cam.k);
    else if(tool==='sel'||tool==='text'){cam.x+=dx;cam.y+=dy}
    dirty=true;
  });
  const up=e=>{
    P.delete(e.pointerId);
    if(pin){if(P.size<2)pin=null;drag=null;live=null;return}
    if(!drag)return;const d=drag;drag=null;
    if(tool==='pen'&&live){if(live.p.length>=4||!d.moved){d.list.push(live);hist.push([d.list,live]);save()}live=null}
    else if(tool==='group'&&live){const r=live;live=null;if(r.w*cam.k>14&&r.h*cam.k>14)makeGroup(r)}
    else if(tool==='erase')save();
    else if(tool==='text'&&!d.moved){const v=prompt('Text');if(v&&v.trim()){const it={t:'t',x:d.x0,y:d.y0,s:18/cam.k,v:v.trim().slice(0,80),c:col};d.list.push(it);hist.push([d.list,it]);save()}}
    else if(tool==='sel'){
      if(d.g&&d.moved)save();
      else if(!d.moved){
        const h=hitGroup(d.x0,d.y0);
        if(h){if(fade(h.g,cam.k)<.5)zoomTo(h.g);else{const n=prompt('Rename (leave empty to ungroup)',h.g.l);if(n!==null){
          if(n.trim())h.g.l=n.trim().slice(0,40);
          else{const L=h.list||root();const i=L.indexOf(h.g);if(i>=0){L.splice(i,1,...h.g.i)}}
          save()}}}
      }
    }
    dirty=true;
  };
  cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
};
})();

/* ---- self-install: hooks Draw into Norie (load this script AFTER the main script, right before </body>) ---- */
(function(){
  ICONS.pen=_p('M12 20h9','M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z');
  if(!TABS.some(t=>t[0]==='draw'))TABS.splice(2,0,['draw','pen','Draw']);
  const baseRender=render;
  window.render=function(){
    if(tab!=='draw')return baseRender();
    bar();ORc=null;RBc=null;
    $('#app').innerHTML=vDraw();
    $('#fab').style.display='none';
    if(typeof syncNorie==='function')syncNorie();
    mountDraw();
  };
  const baseMerge=mergeStates;
  window.mergeStates=function(a,b){
    const m=baseMerge(a,b),w=(a.updatedAt||0)>=(b.updatedAt||0)?a:b,o=w===a?b:a;
    m.draw=w.draw||o.draw;return m;
  };
  /* tasks due today jump into Today at midnight, even if a sheet/keyboard was open at that moment */
  let shown=sod(Date.now());
  setInterval(()=>{
    if(sod(Date.now())!==shown&&!isTyping()&&!sheetOpen()&&tab!=='draw'){shown=sod(Date.now());render()}
  },5000);
  render();
})();
