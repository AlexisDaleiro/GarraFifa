'use strict';
const assert = require('node:assert/strict');
const { FootballPlayer3D: model } = require('../public/player3d');
const kit = {c1:'#7cc0ea',c2:'#ffffff',sh:'#111111',so:'#ffffff',pat:'rayas'};
let count=0;
for(const state of ['run','slide','down','dive','hold','spin','recover']) {
  for(const flags of [0,4,16]) {
    const mesh=model.build({st:state,flags},{id:3,num:99},kit,{phase:1.2,speed:3.45,run:1,sprint:1}, {time:500});
    assert(mesh instanceof Float32Array);
    assert.equal(mesh.length%27,0,'cada triángulo debe tener posición, normal y color');
    assert(mesh.length/27>2000,'debe existir una malla tridimensional completa');
    const bounds=[[Infinity,-Infinity],[Infinity,-Infinity],[Infinity,-Infinity]];
    for(let i=0;i<mesh.length;i+=9) {
      for(let j=0;j<9;j++) assert(Number.isFinite(mesh[i+j]),'vértice o material inválido');
      assert(Math.hypot(mesh[i+3],mesh[i+4],mesh[i+5])>0,'normal de iluminación vacía');
      for(let j=0;j<3;j++) {bounds[j][0]=Math.min(bounds[j][0],mesh[i+j]);bounds[j][1]=Math.max(bounds[j][1],mesh[i+j]);}
      for(let j=6;j<9;j++) assert(mesh[i+j]>=0&&mesh[i+j]<=1,'color fuera de rango');
    }
    assert(bounds.every(([lo,hi])=>hi-lo>3),'el jugador debe tener volumen en los tres ejes');
    count++;
  }
}
const idle=model.build({st:'run',flags:0},{id:1,num:10},kit,{phase:0,speed:0});
const sprint=model.build({st:'run',flags:0},{id:1,num:10},kit,{phase:1,speed:3.45,run:1,sprint:1});
assert.notDeepEqual(idle,sprint,'la articulación debe cambiar la geometría');
console.log(`modelos 3D OK: ${count} combinaciones de pose, normales, volumen y materiales`);

// Equipos sin WebGL: se proyecta la misma geometría, sin perder al jugador.
global.document={createElement:()=>({getContext:()=>null})};
let triangles=0;
const context={beginPath(){},closePath(){},fill(){triangles++;},moveTo(x,y){assert(Number.isFinite(x+y));},lineTo(x,y){assert(Number.isFinite(x+y));}};
model.draw(context,{st:'run',flags:0,face:0.7},{id:2,num:10},kit,{phase:1,speed:2.5,run:1},{});
assert(triangles>2000);
delete global.document;
console.log('proyección alternativa sin WebGL OK');
