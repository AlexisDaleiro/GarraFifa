/* Three.js r184. Geometría y texturas compartidas; esqueleto, materiales y mixer por jugador. */
(function (root) {
  'use strict';
  const C=typeof module!=='undefined'?require('./continuity'):root.FootballContinuity;
  const FX=typeof module!=='undefined'?require('./toon-fx'):root.ToonFX;
  const CADENCE=1.55;
  const ATLAS={columns:6,rows:4,tileW:72,tileH:80,base:20};
  const CROSSFADE = 0.15;
  const CLIPS = ['idle','jog','sprint','kick','pass','slide','gk_dive','celebrate'];
  const RUNS=new Set(['jog','sprint']),GROUNDED=new Set(['slide','down','recover']),STILL=new Set(['hold','fake','fooled']);
  const SUPPORT=new Set(['run','hold','fake','fooled','step']);
  const ONCE = new Set(['kick','pass','slide','gk_dive']);
  const SKINS = ['#edbd96','#d6a078','#b77b54','#754a35','#f4cfaa'];
  const HAIRS = ['#201b19','#38251e','#71492d','#ba965a','#141518'];
  const CONFIG = { model:'/models/player.glb', clips:'/models/anims/', height:30,
    // Solo se usan si un clip in-place no permite medir el desplazamiento de sus pies.
    referenceSpeed:{jog:150,sprint:207} };
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function selectClip(p,anim={},options={}) {
    if(options.fx?.goal)return options.fx.goal.team===options.fx.team&&options.fx.goal.celebrants?.includes(p.id)&&FX.hash(p.id+options.fx.goal.tick)%4===1?'celebrate':'idle';
    if(options.fx?.fall||p.st==='down') return 'idle';
    if(options.celebrate) return 'celebrate';
    if(p.st==='dive') return 'gk_dive';
    if(GROUNDED.has(p.st)) return 'slide';
    if(p.flags&4) return p.flags&32?'pass':'kick';
    if(STILL.has(p.st)||(anim.speed||0)<0.12) return 'idle';
    return (p.flags&2)||(anim.sprint||0)>0.5?'sprint':'jog';
  }
  function materialRole(material,mesh) {
    const classify=name=>{
      if(/hair|pelo|cabello|beard|barba/.test(name)) return 'hair';
      if(/sock|media/.test(name)) return 'socks';
      if(/short|pantal/.test(name)) return 'shorts';
      if(/shirt|jersey|camiseta|torso/.test(name)) return 'shirt';
      if(/skin|piel|face|head|body|arm|leg|hand/.test(name)) return 'skin';
      return null;
    };
    const explicit=material.userData?.kitRole||mesh.userData?.kitRole;
    if(['shirt','shorts','socks','skin','hair','boots'].includes(explicit)) return explicit;
    return classify((material.name||'').toLowerCase())||classify((mesh.name||'').toLowerCase());
  }
  function palette(kit,id) {
    return {shirt:kit.c1,shorts:kit.sh,socks:kit.so,skin:SKINS[id%SKINS.length],hair:HAIRS[(id*7)%HAIRS.length],detail:kit.c2||kit.c1,boots:FX.identity(id).boots};
  }
  // Control separado del renderer para verificar transiciones y velocidad sin WebGL.
  const BASE=new Set(['idle','jog','sprint']);
  function fadeDuration(from,to){
    if(ONCE.has(to))return .08;
    if(ONCE.has(from))return .20;
    if(from==='idle'||to==='idle')return .24;
    return from!==to?.18:CROSSFADE;
  }
  function updateAction(actor,p,anim,options,dt) {
    dt=Math.max(0,Math.min(.05,dt));
    const raw=Math.max(0,anim.speed||0);
    actor.filteredSpeed=actor.filteredSpeed===undefined?raw:actor.filteredSpeed+(raw-actor.filteredSpeed)*C.alpha(dt,.09);
    actor.clipAge=(actor.clipAge??1)+dt;
    if(actor.moving===undefined)actor.moving=raw>.20;
    else if(actor.moving?actor.filteredSpeed<.07:actor.filteredSpeed>.20)actor.moving=!actor.moving;
    let name=selectClip(p,anim,options);
    if(BASE.has(name)&&p.st==='run'&&!options.fx?.fall&&!options.fx?.goal&&!options.celebrate){
      const sprint=(anim.sprint??(p.flags&2?1:0));
      actor.fast=actor.fast?sprint>.35:sprint>.65;
      name=actor.moving?(actor.fast?'sprint':'jog'):'idle';
    }
    if(actor.identity?.body.crutches&&BASE.has(name))name='idle';
    const force=options.fx?.fall||options.fx?.goal||p.st!=='run';
    if(actor.current&&ONCE.has(actor.current)&&actor.action.isRunning()&&BASE.has(name)&&!force)name=actor.current;
    if(actor.current&&BASE.has(name)&&BASE.has(actor.current)&&actor.clipAge<.18&&!force)name=actor.current;
    const kick=!!(p.flags&4),retrigger=kick&&!actor.lastKick&&['kick','pass'].includes(name);actor.lastKick=kick;
    if(name!==actor.current||retrigger){
      const next=actor.actions[name];if(!next)throw new Error('Falta el clip '+name);
      const previous=actor.action,previousName=actor.current,duration=fadeDuration(previousName,name);
      next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
      if(previous&&previous!==next){
        if(RUNS.has(name)&&RUNS.has(previousName))next.time=(previous.time%previous.getClip().duration)/previous.getClip().duration*next.getClip().duration;
        next.crossFadeFrom(previous,duration,false);
        if(!actor.retiring){actor.retiring=Array.from({length:16},()=>({action:null,left:0}));actor.retiringCount=0;}
        if(actor.retiringCount===16){actor.retiring[0].action.stop();for(let i=1;i<16;i++){actor.retiring[i-1].action=actor.retiring[i].action;actor.retiring[i-1].left=actor.retiring[i].left;}actor.retiringCount=15;}
        const fade=actor.retiring[actor.retiringCount++];fade.action=previous;fade.left=duration;
      }
      actor.current=name;actor.action=next;actor.clipAge=0;
    }
    const locomotion=name==='jog'||name==='sprint';
    actor.action.setEffectiveTimeScale(locomotion?actor.filteredSpeed*60/actor.referenceSpeed[name]*CADENCE:1);
    actor.mixer.update(dt);
    if(actor.retiring){let n=0;for(let i=0;i<actor.retiringCount;i++){const fade=actor.retiring[i];if(fade.action===actor.action)continue;fade.left-=dt;if(fade.left<=0)fade.action.stop();else{const keep=actor.retiring[n++];keep.action=fade.action;keep.left=fade.left;}}actor.retiringCount=n;}
  }
  // Estilo caricatura: cabeza enorme, manos y pies grandes, sombreado plano y contorno de tinta.
  const INK='#2b1a12',INK_WIDTH=0.32;
  const CARICATURE={Head:2.9,neck_01:1.15,hand_l:1.35,hand_r:1.35,foot_l:1.2,foot_r:1.2};
  function toonify(THREE,asset) {
    // Rampa de 3 tonos: luz, medio tono y sombra cálida, como lápiz de color.
    const ramp=new THREE.DataTexture(new Uint8Array([110,96,88,255,190,180,170,255,255,255,255,255]),3,1);
    ramp.minFilter=ramp.magFilter=THREE.NearestFilter;ramp.needsUpdate=true;
    const done=new Map();
    asset.traverse(mesh=>{
      if(!mesh.isMesh) return;
      const swap=m=>{
        if(!done.has(m)){const t=new THREE.MeshToonMaterial({name:m.name,color:m.color,map:m.map,gradientMap:ramp});t.userData={...m.userData};done.set(m,t);}
        return done.get(m);
      };
      mesh.material=Array.isArray(mesh.material)?mesh.material.map(swap):swap(mesh.material);
    });
  }
  function inkMaterial(THREE,width,skinned) {
    const m=new THREE.MeshBasicMaterial({color:INK,side:THREE.BackSide});
    // Casco invertido: extruir la malla ya deformada por el esqueleto a lo largo de su normal.
    if(skinned) m.onBeforeCompile=s=>{s.vertexShader=s.vertexShader.replace('#include <skinning_vertex>','#include <skinning_vertex>\ntransformed+=normalize(objectNormal)*'+width.toFixed(5)+';');};
    m.customProgramCacheKey=()=>'ink'+width.toFixed(5);
    return m;
  }
  function stylize(THREE,shared,actor) {
    const {object}=actor,inks=shared.inks,v=new THREE.Vector3();
    object.updateMatrixWorld(true);
    const skinned=[];actor.bones=[];actor.identity=FX.identity(actor.info.id||0);
    object.traverse(n=>{
      if(n.isMesh&&n.name==='Hair')n.visible=false;
      if(n.isSkinnedMesh&&!/eye|brow|hair/i.test(n.name)) skinned.push(n);
      if(n.isBone&&CARICATURE[n.name]) actor.bones.push([n,CARICATURE[n.name]]);
    });
    for(const mesh of skinned) {
      const width=INK_WIDTH/mesh.getWorldScale(v).x,key=width.toFixed(5);
      if(!inks.has(key)) inks.set(key,inkMaterial(THREE,width,true));
      const ink=new THREE.SkinnedMesh(mesh.geometry,inks.get(key));
      ink.bind(mesh.skeleton,mesh.bindMatrix);ink.bindMode=mesh.bindMode;ink.frustumCulled=false;
      ink.position.copy(mesh.position);ink.quaternion.copy(mesh.quaternion);ink.scale.copy(mesh.scale);
      mesh.parent.add(ink);
    }
    const head=actor.bones.find(([b])=>b.name==='Head')?.[0];
    const skin=actor.materials.find(m=>m.role==='skin')?.material;
    if(!head||!skin) return;
    // Marco de la cara en unidades del atlas, alineado con el modelo en pose de reposo (+Y arriba, +Z frente).
    const face=new THREE.Group(),q=new THREE.Quaternion();
    head.getWorldQuaternion(q);face.quaternion.copy(q.invert().multiply(object.getWorldQuaternion(new THREE.Quaternion())));
    face.scale.setScalar(1/head.getWorldScale(v).x);head.add(face);
    const part=(mat,pos,size)=>{
      const m=new THREE.Mesh(shared.sphere,mat),o=new THREE.Mesh(shared.sphere,shared.ink);
      m.position.set(...pos);m.scale.set(...size);o.position.copy(m.position);o.scale.copy(m.scale).multiplyScalar(1.22);
      face.add(o,m);return {m,o};
    };
    // Medidas del hueso Head sin escalar: cara a ~1.5 al frente, centro de la cabeza ~2.5 arriba.
    actor.features={pupils:[],brows:[],tears:[],spirals:[]};
    for(const side of [-1,1]) {
      part(shared.eye,[side*0.5,2.35,1.3],[0.48,0.56,0.34]);
      actor.features.pupils.push(part(shared.pupil,[side*0.45,2.3,1.62],[0.22,0.26,0.08]));
      actor.features.brows.push(part(shared.pupil,[side*.5,3.02,1.4],[.5,.09,.12]));
      actor.features.tears.push(part(shared.tear,[side*.65,1.65,1.6],[.18,.6,.13]));
      const spiral=new THREE.Line(shared.spiral,shared.spiralInk);spiral.position.set(side*.5,2.35,1.73);face.add(spiral);actor.features.spirals.push(spiral);
      part(skin,[side*1.45,2.0,0.2],[0.32,0.65,0.42]);
    }
    part(skin,[0,1.75,1.75],[0.5,0.52,0.72]);
    actor.features.mouth=part(shared.pupil,[0,1.05,1.5],[.48,.16,.15]);
    actor.features.teeth=part(shared.eye,[0,1.1,1.65],[.38,.1,.05]);
    const hair=actor.materials.find(m=>m.role==='hair')?.material||shared.pupil;
    const tuft=(pos,size,mat=hair)=>{const mesh=new THREE.Mesh(shared.tuft,mat);mesh.position.set(...pos);mesh.scale.set(...size);face.add(mesh);return mesh;};
    const detail=new THREE.MeshToonMaterial({color:'#ffffff'});actor.materials.push({material:detail,role:'detail'});
    const style=actor.identity.hair;
    if(style!==1)tuft([0,3.65,0],[1.43,.4,1.28]); // rapado como base
    if(style===1)for(let i=0;i<9;i++){const a=i*Math.PI/4;tuft([Math.cos(a)*1.1,3.9+Math.sin(a)*.25,Math.sin(a)*.8],[1,1,.9]);}
    if(style===2)for(let i=0;i<7;i++)tuft([-1.2+i*.4,2.8,-.95],[.22,1.6,.3]); // rastas
    if(style===3)tuft([0,4.15,-1],[.8,.85,.8]); // rodete
    if(style===4)for(let i=0;i<4;i++)tuft([0,4.1,-.8+i*.6],[.28,1.05,.42]);
    if(style===5||actor.identity.band)tuft([0,3.25,.15],[1.5,.18,1.35],detail);
    if(style===6){tuft([0,3.8,0],[1.6,.65,1.4],detail);tuft([0,3.65,-1.5],[1.2,.1,.9],detail);}
    addStreetExtras(THREE,shared,actor,skin,detail);
    addBodyExtras(THREE,shared,actor);
  }
  function addStreetExtras(THREE,shared,actor,skin,detail){
    const {object,identity}=actor,shirt=actor.materials.find(m=>m.role==='shirt')?.material;
    const add=(name,mat,pos,size)=>{
      const bone=object.getObjectByName(name);if(!bone)return;
      const group=new THREE.Group(),q=new THREE.Quaternion(),v=new THREE.Vector3();
      bone.getWorldQuaternion(q);group.quaternion.copy(q.invert().multiply(object.getWorldQuaternion(new THREE.Quaternion())));
      group.scale.setScalar(1/bone.getWorldScale(v).x);bone.add(group);
      for(const [material,factor] of [[shared.ink,1.08],[mat,1]]){
        const m=new THREE.Mesh(shared.sphere,material);m.position.set(...pos);m.scale.set(size[0]*factor,size[1]*factor,size[2]*factor);group.add(m);
      }
    };
    for(const side of ['l','r']){
      if(identity.wrist)add('hand_'+side,detail,[0,.2,0],[1.1,.7,1]);
      if(identity.socks==='bajas')add('calf_'+side,skin,[0,-1.1,0],[1.55,2.2,1.6]);
      if(identity.shirt==='sinMangas')add('upperarm_'+side,skin,[0,-1.2,0],[1.65,2.1,1.65]);
    }
    if(identity.shirt==='afuera'&&shirt)add('pelvis',shirt,[0,1,0],[4.1,2.2,2.65]);
  }
  function bodyScales(actor){
    const body=actor.identity.body;
    for(const r of actor.rigList){
      const f=r.factor;
      if(f)r.bone.scale.set(r.scale.x*f[0],r.scale.y*f[1],r.scale.z*f[2]);
      if(r.foot&&body.feet)r.bone.scale.multiplyScalar(body.feet);
    }
    actor.object.scale.set(actor.baseScale*body.height*body.width,actor.baseScale*body.height,actor.baseScale*body.height);
  }
  function addBodyExtras(THREE,shared,actor){
    const body=actor.identity.body;
    const mesh=(parent,geometry,material,pos,size)=>{const n=new THREE.Mesh(geometry,material);n.position.set(...pos);n.scale.set(...size);parent.add(n);return n;};
    if(body.belly){
      const spine=actor.object.getObjectByName('spine_01'),shirt=actor.materials.find(m=>m.role==='shirt')?.material;
      if(spine&&shirt){
        const belly=new THREE.Group(),q=new THREE.Quaternion(),v=new THREE.Vector3();
        spine.getWorldQuaternion(q);belly.quaternion.copy(q.invert().multiply(actor.object.getWorldQuaternion(new THREE.Quaternion())));
        belly.scale.setScalar(1/spine.getWorldScale(v).x);spine.add(belly);
        mesh(belly,shared.sphere,shared.ink,[0,-.5,2.8],[6.3,6.5,5.7]);
        mesh(belly,shared.sphere,shirt,[0,-.5,2.8],[6.05,6.25,5.45]);
        actor.belly=belly;actor.bellyScale=belly.scale.x;
      }
    }
    if(body.crutches){
      const group=new THREE.Group();group.scale.setScalar(1/actor.baseScale);actor.object.add(group);
      actor.crutches={group,poles:[]};
      for(const side of [-1,1]){
        const pole=new THREE.Group();pole.position.set(side*4.6,20,.3);group.add(pole);actor.crutches.poles.push(pole);
        for(const x of [-.75,.75])mesh(pole,shared.tube,shared.metal,[x,-6.1,0],[.19,11.8,.19]);
        mesh(pole,shared.tube,shared.metal,[0,-15.8,0],[.24,8,.24]);
        mesh(pole,shared.box,shared.rubber,[0,0,0],[2.8,.8,1.1]);
        mesh(pole,shared.box,shared.rubber,[0,-5.3,0],[1.9,.55,.9]);
        mesh(pole,shared.box,shared.metal,[0,-11.9,0],[1.85,.4,.45]);
        mesh(pole,shared.sphere,shared.rubber,[0,-20,0],[.55,.4,.55]);
      }
    }
  }
  function createBackend(THREE,clone,asset,clips,config=CONFIG,rendererFactory) {
    const actors=new Map(),scene=new THREE.Scene();
    const {columns,rows,tileW,tileH,base}=ATLAS,resolution=config.resolution||(typeof window!=='undefined'&&window.innerWidth<600?2:3);
    const renderer=rendererFactory?rendererFactory():new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
    renderer.setPixelRatio(1);renderer.setSize(columns*tileW*resolution,rows*tileH*resolution,false);
    renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
    const camera=new THREE.OrthographicCamera(0,columns*tileW,rows*tileH,0,0.1,1000);
    camera.position.set(0,0,100);camera.lookAt(0,0,0);
    scene.add(new THREE.HemisphereLight(0xfff3df,0x8a5a3c,1.6));
    const sun=new THREE.DirectionalLight(0xffffff,2.6);sun.position.set(-20,35,50);scene.add(sun);
    // El doble de prueba sin WebGL no trae materiales toon: se dibuja sin estilo.
    const toon=!!THREE.MeshToonMaterial,shared={inks:new Map()};
    if(toon) {
      toonify(THREE,asset);
      Object.assign(shared,{sphere:new THREE.SphereGeometry(1,14,10),tuft:new THREE.SphereGeometry(1,8,6),ink:inkMaterial(THREE,0,false),
        tube:new THREE.CylinderGeometry(1,1,1,6),box:new THREE.BoxGeometry(1,1,1),
        metal:new THREE.MeshToonMaterial({color:'#bed5e2'}),rubber:new THREE.MeshToonMaterial({color:INK}),
        tear:new THREE.MeshBasicMaterial({color:'#6de6ff'}),
        spiralInk:new THREE.LineBasicMaterial({color:INK}),
        spiral:new THREE.BufferGeometry().setFromPoints(Array.from({length:28},(_,i)=>{const a=i*.48,r=i/65;return new THREE.Vector3(Math.cos(a)*r,Math.sin(a)*r,0);})),
        eye:new THREE.MeshBasicMaterial({color:'#fbf6ea'}),pupil:new THREE.MeshBasicMaterial({color:INK})});
    }
    const box=new THREE.Box3().setFromObject(asset),size=box.getSize(new THREE.Vector3());
    if(!(size.y>0)) throw new Error('player.glb tiene altura nula; se espera glTF con eje Y vertical');
    const scale=config.height/size.y;
    const center=box.getCenter(new THREE.Vector3());
    const available=Array.from({length:columns*rows},(_,i)=>i);
    const speed={...config.referenceSpeed};
    const warnings=[];
    for(const name of ['jog','sprint']) {
      const measured=measureSpeed(THREE,clone,asset,clips[name],scale);
      if(measured>0.01) speed[name]=measured;
      else warnings.push('No se pudo medir el apoyo de '+name+'; calibrar referenceSpeed para este asset.');
    }
    const seen=new Set(),metrics={maxPositionStep:0,maxRotationStep:0,maxPoseStep:0};
    let lastTime=null,preparedFrame=null,renderCount=0,lastDt=0;
    function create(key,info) {
      if(!available.length) throw new Error('El atlas admite hasta 24 modelos (22 jugadores y vista previa)');
      const object=clone(asset),pivot=new THREE.Group(),slot=new THREE.Group();
      object.scale.setScalar(scale);object.position.set(-center.x*scale,-box.min.y*scale,-center.z*scale);
      pivot.rotation.x=0.48; // La misma vista elevada de la cancha; no se modifica su cámara.
      const motion=new THREE.Group();motion.add(object);pivot.add(motion);slot.add(pivot);scene.add(slot);
      const index=available.shift();slot.position.set((index%columns)*tileW+tileW/2,(rows-1-Math.floor(index/columns))*tileH+base,0);
      const materials=[],copies=new Map();
      object.traverse(mesh=>{
        if(!mesh.isMesh) return;
        // SkeletonUtils comparte la geometría y clona el esqueleto; no duplicar buffers.
        mesh.frustumCulled=false;
        const paint=source=>{
          const role=materialRole(source,mesh),cacheKey=source.uuid+':'+role;
          let material=copies.get(cacheKey);
          if(!material){material=source.clone();copies.set(cacheKey,material);materials.push({material,role,base:source.color?.clone()});}
          return material;
        };
        mesh.material=Array.isArray(mesh.material)?mesh.material.map(paint):paint(mesh.material);
      });
      const mixer=new THREE.AnimationMixer(object),actions={};
      for(const name of CLIPS) {
        const action=mixer.clipAction(clips[name]);
        action.setLoop(ONCE.has(name)?THREE.LoopOnce:THREE.LoopRepeat,ONCE.has(name)?1:Infinity);
        action.clampWhenFinished=ONCE.has(name);actions[name]=action;
      }
      const actor={key,index,object,pivot,motion,slot,mixer,actions,materials,referenceSpeed:speed,info,baseScale:scale,baseY:object.position.y,current:null,action:null,lastSeen:0,signature:'',bones:[]};
      if(toon) stylize(THREE,shared,actor);
      actor.rig={};actor.rigList=[];object.traverse(n=>{if(n.isBone){const r={bone:n,q:n.quaternion.clone(),scale:n.scale.clone()};const body=actor.identity?.body;r.factor=body?(/^spine_0[12]$/.test(n.name)?body.spine:/^thigh_/.test(n.name)?body.leg:/^upperarm_/.test(n.name)?body.arm:null):null;r.foot=/^foot_/.test(n.name);actor.rig[n.name]=r;actor.rigList.push(r);}});
      if(actor.identity){
        // Bajar la pelvis lo que acortaron las piernas: los pies siguen apoyando.
        const feet=['foot_l','foot_r'].map(n=>actor.rig[n]?.bone).filter(Boolean),v=new THREE.Vector3();
        const floor=()=>{object.updateMatrixWorld(true);return Math.min(...feet.map(b=>object.worldToLocal(b.getWorldPosition(v)).y));};
        const before=feet.length?floor():0;bodyScales(actor);const after=feet.length?floor():0;
        actor.baseY=actor.baseY*actor.identity.body.height+(before-after)*scale*actor.identity.body.height;
      }
      actor.metricQ=toon?actor.motion.quaternion.clone():null;
      actor.retiring=Array.from({length:16},()=>({action:null,left:0}));actor.retiringCount=0;
      actor.visual={x:0,y:0};actor.fallPose={};actor.state={p:{},anim:{},options:{}};
      actor.poseNodes=[];
      if(toon){
        const nodes=[actor.motion,actor.object];for(const r of actor.rigList)nodes.push(r.bone);
        if(actor.features){for(const parts of [actor.features.pupils,actor.features.brows,actor.features.tears])for(const part of parts)nodes.push(part.m,part.o);nodes.push(actor.features.mouth.m,actor.features.mouth.o,actor.features.teeth.m,actor.features.teeth.o,...actor.features.spirals);}
        if(actor.crutches)nodes.push(actor.crutches.group);
        for(const n of nodes)actor.poseNodes.push({n,p:n.position.clone(),q:n.quaternion.clone(),s:n.scale.clone(),shown:n.visible?1:0,ready:false});
      }
      actors.set(key,actor);return actor;
    }
    function tint(actor,kit,info) {
      if(actor.kit===kit&&actor.tintId===info.id)return;actor.kit=kit;actor.tintId=info.id;
      const colors=palette(kit,info.id),signature=JSON.stringify(colors);
      if(actor.signature===signature) return;
      for(const {material,role,base} of actor.materials) {
        if(role && material.color) material.color.set(colors[role]);
        else if(base && material.color) material.color.copy(base);
      }
      actor.signature=signature;
    }
    function remove(actor) {
      actor.mixer.stopAllAction();actor.mixer.uncacheRoot(actor.object);scene.remove(actor.slot);
      actor.object.traverse(mesh=>{if(mesh.isSkinnedMesh) mesh.skeleton.dispose();});
      for(const {material} of actor.materials) material.dispose();
      available.push(actor.index);actors.delete(actor.key); // Nunca destruir geometrías/texturas compartidas.
    }
    function render(time) {
      const delta=lastTime===null?0:Math.min(.05,Math.max(0,(time-lastTime)/1000));lastTime=time;lastDt=delta;
      for(const actor of actors.values()) {
        if(time-actor.lastSeen>10000){remove(actor);continue;}
        if(!actor.state) continue;
        const {p,anim,options}=actor.state;
        for(const r of actor.rigList){r.bone.quaternion.copy(r.q);r.bone.scale.copy(r.scale);}
        updateAction(actor,p,anim,options,delta);
        for(const [bone,s] of actor.bones) bone.scale.setScalar(s); // Después del mixer, por si un clip anima escala.
        if(actor.identity)bodyScales(actor);
        const face=anim.moveFace===undefined||anim.speed<0.12?p.face:anim.moveFace;
        const target=Math.PI/2-face;actor.heading=actor.heading===undefined?target:C.turn(actor.heading,target,delta,9);
        actor.object.rotation.y=actor.heading;
        applyProcedural(actor,p,options);
        applyVariety(actor,p,anim,options);
        smoothPose(actor,delta);
        metrics.maxPoseStep=Math.max(metrics.maxPoseStep,actor.poseStep||0);
        if(actor.previousX!==undefined&&p.alpha!==0)metrics.maxPositionStep=Math.max(metrics.maxPositionStep,Math.hypot((p.x||0)-actor.previousX,(p.y||0)-actor.previousY));
        if(actor.previousHeading!==undefined)metrics.maxRotationStep=Math.max(metrics.maxRotationStep,Math.abs(C.angle(actor.previousHeading,actor.heading)));
        if(actor.metricQ){metrics.maxPoseStep=Math.max(metrics.maxPoseStep,actor.metricQ.angleTo(actor.motion.quaternion));actor.metricQ.copy(actor.motion.quaternion);}
        actor.previousX=p.x||0;actor.previousY=p.y||0;actor.previousHeading=actor.heading;
      }
      renderer.render(scene,camera);renderCount++;
    }
    function prepare(p,info,kit,anim,options,time=options.time){
      const key=p.id===undefined?'preview':p.id;
      const actor=actors.get(key)||create(key,info);
      actor.lastSeen=time;Object.assign(actor.state.p,p);Object.assign(actor.state.anim,anim);Object.assign(actor.state.options,options);tint(actor,kit,info);return actor;
    }
    function draw(g,p,info,kit,anim={},options={}) {
      const key=p.id===undefined?'preview':p.id,time=options.time===undefined?performance.now():options.time;
      const fresh=seen.has(key)||lastTime===null;if(fresh)seen.clear();
      const actor=preparedFrame===time&&actors.has(key)?actors.get(key):prepare(p,info,kit,anim,options,time);
      seen.add(key);if(fresh&&lastTime!==time)render(time);
      const x=(actor.index%columns)*tileW*resolution,y=Math.floor(actor.index/columns)*tileH*resolution;
      g.imageSmoothingEnabled=true;g.drawImage(renderer.domElement,x,y,tileW*resolution,tileH*resolution,-tileW/2+(actor.visualX??actor.visual.x),base-tileH+(actor.visualY??actor.visual.y)*.78,tileW,tileH);
    }
    function dispose(){for(const actor of Array.from(actors.values()))remove(actor);renderer.dispose();}
    function stats(){return {players:actors.size,mixers:actors.size,renderers:1,renders:renderCount,lastFrameSeconds:lastDt,atlasResolution:resolution,warnings:[...warnings],...metrics};}
    return {draw,prepare,renderFrame(time){preparedFrame=time;render(time);},resetMetrics(){metrics.maxPositionStep=metrics.maxRotationStep=metrics.maxPoseStep=0;},dispose,stats,actors,renderer};
  }
  // Todo el movimiento cómico se aplica después del mixer y se restaura cada cuadro.
  function bend(actor,name,x=0,z=0){const b=actor.rig[name]?.bone;if(b){b.rotation.x+=x;b.rotation.z+=z;}}
  function poseBend(actor,name,x,y,z){const b=actor.rig[name]?.bone;if(b){b.rotation.x+=x;b.rotation.y+=y;b.rotation.z+=z;}}
  function partShape(part,x,y,z){part.m.scale.set(x,y,z);part.o.scale.set(x*1.22,y*1.22,z*1.22);}
  function applyVariety(actor,p,anim,options){
    const tick=options.fx?.tick??(options.time||0)*.06,phase=tick*.24+(Number(p.id)||0),moving=p.st==='run'?clamp((anim.speed||0)/2.5,0,1):0;
    if(actor.belly){
      const s=actor.bellyScale,wobble=Math.sin(phase)*moving*.06;
      actor.belly.scale.set(s*(1+wobble),s*(1-wobble*.5),s*(1+wobble*.5));
    }
    if(!actor.crutches)return;
    const active=!options.fx?.fall&&!options.fx?.goal&&SUPPORT.has(p.st);
    actor.crutches.group.visible=active;actor.crutches.group.scale.setScalar(1/actor.baseScale);if(!active)return;
    const hop=Math.max(0,Math.sin(phase))*moving;
    actor.motion.position.y+=hop*2.2;actor.motion.rotation.z+=Math.sin(phase)*moving*.035;
    for(let i=0;i<actor.crutches.poles.length;i++){const pole=actor.crutches.poles[i];
      pole.rotation.x=Math.sin(phase)*moving*.3;pole.rotation.z=(i?1:-1)*.09;
      pole.position.z=.3+Math.cos(phase)*moving*1.1;
    }
    bend(actor,'upperarm_l',-.28,-.12);bend(actor,'upperarm_r',-.28,.12);
    bend(actor,'lowerarm_l',-.55);bend(actor,'lowerarm_r',-.55);
    bend(actor,'thigh_r',-.3-moving*.2);bend(actor,'calf_r',.8+moving*.25);
    bend(actor,'thigh_l',Math.sin(phase)*moving*.18);
  }
  function applyProcedural(actor,p,options) {
    const f=options.fx?.fall,tick=options.fx?.tick||0,m=actor.motion;
    m.rotation.order='YXZ';m.rotation.x=m.rotation.y=m.rotation.z=0;m.position.set(0,0,0);m.scale.setScalar(1);
    actor.visual.x=actor.visual.y=0;actor.object.position.y=actor.baseY;
    updateFace(actor,p,options);
    if(options.fx?.goal){applyCelebration(actor,p,options);return;}
    if(!f){
      const tick=options.fx?.tick||0,shot=options.fx?.shot;
      const jump=p.st==='rainbow'?Math.sin((p.stT||0)*.15)*3:shot?Math.sin(clamp((tick-shot.tick)/25,0,1)*Math.PI)*3:0;
      const sy=1+Math.max(0,jump)*.06;m.position.y=Math.max(0,jump);m.scale.set(1/Math.sqrt(sy),sy,1/Math.sqrt(sy));
      applyReaction(actor,p,options);
      return;
    }
    const pose=FX.fallPose(f,tick,actor.fallPose),age=tick-f.tick;
    const recovery=age>f.duration?1-clamp((age-f.duration)/18,0,1):1;
    // El centro de giro queda en la cintura, para apoyar el cuerpo en el césped.
    m.position.y=(15-pose.drop+pose.height)*recovery;
    actor.object.position.y=actor.baseY-15*recovery;
    const recovering=age>=f.duration;
    m.rotation.order=pose.variant===2?'YZX':'YXZ';
    m.rotation.x=(recovering?C.angle(0,pose.rx):pose.rx)*recovery;m.rotation.z=(recovering?C.angle(0,pose.rz):pose.rz)*recovery;
    const heading=Math.PI/2-Math.atan2(f.dy,f.dx),target=Math.PI/2-p.face;
    m.rotation.y=heading+C.angle(heading,target)*(1-recovery)+(recovering?C.angle(0,pose.ry):pose.ry)*recovery;
    actor.object.rotation.y=0;
    const sy=1+(pose.squash-1)*recovery;m.scale.set(1/Math.sqrt(sy),sy,1/Math.sqrt(sy));
    actor.visual.x=f.dx*pose.distance*recovery;actor.visual.y=f.dy*pose.distance*recovery;
    poseBend(actor,'upperarm_l',0,0,-pose.arms*recovery);poseBend(actor,'upperarm_r',0,0,pose.arms*recovery);
    poseBend(actor,'thigh_l',pose.flail*recovery,0,0);poseBend(actor,'thigh_r',-pose.flail*recovery,0,0);
    if(pose.variant===3){poseBend(actor,'thigh_l',-1.4*recovery,0,0);poseBend(actor,'thigh_r',-1.4*recovery,0,0);}
    if(pose.variant===5){poseBend(actor,'lowerarm_l',-1.9*recovery,0,0);poseBend(actor,'thigh_l',-.9*recovery,0,0);}
  }
  function applyCelebration(actor,p,options){
    const fx=options.fx,e=fx.goal,t=(fx.tick-e.tick)/60,m=actor.motion;
    const win=e.team===fx.team,near=e.celebrants?.includes(p.id),style=FX.hash(p.id+e.tick)%4;
    const ramp=Math.min(1,t*4),exit=clamp((420-(fx.tick-e.tick))/24,0,1),weight=ramp*exit;
    if(win){
      if(!near){bend(actor,'upperarm_l',0,-.9*weight);bend(actor,'upperarm_r',0,.9*weight);return;}
      if(style===0){ // Avioncito: torso inclinado y alas extendidas.
        bend(actor,'upperarm_l',0,-1.5*weight);bend(actor,'upperarm_r',0,1.5*weight);
        m.rotation.x=-.3*weight;m.rotation.z=Math.sin(t*4)*.18*weight;
        actor.visual.x=Math.sin(t*2)*12*weight;actor.visual.y=Math.cos(t*2)*5*weight;
      }else if(style===1){m.rotation.z=Math.sin(t*9)*.18*weight;}
      else if(style===2){ // Panza al pasto, dentro de la pausa existente.
        m.position.y=5*weight;actor.object.position.y=actor.baseY-15*weight;m.rotation.x=Math.PI/2*weight;
        actor.visual.x=Math.cos(p.face)*Math.min(t*14,22)*weight;actor.visual.y=Math.sin(p.face)*Math.min(t*14,22)*weight;
        bend(actor,'upperarm_l',0,-1.3*weight);bend(actor,'upperarm_r',0,1.3*weight);
      }else{
        const jump=Math.abs(Math.sin(t*6));m.position.y=jump*10*weight;
        const sy=1+(.22*jump-.12)*weight;m.scale.set(1/Math.sqrt(sy),sy,1/Math.sqrt(sy));
        bend(actor,'upperarm_l',-.8*weight,-1.1*weight);bend(actor,'upperarm_r',-.8*weight,1.1*weight);
      }
    }else{
      const sad=FX.hash(p.id)%3;
      if(sad===0){m.rotation.x=-Math.PI/2*weight;m.position.y=5*weight;actor.object.position.y=actor.baseY-15*weight;}
      else if(sad===1){bend(actor,'spine_02',.45*weight);bend(actor,'Head',.4*weight);bend(actor,'upperarm_l',.3*weight);bend(actor,'upperarm_r',.3*weight);}
      else{m.rotation.x=-Math.PI/2*weight;m.position.y=5*weight;actor.object.position.y=actor.baseY-15*weight;bend(actor,'thigh_l',Math.sin(t*16)*.8*weight);bend(actor,'thigh_r',-Math.sin(t*16)*.8*weight);}
    }
  }
  function applyReaction(actor,p,options){
    const fx=options.fx||{},tick=fx.tick||0,m=actor.motion;
    if(p.st==='dive'){m.scale.set(1.25,.8,1.12);m.position.y+=3;}
    if(fx.hit){
      const hit=fx.hit,t=clamp((tick-hit.tick)/24,0,1),pulse=Math.sin(Math.PI*t),sign=hit.id===p.id?-1:1,sy=1-.28*Math.sin(Math.PI*clamp(t*2,0,1));
      m.scale.set(1/Math.sqrt(sy),sy,1/Math.sqrt(sy));m.position.y+=pulse*5;
      actor.visual.x=(hit.dx??1)*sign*pulse*8;actor.visual.y=(hit.dy||0)*sign*pulse*8;
    }
    if(fx.post){
      const e=fx.post,t=clamp((tick-e.tick)/42,0,1),pulse=Math.sin(Math.PI*t),dx=e.x-p.x,dy=e.y-p.y,d=Math.hypot(dx,dy)||1;
      actor.visual.x=dx/d*Math.min(d,18)*pulse;actor.visual.y=dy/d*Math.min(d,18)*pulse;
      m.rotation.z=(dx<0?1:-1)*pulse*1.35;m.scale.set(1.28,1/1.28,1);m.position.y+=3*pulse;
    }
  }
  function updateFace(actor,p,options) {
    const face=actor.features;if(!face)return;
    const fx=options.fx||{},cry=fx.goal&&fx.goal.team!==fx.team,dizzy=!!fx.fall||!!fx.daze,angry=p.st==='slide';
    const open=!!(p.flags&4)||!!fx.shot,sprint=!!(p.flags&2),tick=fx.tick||0;
    for(let i=0;i<face.pupils.length;i++){const part=face.pupils[i];
      part.m.visible=part.o.visible=!dizzy;const side=i?1:-1;
      part.m.position.x=side*(dizzy?.15:.45);part.o.position.x=part.m.position.x;
      partShape(part,.22,.26,.08);partShape(face.tears[i],.18,.6,.13);face.spirals[i].scale.setScalar(1);
      const brow=face.brows[i];brow.m.rotation.z=brow.o.rotation.z=angry?side*.45:cry?-side*.3:0;
      const tear=face.tears[i];tear.m.visible=tear.o.visible=!!cry;
      tear.m.position.y=tear.o.position.y=1.45+.25*Math.sin(tick*.28);
      face.spirals[i].visible=dizzy;face.spirals[i].rotation.z=tick*.13;
    }
    partShape(face.teeth,.38,.1,.05);
    partShape(face.mouth,open?.52:cry?.4:.48,open?.6:cry?.35:sprint?.23:.13,.15);
    face.teeth.m.visible=face.teeth.o.visible=sprint&&!open&&!cry;
  }
  function smoothPose(actor,dt){
    const k=C.alpha(dt,.035),visibility=C.alpha(dt,.045);
    actor.poseStep=0;
    for(const c of actor.poseNodes){
      const n=c.n,target=n.visible?1:0;
      if(!c.ready){c.p.copy(n.position);c.q.copy(n.quaternion);c.s.copy(n.scale);c.shown=target;c.ready=true;}
      else{const distance=c.q.angleTo(n.quaternion),rotation=C.rotationAlpha(distance,dt,n===actor.motion?60:24);c.p.lerp(n.position,k);c.q.slerp(n.quaternion,rotation);c.s.lerp(n.scale,k);c.shown+=(target-c.shown)*visibility;if(c.shown>.002)actor.poseStep=Math.max(actor.poseStep,distance*rotation);}
      n.position.copy(c.p);n.quaternion.copy(c.q);n.scale.copy(c.s);n.visible=c.shown>.002;
      if(c.shown<.999)n.scale.multiplyScalar(Math.max(.001,c.shown));
    }
    const k2=C.alpha(dt,.04);actor.visualX=actor.visualX===undefined?actor.visual.x:actor.visualX+(actor.visual.x-actor.visualX)*k2;actor.visualY=actor.visualY===undefined?actor.visual.y:actor.visualY+(actor.visual.y-actor.visualY)*k2;
  }
  function inPlace(THREE,clip,asset) {
    const result=clip.clone();
    const roots=new Set([asset.name]);asset.traverse(n=>{if(n.isBone&&!n.parent?.isBone) roots.add(n.name);});
    for(const track of result.tracks) {
      const parsed=THREE.PropertyBinding.parseTrackName(track.name);
      if(parsed.propertyName!=='position'||!roots.has(parsed.nodeName)) continue;
      // Conservar rebote vertical y pose inicial; la física del server controla X/Z.
      for(let i=3;i<track.values.length;i+=3){track.values[i]=track.values[0];track.values[i+2]=track.values[2];}
    }
    return result;
  }
  function measureSpeed(THREE,clone,asset,clip,scale) {
    const object=clone(asset),feet=[];
    object.traverse(n=>{if(n.isBone&&/foot|ankle|pie|toe/i.test(n.name)) feet.push(n);});
    if(!feet.length) return 0;
    const mixer=new THREE.AnimationMixer(object);mixer.clipAction(clip).play();
    const samples=feet.map(()=>[]),steps=48;
    for(let i=0;i<=steps;i++) {
      mixer.setTime(clip.duration*i/steps);object.updateMatrixWorld(true);
      feet.forEach((foot,j)=>samples[j].push(foot.getWorldPosition(new THREE.Vector3())));
    }
    const speeds=[];
    for(const points of samples) {
      const heights=points.map(p=>p.y).sort((a,b)=>a-b),floor=heights[Math.floor(heights.length*.15)];
      const max=heights[heights.length-1],threshold=floor+(max-floor)*.15;
      for(let i=1;i<steps;i++) if(points[i].y<=threshold&&points[i-1].y<=threshold) {
        const d=Math.hypot(points[i].x-points[i-1].x,points[i].z-points[i-1].z)*scale*steps/clip.duration;
        if(d>0.01) speeds.push(d);
      }
    }
    mixer.stopAllAction();mixer.uncacheRoot(object);
    object.traverse(n=>{if(n.isSkinnedMesh)n.skeleton.dispose();});
    speeds.sort((a,b)=>a-b);return speeds.length?speeds[Math.floor(speeds.length/2)]:0;
  }
  function validate(THREE,asset,clips) {
    let skinned=0;const nodes=new Set();asset.traverse(n=>{nodes.add(n.name);if(n.isSkinnedMesh)skinned++;});
    if(!skinned) throw new Error('player.glb no contiene SkinnedMesh: se necesita un modelo riggeado');
    for(const name of CLIPS) {
      const clip=clips[name];if(!clip||clip.duration<=0||!clip.tracks.length) throw new Error('Falta una animación válida: '+name);
      for(const track of clip.tracks) {
        const parsed=THREE.PropertyBinding.parseTrackName(track.name);
        if(parsed.nodeName&&!nodes.has(parsed.nodeName)) throw new Error('El clip '+name+' referencia un hueso ausente: '+parsed.nodeName);
      }
    }
  }
  let backend=null,loading=null,failure=null,lastDraw=null;
  const report=(message,error=false)=>{
    let el=document.getElementById('playerModelStatus');
    if(!message){el?.remove();return;}
    if(!el){el=document.createElement('div');el.id='playerModelStatus';el.setAttribute('role','status');
      el.style.cssText='position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:1000;padding:12px 18px;border-radius:8px;max-width:90vw;background:#172231;color:#fff;font:14px system-ui;box-shadow:0 4px 20px #0008';document.body.append(el);}
    el.textContent=message;el.dataset.error=String(error);
  };
  async function load() {
    report('Cargando jugadores 3D…');
    try {
      // Detectar el bloqueo local antes de solicitar módulos de terceros.
      const check=await fetch(CONFIG.model,{method:'HEAD'});
      if(!check.ok) throw new Error('Falta '+CONFIG.model+' (HTTP '+check.status+')');
      const [THREE,{GLTFLoader},{clone}]=await Promise.all([import('three'),import('three/addons/loaders/GLTFLoader.js'),import('three/addons/utils/SkeletonUtils.js')]);
      const loader=new GLTFLoader(),model=await loader.loadAsync(CONFIG.model),clips={};
      await Promise.all(CLIPS.map(async name=>{
        const embedded=model.animations.find(c=>c.name.toLowerCase()===name);
        if(embedded){clips[name]=embedded;return;}
        const path=CONFIG.clips+name+'.glb';
        let gltf;try{gltf=await loader.loadAsync(path);}catch(e){throw new Error('No se pudo cargar '+path+': '+e.message);}
        clips[name]=gltf.animations.find(c=>c.name.toLowerCase()===name)||gltf.animations[0];
      }));
      validate(THREE,model.scene,clips);
      for(const name of CLIPS) clips[name]=inPlace(THREE,clips[name],model.scene);
      backend=createBackend(THREE,clone,model.scene,clips);report('');
      for(const warning of backend.stats().warnings) console.warn('[player3d] '+warning);
      if(lastDraw){const d=lastDraw;d.g.save();d.g.setTransform(d.transform);backend.draw(d.g,d.p,d.info,d.kit,d.anim,d.options);d.g.restore();}
      return backend;
    } catch(e){failure=e;report('No se pudieron cargar los jugadores: '+e.message,true);return null;}
  }
  const api={
    resetMetrics(){backend?.resetMetrics();},
    prepare(p,info,kit,anim,options){backend?.prepare(p,info,kit,anim,options);},
    renderFrame(time){backend?.renderFrame(time);},
    draw(g,p,info,kit,anim={},options={}) {
      if(backend) return backend.draw(g,p,info,kit,anim,options);
      lastDraw={g,p,info,kit,anim,options,transform:g.getTransform()};
      if(!loading) loading=load();
    },
    ready(){if(!loading)loading=load();return loading;},
    stats(){return backend?{status:'ready',...backend.stats()}:{status:failure?'error':'loading',error:failure?.message||null,players:0,mixers:0,renderers:0};},
    dispose(){backend?.dispose();backend=null;loading=null;failure=null;lastDraw=null;},
  };
  root.FootballPlayer3D=api;
  if(typeof module!=='undefined') module.exports={FootballPlayer3D:api,selectClip,materialRole,palette,updateAction,createBackend,inPlace,validate,CROSSFADE,CLIPS,CONFIG,CADENCE,ATLAS,fadeDuration};
})(typeof module!=='undefined'?module.exports:window);
