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
 assert(net.delay>=4&&net.delay<=10);
}
assert(maxStep<5,'movimiento continuo con jitter: '+maxStep);
assert(lastX>1400,'el reloj progresa');
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
