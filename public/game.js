'use strict';
(() => {
  // ---------- Constantes (espejo de server.js) ----------
  const W = 1000, H = 640, CX = W / 2, CY = H / 2;
  const GOAL_TOP = 270, GOAL_BOT = 370, GOAL_H = 44, GOAL_DEPTH = 26;
  const BOX_D = 160, BOX_TOP = 150, BOX_BOT = 490, PEN_SPOT = 115;
  const TICK_MS = 1000 / 60, INTERP = 4, VIEW_H = 360, FM = 110, FS = 2;
  const B = { UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, SPRINT: 16, MOD: 32, TACKLE: 64, PASS: 128, THROUGH: 256, LOB: 512, SHOOT: 1024 };
  const ST_NAMES = ['run', 'slide', 'recover', 'down', 'spin', 'croq', 'step', 'fake', 'rainbow', 'fooled', 'hold', 'dive'];
  const KEYMAP = {
    ArrowUp: B.UP, ArrowDown: B.DOWN, ArrowLeft: B.LEFT, ArrowRight: B.RIGHT, Space: B.SPRINT,
    KeyE: B.MOD, ShiftLeft: B.MOD, ShiftRight: B.MOD, KeyQ: B.TACKLE, KeyS: B.PASS, KeyW: B.THROUGH, KeyA: B.LOB, KeyD: B.SHOOT,
  };

  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[(Math.random() * arr.length) | 0];
  const lerp = (a, b, k) => a + (b - a) * k;
  const angLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

  // ---------- Perfil local ----------
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
  };
  const profile = Object.assign({ name: '', num: 10 }, store.get('garra-profile') || {});

  // ---------- Audio sintetizado (Web Audio API) ----------
  const audio = (() => {
    let ac = null, master = null, noiseBuf = null, crowd = null, muted = false;
    function init() {
      if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.7;
      master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    function env(t, peak, a, d) {
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
      g.connect(master);
      return g;
    }
    function noise(t, dur, type, f0, f1, q, peak, a = 0.005) {
      const src = ac.createBufferSource();
      src.buffer = noiseBuf; src.loop = true;
      const f = ac.createBiquadFilter();
      f.type = type; f.Q.value = q;
      f.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + a + dur);
      src.connect(f); f.connect(env(t, peak, a, dur));
      src.start(t, Math.random() * 1.5);
      src.stop(t + a + dur + 0.05);
    }
    function osc(t, type, f0, f1, dur, peak, a = 0.005) {
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + a + dur);
      o.connect(env(t, peak, a, dur));
      o.start(t); o.stop(t + a + dur + 0.05);
    }
    return {
      init,
      toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.7; return muted; },
      whistle(n = 1, vol = 0.6) {
        if (!ac) return;
        let t = ac.currentTime;
        for (let i = 0; i < n; i++) {
          const len = n > 1 && i === n - 1 ? 0.8 : 0.3;
          const g = ac.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.16 * vol, t + 0.02);
          g.gain.setValueAtTime(0.16 * vol, t + len - 0.06);
          g.gain.exponentialRampToValueAtTime(0.0001, t + len);
          g.connect(master);
          const lfo = ac.createOscillator(), lg = ac.createGain();
          lfo.frequency.value = 32; lg.gain.value = 110; lfo.connect(lg);
          for (const f of [2700, 2780]) {
            const o = ac.createOscillator();
            o.frequency.value = f; lg.connect(o.frequency); o.connect(g);
            o.start(t); o.stop(t + len + 0.02);
          }
          lfo.start(t); lfo.stop(t + len + 0.02);
          t += len + 0.12;
        }
      },
      kick(p = 0.5) { if (!ac) return; const t = ac.currentTime; osc(t, 'sine', 160, 45, 0.12, 0.3 + p * 0.5); noise(t, 0.04, 'highpass', 1800, 1800, 0.7, 0.15 + p * 0.25); },
      slide() { if (ac) noise(ac.currentTime, 0.45, 'bandpass', 1400, 300, 0.9, 0.35, 0.02); },
      tackle() { if (!ac) return; const t = ac.currentTime; osc(t, 'sine', 120, 40, 0.18, 0.7); noise(t, 0.08, 'lowpass', 900, 300, 0.7, 0.4); },
      thud() { if (ac) osc(ac.currentTime, 'sine', 95, 50, 0.16, 0.5); },
      swish() { if (ac) noise(ac.currentTime, 0.18, 'bandpass', 600, 2600, 2, 0.18, 0.02); },
      post() {
        if (!ac) return;
        const t = ac.currentTime;
        [523, 1187, 1873, 2650].forEach((f, i) => osc(t, 'sine', f, f * 0.995, 0.9 - i * 0.15, 0.25 / (i + 1), 0.002));
        noise(t, 0.03, 'highpass', 3000, 3000, 0.7, 0.3);
      },
      cheer() { if (!ac) return; const t = ac.currentTime; noise(t, 3.5, 'bandpass', 900, 700, 0.6, 0.5, 0.35); noise(t + 0.1, 2.8, 'highpass', 2500, 1800, 0.5, 0.12, 0.3); },
      ooh() { if (ac) noise(ac.currentTime, 1.2, 'bandpass', 500, 350, 3, 0.3, 0.15); },
      crowdStart() {
        if (!ac || crowd) return;
        const src = ac.createBufferSource();
        src.buffer = noiseBuf; src.loop = true;
        const f = ac.createBiquadFilter();
        f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.4;
        const g = ac.createGain();
        g.gain.value = 0.045;
        src.connect(f); f.connect(g); g.connect(master);
        src.start();
        crowd = src;
      },
      crowdStop() { if (crowd) { crowd.stop(); crowd = null; } },
    };
  })();

  // ---------- Pantallas ----------
  const inGame = () => $('game').classList.contains('active');
  function show(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id);
    if (id === 'game') resize();
    else releaseAll();
  }
  const msg = (id, text) => { $(id).textContent = text; };

  // ---------- Red ----------
  const socket = io();
  let roomInfo = null, roster = new Map(), myPid = 0, snaps = [], tickOffset = null, lastState = '';
  let endTimer = 0;

  function readProfile() {
    profile.name = $('name').value.trim().slice(0, 12) || 'Jugador';
    profile.num = clamp(parseInt($('num').value, 10) || 10, 1, 99);
    store.set('garra-profile', profile);
  }

  function onJoined(res) {
    if (!res || !res.ok) return msg('menuMsg', (res && res.error) || 'No se pudo entrar a la sala');
    msg('menuMsg', '');
    history.replaceState(null, '', '#' + res.code);
  }

  socket.on('connect_error', () => msg('menuMsg', 'Sin conexión con el servidor…'));
  socket.on('disconnect', () => {
    roomInfo = null; snaps = []; tickOffset = null;
    show('menu');
    msg('menuMsg', 'Conexión perdida. Vuelve a entrar con el código.');
    audio.crowdStop();
  });

  socket.on('room', info => {
    roomInfo = info;
    $('roomCode').textContent = info.code;
    $('hudCode').textContent = info.code;
    clearTimeout(endTimer);
    if (info.state === 'lobby') { show('lobby'); hideEnd(); stopReplay(); audio.crowdStop(); }
    else {
      if (!inGame()) show('game');
      if (info.state === 'ended') endTimer = setTimeout(showEnd, 1500);
      else hideEnd();
    }
    renderLobby();
  });

  socket.on('roster', list => {
    roster = new Map(list.map(p => [p.id, p]));
    const me = list.find(p => p.sid === socket.id);
    myPid = me ? me.id : 0;
  });

  socket.on('s', s => {
    const last = snaps[snaps.length - 1];
    if (last && s.t <= last.t) {
      if (last.t - s.t < 60) return;
      snaps = [];
    }
    const off = performance.now() / TICK_MS - s.t;
    if (tickOffset === null || Math.abs(off - tickOffset) > 20) tickOffset = off;
    else tickOffset += (off - tickOffset) * 0.03;
    snaps.push(s);
    if (snaps.length > 600) snaps.splice(0, snaps.length - 600);
    if (s.e) for (const e of s.e) handleEvent(e, s);
    if (s.s !== lastState) {
      if (lastState === 'goal') stopReplay();
      lastState = s.s;
    }
    updateHud(s);
  });

  // ---------- Menú y lobby ----------
  $('name').value = profile.name;
  $('num').value = profile.num;
  if (/^#[A-Za-z0-9]{4}$/.test(location.hash)) $('joinCode').value = location.hash.slice(1).toUpperCase();

  $('btnCreate').onclick = () => {
    audio.init(); readProfile();
    socket.emit('create', { mode: +$('mode').value, minutes: +$('minutes').value, profile }, onJoined);
  };
  $('btnJoin').onclick = () => {
    const code = $('joinCode').value.trim().toUpperCase();
    if (code.length !== 4) return msg('menuMsg', 'El código tiene 4 caracteres');
    audio.init(); readProfile();
    socket.emit('join', { code, profile }, onJoined);
  };
  $('joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnJoin').click(); });

  $('num').addEventListener('input', () => { readProfile(); socket.emit('profile', profile); drawKit(); });
  for (const btn of document.querySelectorAll('.joinTeam')) btn.onclick = () => socket.emit('team', +btn.dataset.team);
  $('lobbyMode').onchange = () => socket.emit('settings', { mode: +$('lobbyMode').value });
  $('lobbyMinutes').onchange = () => socket.emit('settings', { minutes: +$('lobbyMinutes').value });
  for (const t of [0, 1]) {
    const sel = $('teamSel' + t);
    TEAMS.forEach((tm, i) => sel.add(new Option(tm.name, i)));
    sel.onchange = () => socket.emit('settings', { teams: [+$('teamSel0').value, +$('teamSel1').value] });
  }
  $('btnStart').onclick = () => { audio.init(); socket.emit('start'); };
  $('btnRematch').onclick = () => socket.emit('start');
  $('btnBackLobby').onclick = () => socket.emit('toLobby');
  $('btnLeave').onclick = () => {
    socket.emit('leave');
    roomInfo = null;
    history.replaceState(null, '', location.pathname);
    show('menu');
  };
  $('btnCopy').onclick = () => {
    if (!roomInfo) return;
    const url = `${location.origin}${location.pathname}#${roomInfo.code}`;
    navigator.clipboard.writeText(url).then(
      () => msg('lobbyMsg', '¡Enlace copiado! Compártelo con tus amigos.'),
      () => msg('lobbyMsg', `Código: ${roomInfo.code}`),
    );
  };

  function renderLobby() {
    const r = roomInfo;
    if (!r) return;
    const isHost = r.host === socket.id;
    const me = r.members.find(m => m.id === socket.id);
    for (const t of [0, 1]) {
      const ul = $('list' + t);
      ul.textContent = '';
      const mem = r.members.filter(m => m.team === t);
      mem.forEach((m, i) => {
        const li = document.createElement('li');
        const num = document.createElement('span');
        num.className = 'num'; num.textContent = m.num;
        const name = document.createElement('span');
        name.textContent = m.name + (m.id === socket.id ? ' (tú)' : '') + (i >= r.mode ? ' · suplente' : '');
        li.append(num, name);
        if (m.id === r.host) { const h = document.createElement('span'); h.className = 'host'; h.textContent = '★ ANFITRIÓN'; li.append(h); }
        if (m.id === socket.id) li.classList.add('me');
        ul.append(li);
      });
      for (let i = mem.length; i < r.mode; i++) {
        const li = document.createElement('li');
        li.className = 'bot';
        li.textContent = 'CPU (hueco libre)';
        ul.append(li);
      }
    }
    for (const t of [0, 1]) {
      const k = teamKit(t), tm = TEAMS[r.teams[t]];
      $('teamSel' + t).value = r.teams[t];
      $('teamSel' + t).disabled = !isHost;
      $('teamName' + t).textContent = (t ? 'VISITANTE · ' : 'LOCAL · ') + tm.name.toUpperCase();
      $('teamCard' + t).style.background = `linear-gradient(160deg, ${k.c1} 0%, #10131c 80%)`;
      $('tn' + t).textContent = tm.code;
      $('tn' + t).style.background = k.c1;
      $('tn' + t).style.color = ink(k.c1);
    }
    for (const btn of document.querySelectorAll('.joinTeam')) {
      const t = +btn.dataset.team;
      btn.textContent = 'Jugar con ' + TEAMS[r.teams[t]].name;
      const count = r.members.filter(m => m.team === t).length;
      btn.disabled = !me || me.team === t || count >= r.mode;
    }
    $('lobbyMode').value = r.mode;
    $('lobbyMinutes').value = r.minutes;
    $('lobbyMode').disabled = $('lobbyMinutes').disabled = !isHost;
    $('btnStart').style.display = isHost ? '' : 'none';
    if (!$('lobbyMsg').textContent.startsWith('¡Enlace')) {
      msg('lobbyMsg', isHost ? 'Los huecos vacíos los juega la CPU. ¡Dale a jugar cuando quieras!' : 'Esperando a que el anfitrión inicie el partido…');
    }
    drawKit();
  }

  function drawKit() {
    const c = $('kitPreview'), g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    const me = roomInfo && roomInfo.members.find(m => m.id === socket.id);
    g.setTransform(4.8, 0, 0, 4.8 * TILT, c.width / 2, c.height * 0.88);
    ell(g, 1.5, 1, 8, 4.5, 'rgba(0,0,0,0.3)');
    const info = { id: 3, team: me ? me.team : 0, kind: 'field', num: profile.num };
    drawPlayer(g, { x: 0, y: 0, face: Math.PI / 2 - 0.5, st: 'run', flags: 0 }, info, { phase: 0, speed: 0 });
  }

  function showEnd() {
    const r = roomInfo;
    if (!r || r.state !== 'ended') return;
    const [a, b] = r.score;
    $('endScore').textContent = `${a} - ${b}`;
    $('endWinner').textContent = a !== b ? `¡Gana ${TEAMS[r.teams[a > b ? 0 : 1]].name}!` : 'Empate';
    const host = r.host === socket.id;
    $('btnRematch').style.display = $('btnBackLobby').style.display = host ? '' : 'none';
    $('endWait').style.display = host ? 'none' : '';
    $('endScreen').classList.add('show');
    audio.crowdStop();
  }
  function hideEnd() { $('endScreen').classList.remove('show'); }

  // ---------- Entrada ----------
  let bits = 0;
  function setBit(bit, on) {
    const nb = on ? bits | bit : bits & ~bit;
    if (nb === bits) return;
    bits = nb;
    socket.emit('input', bits);
  }
  function releaseAll() { if (bits) { bits = 0; socket.emit('input', 0); } }

  addEventListener('keydown', e => {
    if (!inGame()) return;
    if (e.code === 'KeyH') return $('help').classList.toggle('show');
    if (e.code === 'KeyM') return audio.toggleMute();
    if (e.code === 'Enter' && replay) return stopReplay();
    const bit = KEYMAP[e.code];
    if (!bit) return;
    e.preventDefault();
    if (!e.repeat) setBit(bit, true);
  });
  addEventListener('keyup', e => {
    const bit = KEYMAP[e.code];
    if (bit && inGame()) { e.preventDefault(); setBit(bit, false); }
  });
  addEventListener('blur', releaseAll);
  const cv = $('cv'), ctx = cv.getContext('2d');
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('mousedown', e => { audio.init(); if (e.button === 2) setBit(B.TACKLE, true); });
  addEventListener('mouseup', e => { if (e.button === 2) setBit(B.TACKLE, false); });

  // Controles táctiles (visibles solo con pointer: coarse vía CSS)
  const DIRS = B.UP | B.DOWN | B.LEFT | B.RIGHT;
  function setDir(mask) {
    const nb = (bits & ~DIRS) | mask;
    if (nb !== bits) { bits = nb; socket.emit('input', bits); }
  }
  document.querySelectorAll('.tbtns button').forEach(btn => {
    const bit = B[btn.dataset.b];
    const up = () => { btn.classList.remove('on'); setBit(bit, false); };
    btn.addEventListener('pointerdown', e => {
      e.preventDefault(); audio.init();
      btn.classList.add('on'); setBit(bit, true);
      btn.setPointerCapture(e.pointerId);
    });
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('contextmenu', e => e.preventDefault());
  });
  const stick = $('stick'), knob = stick.firstElementChild;
  let stickId = null;
  function moveStick(e) {
    const r = stick.getBoundingClientRect(), R = r.width / 2;
    let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R);
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    // 8 direcciones: un eje cuenta si supera el 40% del radio
    const t = R * 0.4;
    setDir((dy < -t ? B.UP : 0) | (dy > t ? B.DOWN : 0) | (dx < -t ? B.LEFT : 0) | (dx > t ? B.RIGHT : 0));
  }
  stick.addEventListener('pointerdown', e => {
    e.preventDefault(); audio.init();
    stickId = e.pointerId; moveStick(e); stick.setPointerCapture(stickId);
  });
  stick.addEventListener('pointermove', e => { if (e.pointerId === stickId) moveStick(e); });
  const stickUp = e => {
    if (e.pointerId !== stickId) return;
    stickId = null; knob.style.transform = ''; setDir(0);
  };
  stick.addEventListener('pointerup', stickUp);
  stick.addEventListener('pointercancel', stickUp);
  $('btnHelp').addEventListener('click', () => $('help').classList.toggle('show'));

  // ---------- Interpolación ----------
  function sample(list, t) {
    if (!list.length) return null;
    let i = list.length - 1;
    if (t >= list[i].t) return build(list[i], list[i], 0);
    while (i > 0 && list[i - 1].t > t) i--;
    if (i === 0) return build(list[0], list[0], 0);
    const a = list[i - 1], b = list[i];
    return build(a, b, (t - a.t) / (b.t - a.t));
  }

  function build(a, b, k) {
    const pa = new Map(a.p.map(q => [q[0], q]));
    const players = b.p.map(q => {
      const o = pa.get(q[0]) || q;
      const jump = Math.abs(o[1] - q[1]) + Math.abs(o[2] - q[2]) > 60;
      const kk = jump ? 1 : k;
      return {
        id: q[0], x: lerp(o[1], q[1], kk), y: lerp(o[2], q[2], kk), face: angLerp(o[3], q[3], kk),
        st: ST_NAMES[q[4]], stam: q[5], charge: q[6], flags: q[7],
      };
    });
    const bj = Math.abs(a.b[0] - b.b[0]) + Math.abs(a.b[1] - b.b[1]) > 80 ? 1 : k;
    return {
      t: lerp(a.t, b.t, k), state: b.s, owner: b.o, players, rp: b.rp || 0, pt: b.pt || 0,
      ball: { x: lerp(a.b[0], b.b[0], bj), y: lerp(a.b[1], b.b[1], bj), z: lerp(a.b[2], b.b[2], bj) },
    };
  }

  // ---------- Cancha pre-renderizada ----------
  const fieldCv = document.createElement('canvas');
  fieldCv.width = (W + FM * 2) * FS;
  fieldCv.height = (H + FM * 2) * FS;
  (function buildField() {
    const g = fieldCv.getContext('2d');
    g.scale(FS, FS);
    g.translate(FM, FM);
    const GM = 64; // césped fuera de las líneas; más allá, tribunas
    g.fillStyle = '#151a24';
    g.fillRect(-FM, -FM, W + FM * 2, H + FM * 2);
    const fans = ['#d62828', '#f4f4f4', '#1d4ed8', '#ffd23f', '#2b2b2b', '#7cc0ea', '#f1c27d', '#8d5524', '#0a8f3c'];
    for (let i = 0; i < 22000; i++) {
      const x = rnd(-FM, W + FM), y = rnd(-FM, H + FM);
      if (x > -GM - 2 && x < W + GM + 2 && y > -GM - 2 && y < H + GM + 2) continue;
      g.fillStyle = pick(fans);
      g.fillRect(x, y, 1.8, 2.4);
    }
    g.fillStyle = '#1d5f29';
    g.fillRect(-GM, -GM, W + GM * 2, H + GM * 2);
    for (let i = 0, x = -GM; x < W + GM; x += 50, i++) {
      g.fillStyle = i % 2 ? '#2f8f3a' : '#2a8435';
      g.fillRect(x, -GM, Math.min(50, W + GM - x), H + GM * 2);
    }
    // corte cruzado del césped (damero suave) + luz de focos desde arriba
    for (let i = 0, y = -GM; y < H + GM; y += 64, i++) {
      if (i % 2) { g.fillStyle = 'rgba(255,255,255,0.035)'; g.fillRect(-GM, y, W + GM * 2, Math.min(64, H + GM - y)); }
    }
    const light = g.createLinearGradient(0, -GM, 0, H + GM);
    light.addColorStop(0, 'rgba(255,255,220,0.07)'); light.addColorStop(0.5, 'rgba(0,0,0,0)'); light.addColorStop(1, 'rgba(0,0,0,0.12)');
    g.fillStyle = light;
    g.fillRect(-GM, -GM, W + GM * 2, H + GM * 2);
    for (let i = 0; i < 14000; i++) {
      g.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${Math.random() * 0.08})` : `rgba(180,255,170,${Math.random() * 0.06})`;
      g.fillRect(rnd(-GM, W + GM), rnd(-GM, H + GM), 1.2, 1.6);
    }
    // vallas publicitarias
    const ads = ['GARRA FC', 'SOCKET.IO', 'CANVAS 2D', 'GOLAZO', 'WEB AUDIO', 'LA CROQUETA'];
    g.font = '700 11px "Chakra Petch", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0, x = 0; x < W; x += 125, i++) {
      for (const y of [-52, H + 38]) {
        g.fillStyle = i % 2 ? '#0d2a63' : '#7a1018';
        g.fillRect(x + 4, y, 117, 14);
        g.fillStyle = '#fff';
        g.fillText(ads[i % ads.length], x + 62, y + 7.5);
      }
    }
    g.strokeStyle = 'rgba(255,255,255,0.92)';
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.lineWidth = 2;
    g.strokeRect(0, 0, W, H);
    g.beginPath(); g.moveTo(CX, 0); g.lineTo(CX, H); g.stroke();
    g.beginPath(); g.arc(CX, CY, 80, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(CX, CY, 3, 0, Math.PI * 2); g.fill();
    const arcA = Math.acos((BOX_D - PEN_SPOT) / 80);
    for (const s of [0, 1]) {
      const x0 = s ? W : 0, dir = s ? -1 : 1;
      g.strokeRect(s ? W - BOX_D : 0, BOX_TOP, BOX_D, BOX_BOT - BOX_TOP);
      g.strokeRect(s ? W - 55 : 0, 225, 55, 190);
      g.beginPath(); g.arc(x0 + dir * PEN_SPOT, CY, 2.6, 0, Math.PI * 2); g.fill();
      g.beginPath();
      if (s) g.arc(W - PEN_SPOT, CY, 80, Math.PI - arcA, Math.PI + arcA);
      else g.arc(PEN_SPOT, CY, 80, -arcA, arcA);
      g.stroke();
    }
    for (const [x, y, a0] of [[0, 0, 0], [W, 0, Math.PI / 2], [W, H, Math.PI], [0, H, Math.PI * 1.5]]) {
      g.beginPath(); g.arc(x, y, 9, a0, a0 + Math.PI / 2); g.stroke();
    }
  })();

  // ---------- Dibujo ----------
  // Cámara 3/4 estilo TV: el suelo se achata en Y (TILT) y la altura z sube en pantalla K unidades por unidad.
  const TILT = 0.78, K = 0.62 / TILT;
  let cw = 0, ch = 0;
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cw = cv.width = Math.round(innerWidth * dpr);
    ch = cv.height = Math.round(innerHeight * dpr);
  }
  addEventListener('resize', () => { if (inGame()) resize(); });

  function ell(g, x, y, rx, ry, color, rot = 0) {
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    g.fill();
  }
  function limb(g, x0, y0, x1, y1, w, color) {
    g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  }

  // ---------- Equipaciones ----------
  const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const colDist = (a, b) => { const x = hexRgb(a), y = hexRgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
  const ink = h => { const [r, g, b] = hexRgb(h); return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111' : '#fff'; };
  function teamKit(slot) {
    const ids = roomInfo ? roomInfo.teams : [0, 1], t = TEAMS[ids[slot]];
    // el visitante usa la suplente si las camisetas se parecen
    if (slot === 1 && colDist(t.c1, TEAMS[ids[0]].c1) < 120) return { ...t, c1: t.alt[0], c2: t.alt[1], pat: 'liso' };
    return t;
  }
  function gkCol(slot) {
    const k = [teamKit(0).c1, teamKit(1).c1];
    const ok = ['#2b2b2b', '#9b5de5', '#22c55e', '#f4c430', '#ff66cc'].filter(c => k.every(x => colDist(c, x) > 120));
    return ok[slot] || ok[0];
  }
  function kitOf(info) {
    if (info.kind === 'gk') { const c = gkCol(info.team); return { c1: c, c2: ink(c), pat: 'liso', sh: '#1a1a1a', so: c, gk: true }; }
    return teamKit(info.team);
  }

  // ---------- Jugadores: mallas 3D articuladas, proyectadas sobre la cancha ----------
  function drawPlayer(g, p, info, a) {
    if (!info) return;
    g.save(); g.translate(p.x, p.y); g.scale(1, 1 / TILT);
    FootballPlayer3D.draw(g, p, info, kitOf(info), a, {
      time: performance.now(), celebrate: curState === 'goal' && info.team === celebrate,
    });
    g.restore();
  }

  function drawShadow(p, v) {
    const long = p.st === 'slide' || p.st === 'down' || p.st === 'dive';
    // sombra alargada hacia abajo-derecha (focos del estadio), más difusa en el borde
    const g = ctx.createRadialGradient(p.x + 3, p.y + 2, 1, p.x + 3, p.y + 2, long ? 14 : 9);
    g.addColorStop(0, 'rgba(0,0,0,0.42)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    if (long) ctx.ellipse(p.x + 2 + Math.cos(p.face) * 2, p.y + 2 + Math.sin(p.face) * 2, 15, 7, p.face, 0, Math.PI * 2);
    else ctx.ellipse(p.x + 3.5, p.y + 2, 10, 5.5, 0.35, 0, Math.PI * 2);
    ctx.fill();
    const t = performance.now();
    if (p.id === myPid) {
      ctx.strokeStyle = 'rgba(255,210,63,0.9)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 10, 7, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (p.id === v.rp) { // destinatario del pase en curso: anillo que late
      const r = 11 + Math.sin(t / 90) * 2;
      ctx.strokeStyle = '#7cf3ff'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (p.id === v.pt && v.owner === myPid) { // a quién irá tu pase si lo sueltas ahora
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]); ctx.lineDashOffset = -t / 60;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 11, 7.7, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  let ballRoll = 0, lastBallPos = null, ballTrail = [];
  // estela: últimas posiciones del balón, visible solo cuando va rápido
  function drawBallTrail(b) {
    const last = ballTrail[ballTrail.length - 1], y = b.y - b.z * K;
    if (last && Math.hypot(b.x - last.x, y - last.y) > 40) ballTrail = []; // saque / reubicación: sin estela
    ballTrail.push({ x: b.x, y });
    if (ballTrail.length > 10) ballTrail.shift();
    const a = ballTrail[0], spd = Math.hypot(b.x - a.x, b.y - b.z * K - a.y) / ballTrail.length;
    if (spd < 4) return;
    ctx.lineCap = 'round';
    for (let i = 1; i < ballTrail.length; i++) {
      const p0 = ballTrail[i - 1], p1 = ballTrail[i], k = i / ballTrail.length;
      ctx.strokeStyle = `rgba(255,255,255,${k * clamp((spd - 4) / 8, 0, 0.45)})`;
      ctx.lineWidth = 4.5 * k;
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    }
  }
  function drawBallShadow(b) {
    const z = b.z;
    ell(ctx, b.x + z * 0.25 + 1, b.y + 1, 3.4 + z * 0.02, 2.6 + z * 0.015, `rgba(0,0,0,${clamp(0.38 - z / 180, 0.1, 0.38)})`);
  }
  function drawBall(b) {
    if (lastBallPos) ballRoll += Math.hypot(b.x - lastBallPos.x, b.y - lastBallPos.y) / 3.4;
    lastBallPos = { x: b.x, y: b.y };
    const r = 3 * (1 + b.z / 120);
    ctx.save();
    ctx.translate(b.x, b.y - b.z * K);
    ctx.scale(1, 1 / TILT);
    const grad = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    grad.addColorStop(0, '#fff'); grad.addColorStop(0.6, '#e9e9e9'); grad.addColorStop(1, '#9a9a9a');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.5; ctx.stroke();
    ctx.clip();
    ctx.fillStyle = '#1a1a1a';
    for (let i = 0; i < 3; i++) {
      const ang = ballRoll + (i * Math.PI * 2) / 3;
      ctx.beginPath(); ctx.arc(Math.cos(ang) * r * 0.55, Math.sin(ang * 1.3) * r * 0.55, r * 0.28, 0, Math.PI * 2); ctx.fill();
    }
    ell(ctx, -r * 0.35, -r * 0.4, r * 0.32, r * 0.22, 'rgba(255,255,255,0.85)'); // brillo del foco
    ctx.restore();
  }

  // ---------- Arcos 3D ----------
  const P = (x, y, z) => [x, y - z * K];
  function netPlane(q) {
    const v = q.map(c => P(...c)), L = (A, Bp, t) => [lerp(A[0], Bp[0], t), lerp(A[1], Bp[1], t)];
    ctx.beginPath(); ctx.moveTo(...v[0]); for (const c of v.slice(1)) ctx.lineTo(...c); ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.32)'; ctx.lineWidth = 0.4;
    ctx.beginPath();
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      ctx.moveTo(...L(v[0], v[1], t)); ctx.lineTo(...L(v[3], v[2], t));
      ctx.moveTo(...L(v[0], v[3], t)); ctx.lineTo(...L(v[1], v[2], t));
    }
    ctx.stroke();
  }
  function drawNet(gx, s) {
    const x1 = gx + s * GOAL_DEPTH, hb = GOAL_H * 0.7, T = GOAL_TOP, Bt = GOAL_BOT, G = GOAL_H;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(Math.min(gx, x1), T, GOAL_DEPTH, Bt - T);
    netPlane([[x1, T, 0], [x1, Bt, 0], [x1, Bt, hb], [x1, T, hb]]);
    netPlane([[gx, T, 0], [x1, T, 0], [x1, T, hb], [gx, T, G]]);
    netPlane([[gx, Bt, 0], [x1, Bt, 0], [x1, Bt, hb], [gx, Bt, G]]);
    netPlane([[gx, T, G], [gx, Bt, G], [x1, Bt, hb], [x1, T, hb]]);
  }
  // palo lejano + travesaño (se ordena en y=GOAL_TOP) y palo cercano (en y=GOAL_BOT)
  function drawPost(gx, y, bar) {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(...P(gx, y, 0)); ctx.lineTo(...P(gx, y, GOAL_H));
    if (bar) ctx.lineTo(...P(gx, GOAL_BOT, GOAL_H));
    ctx.stroke();
  }

  // ---------- Partículas / textos flotantes / confeti ----------
  let particles = [], floaters = [], confetti = [], rings = [];
  // onda en el césped al patear (más grande cuanto más fuerte)
  function drawRings(dt) {
    for (const r of rings) {
      r.life -= dt;
      const k = 1 - r.life / r.max;
      ctx.strokeStyle = `rgba(255,255,255,${(1 - k) * 0.7})`;
      ctx.lineWidth = 1.4 * (1 - k) + 0.3;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, 3 + k * r.size, (3 + k * r.size) * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
    }
    rings = rings.filter(r => r.life > 0);
  }
  function spawnGrass(x, y, n, spread) {
    for (let i = 0; i < n; i++) {
      particles.push({
        x, y, z: 0, vx: rnd(-1, 1) * spread, vy: rnd(-1, 1) * spread, vz: rnd(0.6, 2.2),
        life: rnd(20, 45), c: pick(['#3fa34d', '#2d7a36', '#6b4f2a', '#8fd18f', '#245e2c']),
      });
    }
    if (particles.length > 600) particles.splice(0, particles.length - 600);
  }
  function drawParticles(dt) {
    for (const q of particles) {
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.vz -= 0.15 * dt;
      if (q.z < 0) { q.z = 0; q.vx *= 0.7; q.vy *= 0.7; q.vz = 0; }
      q.life -= dt;
      ctx.fillStyle = q.c;
      ctx.fillRect(q.x, q.y - q.z * K, 1.5, 1.5);
    }
    particles = particles.filter(q => q.life > 0);
  }
  function floater(text, id, x, y) {
    floaters.push({ text, id, x, y, life: 80 });
  }
  function drawFloaters(v, dt) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '400 8px "Bungee", sans-serif';
    for (const f of floaters) {
      f.life -= dt;
      const p = f.id ? v.players.find(q => q.id === f.id) : null;
      const x = p ? p.x : f.x, y = p ? p.y : f.y, ty = -44 - (80 - f.life) * 0.12;
      if (x === undefined) continue;
      ctx.save();
      ctx.translate(x, y); ctx.scale(1, 1 / TILT);
      ctx.globalAlpha = clamp(f.life / 25, 0, 1);
      ctx.lineWidth = 2.4; ctx.strokeStyle = '#000';
      ctx.strokeText(f.text, 0, ty);
      ctx.fillStyle = '#ffd23f';
      ctx.fillText(f.text, 0, ty);
      ctx.restore();
    }
    floaters = floaters.filter(f => f.life > 0);
  }
  function spawnConfetti(team) {
    const k = teamKit(team), cols = [k.c1, k.c2, '#ffd23f', '#ffffff'];
    for (let i = 0; i < 260; i++) {
      confetti.push({
        x: rnd(0, cw), y: rnd(-ch * 0.6, 0), vx: rnd(-2, 2), vy: rnd(2, 6), rot: rnd(0, 6), vr: rnd(-0.3, 0.3),
        w: rnd(6, 12), h: rnd(3, 7), c: pick(cols), life: rnd(160, 260),
      });
    }
  }
  function drawConfetti(dt) {
    for (const c of confetti) {
      c.x += (c.vx + Math.sin(c.rot) * 1.5) * dt; c.y += c.vy * dt; c.rot += c.vr * dt; c.life -= dt;
      ctx.save();
      ctx.translate(c.x, c.y); ctx.rotate(c.rot);
      ctx.fillStyle = c.c;
      ctx.fillRect(-c.w / 2, -c.h / 2, c.w, Math.abs(Math.cos(c.rot * 2)) * c.h + 1);
      ctx.restore();
    }
    confetti = confetti.filter(c => c.life > 0 && c.y < ch + 20);
  }

  // ---------- Banners y eventos ----------
  let bannerTimer = 0;
  function banner(title, sub, cls, ms = 1500) {
    const el = $('banner');
    el.className = 'banner ' + (cls || '');
    el.querySelector('b').textContent = title;
    el.querySelector('small').textContent = sub || '';
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  let replay = null, replayTimer = 0;
  function scheduleReplay(goalTick) {
    clearTimeout(replayTimer);
    replayTimer = setTimeout(() => {
      if (lastState !== 'goal') return;
      const buf = snaps.filter(s => s.t >= goalTick - 150 && s.t <= goalTick + 40);
      if (buf.length < 30) return;
      replay = { buf, t: buf[0].t, end: buf[buf.length - 1].t };
      $('replayTag').classList.add('show');
    }, 1700);
  }
  function stopReplay() {
    replay = null;
    clearTimeout(replayTimer);
    $('replayTag').classList.remove('show');
  }

  const cam = { x: CX, y: CY, shake: 0 };
  let celebrate = -1, curState = ''; // equipo que festeja un gol (brazos arriba mientras dura el estado 'goal')
  const GK_HINT = 'Flechas apuntan · S pase · W al hueco · A largo · D despeje';
  const myTeam = () => { const me = roster.get(myPid); return me ? me.team : -1; };

  function handleEvent(e, s) {
    switch (e.type) {
      case 'start':
        audio.whistle(1, 0.6); audio.crowdStart(); hideEnd(); stopReplay();
        banner('¡A JUGAR!', '', 'small', 1300);
        break;
      case 'kick':
        audio.kick(clamp(e.p / 18, 0.15, 1)); spawnGrass(e.x, e.y, 4 + (e.p | 0), 1.2);
        rings.push({ x: e.x, y: e.y, life: 18, max: 18, size: 6 + e.p * 1.4 });
        break;
      case 'pass': if (e.to === myPid) floater('¡TUYA!', e.to); break;
      case 'shot': if (e.kind === 'potente') cam.shake = Math.max(cam.shake, 2.5); break;
      case 'slide': audio.slide(); break;
      case 'tackle': audio.tackle(); spawnGrass(e.x, e.y, 16, 2.5); floater('¡QUITE!', e.id); break;
      case 'foul':
        audio.whistle(1, 0.9); audio.ooh();
        banner(e.pen ? '¡PENAL!' : '¡FALTA!', e.pen ? '' : 'TIRO LIBRE', 'foul', 1800);
        spawnGrass(e.x, e.y, 20, 2.5);
        cam.shake = 3;
        break;
      case 'setpiece':
        if (e.kind === 'kickoff') audio.whistle(1, 0.5);
        if (e.kind === 'goalkick' && myTeam() === e.team) banner(e.label, GK_HINT, 'small t' + e.team, 2600);
        else if (['corner', 'goalkick', 'throw'].includes(e.kind)) banner(e.label, '', 'small t' + e.team, 1200);
        break;
      case 'dive': audio.swish(); break;
      case 'whistle': audio.whistle(1, 0.4); break;
      case 'post':
        audio.post(); audio.ooh(); cam.shake = 4;
        floater(e.bar ? '¡TRAVESAÑO!' : '¡AL PALO!', 0, s.b[0], s.b[1]);
        break;
      case 'goal':
        audio.cheer(); audio.whistle(1, 0.5);
        banner(e.own ? '¡EN CONTRA!' : '¡GOLAZO!', e.scorer ? (e.own ? 'Autogol de ' : '') + e.scorer : '', 'goal t' + e.team, 2600);
        spawnConfetti(e.team);
        cam.shake = 6; celebrate = e.team;
        scheduleReplay(s.t);
        break;
      case 'skill': audio.swish(); floater(e.name, e.id); break;
      case 'shoulder': audio.thud(); floater('¡CARGA!', e.id); break;
      case 'save':
        audio.kick(0.6);
        floater(e.catch ? '¡ATAJADA!' : '¡QUÉ PARADA!', e.id);
        if (!e.catch) audio.ooh();
        else if (myTeam() === e.team) banner('¡LA TIENE TU ARQUERO!', GK_HINT, 'small t' + e.team, 2600);
        break;
      case 'end':
        audio.whistle(3, 0.9); audio.cheer();
        banner('¡FINAL!', `${e.score[0]} - ${e.score[1]}`, '', 1500);
        break;
    }
  }

  // ---------- HUD ----------
  const hudCache = {};
  function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
  function updateHud(s) {
    setText('sc0', String(s.sc[0]));
    setText('sc1', String(s.sc[1]));
    setText('clock', `${String(Math.floor(s.tl / 60)).padStart(2, '0')}:${String(s.tl % 60).padStart(2, '0')}`);
    $('clock').classList.toggle('hurry', s.tl <= 10 && s.s !== 'ended');
    const me = s.p.find(q => q[0] === myPid);
    $('stamFill').style.width = (me ? me[5] : 100) + '%';
    $('stamFill').classList.toggle('tired', !!me && (me[7] & 1) === 1);
    $('powFill').style.width = (me ? me[6] : 0) + '%';
  }

  function drawRadar(v) {
    const r = $('radar'), g = r.getContext('2d');
    const m = 8, sx = (r.width - m * 2) / W, sy = (r.height - m * 2) / H;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#0d4a1f';
    g.fillRect(0, 0, r.width, r.height);
    g.setTransform(sx, 0, 0, sy, m, m);
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = 1 / sx;
    g.strokeRect(0, 0, W, H);
    g.beginPath(); g.moveTo(CX, 0); g.lineTo(CX, H); g.stroke();
    g.beginPath(); g.arc(CX, CY, 80, 0, Math.PI * 2); g.stroke();
    g.strokeRect(0, BOX_TOP, BOX_D, BOX_BOT - BOX_TOP);
    g.strokeRect(W - BOX_D, BOX_TOP, BOX_D, BOX_BOT - BOX_TOP);
    const scale = ch / VIEW_H, vw = cw / scale, vh = ch / (scale * TILT);
    g.strokeStyle = 'rgba(255,210,63,0.5)';
    g.strokeRect(cam.x - vw / 2, cam.y - vh / 2, vw, vh);
    g.setTransform(1, 0, 0, 1, 0, 0);
    for (const p of v.players) {
      const info = roster.get(p.id);
      if (!info) continue;
      const x = m + p.x * sx, y = m + p.y * sy;
      g.fillStyle = kitOf(info).c1;
      g.beginPath(); g.arc(x, y, p.id === myPid ? 5 : 3.6, 0, Math.PI * 2); g.fill();
      g.strokeStyle = p.id === myPid ? '#ffd23f' : 'rgba(0,0,0,0.7)'; g.lineWidth = p.id === myPid ? 2 : 1; g.stroke();
      if ((p.flags & 16) && v.state === 'play') {
        g.strokeStyle = '#7cf3ff'; g.lineWidth = 1.5;
        g.beginPath(); g.arc(x, y, 6 + Math.sin(v.t * 0.18) * 1.2, 0, Math.PI * 2); g.stroke();
      }
    }
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(m + v.ball.x * sx, m + v.ball.y * sy, 2.6 + v.ball.z / 20, 0, Math.PI * 2); g.fill();
  }

  // ---------- Bucle de render ----------
  const anim = new Map();
  function updateAnims(v, dt) {
    for (const p of v.players) {
      let a = anim.get(p.id);
      if (!a) anim.set(p.id, (a = { phase: p.id * 1.7, speed: 0, run: 0, sprint: 0, call: 0, px: p.x, py: p.y }));
      const dx = p.x - a.px, dy = p.y - a.py, d = Math.hypot(dx, dy);
      a.px = p.x; a.py = p.y;
      if (a.st !== p.st) { a.st = p.st; a.stAt = performance.now(); }
      const sp = d > 40 || dt <= 0 ? 0 : d / dt;
      const blend = 1 - Math.pow(0.74, dt);
      const prevSpeed = a.speed;
      a.speed += (Math.min(sp, 6) - a.speed) * blend;
      a.accel = clamp((a.speed - prevSpeed) / Math.max(dt, 0.01), -1, 1);
      if (d > 0.02 && d < 40) a.moveFace = angLerp(a.moveFace ?? p.face, Math.atan2(dy, dx), blend);
      if (d > 40) { a.moveFace = p.face; a.speed = 0; }

      a.run += ((p.st === 'run' ? clamp((a.speed - 1.1) / 1.3, 0, 1) : 0) - a.run) * blend;
      a.sprint += (((p.flags & 2) && p.st === 'run' && a.speed > 0.8 ? 1 : 0) - a.sprint) * blend;
      a.call += (((p.flags & 16) && v.state === 'play' ? 1 : 0) - a.call) * blend;
      // Cadencia ligada al desplazamiento: zancadas más largas en vez de patinar con pasos diminutos.
      a.phase += (p.st === 'step' ? 0.65 : (0.105 + a.run * 0.1 + a.sprint * 0.055) * clamp(a.speed / 1.2, 0, 1)) * dt;
      if (p.st === 'slide') spawnGrass(p.x + Math.cos(p.face) * 10, p.y + Math.sin(p.face) * 10, 1, 1.5);
      if ((p.flags & 2) && Math.random() < 0.08 * dt) spawnGrass(p.x, p.y + 3, 1, 0.6);
    }
  }

  function drawOverlays(v) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const me = roster.get(myPid), gi = roster.get(v.owner);
    // Tu arquero tiene el balón: flecha hacia donde va a sacar (tus flechas, o hacia ti si no apuntas)
    if (me && gi && gi.kind === 'gk' && gi.team === me.team) {
      const gp = v.players.find(q => q.id === gi.id), mp = v.players.find(q => q.id === myPid);
      if (gp && mp && (gp.st === 'hold' || v.state === 'setpiece')) {
        let dx = (bits & B.RIGHT ? 1 : 0) - (bits & B.LEFT ? 1 : 0), dy = (bits & B.DOWN ? 1 : 0) - (bits & B.UP ? 1 : 0);
        if (!dx && !dy) { dx = mp.x - gp.x; dy = mp.y - gp.y; }
        const ang = Math.atan2(dy, dx), ex = gp.x + Math.cos(ang) * 70, ey = gp.y + Math.sin(ang) * 70;
        ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(gp.x, gp.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath();
        ctx.moveTo(ex + Math.cos(ang) * 7, ey + Math.sin(ang) * 7);
        ctx.lineTo(ex + Math.cos(ang + 2.4) * 6, ey + Math.sin(ang + 2.4) * 6);
        ctx.lineTo(ex + Math.cos(ang - 2.4) * 6, ey + Math.sin(ang - 2.4) * 6);
        ctx.fill();
        ctx.save();
        ctx.translate(gp.x, gp.y); ctx.scale(1, 1 / TILT);
        ctx.font = '400 6px "Bungee", sans-serif';
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(performance.now() / 150);
        ctx.lineWidth = 2; ctx.strokeStyle = '#000';
        ctx.strokeText('¡SACÁ! S · W · A · D', 0, -38);
        ctx.fillStyle = '#ffd23f'; ctx.fillText('¡SACÁ! S · W · A · D', 0, -38);
        ctx.restore();
      }
    }
    for (const p of v.players) {
      const info = roster.get(p.id);
      if (!info) continue;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.scale(1, 1 / TILT);
      if (info.sid) {
        const k = kitOf(info);
        ctx.font = '700 5.5px "Chakra Petch", sans-serif';
        const w = ctx.measureText(info.name).width + 5;
        ctx.fillStyle = k.c1; ctx.fillRect(-w / 2, -43, w, 7);
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 0.5; ctx.strokeRect(-w / 2, -43, w, 7);
        ctx.fillStyle = ink(k.c1); ctx.fillText(info.name, 0, -39.4);
      }
      if (p.id === myPid) {
        const bob = Math.sin(performance.now() / 160) * 1.5;
        ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#000'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(-4, -53 + bob); ctx.lineTo(4, -53 + bob); ctx.lineTo(0, -47 + bob); ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
      const call = anim.get(p.id)?.call || 0;
      if (call > 0.03 && v.state === 'play' && v.owner !== p.id) {
        ctx.save();
        const pulse = Math.sin(v.t * 0.2 + p.id);
        ctx.translate(0, -64 - pulse * 1.5);
        ctx.globalAlpha = call;
        const pop = 0.85 + call * 0.15;
        ctx.scale(pop, pop);
        ctx.fillStyle = '#e9fcff'; ctx.strokeStyle = '#1c6675'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-17, -7); ctx.lineTo(17, -7); ctx.quadraticCurveTo(21, -7, 21, -3);
        ctx.lineTo(21, 3); ctx.quadraticCurveTo(21, 7, 17, 7);
        ctx.lineTo(3, 7); ctx.lineTo(0, 11); ctx.lineTo(-3, 7); ctx.lineTo(-17, 7);
        ctx.quadraticCurveTo(-21, 7, -21, 3); ctx.lineTo(-21, -3); ctx.quadraticCurveTo(-21, -7, -17, -7);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.font = '700 8px "Chakra Petch", sans-serif';
        ctx.fillStyle = '#134853'; ctx.fillText('¡ACÁ!', 0, 0.5);
        for (const s of [-1, 1]) {
          const x = s * (24 + pulse * 1.3);
          limb(ctx, x, -3, x + s * 2, -5, 1, '#7cf3ff');
          limb(ctx, x + s * 1, 1, x + s * 4, 1, 1, '#7cf3ff');
        }
        ctx.restore();
      }
      if (p.st === 'down') {
        const t = performance.now() / 200, ang = Math.atan2(Math.sin(p.face) * TILT, Math.cos(p.face));
        const hx = -Math.cos(ang) * 10.5, hy = -Math.sin(ang) * 10.5 - 8;
        for (let i = 0; i < 3; i++) {
          const a = t + (i * Math.PI * 2) / 3;
          ell(ctx, hx + Math.cos(a) * 5, hy + Math.sin(a) * 2, 1.2, 1.2, '#ffd23f');
        }
      }
      if (p.st === 'fooled') {
        ctx.font = '400 9px "Bungee", sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText('?', 8, -30);
      }
      if (p.id === myPid && p.charge > 0) {
        ctx.fillStyle = '#000';
        ctx.fillRect(-13, 5, 26, 4);
        const c = p.charge / 100;
        ctx.fillStyle = c < 0.34 ? '#3ddc84' : c < 0.75 ? '#ffd23f' : c < 0.92 ? '#ff7b00' : '#ff2266';
        ctx.fillRect(-12.5, 5.5, 25 * c, 3);
      }
      ctx.restore();
    }
  }

  // viñeta de transmisión TV: bordes oscuros, centro limpio (gradiente cacheado por tamaño)
  let vig = null;
  function drawVignette() {
    if (!vig || vig.w !== cw || vig.h !== ch) {
      const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.hypot(cw, ch) * 0.6);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
      vig = { w: cw, h: ch, g };
    }
    ctx.fillStyle = vig.g;
    ctx.fillRect(0, 0, cw, ch);
  }

  function render(v, dt) {
    const scale = ch / VIEW_H, vw = cw / scale, vh = ch / (scale * TILT);
    const me = v.players.find(p => p.id === myPid);
    let tx = v.ball.x, ty = v.ball.y;
    if (me && !replay) { tx = v.ball.x * 0.7 + me.x * 0.3; ty = v.ball.y * 0.7 + me.y * 0.3; }
    const k = 1 - Math.pow(0.9, dt);
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
    const mx = 80, my = 95;
    cam.x = vw >= W + mx * 2 ? CX : clamp(cam.x, -mx + vw / 2, W + mx - vw / 2);
    cam.y = vh >= H + my * 2 ? CY : clamp(cam.y, -my + vh / 2, H + my - vh / 2);
    let sx = 0, sy = 0;
    if (cam.shake > 0) {
      sx = (Math.random() - 0.5) * cam.shake; sy = (Math.random() - 0.5) * cam.shake;
      cam.shake *= Math.pow(0.88, dt);
      if (cam.shake < 0.2) cam.shake = 0;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#151a24';
    ctx.fillRect(0, 0, cw, ch);
    ctx.setTransform(scale, 0, 0, scale * TILT, cw / 2 - (cam.x + sx) * scale, ch / 2 - (cam.y + sy) * scale * TILT);
    ctx.drawImage(fieldCv, -FM, -FM, W + FM * 2, H + FM * 2);
    drawNet(0, -1);
    drawNet(W, 1);

    curState = v.state;
    updateAnims(v, dt);
    drawRings(dt);
    for (const p of v.players) drawShadow(p, v);
    drawBallShadow(v.ball);
    drawBallTrail(v.ball);
    const ballLow = v.ball.z < 12;
    const items = v.players.map(p => ({ y: p.y, p }));
    if (ballLow) items.push({ y: v.ball.y + 0.1, ball: true });
    for (const gx of [0, W]) items.push({ y: GOAL_TOP, post: gx, bar: true }, { y: GOAL_BOT, post: gx });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      if (it.ball) drawBall(v.ball);
      else if (it.post !== undefined) drawPost(it.post, it.y, it.bar);
      else drawPlayer(ctx, it.p, roster.get(it.p.id), anim.get(it.p.id));
    }
    if (!ballLow) drawBall(v.ball);
    drawParticles(dt);
    drawOverlays(v);
    drawFloaters(v, dt);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawVignette();
    drawConfetti(dt);
    drawRadar(v);
  }

  let lastFrame = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(100, now - lastFrame) / TICK_MS;
    lastFrame = now;
    if (!inGame() || tickOffset === null) return;
    let view = null;
    if (replay) {
      replay.t += dt * 0.65;
      if (replay.t >= replay.end) stopReplay();
      else view = sample(replay.buf, replay.t);
    }
    if (!view) view = sample(snaps, now / TICK_MS - tickOffset - INTERP);
    if (view) render(view, dt);
  }
  requestAnimationFrame(frame);
  drawKit();
})();
