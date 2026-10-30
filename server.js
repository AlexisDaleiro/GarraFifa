'use strict';
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { TEAMS } = require('./public/teams.js');
const { PITCHES, MODES, pitchGeom } = require('./public/pitches.js');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
// pingTimeout alto: en el celular la pestaña se congela un rato al cambiar de app.
const io = new Server(server, { pingTimeout: 45000 });
const ROOM_GRACE_MS = 60000; // sala vacía por corte de conexión: se guarda para poder volver
const PORT = process.env.PORT || 3000;

// ---------- Mundo (unidades de juego; 1 unidad ~ 10 cm) ----------
// La geometría depende de la cancha de cada sala: usePitch() la carga antes de simular esa sala.
let W, H, CX, CY, GOAL_TOP, GOAL_BOT, GOAL_H, BOX_D, BOX_TOP, BOX_BOT, PEN_SPOT;
const GOAL_DEPTH = 26;
function usePitch(room) { ({ W, H, CX, CY, GOAL_TOP, GOAL_BOT, GOAL_H, BOX_D, BOX_TOP, BOX_BOT, PEN_SPOT } = pitchGeom(PITCHES[room.pitch] || PITCHES[0])); }
usePitch({ pitch: 0 });
const TICK = 60, DT_MS = 1000 / TICK;
const SEND_EVERY = 2; // snapshots a 30 Hz: la mitad de mensajes por jugador; el cliente interpola
const GRAV = 0.32, PR = 9, BALL_R = 4;

// Tres botones: PASE (si la tiene el rival: barrida; si un compañero: pedirla), TIRO y SPRINT.
const B = { UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, SPRINT: 16, PASS: 128, SHOOT: 1024 };
const DIRS = B.UP | B.DOWN | B.LEFT | B.RIGHT;
const INPUT_MASK = DIRS | B.SPRINT | B.PASS | B.SHOOT;
const ST = { run: 0, slide: 1, recover: 2, down: 3, spin: 4, croq: 5, step: 6, fake: 7, rainbow: 8, fooled: 9, hold: 10, dive: 11 };
// Formaciones en coordenadas del estadio (1000x640); setHome las escala a la cancha.
const FORMATIONS = {
  1: [[320, 320]], 2: [[270, 230], [420, 410]], 3: [[250, 190], [250, 450], [420, 320]],
  4: [[220, 200], [220, 440], [400, 250], [400, 390]],
  5: [[200, 320], [260, 170], [260, 470], [420, 240], [420, 400]],
  6: [[200, 220], [200, 420], [300, 110], [300, 530], [420, 250], [420, 390]],
  10: [[170, 110], [150, 250], [150, 390], [170, 530], [290, 180], [280, 320], [290, 460], [420, 110], [440, 320], [420, 530]],
};
const BOT_NUMS = [9, 7, 11, 10, 8, 6, 5, 4, 3, 2];
const SP_LABEL = { kickoff: 'SAQUE INICIAL', free: 'TIRO LIBRE', penalty: '¡PENAL!', corner: 'CÓRNER', goalkick: 'SAQUE DE META', throw: 'SAQUE DE BANDA' };
const HOLD_T = 240; // ticks que el arquero espera la orden de un humano antes de sacar solo
const CALL_T = 120, CALL_COOL = 150; // pedido visible por 2 s; evita repetirlo al mantener la tecla

const rooms = new Map();

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const r1 = v => Math.round(v * 10) / 10;
const normAng = a => Math.atan2(Math.sin(a), Math.cos(a));
function turn(a, target, rate) {
  const d = normAng(target - a);
  return normAng(a + clamp(d, -rate, rate));
}
function dirFromBits(b) {
  let x = 0, y = 0;
  if (b & B.UP) y--;
  if (b & B.DOWN) y++;
  if (b & B.LEFT) x--;
  if (b & B.RIGHT) x++;
  const l = Math.hypot(x, y);
  return l ? { x: x / l, y: y / l } : { x: 0, y: 0 };
}

// ---------- Salas ----------
function makeCode() {
  const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do c = Array.from({ length: 4 }, () => ch[(Math.random() * ch.length) | 0]).join('');
  while (rooms.has(c));
  return c;
}

function newBall() {
  return { x: CX, y: CY, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, owner: null, lastTeam: 0, lastPlayer: 0, kicker: 0, inNet: false, netSide: 0 };
}

function newRoom(hostSid, mode, minutes, pitch = 0) {
  const room = {
    code: makeCode(), host: hostSid, mode, minutes, pitch, members: new Map(), state: 'lobby',
    players: [], ball: newBall(), score: [0, 0], timeLeft: 0, tick: 0, sp: null,
    goalT: 0, kickTeam: 0, teams: [0, 1], events: [], nextId: 1, acc: 0,
  };
  rooms.set(room.code, room);
  return room;
}

function cleanProfile(p) {
  p = p && typeof p === 'object' ? p : {};
  const name = String(p.name || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 12) || 'Jugador';
  const num = clamp(parseInt(p.num, 10) || 10, 1, 99);
  return { name, num };
}

function makePlayer(room, team, kind, prof, sid) {
  return {
    id: room.nextId++, sid: sid || null, team, kind, name: prof.name, num: prof.num,
    x: CX, y: CY, vx: 0, vy: 0, face: team === 0 ? 0 : Math.PI, st: 'run', stT: 0, stamina: 100, tired: false,
    sprinting: false, charging: false, charge: 0, queued: null, queuedT: 0, cool: 0, touchCool: 0, boostT: 0, kickT: 0,
    callT: 0, callCool: 0,
    slideClean: false, lastDir: { x: 0, y: 0 },
    input: 0, pressed: 0, released: 0, aiDir: null, aiHold: 0, home: { x: CX, y: CY },
  };
}

function buildRoster(room) {
  room.players = [];
  room.nextId = 1;
  const n = room.mode, form = FORMATIONS[n];
  for (let team = 0; team < 2; team++) {
    // Humanos de más (sala con más gente que el modo) juegan igual: reusan la formación.
    const humans = [...room.members.entries()].filter(([, m]) => m.team === team);
    for (let i = 0; i < Math.max(n, humans.length); i++) {
      const h = humans[i];
      const prof = h ? h[1] : { name: 'CPU', num: BOT_NUMS[i] };
      const p = makePlayer(room, team, 'field', prof, h ? h[0] : null);
      setHome(p, form[i % n]);
      room.players.push(p);
    }
    const gk = makePlayer(room, team, 'gk', { name: 'Arquero', num: 1 }, null);
    gk.home = { x: team === 0 ? 16 : W - 16, y: CY };
    room.players.push(gk);
  }
}

function setHome(p, f) {
  const x = f[0] * W / 1000;
  p.home = { x: p.team === 0 ? x : W - x, y: f[1] * H / 640 };
}

function claimBot(room, sid) {
  usePitch(room);
  const m = room.members.get(sid);
  let p = room.players.find(q => q.kind === 'field' && !q.sid && q.team === m.team);
  if (!p) p = room.players.find(q => q.kind === 'field' && !q.sid);
  if (!p) {
    // Sin bots libres: suma un jugador al equipo del que entra en vez de dejarlo mirando.
    p = makePlayer(room, m.team, 'field', m, sid);
    setHome(p, FORMATIONS[room.mode][room.players.filter(q => q.team === m.team && q.kind === 'field').length % room.mode]);
    p.x = p.home.x; p.y = p.home.y;
    room.players.push(p);
  }
  m.team = p.team;
  Object.assign(p, { sid, name: m.name, num: m.num, aiDir: null, input: 0, aiHold: 0 });
}

function emitEv(room, ev) {
  ev={tick:room.tick,...ev};room.events.push(ev);
  if(ev.fall||['goal','shoulder','post','shot'].includes(ev.type)||ev.faceHit){
    let history=visualHistory.get(room);
    if(!history){history=[];visualHistory.set(room,history);}
    history.push(ev);while(history.length&&(room.tick-history[0].tick>600||history.length>512))history.shift();
  }
}
// Metadatos de dibujo: no consumen azar ni modifican el estado físico.
const visualContacts=new WeakMap(),visualHistory=new WeakMap();
function fallFX(room, s, o, duration) {
  const dx=o.x-s.x,dy=o.y-s.y,d=Math.hypot(dx,dy)||1;
  return {seed:(Math.imul(room.tick,31)^Math.imul(o.id,131)^s.id)>>>0,duration,
    dx:r1(dx/d),dy:r1(dy/d),power:r1(Math.min(1,Math.hypot(s.vx,s.vy)/7.2))};
}

function roomInfo(r) {
  return {
    code: r.code, host: r.host, mode: r.mode, minutes: r.minutes, pitch: r.pitch, paused: !!r.paused, state: r.state, score: r.score, teams: r.teams,
    members: [...r.members].map(([id, { cid, ...m }]) => ({ id, ...m })),
  };
}
function broadcastRoom(r) { io.to(r.code).emit('room', roomInfo(r)); }
function emitRoster(r) {
  io.to(r.code).emit('roster', r.players.map(p => ({
    id: p.id, team: p.team, kind: p.kind, name: p.name, num: p.num, sid: p.sid,
  })),visualHistory.get(r)||[]);
}

// ---------- Flujo del partido ----------
function startMatch(room) {
  usePitch(room);
  room.paused = false;
  visualHistory.delete(room);visualContacts.delete(room);
  buildRoster(room);
  room.score = [0, 0];
  room.timeLeft = room.minutes * 60 * TICK;
  room.ball = newBall();
  room.events = [];
  room.acc = 0;
  emitRoster(room);
  emitEv(room, { type: 'start' });
  kickoff(room, Math.random() < 0.5 ? 0 : 1);
  broadcastRoom(room);
}

function endMatch(room) {
  room.state = 'ended';
  room.sp = null;
  emitEv(room, { type: 'end', score: room.score });
  broadcastRoom(room);
}

function resetMotion(p) {
  p.vx = p.vy = 0; p.st = 'run'; p.stT = 0; p.charging = false; p.charge = 0;
  p.queued = null; p.boostT = 0; p.aiHold = 0; p.callT = 0; p.callCool = 0;
}

function kickoff(room, team) {
  if (room.timeLeft <= 0) return endMatch(room);
  for (const p of room.players) {
    p.x = p.home.x; p.y = p.home.y; p.face = p.team === 0 ? 0 : Math.PI;
    resetMotion(p);
  }
  setPiece(room, 'kickoff', team, CX, CY);
}

function setPiece(room, type, team, x, y) {
  const b = room.ball;
  Object.assign(b, { x, y, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, inNet: false });
  const goalX = team === 0 ? W : 0;
  let taker;
  if (type === 'goalkick') taker = room.players.find(p => p.team === team && p.kind === 'gk');
  else {
    const mates = room.players.filter(p => p.team === team && p.kind === 'field');
    taker = mates.reduce((a, p) => (dist(p.x, p.y, x, y) < dist(a.x, a.y, x, y) ? p : a));
  }
  let ax = goalX, ay = CY;
  if (type === 'corner') ax = team === 0 ? W - 140 : 140;
  else if (type === 'throw') { ax = x + (team === 0 ? 80 : -80); ay = CY; }
  const ang = Math.atan2(ay - y, ax - x);
  for (const p of room.players) { p.charging = false; p.charge = 0; p.queued = null; p.aiHold = 0; p.callT = 0; }
  resetMotion(taker);
  taker.face = ang;
  taker.x = x - Math.cos(ang) * 14;
  taker.y = y - Math.sin(ang) * 14;
  b.owner = taker; b.lastTeam = team; b.lastPlayer = taker.id;

  if (type === 'penalty') {
    const right = x > CX;
    for (const p of room.players) {
      if (p === taker) continue;
      if (p.kind === 'gk') {
        if (p.team !== team) { p.x = right ? W - 6 : 6; p.y = CY; resetMotion(p); }
        continue;
      }
      if (right ? p.x > W - BOX_D - 10 : p.x < BOX_D + 10) {
        p.x = right ? W - BOX_D - rnd(20, 60) : BOX_D + rnd(20, 60);
        p.y = rnd(BOX_TOP, BOX_BOT);
      }
      resetMotion(p);
    }
  }
  room.sp = { type, team, taker, x, y, t: 0, r: type === 'kickoff' ? 80 : type === 'penalty' ? 0 : 70 };
  room.state = 'setpiece';
  emitEv(room, { type: 'setpiece', kind: type, label: SP_LABEL[type], team });
}

function goal(room, team) {
  const b = room.ball;
  room.score[team]++;
  b.inNet = true; b.netSide = team === 0 ? 1 : -1; b.owner = null;
  room.state = 'goal'; room.goalT = 420; room.kickTeam = 1 - team; room.sp = null;
  for (const p of room.players) { p.charging = false; p.charge = 0; p.queued = null; p.callT = 0; }
  // Un roce del arquero o un desvío del defensor no convierte en autogol el remate del rival.
  const last = room.players.find(p => p.id === b.lastPlayer), kicker = room.players.find(p => p.id === b.kicker);
  const scorer = last && last.team !== team && kicker && kicker.team === team ? kicker : last;
  const leader=scorer?.team===team?scorer:room.players.find(p=>p.team===team&&p.kind==='field');
  const celebrants=room.players.filter(p=>p.team===team&&leader&&dist(p.x,p.y,leader.x,leader.y)<180).map(p=>p.id);
  emitEv(room, { type: 'goal', scorerId:scorer?.id||0,celebrants,team, scorer: scorer ? scorer.name : '', own: !!scorer && scorer.team !== team, score: room.score });
}

function outOfPlay(room, kind) {
  const b = room.ball;
  emitEv(room, { type: 'whistle' });
  if (kind === 'throw') return setPiece(room, 'throw', 1 - b.lastTeam, clamp(b.x, 10, W - 10), b.y < 0 ? 2 : H - 2);
  const left = b.x < 0, defTeam = left ? 0 : 1;
  if (b.lastTeam === defTeam) return setPiece(room, 'corner', 1 - defTeam, left ? 3 : W - 3, b.y < CY ? 3 : H - 3);
  return setPiece(room, 'goalkick', defTeam, left ? 40 : W - 40, CY);
}

function foul(room, s, o) {
  const fall=fallFX(room,s,o,70);
  o.st = 'down'; o.stT = 70; o.vx *= 0.3; o.vy *= 0.3; o.charging = false;
  s.vx *= 0.3; s.vy *= 0.3;
  const fx = clamp(o.x, 5, W - 5), fy = clamp(o.y, 5, H - 5);
  const defLeft = s.team === 0;
  const inBox = fy > BOX_TOP && fy < BOX_BOT && (defLeft ? fx < BOX_D : fx > W - BOX_D);
  emitEv(room, { type: 'foul', id: s.id, victim: o.id, x: fx, y: fy, pen: inBox, fall });
  room.ball.owner = null;
  if (inBox) setPiece(room, 'penalty', o.team, defLeft ? PEN_SPOT : W - PEN_SPOT, CY);
  else setPiece(room, 'free', o.team, fx, fy);
}

// ---------- Acciones con balón ----------
function kickBall(room, p, vx, vy, vz, spin) {
  const b = room.ball;
  b.owner = null; b.vx = vx; b.vy = vy; b.vz = vz; b.spin = spin || 0;
  b.lastTeam = p.team; b.lastPlayer = p.id; b.kicker = p.id;
  room.pass = null;
  p.touchCool = 14; p.kickT = 10; p.kickKind = 'kick'; p.charging = false; p.charge = 0; p.queued = null; p.callT = 0;
  emitEv(room, { type: 'kick', p: r1(Math.hypot(vx, vy) + Math.abs(vz)), x: r1(b.x), y: r1(b.y) });
}

// Asistencia estilo PES: el compañero más alineado con la dirección gana; las líneas tapadas por rivales restan.
function findMate(room, p, aim) {
  const fx = Math.cos(aim), fy = Math.sin(aim);
  let best = null, bestScore = -Infinity;
  for (const m of room.players) {
    if (m === p || m.team !== p.team || m.kind === 'gk') continue;
    const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy);
    if (d < 30 || d > 560) continue;
    const dot = (dx * fx + dy * fy) / d;
    if (dot < 0.2) continue;
    const score = dot * 3 - d / 500 - linePenalty(room, p, m);
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

// Cuánto tapan los rivales la línea de pase de p a m (0 = libre).
function linePenalty(room, p, m) {
  const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy) || 1;
  let pen = 0;
  for (const o of room.players) {
    if (o.team === p.team) continue;
    const t = ((o.x - p.x) * dx + (o.y - p.y) * dy) / (d * d);
    if (t <= 0.05 || t >= 1) continue;
    const off = Math.abs((o.x - p.x) * dy - (o.y - p.y) * dx) / d;
    if (off < 22) pen += ((22 - off) / 22) * 0.9;
  }
  return pen;
}

// Un solo botón de pase: lejos o con la línea tapada va bombeado; compañero picando al arco, al hueco.
function autoKind(room, p, mate) {
  if (!mate) return 'ground';
  if (dist(mate.x, mate.y, p.x, p.y) > 240 || linePenalty(room, p, mate) > 0.45) return 'lob';
  const side = p.team === 0 ? 1 : -1;
  if ((mate.x - p.x) * side > 60 && mate.vx * side > 1) return 'through';
  return 'ground';
}

const ROLL = 0.982, AIR = 0.994; // rozamiento por tick del balón raso / en el aire (ver updateBall)

function doPass(room, p, aim, kind) {
  const b = room.ball;
  const mate = findMate(room, p, aim);
  if (kind === 'auto') kind = autoKind(room, p, mate);
  let tx, ty;
  if (mate) {
    // punto de encuentro: dónde estará el compañero cuando llegue el balón
    const sp = kind === 'lob' ? 6.5 : kind === 'through' ? 8 : 9;
    tx = mate.x; ty = mate.y;
    for (let i = 0; i < 2; i++) {
      const T = Math.hypot(tx - b.x, ty - b.y) / sp;
      tx = mate.x + mate.vx * T; ty = mate.y + mate.vy * T;
    }
    if (kind === 'through') tx += (p.team === 0 ? 1 : -1) * 60;
  } else {
    const L = kind === 'lob' ? 260 : 180;
    tx = b.x + Math.cos(aim) * L;
    ty = b.y + Math.sin(aim) * L;
  }
  tx = clamp(tx, 8, W - 8); ty = clamp(ty, 8, H - 8);
  const d = Math.hypot(tx - b.x, ty - b.y) || 1;
  const ang = Math.atan2(ty - b.y, tx - b.x) + rnd(-1, 1) * (p.tired ? 0.04 : 0.012);
  if (kind === 'lob') {
    // vuela T ticks y cae justo en el punto (compensa el rozamiento del aire)
    const T = clamp(d / 6.5, 24, 60), v = (d * (1 - AIR)) / (1 - Math.pow(AIR, T));
    kickBall(room, p, Math.cos(ang) * v, Math.sin(ang) * v, Math.min(10, (GRAV * T) / 2), 0);
  } else {
    // llega al punto con velocidad vEnd: lo justo para controlarlo
    const v = clamp((kind === 'through' ? 4.5 : 3) + d * (1 - ROLL), 4.5, 14);
    kickBall(room, p, Math.cos(ang) * v, Math.sin(ang) * v, 0, 0);
  }
  p.kickKind = 'pass';
  if (mate) {
    room.pass = { to: mate.id, x: tx, y: ty, t: 150 };
    emitEv(room, { type: 'pass', to: mate.id });
  }
}

// Dónde corta el receptor la trayectoria del pase (en el aire: donde cae).
function receivePoint(room, p) {
  const b = room.ball, rp = room.pass, s = Math.hypot(b.vx, b.vy);
  if (b.z > 6) return { x: rp.x, y: rp.y };
  if (s < 1) return { x: b.x, y: b.y };
  const ux = b.vx / s, uy = b.vy / s;
  const along = clamp((p.x - b.x) * ux + (p.y - b.y) * uy, 0, s / (1 - ROLL)); // no más allá de donde se frena
  return { x: b.x + ux * along, y: b.y + uy * along };
}
const isReceiver = (room, p) => !!room.pass && room.pass.to === p.id && !room.ball.owner;

// power 0..1 -> raso / colocado (con comba) / potente (riesgo de volarla)
function shotParams(power) {
  if (power < 0.34) return { kind: 'raso', speed: 9.5 + power * 9, h: 1 };
  if (power < 0.75) return { kind: 'colocado', speed: 11 + power * 4, h: 18 };
  return { kind: 'potente', speed: 15 + power * 4, h: 32 + Math.max(0, power - 0.92) * 500 };
}

function doShoot(room, p, power, header) {
  const b = room.ball, side = p.team === 0 ? 1 : -1, goalX = p.team === 0 ? W : 0;
  const d = p.lastDir;
  let tx = goalX, ty;
  if (d.y < -0.3) ty = GOAL_TOP + 10;
  else if (d.y > 0.3) ty = GOAL_BOT - 10;
  else ty = b.y < CY ? GOAL_BOT - 16 : GOAL_TOP + 16;
  if (Math.cos(p.face) * side < -0.3) { tx = b.x + Math.cos(p.face) * 300; ty = b.y + Math.sin(p.face) * 300; }
  const sp = shotParams(power);
  let { speed, h } = sp;
  if (header) { speed *= 0.75; h = Math.min(h, 20); }
  const finesse = sp.kind === 'colocado';
  const aimY = finesse ? ty + (ty < CY ? -38 : 38) : ty;
  const ang = Math.atan2(aimY - b.y, tx - b.x) + rnd(-1, 1) * (0.025 + power * 0.04 + (p.tired ? 0.07 : 0));
  const T = Math.max(6, Math.hypot(tx - b.x, aimY - b.y) / speed);
  let vz = (h + rnd(-4, 4) + 0.5 * GRAV * T * T) / T;
  if (sp.kind === 'raso') vz = Math.min(vz, 1.2);
  vz = clamp(vz, 0, 11);
  let spin = 0;
  if (finesse) {
    const perpY = Math.cos(ang);
    if (Math.abs(perpY) > 0.2) spin = clamp((2 * (ty - aimY)) / (T * T) / perpY, -0.4, 0.4);
  }
  kickBall(room, p, Math.cos(ang) * speed, Math.sin(ang) * speed, vz, spin);
  emitEv(room, { type: 'shot', id: p.id, kind: header ? 'cabeza' : sp.kind });
}

const hasHuman = (room, team) => room.players.some(m => m.sid && m.team === team);

// Saque del arquero: aim/kind los elige un humano; si no, busca un compañero (prefiere humanos).
function gkDistribute(room, p, aim, kind) {
  if (aim === undefined) {
    const mates = room.players.filter(m => m.team === p.team && m.kind === 'field');
    if (!mates.length) return;
    const humans = mates.filter(m => m.sid), pool = humans.length ? humans : mates;
    const m = pool[(Math.random() * pool.length) | 0];
    aim = Math.atan2(m.y - p.y, m.x - p.x);
    kind = 'auto';
  }
  p.face = aim; p.st = 'run'; p.stT = 0;
  if (kind === 'punt') kickBall(room, p, Math.cos(aim) * 9, Math.sin(aim) * 9, 6.5, 0);
  else doPass(room, p, aim, kind);
}

// Cuando tu arquero tiene el balón, tú decides el saque: PASE o TIRO (despeje); flechas apuntan.
function gkHumanKick(room) {
  const g = room.ball.owner, sp = room.sp;
  if (!g || g.kind !== 'gk') return;
  if (!((g.st === 'hold' && g.stT < HOLD_T - 15) || (sp && sp.taker === g && sp.t >= 40))) return;
  for (const h of room.players) {
    if (!h.sid || h.team !== g.team) continue;
    const pr = h.pressed;
    const kind = pr & B.PASS ? 'auto' : pr & B.SHOOT ? 'punt' : null;
    if (!kind) continue;
    h.pressed &= ~(B.PASS | B.SHOOT);
    const d = dirFromBits(h.input);
    return gkDistribute(room, g, d.x || d.y ? Math.atan2(d.y, d.x) : Math.atan2(h.y - g.y, h.x - g.x), kind);
  }
}

function startDive(room, p, gap, t) {
  p.st = 'dive'; p.stT = 26;
  p.vx = (p.team === 0 ? 1 : -1) * 0.6;
  p.vy = clamp((gap / Math.max(t, 8)) * 1.1, -4.2, 4.2) + Math.sign(gap) * 1.1;
  p.face = Math.atan2(p.vy, p.vx);
  emitEv(room, { type: 'dive', id: p.id });
}

function endState(room, p) {
  const prev = p.st;
  p.st = 'run';
  if (prev === 'slide') { p.st = 'recover'; p.stT = 14; }
  else if (prev === 'dive') { p.st = 'recover'; p.stT = 22; }
  else if (prev === 'hold' && room.ball.owner === p) gkDistribute(room, p);
}

// ---------- Jugador ----------
function updatePlayer(room, p) {
  const b = room.ball, sp = room.sp;
  const isTaker = !!sp && sp.taker === p;
  const frozen = !!sp && sp.t < 40;
  const held = p.input;
  let pr = p.pressed, rel = p.released;
  p.pressed = 0; p.released = 0;
  if (frozen) { pr = 0; rel = 0; }
  let d = p.aiDir || dirFromBits(held);
  p.lastDir = d;
  // receptor humano sin tocar flechas: va solo a cortar el pase
  if (p.sid && !d.x && !d.y && isReceiver(room, p)) {
    const rp = receivePoint(room, p), dx = rp.x - p.x, dy = rp.y - p.y, l = Math.hypot(dx, dy);
    if (l > 5) d = { x: dx / l, y: dy / l };
  }

  if (p.stT > 0 && --p.stT === 0) endState(room, p);
  if (p.touchCool > 0) p.touchCool--;
  if (p.cool > 0) p.cool--;
  if (p.boostT > 0) p.boostT--;
  if (p.kickT > 0) p.kickT--;
  if (p.callT > 0) p.callT--;
  if (p.callCool > 0) p.callCool--;
  if (p.queuedT > 0 && --p.queuedT === 0) p.queued = null;

  const hasBall = b.owner === p;
  if (hasBall) p.callT = 0;
  const moving = d.x !== 0 || d.y !== 0;

  // Velocidad + estamina ("Garra")
  let speed = p.kind === 'gk' ? 2.6 : 2.5;
  p.sprinting = false;
  if ((held & B.SPRINT) && moving && !p.tired && p.st === 'run' && !frozen && !isTaker) {
    speed = p.kind === 'gk' ? 3.3 : 3.45;
    p.stamina -= 0.32;
    p.sprinting = true;
    if (p.stamina <= 0) { p.stamina = 0; p.tired = true; }
  } else {
    p.stamina = Math.min(100, p.stamina + (moving ? 0.1 : 0.22));
  }
  if (p.tired) { speed = 1.9; if (p.stamina > 35) p.tired = false; }
  if (hasBall) speed *= 0.9;
  if (p.boostT > 0) speed *= 1.35;
  if (p.charging) speed *= 0.6;

  switch (p.st) {
    case 'run': {
      if (frozen) { p.vx *= 0.8; p.vy *= 0.8; break; }
      const acc = hasBall ? 0.18 : 0.24;
      p.vx += (d.x * speed - p.vx) * acc;
      p.vy += (d.y * speed - p.vy) * acc;
      if (moving) p.face = turn(p.face, Math.atan2(d.y, d.x), isTaker ? 1 : hasBall ? 0.22 : 0.3);
      break;
    }
    case 'slide': p.vx *= 0.955; p.vy *= 0.955; break;
    case 'dive': p.vx *= 0.93; p.vy *= 0.93; break;
    default: p.vx *= 0.8; p.vy *= 0.8; // recover, down, hold
  }
  p.x = clamp(p.x + p.vx, -30, W + 30);
  p.y = clamp(p.y + p.vy, -30, H + 30);
  if (p.kind === 'gk') {
    p.x = p.team === 0 ? clamp(p.x, 2, BOX_D - 8) : clamp(p.x, W - BOX_D + 8, W - 2);
    p.y = clamp(p.y, BOX_TOP + 4, BOX_BOT - 4);
  }
  if (isTaker) { p.x = sp.x - Math.cos(p.face) * 14; p.y = sp.y - Math.sin(p.face) * 14; p.vx = p.vy = 0; }

  if (frozen || p.st !== 'run') { if (!hasBall) p.charging = false; return; }
  const aim = moving ? Math.atan2(d.y, d.x) : p.face;

  // Barrida: PASE mientras el rival tiene la pelota. Con el stick apunta; sin stick va hacia el rival.
  const carrier = b.owner && b.owner.team !== p.team ? b.owner : null;
  if ((pr & B.PASS) && carrier && p.cool <= 0 && p.kind === 'field' && room.state === 'play') {
    const ta = moving ? aim : Math.atan2(carrier.y - p.y, carrier.x - p.x);
    p.st = 'slide'; p.stT = 26; p.cool = 70; p.slideClean = false; p.face = ta;
    p.vx = Math.cos(ta) * 7.2; p.vy = Math.sin(ta) * 7.2;
    p.stamina = Math.max(0, p.stamina - 6);
    emitEv(room, { type: 'slide', id: p.id });
    return;
  }

  if (hasBall) {
    if (p.charging) {
      p.charge = Math.min(1, p.charge + 1 / 55);
      if ((rel & B.SHOOT) || !(held & B.SHOOT)) return doShoot(room, p, p.charge, false);
      return;
    }
    if (pr & B.SHOOT) {
      if (rel & B.SHOOT) return doShoot(room, p, 0.08, false);
      p.charging = true; p.charge = 0.05;
      return;
    }
    if (pr & B.PASS) return doPass(room, p, aim, 'auto');
  } else {
    p.charging = false; p.charge = 0;
    const passPressed = pr & B.PASS;
    // Solo se pide cuando la tiene un compañero
    const mateHas = !!b.owner && b.owner.team === p.team;
    if (passPressed && mateHas && p.sid && p.kind === 'field' && room.state === 'play' && p.callCool === 0) {
      p.callT = CALL_T; p.callCool = CALL_COOL;
    }
    // Pedirla a un compañero no prepara un pase involuntario cuando la recibís.
    // Se mantiene la jugada de primera si el pase ya viene hacia vos o el balón está al alcance.
    const firstTouch = !p.sid || (!b.owner && (isReceiver(room, p) || dist(p.x, p.y, b.x, b.y) < 40));
    if (passPressed && !firstTouch) { p.queued = null; p.queuedT = 0; }
    const q = pr & B.SHOOT ? 'shoot' : firstTouch && passPressed ? 'pass' : null;
    if (q) { p.queued = q; p.queuedT = 18; }
  }
}

// ---------- IA ----------
function nearestOpp(room, p) {
  let best = null, bd = Infinity;
  for (const o of room.players) {
    if (o.team === p.team) continue;
    const d = dist(o.x, o.y, p.x, p.y);
    if (d < bd) { bd = d; best = o; }
  }
  return { o: best, d: bd };
}

function aiShoot(p, side) {
  p.pressed |= B.SHOOT;
  p.input |= B.SHOOT;
  p.aiHold = rnd(12, 46) | 0;
  p.aiDir = { x: side * 0.4, y: Math.random() < 0.5 ? -0.9 : 0.9 };
}

function aiPassTo(p, m, btn) {
  const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy) || 1;
  p.aiDir = { x: dx / d, y: dy / d };
  p.pressed |= btn;
}

function fieldAI(room, p) {
  const b = room.ball, sp = room.sp;
  const side = p.team === 0 ? 1 : -1, goalX = p.team === 0 ? W : 0;
  p.input = 0;
  if (p.aiHold > 0) { if (--p.aiHold > 0) p.input |= B.SHOOT; return; }
  const hasBall = b.owner === p;
  let tx = p.home.x, ty = p.home.y, sprint = false;

  if (sp && sp.taker === p) {
    p.aiDir = { x: 0, y: 0 };
    if (sp.t < 55) return;
    const dGoal = dist(p.x, p.y, goalX, CY);
    if (sp.type === 'penalty' || (sp.type === 'free' && dGoal < 300)) return aiShoot(p, side);
    const m = findMate(room, p, Math.atan2(CY - p.y, goalX - p.x)) || findMate(room, p, p.face);
    if (m) return aiPassTo(p, m, B.PASS);
    p.aiDir = { x: side, y: 0 };
    p.pressed |= B.PASS;
    return;
  }

  if (hasBall) {
    const dGoal = dist(p.x, p.y, goalX, CY);
    const { o: near, d: nd } = nearestOpp(room, p);
    if (dGoal < 280 && Math.abs(p.y - CY) < 220 && Math.random() < 0.06) return aiShoot(p, side);
    if (nd < 50 && Math.random() < 0.05) {
      const m = findMate(room, p, Math.atan2(CY - p.y, goalX - p.x)) || findMate(room, p, p.face);
      if (m) return aiPassTo(p, m, B.PASS);
    }
    tx = goalX - side * 40;
    ty = CY + (p.y < CY ? -30 : 30);
    if (near && nd < 80) ty += p.y > near.y ? 70 : -70;
    sprint = p.stamina > 40 && nd < 120;
  } else if (isReceiver(room, p)) {
    ({ x: tx, y: ty } = receivePoint(room, p));
    sprint = dist(p.x, p.y, tx, ty) > 40 && p.stamina > 20;
  } else {
    const teamHas = b.owner && b.owner.team === p.team;
    const px = b.owner ? b.owner.x : b.x + b.vx * 8, py = b.owner ? b.owner.y : b.y + b.vy * 8;
    let chaser = null, cd = Infinity;
    for (const m of room.players) {
      if (m.team !== p.team || m.kind !== 'field') continue;
      const d = dist(m.x, m.y, px, py);
      if (d < cd) { cd = d; chaser = m; }
    }
    if (!teamHas && (chaser === p || dist(p.x, p.y, px, py) < 70)) {
      tx = px; ty = py;
      const dp = dist(p.x, p.y, px, py);
      sprint = dp > 50 && p.stamina > 30;
      if (b.owner && b.owner.team !== p.team && b.owner.kind === 'field') {
        if (dp < 34 && p.cool <= 0 && room.state === 'play' && Math.random() < 0.03) p.pressed |= B.PASS;
      } else if (!b.owner && b.z > 8 && dp < 50 && Math.random() < 0.2) {
        p.pressed |= (b.x - CX) * side > 150 ? B.SHOOT : B.PASS;
      }
    } else {
      const bx = b.owner ? b.owner.x : b.x;
      tx = p.home.x + (bx - CX) * 0.6 + (teamHas ? side * 90 : 0);
      ty = p.home.y + (b.y - CY) * 0.35;
      tx = clamp(tx, 30, W - 30);
      ty = clamp(ty, 30, H - 30);
    }
  }
  const dx = tx - p.x, dy = ty - p.y, dd = Math.hypot(dx, dy);
  p.aiDir = dd > 6 ? { x: dx / dd, y: dy / dd } : { x: 0, y: 0 };
  if (sprint) p.input |= B.SPRINT;
}

function gkAI(room, p) {
  const b = room.ball, sp = room.sp;
  const side = p.team === 0 ? 1 : -1, lineX = p.team === 0 ? 14 : W - 14;
  p.input = 0;
  p.aiDir = { x: 0, y: 0 };
  if (b.owner === p) {
    if (sp && sp.taker === p && sp.t > (hasHuman(room, p.team) ? HOLD_T : 55)) gkDistribute(room, p);
    return;
  }
  if (p.st !== 'run') return;
  let tx = lineX, ty = clamp(b.y, GOAL_TOP + 4, GOAL_BOT - 4);
  const incoming = !b.owner && b.vx * side < -2;
  if (incoming) {
    const t = (b.x - lineX) / -b.vx;
    if (t > 0) ty = clamp(b.y + b.vy * t, GOAL_TOP - 10, GOAL_BOT + 10);
    const gap = b.y + b.vy * t - p.y;
    // estirada: solo si el balón va al arco y no llega caminando (reacción con algo de demora)
    if (t > 0 && t < 24 && Math.abs(gap) > 11 && Math.abs(b.y + b.vy * t - CY) < 62 && Math.random() < 0.35) return startDive(room, p, gap, t);
  }
  const dBall = dist(b.x, b.y, lineX, CY);
  if (sp && sp.type === 'penalty' && sp.team !== p.team) { tx = lineX; ty = CY; }
  else if (!b.owner && !incoming && dBall < 130) { tx = b.x; ty = b.y; }
  else if (dBall < 300) tx = lineX + side * 22;
  const dx = tx - p.x, dy = ty - p.y, dd = Math.hypot(dx, dy);
  if (dd > 3) p.aiDir = { x: dx / dd, y: dy / dd };
  if (incoming || dd > 40) p.input |= B.SPRINT;
}

// ---------- Balón ----------
function updateBall(room) {
  const b = room.ball, o = b.owner, prevX = b.x;
  if (o) {
    if (room.state === 'setpiece' && room.sp && room.sp.taker === o) { b.x = room.sp.x; b.y = room.sp.y; return; }
    const held = o.st === 'hold'; // en las manos del arquero, a la altura del pecho
    const ox = Math.cos(o.face) * (held ? 5 : 11), oy = Math.sin(o.face) * (held ? 5 : 11);
    const tx = o.x + ox + o.vx, ty = o.y + oy + o.vy;
    b.x += (tx - b.x) * 0.55; b.y += (ty - b.y) * 0.55;
    b.vx = o.vx; b.vy = o.vy; b.z = held ? 22 : 0; b.vz = 0; b.spin = 0;
  } else {
    b.x += b.vx; b.y += b.vy; b.z += b.vz;
    if (b.z > 0 || b.vz > 0) { b.vz -= GRAV; b.vx *= 0.994; b.vy *= 0.994; }
    if (b.z <= 0) {
      b.z = 0;
      if (b.vz < -1.3) { b.vz = -b.vz * 0.5; b.vx *= 0.88; b.vy *= 0.88; }
      else { b.vz = 0; b.vx *= 0.982; b.vy *= 0.982; }
    }
    if (b.spin) {
      const s = Math.hypot(b.vx, b.vy);
      if (s > 2) { const px = -b.vy / s, py = b.vx / s; b.vx += px * b.spin; b.vy += py * b.spin; }
      b.spin *= b.z > 0 ? 0.995 : 0.9;
      if (Math.abs(b.spin) < 0.002) b.spin = 0;
    }
  }
  checkGoalFrame(room, prevX);
}

function checkGoalFrame(room, prevX) {
  const b = room.ball;
  if (b.inNet) {
    if (b.netSide < 0) { if (b.x < -GOAL_DEPTH) { b.x = -GOAL_DEPTH; b.vx = Math.abs(b.vx) * 0.3; } if (b.x > -2) { b.x = -2; b.vx = -Math.abs(b.vx) * 0.3; } }
    else { if (b.x > W + GOAL_DEPTH) { b.x = W + GOAL_DEPTH; b.vx = -Math.abs(b.vx) * 0.3; } if (b.x < W + 2) { b.x = W + 2; b.vx = Math.abs(b.vx) * 0.3; } }
    if (b.y < GOAL_TOP + 3) { b.y = GOAL_TOP + 3; b.vy = Math.abs(b.vy) * 0.3; }
    if (b.y > GOAL_BOT - 3) { b.y = GOAL_BOT - 3; b.vy = -Math.abs(b.vy) * 0.3; }
    if (b.z > GOAL_H - 4) { b.z = GOAL_H - 4; b.vz = -Math.abs(b.vz) * 0.3; }
    return;
  }
  // Postes
  if (b.z < GOAL_H) {
    for (const gx of [0, W]) for (const gy of [GOAL_TOP, GOAL_BOT]) {
      const dx = b.x - gx, dy = b.y - gy, d = Math.hypot(dx, dy);
      if (d >= 6 || d === 0) continue;
      const nx = dx / d, ny = dy / d, dot = b.vx * nx + b.vy * ny;
      if (dot >= 0) continue;
      if (b.owner) b.owner = null;
      b.vx = (b.vx - 2 * dot * nx) * 0.7; b.vy = (b.vy - 2 * dot * ny) * 0.7;
      b.x = gx + nx * 6; b.y = gy + ny * 6;
      emitEv(room, { type: 'post', ...postFX(room,gx,gy) });
    }
  }
  // Línea de gol: travesaño / gol
  for (const [gx, s] of [[0, -1], [W, 1]]) {
    const crossed = s < 0 ? prevX >= 0 && b.x < 0 : prevX <= W && b.x > W;
    if (!crossed) continue;
    const inMouth = b.y > GOAL_TOP && b.y < GOAL_BOT;
    if (inMouth && b.z >= GOAL_H - 2 && b.z <= GOAL_H + 4) {
      b.x = gx - s; b.vx = -b.vx * 0.6; b.vz = Math.abs(b.vz) * 0.4 + 1;
      emitEv(room, { type: 'post', bar: true, ...postFX(room,gx,b.y) });
      return;
    }
    if (inMouth && b.z < GOAL_H - 2 && room.state === 'play') return goal(room, s < 0 ? 1 : 0);
  }
  if (room.state !== 'play') return;
  if (b.y < -BALL_R * 2 || b.y > H + BALL_R * 2) return outOfPlay(room, 'throw');
  if (b.x < -BALL_R * 2 || b.x > W + BALL_R * 2) return outOfPlay(room, 'line');
}

// El palo avisa al renderer de un arquero cercano; nunca altera su estado dive/run.
function postFX(room,x,y){
  const keeper=room.players.find(p=>p.kind==='gk'&&dist(p.x,p.y,x,y)<95);
  return {x:r1(x),y:r1(y),keeper:keeper?.id||0};
}

function checkTouches(room) {
  const b = room.ball;
  if (b.owner || b.inNet) return;
  let p = null, bestD = Infinity;
  for (const q of room.players) {
    if (q.touchCool > 0 || ['down', 'recover', 'slide'].includes(q.st)) continue;
    const recv = isReceiver(room, q); // el destinatario del pase controla con más radio (pecho/muslo)
    const reach = q.kind === 'gk' ? 18 : recv ? 17 : 13;
    const maxZ = q.kind === 'gk' ? 36 : q.queued ? 40 : recv ? 24 : 14;
    const d = dist(q.x, q.y, b.x, b.y);
    if (d < reach && b.z < maxZ && d < bestD) { p = q; bestD = d; }
  }
  if (!p) return;
  const spd = Math.hypot(b.vx, b.vy);
  b.lastTeam = p.team; b.lastPlayer = p.id;
  if (p.kind === 'gk') {
    const side = p.team === 0 ? 1 : -1, diving = p.st === 'dive';
    if (b.vx * side < 0 && spd > 12 && bestD > (diving ? 14 : 11) && Math.random() < 0.45) {
      b.vx *= 0.8; b.vy += rnd(-1.2, 1.2); p.touchCool = 40; // la roza con la punta de los dedos
      return;
    }
    if (spd > 9.5 || (diving && spd > 6)) { // despeja con los puños hacia afuera
      b.vx = side * rnd(1.5, 4); b.vy = (b.y < p.y ? -1 : 1) * rnd(3, 6); b.vz = rnd(1.5, 4); b.spin = 0;
      p.touchCool = 25;
      emitEv(room, { type: 'save', id: p.id, catch: false });
      return;
    }
    b.owner = p; b.z = 0; b.vx = b.vy = b.vz = 0; b.spin = 0;
    p.st = 'hold'; p.stT = hasHuman(room, p.team) ? HOLD_T : 50; p.vx = p.vy = 0; p.face = p.team === 0 ? 0 : Math.PI;
    emitEv(room, { type: 'save', id: p.id, catch: true, team: p.team });
    return;
  }
  if (p.queued) {
    const q = p.queued, head = b.z > 18;
    if (q === 'shoot') emitEv(room, { type: 'skill', id: p.id, name: head ? '¡DE CABEZA!' : b.z > 5 ? '¡DE VOLEA!' : '¡A LA PRIMERA!' });
    const aim = p.lastDir.x || p.lastDir.y ? Math.atan2(p.lastDir.y, p.lastDir.x) : p.face;
    if (q === 'shoot') doShoot(room, p, 0.55, head);
    else doPass(room, p, aim, 'auto');
    return;
  }
  if (spd > 12.5 && Math.random() < 0.35) {
    b.vx = -b.vx * 0.25 + rnd(-2, 2); b.vy = -b.vy * 0.25 + rnd(-2, 2);
    p.touchCool = 10;
    emitEv(room, {type:'skill',id:p.id,faceHit:p.id,name:'¡PLOP!'});
    return;
  }
  b.owner = p; b.z = 0; b.vz = 0;
}

function checkSlides(room) {
  const b = room.ball;
  for (const s of room.players) {
    if (s.st !== 'slide' || s.stT < 4) continue;
    const fx = Math.cos(s.face), fy = Math.sin(s.face);
    const footX = s.x + fx * 10, footY = s.y + fy * 10;
    if (!s.slideClean && b.z < 9 && !b.inNet && dist(footX, footY, b.x, b.y) < 13) {
      const prev = b.owner;
      if (prev && prev.team !== s.team && (prev.st === 'spin' || prev.st === 'croq' || prev.st === 'hold')) continue; // regate esquiva la barrida
      if (prev && prev.team !== s.team) {
        const fromBehind = fx * Math.cos(prev.face) + fy * Math.sin(prev.face) > 0.6 && (prev.x - s.x) * fx + (prev.y - s.y) * fy > 0;
        if (fromBehind) return foul(room, s, prev);
        prev.st = 'recover'; prev.stT = 16; prev.charging = false;
      }
      b.owner = null; s.slideClean = true;
      b.vx = fx * 5.5 + rnd(-1.5, 1.5); b.vy = fy * 5.5 + rnd(-1.5, 1.5); b.vz = 0.8;
      b.lastTeam = s.team; b.lastPlayer = s.id;
      emitEv(room, { type: 'tackle', id: s.id, x: r1(b.x), y: r1(b.y) });
    }
    for (const o of room.players) {
      if (o.team === s.team || o.st === 'down' || o.st === 'slide') continue;
      if (dist(footX, footY, o.x, o.y) > 15 && dist(s.x, s.y, o.x, o.y) > 14) continue;
      if (o.st === 'spin' || o.st === 'croq') continue;
      if (s.slideClean) { emitEv(room, {type:'tackle',id:s.id,victim:o.id,x:r1(o.x),y:r1(o.y),fall:fallFX(room,s,o,30)}); o.st = 'down'; o.stT = 30; o.charging = false; if (b.owner === o) b.owner = null; continue; }
      return foul(room, s, o);
    }
  }
}

function collidePlayers(room) {
  const ps = room.players;
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i], c = ps[j];
    if (a.st === 'down' || c.st === 'down') continue;
    const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
    if (d >= PR * 2 || d === 0) continue;
    const nx = dx / d, ny = dy / d, ov = PR * 2 - d;
    const sa = Math.hypot(a.vx, a.vy), sc = Math.hypot(c.vx, c.vy);
    let contacts=visualContacts.get(room);
    if(!contacts){contacts=new Map();visualContacts.set(room,contacts);}
    const pair=a.id+':'+c.id;
    if(sa+sc>1.4&&room.tick-(contacts.get(pair)??-100)>24){
      contacts.set(pair,room.tick);
      emitEv(room,{type:'shoulder',id:a.id,victim:c.id,visualOnly:true,x:r1((a.x+c.x)/2),y:r1((a.y+c.y)/2),dx:r1(nx),dy:r1(ny)});
    }
    const wa = (sc + 0.5) / (sa + sc + 1); // el más rápido empuja más (inercia)
    a.x -= nx * ov * wa; a.y -= ny * ov * wa;
    c.x += nx * ov * (1 - wa); c.y += ny * ov * (1 - wa);
    if (a.team !== c.team && room.state === 'play') shoulder(room, a, c, sa, sc);
  }
}

function shoulder(room, a, c, sa, sc) {
  const b = room.ball;
  let owner, ch, so, sch;
  if (b.owner === a) { owner = a; ch = c; so = sa; sch = sc; }
  else if (b.owner === c) { owner = c; ch = a; so = sc; sch = sa; }
  else return;
  if (owner.kind === 'gk' || ch.kind === 'gk' || ch.st !== 'run' || owner.st === 'spin' || owner.st === 'croq') return;
  if (sch < 1) return;
  const chance = 0.003 + Math.max(0, sch - so) * 0.012 + (ch.sprinting ? 0.006 : 0);
  if (Math.random() < chance) {
    b.owner = ch; b.lastTeam = ch.team; b.lastPlayer = ch.id;
    owner.st = 'recover'; owner.stT = 12; owner.charging = false;
    emitEv(room, { type: 'shoulder', id: ch.id, victim:owner.id, x:r1(owner.x),y:r1(owner.y),dx:r1((owner.x-ch.x)/Math.max(1,dist(owner.x,owner.y,ch.x,ch.y))),dy:r1((owner.y-ch.y)/Math.max(1,dist(owner.x,owner.y,ch.x,ch.y))) });
  }
}

function pushOut(p, x, y, r) {
  let dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy);
  if (d >= r) return;
  if (d < 1) { dx = p.team === 0 ? -1 : 1; dy = 0; d = 1; }
  p.x = x + (dx / d) * r; p.y = y + (dy / d) * r;
}

function enforceSetPiece(room) {
  const sp = room.sp, b = room.ball;
  sp.t++;
  const right = sp.x > CX;
  for (const p of room.players) {
    if (p === sp.taker) continue;
    if (sp.type === 'kickoff') p.x = p.team === 0 ? Math.min(p.x, CX - 4) : Math.max(p.x, CX + 4);
    if (sp.type === 'penalty') {
      if (p.kind === 'gk') { if (p.team !== sp.team) p.x = right ? W - 6 : 6; continue; }
      if (p.y > BOX_TOP && p.y < BOX_BOT && (right ? p.x > W - BOX_D : p.x < BOX_D)) p.x = right ? W - BOX_D - 2 : BOX_D + 2;
    } else if (p.team !== sp.team) pushOut(p, b.x, b.y, sp.r);
  }
  if (sp.taker.sid && sp.t > TICK * 8 && b.owner === sp.taker) sp.taker.pressed |= B.PASS;
}

// ---------- Tick ----------
function step(room) {
  usePitch(room);
  room.tick++;
  if (room.paused) return; // pausa del anfitrión: el reloj de red sigue, el partido no
  if (room.state === 'lobby' || room.state === 'ended') return;
  if (room.state === 'goal') {
    for (const p of room.players) {
      p.pressed = 0; p.released = 0;
      p.vx *= 0.92; p.vy *= 0.92; p.x += p.vx; p.y += p.vy;
      if (p.stT > 0 && --p.stT === 0) p.st = 'run';
    }
    updateBall(room);
    if (--room.goalT <= 0) kickoff(room, room.kickTeam);
    return;
  }
  room.timeLeft--;
  for (const p of room.players) if (!p.sid) (p.kind === 'gk' ? gkAI : fieldAI)(room, p);
  gkHumanKick(room);
  for (const p of room.players) updatePlayer(room, p);
  if (room.state === 'setpiece' && room.ball.owner !== room.sp.taker) { room.state = 'play'; room.sp = null; }
  collidePlayers(room);
  if (room.state === 'setpiece') enforceSetPiece(room);
  const g = room.ball.owner;
  if (g && g.st === 'hold') for (const o of room.players) if (o.team !== g.team) pushOut(o, g.x, g.y, 55);
  updateBall(room);
  if (room.state === 'play') { checkTouches(room); checkSlides(room); }
  if (room.ball.owner) room.ball.owner.callT = 0;
  if (room.pass && (room.ball.owner || --room.pass.t <= 0)) room.pass = null;
  if (room.timeLeft <= 0 && (room.state === 'play' || room.state === 'setpiece')) endMatch(room);
}

function snapshot(room) {
  usePitch(room);
  const b = room.ball;
  const s = {
    t: room.tick, s: room.state, tl: Math.max(0, Math.ceil(room.timeLeft / TICK)), sc: room.score,
    b: [r1(b.x), r1(b.y), r1(b.z)], o: b.owner ? b.owner.id : 0,
    p: room.players.map(p => [
      p.id, r1(p.x), r1(p.y), Math.round(normAng(p.face) * 100) / 100, ST[p.st], Math.round(p.stamina),
      Math.round(p.charge * 100), (p.tired ? 1 : 0) | (p.sprinting ? 2 : 0) | (p.kickT > 0 ? 4 : 0) | (p.boostT > 0 ? 8 : 0)
        | (p.callT > 0 && b.owner !== p && room.state === 'play' ? 16 : 0)
        | (p.kickT > 0 && p.kickKind === 'pass' ? 32 : 0),
    ]),
  };
  // rp: destinatario del pase en curso · pt: a quién iría el pase del humano con balón (vista previa)
  if (room.pass) s.rp = room.pass.to;
  const o = b.owner;
  if (o && o.sid && o.kind === 'field') {
    const d = o.lastDir, m = findMate(room, o, d.x || d.y ? Math.atan2(d.y, d.x) : o.face);
    if (m) s.pt = m.id;
  }
  if (room.events.length) { s.e = room.events; room.events = []; }
  return s;
}

// ---------- Red ----------
io.on('connection', socket => {
  let room = null;

  const leave = keep => {
    if (!room) return;
    const r = room;
    room = null;
    socket.leave(r.code);
    r.members.delete(socket.id);
    const pl = r.players.find(p => p.sid === socket.id);
    if (pl) { Object.assign(pl, { sid: null, name: 'CPU', input: 0, pressed: 0, released: 0 }); emitRoster(r); }
    if (!r.members.size) {
      if (keep) r.dropT = setTimeout(() => { if (!r.members.size) rooms.delete(r.code); }, ROOM_GRACE_MS);
      else rooms.delete(r.code);
      return;
    }
    if (r.host === socket.id) r.host = r.members.keys().next().value;
    broadcastRoom(r);
  };

  const join = (r, profile, cid, pref) => {
    // Misma pestaña que vuelve tras un corte: se va la conexión vieja para recuperar su lugar.
    cid = typeof cid === 'string' ? cid.slice(0, 32) : '';
    for (const [sid, m] of r.members) if (cid && m.cid === cid && sid !== socket.id) io.sockets.sockets.get(sid)?.disconnect(true);
    clearTimeout(r.dropT);
    room = r;
    socket.join(r.code);
    if (!r.hostCid) r.hostCid = cid;
    if ((cid && cid === r.hostCid) || !r.members.has(r.host)) r.host = socket.id;
    const counts = [0, 0];
    for (const m of r.members.values()) counts[m.team]++;
    const team = (pref === 0 || pref === 1) && counts[pref] < r.mode ? pref : counts[0] <= counts[1] ? 0 : 1;
    r.members.set(socket.id, { ...cleanProfile(profile), team, cid });
    if (r.state !== 'lobby') { claimBot(r, socket.id); emitRoster(r); }
    broadcastRoom(r);
  };

  socket.on('create', (data, cb) => {
    if (typeof cb !== 'function') return;
    data = data || {};
    leave();
    const mode = MODES.includes(data.mode) ? data.mode : 2;
    const minutes = [3, 5].includes(data.minutes) ? data.minutes : 3;
    const pitch = PITCHES[data.pitch] ? data.pitch : 0;
    const r = newRoom(socket.id, mode, minutes, pitch);
    join(r, data.profile, data.cid);
    cb({ ok: true, code: r.code });
  });

  socket.on('join', (data, cb) => {
    if (typeof cb !== 'function') return;
    data = data || {};
    const code = String(data.code || '').toUpperCase().trim().slice(0, 4);
    const r = rooms.get(code);
    if (!r) return cb({ ok: false, error: 'Sala no encontrada' });
    if (r.members.size >= 22) return cb({ ok: false, error: 'Sala llena' });
    if (room === r) return cb({ ok: true, code });
    leave();
    join(r, data.profile, data.cid, data.team);
    cb({ ok: true, code });
  });

  socket.on('profile', prof => {
    if (!room) return;
    const m = room.members.get(socket.id);
    if (!m) return;
    Object.assign(m, cleanProfile(prof));
    const pl = room.players.find(p => p.sid === socket.id);
    if (pl) { Object.assign(pl, { name: m.name, num: m.num }); emitRoster(room); }
    broadcastRoom(room);
  });

  socket.on('team', team => {
    if (!room || room.state !== 'lobby' || (team !== 0 && team !== 1)) return;
    const m = room.members.get(socket.id);
    const count = [...room.members.values()].filter(x => x.team === team).length;
    if (m.team === team || count >= room.mode) return;
    m.team = team;
    broadcastRoom(room);
  });

  socket.on('settings', data => {
    if (!room || room.host !== socket.id || room.state !== 'lobby' || !data) return;
    if (MODES.includes(data.mode)) room.mode = data.mode;
    if (Number.isInteger(data.pitch) && PITCHES[data.pitch]) room.pitch = data.pitch;
    if ([3, 5].includes(data.minutes)) room.minutes = data.minutes;
    const t = data.teams;
    if (Array.isArray(t) && t.length === 2 && t.every(i => Number.isInteger(i) && i >= 0 && i < TEAMS.length) && t[0] !== t[1]) room.teams = [t[0], t[1]];
    broadcastRoom(room);
  });

  socket.on('start', () => {
    if (!room || room.host !== socket.id || !(room.state === 'lobby' || room.state === 'ended')) return;
    startMatch(room);
  });

  socket.on('pause', on => {
    if (!room || room.host !== socket.id || room.state === 'lobby' || room.state === 'ended') return;
    room.paused = !!on;
    // lo apretado durante la pausa no se ejecuta al volver
    for (const p of room.players) { p.pressed = p.released = 0; }
    broadcastRoom(room);
  });

  socket.on('toLobby', () => {
    if (!room || room.host !== socket.id) return;
    room.paused = false;
    room.state = 'lobby';
    room.sp = null;
    broadcastRoom(room);
  });

  socket.on('input', bits => {
    if (!room || typeof bits !== 'number') return;
    const p = room.players.find(q => q.sid === socket.id);
    if (!p) return;
    bits &= INPUT_MASK;
    p.pressed |= bits & ~p.input;
    p.released |= p.input & ~bits;
    p.input = bits;
  });

  socket.on('lat', cb => { if (typeof cb === 'function') cb(); });
  socket.on('leave', () => leave());
  socket.on('disconnect', () => leave(true));
});

// ---------- Auto-prueba (npm test) ----------
function selfTest() {
  const assert = require('assert');
  // 1) Barra de potencia: raso y colocado entran bajo el travesaño, barra llena se va por arriba.
  for (const [power, over] of [[0.2, false], [0.6, false], [1.0, true]]) {
    const r = newRoom('t', 1, 3);
    const p = makePlayer(r, 0, 'field', cleanProfile({}), null);
    r.players = [p];
    r.state = 'play';
    p.x = W - 260; p.y = CY; p.face = 0;
    r.ball.x = p.x + 11; r.ball.y = p.y; r.ball.owner = p;
    doShoot(r, p, power, false);
    let z = null;
    for (let i = 0; i < 300 && z === null; i++) {
      const px = r.ball.x, pz = r.ball.z;
      updateBall(r);
      if (px <= W && (r.ball.x > W || r.ball.inNet || r.ball.vx < 0)) z = pz;
    }
    assert(z !== null, `tiro ${power} no llegó a la línea`);
    assert.strictEqual(z > GOAL_H - 2, over, `tiro ${power}: altura ${z.toFixed(1)}`);
    rooms.delete(r.code);
  }
  // 2) Barrida por detrás sin tocar balón = falta y tiro libre para el rival.
  {
    const r = newRoom('t', 1, 3);
    startMatch(r);
    r.state = 'play'; r.sp = null;
    const [att, , def] = r.players;
    att.x = 600; att.y = 300; att.face = 0; att.st = 'run'; r.ball.owner = att;
    def.x = 584; def.y = 300; def.st = 'slide'; def.stT = 20; def.face = 0;
    r.ball.x = 660;
    checkSlides(r);
    assert.strictEqual(r.state, 'setpiece');
    assert.strictEqual(r.sp.type, 'free');
    assert.strictEqual(r.sp.team, att.team);
    rooms.delete(r.code);
  }
  // 3) Arquero: ataja un tiro suave y, con un humano en su equipo, saca cuando éste pulsa S.
  {
    const r = newRoom('t', 1, 3);
    startMatch(r);
    r.state = 'play'; r.sp = null;
    const gk = r.players.find(p => p.kind === 'gk' && p.team === 0);
    const mate = r.players.find(p => p.kind === 'field' && p.team === 0);
    mate.sid = 'h';
    Object.assign(r.ball, { owner: null, x: gk.x + 40, y: gk.y, z: 0, vx: -6, vy: 0, vz: 0 });
    for (let i = 0; i < 20 && r.ball.owner !== gk; i++) { updateBall(r); checkTouches(r); }
    assert.strictEqual(r.ball.owner, gk, 'el arquero no atajó');
    assert.strictEqual(gk.st, 'hold');
    gk.stT = HOLD_T - 20; mate.pressed = B.PASS;
    gkHumanKick(r);
    assert.strictEqual(r.ball.owner, null, 'el arquero no sacó');
    rooms.delete(r.code);
  }
  // 4) Pase asistido: apuntando 30° desviado, el balón llega al compañero (humano quieto que corta solo).
  for (const kind of ['ground', 'through', 'lob', 'auto']) {
    const r = newRoom('t', 2, 3);
    r.state = 'play';
    const p = makePlayer(r, 0, 'field', cleanProfile({}), 'a');
    const mate = makePlayer(r, 0, 'field', cleanProfile({}), 'h');
    const opp = makePlayer(r, 1, 'field', cleanProfile({}), null);
    r.players = [p, mate, opp];
    Object.assign(p, { x: 300, y: 320, face: 0 });
    Object.assign(mate, { x: 560, y: 420 });
    Object.assign(opp, { x: 100, y: 100 });
    Object.assign(r.ball, { owner: p, x: 311, y: 320 });
    doPass(r, p, Math.atan2(100, 260) - 0.5, kind);
    assert.strictEqual(r.pass && r.pass.to, mate.id, `${kind}: no eligió al compañero`);
    assert(snapshot(r).p.find(q => q[0] === p.id)[7] & 32, 'el snapshot debe distinguir pase de tiro para el clip pass');
    for (let i = 0; i < 240 && r.ball.owner !== mate; i++) { updatePlayer(r, mate); updateBall(r); checkTouches(r); }
    assert.strictEqual(r.ball.owner, mate, `${kind}: el pase no llegó`);
    rooms.delete(r.code);
  }
  // 4b) Pase automático: lejos va bombeado, cerca y libre va raso; PASE pegado al rival con pelota barre.
  {
    const r = newRoom('t', 2, 3);
    r.state = 'play';
    const p = makePlayer(r, 0, 'field', cleanProfile({}), 'a');
    const mate = makePlayer(r, 0, 'field', cleanProfile({}), null);
    const opp = makePlayer(r, 1, 'field', cleanProfile({}), null);
    r.players = [p, mate, opp];
    Object.assign(p, { x: 300, y: 320 });
    Object.assign(opp, { x: 100, y: 100 });
    Object.assign(mate, { x: 400, y: 320, vx: 0 });
    assert.strictEqual(autoKind(r, p, mate), 'ground');
    Object.assign(mate, { x: 700, y: 320 });
    assert.strictEqual(autoKind(r, p, mate), 'lob');
    Object.assign(opp, { x: 300, y: 300 });
    Object.assign(r.ball, { owner: opp, x: 311, y: 300 });
    p.pressed = B.PASS; updatePlayer(r, p);
    assert.strictEqual(p.st, 'slide', 'PASE junto al rival con pelota debe barrer');
    assert.strictEqual(p.callT, 0, 'barrer no es pedirla');
    rooms.delete(r.code);
  }
  // 5) PASE sin pelota: pedido compartido, sin pase accidental, con duración y enfriamiento.
  for (const button of [B.PASS]) {
    const r = newRoom('t', 2, 3);
    r.state = 'play';
    const p = makePlayer(r, 0, 'field', cleanProfile({}), 'human');
    const mate = makePlayer(r, 0, 'field', cleanProfile({}), 'mate');
    r.players = [p, mate];
    p.x = 300; mate.x = 550;
    Object.assign(r.ball, { owner: mate, x: 561, y: CY });
    p.input = p.pressed = button;
    updatePlayer(r, p);
    assert.strictEqual(p.callT, CALL_T, 'no pidió la pelota');
    assert.strictEqual(p.queued, null, 'pedirla no debe preparar un pase accidental');
    assert(snapshot(r).p.find(q => q[0] === p.id)[7] & 16, 'el pedido no se transmite a los compañeros');
    for (let i = 0; i < CALL_T; i++) updatePlayer(r, p);
    assert.strictEqual(p.callT, 0, 'mantener el botón no debe repetir el pedido');
    p.pressed = button; updatePlayer(r, p);
    assert.strictEqual(p.callT, 0, 'el enfriamiento debe impedir repetir el pedido');
    for (let i = 0; i < CALL_COOL; i++) updatePlayer(r, p);
    p.pressed = button; updatePlayer(r, p);
    assert.strictEqual(p.callT, CALL_T, 'debe poder volver a pedirla');
    r.ball.owner = p; updatePlayer(r, p);
    assert.strictEqual(p.callT, 0, 'el pedido debe terminar al recibir la pelota');
    assert.strictEqual(snapshot(r).p[0][7] & 16, 0);
    p.pressed = button; updatePlayer(r, p);
    assert.strictEqual(r.ball.owner, null, 'con pelota el botón debe seguir haciendo un pase');
    assert.strictEqual(p.callT, 0);
    // El pase de primera sigue disponible cuando la pelota ya viene hacia el jugador.
    r.ball.owner = null; r.pass = { to: p.id, x: p.x, y: p.y, t: 100 };
    p.pressed = button; updatePlayer(r, p);
    assert.strictEqual(p.queued, 'pass');
    // Con la pelota del rival no se pide: PASE barre, aunque esté lejos.
    r.pass = null; mate.team = 1; r.ball.owner = mate;
    p.callCool = 0; p.pressed = button; updatePlayer(r, p);
    assert.strictEqual(p.callT, 0, 'no se pide mientras la tiene el rival');
    assert.strictEqual(p.st, 'slide', 'PASE con la pelota del rival debe barrer');
    p.st = 'run'; p.stT = 0; mate.team = 0;
    p.callCool = 0; p.pressed = button; updatePlayer(r, p);
    assert.strictEqual(p.callT, CALL_T);
    assert.strictEqual(p.queued, null, 'pedirla debe cancelar un toque pendiente de una jugada anterior');
    setPiece(r, 'free', 0, 400, CY);
    assert(r.players.every(q => q.callT === 0), 'una interrupción debe cancelar los pedidos');
    p.callCool = 0; p.pressed = button; updatePlayer(r, p);
    assert.strictEqual(p.callT, 0, 'no se debe pedir durante una interrupción');
    rooms.delete(r.code);
  }
  // 5b) Remate que roza el arquero y entra: gol del que pateó, no autogol. Despeje propio al arco: autogol.
  {
    const r = newRoom('t', 1, 3);
    r.state = 'play';
    const att = makePlayer(r, 0, 'field', cleanProfile({ name: 'Ata' }), null);
    const gk = makePlayer(r, 1, 'gk', cleanProfile({ name: 'Arq' }), null);
    r.players = [att, gk];
    kickBall(r, att, 10, 0, 0, 0);
    r.ball.lastPlayer = gk.id; r.ball.lastTeam = 1; // roce del arquero
    goal(r, 0);
    let ev = r.events.find(e => e.type === 'goal');
    assert.strictEqual(ev.own, false, 'un roce del arquero no es autogol');
    assert.strictEqual(ev.scorer, 'Ata');
    r.events = []; r.ball.inNet = false;
    kickBall(r, gk, -10, 0, 0, 0);
    goal(r, 0);
    ev = r.events.find(e => e.type === 'goal');
    assert.strictEqual(ev.own, true, 'patearla al propio arco sí es autogol');
    rooms.delete(r.code);
  }
  // 6) Partidos completos solo con bots: sin NaN y terminan.
  for (const [mode, pitch] of [[1, 0], [2, 0], [3, 0], [4, 2], [6, 1], [10, 0]]) {
    const r = newRoom('t', mode, 3, pitch);
    startMatch(r);
    const kinds = new Set();
    let guard = 0;
    while (r.state !== 'ended' && guard++ < TICK * 60 * 6) {
      step(r);
      for (const e of snapshot(r).e || []) kinds.add(e.type);
      assert(Number.isFinite(r.ball.x + r.ball.y + r.ball.z), 'balón NaN');
      for (const p of r.players) assert(Number.isFinite(p.x + p.y + p.face), 'jugador NaN');
    }
    assert.strictEqual(r.state, 'ended');
    console.log(`${mode}v${mode} ${PITCHES[pitch].name} bots: ${r.score.join('-')} | eventos: ${[...kinds].join(', ')}`);
    rooms.delete(r.code);
  }
  console.log('selftest OK');
  process.exit(0);
}

if (process.argv.includes('--selftest')) selfTest();
else {
  let last = process.hrtime.bigint();
  setInterval(() => {
    const now = process.hrtime.bigint();
    const elapsed = Number(now - last) / 1e6;
    last = now;
    for (const room of rooms.values()) {
      if (room.state === 'lobby' || room.state === 'ended') continue;
      try {
        room.acc = Math.min(room.acc + elapsed, 250);
        let stepped = false;
        while (room.acc >= DT_MS) { room.acc -= DT_MS; step(room); stepped = true; }
        if (stepped && room.tick - (room.sentTick || 0) >= SEND_EVERY) { room.sentTick = room.tick; io.to(room.code).emit('s', snapshot(room)); }
      } catch (e) {
        // Un error en una sala no tira el servidor entero: esa sala vuelve al lobby.
        console.error(`Error en sala ${room.code}:`, e);
        room.state = 'lobby'; room.sp = null; broadcastRoom(room);
      }
    }
  }, 4);
  process.on('uncaughtException', e => console.error('Error no capturado:', e));
  server.listen(PORT, () => console.log(`Garra FC en http://localhost:${PORT}`));
}
