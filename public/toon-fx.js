/* Caricatura: reloj de simulación, poses y efectos compartidos; nunca mueve la física. */
(function(root){
  'use strict';
  const C=typeof module!=='undefined'?require('./continuity'):root.FootballContinuity;
  const SHORT=[0,2,3],LONG=[0,1,2,3,4,5],WORDS=['¡ZAS!','¡AUCH!','¡PAF!'];
  const TAU=Math.PI*2,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const ease=t=>1-Math.pow(1-clamp(t),3);
  function hash(n){n=(Number(n)||0)>>>0;n=Math.imul(n^(n>>>16),0x45d9f3b);return (n^(n>>>16))>>>0;}
  const BODIES=[
    {name:'flaco',height:.94,width:.9,spine:[.9,1,.92],leg:[.94,1,.94],arm:[.94,1,.94]},
    {name:'normal',height:1,width:1,spine:[1,1,1],leg:[1,1,1],arm:[1,1,1]},
    {name:'robusto',height:1.06,width:1.08,spine:[1.08,1,1.08],leg:[1.04,1,1.04],arm:[1.05,1,1.05]},
  ];
  const BOOTS=['#f5e458','#ef6d45','#67ccdc','#f4f0e5','#202129','#af80de'];
  function identity(id){
    id=Math.max(1,Number(id)||1);const n=hash(id*17+9),body=BODIES[(id-1)%BODIES.length|0];
    return {body:{...body,height:.92+(hash(id*23)%161)/1000},hair:(id-1)%7,boots:BOOTS[n%BOOTS.length],
      wrist:!!(n&1),band:!!(n&2),socks:n%2?'altas':'bajas',shirt:['seleccion','sinMangas','afuera'][n%3]};
  }
  const FALLS=['piscinazo','voltereta','rodando','senton','trompo','drama'];
  function variant(seed,duration){return (duration<40?SHORT:LONG)[hash(seed)%(duration<40?3:6)];}
  function fallPose(f,tick,out={}){
    const t=clamp((tick-f.tick)/Math.max(1,f.duration)),v=variant(f.seed,f.duration),a=ease(t/.62),power=clamp(f.power||0,0,1);
    let rx=0,ry=0,rz=0,height=0,squash=1;
    if(v===0){rx=Math.PI/2*a;height=Math.sin(Math.PI*clamp(t/.65))*(5+power*8);}
    if(v===1){rx=-Math.PI*2.5*a;height=Math.sin(Math.PI*clamp(t/.72))*(8+power*6);}
    if(v===2){rx=Math.PI/2*ease(t/.2);rz=TAU*(3+(hash(f.seed)%2))*a;}
    if(v===3){rx=-.6*a;height=Math.abs(Math.sin(t*Math.PI*3))*7*Math.pow(1-t,2);squash=1-.3*Math.abs(Math.cos(t*Math.PI*3))*a;}
    if(v===4){ry=TAU*2*a;rz=1.5*ease((t-.45)/.3);height=Math.sin(Math.PI*clamp(t/.8))*3;}
    if(v===5){rx=Math.PI/2*a;rz=.12*Math.sin(t*40)*a;}
    const land=clamp((t-.45)/.2);squash*=1-.18*Math.sin(Math.PI*land);
    out.variant=v;out.t=t;out.rx=rx;out.ry=ry;out.rz=rz;out.height=height;out.drop=(v===3?9:10)*a;out.squash=squash;
    out.distance=(5+power*13)*ease(t/.6);out.flail=v===5?Math.sin(t*55)*.8:0;out.arms=v===0?1.4:v===1?.9:.4;return out;
  }
  function create(){
    const events=[],outputs=new Map();
    function ingest(e,s){
      const tick=e.tick??s.t;
      if(events.some(o=>o.tick===tick&&o.type===e.type&&o.id===e.id&&o.victim===e.victim&&o.visualOnly===e.visualOnly))return;
      const stored={...e,tick,fall:e.fall?{...e.fall,tick}:null};
      stored.word=e.type==='foul'?WORDS[hash(e.fall?.seed)%3]:e.type==='shot'?'¡PUM!':e.type==='slide'||e.type==='tackle'?'¡ZAS!':e.type==='post'?'¡BOING!':e.type==='shoulder'?'¡POC!':null;
      stored.tilt=(hash(tick+(e.id||0))%21-10)/100;
      events.push(stored);if(events.length>512)events.splice(0,events.length-512);
    }
    function options(p,info,tick,state){
      const key=p.id??'preview';let out=outputs.get(key);
      if(!out){out={fallback:{seed:p.id,duration:30,tick:0,dx:1,dy:0,power:.3},pose:{},down:false};outputs.set(key,out);}
      let fall=null,hit=null,goal=null,post=null,shot=null,daze=null,kick=null,slide=null,recover=null,skill=null;
      for(let i=events.length-1;i>=0;i--){const e=events[i],age=tick-e.tick;if(age<0)continue;
        if(!fall&&e.victim===p.id&&e.fall&&age<e.fall.duration+18)fall=e.fall;
        if(!hit&&e.type==='shoulder'&&(e.id===p.id||e.victim===p.id)&&age<24)hit=e;
        if(!post&&e.type==='post'&&e.keeper===p.id&&age<42)post=e;
        if(!daze&&e.faceHit===p.id&&age<45)daze=e;
        if(!kick&&e.type==='kick'&&e.id===p.id&&age<(e.duration||20))kick=e;
        if(!slide&&e.type==='slide'&&e.id===p.id&&age<(e.duration||18))slide=e;
        if(!recover&&e.type==='recover'&&e.id===p.id&&age<e.duration)recover=e;
        if(!skill&&e.type==='skill'&&e.id===p.id&&age<(e.duration||30))skill=e;
        if(!shot&&e.type==='shot'&&e.id===p.id&&age<25)shot=e;
        if(!goal&&e.type==='goal'&&age<420)goal=e;
      }
      // Entrada tardía: también se ve una caída, elegida únicamente por ID.
      if(!fall&&p.st==='down'){
        if(!out.down||tick<out.fallback.tick){out.fallback.tick=tick;out.fallback.dx=Math.cos(p.face);out.fallback.dy=Math.sin(p.face);}
        fall=out.fallback;
      }
      out.down=p.st==='down';out.tick=tick;out.fall=fall;out.hit=hit;out.post=post;out.shot=shot;out.kick=kick;out.slide=slide;out.recover=recover;out.skill=skill;out.daze=daze;out.goal=state==='goal'?goal:null;out.team=info.team;return out;
    }
    function reset(){events.length=0;outputs.clear();}
    function draw(g,p,a,fx){
      const tick=fx.tick,f=fx.fall,pose=f&&fallPose(f,tick,fx.pose),active=pose&&tick-f.tick<f.duration;
      g.save();
      const base=g.globalAlpha;
      if((a?.sprint||0)>.005){
        g.globalAlpha=base*a.sprint;
        const angle=a?.moveFace??p.face,dx=Math.cos(angle),dy=Math.sin(angle);
        g.strokeStyle='#fff6';g.lineWidth=1.2;
        for(let i=0;i<3;i++){const y=-8-i*5,len=8+(hash(p.id+i)%9);g.beginPath();g.moveTo(p.x-dx*12,p.y+y);g.lineTo(p.x-dx*(12+len),p.y+y-dy*len);g.stroke();}
      }
      const stars=f?C.envelope(tick-f.tick-f.duration*.32,f.duration*.68+12,5,12):0;
      if(pose&&stars>.001){
        g.globalAlpha=base*stars;
        g.font='bold 9px sans-serif';g.textAlign='center';g.fillStyle='#ffe376';g.strokeStyle='#37241c';g.lineWidth=2;
        for(let i=0;i<3;i++){const angle=tick*.2+i*TAU/3,x=p.x+(f.dx||0)*pose.distance+Math.cos(angle)*11,y=p.y+(f.dy||0)*pose.distance-17+Math.sin(angle)*3;g.strokeText('★',x,y);g.fillText('★',x,y);}
      }
      // Seis motas por nube: coste acotado, sin objetos ni materiales por cuadro.
      const stop=a?.stopTick,age=active?(pose.t-.48)*f.duration:stop===undefined?99:tick-stop;
      if(age>=0&&age<18){g.fillStyle='#eadbb5';g.globalAlpha=base*C.envelope(age,18,2,8)*.55;
        for(let i=0;i<6;i++){const angle=hash(p.id*7+i)%628/100,r=4+age*.7;g.beginPath();g.ellipse(p.x+Math.cos(angle)*r,p.y+Math.sin(angle)*r*.35,3+age*.15,2,0,0,TAU);g.fill();}}
      g.restore();
    }
    function drawComics(g,tick){
      for(const e of events){const age=tick-e.tick;if(age<0||age>30)continue;
        const text=e.word;
        if(!text||!Number.isFinite(e.x)||!Number.isFinite(e.y))continue;
        g.save();g.translate(e.x,e.y-26-age*.25);g.scale(1,1/.78);g.rotate(e.tilt);
        const size=(.55+.5*Math.sin(Math.PI*clamp(age/12)/2));g.scale(size,size);g.globalAlpha=C.envelope(age,30,3,10);
        g.font='900 italic 8.5px sans-serif';g.textAlign='center';g.lineWidth=1.6;g.strokeStyle='#342019';g.fillStyle=e.type==='post'?'#9ff8ff':'#ffe46b';g.strokeText(text,0,0);g.fillText(text,0,0);g.restore();
      }
    }
    return {ingest,options,draw,drawComics,reset};
  }
  const api={hash,variant,fallPose,FALLS,identity,create};root.ToonFX=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
