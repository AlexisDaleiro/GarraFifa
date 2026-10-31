// Asistencia de salida: nunca corrige la pelota durante el vuelo ni mueve al receptor.
(function(root){
  'use strict';
  const RULES={passCone:.61,passTurn:.52,passRange:300,passMin:32,leadMax:36,shotCone:.75,shotTurn:.65,shotRange:420,postMargin:12,lane:22};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),angle=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
  function blocked(players,p,x,y){
    const dx=x-p.x,dy=y-p.y,d=Math.hypot(dx,dy)||1;let cost=0;
    for(const q of players){if(q.team===p.team)continue;
      const t=((q.x-p.x)*dx+(q.y-p.y)*dy)/(d*d);if(t<=.05||t>=.95)continue;
      const off=Math.abs((q.x-p.x)*dy-(q.y-p.y)*dx)/d;if(off<RULES.lane)cost+=1-off/RULES.lane;
    }return cost;
  }
  function pass(players,p,b,aim,speed,roll,w,h,wall){
    const fx=Math.cos(aim),fy=Math.sin(aim);
    const wallD=wall?Math.min(fx?((fx>0?w-4:4)-b.x)/fx:Infinity,fy?((fy>0?h-4:4)-b.y)/fy:Infinity):Infinity;
    let best=null,score=Infinity;
    for(const q of players){
      if(q===p||q.team!==p.team||q.kind!=='field'||['slide','down','recover'].includes(q.st))continue;
      const d=Math.hypot(q.x-b.x,q.y-b.y),a=Math.atan2(q.y-b.y,q.x-b.x),delta=angle(aim,a);
      if(d<RULES.passMin||d>Math.min(RULES.passRange,speed/(1-roll)*.9)||d>wallD||Math.abs(delta)>RULES.passCone)continue;
      const t=clamp(Math.log(Math.max(.05,1-d*(1-roll)/speed))/Math.log(roll),0,RULES.leadMax);
      const x=clamp(q.x+(q.vx||0)*t,9,w-9),y=clamp(q.y+(q.vy||0)*t,9,h-9),target=Math.atan2(y-b.y,x-b.x);
      if(Math.abs(angle(aim,target))>RULES.passCone)continue;
      const lane=blocked(players,p,x,y);if(lane>.8)continue;
      const cost=Math.abs(delta)*3+d/600+lane*.8-(q.callT>0?.15:0);
      if(cost<score){score=cost;best={to:q.id,x,y,aim:aim+clamp(angle(aim,target),-RULES.passTurn,RULES.passTurn)};}
    }
    return best||{aim,to:0};
  }
  function shot(p,b,aim,w,top,bot){
    const gx=p.team===0?w:0,dx=gx-b.x,side=p.team===0?1:-1,c=Math.cos(aim);
    if(c*side<=0||Math.abs(dx)>RULES.shotRange)return {aim};
    const y=clamp(b.y+Math.sin(aim)*dx/c,top+RULES.postMargin,bot-RULES.postMargin),target=Math.atan2(y-b.y,dx),delta=angle(aim,target);
    if(Math.abs(delta)>RULES.shotCone)return {aim};
    return {aim:aim+clamp(delta,-RULES.shotTurn,RULES.shotTurn),x:gx,y};
  }
  root.FootballAssist={RULES,pass,shot};
})(typeof module!=='undefined'?module.exports:window);
