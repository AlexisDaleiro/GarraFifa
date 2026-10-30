/* Caricatura: reloj de simulación, poses y efectos compartidos; nunca mueve la física. */
(function(root){
  'use strict';
  const TAU=Math.PI*2,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const ease=t=>1-Math.pow(1-clamp(t),3);
  function hash(n){n=(Number(n)||0)>>>0;n=Math.imul(n^(n>>>16),0x45d9f3b);return (n^(n>>>16))>>>0;}
  const BODIES=[
    {name:'petiso',height:.60,width:1.15,spine:[1.12,.9,1.1],leg:[1.15,.76,1.15],arm:[1.1,.8,1.1]},
    {name:'panzon',height:.88,width:1.12,belly:true,spine:[1.13,1,1.15],leg:[1.25,.8,1.25],arm:[1.18,.9,1.18]},
    {name:'muletas',height:.94,width:1,crutches:true,spine:[.94,1,.94],leg:[.9,.96,.9],arm:[1,1,1]},
    {name:'normal',height:1,width:1,spine:[1,1,1],leg:[1,.94,1],arm:[1,1,1]},
    {name:'flaco',height:1.08,width:.80,spine:[.86,1.06,.88],leg:[.85,1.04,.85],arm:[.85,1.08,.85]},
    {name:'grandote',height:1.05,width:1.13,spine:[1.10,1.02,1.08],leg:[1.2,.95,1.2],arm:[1.25,1,1.25]},
    {name:'zapatones',height:.82,width:1.06,feet:1.6,spine:[1.03,1,1],leg:[1,.88,1],arm:[1.15,.92,1.15]}
  ];
  // Un ciclo de siete garantiza variedad incluso en una sala de ocho jugadores.
  const identity=id=>({body:BODIES[((Math.max(1,Number(id)||1)-1)%BODIES.length)|0],hair:hash(id*17+9)%5});
  const FALLS=['piscinazo','voltereta','rodando','senton','trompo','drama'];
  function variant(seed,duration){return (duration<40?[0,2,3]:[0,1,2,3,4,5])[hash(seed)%(duration<40?3:6)];}
  function fallPose(f,tick){
    const t=clamp((tick-f.tick)/Math.max(1,f.duration)),v=variant(f.seed,f.duration),a=ease(t/.62),power=clamp(f.power||0,0,1);
    let rx=0,ry=0,rz=0,height=0,squash=1;
    if(v===0){rx=Math.PI/2*a;height=Math.sin(Math.PI*clamp(t/.65))*(5+power*8);}
    if(v===1){rx=-Math.PI*2.5*a;height=Math.sin(Math.PI*clamp(t/.72))*(8+power*6);}
    if(v===2){rx=Math.PI/2*ease(t/.2);rz=TAU*(3+(hash(f.seed)%2))*a;}
    if(v===3){rx=-.6*a;height=Math.abs(Math.sin(t*Math.PI*3))*7*Math.pow(1-t,2);squash=1-.3*Math.abs(Math.cos(t*Math.PI*3))*a;}
    if(v===4){ry=TAU*2*a;rz=1.5*ease((t-.45)/.3);height=Math.sin(Math.PI*clamp(t/.8))*3;}
    if(v===5){rx=Math.PI/2*a;rz=.12*Math.sin(t*40)*a;}
    const land=clamp((t-.45)/.2);squash*=1-.18*Math.sin(Math.PI*land);
    return {variant:v,t,rx,ry,rz,height,drop:(v===3?9:10)*a,squash,
      distance:(5+power*13)*ease(t/.6),flail:v===5?Math.sin(t*55)*.8:0,arms:v===0?1.4:v===1?.9:.4};
  }
  function create(){
    let events=[];
    function ingest(e,s){
      const tick=e.tick??s.t;
      if(events.some(o=>o.tick===tick&&o.type===e.type&&o.id===e.id&&o.victim===e.victim&&o.visualOnly===e.visualOnly))return;
      events.push({...e,tick});if(events.length>512)events.splice(0,events.length-512);
    }
    function options(p,info,tick,state){
      let fall=null,hit=null,goal=null,post=null,shot=null,daze=null;
      for(let i=events.length-1;i>=0;i--){const e=events[i],age=tick-e.tick;if(age<0)continue;
        if(!fall&&e.victim===p.id&&e.fall&&age<e.fall.duration+18)fall={...e.fall,tick:e.tick};
        if(!hit&&e.type==='shoulder'&&(e.id===p.id||e.victim===p.id)&&age<24)hit=e;
        if(!post&&e.type==='post'&&e.keeper===p.id&&age<42)post=e;
        if(!daze&&e.faceHit===p.id&&age<45)daze=e;
        if(!shot&&e.type==='shot'&&e.id===p.id&&age<25)shot=e;
        if(!goal&&e.type==='goal'&&age<420)goal=e;
      }
      // Entrada tardía: también se ve una caída, elegida únicamente por ID.
      if(!fall&&p.st==='down')fall={seed:p.id,duration:30,tick:Math.floor(tick/30)*30,dx:Math.cos(p.face),dy:Math.sin(p.face),power:.3};
      return {tick,fall,hit,post,shot,daze,goal:state==='goal'?goal:null,team:info.team};
    }
    function reset(){events=[];}
    function draw(g,p,a,fx){
      const tick=fx.tick,f=fx.fall,pose=f&&fallPose(f,tick),active=pose&&tick-f.tick<f.duration;
      g.save();
      if((p.flags&2)&&p.st==='run'){
        const angle=a?.moveFace??p.face,dx=Math.cos(angle),dy=Math.sin(angle);
        g.strokeStyle='#fff6';g.lineWidth=1.2;
        for(let i=0;i<3;i++){const y=-8-i*5,len=8+(hash(p.id+i)%9);g.beginPath();g.moveTo(p.x-dx*12,p.y+y);g.lineTo(p.x-dx*(12+len),p.y+y-dy*len);g.stroke();}
      }
      if(active&&pose.t>.32){
        g.font='bold 9px sans-serif';g.textAlign='center';g.fillStyle='#ffe376';g.strokeStyle='#37241c';g.lineWidth=2;
        for(let i=0;i<3;i++){const angle=tick*.2+i*TAU/3,x=p.x+(f.dx||0)*pose.distance+Math.cos(angle)*11,y=p.y+(f.dy||0)*pose.distance-17+Math.sin(angle)*3;g.strokeText('★',x,y);g.fillText('★',x,y);}
      }
      // Seis motas por nube: coste acotado, sin objetos ni materiales por cuadro.
      const stop=a?.stopTick,age=active?(pose.t-.48)*f.duration:stop===undefined?99:tick-stop;
      if(age>=0&&age<18){g.fillStyle='#eadbb5';g.globalAlpha=(1-age/18)*.55;
        for(let i=0;i<6;i++){const angle=hash(p.id*7+i)%628/100,r=4+age*.7;g.beginPath();g.ellipse(p.x+Math.cos(angle)*r,p.y+Math.sin(angle)*r*.35,3+age*.15,2,0,0,TAU);g.fill();}}
      g.restore();
    }
    function drawComics(g,tick){
      for(const e of events){const age=tick-e.tick;if(age<0||age>42)continue;
        const text=e.type==='foul'?['¡ZAS!','¡AUCH!','¡PAF!'][hash(e.fall?.seed)%3]:e.type==='shot'?'¡PUM!':e.type==='slide'||e.type==='tackle'?'¡ZAS!':e.type==='post'?'¡BOING!':e.type==='shoulder'?'¡POC!':null;
        if(!text||!Number.isFinite(e.x)||!Number.isFinite(e.y))continue;
        g.save();g.translate(e.x,e.y-32-age*.35);g.scale(1,1/.78);g.rotate((hash(e.tick+(e.id||0))%21-10)/100);
        const size=(.55+.65*Math.sin(Math.PI*clamp(age/12)/2));g.scale(size,size);g.globalAlpha=clamp((42-age)/14);
        g.font='900 italic 13px sans-serif';g.textAlign='center';g.lineWidth=3;g.strokeStyle='#342019';g.fillStyle=e.type==='post'?'#9ff8ff':'#ffe46b';g.strokeText(text,0,0);g.fillText(text,0,0);g.restore();
      }
    }
    return {ingest,options,draw,drawComics,reset};
  }
  const api={hash,variant,fallPose,FALLS,identity,create};root.ToonFX=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
