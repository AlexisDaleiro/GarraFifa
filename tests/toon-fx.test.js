'use strict';
const assert=require('node:assert/strict');
const {hash,variant,fallPose,identity,create}=require('../public/toon-fx');
const variants=new Set();
for(let seed=0;seed<100;seed++){
  assert.equal(variant(seed,70),variant(seed,70));variants.add(variant(seed,70));
  assert([0,2,3].includes(variant(seed,30)),'caídas cortas en barridas limpias');
  for(const duration of [30,70]){
    const f={seed,duration,tick:100,power:1};
    assert.equal(fallPose(f,99).t,0);assert.equal(fallPose(f,100+duration).t,1);
    assert.deepEqual(fallPose(f,100+duration),fallPose(f,100+duration+10));
    for(let t=0;t<=duration;t++)for(const value of Object.values(fallPose(f,100+t)))assert(Number.isFinite(value));
  }
}
assert.equal(variants.size,6);
const fx=create(),p={id:2,st:'down',stT:20,face:0},info={team:1};
fx.ingest({type:'foul',victim:2,tick:100,fall:{seed:42,duration:70,dx:1,dy:0,power:.8}},{t:102});
assert.equal(fx.options(p,info,110,'play').fall.seed,42);
assert.equal(fx.options({...p,st:'run'},info,99,'play').fall,null,'no anticipar eventos durante replay');
assert.equal(fx.options({...p,st:'run'},info,188,'play').fall,null,'finalizar recuperación');
assert.equal(hash(42),hash(42));
const bodies=new Set(),hair=new Set();
for(let id=1;id<=22;id++){
  assert.deepEqual(identity(id),identity(id));bodies.add(identity(id).body.name);hair.add(identity(id).hair);
}
assert.equal(bodies.size,3);assert.equal(hair.size,7);
for(let id=1;id<=100;id++){
  const a=identity(id);assert.deepEqual(a,identity(id),'apariencia sincronizada por id');
  assert(a.body.height>=.92&&a.body.height<=1.08,'altura dentro de ±8 %');
  assert(['seleccion','sinMangas','afuera'].includes(a.shirt));
  assert(/^#[0-9a-f]{6}$/i.test(a.boots));
}
assert.equal(new Set(Array.from({length:22},(_,i)=>identity(i+1).shirt)).size,3);
const early=create(),late=create(),event={type:'foul',tick:100,victim:2,fall:{seed:17,duration:70,dx:0,dy:1,power:1}};
early.ingest(event,{t:100});late.ingest(event,{t:130});late.ingest(event,{t:130});
assert.deepEqual(early.options(p,info,140,'play'),late.options(p,info,140,'play'),'entrada tardía conserva variante y fase');
late.ingest({type:'goal',tick:150,team:1,celebrants:[2]},{t:150});
assert(late.options(p,info,160,'goal').goal);
assert.equal(late.options(p,info,160,'setpiece').goal,null,'el festejo termina con la pausa del gol');
assert(fallPose({...event.fall,tick:100},120).height>=fallPose({...event.fall,tick:100,power:0},120).height);
fx.reset();assert.equal(fx.options({...p,st:'run'},info,110,'play').fall,null);
const reused=fx.options(p,info,110,'play');assert.equal(fx.options(p,info,111,'play'),reused,'opciones reutilizadas por jugador');
assert.equal(reused.fall.tick,110,'fallback down no reinicia su fase cada 30 ticks');
console.log('toon-fx OK: seis variantes deterministas, duración y replay');

{
 const f=create(),p={id:1,st:'run',face:0},info={team:0};
 f.ingest({type:'kick',id:1,tick:100,kind:'pass',face:.4,duration:12},{t:103});
 assert.equal(f.options(p,info,99,'play').kick,null,'no anticipa pase');
 assert.equal(f.options(p,info,105,'play').kick.face,.4);assert.equal(f.options(p,info,112,'play').kick,null,'termina seguimiento');
 f.ingest({type:'recover',id:1,tick:120,duration:42},{t:130});assert.equal(f.options(p,info,140,'play').recover.duration,42);
 assert.equal(f.options(p,info,162,'play').recover,null);
}
