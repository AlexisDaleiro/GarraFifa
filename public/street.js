/* Decoración estática Three.js: se hornea una vez en el fondo de la cancha. */
(function(root){
  'use strict';
  let module;
  async function render(p,margin,k){
    const THREE=await (module||(module=import('three'))),w=p.w,h=p.h;
    const scene=new THREE.Scene(),renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});
    renderer.setPixelRatio(1);renderer.setSize((w+margin*2)*2,(h+margin*2)*2);renderer.setClearColor(0,0);
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    const c=1/Math.sqrt(1+k*k),camera=new THREE.OrthographicCamera(-(w+margin*2)/2,(w+margin*2)/2,(h+margin*2)*c/2,-(h+margin*2)*c/2,1,4000);
    camera.position.set(w/2,1000,h/2+1000*k);camera.lookAt(w/2,0,h/2);
    scene.add(new THREE.HemisphereLight(p.look==='azotea'?0xffbc8c:0xfff3db,0x554a42,2));
    const sun=new THREE.DirectionalLight(p.look==='azotea'?0xffa166:0xffffff,2.2);sun.position.set(-200,400,-100);scene.add(sun);
    const box=new THREE.BoxGeometry(1,1,1),rock=new THREE.DodecahedronGeometry(1),materials=new Map();
    const mat=color=>{if(!materials.has(color))materials.set(color,new THREE.MeshToonMaterial({color}));return materials.get(color);};
    const mesh=(x,y,z,sx,sy,sz,color,geo=box)=>{const m=new THREE.Mesh(geo,mat(color));m.position.set(x,z,y);m.scale.set(sx,sz,sy);scene.add(m);return m;};
    const wires=[],line=(x,y,z,a,b,c)=>wires.push(x,z,y,a,c,b);
    const wall=(x,y,dx,dy,length)=>{
      if(p.look==='potrero'){
        mesh(x+dx*length/2,y+dy*length/2,15,dx?length:5,dy?length:5,30,'#a85c42');
        for(let row=0;row<4;row++)for(let t=(row%2)*12;t<length;t+=24){
          const end=Math.min(t+22,length);mesh(x+dx*(t+end)/2,y+dy*(t+end)/2,4+row*7,dx?end-t:5.6,dy?end-t:5.6,5.5,row%2?'#b66e51':'#c47b56');
        }
      }else{
        const height=34,color=p.look==='azotea'?'#e6c7a4':'#45656a';
        mesh(x+dx*length/2,y+dy*length/2,2,dx?length:4,dy?length:4,4,'#4d5657');
        for(let t=0;t<=length;t+=28)mesh(x+dx*t,y+dy*t,height/2,2,2,height,color);
        mesh(x+dx*length/2,y+dy*length/2,height,dx?length:2,dy?length:2,2,color);
        for(let z=8;z<height;z+=8)line(x,y,z,x+dx*length,y+dy*length,z);
        if(p.look==='jaula')for(let t=0;t<length;t+=10)line(x+dx*t,y+dy*t,4,x+dx*Math.min(length,t+28),y+dy*Math.min(length,t+28),height);
      }
    };
    if(p.wall){
      wall(0,0,1,0,w);wall(0,h,1,0,w);
      for(const x of [0,w]){wall(x,0,0,1,(h-p.goal)/2);wall(x,(h+p.goal)/2,0,1,(h-p.goal)/2);}
    }
    if(p.look==='jaula'){
      for(const x of [-30,w+30]){mesh(x,h*.25,30,4,4,60,'#4d5657');mesh(x,h*.25,60,17,9,5,'#ffdfa4');}
      mesh(w*.28,-20,5,65,12,10,'#b5ac91');mesh(w*.28,-20,16,65,4,13,'#647b7a');
    }
    if(p.look==='potrero')for(const x of [-5,w+5])for(const y of [(h-p.goal)/2,(h+p.goal)/2]){
      mesh(x,y,4,7,6,5,'#e8d8b6',rock);mesh(x+(x?8:-8),y+5,4,5,7,5,'#537489',rock);
    }
    if(p.look==='azotea'){
      for(let i=0;i<14;i++){
        const x=-35+i*(w+70)/14,height=18+(i*17%35),y=-24-(i%2)*8;
        mesh(x,y,height/2,26,22,height,i%2?'#594e68':'#77657a');
        for(let z=12;z<height-5;z+=13)for(const dx of [-7,5])mesh(x+dx,y+11.3,z,5,.7,5,'#f8cd88');
      }
      mesh(w-34,-22,12,26,26,24,'#d0c0a4');mesh(w-34,-22,25,28,28,3,'#556f75');
    }
    if(wires.length){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(wires,3));scene.add(new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:'#26393e',transparent:true,opacity:.65})));}
    const canvas=document.createElement('canvas');canvas.width=renderer.domElement.width;canvas.height=renderer.domElement.height;
    try{renderer.render(scene,camera);canvas.getContext('2d').drawImage(renderer.domElement,0,0);return canvas;}
    finally{
      const geometries=new Set([box,rock]),mats=new Set(materials.values());
      scene.traverse(n=>{if(n.geometry)geometries.add(n.geometry);if(n.material)mats.add(n.material);});
      for(const g of geometries)g.dispose();for(const m of mats)m.dispose();renderer.dispose();renderer.forceContextLoss();
    }
  }
  root.StreetField={render};
})(window);
