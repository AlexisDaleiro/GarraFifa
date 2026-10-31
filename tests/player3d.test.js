'use strict';
const assert=require('node:assert/strict');
const {selectClip,materialRole,palette,updateAction,createBackend,inPlace,validate,CLIPS,CONFIG,CROSSFADE,CADENCE,fadeDuration}=require('../public/player3d');
assert.equal(CROSSFADE,.15);
for(const [p,a,o,expected] of [
 [{st:'run',flags:0},{speed:0},{},'idle'],
 [{st:'run',flags:0},{speed:2.125,run:1},{},'jog'],
 [{st:'run',flags:2},{speed:2.76},{},'sprint'],
 [{st:'run',flags:0},{speed:3,sprint:.9},{},'sprint'],
 [{st:'run',flags:4},{speed:2},{},'kick'],
 [{st:'run',flags:36},{speed:2},{},'pass'],
 [{st:'slide'},{speed:4},{},'slide'],
 [{st:'recover'},{speed:0},{},'idle'],
 [{st:'dive'},{speed:2},{},'gk_dive'],
 [{st:'hold'},{speed:0},{},'idle'],
 [{st:'run'},{speed:0},{celebrate:true},'celebrate'],
]) assert.equal(selectClip(p,a,o),expected);
assert.equal(materialRole({name:'Jersey'},{name:'Body'}),'shirt');
assert.equal(materialRole({name:'Pantalon'},{name:'Body'}),'shorts');
assert.equal(materialRole({name:'Medias'},{}),'socks');
assert.equal(materialRole({name:'Hair'},{}),'hair');
assert.equal(materialRole({name:'Skin'},{}),'skin');
assert.equal(materialRole({name:'Boot'},{}),null);
assert.equal(materialRole({userData:{kitRole:'shirt'}},{}),'shirt');
const kit={c1:'#7cc0ea',sh:'#111111',so:'#ffffff'};
assert.equal(palette(kit,1).shirt,kit.c1);
assert.notEqual(palette(kit,1).skin,palette(kit,2).skin);
class Action {
 constructor(clip){this.clip=clip;this.running=false;this.resets=0;this.elapsed=0;this.time=0;}
 reset(){this.resets++;this.elapsed=0;return this;}
 setEffectiveWeight(v){this.weight=v;return this;}
 setEffectiveTimeScale(v){this.rate=v;return this;}
 play(){this.running=true;return this;}
 crossFadeFrom(old,time,warp){this.fade={old,time,warp};return this;}
 setLoop(mode){this.loop=mode;return this;}
 getClip(){return this.clip;}
 stop(){this.running=false;return this;}
 isRunning(){return this.running;}
}
let mixerCount=0;
class Mixer {
 constructor(object){this.object=object;this.actions=[];this.updates=0;mixerCount++;}
 clipAction(clip){const a=new Action(clip);this.actions.push(a);return a;}
 update(dt){this.updates++;for(const a of this.actions)if(a.running){a.elapsed+=dt*(a.rate??1);if(a.loop==='once'&&a.elapsed>=a.clip.duration)a.running=false;}}
 stopAllAction(){this.actions.forEach(a=>a.running=false);}
 uncacheRoot(){this.uncached=true;}
}
const clips=Object.fromEntries(CLIPS.map(name=>[name,{name,duration:.8,tracks:[{name:'Hips.quaternion'}]}]));
const actor={actions:Object.fromEntries(CLIPS.map(name=>[name,new Action(clips[name])])),mixer:{update(){}},referenceSpeed:{jog:150,sprint:207}};
updateAction(actor,{st:'run',flags:0},{speed:2.125},{},1/60);
assert.equal(actor.current,'jog');assert.equal(actor.action.rate,CADENCE*.85);
updateAction(actor,{st:'run',flags:2},{speed:2.76},{},1/60);
assert.equal(actor.current,'jog','permanencia mínima evita alternar por un frame');
for(let i=0;i<30;i++)updateAction(actor,{st:'run',flags:2},{speed:2.76},{},1/60);
assert.equal(actor.current,'sprint');assert(Math.abs(actor.action.rate-CADENCE*.8)<.01);assert.equal(actor.action.fade.time,fadeDuration('jog','sprint'));
updateAction(actor,{st:'run',flags:2},{speed:1.38},{},1/60);assert(actor.action.rate>CADENCE*.4&&actor.action.rate<CADENCE*.8,'cadencia filtrada');
for(let i=0;i<60;i++)updateAction(actor,{st:'run',flags:2},{speed:1.38},{},1/60);assert(Math.abs(actor.action.rate-CADENCE*.4)<.001);
updateAction(actor,{st:'run',flags:4},{speed:0},{},1/60);
const kick=actor.action;
updateAction(actor,{st:'run',flags:0},{speed:2.5},{},1/60);assert.equal(actor.action,kick,'no cortar el golpe al caer el flag');
kick.running=false;updateAction(actor,{st:'run',flags:0},{speed:2.5},{},1/60);assert.equal(actor.current,'jog');
assert.equal(actor.action.fade.time,.2,'fundido al salir de un clip de una vez');
const jitterActor={actions:Object.fromEntries(CLIPS.map(name=>[name,new Action(clips[name])])),mixer:{update(){}},referenceSpeed:CONFIG.referenceSpeed};
for(let i=0;i<120;i++)updateAction(jitterActor,{st:'run',flags:0},{speed:i%2?.13:.10},{},1/60);
assert.equal(jitterActor.current,'idle');assert.equal(jitterActor.action.resets,1,'sin parpadeo cerca del umbral');
for(let i=0;i<30;i++)updateAction(jitterActor,{st:'run',flags:0},{speed:2.5},{},1/60);
assert.equal(jitterActor.current,'jog');
assert(fadeDuration('jog','kick')<fadeDuration('idle','jog'));
// Golpes fechados: llegan incluso sin flag, se reactivan y arrancan en el contacto del clip.
{
 const make=()=>({actions:Object.fromEntries(CLIPS.map(name=>[name,new Action(clips[name])])),mixer:{update(){}},referenceSpeed:CONFIG.referenceSpeed});
 const a=make(),p={st:'run',flags:0};
 const fx={tick:101,kick:{tick:100,kind:'pass',face:.3}};
 updateAction(a,p,{speed:0},{fx},1/60);assert.equal(a.current,'pass');
 assert(Math.abs(a.action.time-(.8*.6+1/60))<1e-9,'fase de contacto + edad del evento');
 const resets=a.action.resets;updateAction(a,p,{speed:0},{fx},1/60);assert.equal(a.action.resets,resets,'no repite evento');
 updateAction(a,p,{speed:0},{fx:{tick:104,kick:{tick:104,kind:'pass'}}},1/60);assert.equal(a.action.resets,resets+1,'nuevo pase aunque nunca cayó el flag');
 updateAction(a,p,{speed:2.4},{fx:{tick:111,kick:{tick:104,kind:'pass'}}},1/60);assert.equal(a.current,'jog','puede correr después del golpe');
 assert.equal(selectClip({st:'recover',flags:4},{speed:0},{fx}),'idle','recuperación no repite golpe ni barrida');
 const late=make();updateAction(late,p,{speed:0},{fx:{tick:108,kick:{tick:100,kind:'kick'}}},1/60);
 assert(Math.abs(late.action.time-(.8*.5+8/60))<1e-9,'entrada tardía respeta fase');
 const slide=make();updateAction(slide,{st:'slide',flags:0},{speed:4},{fx:{tick:100,slide:{tick:100,duration:18}}},1/60);
 assert(Math.abs(slide.action.rate-.8/.3)<1e-9,'barrida acompaña la duración física');
}
// Atlas: un renderer y 22 mixers; geometría/texturas compartidas, materiales y esqueletos independientes.
class V {constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});} set(x,y,z){Object.assign(this,{x,y,z});return this;}setScalar(v){return this.set(v,v,v);}}
class Node {
 constructor(name=''){this.name=name;this.children=[];this.position=new V();this.scale=new V(1,1,1);this.rotation={x:0,y:0,z:0};}
 add(child){this.children.push(child);child.parent=this;return this;}
 remove(child){this.children=this.children.filter(c=>c!==child);}
 traverse(fn){fn(this);this.children.forEach(c=>c.traverse(fn));}
 lookAt(){}
}
class Color {constructor(value){this.value=value;}clone(){return new Color(this.value);}set(v){this.value=v;}copy(v){this.value=v.value;}}
let materialId=0,disposedMaterials=0;
const texture={shared:true},geometry={shared:true};
function material(name){return {name,uuid:String(materialId++),color:new Color('#ffffff'),map:texture,clone(){return material(this.name);},dispose(){disposedMaterials++;}};}
function makeAsset(){const a=new Node('Scene');a.add(new Node('Hips'));const mesh=new Node('Body');Object.assign(mesh,{isMesh:true,isSkinnedMesh:true,geometry,material:material('Jersey'),skeleton:{dispose(){this.disposed=true;}}});a.add(mesh);return a;}
const asset=makeAsset(),clones=[];
const clone=()=>{const a=makeAsset();clones.push(a);return a;};
class Box {setFromObject(){return this;}getSize(v){return v.set(1,1.8,.5);}getCenter(v){return v.set(0,.9,0);}get min(){return {y:0};}}
const THREE={Scene:Node,Group:Node,OrthographicCamera:Node,HemisphereLight:Node,DirectionalLight:Node,Box3:Box,Vector3:V,AnimationMixer:Mixer,LoopOnce:'once',LoopRepeat:'repeat',SRGBColorSpace:'srgb',PropertyBinding:{parseTrackName(name){const i=name.lastIndexOf('.');return {nodeName:name.slice(0,i),propertyName:name.slice(i+1)};}}};
let rendererCount=0,renderCount=0;
const backend=createBackend(THREE,clone,asset,clips,CONFIG,()=>{rendererCount++;return {domElement:{},setPixelRatio(){},setSize(){},setClearColor(){},render(){renderCount++;},dispose(){this.disposed=true;}};});
const g={drawImage(){}};
for(let frame=0;frame<3;frame++)for(let id=1;id<=22;id++)backend.draw(g,{id,st:'run',flags:0,face:0},{id},id===22?{c1:'#22c55e',sh:'#000000',so:'#22c55e'}:kit,{speed:2.5},{time:frame*1000/60});
assert.equal(rendererCount,1);assert.equal(renderCount,3);assert.equal(backend.stats().players,22);assert.equal(mixerCount,22);
const a1=backend.actors.get(1),a2=backend.actors.get(2),gk=backend.actors.get(22);
assert.notEqual(a1.mixer,a2.mixer);assert.notEqual(a1.object.children[1].skeleton,a2.object.children[1].skeleton);
assert.equal(a1.object.children[1].geometry,a2.object.children[1].geometry);
assert.notEqual(a1.object.children[1].material,a2.object.children[1].material);
assert.equal(a1.object.children[1].material.map,a2.object.children[1].material.map);
assert.equal(gk.materials[0].material.color.value,'#22c55e');
assert.equal(a1.materials[0].material.color.value,kit.c1);
backend.prepare({id:1,st:'run',flags:0,face:0},{id:1},{...kit,c1:'#008751',c2:'#ffffff'},{speed:0},{time:60});
assert.equal(a1.materials[0].material.color.value,'#008751','tint repinta al cambiar selección');
const {TEAMS,teamKitFor}=require('../public/teams');
assert.equal(TEAMS.length,20);
assert.equal(teamKitFor([0,2],1).c1,TEAMS[2].alt[0],'suplente si chocan los colores');
assert(a1.mixer.updates===3&&a2.mixer.updates===2,'actualizar cada mixer una sola vez por cuadro');
for(let id=1;id<=22;id++)backend.prepare({id,x:id,y:0,st:'run',flags:0,face:Math.PI},{id},kit,{speed:2.5},{time:100});
backend.renderFrame(100);const rendered=renderCount;
for(let id=1;id<=22;id++)backend.draw(g,{id},{id},kit,{}, {time:100});
assert.equal(renderCount,rendered,'el dibujo no vuelve a renderizar el atlas preparado');
assert.equal(backend.actors.get(22).state.p.x,22,'el último jugador usa datos del cuadro actual');
assert(backend.stats().maxRotationStep<=.45+.00001,'velocidad angular acotada');
const rootClip={clone(){return {tracks:[{name:'Scene.position',values:[1,2,3,4,5,6]},{name:'Hips.quaternion',values:[0,0,0,1]}]};}};
assert.deepEqual(inPlace(THREE,rootClip,asset).tracks[0].values,[1,2,3,1,5,3]);
assert.doesNotThrow(()=>validate(THREE,asset,clips));
assert.throws(()=>validate(THREE,asset,{...clips,jog:null}),/jog/);
assert.throws(()=>validate(THREE,new Node('NoRig'),clips),/riggeado/);
assert.throws(()=>validate(THREE,asset,{...clips,jog:{duration:1,tracks:[{name:'Absent.quaternion'}]}}),/ausente/);
backend.dispose();assert.equal(backend.stats().players,0);assert(disposedMaterials>=22);
let crop=null;
const small=createBackend(THREE,clone,asset,clips,{...CONFIG,resolution:2},()=>({domElement:{},setPixelRatio(){},setSize(){},setClearColor(){},render(){},dispose(){}}));
small.draw({drawImage(...args){crop=args;}},{id:1,st:'run',flags:0,face:0},{id:1},kit,{speed:0},{time:0});
assert.equal(small.stats().atlasResolution,2);assert.equal(crop[3],144);assert.equal(crop[4],160,'recorte consistente al reducir resolución');small.dispose();
console.log('player3d OK: histéresis, fundidos, cadencia filtrada, giro limitado, tintes y 22 mixers / 1 pasada');

// Assets reales incluidos: impedir que un build pase con rutas que devuelven 404.
const fs=require('node:fs'),path=require('node:path');
function glb(file){
 const raw=fs.readFileSync(path.join(__dirname,'../public/models',file));
 assert.equal(raw.readUInt32LE(0),0x46546c67);assert.equal(raw.readUInt32LE(4),2);assert.equal(raw.readUInt32LE(8),raw.length);
 const length=raw.readUInt32LE(12),json=JSON.parse(raw.subarray(20,20+length).toString()),binaryLength=raw.readUInt32LE(20+length);
 assert(binaryLength>=json.buffers[0].byteLength);
 for(const v of json.bufferViews)assert((v.byteOffset||0)+v.byteLength<=binaryLength,'bufferView fuera del binario');
 return json;
}
const player=glb('player.glb'),names=new Set(player.nodes.map(n=>n.name));
assert(player.skins.length>0&&player.skins[0].joints.length>20,'debe incluir el rig importado');
for(const role of ['shirt','shorts','socks','skin','hair'])assert(player.materials.some(m=>m.extras?.kitRole===role));
for(const name of CLIPS){
 const data=glb('anims/'+name+'.glb'),animation=data.animations.find(a=>a.name===name);
 assert(animation&&animation.channels.length>20,'clip riggeado completo: '+name);
 for(const channel of animation.channels){
  assert(names.has(data.nodes[channel.target.node].name),'hueso ausente en '+name);
  const sampler=animation.samplers[channel.sampler];
  assert(data.accessors[sampler.input].count>1,'clip sin keyframes: '+name);
 }
}
assert(fs.readFileSync(path.join(__dirname,'../public/models/LICENSE-Quaternius.txt'),'utf8').includes('CC0'));
console.log('assets GLB reales OK: modelo, rig, materiales y los ocho clips locales');
