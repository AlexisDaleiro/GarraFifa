/* Three.js r184. Geometría y texturas compartidas; esqueleto, materiales y mixer por jugador. */
(function (root) {
  'use strict';
  const CROSSFADE = 0.15;
  const CLIPS = ['idle','jog','sprint','kick','pass','slide','gk_dive','celebrate'];
  const ONCE = new Set(['kick','pass','slide','gk_dive']);
  const SKINS = ['#edbd96','#d6a078','#b77b54','#754a35','#f4cfaa'];
  const HAIRS = ['#201b19','#38251e','#71492d','#ba965a','#141518'];
  const CONFIG = { model:'/models/player.glb', clips:'/models/anims/', height:30,
    // Solo se usan si un clip in-place no permite medir el desplazamiento de sus pies.
    referenceSpeed:{jog:150,sprint:207} };
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function selectClip(p,anim={},options={}) {
    if(options.celebrate) return 'celebrate';
    if(p.st==='dive') return 'gk_dive';
    if(['slide','down','recover'].includes(p.st)) return 'slide';
    if(p.flags&4) return p.flags&32?'pass':'kick';
    if(['hold','fake','fooled'].includes(p.st)||(anim.speed||0)<0.12) return 'idle';
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
    if(['shirt','shorts','socks','skin','hair'].includes(explicit)) return explicit;
    return classify((material.name||'').toLowerCase())||classify((mesh.name||'').toLowerCase());
  }
  function palette(kit,id) {
    return {shirt:kit.c1,shorts:kit.sh,socks:kit.so,skin:SKINS[id%SKINS.length],hair:HAIRS[(id*7)%HAIRS.length]};
  }
  // Control separado del renderer para verificar transiciones y velocidad sin WebGL.
  function updateAction(actor,p,anim,options,dt) {
    let name=selectClip(p,anim,options);
    if(actor.current && ONCE.has(actor.current) && actor.action.isRunning() &&
       ['idle','jog','sprint'].includes(name)) name=actor.current;
    const kick=!!(p.flags&4),retrigger=kick&&!actor.lastKick&&['kick','pass'].includes(name);
    actor.lastKick=kick;
    if(name!==actor.current||retrigger) {
      const next=actor.actions[name];
      if(!next) throw new Error('Falta el clip '+name);
      const previous=actor.action,previousName=actor.current;
      next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
      if(previous&&previous!==next) {
        if(['jog','sprint'].includes(name)&&['jog','sprint'].includes(previousName)) {
          next.time=(previous.time%previous.getClip().duration)/previous.getClip().duration*next.getClip().duration;
        }
        next.crossFadeFrom(previous,CROSSFADE,false);
        actor.retiring=actor.retiring||[];actor.retiring.push({action:previous,left:CROSSFADE});
      }
      actor.current=name;actor.action=next;
    }
    const locomotion=name==='jog'||name==='sprint';
    // anim.speed está en unidades/tick del servidor de 60 Hz.
    actor.action.setEffectiveTimeScale(locomotion?(Math.max(0,anim.speed||0)*60/actor.referenceSpeed[name]):1);
    actor.mixer.update(Math.max(0,dt));
    actor.retiring=(actor.retiring||[]).filter(fade=>{
      if(fade.action===actor.action) return false;
      fade.left-=Math.max(0,dt);
      if(fade.left<=0){fade.action.stop();return false;}
      return true;
    });
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
    const skinned=[];actor.bones=[];
    object.traverse(n=>{
      if(n.isSkinnedMesh&&!/eye|brow/i.test(n.name)) skinned.push(n);
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
      face.add(o,m);
    };
    // Medidas del hueso Head sin escalar: cara a ~1.5 al frente, centro de la cabeza ~2.5 arriba.
    for(const side of [-1,1]) {
      part(shared.eye,[side*0.5,2.35,1.3],[0.48,0.56,0.34]);
      part(shared.pupil,[side*0.45,2.3,1.62],[0.22,0.26,0.08]);
      part(skin,[side*1.45,2.0,0.2],[0.32,0.65,0.42]);
    }
    part(skin,[0,1.75,1.75],[0.5,0.52,0.72]);
  }
  function createBackend(THREE,clone,asset,clips,config=CONFIG,rendererFactory) {
    const actors=new Map(),scene=new THREE.Scene();
    const columns=6,rows=4,tileW=72,tileH=64,resolution=3;
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
      Object.assign(shared,{sphere:new THREE.SphereGeometry(1,14,10),ink:inkMaterial(THREE,0,false),
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
    let seen=new Set(),lastTime=null,renderCount=0,lastDt=0;
    function create(key,info) {
      if(!available.length) throw new Error('El atlas admite hasta 24 modelos (22 jugadores y vista previa)');
      const object=clone(asset),pivot=new THREE.Group(),slot=new THREE.Group();
      object.scale.setScalar(scale);object.position.set(-center.x*scale,-box.min.y*scale,-center.z*scale);
      pivot.rotation.x=0.48; // La misma vista elevada de la cancha; no se modifica su cámara.
      pivot.add(object);slot.add(pivot);scene.add(slot);
      const index=available.shift();slot.position.set((index%columns)*tileW+tileW/2,(rows-1-Math.floor(index/columns))*tileH+12,0);
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
      const actor={key,index,object,pivot,slot,mixer,actions,materials,referenceSpeed:speed,info,current:null,action:null,lastSeen:0,signature:'',bones:[]};
      if(toon) stylize(THREE,shared,actor);
      actors.set(key,actor);return actor;
    }
    function tint(actor,kit,info) {
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
      const delta=lastTime===null?0:Math.max(0,(time-lastTime)/1000);lastTime=time;lastDt=delta;
      for(const actor of actors.values()) {
        if(time-actor.lastSeen>10000){remove(actor);continue;}
        if(!actor.state) continue;
        const {p,anim,options}=actor.state;
        updateAction(actor,p,anim,options,delta);
        for(const [bone,s] of actor.bones) bone.scale.setScalar(s); // Después del mixer, por si un clip anima escala.
        const face=anim.moveFace===undefined||anim.speed<0.12?p.face:anim.moveFace;
        actor.object.rotation.y=Math.PI/2-face;
      }
      renderer.render(scene,camera);renderCount++;
    }
    function draw(g,p,info,kit,anim={},options={}) {
      const key=p.id===undefined?'preview':p.id;
      const time=options.time===undefined?performance.now():options.time;
      // Primer ID repetido = siguiente cuadro: draw() no necesita un frameId nuevo en game.js.
      const fresh=seen.has(key)||lastTime===null;
      if(fresh) seen=new Set();
      // Liberar instancias de una partida anterior antes de ocupar una nueva casilla.
      for(const a of actors.values()) if(time-a.lastSeen>10000) remove(a);
      const actor=actors.get(key)||create(key,info);
      actor.lastSeen=time;actor.state={p:{...p},anim:{...anim},options:{...options}};tint(actor,kit,info);
      seen.add(key);
      if(fresh) render(time);
      // Las casillas nuevas aparecen al siguiente cuadro; la animación del resto se renderiza una sola vez.
      const x=(actor.index%columns)*tileW*resolution,y=Math.floor(actor.index/columns)*tileH*resolution;
      g.imageSmoothingEnabled=true;g.drawImage(renderer.domElement,x,y,tileW*resolution,tileH*resolution,-tileW/2,12-tileH,tileW,tileH);
    }
    function dispose(){for(const actor of Array.from(actors.values()))remove(actor);renderer.dispose();}
    function stats(){return {players:actors.size,mixers:actors.size,renderers:1,renders:renderCount,lastFrameSeconds:lastDt,warnings:[...warnings]};}
    return {draw,dispose,stats,actors,renderer};
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
  if(typeof module!=='undefined') module.exports={FootballPlayer3D:api,selectClip,materialRole,palette,updateAction,createBackend,inPlace,validate,CROSSFADE,CLIPS,CONFIG};
})(typeof module!=='undefined'?module.exports:window);
