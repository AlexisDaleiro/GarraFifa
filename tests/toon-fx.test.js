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
assert.equal(bodies.size,7);assert.equal(hair.size,5);
assert.equal(new Set(Array.from({length:8},(_,i)=>identity(i+1).body.name)).size,7,'variedad completa en 3v3 con arqueros');
assert(identity(3).body.crutches);assert(identity(2).body.belly);
assert(identity(1).body.height<identity(5).body.height*.65);
const early=create(),late=create(),event={type:'foul',tick:100,victim:2,fall:{seed:17,duration:70,dx:0,dy:1,power:1}};
early.ingest(event,{t:100});late.ingest(event,{t:130});late.ingest(event,{t:130});
assert.deepEqual(early.options(p,info,140,'play'),late.options(p,info,140,'play'),'entrada tardía conserva variante y fase');
late.ingest({type:'goal',tick:150,team:1,celebrants:[2]},{t:150});
assert(late.options(p,info,160,'goal').goal);
assert.equal(late.options(p,info,160,'setpiece').goal,null,'el festejo termina con la pausa del gol');
assert(fallPose({...event.fall,tick:100},120).height>=fallPose({...event.fall,tick:100,power:0},120).height);
fx.reset();assert.equal(fx.options({...p,st:'run'},info,110,'play').fall,null);
console.log('toon-fx OK: seis variantes deterministas, duración y replay');
