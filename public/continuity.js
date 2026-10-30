/* Continuidad de presentación. No escribe en snapshots ni en la simulación. */
(function(root){
  'use strict';
  const TICK=1000/60,ST=['run','slide','recover','down','spin','croq','step','fake','rainbow','fooled','hold','dive'];
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const alpha=(dt,tau)=>1-Math.exp(-Math.max(0,Math.min(dt,.05))/tau);
  const ease=t=>{t=clamp(t);return t*t*(3-2*t);};
  const angle=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
  const turn=(a,b,dt,rate=9)=>a+clamp(angle(a,b),-rate*clamp(dt,0,.05),rate*clamp(dt,0,.05));
  const rotationAlpha=(distance,dt,rate=24)=>distance>1e-8?Math.min(alpha(dt,.035),rate*clamp(dt,0,.05)/distance):alpha(dt,.035);
  function createClock(){
    // offset: llegada más temprana vista (los paquetes demorados no la mueven; sube despacio si la ruta empeora).
    // late: pico de demora sobre esa base, decae lento. delay (buffer) cubre ese pico: crece rápido, baja despacio,
    // así cortes y ráfagas (wifi, celular, long-polling) no traban ni aceleran la imagen.
    const c={offset:null,late:0,jitter:0,delay:4,cursor:null,lastTick:-Infinity,lastArrival:0,lastFrame:null,resumed:false};
    c.receive=(tick,now)=>{
      if(tick<=c.lastTick)return false;
      const off=now/TICK-tick;
      if(c.offset===null)c.offset=off;
      else{
        const gap=Math.min(250,now-c.lastArrival),error=Math.abs((now-c.lastArrival)/TICK-(tick-c.lastTick));
        c.jitter+=(Math.min(error,12)-c.jitter)*.08;
        c.offset=Math.min(off,c.offset+gap/TICK*.01);
        c.late=Math.max(off-c.offset,c.late-gap/TICK*.02);
        const want=clamp(c.late+1.5,4,30);
        c.delay+=(want-c.delay)*(want>c.delay?.5:1-Math.exp(-gap/4000));
      }
      c.lastTick=tick;c.lastArrival=now;return true;
    };
    c.advance=now=>{
      if(c.offset===null)return null;
      const target=now/TICK-c.offset-c.delay,gap=c.lastFrame===null?0:now-c.lastFrame;
      c.resumed=gap>250||(c.cursor!==null&&Math.abs(target-c.cursor)>40);
      if(c.cursor===null||c.resumed)c.cursor=target;
      else c.cursor+=Math.min(50,Math.max(0,gap))/TICK*(1+clamp((target-c.cursor)*.05,-.08,.08));
      c.lastFrame=now;return c.cursor;
    };
    c.reset=()=>{c.offset=c.cursor=c.lastFrame=null;c.late=c.jitter=0;c.delay=4;c.lastTick=-Infinity;c.lastArrival=0;};
    return c;
  }
  const row=(s,id)=>{if(!s)return null;for(let i=0;i<s.p.length;i++)if(s.p[i][0]===id)return s.p[i];return null;};
  function height(z0,z1,k,d){
    if(d<=0)return z1;
    const v=(z1-z0)/d,g=z0>0||z1>0?.32:0,k2=k*k,k3=k2*k;
    return Math.max(0,(2*k3-3*k2+1)*z0+(k3-2*k2+k)*(v+g*d/2)*d+(-2*k3+3*k2)*z1+(k3-k2)*(v-g*d/2)*d);
  }
  function createSampler(){
    const pool=new Map(),out={t:0,state:'',owner:0,players:[],byId:pool,ball:{x:0,y:0,z:0},rp:0,pt:0};
    function sample(list,t,count=list.length){
      if(!count)return null;
      let i=count-1;while(i>0&&list[i].t>t)i--;
      const a=list[i],b=list[Math.min(i+1,count-1)],gap=b.t-a.t;
      const k=gap?clamp((t-a.t)/gap):0,source=gap&&k<1?a:b;
      const extrap=i===count-1?clamp(t-a.t,0,6):0,prev=i===count-1&&i>0?list[i-1]:null,d=prev?Math.max(1,a.t-prev.t):1;
      out.t=extrap?a.t+extrap:gap?a.t+k*gap:a.t;out.state=source.s;out.owner=source.o;out.rp=source.rp||0;out.pt=source.pt||0;
      let playerCount=0;
      for(let j=0;j<source.p.length;j++){
        const q=source.p[j],id=q[0],pa=row(a,id)||q,pb=row(b,id)||pa,pp=row(prev,id);
        let p=pool.get(id);if(!p){p={id,x:0,y:0,face:0,st:'run',flags:0,stam:0,charge:0,speed:0};pool.set(id,p);}
        const jump=Math.hypot(pb[1]-pa[1],pb[2]-pa[2])>60;
        p.x=pa[1]+(jump?0:(pb[1]-pa[1])*k);p.y=pa[2]+(jump?0:(pb[2]-pa[2])*k);p.face=pa[3]+angle(pa[3],pb[3])*k;
        let vx=0,vy=0;
        if(pp&&Math.hypot(pa[1]-pp[1],pa[2]-pp[2])<=60){vx=(pa[1]-pp[1])/d;vy=(pa[2]-pp[2])/d;const limit=Math.min(1,7.5/(Math.hypot(vx,vy)||1));vx*=limit;vy*=limit;p.x+=vx*extrap;p.y+=vy*extrap;p.face+=clamp(angle(pp[3],pa[3])/d,-.15,.15)*extrap;}
        else if(!jump&&gap){vx=(pb[1]-pa[1])/gap;vy=(pb[2]-pa[2])/gap;}
        p.speed=Math.min(7.5,Math.hypot(vx,vy));p.st=ST[q[4]]||'run';p.stam=q[5];p.charge=q[6];p.flags=q[7];out.players[playerCount++]=p;
      }
      out.players.length=playerCount;
      const ballJump=Math.hypot(b.b[0]-a.b[0],b.b[1]-a.b[1])>80;
      for(let j=0;j<3;j++){
        let v=ballJump?a.b[j]:j===2?height(a.b[2],b.b[2],k,gap):a.b[j]+(b.b[j]-a.b[j])*k;
        if(prev&&prev.o===a.o&&Math.hypot(a.b[0]-prev.b[0],a.b[1]-prev.b[1])<=80){
          const velocity=clamp((a.b[j]-prev.b[j])/d,-22,22);
          v=a.b[j]+velocity*extrap-(j===2&&!a.o?.16*extrap*(extrap+d):0);
        }
        out.ball[j===0?'x':j===1?'y':'z']=j===2?Math.max(0,v):v;
      }
      return out;
    }
    return {sample,reset(){pool.clear();out.players.length=0;}};
  }
  function createPresenter(){
    const pool=new Map(),out={t:0,state:'',owner:0,players:[],byId:pool,ball:null,rp:0,pt:0,discontinuity:false,maxStep:0};
    function entity(raw,key,dt,isBall){
      let p=pool.get(key);
      if(!p){p={id:raw.id,x:raw.x,y:raw.y,z:raw.z||0,face:raw.face||0,alpha:1,rx:raw.x,ry:raw.y,ox:0,oy:0,age:1,fade:0};pool.set(key,p);}
      const jump=Math.hypot(raw.x-p.rx,raw.y-p.ry);
      if(jump>(isBall?80:60)){
        out.discontinuity=true;
        if(jump>240)p.fade=1;
        else{p.ox=p.x-raw.x;p.oy=p.y-raw.y;p.age=0;}
      }
      p.rx=raw.x;p.ry=raw.y;
      const oldX=p.x,oldY=p.y;
      if(p.fade===1){p.alpha=Math.max(0,p.alpha-dt/.09);if(p.alpha<=0){p.x=raw.x;p.y=raw.y;p.z=raw.z||0;p.ox=p.oy=0;p.age=1;p.fade=2;}}
      else{
        if(p.fade===2){p.alpha=Math.min(1,p.alpha+dt/.12);if(p.alpha===1)p.fade=0;}
        p.age=Math.min(1,p.age+dt/.2);const w=1-ease(p.age),k=p.age<1?1:alpha(dt,.025);
        const dx=(raw.x+p.ox*w-p.x)*k,dy=(raw.y+p.oy*w-p.y)*k,limit=Math.min(1,(isBall?2000:1200)*dt/(Math.hypot(dx,dy)||1));
        p.x+=dx*limit;p.y+=dy*limit;p.z+=(Math.max(0,raw.z||0)-p.z)*alpha(dt,.025);
      }
      if(p.alpha>.01)out.maxStep=Math.max(out.maxStep,Math.hypot(p.x-oldX,p.y-oldY));
      p.face=turn(p.face,raw.face||0,dt);p.st=raw.st;p.flags=raw.flags;p.stam=raw.stam;p.charge=raw.charge;p.speed=raw.speed;
      return p;
    }
    function update(raw,dt){
      if(!raw)return null;dt=Math.min(.05,Math.max(0,dt));out.discontinuity=false;out.maxStep=0;
      out.t=raw.t;out.state=raw.state;out.owner=raw.owner;out.rp=raw.rp;out.pt=raw.pt;
      let i=0;for(const p of raw.players)out.players[i++]=entity(p,p.id,dt,false);out.players.length=i;
      out.ball=entity(raw.ball,'ball',dt,true);return out;
    }
    return {update,reset(){pool.clear();out.players.length=0;}};
  }
  function createCamera(width=1000,height=640){
    const c={x:width/2,y:height/2,tx:width/2,ty:height/2,mx:width/2,my:height/2,follow:0,shake:0,amp:0,phase:0,sx:0,sy:0,vw:0,vh:0};
    c.update=(bx,by,me,replay,vw,vh,dt)=>{
      dt=clamp(dt,0,.05);if(me){c.mx=me.x;c.my=me.y;}
      c.vw=c.vw?c.vw+(vw-c.vw)*alpha(dt,.14):vw;c.vh=c.vh?c.vh+(vh-c.vh)*alpha(dt,.14):vh;
      c.follow+=((me&&!replay?.3:0)-c.follow)*alpha(dt,.18);
      let tx=bx*(1-c.follow)+c.mx*c.follow,ty=by*(1-c.follow)+c.my*c.follow;
      tx=vw>=width+160?width/2:clamp(tx,-80+vw/2,width+80-vw/2);
      ty=vh>=height+190?height/2:clamp(ty,-95+vh/2,height+95-vh/2);
      c.tx+=(tx-c.tx)*alpha(dt,.12);c.ty+=(ty-c.ty)*alpha(dt,.12);
      const dx=(c.tx-c.x)*alpha(dt,.12),dy=(c.ty-c.y)*alpha(dt,.12),limit=Math.min(1,900*dt/(Math.hypot(dx,dy)||1));
      c.x+=dx*limit;c.y+=dy*limit;
      c.amp+=(c.shake-c.amp)*alpha(dt,.03);c.shake*=Math.exp(-dt/ .13);c.phase+=dt;
      c.sx=c.amp*(Math.sin(c.phase*43)*.35+Math.sin(c.phase*71+.8)*.15);
      c.sy=c.amp*(Math.sin(c.phase*47+1.7)*.35+Math.sin(c.phase*67)*.15);return c;
    };return c;
  }
  function createBlend(duration=.22){
    const b={left:0,weight:0};b.begin=()=>{b.left=duration;b.weight=1;};
    b.update=dt=>{b.left=Math.max(0,b.left-clamp(dt,0,.05));b.weight=1-ease(1-b.left/duration);return b.weight;};return b;
  }
  function envelope(age,life,attack=3,release=12){return ease(age/attack)*ease((life-age)/release);}
  function createPool(size){
    const free=Array.from({length:size},()=>({}));return {take(){return free.pop()||null;},release(p){free.push(p);},get available(){return free.length;}};
  }
  function stepParticle(q,ticks){
    ticks=clamp(ticks,0,3);
    while(ticks>0){const d=Math.min(1,ticks);q.x+=q.vx*d;q.y+=q.vy*d;q.z+=q.vz*d-.075*d*d;q.vz-=.15*d;if(q.z<=0){q.z=0;q.vz=0;q.vx*=Math.pow(.7,d);q.vy*=Math.pow(.7,d);}ticks-=d;}
  }
  function stepConfetti(c,ticks){
    ticks=clamp(ticks,0,3);const next=c.rot+c.vr*ticks;
    c.x+=c.vx*ticks+(Math.abs(c.vr)>.00001?1.5*(Math.cos(c.rot)-Math.cos(next))/c.vr:Math.sin(c.rot)*1.5*ticks);
    c.y+=c.vy*ticks;c.rot=next;c.life-=ticks;
  }
  function createTrail(size=10){
    const points=Array.from({length:size},()=>({x:0,y:0})),trail={count:0,index:0,acc:0,x:null,y:null};
    function push(x,y){const p=points[trail.index];p.x=x;p.y=y;trail.index=(trail.index+1)%size;trail.count=Math.min(size,trail.count+1);}
    trail.clear=()=>{trail.count=trail.index=trail.acc=0;trail.x=trail.y=null;};
    trail.point=i=>points[(trail.index-trail.count+i+size)%size];
    trail.update=(x,y,dt)=>{
      if(trail.x===null||Math.hypot(x-trail.x,y-trail.y)>80){trail.clear();trail.x=x;trail.y=y;push(x,y);return;}
      const ticks=clamp(dt,0,.05)*60,old=trail.acc;trail.acc+=ticks;
      const steps=Math.floor(trail.acc+1e-9);
      for(let i=0;i<steps;i++){const k=clamp((i+1-old)/(ticks||1));push(trail.x+(x-trail.x)*k,trail.y+(y-trail.y)*k);}
      trail.acc-=steps;trail.x=x;trail.y=y;
    };return trail;
  }
  function createEventGate(limit=1024){
    const seen=new Set(),order=[];return {accept(e,tick){
      const key=(e.tick??tick)+':'+e.type+':'+(e.id||0)+':'+(e.victim||0)+':'+(e.kind||'')+':'+!!e.visualOnly;
      if(seen.has(key))return false;seen.add(key);order.push(key);if(order.length>limit)seen.delete(order.shift());return true;
    },reset(){seen.clear();order.length=0;}};
  }
  const api={TICK,clamp,alpha,ease,angle,turn,rotationAlpha,height,createClock,createSampler,createPresenter,createCamera,createBlend,envelope,createPool,stepParticle,stepConfetti,createTrail,createEventGate};
  root.FootballContinuity=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
