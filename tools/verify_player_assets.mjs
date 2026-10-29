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
}
const actors=[...backend.actors.values()];const meshes=a=>{const out=[];a.object.traverse(n=>{if(n.isSkinnedMesh)out.push(n);});return out;};
assert.equal(meshes(actors[0])[0].geometry,meshes(actors[1])[0].geometry);
assert.notEqual(meshes(actors[0])[0].skeleton,meshes(actors[1])[0].skeleton);
for(const name of mod.CLIPS){const a=actors[0];a.mixer.stopAllAction();a.actions[name].reset().play();a.mixer.update(.2);}
console.log('GLTFLoader + SkeletonUtils + 22 AnimationMixers reales OK; clips:',Object.keys(clips));
backend.dispose();
