/* Modelos articulados de geometría 3D. Sin recursos ni dependencias remotas. */
(function (root) {
  'use strict';
  const Motion = typeof module !== 'undefined' ? require('./locomotion').FootballMotion : root.FootballMotion;
  const TAU = Math.PI * 2;
  const skinColors = ['#edbd96','#d6a078','#b77b54','#754a35','#f4cfaa'];
  const hairColors = ['#201b19','#38251e','#71492d','#ba965a','#141518'];
  const rgb = hex => { const n = parseInt(hex.slice(1),16); return [(n>>16)/255,((n>>8)&255)/255,(n&255)/255]; };
  const sub = (a,b) => a.map((v,i)=>v-b[i]);
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const unit = a => { const l = Math.hypot(...a)||1; return a.map(v=>v/l); };
  const mix = (a,b,t) => a.map((v,i)=>v+(b[i]-v)*t);
  const SPHERE = [];
  for(let j=0;j<6;j++) for(let i=0;i<10;i++) {
    const point = (u,v) => [Math.sin(v)*Math.cos(u),Math.sin(v)*Math.sin(u),Math.cos(v)];
    const a=point(i*TAU/10,j*Math.PI/6), b=point((i+1)*TAU/10,j*Math.PI/6);
    const c=point((i+1)*TAU/10,(j+1)*Math.PI/6), d=point(i*TAU/10,(j+1)*Math.PI/6);
    SPHERE.push([a,b,c],[a,c,d]);
  }
  function build(p, info, kit, anim, options = {}) {
    const data = new Float32Array(131072), a = anim || {phase:0,speed:0}, phase=a.phase||0;
    const moving = Math.min(1,(a.speed||0)/2.2), jog=a.run||0, sprint=a.sprint||0;
    const motion=Motion.body(phase,moving,jog,sprint), hip=motion.height;
    const skin=rgb(skinColors[info.id%skinColors.length]), hair=rgb(hairColors[(info.id*7)%hairColors.length]);
    const shirt=rgb(kit.c1), detail=rgb(kit.c2), shorts=rgb(kit.sh), socks=rgb(kit.so);
    const black=rgb('#151923'), white=rgb('#f4f1e8');
    const t=options.time||0, celebrate=!!options.celebrate;
    const prone=['slide','down','dive'].includes(p.st);
    let torso=false, cursor=0;
    const lean = motion.lean + (a.accel||0)*0.035;
    const lc=Math.cos(lean),ls=Math.sin(lean);
    const jump=celebrate?Math.abs(Math.sin(t/160+info.id))*2:0;
    const proneHeight=p.st==='dive'?5+Math.sin(t*0.01)*0.3:2.5;
    const vertex=(pos,n,col)=>{
      let x=pos[0],y=pos[1],z=pos[2],nx=n[0],ny=n[1],nz=n[2];
      if(torso) {
        const h=z-hip, yy=y;
        y=yy*lc+h*ls; z=h*lc-yy*ls+hip;
        const nn=ny; ny=nn*lc+nz*ls; nz=nz*lc-nn*ls;
      }
      if(prone) {
        const yy=y; y=z-13; z=-yy+proneHeight;
        const nn=ny;ny=nz;nz=-nn;
      } else z+=jump;
      data[cursor++]=x;data[cursor++]=y;data[cursor++]=z;
      data[cursor++]=nx;data[cursor++]=ny;data[cursor++]=nz;
      data[cursor++]=col[0];data[cursor++]=col[1];data[cursor++]=col[2];
    };
    const sphere=(center,scale,color)=> {
      for(const tri of SPHERE) for(const n of tri) {
        const pos=[center[0]+n[0]*scale[0],center[1]+n[1]*scale[1],center[2]+n[2]*scale[2]];
        vertex(pos,[n[0]/scale[0],n[1]/scale[1],n[2]/scale[2]],typeof color==='function'?color(n):color);
      }
    };
    const bone=(start,end,r0,r1,color)=> {
      const axis=unit(sub(end,start)), u=unit(cross(axis,Math.abs(axis[2])<0.9?[0,0,1]:[0,1,0])), v=cross(axis,u);
      const ring=(j,r,c)=>{const ang=j*TAU/10,n=u.map((x,i)=>x*Math.cos(ang)+v[i]*Math.sin(ang));return {p:c.map((x,i)=>x+n[i]*r),n};};
      for(let j=0;j<10;j++) {
        const a=ring(j,r0,start),b=ring(j+1,r0,start),c=ring(j+1,r1,end),d=ring(j,r1,end);
        for(const q of [a,b,c,a,c,d]) vertex(q.p,q.n,color);
      }
      for(let j=0;j<10;j++) {
        for(const [center,r,sign] of [[start,r0,-1],[end,r1,1]]) {
          const a=ring(j,r,center),b=ring(j+1,r,center),n=axis.map(x=>x*sign);
          vertex(center,n,color);vertex(a.p,n,color);vertex(b.p,n,color);
        }
      }
    };
    // Piernas: volumen del muslo, rodilla, gemelo, media y botín independientes.
    for(const side of [-1,1]) {
      const pose=Motion.leg(phase+(side===1?Math.PI:0),moving,jog,sprint,hip);
      if(side===1&&(p.flags&4)) Object.assign(pose,{footF:7.5,footH:3.8,kneeF:4,kneeH:7});
      const x=side*1.85, h=[x,0,hip], knee=[x,pose.kneeF,pose.kneeH], ankle=[x,pose.footF,pose.footH+0.7];
      bone(h,mix(h,knee,0.43),1.65,1.52,shorts);
      bone(mix(h,knee,0.43),knee,1.38,1.05,skin);
      sphere(knee,[1.06,1.06,1.06],skin);
      bone(knee,mix(knee,ankle,0.35),1.05,1.2,skin);
      bone(mix(knee,ankle,0.35),ankle,1.17,0.7,socks);
      bone(mix(knee,ankle,0.35),mix(knee,ankle,0.42),1.21,1.21,detail);
      const boot=rgb(['#20242b','#e9e5d7','#e65d32','#a2cf3b'][info.id%4]);
      sphere([x,pose.footF+0.75,pose.footH+0.55],[0.9,1.8,0.65],boot);
      sphere([x,pose.footF+0.75,pose.footH+0.15],[0.92,1.85,0.18],black);
    }
    torso=true;
    sphere([0,0,hip+0.9],[2.95,1.75,2],shorts);
    // Camiseta con cintura, pecho y hombros; sus bandas se aplican a la superficie 3D.
    const rings=[[hip+2,2.65,1.6],[hip+4,2.55,1.55],[hip+7.7,3.5,1.95],[hip+9.4,3.85,1.65],[hip+10,2,1.25]];
    const jersey=(x,y,z)=> {
      if(kit.pat==='rayas' && Math.floor((x+8)/1.5)%2===0) return detail;
      if(kit.pat==='mitad'&&x>0) return detail;
      if(kit.pat==='franja'&&Math.abs(x+(z-hip-6)*0.55)<0.75) return detail;
      if(kit.pat==='cuadros'&&(Math.floor((x+8)/1.5)+Math.floor((z-hip)/1.5))%2===0) return detail;
      return shirt;
    };
    for(let j=0;j<rings.length-1;j++) for(let i=0;i<24;i++) {
      const point=(ring,index)=>{const angle=index*TAU/24,[z,rx,ry]=ring;return {p:[Math.cos(angle)*rx,Math.sin(angle)*ry,z],n:unit([Math.cos(angle)/rx,Math.sin(angle)/ry,0.06])};};
      const a=point(rings[j],i),b=point(rings[j],i+1),c=point(rings[j+1],i+1),d=point(rings[j+1],i);
      const col=jersey((a.p[0]+c.p[0])/2,(a.p[1]+c.p[1])/2,(a.p[2]+c.p[2])/2);
      for(const q of [a,b,c,a,c,d]) vertex(q.p,q.n,col);
    }
    bone([0,0,hip+9.4],[0,0,hip+11.2],1.15,1,skin);
    // Brazos articulados con codos flexionados y manos, guantes para el arquero.
    for(const side of [-1,1]) {
      const shoulder=[side*3.75,0,hip+8.8];
      const swing=-side*Math.cos(phase-0.45)*moving;
      const angle=swing*motion.armSwing-jog*0.15;
      let elbow=[side*4.1,Math.sin(angle)*4.5,shoulder[2]-Math.cos(angle)*4.5];
      let hand=[side*4,elbow[1]+Math.sin(angle+motion.elbow)*4,elbow[2]-Math.cos(angle+motion.elbow)*4];
      if(p.st==='hold') {elbow=[side*4,2,hip+5];hand=[side*1.8,4,hip+5.5];}
      if(celebrate || ((p.flags&16)&&side===-1)) {
        elbow=[side*5,0,hip+12];hand=[side*(5+Math.sin(t/105)*0.7),1,hip+16];
      }
      if(p.st==='dive') {elbow=[side*3,0,hip+14];hand=[side*2,0,hip+18];}
      const cuff=mix(shoulder,elbow,0.45);
      bone(shoulder,cuff,1.35,1.2,shirt);
      bone(cuff,elbow,1.1,0.85,skin);
      sphere(elbow,[0.9,0.9,0.9],skin);
      bone(elbow,hand,0.92,0.6,kit.gk?shirt:skin);
      sphere(hand,[0.7,0.9,1],kit.gk?white:skin);
    }
    // Cabeza: cráneo, mandíbula, orejas, nariz, ojos y cortes de pelo con volumen.
    const headZ=hip+13.2;
    sphere([0,0,headZ],[1.9,1.7,2.5],skin);
    sphere([0,0.55,headZ-1],[1.45,1.3,1.25],skin);
    for(const side of [-1,1]) {
      sphere([side*1.85,0,headZ-0.15],[0.35,0.4,0.65],skin);
      sphere([side*0.7,1.5,headZ+0.1],[0.32,0.17,0.18],white);
      sphere([side*0.7,1.65,headZ+0.1],[0.14,0.1,0.15],black);
    }
    sphere([0,1.7,headZ-0.3],[0.36,0.55,0.6],skin);
    sphere([0,1.25,headZ-1.65],[0.7,0.2,0.16],rgb('#8d5141'));
    sphere([0,-0.18,headZ+0.6],[1.96,1.75,2.12],n=>n[2]>0.1||n[1]<-0.25?hair:skin);
    if(info.id%3===1) sphere([0,1,headZ-1.25],[1.4,0.55,0.85],hair);
    // Dorsal sobre un plano 3D, ocluido e iluminado junto con el resto del modelo.
    const digits={0:['111','101','101','101','111'],1:['010','110','010','010','111'],2:['111','001','111','100','111'],3:['111','001','111','001','111'],4:['101','101','111','001','001'],5:['111','100','111','001','111'],6:['111','100','111','101','111'],7:['111','001','010','010','010'],8:['111','101','111','101','111'],9:['111','101','111','001','111']};
    const num=String(info.num||10), size=0.45;
    for(let di=0;di<num.length;di++) for(let row=0;row<5;row++) for(let col=0;col<3;col++) if(digits[num[di]][row][col]==='1') {
      const x=(di*4+col-num.length*2+0.5)*size,z=hip+7.7-row*size,y=-1.99;
      for(const q of [[x,y,z],[x+size,y,z],[x+size,y,z-size],[x,y,z],[x+size,y,z-size],[x,y,z-size]]) vertex(q,[0,-1,0],white);
    }
    if(cursor>data.length) throw new Error('La malla excede el búfer de vértices');
    return data.subarray(0,cursor);
  }
  let renderer;
  function init() {
    const canvas=document.createElement('canvas'); canvas.width=192;canvas.height=224;
    const gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false,preserveDrawingBuffer:true});
    if(!gl) return {canvas,gl:null};
    const shader=(type,source)=> {const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));return s;};
    const program=gl.createProgram();
    gl.attachShader(program,shader(gl.VERTEX_SHADER,`
      attribute vec3 position; attribute vec3 normal; attribute vec3 color;
      uniform float yaw; varying vec3 vColor; varying vec3 vNormal;
      void main(){
        float c=cos(yaw),s=sin(yaw);
        vec3 p=vec3(-s*position.x+c*position.y,c*position.x+s*position.y,position.z);
        vNormal=vec3(-s*normal.x+c*normal.y,c*normal.x+s*normal.y,normal.z);
        vColor=color;
        gl_Position=vec4(p.x/24.,(p.z*.95-p.y*.5-16.)/28.,-(p.y*.85+p.z*.5)/80.,1.);
      }`));
    gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`
      precision mediump float; varying vec3 vColor; varying vec3 vNormal;
      void main(){
        vec3 n=normalize(vNormal),light=normalize(vec3(-.45,-.55,.85));
        float diffuse=max(0.,dot(n,light));
        float rim=pow(1.-abs(dot(n,normalize(vec3(0.,-0.85,.5)))),3.)*.12;
        vec3 col=vColor*(.48+diffuse*.65)+vec3(rim);
        gl_FragColor=vec4(col,1.);
      }`));
    gl.linkProgram(program); if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program); const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    for(const [name,offset] of [['position',0],['normal',12],['color',24]]) {
      const location=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,3,gl.FLOAT,false,36,offset);
    }
    gl.enable(gl.DEPTH_TEST); gl.clearColor(0,0,0,0);
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();renderer=null;});
    return {canvas,gl,program,buffer,yaw:gl.getUniformLocation(program,'yaw')};
  }
  // Si WebGL no está disponible, proyectar las mismas mallas con orden de profundidad.
  function software(g,data,yaw) {
    const c=Math.cos(yaw),s=Math.sin(yaw),tris=[];
    for(let i=0;i<data.length;i+=27) {
      const points=[];let depth=0,light=0;
      for(let j=0;j<3;j++) {
        const k=i+j*9,x=-s*data[k]+c*data[k+1],y=c*data[k]+s*data[k+1],z=data[k+2];
        points.push([x,y*.5-z*.95]);depth+=y*.85+z*.5;
        const nx=-s*data[k+3]+c*data[k+4],ny=c*data[k+3]+s*data[k+4];
        const nl=Math.hypot(nx,ny,data[k+5])||1;
        light+=Math.max(0,(-nx*.4-ny*.5+data[k+5]*.75)/nl);
      }
      const shade=.48+light/3*.65;
      tris.push({points,depth,color:`rgb(${[data[i+6],data[i+7],data[i+8]].map(v=>Math.min(255,Math.round(v*shade*255))).join(',')})`});
    }
    tris.sort((a,b)=>a.depth-b.depth);
    for(const t of tris){g.fillStyle=t.color;g.beginPath();g.moveTo(...t.points[0]);g.lineTo(...t.points[1]);g.lineTo(...t.points[2]);g.closePath();g.fill();}
  }
  function draw(g,p,info,kit,anim,options) {
    if(!renderer) renderer=init();
    const data=build(p,info,kit,anim,options), a=anim||{}, moving=Math.min(1,(a.speed||0)/1.2);
    const target=a.moveFace===undefined?p.face:a.moveFace;
    const yaw=p.face+Math.atan2(Math.sin(target-p.face),Math.cos(target-p.face))*moving;
    const {gl,canvas}=renderer;
    if(!gl) return software(g,data,yaw);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.uniform1f(renderer.yaw,yaw);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES,0,data.length/9);
    g.imageSmoothingEnabled=true;g.drawImage(canvas,-24,-44,48,56);
  }
  root.FootballPlayer3D={build,draw};
})(typeof module !== 'undefined' ? module.exports : window);
