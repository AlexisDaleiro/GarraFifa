'use strict';
const assert=require('node:assert/strict'),C=require('../public/continuity');
const snap=(t,x=t*2.5,z=0)=>({t,s:'play',o:0,p:[[1,x,100,0,0,100,0,0]],b:[x,110,z]});
const sampler=C.createSampler(),presenter=C.createPresenter();
let list=[snap(0),snap(1)];
const reused=sampler.sample(list,0).players[0];assert.equal(sampler.sample(list,.5).players[0],reused,'muestreo reutiliza la entidad');
assert.equal(sampler.sample(list,7).players[0].x,17.5);
assert.equal(sampler.sample(list,30).players[0].x,17.5,'extrapolación limitada a seis ticks');
assert.equal(sampler.sample(list,.5).players[0].x,1.25);
list=[snap(0,0,10),snap(2,5,12)];
assert(C.height(10,12,.5,2)>11,'arco parabólico');
assert(C.height(0,0,.5,2)===0,'pelota en suelo');
assert.equal(sampler.sample(list,1).ball.z,C.height(10,12,.5,2));
list=[snap(0,0),snap(1,160)];
assert.equal(sampler.sample(list,.5).players[0].x,0,'no anticipar reposicionamiento');
let p=presenter.update(sampler.sample(list,0),1/60),start=p.players[0].x;
p=presenter.update(sampler.sample(list,1),1/60);
assert(Math.abs(p.players[0].x-start)<=20);assert(p.players[0].x<160);
for(let i=0;i<30;i++)p=presenter.update(sampler.sample(list,1),1/60);
assert(Math.abs(p.players[0].x-160)<.01);
list.push(snap(2,900));p=presenter.update(sampler.sample(list,2),1/60);
assert(p.players[0].alpha<1,'salto enorme bajo fundido');
for(let i=0;i<30;i++)p=presenter.update(sampler.sample(list,2),1/60);
assert(p.players[0].alpha>.99);assert(Math.abs(p.players[0].x-900)<.01);
assert(Math.abs(C.turn(Math.PI-.01,-Math.PI+.01,1/60)-(Math.PI+.01))<1e-8);
assert(Math.abs(C.turn(0,3,10))<=.45,'frames largos acotados');
assert(C.rotationAlpha(Math.PI,1/60)*Math.PI<=24/60+.00001,'pose sin giro instantáneo');
const clock=C.createClock();assert(clock.receive(10,1000));assert(!clock.receive(9,1100));
clock.advance(1000);const old=clock.offset;clock.receive(11,2000);assert(Math.abs(clock.offset-old)<6);
clock.advance(2100);assert(clock.resumed);
// Red reproducible: 100 ms de latencia y jitter de ±30 ms, con paquetes fuera de orden.
const deliveries=[];for(let t=0;t<600;t++)deliveries.push({s:snap(t),at:t*C.TICK+100+Math.sin(t*1.7)*30});
deliveries.sort((a,b)=>a.at-b.at);
const net=C.createClock(),samp=C.createSampler(),view=C.createPresenter(),buffer=[];let next=0,lastX=null,maxStep=0;
for(let now=0;now<9900;now+=1000/60){
 while(next<deliveries.length&&deliveries[next].at<=now){const d=deliveries[next++];if(net.receive(d.s.t,d.at))buffer.push(d.s);}
 const t=net.advance(now);if(t===null)continue;
 const v=view.update(samp.sample(buffer,t),1/60),x=v.players[0].x;
 if(lastX!==null)maxStep=Math.max(maxStep,Math.abs(x-lastX));lastX=x;
 assert(net.delay>=C.NET.minBuffer&&net.delay<=C.NET.maxBuffer);
}
assert(maxStep<5,'movimiento continuo con jitter: '+maxStep);
assert(lastX>1400,'el reloj progresa');
// Wifi con cortes: cada 2 s se frenan 250 ms y llega todo junto. No debe trabarse ni acelerar.
{const net=C.createClock(),samp=C.createSampler(),buf=[],del=[];let next=0,last=null,frozen=0,fast=0;
 for(let t=0;t<1200;t+=2){let at=t*C.TICK;const ph=at%2000;del.push({s:snap(t),at:(ph<250?at-ph+250:at)+40});}
 for(let now=0;now<19000;now+=1000/60){
  while(next<del.length&&del[next].at<=now){const d=del[next++];if(net.receive(d.s.t,d.at))buf.push(d.s);}
  const t=net.advance(now);if(t===null)continue;const x=samp.sample(buf,t).players[0].x;
  if(last!==null&&now>6000){const st=x-last;if(st<.5)frozen++;if(st>3.5)fast++;}last=x;
 }
 assert(frozen===0&&fast===0,`cortes de red: ${frozen} frames trabados, ${fast} acelerados`);}
// Red irregular determinista (TCP: en orden) contra reloj+muestreo+presentación reales. Un jugador en zigzag a
// 4.5 u/tick; "salto" = paso de un frame mayor que 1.6 veces lo que puede moverse.
const zig=t=>{const seg=Math.floor(t/50),f=t-seg*50;let x=0;for(let i=0;i<seg;i++)x+=(i%2?-1:1)*225;return {x:200+x+(seg%2?-1:1)*f*4.5,y:300+t*.5};};
const rnd=seed=>()=>{seed=(seed+0x6D2B79F5)>>>0;let t=seed;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
function simulate({lat=40,jit=()=>0,stall=()=>null,frame=()=>1000/60,hidden=[0,0],dur=30000}){
  const r=rnd(7),fr=rnd(11),del=[];let lastAt=0;
  for(let t=0;t*C.TICK<dur;t+=2){const send=t*C.TICK,p=zig(t);let at=Math.max(send+lat+jit(r),stall(send)??0,lastAt);lastAt=at;del.push({s:{t,s:'play',o:0,p:[[1,p.x,p.y,0,0,100,0,0]],b:[p.x,p.y,0]},at});}
  const clock=C.createClock(),samp=C.createSampler(),pres=C.createPresenter(),buf=[];
  let next=0,now=0,last=null,jumps=0,maxErr=0,resumes=0,delay=0,n=0;
  while(now<dur){
    const dt=frame(fr);now+=dt;
    while(next<del.length&&del[next].at<=now){const d=del[next++];if(clock.receive(d.s.t,d.at))buf.push(d.s);}
    if(now>hidden[0]&&now<hidden[1])continue;
    const t=clock.advance(now);if(t===null)continue;if(clock.resumed)resumes++;
    const p=pres.update(samp.sample(buf,t),dt/1000).players[0],settled=now>3000&&!(now>=hidden[1]&&now<hidden[1]+400);
    if(settled){if(last&&Math.hypot(p.x-last.x,p.y-last.y)>4.6*dt/C.TICK*1.6+1.5)jumps++;const z=zig(t);maxErr=Math.max(maxErr,Math.hypot(p.x-z.x,p.y-z.y));delay+=now-t*C.TICK;n++;}
    last={x:p.x,y:p.y};
  }
  return {jumps,maxErr,resumes,delay:delay/n};
}
const expo=m=>r=>-Math.log(1-r())*m;
const pauses=(seed,every)=>{const r=rnd(seed),list=[];for(let t=2000;t<40000;t+=every*(.6+r()*.8))list.push([t,t+100+r()*200]);return s=>{for(const [a,b] of list)if(s>=a&&s<b)return b;return null;};};
{const cases=[
  ['latencia 180 ms',{lat:180},6,0],
  ['jitter exponencial 50 ms',{lat:80,jit:expo(50)},12,0],
  ['pausas 100-300 ms y ráfaga',{lat:60,jit:expo(10),stall:pauses(3,2000)},10,0],
  ['celular a 18 fps',{lat:70,jit:expo(30),frame:()=>55},14,0],
  ['celular con tirones, jitter y pausas',{lat:70,jit:expo(30),stall:pauses(5,3000),frame:r=>r()<.05?80+r()*60:20},12,0],
  ['un segundo sin snapshots',{lat:60,stall:s=>s>=10000&&s<11000?11000:null},10,0],
  ['vuelta desde segundo plano',{lat:60,jit:expo(15),hidden:[10000,15000]},Infinity,1],
 ];
 for(const [name,opts,err,resumes] of cases){
  const r=simulate(opts);
  assert.equal(r.jumps,0,`${name}: ${r.jumps} saltos`);
  assert(r.maxErr<err,`${name}: error ${r.maxErr.toFixed(1)}`);
  assert.equal(r.resumes,resumes,`${name}: ${r.resumes} reinicios del reloj`);
 }
 // El reloj no pierde tiempo con frames largos: antes un celular a 18 fps acumulaba ~470 ms de retraso.
 assert(simulate({lat:70,jit:expo(30),frame:()=>55}).delay<300,'retraso de presentación acotado a 18 fps');
 // Reconexión: reset y nuevo origen de ticks arrancan limpio.
 const c=C.createClock();c.receive(5000,1000);c.advance(1000);c.reset();assert(c.receive(10,2000));assert(c.advance(2000)<=10);}
// Predicción del jugador propio: servidor simulado con la misma marcha (stepRun), inputs que suben con demora,
// snapshots redondeados como snapshot() que bajan con demora. Se compara contra donde el servidor tendrá al
// jugador cuando llegue el input enviado ahora; sin predicción esa distancia es el lag que se siente.
{const P={run:2.125,sprint:2.76,tired:1.615,carry:.9,boost:1.35,charge:.6,acc:.12,ballAcc:.09,turn:.3,ballTurn:.12,reverseBrake:.78,reverseStop:.2};
 const r1=v=>Math.round(v*10)/10;
 function play({up=40,down=40,jit=()=>0,jitUp=()=>0,stall=()=>null,frame=()=>1000/60,dur=20000,reconcile=false,bumps=false}){
  const r=rnd(3),fr=rnd(5),plan=t=>[8|16,4,1|8,2|4|16,0][Math.floor(t/700)%5];
  const sv={x:150,y:200,vx:0,vy:0,face:0,stamina:100,tired:false,boost:false,ball:false,charging:false,w:640,h:400,wall:true};
  const truth=[],snaps=[],inputs=[];let sent=-1,lastAt=0;
  for(let t=0;t<dur+2000;t+=1000/60){const b=plan(t);if(b!==sent){sent=b;inputs.push({at:t+up+jitUp(r),b,t});}}
  let ii=0,bits=0;
  for(let k=0;k*C.TICK<dur+1000;k++){
   while(ii<inputs.length&&inputs[ii].at<=k*C.TICK)bits=inputs[ii++].b;
   C.stepRun(sv,bits,P);if(bumps&&k>0&&k%120===0)sv.x+=8;truth[k]={x:sv.x,y:sv.y};
   if(k%2===0){const at=Math.max(k*C.TICK+down+jit(r),stall(k*C.TICK)??0,lastAt);lastAt=at;snaps.push({at,s:{t:k,s:'play',o:0,p:[[1,r1(sv.x),r1(sv.y),Math.round(sv.face*100)/100,0,Math.round(sv.stamina),0,sv.tired?1:0]],b:[0,0,0]}});}
  }
  const clock=C.createClock(),pred=C.createPredictor(),buf=[],samp=C.createSampler();
  let now=0,si=0,pi=0,err=0,mean=0,lag=0,n=0,last=null,jumps=0;
  while(now<dur){
   const dt=frame(fr);now+=dt;
   while(pi<inputs.length&&inputs[pi].t<=now)pred.input(inputs[pi].b,inputs[pi++].t);
   while(si<snaps.length&&snaps[si].at<=now){const d=snaps[si++];if(clock.receive(d.s.t,d.at))buf.push(d.s);}
   const t=clock.advance(now);if(t===null||buf.length<2||now<3000)continue;
   const p=pred[reconcile?'reconcile':'predict'](buf[buf.length-1],buf[buf.length-2],1,(buf[buf.length-1].t+clock.offset)*C.TICK-(up+down),now,P,640,400,true);
   const want=truth[Math.round((now+up)/C.TICK)],old=samp.sample(buf,t).players[0];
   const e=Math.hypot(p.x-want.x,p.y-want.y);err=Math.max(err,e);mean+=e;lag+=Math.hypot(old.x-want.x,old.y-want.y);n++;
   if(last&&Math.hypot(p.x-last.x,p.y-last.y)>2.8*dt/C.TICK*1.6+1.5)jumps++;last={x:p.x,y:p.y};
  }
  return {err,mean:mean/n,lag:lag/n,jumps};
 }
 for(const [name,opts,limit] of [['40+40 ms',{},3],['80+80 ms con jitter de bajada',{up:80,down:80,jit:expo(25)},6],['celular 18 fps y pausas',{up:70,down:70,frame:()=>55,stall:pauses(9,3000)},8],['jitter de subida (inevitable: el servidor aplica tarde)',{up:80,down:80,jitUp:expo(25)},20]]){
  const r=play(opts);
  assert(r.err<limit,`predicción ${name}: error ${r.err.toFixed(2)}`);
  assert(r.lag>r.mean*4,`predicción ${name}: no mejora el lag (${r.lag.toFixed(1)} vs ${r.mean.toFixed(1)})`);
  if(!opts.stall&&!opts.jitUp)assert.equal(r.jumps,0,`predicción ${name}: ${r.jumps} saltos`);
 }
 const options={up:80,down:80,jitUp:expo(25),bumps:true},raw=play(options),smooth=play({...options,reconcile:true});
 assert(smooth.jumps<raw.jumps,'la reconciliación reduce los saltos de corrección');
 assert(smooth.mean<smooth.lag/3,'mantiene la ventaja de respuesta frente a esperar snapshots');
 console.log(`reconciliación con jitter: ${raw.jumps} → ${smooth.jumps} saltos; error medio ${smooth.mean.toFixed(1)} px`);
 // Un input nuevo responde en el próximo tick; un desplazamiento del servidor se absorbe gradualmente.
 const pred=C.createPredictor(),a=snap(0,150),b=snap(2,150);a.p[0][2]=b.p[0][2]=200;
 pred.reconcile(b,a,1,1000,1000,P,640,400,true);pred.input(8,1000);
 const first=pred.reconcile(b,a,1,1000,1000+C.TICK,P,640,400,true).x;
 assert(first>150&&first<151,'input inmediato, sin esperar otro snapshot');
 const hit=snap(3,158);hit.p[0][2]=200;
 const corrected=pred.reconcile(hit,b,1,1000+C.TICK,1000+C.TICK*2,P,640,400,true).x;
 assert(corrected-first<5,'corrección sin teletransporte');
 for(let i=3;i<65;i++)pred.reconcile(hit,b,1,1000+C.TICK,1000+C.TICK*i,P,640,400,true);
 const settled=pred.reconcile(hit,b,1,1000+C.TICK,2100,P,640,400,true).x;
 assert(Math.abs(settled-pred.predict(hit,b,1,1000+C.TICK,2100,P,640,400,true).x)<1,'converge al servidor');
 pred.reset();assert.equal(pred.reconcile(b,a,1,1000,1000,P,640,400,true).correction,0);
}
// Presupuesto de latencia real del reloj y presentación, con snapshots a la cadencia del servidor.
{const {measure}=require('../tools/measure-network');const stable=measure(),bursts=measure({jitter:10,stall:250});
 assert(stable.bufferMedianMs<=30,'buffer estable de baja latencia');
 assert(stable.playoutMedianMs<=115,'80 ms de red + buffer acotado');
 assert(bursts.maxStep<2,'ráfagas sin saltos');
}
const camera=C.createCamera(),person={x:850,y:500};let cx=camera.x,cy=camera.y;
for(let i=0;i<240;i++){
 const c=camera.update(i<120?900:30,200,i<80?person:null,i>160,i<100?500:1200,i<100?460:300,1/60);
 assert(Math.hypot(c.x-cx,c.y-cy)<=15.0001,'cámara continua ante objetivo, replay y resize');cx=c.x;cy=c.y;
}
camera.shake=6;camera.update(500,320,null,false,700,400,1/60);const shake=camera.sx;
camera.update(500,320,null,false,700,400,1/60);assert(Math.abs(camera.sx-shake)<3);
for(let i=0;i<200;i++)camera.update(500,320,null,false,700,400,1/60);
assert(Math.abs(camera.sx)<.001,'shake se extingue');
const boundsCamera=C.createCamera();boundsCamera.update(500,320,null,false,500,300,1/60);boundsCamera.update(500,320,null,false,1200,600,1/60);assert(boundsCamera.vw>500&&boundsCamera.vw<1200,'ventana del radar continua al rotar');
const fade=C.createBlend();fade.begin();let oldWeight=1;
for(let i=0;i<20;i++){const weight=fade.update(1/60);assert(weight<=oldWeight&&weight>=0);oldWeight=weight;}
assert.equal(fade.weight,0);fade.begin();fade.update(10);assert(fade.weight>.8,'reanudación no saltea el fundido');
assert.equal(C.envelope(0,42),0);assert.equal(C.envelope(42,42),0);assert(C.envelope(5,42)>.99);
const pool=C.createPool(2),one=pool.take(),two=pool.take();assert.equal(pool.take(),null);pool.release(one);assert.equal(pool.take(),one);pool.release(two);
const confA={x:0,y:0,vx:1,vy:2,rot:.1,vr:.2,life:100},confB={...confA};
for(let i=0;i<30;i++)C.stepConfetti(confA,2);for(let i=0;i<120;i++)C.stepConfetti(confB,.5);
assert(Math.hypot(confA.x-confB.x,confA.y-confB.y)<1e-8,'confeti independiente del refresco');
const particleA={x:0,y:0,z:100,vx:1,vy:2,vz:3},particleB={...particleA};
for(let i=0;i<10;i++)C.stepParticle(particleA,2);for(let i=0;i<40;i++)C.stepParticle(particleB,.5);
assert(Math.abs(particleA.z-particleB.z)<1e-8,'partículas balísticas independientes del refresco');
const trailA=C.createTrail(),trailB=C.createTrail();trailA.update(0,0,0);trailB.update(0,0,0);
for(let i=1;i<=60;i++)trailA.update(i*5,0,1/30);for(let i=1;i<=240;i++)trailB.update(i*1.25,0,1/120);
assert.equal(trailA.count,10);assert(Math.abs(trailA.point(0).x-trailB.point(0).x)<1e-7);
trailA.update(1000,0,1/60);assert.equal(trailA.count,1,'no unir teletransporte con una estela');
const events=C.createEventGate();assert(events.accept({type:'goal',tick:30},31));assert(!events.accept({type:'goal',tick:30},40));assert(events.accept({type:'foul',tick:29,id:1},40),'evento tardío válido');events.reset();assert(events.accept({type:'goal',tick:30},31));
const fixedBuffer=new Array(20);fixedBuffer[0]=snap(0);fixedBuffer[1]=snap(1);assert.equal(C.createSampler().sample(fixedBuffer,.5,2).players[0].x,1.25);
console.log('continuidad OK: extrapolación, parábola, blends, reloj y red 100 ms ±30 ms; máximo '+maxStep.toFixed(2)+' u/frame');
