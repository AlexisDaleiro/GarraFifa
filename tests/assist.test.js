'use strict';
const assert=require('node:assert/strict'),{FootballAssist:A}=require('../public/assist');
const p={id:1,team:0,kind:'field',x:300,y:200},b={x:311,y:200},mate={id:2,team:0,kind:'field',x:500,y:260,vx:0,vy:0,st:'run'};
const angle=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
const pass=(players,aim=0)=>A.pass(players,p,b,aim,4.752,.98704,640,400,true);
const original=JSON.stringify([p,b,mate]),target=pass([p,mate]);
assert.equal(target.to,2);assert(target.aim>0,'corrige hacia el compañero');
assert(Math.abs(target.aim-Math.atan2(60,189))<1e-9);assert.equal(JSON.stringify([p,b,mate]),original,'no mueve jugadores ni balón');
assert.deepEqual(pass([p,mate]),target,'sin dispersión aleatoria');
for(const m of [{...mate,x:100},{...mate,team:1},{...mate,x:630,y:200},{...mate,x:320,y:205},{...mate,st:'down'},{...mate,y:390}])assert.equal(pass([p,m]).to,0);
const defender={id:3,team:1,x:410,y:230};assert.equal(pass([p,mate,defender]).to,0,'no elige una línea completamente tapada');
const moving=pass([p,{...mate,vy:.8}]);assert(moving.y>mate.y,'anticipa desplazamiento');assert(Math.abs(moving.aim)<=A.RULES.passTurn);
const wall=A.pass([p,{...mate,x:400,y:20}],p,{x:311,y:40},-Math.PI/4,4.752,.98704,640,400,true);
assert.equal(wall.to,0);assert.equal(wall.aim,-Math.PI/4,'apuntar a la pared conserva el rebote');
for(let i=0;i<100;i++){
  const aim=i/16-3,r=pass([p,mate],aim);assert(Math.abs(angle(aim,r.aim))<=A.RULES.passTurn+1e-9);
}
const shot=A.shot(p,{x:450,y:80},0,640,150,250);
assert(shot.aim>0&&shot.y>=162&&shot.y<=238,'corrige hacia el arco dentro de los postes');
assert.equal(A.shot(p,b,Math.PI,640,150,250).aim,Math.PI,'no gira un remate hacia atrás');
assert.equal(A.shot(p,{x:20,y:80},0,640,150,250).aim,0,'fuera de alcance conserva dirección');
assert.equal(A.shot(p,b,Math.PI/2,640,150,250).aim,Math.PI/2,'no corrige fuera del cono');
const mirrored=A.shot({...p,team:1},{x:190,y:80},Math.PI,640,150,250);
assert(Math.abs(angle(Math.PI-shot.aim,mirrored.aim))<1e-9,'mismas reglas en ambos arcos');
console.log('asistencia OK: cono, límites, anticipación, líneas tapadas, paredes y simetría de tiro');
