'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {FootballAttributes:A}=require('../public/attributes'),{TEAMS}=require('../public/teams');
// Mismos datos y escalas en navegador y Node, sin azar ni valoraciones oficiales.
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../public/attributes'),'utf8'),sandbox);
assert.equal(JSON.stringify(sandbox.window.FootballAttributes.PROFILES),JSON.stringify(A.PROFILES));
for(const [id,data] of Object.entries(A.PROFILES)){
  assert.equal(Object.values(data.stats).reduce((a,b)=>a+b),400,id+': presupuesto de puntos');
  assert(data.traits.length<=2);
  const p=A.build(id);assert.deepEqual(p,A.build(id));
  for(const v of Object.values(p.stats))assert(Number.isInteger(v)&&v>=1&&v<=100);
  for(const [key,v] of Object.entries(p.fx))assert(v>=.9&&v<=1.1,id+': '+key+' fuera del límite');
  for(const trait of p.traits)assert(A.TRAITS[trait]);
}
for(const key in A.STATS)for(const n of [-100,1,25,50,75,100,1000,NaN,Infinity,'100']){
  const p=A.normalize({stats:{[key]:n},traits:['control','control','pass','shot','intruso']});
  assert(p.stats[key]>=1&&p.stats[key]<=100);assert(p.traits.length<=2);
  const v=A.factor(p,key,key);assert(v>=.9&&v<=1.1);
}
for(const key in A.STATS){
  const neutral=A.normalize({}),low=A.normalize({stats:{[key]:1}}),high=A.normalize({stats:{[key]:100},traits:[key]});
  assert.equal(A.factor(neutral,key,key),1);assert.equal(A.factor(low,key,key),.9);assert.equal(A.factor(high,key,key),1.1,'rasgo + atributo comparten techo');
}
for(const key of ['croqueta','bicicleta']){
  const p=A.normalize({stats:{agility:100},traits:[key]});assert.equal(A.factor(p,'agility',key),1.1);
  assert(A.factor(A.normalize({traits:[key]}),'agility',key)>1,'rasgo tiene efecto');
}
for(const bad of ['__proto__','constructor','desconocido',{},null,1])assert.equal(A.clean(bad),'');
for(const team of TEAMS){
  assert(A.SELECTIONS[team.code]);const st=A.style(team.code);assert(st.slots.every(A.valid));
  for(let i=0;i<12;i++)assert(A.valid(A.slot(team.code,i)));
  assert.equal(A.slot(team.code,0,'gk'),'arquero');
}
// Las identidades de selección eligen composición/táctica, sin alterar un perfil físico.
const p=A.build('regateador'),before=JSON.stringify(p);
for(const team of TEAMS)A.style(team.code);
assert.equal(JSON.stringify(p),before);
console.log('atributos OK: 8 estadísticas, 6 rasgos, 7 perfiles ficticios y 20 selecciones; límite conjunto ±10 %');
