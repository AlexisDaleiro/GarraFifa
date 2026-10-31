'use strict';
// Red reproducible: mide presentación, no el ping de un teléfono real.
const C=require('../public/continuity');
const random=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const percentile=(a,p)=>[...a].sort((a,b)=>a-b)[Math.floor((a.length-1)*p)]||0;
function measure({jitter=0,stall=0}={}){
  const rand=random(17),deliveries=[],every=C.NET?.sendEvery||2;let previous=0;
  for(let t=0;t<1800;t+=every){
    const sent=t*C.TICK,phase=sent%2000;
    const at=Math.max(previous,sent+80-Math.log(1-rand())*jitter,stall&&phase<stall?sent-phase+stall+80:0);
    previous=at;deliveries.push({at,s:{t,s:'play',o:0,p:[[1,200+Math.sin(t/80)*80,200,0,0,100,0,0]],b:[300,200,0]}});
  }
  const clock=C.createClock(),sampler=C.createSampler(),presenter=C.createPresenter(),buf=[],ages=[],buffers=[];
  let i=0,last=null,maxStep=0;
  for(let now=0;now<29000;now+=C.TICK){
    while(i<deliveries.length&&deliveries[i].at<=now){const d=deliveries[i++];if(clock.receive(d.s.t,d.at))buf.push(d.s);}
    const t=clock.advance(now);if(t===null)continue;
    const shown=presenter.update(sampler.sample(buf,t),C.TICK/1000).players[0];
    if(now>5000){ages.push(now-t*C.TICK);buffers.push(clock.delay*C.TICK);if(last!==null)maxStep=Math.max(maxStep,Math.abs(shown.x-last));}
    last=shown.x;
  }
  const r=n=>Math.round(n*10)/10;
  return {snapshotHz:60/every,bufferMedianMs:r(percentile(buffers,.5)),playoutMedianMs:r(percentile(ages,.5)),playoutP95Ms:r(percentile(ages,.95)),maxStep:r(maxStep)};
}
if(require.main===module)console.log(JSON.stringify({stable:measure(),jitter:measure({jitter:20}),bursts:measure({jitter:10,stall:250})},null,2));
module.exports={measure};
