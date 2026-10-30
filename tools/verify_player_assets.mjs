import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const cache=new URL('./source-assets/three/',import.meta.url);
await fs.mkdir(cache,{recursive:true});
await fs.writeFile(new URL('package.json',cache),JSON.stringify({name:'three',type:'module',exports:{'.':'./build/three.module.js'}}));
for(const path of ['build/three.module.js','build/three.core.js','examples/jsm/loaders/GLTFLoader.js','examples/jsm/utils/BufferGeometryUtils.js','examples/jsm/utils/SkeletonUtils.js']){
 const file=new URL(path,cache);
 try{await fs.access(file);}catch{
  const response=await fetch('https://cdn.jsdelivr.net/npm/three@0.184.0/'+path);
  if(!response.ok)throw new Error('Three.js CDN: '+response.status);
  await fs.mkdir(new URL('./',file),{recursive:true});await fs.writeFile(file,Buffer.from(await response.arrayBuffer()));
 }
}
const THREE=await import(new URL('build/three.module.js',cache));
const {GLTFLoader}=await import(new URL('examples/jsm/loaders/GLTFLoader.js',cache));
const {clone}=await import(new URL('examples/jsm/utils/SkeletonUtils.js',cache));
import mod from '../public/player3d.js';
const loader=new GLTFLoader();
const load=async path=>{const b=await fs.readFile(new URL(path,import.meta.url));return loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');};
const model=await load('../public/models/player.glb'),clips={};
for(const name of mod.CLIPS){const a=await load('../public/models/anims/'+name+'.glb');clips[name]=a.animations[0];}
mod.validate(THREE,model.scene,clips);
for(const name of mod.CLIPS)clips[name]=mod.inPlace(THREE,clips[name],model.scene);
const backend=mod.createBackend(THREE,clone,model.scene,clips,mod.CONFIG,()=>({setPixelRatio(){},setSize(){},setClearColor(){},render(){},dispose(){},domElement:{}}));
const g={drawImage(){}};let start=performance.now();
for(let frame=0;frame<180;frame++)for(let id=1;id<=22;id++)backend.draw(g,{id,st:'run',flags:2,face:0},{id},{c1:id%2?'#7cc0ea':'#ffdc1f',sh:'#111111',so:'#ffffff'},{speed:3.45,run:1,sprint:1},{time:frame*1000/60});
console.log('Velocidades nativas:',backend.actors.get(1).referenceSpeed);
console.log('Rig real:',backend.stats(),'CPU por cuadro (ms):',(performance.now()-start)/180);
for(const actor of backend.actors.values()){
 actor.object.updateMatrixWorld(true);
 actor.object.traverse(n=>{if(n.isBone)assert(n.matrixWorld.elements.every(Number.isFinite),'pose inválida');});
 if(actor.identity.body.crutches){
  assert.equal(actor.current,'idle','las muletas usan marcha procedural, sin ciclo de carrera');
  assert.equal(actor.crutches.poles.length,2);assert(actor.crutches.group.visible);
 }
 if(actor.identity.body.belly)assert(actor.belly,'la barriga debe existir en el rig');
}
const actors=[...backend.actors.values()];const meshes=a=>{const out=[];a.object.traverse(n=>{if(n.isSkinnedMesh)out.push(n);});return out;};
assert.equal(meshes(actors[0])[0].geometry,meshes(actors[1])[0].geometry);
assert.notEqual(meshes(actors[0])[0].skeleton,meshes(actors[1])[0].skeleton);
for(const name of mod.CLIPS){const a=actors[0];a.mixer.stopAllAction();a.actions[name].reset().play();a.mixer.update(.2);}
console.log('GLTFLoader + SkeletonUtils + 22 AnimationMixers reales OK; clips:',Object.keys(clips));
for(const a of actors){a.mixer.stopAllAction();a.current=a.action=null;a.clipAge=1;a.retiringCount=0;}
// Las poses nuevas también pasan por el rig real, sin WebGL ni navegador.
import fx from '../public/toon-fx.js';
const seeds=Array.from({length:6},(_,v)=>{let s=0;while(fx.variant(s,70)!==v)s++;return s;});
let clock=4000;
for(const scenario of ['fall0','fall1','fall2','fall3','fall4','fall5','hit','post','goal','cry']){
 const at=clock/1000*60;
 for(let frame=0;frame<120;frame++,clock+=1000/60)for(let id=1;id<=22;id++){
  const tick=clock/1000*60,age=tick-at,opts={tick,team:0};
  if(scenario.startsWith('fall')&&age<88)opts.fall={tick:at,duration:70,seed:seeds[+scenario.slice(-1)],dx:1,dy:0,power:1};
  if(scenario==='hit'&&age<24)opts.hit={tick:at,id:1,victim:id,dx:0,dy:1};
  if(scenario==='post'&&age<42)opts.post={tick:at,x:0,y:270};
  if(scenario==='goal'||scenario==='cry')opts.goal={tick:at,team:scenario==='goal'?0:1,celebrants:actors.map(a=>a.key)};
  backend.draw(g,{id,x:12,y:280,st:age<70&&opts.fall?'down':'run',flags:0,face:0},{id,team:0},{c1:'#7cc0ea',sh:'#111111',so:'#ffffff'},{speed:0},{time:clock,fx:opts});
 }
 for(const a of backend.actors.values()){
  a.slot.updateMatrixWorld(true);a.object.traverse(n=>{if(n.isBone)assert(n.matrixWorld.elements.every(Number.isFinite),scenario+': hueso inválido');});
  if(scenario.startsWith('fall')){assert(Math.abs(a.motion.rotation.x)<1e-5);assert(Math.abs(a.motion.scale.y-1)<1e-5);assert(Math.abs(a.object.position.y-a.baseY)<1e-5,scenario+' id '+a.key+' y '+a.object.position.y+' base '+a.baseY);}
  if(scenario==='cry')assert(a.features.tears.every(t=>t.m.visible));
 }
}
assert(backend.stats().maxRotationStep<=.45+.00001,'giro limitado por segundo');
assert(backend.stats().maxPoseStep<1.5,'sin salto instantáneo de orientación de la pose');
console.log('Caricatura real OK: seis caídas + recuperación, choque, poste, cuatro festejos y lágrimas en 22 rigs');
// Impedir que una cabeza o un pie invada la casilla vecina del atlas.
for(const scenario of ['goal','fall']){
 for(let frame=0;frame<2;frame++)for(let id=1;id<=22;id++){
  const opts={tick:42,team:0};
  if(scenario==='goal')opts.goal={tick:0,team:0,celebrants:actors.map(a=>a.key)};
  else opts.fall={tick:0,duration:70,seed:seeds[id%6],dx:1,dy:0,power:1};
  backend.draw(g,{id,x:0,y:0,st:'run',flags:0,face:Math.PI/2},{id,team:0},{c1:'#7cc0ea',sh:'#111111',so:'#ffffff'},{speed:0},{time:clock+=1,fx:opts});
 }
 const {tileW,tileH,base}=mod.ATLAS;
 for(const a of backend.actors.values()){
  a.slot.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(a.object,true),p=a.slot.position;
  if(a.crutches)assert(!a.crutches.group.visible,'las muletas se guardan al caer o festejar');
  assert(box.min.x>=p.x-tileW/2&&box.max.x<=p.x+tileW/2,scenario+': desborde horizontal');
  assert(box.min.y>=p.y-base&&box.max.y<=p.y+tileH-base,scenario+': desborde vertical');
 }
}
console.log('Atlas OK: cuerpos y accesorios contenidos en sus casillas al caer y festejar');
console.log('Variedad OK: siete cuerpos, barriga articulada y pares de muletas con marcha procedural');
backend.dispose();
