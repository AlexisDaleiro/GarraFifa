'use strict';
// Dos clientes reales: lobby → servidor → roster → parámetros de predicción.
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),path=require('node:path'),WebSocket=require('ws');
const {FootballAttributes:A}=require('../public/attributes');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<250;i++){if(fn())return;await sleep(20);}throw Error('espera de estado agotada');}
function client(port,lat=0,jitter=0){
  const ws=new WebSocket(`ws://localhost:${port}/socket.io/?EIO=4&transport=websocket`),pending=new Map();let seq=0;
  const timers=new Set();let tx=0,rx=0,n=0;
  const later=(fn,up)=>{const now=performance.now(),due=Math.max(up?tx:rx,now+lat+Math.sin(++n*1.7)*jitter);if(up)tx=due;else rx=due;
    const timer=setTimeout(()=>{timers.delete(timer);fn();},Math.max(0,due-now));timers.add(timer);};
  const send=packet=>later(()=>{if(ws.readyState===WebSocket.OPEN)ws.send(packet);},true);
  const c={ws,room:null,roster:null,snaps:[],id:null,send:(event,data)=>send('42'+JSON.stringify(data===undefined?[event]:[event,data])),close(){for(const t of timers)clearTimeout(t);ws.terminate();}};
  c.ack=(event,data)=>new Promise((resolve,reject)=>{
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('sin ack: '+event));},2000);
    pending.set(id,x=>{clearTimeout(timer);resolve(x);});send('42'+id+JSON.stringify([event,data]));
  });
  c.ready=new Promise((resolve,reject)=>{
    ws.on('error',reject);ws.on('message',raw=>later(()=>{
      const s=raw.toString();if(s[0]==='0')ws.send('40');else if(s==='2')ws.send('3');
      else if(s.startsWith('40')){c.id=JSON.parse(s.slice(2)).sid;resolve();}
      else if(s.startsWith('43')){const m=s.match(/^43(\d+)(\[.*)$/s);if(m){pending.get(+m[1])?.(JSON.parse(m[2])[0]);pending.delete(+m[1]);}}
      else if(s.startsWith('42')){const [event,data]=JSON.parse(s.slice(2));if(event==='room')c.room=data;if(event==='roster')c.roster=data;if(event==='s')c.snaps.push(data);}
    },false));
  });return c;
}
(async()=>{
  const server=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});
  const clients=[];let errors='',out='';server.stderr.on('data',b=>errors+=b);
  const port=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{server.kill();reject(Error('servidor no arrancó: '+errors));},5000);
    server.on('error',reject);server.stdout.on('data',b=>{out+=b;const m=out.match(/localhost:(\d+)/);if(m){clearTimeout(timer);resolve(+m[1]);}});
  });
  try{
    for(const [lat,jitter] of [[0,0],[100,30]]){
    const a=client(port,lat,jitter),b=client(port,lat,jitter);clients.push(a,b);await Promise.all([a.ready,b.ready]);
    const created=await a.ack('create',{mode:3,minutes:3,pitch:0,profile:{name:'Ana',archetype:'velocista',stats:{speed:9999},traits:['shot','control','balance']}});
    assert(created.ok);assert((await b.ack('join',{code:created.code,team:1,profile:{name:'Beto',archetype:'rematador'}})).ok);
    a.send('settings',{swap:false});await until(()=>a.room?.members.length===2&&b.room?.swap===false);
    a.send('profile',{name:'Ana',archetype:'regateador'});await until(()=>b.room.members.some(m=>m.id===a.id&&m.archetype==='regateador'));
    assert(!('stats' in a.room.members[0]),'no acepta estadísticas inyectadas');
    a.send('start');await until(()=>a.roster&&b.roster&&a.snaps.length>20&&b.snaps.length>20);
    assert.deepEqual(a.roster,b.roster,'mismos cuerpos en ambos clientes');
    const human=a.roster.find(p=>p.sid===a.id),other=a.roster.find(p=>p.sid===b.id);
    assert.equal(human.attributes.id,'regateador');assert.equal(other.attributes.id,'rematador');
    for(const p of a.roster){assert.deepEqual(p.attributes,A.build(p.attributes.id));assert.deepEqual(p.pace,A.motion(a.room.pace,p.attributes));}
    assert(a.roster.some(p=>!p.sid&&p.kind==='field'&&p.attributes.id==='defensor'),'composición propia de selección');
    a.send('profile',{name:'Ana',archetype:'velocista',stats:{speed:9999}});await sleep(100);
    assert.equal(a.room.members.find(m=>m.id===a.id).archetype,'regateador','bloqueado durante el partido');
    for(const c of clients)for(const snap of c.snaps)for(const p of snap.p){assert.equal(p[5],100);assert.equal(p[6],0);}
    a.send('autoSwitch',false);await until(()=>b.room.members.some(m=>m.id===a.id&&m.autoSwitch===false));
    const aid=a.roster.find(p=>p.sid===a.id).id,bid=b.roster.find(p=>p.sid===b.id).id;
    await until(()=>a.snaps.at(-1)?.s==='play'&&b.snaps.at(-1)?.s==='play');
    // En juego abierto uno de los equipos defiende o ambos disputan el balón libre.
    a.send('input',8|16|32);b.send('input',4|16|32);
    await until(()=>a.roster.find(p=>p.sid===a.id).id!==aid||b.roster.find(p=>p.sid===b.id).id!==bid);
    const actor=a.roster.find(p=>p.sid===a.id).id!==aid?a:b,otherClient=actor===a?b:a,newId=actor.roster.find(p=>p.sid===actor.id).id;
    await until(()=>otherClient.roster.find(p=>p.sid===actor.id)?.id===newId);
    assert.equal(actor.roster.filter(p=>p.sid===actor.id).length,1,'control exclusivo');
    assert(actor.roster.find(p=>p.id===newId).controlTick>0,'handoff fechado para predicción');
    await sleep(400+lat*2);assert.equal(actor.roster.find(p=>p.sid===actor.id).id,newId,'C sostenida no repite');
    assert.equal(errors,'','sin errores de servidor');
    console.log(`cambio en red OK: dos clientes, ${lat} ms ±${jitter} ms por sentido, control único y C sin repetición`);
    a.close();b.close();
    }

    console.log('red de atributos OK: dos clientes, elección compartida, IDs validados, bloqueo en partido y marcha individual para predicción');
  }finally{for(const c of clients)c.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
