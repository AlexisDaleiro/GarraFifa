'use strict';
const assert = require('node:assert/strict');
const { FootballMotion: motion } = require('../public/locomotion');
let count = 0;
for (const [jog, sprint] of [[0,0],[1,0],[1,1],[0.5,0.5]]) {
  let maxLift = 0, contacts = 0;
  for (let i = 0; i < 720; i++) {
    const phase = i * Math.PI / 360;
    const body = motion.body(phase,1,jog,sprint);
    const p = motion.leg(phase,1,jog,sprint,body.height);
    assert(Math.abs(Math.hypot(p.kneeF,p.kneeH-body.height)-6.8)<1e-7);
    assert(Math.abs(Math.hypot(p.footF-p.kneeF,p.footH-p.kneeH)-6.8)<1e-7);
    assert(p.footH >= -1e-7, 'el botín atraviesa el suelo');
    maxLift = Math.max(maxLift,p.footH);
    if(p.footH < 1e-7) contacts++;
    const wrap = motion.leg(phase+2*Math.PI,1,jog,sprint,body.height);
    for(const k of Object.keys(p)) assert(Math.abs(p[k]-wrap[k])<1e-7, 'salto al reiniciar el ciclo');
    count++;
  }
  if(!jog && !sprint) { assert(maxLift < 2); assert(contacts / 720 > 0.6); }
  if(sprint === 1) { assert(maxLift > 7); assert(contacts / 720 < 0.3); }
}
const idle = motion.body(0,0,0,0);
for(const phase of [0,1,2,3]) {
 const p = motion.leg(phase,0,0,0,idle.height);
 assert(Math.abs(p.footF)<1e-8 && Math.abs(p.footH)<1e-8);
}
console.log(`locomoción OK: ${count} poses, apoyos, vuelo, continuidad y reposo`);

const weights={moving:0,run:0,sprint:0};
for(let i=0;i<60;i++){const before=weights.sprint;motion.smoothWeights(weights,1,1,1,1/60);assert(weights.sprint>=before&&weights.sprint-before<.23);}
assert(weights.sprint>.999);motion.smoothWeights(weights,0,0,0,100);assert(weights.sprint>.4,"frame largo acotado");
