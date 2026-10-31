'use strict';
(() => {
  // ---------- Constantes (espejo de server.js) ----------
  // La geometría depende de la cancha de la sala (pitches.js); setPitch() la cambia.
  let pitch = PITCHES[0], W, H, CX, CY, GOAL_TOP, GOAL_BOT, GOAL_H, BOX_D, BOX_TOP, BOX_BOT, PEN_SPOT;
  ({ W, H, CX, CY, GOAL_TOP, GOAL_BOT, GOAL_H, BOX_D, BOX_TOP, BOX_BOT, PEN_SPOT } = pitchGeom(pitch));
  const GOAL_DEPTH = 26;
  const TICK_MS = 1000 / 60, VIEW_H = 360, FM = 110, FS = 2;
  const TILT = 0.78, K = 0.62 / TILT;
  const B = { UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, SPRINT: 16, PASS: 128, SHOOT: 1024 };
  const toon = ToonFX.create(),C=FootballContinuity;
  const netClock=C.createClock(),liveSampler=C.createSampler(),replaySampler=C.createSampler(),presentation=C.createPresenter();
  const eventGate=C.createEventGate(),predictor=C.createPredictor();let networkEpoch=0;
  function resetNetwork(){networkEpoch++;predictor.reset();eventGate.reset();snaps.length=0;netClock.reset();liveSampler.reset();replaySampler.reset();presentation.reset();painted=false;sceneBlend.left=sceneBlend.weight=0;ballTrail.clear();lastBallPos=null;clearEffects(particles,particlePool);clearEffects(floaters,floaterPool);clearEffects(rings,ringPool);clearEffects(confetti,confettiPool);anim.clear();}

  const ST_NAMES = ['run', 'slide', 'recover', 'down', 'spin', 'croq', 'step', 'fake', 'rainbow', 'fooled', 'hold', 'dive'];
  const DASH_SHORT=[3,3],DASH_LONG=[5,4],DASH_NONE=[];
  const KEYMAP = {
    ArrowUp: B.UP, ArrowDown: B.DOWN, ArrowLeft: B.LEFT, ArrowRight: B.RIGHT, Space: B.SPRINT,
    KeyS: B.PASS, KeyD: B.SHOOT,
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
  function theme(k) {
    const s=document.documentElement.style,n=parseInt(k.c1.slice(1),16);
    s.setProperty('--team-c1',k.c1);s.setProperty('--team-c2',k.c2);
    s.setProperty('--team-ink',.299*(n>>16)+.587*((n>>8)&255)+.114*(n&255)>150?'#111':'#fff');
  }

  // ---------- Audio sintetizado (Web Audio API) ----------
  const audio = (() => {
    let ac = null, master = null, noiseBuf = null, crowd = null, muted = !!store.get('garra-muted');
    function init() {
      if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = muted ? 0 : 0.7;
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
      toggleMute() { muted = !muted; store.set('garra-muted', muted); if (master) master.gain.value = muted ? 0 : 0.7; return muted; },
      get muted() { return muted; },
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
      fall() { if(ac) osc(ac.currentTime,'sine',1250,120,.48,.12,.02); },
      boing() { if(!ac)return;const t=ac.currentTime;osc(t,'triangle',180,650,.08,.22);osc(t+.08,'sine',650,95,.4,.2); },
      horn() { if(!ac)return;const t=ac.currentTime;for(const f of [220,277,330]){osc(t,'sawtooth',f,f*.93,.24,.045,.02);osc(t+.3,'square',f,f*.82,.55,.035,.02);} },
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
  // WebSocket primero: el long-polling entrega en ráfagas y el partido se ve a los tirones.
  const socket = io({ transports: ['websocket', 'polling'], tryAllTransports: true });
  let rtt = 0, rttEst = 0; // rttEst suavizado: lo usa la predicción del jugador propio
  setInterval(() => { if (!socket.connected || !inGame()) return; const t0 = performance.now(); socket.emit('lat', () => { rtt = performance.now() - t0; rttEst = rttEst ? rttEst + (rtt - rttEst) * 0.3 : rtt; if (menuOpen) renderPause(); }); }, 1000);
  let roomInfo = null, roster = new Map(), myPid = 0, snaps = [], lastState = '';
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

  // cid identifica esta pestaña entre reconexiones; rejoin es la sala a la que volver si se corta.
  const cid = Math.random().toString(36).slice(2);
  let rejoin = null;
  const netUI = () => { $('btnCreate').disabled = $('btnJoin').disabled = !socket.connected; };
  netUI();
  socket.on('connect', () => {
    netUI();
    if (!rejoin) return msg('menuMsg', '');
    socket.emit('join', { ...rejoin, cid, profile }, res => {
      if (res && res.ok) return msg('menuMsg', '');
      rejoin = null;
      msg('menuMsg', 'La sala ya no existe. Creá otra o entrá con otro código.');
    });
  });
  socket.on('connect_error', () => msg('menuMsg', 'Sin conexión con el servidor. Reintentando…'));
  socket.on('disconnect', () => {
    roomInfo = null; resetNetwork(); toon.reset(); netUI();
    show('menu');
    msg('menuMsg', rejoin ? `Se cortó la conexión. Volviendo a la sala ${rejoin.code}…` : 'Se cortó la conexión. Reconectando…');
    audio.crowdStop();
  });

  socket.on('room', info => {
    if(!roomInfo||roomInfo.teams[0]!==info.teams[0]||roomInfo.teams[1]!==info.teams[1])kitCache.clear();
    if(info.state==='lobby')toon.reset();
    roomInfo = info;
    if (PITCHES[info.pitch] && PITCHES[info.pitch] !== pitch) setPitch(info.pitch);
    const mine = info.members.find(m => m.id === socket.id);
    rejoin = { code: info.code, team: mine && mine.team };
    $('roomCode').textContent = info.code;
    $('hudCode').textContent = info.code;
    clearTimeout(endTimer);
    if (info.state === 'lobby') { show('lobby'); hideEnd(); stopReplay(); audio.crowdStop(); setMenu(false); }
    else {
      if (!inGame()) show('game');
      if (info.state === 'ended') endTimer = setTimeout(showEnd, 1500);
      else hideEnd();
    }
    renderLobby();
    renderPause();
  });

  socket.on('roster', (list,visual=[]) => {
    kitCache.clear();
    for(const e of visual)toon.ingest(e,{t:e.tick});
    ctx.font='700 5.5px "Chakra Petch", sans-serif';for(const p of list)p.labelWidth=ctx.measureText(p.name).width+5;
    roster = new Map(list.map(p => [p.id, p]));
    const me = list.find(p => p.sid === socket.id);
    myPid = me ? me.id : 0;
  });

  function receiveSnapshot(s) {
    const fresh=netClock.receive(s.t,performance.now());
    if(s.e)for(const e of s.e)if(eventGate.accept(e,s.t))handleEvent(e,s);
    if(!fresh)return;
    snaps.push(s);
    if (snaps.length > 600) snaps.splice(0, snaps.length - 600);
    if (s.s !== lastState) {
      if (lastState === 'goal') stopReplay();
      lastState = s.s; stateTick = s.t;
    }
    updateHud(s);
  }
  // Diagnóstico optativo: ?latency=100&jitter=30 retrasa la recepción local; ?stall=250 la frena cada ~2 s y
  // entrega todo junto (como un celular con wifi flojo). ?netdiag=1 resume la red en consola cada 5 s.
  const netParams=new URLSearchParams(location.search),testLatency=clamp(+netParams.get('latency')||0,0,500),testJitter=clamp(+netParams.get('jitter')||0,0,100),testStall=clamp(+netParams.get('stall')||0,0,1000);
  let stateTick=0,stallUntil=0;const held=[];
  // Cola en orden como TCP: un snapshot demorado nunca queda detrás de uno posterior.
  const drain=()=>{const now=performance.now();while(held.length&&held[0].due<=now){const h=held.shift();if(h.epoch===networkEpoch)receiveSnapshot(h.s);}if(held.length)setTimeout(drain,held[0].due-now);};
  socket.on('s',s=>{
    const now=performance.now();
    if(testStall&&now%2000<testStall)stallUntil=Math.max(stallUntil,now-now%2000+testStall);
    const wait=Math.max(testLatency+Math.sin(s.t*1.7)*testJitter,stallUntil-now,0);
    if(!wait&&!held.length)return receiveSnapshot(s);
    held.push({s,epoch:networkEpoch,due:Math.max(now+wait,held.length?held[held.length-1].due:0)});
    if(held.length===1)setTimeout(drain,wait);
  });
  // Jugador propio adelantado a "ahora" con sus inputs (continuity.createPredictor); el resto sigue interpolado.
  // lead = predicción - interpolación; su peso sube y baja en 150 ms al entrar o salir de la marcha normal
  // (barrida, caída, saque), así no hay salto. ?predict=0 la apaga para comparar.
  const predictOn=netParams.get('predict')!=='0';let leadX=0,leadY=0,leadW=0;
  function predictMe(view,now,dt){
    const last=snaps[snaps.length-1],prev=snaps[snaps.length-2],info=roster.get(myPid),me=myPid&&row(view,myPid);
    if(!me)return;
    const p=prev&&info&&info.kind==='field'&&roomInfo&&roomInfo.pace&&last.s==='play'&&view.state==='play'&&!(last.rp===myPid&&!(bits&DIRS))
      ?predictor.predict(last,prev,myPid,(last.t+netClock.offset)*TICK_MS-rttEst,now,roomInfo.pace,W,H,!!pitch.wall):null;
    if(p){leadX=p.x-me.x;leadY=p.y-me.y;leadW=Math.min(1,leadW+dt/.15);me.face=p.face;me.speed=Math.min(7.5,Math.hypot(p.vx,p.vy));}
    else leadW=Math.max(0,leadW-dt/.15);
    const w=C.ease(leadW),dx=leadX*w,dy=leadY*w;me.x+=dx;me.y+=dy;
    if(view.owner===myPid){view.ball.x+=dx;view.ball.y+=dy;}
    if(netDiag&&p){netDiag.predFrames++;netDiag.maxLead=Math.max(netDiag.maxLead,Math.hypot(leadX,leadY));}
  }
  const row=(view,id)=>{for(const p of view.players)if(p.id===id)return p;return null;};
  const netDiag=netParams.has('netdiag')?{frames:0,playJumps:0,setJumps:0,resumeJumps:0,maxPlayStep:0,predFrames:0,maxLead:0}:null;
  if(netDiag)setInterval(()=>{
    if(!inGame())return;const c=netClock.takeStats();
    console.info('[netdiag]',JSON.stringify({...netDiag,maxPlayStep:+netDiag.maxPlayStep.toFixed(1),maxLead:+netDiag.maxLead.toFixed(1),rttMs:Math.round(rttEst),packets:c.packets,stale:c.stale,maxArrivalMs:Math.round(c.maxArrival),maxTickGap:c.maxTickGap,bufferMs:Math.round(netClock.delay*TICK_MS),minDepthTicks:+c.minDepth.toFixed(1),holdFrames:c.holds,resumes:c.resumes,transport:socket.io.engine&&socket.io.engine.transport.name}));
    Object.assign(netDiag,{frames:0,playJumps:0,setJumps:0,resumeJumps:0,maxPlayStep:0,predFrames:0,maxLead:0});
  },5000);

  // ---------- Menú y lobby ----------
  $('name').value = profile.name;
  $('num').value = profile.num;
  if (/^#[A-Za-z0-9]{4}$/.test(location.hash)) $('joinCode').value = location.hash.slice(1).toUpperCase();

  // En táctil pedimos pantalla completa + horizontal (Android); iOS lo ignora y queda el aviso de girar.
  const goLandscape = () => { if (!matchMedia('(pointer: coarse)').matches) return; try { const fs = document.documentElement.requestFullscreen?.(); (fs || Promise.resolve()).then(() => screen.orientation?.lock?.('landscape')).catch(() => {}); } catch {} };
  $('btnCreate').onclick = () => {
    goLandscape(); audio.init(); readProfile(); toon.reset(); resetNetwork();
    socket.emit('create', { pitch: +$('pitch').value, mode: +$('mode').value, minutes: +$('minutes').value, cid, profile }, res => {
      onJoined(res);
      if(res?.ok){const t=+$('menuTeam').value;socket.emit('settings',{teams:[t,t===1?0:1]});}
    });
  };
  $('btnJoin').onclick = () => {
    const code = $('joinCode').value.trim().toUpperCase();
    if (code.length !== 4) return msg('menuMsg', 'El código tiene 4 caracteres');
    goLandscape(); audio.init(); readProfile(); toon.reset(); resetNetwork();
    socket.emit('join', { code, cid, profile }, onJoined);
  };
  $('joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnJoin').click(); });

  $('num').addEventListener('input', () => { readProfile(); socket.emit('profile', profile); drawKit(); });
  for (const btn of document.querySelectorAll('.joinTeam')) btn.onclick = () => socket.emit('team', +btn.dataset.team);
  // Elegir cancha sugiere su cantidad típica (sala 4 + arquero, fútbol 7 6 + arquero).
  for (const id of ['pitch', 'lobbyPitch']) PITCHES.forEach((pt, i) => $(id).add(new Option(pt.name, i)));
  for (const id of ['mode', 'lobbyMode']) for (const n of MODES) $(id).add(new Option(`${n} vs ${n}`, n));
  $('mode').value = PITCHES[0].mode;
  TEAMS.forEach((tm,i)=>$('menuTeam').add(new Option(tm.name,i)));
  $('menuTeam').value=TEAMS[store.get('garra-team')]?store.get('garra-team'):0;
  $('menuTeam').onchange=()=>{store.set('garra-team',+$('menuTeam').value);theme(TEAMS[+$('menuTeam').value]);};
  theme(TEAMS[+$('menuTeam').value]);
  $('pitch').onchange = () => { $('mode').value = PITCHES[+$('pitch').value].mode; };
  $('lobbyPitch').onchange = () => { const i = +$('lobbyPitch').value; socket.emit('settings', { pitch: i, mode: PITCHES[i].mode }); };
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
    roomInfo = rejoin = null;
    history.replaceState(null, '', location.pathname);
    setMenu(false);
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
      const s=document.documentElement.style;s.setProperty('--team-'+t+'-c1',k.c1);s.setProperty('--team-'+t+'-ink',ink(k.c1));
      s.setProperty(t?'--blue':'--red',k.c1);
      $('teamCard'+t).style.borderColor=k.c1;
      $('teamName'+t).style.color=ink(k.c1);
    }
    for (const btn of document.querySelectorAll('.joinTeam')) {
      const t = +btn.dataset.team;
      btn.textContent = 'Jugar con ' + TEAMS[r.teams[t]].name;
      const count = r.members.filter(m => m.team === t).length;
      btn.disabled = !me || me.team === t || count >= r.mode;
    }
    $('lobbyMode').value = r.mode;
    theme(teamKit(me?me.team:0));
    $('lobbyPitch').value = r.pitch;
    $('lobbyMinutes').value = r.minutes;
    $('lobbyMode').disabled = $('lobbyPitch').disabled = $('lobbyMinutes').disabled = !isHost;
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
    g.scale(1,1/TILT);
    FootballPlayer3D.draw(g,{x:0,y:0,face:Math.PI/2-.5,st:'run',flags:0},info,makeKit(info),{speed:0},{time:performance.now()});
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
  function sendInput() { socket.emit('input', bits); predictor.input(bits, performance.now()); }
  function setBit(bit, on) {
    const nb = on ? bits | bit : bits & ~bit;
    if (nb === bits) return;
    bits = nb;
    sendInput();
  }
  function releaseAll() { if (bits) { bits = 0; sendInput(); } }

  // ---------- Menú de pausa ----------
  // Online el partido no se frena para uno solo: abrir el menú suelta los controles.
  // El anfitrión puede pausarlo de verdad para todos.
  let menuOpen = false;
  function setMenu(on) {
    menuOpen = on;
    if (on) releaseAll(); else $('help').classList.remove('show');
    $('game').classList.toggle('menu-open', on);
    $('pauseMenu').classList.toggle('show', on);
    renderPause();
  }
  function renderPause() {
    const r = roomInfo, host = !!r && r.host === socket.id, live = !!r && r.state !== 'lobby' && r.state !== 'ended';
    const hostName = r && (r.members.find(m => m.id === r.host) || {}).name;
    $('pausedTag').classList.toggle('show', !!r && r.paused && !menuOpen);
    $('pausedBy').textContent = host ? 'tocá II para seguir' : `la pausó ${hostName || 'el anfitrión'}`;
    $('btnPauseAll').style.display = $('btnEndMatch').style.display = host && live ? '' : 'none';
    $('btnPauseAll').textContent = r && r.paused ? 'Reanudar para todos' : 'Pausar para todos';
    $('btnSound').textContent = 'Sonido: ' + (audio.muted ? 'no' : 'sí');
    const tr = socket.io.engine && socket.io.engine.transport.name;
    const net = `Conexión: ${tr === 'websocket' ? 'WebSocket' : 'lenta (polling)'}${rtt ? ` · ${Math.round(rtt)} ms` : ''}`;
    $('pauseNote').textContent = (r && r.paused ? 'Partido en pausa.' : 'El partido sigue corriendo: tu jugador queda quieto mientras estás acá.') + ' ' + net;
  }
  $('btnPause').addEventListener('click', () => setMenu(!menuOpen));
  $('btnResume').onclick = () => setMenu(false);
  $('btnPauseAll').onclick = () => socket.emit('pause', !(roomInfo && roomInfo.paused));
  $('btnSound').onclick = () => { audio.init(); audio.toggleMute(); renderPause(); };
  $('btnControls').onclick = () => $('help').classList.toggle('show');
  $('btnEndMatch').onclick = () => { setMenu(false); socket.emit('toLobby'); };
  $('btnQuit').onclick = () => $('btnLeave').click();

  addEventListener('keydown', e => {
    if (!inGame()) return;
    if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); return setMenu(!menuOpen); }
    if (e.code === 'KeyH') return $('help').classList.toggle('show');
    if (e.code === 'KeyM') { audio.toggleMute(); return renderPause(); }
    if (menuOpen) return;
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
  const transitionCv=document.createElement('canvas'),transitionCtx=transitionCv.getContext('2d'),sceneBlend=C.createBlend();
  let painted=false;
  function transitionScene(){
    if(!painted)return;
    if(transitionCv.width!==cv.width||transitionCv.height!==cv.height){transitionCv.width=cv.width;transitionCv.height=cv.height;}
    transitionCtx.setTransform(1,0,0,1,0,0);transitionCtx.clearRect(0,0,transitionCv.width,transitionCv.height);transitionCtx.drawImage(cv,0,0);sceneBlend.begin();
    ballTrail.clear();lastBallPos=null;clearEffects(particles,particlePool);clearEffects(floaters,floaterPool);clearEffects(rings,ringPool);
  }
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('mousedown', () => audio.init());

  // Controles táctiles (visibles con puntero táctil o ventana angosta vía CSS)
  const DIRS = B.UP | B.DOWN | B.LEFT | B.RIGHT;
  function setDir(mask) {
    const nb = (bits & ~DIRS) | mask;
    if (nb !== bits) { bits = nb; sendInput(); }
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
  const passBtn = document.querySelector('.tbtns [data-b="PASS"]');
  const stick = $('stick'), knob = stick.firstElementChild;
  // 8 sectores de 45° (el protocolo manda 4 bits de dirección). Antes cada eje pedía el 40% del radio:
  // había que empujar mucho para arrancar y una diagonal pedía ~57%. Ahora zona muerta radial chica y
  // margen entre sectores para que el pulgar en el borde no haga titilar la dirección.
  const SECTORS = [B.RIGHT, B.RIGHT | B.DOWN, B.DOWN, B.DOWN | B.LEFT, B.LEFT, B.LEFT | B.UP, B.UP, B.UP | B.RIGHT];
  let stickId = null, stickRect = null, sector = -1;
  function moveStick(e) {
    const r = stickRect, R = r.width / 2; // medido al tocar: leerlo en cada pointermove fuerza layout
    let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R);
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    if (d < R * (sector < 0 ? 0.22 : 0.15)) { sector = -1; return setDir(0); }
    const a = Math.atan2(dy, dx);
    if (sector < 0 || Math.abs(C.angle(sector * Math.PI / 4, a)) > Math.PI / 8 + 0.15) sector = (Math.round(a / (Math.PI / 4)) + 8) % 8;
    setDir(SECTORS[sector]);
  }
  stick.addEventListener('pointerdown', e => {
    e.preventDefault(); audio.init();
    stickId = e.pointerId; stickRect = stick.getBoundingClientRect(); sector = -1; moveStick(e); stick.setPointerCapture(stickId);
  });
  stick.addEventListener('pointermove', e => { if (e.pointerId === stickId) moveStick(e); });
  const stickUp = e => {
    if (e.pointerId !== stickId) return;
    stickId = null; knob.style.transform = ''; setDir(0);
  };
  stick.addEventListener('pointerup', stickUp);
  stick.addEventListener('pointercancel', stickUp);

  // ---------- Interpolación ----------
  function sample(list,t){return (list===snaps?liveSampler:replaySampler).sample(list,t);}

  // ---------- Cancha pre-renderizada ----------
  // Estilos por cancha: fondo exterior, piso, tribuna con hinchas o no.
  const LOOKS = {
    estadio: { bg: '#151a24', base: '#1d5f29', stripes: ['#2a8435', '#2f8f3a'], fans: 22000, grain: 'rgba(180,255,170,' },
    sintetico: { bg: '#1b2b22', base: '#1f7a34', stripes: ['#2c9a43', '#33a64a'], fans: 0, grain: 'rgba(200,255,190,' },
    parquet: { bg: '#2a2d36', base: '#b5763d', stripes: ['#c98a4b', '#c2824a'], fans: 0, grain: 'rgba(255,230,190,' },
    jaula: { bg: '#293a3b', base: '#777d79', stripes: ['#858c85','#818981'], fans: 0, grain: 'rgba(245,240,216,' },
    potrero: { bg: '#59543c', base: '#987146', stripes: ['#ad8554','#a78050'], fans: 0, grain: 'rgba(239,215,154,' },
    azotea: { bg: '#b67e83', base: '#627b87', stripes: ['#738d96','#6b858f'], fans: 0, grain: 'rgba(255,213,168,' },
  };
  const fieldCv = document.createElement('canvas');
  let fieldVersion=0;
  function buildField() {
    const version=++fieldVersion;
    fieldCv.width = (W + FM * 2) * FS;
    fieldCv.height = (H + FM * 2) * FS;
    const g = fieldCv.getContext('2d'), L = LOOKS[pitch.look] || LOOKS.estadio;
    g.scale(FS, FS);
    g.translate(FM, FM);
    const GM = pitch.wall ? 0 : 64; // en la calle el entorno empieza detrás de la pared
    g.fillStyle = L.bg;
    if(pitch.look==='azotea'){
      const sky=g.createLinearGradient(0,-FM,0,0);sky.addColorStop(0,'#70566e');sky.addColorStop(1,'#efb17f');g.fillStyle=sky;
    }
    g.fillRect(-FM, -FM, W + FM * 2, H + FM * 2);
    const fans = ['#d62828', '#f4f4f4', '#1d4ed8', '#ffd23f', '#2b2b2b', '#7cc0ea', '#f1c27d', '#8d5524', '#0a8f3c'];
    for (let i = 0; i < L.fans; i++) {
      const x = rnd(-FM, W + FM), y = rnd(-FM, H + FM);
      if (x > -GM - 2 && x < W + GM + 2 && y > -GM - 2 && y < H + GM + 2) continue;
      g.fillStyle = pick(fans);
      g.fillRect(x, y, 1.8, 2.4);
    }
    g.fillStyle = L.base;
    g.fillRect(-GM, -GM, W + GM * 2, H + GM * 2);
    const sw = pitch.look === 'parquet' ? 16 : 50; // tablas de madera o franjas de corte
    for (let i = 0, x = -GM; x < W + GM; x += sw, i++) {
      g.fillStyle = L.stripes[i % 2];
      g.fillRect(x, -GM, Math.min(sw, W + GM - x), H + GM * 2);
    }
    if (pitch.look === 'parquet') { g.fillStyle = 'rgba(28,98,190,0.82)'; g.fillRect(0, 0, W, H); } // pista pintada
    // corte cruzado del césped (damero suave) + luz de focos desde arriba
    for (let i = 0, y = -GM; y < H + GM; y += 64, i++) {
      if (i % 2) { g.fillStyle = 'rgba(255,255,255,0.035)'; g.fillRect(-GM, y, W + GM * 2, Math.min(64, H + GM - y)); }
    }
    const light = g.createLinearGradient(0, -GM, 0, H + GM);
    light.addColorStop(0, 'rgba(255,255,220,0.07)'); light.addColorStop(0.5, 'rgba(0,0,0,0)'); light.addColorStop(1, 'rgba(0,0,0,0.12)');
    g.fillStyle = light;
    g.fillRect(-GM, -GM, W + GM * 2, H + GM * 2);
    for (let i = 0; i < 14000; i++) {
      g.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${Math.random() * 0.08})` : `${L.grain}${Math.random() * 0.06})`;
      g.fillRect(rnd(-GM, W + GM), rnd(-GM, H + GM), 1.2, 1.6);
    }
    // vallas publicitarias
    const ads = ['GARRA FC', 'SOCKET.IO', 'CANVAS 2D', 'GOLAZO', 'WEB AUDIO', 'LA CROQUETA'];
    g.font = '700 11px "Chakra Petch", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0, x = 0; !pitch.wall && x < W; x += 125, i++) {
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
    g.beginPath(); g.arc(CX, CY, pitch.circle, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(CX, CY, 3, 0, Math.PI * 2); g.fill();
    const arcA = Math.acos(Math.min(1, (BOX_D - PEN_SPOT) / 80));
    for (const s of pitch.area===false?[]:[0, 1]) {
      const x0 = s ? W : 0, dir = s ? -1 : 1;
      g.strokeRect(s ? W - BOX_D : 0, BOX_TOP, BOX_D, BOX_BOT - BOX_TOP);
      if (pitch.smallH) g.strokeRect(s ? W - pitch.small : 0, CY - pitch.smallH / 2, pitch.small, pitch.smallH);
      g.beginPath(); g.arc(x0 + dir * PEN_SPOT, CY, 2.6, 0, Math.PI * 2); g.fill();
      if (pitch.look === 'parquet') continue; // en sala no hay medialuna
      g.beginPath();
      if (s) g.arc(W - PEN_SPOT, CY, 80, Math.PI - arcA, Math.PI + arcA);
      else g.arc(PEN_SPOT, CY, 80, -arcA, arcA);
      g.stroke();
    }
    for (const [x, y, a0] of [[0, 0, 0], [W, 0, Math.PI / 2], [W, H, Math.PI], [0, H, Math.PI * 1.5]]) {
      g.beginPath(); g.arc(x, y, 9, a0, a0 + Math.PI / 2); g.stroke();
    }
    if(pitch.look==='potrero'){
      for(let i=0;i<65;i++){const x=(i*173%W),y=(i*97%H);g.fillStyle='#697b48';g.fillRect(x,y,4+i%6,2);}
      for(const [x,y] of [[W*.24,H*.7],[W*.78,H*.21]]){g.fillStyle='#71888b';g.beginPath();g.ellipse(x,y,24,9,.15,0,Math.PI*2);g.fill();}
    }
    if(pitch.look==='jaula'){
      g.strokeStyle='#4b5651';g.lineWidth=1;g.beginPath();g.moveTo(W*.1,H*.2);g.lineTo(W*.35,H*.3);g.lineTo(W*.41,H*.23);g.stroke();
    }
    if(pitch.look==='azotea'){
      g.strokeStyle='#e5a16e';g.lineWidth=5;g.strokeRect(15,15,W-30,H-30);
    }
    if(pitch.wall)StreetField.render(pitch,FM,K).then(canvas=>{
      if(version!==fieldVersion)return;
      const g=fieldCv.getContext('2d');g.save();g.setTransform(1,0,0,1,0,0);g.drawImage(canvas,0,0,fieldCv.width,fieldCv.height);g.restore();
    }).catch(e=>console.error('Decoración de cancha:',e));
  }
  buildField();

  // ---------- Dibujo ----------
  // Cámara 3/4 estilo TV: el suelo se achata en Y (TILT) y la altura z sube en pantalla K unidades por unidad.
  let cw = 0, ch = 0;
  function resize() {
    transitionScene();
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
  const inkCache=new Map();
  const ink=h=>{let c=inkCache.get(h);if(!c){const n=parseInt(h.slice(1),16);c=.299*(n>>16)+.587*((n>>8)&255)+.114*(n&255)>150?'#111':'#fff';inkCache.set(h,c);}return c;};
  function teamKit(slot) {
    const ids = roomInfo ? roomInfo.teams : [0, 1];
    // el visitante usa la suplente si las camisetas se parecen
    return teamKitFor(ids,slot);
  }
  function gkCol(slot) {
    const k = [teamKit(0).c1, teamKit(1).c1];
    const ok = ['#2b2b2b', '#9b5de5', '#22c55e', '#f4c430', '#ff66cc'].filter(c => k.every(x => colDist(c, x) > 120));
    return ok[slot] || ok[0];
  }
  const kitCache=new Map();
  function makeKit(info) {
    if (info.kind === 'gk') { const c = gkCol(info.team); return { c1: c, c2: ink(c), pat: 'liso', sh: '#1a1a1a', so: c, gk: true }; }
    return teamKit(info.team);
  }

  function kitOf(info){let kit=kitCache.get(info.id);if(!kit){kit=makeKit(info);kitCache.set(info.id,kit);}return kit;}

  // ---------- Jugadores: mallas 3D articuladas, proyectadas sobre la cancha ----------
  function drawPlayer(g, p, info, a) {
    if (!info) return;
    const options=a.drawOptions||(a.drawOptions={time:0,fx:null});options.time=renderTime;options.fx=toon.options(p,info,renderTick,curState);
    const fx=options.fx;
    g.save(); g.globalAlpha*=p.alpha??1; g.translate(p.x, p.y); g.scale(1, 1 / TILT);
    FootballPlayer3D.draw(g,p,info,kitOf(info),a,options);
    g.restore();
    g.save();g.globalAlpha*=p.alpha??1;toon.draw(g,p,a,fx);g.restore();
  }

  const shadowSprite=document.createElement('canvas'),ballSprite=document.createElement('canvas');
  shadowSprite.width=64;shadowSprite.height=40;ballSprite.width=ballSprite.height=64;
  {const g=shadowSprite.getContext('2d'),gradient=g.createRadialGradient(32,20,0,32,20,30);gradient.addColorStop(0,'rgba(0,0,0,.42)');gradient.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gradient;g.fillRect(0,0,64,40);}
  {const g=ballSprite.getContext('2d'),gradient=g.createRadialGradient(21,19,3,32,32,30);gradient.addColorStop(0,'#fff');gradient.addColorStop(.6,'#e9e9e9');gradient.addColorStop(1,'#9a9a9a');g.fillStyle=gradient;g.beginPath();g.arc(32,32,31,0,Math.PI*2);g.fill();}
  function drawShadow(p, v) {
    const long = p.st === 'slide' || p.st === 'down' || p.st === 'dive';
    ctx.save();
    ctx.translate(p.x+3,p.y+2);if(long)ctx.rotate(p.face);
    ctx.drawImage(shadowSprite,long?-15:-10,long?-7:-5.5,long?30:20,long?14:11);ctx.restore();
    const t = visualTime;
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
      ctx.setLineDash(DASH_SHORT); ctx.lineDashOffset = -t / 60;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 11, 7.7, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash(DASH_NONE);
    }
  }

  let ballRoll = 0,lastBallPos=null;const ballTrail=C.createTrail(10),ballPosition={x:0,y:0};
  // estela: últimas posiciones del balón, visible solo cuando va rápido
  function drawBallTrail(b,dt){
    if(b.alpha<.01){ballTrail.clear();return;}
    const y=b.y-b.z*K;ballTrail.update(b.x,y,dt/60);if(ballTrail.count<2)return;
    const a=ballTrail.point(0),spd=Math.hypot(b.x-a.x,y-a.y)/ballTrail.count;if(spd<4)return;
    ctx.save();ctx.strokeStyle='#fff';ctx.lineCap='round';
    for(let i=1;i<ballTrail.count;i++){const p0=ballTrail.point(i-1),p1=ballTrail.point(i),k=i/ballTrail.count;ctx.globalAlpha=k*clamp((spd-4)/8,0,.45)*(b.alpha??1);ctx.lineWidth=4.5*k;ctx.beginPath();ctx.moveTo(p0.x,p0.y);ctx.lineTo(p1.x,p1.y);ctx.stroke();}ctx.restore();
  }
  function drawBallShadow(b) {
    const z = b.z;
    ctx.save();ctx.globalAlpha=clamp(.38-z/180,.1,.38)*(b.alpha??1);ell(ctx,b.x+z*.25+1,b.y+1,3.4+z*.02,2.6+z*.015,'#000');ctx.restore();
  }
  function drawBall(b) {
    if (lastBallPos) ballRoll += Math.hypot(b.x - lastBallPos.x, b.y - lastBallPos.y) / 3.4;
    ballPosition.x=b.x;ballPosition.y=b.y;lastBallPos=ballPosition;
    const r = 3 * (1 + b.z / 120);
    ctx.save();
    ctx.globalAlpha*=b.alpha??1;
    ctx.translate(b.x, b.y - b.z * K);
    ctx.scale(1, 1 / TILT);
    ctx.drawImage(ballSprite,-r,-r,r*2,r*2);ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);
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
  function makeNet(gx,side){
    const fill=new Path2D(),grid=new Path2D(),x1=gx+side*GOAL_DEPTH,h=GOAL_H*.7;
    const planes=[[[x1,GOAL_TOP,0],[x1,GOAL_BOT,0],[x1,GOAL_BOT,h],[x1,GOAL_TOP,h]],[[gx,GOAL_TOP,0],[x1,GOAL_TOP,0],[x1,GOAL_TOP,h],[gx,GOAL_TOP,GOAL_H]],[[gx,GOAL_BOT,0],[x1,GOAL_BOT,0],[x1,GOAL_BOT,h],[gx,GOAL_BOT,GOAL_H]],[[gx,GOAL_TOP,GOAL_H],[gx,GOAL_BOT,GOAL_H],[x1,GOAL_BOT,h],[x1,GOAL_TOP,h]]];
    for(const plane of planes){const v=plane.map(p=>[p[0],p[1]-p[2]*K]);fill.moveTo(v[0][0],v[0][1]);for(let i=1;i<4;i++)fill.lineTo(v[i][0],v[i][1]);fill.closePath();
      for(let i=0;i<=10;i++){const t=i/10;grid.moveTo(lerp(v[0][0],v[1][0],t),lerp(v[0][1],v[1][1],t));grid.lineTo(lerp(v[3][0],v[2][0],t),lerp(v[3][1],v[2][1],t));grid.moveTo(lerp(v[0][0],v[3][0],t),lerp(v[0][1],v[3][1],t));grid.lineTo(lerp(v[1][0],v[2][0],t),lerp(v[1][1],v[2][1],t));}}
    return {fill,grid,x:Math.min(gx,x1)};
  }
  let leftNet=makeNet(0,-1),rightNet=makeNet(W,1);
  function drawNet(gx){if(pitch.look==='potrero')return;const n=gx===0?leftNet:rightNet;ctx.fillStyle='rgba(0,0,0,.2)';ctx.fillRect(n.x,GOAL_TOP,GOAL_DEPTH,GOAL_BOT-GOAL_TOP);ctx.fillStyle='rgba(255,255,255,.07)';ctx.fill(n.fill);ctx.strokeStyle='rgba(255,255,255,.32)';ctx.lineWidth=.4;ctx.stroke(n.grid);}
  // palo lejano + travesaño (se ordena en y=GOAL_TOP) y palo cercano (en y=GOAL_BOT)
  function drawPost(gx, y, bar) {
    if(pitch.look==='potrero')return; // las piedras y mochilas marcan el arco
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(gx,y);ctx.lineTo(gx,y-GOAL_H*K);
    if(bar)ctx.lineTo(gx,GOAL_BOT-GOAL_H*K);
    ctx.stroke();
  }

  // ---------- Partículas / textos flotantes / confeti ----------
  const particles=[],floaters=[],confetti=[],rings=[];
  const particlePool=C.createPool(600),floaterPool=C.createPool(32),confettiPool=C.createPool(520),ringPool=C.createPool(48);
  const GRASS=['#3fa34d','#2d7a36','#6b4f2a','#8fd18f','#245e2c'];
  let eventTick=0;
  function clearEffects(list,pool){while(list.length)pool.release(list.pop());}
  function drawRings(){
    let n=0;ctx.save();ctx.strokeStyle='#fff';
    for(const r of rings){const age=renderTick-r.born;if(age<0){rings[n++]=r;continue;}if(age>=r.max){ringPool.release(r);continue;}rings[n++]=r;
      const k=age/r.max;ctx.globalAlpha=C.envelope(age,r.max,2,8)*.7;ctx.lineWidth=1.4*(1-k)+.3;
      ctx.beginPath();ctx.ellipse(r.x,r.y,3+k*r.size,(3+k*r.size)*.7,0,0,Math.PI*2);ctx.stroke();
    }rings.length=n;ctx.restore();
  }
  function spawnGrass(x,y,n,spread,tick=eventTick){
    for(let i=0;i<n;i++){const q=particlePool.take();if(!q)break;
      q.x=x;q.y=y;q.z=0;q.vx=rnd(-1,1)*spread;q.vy=rnd(-1,1)*spread;q.vz=rnd(.6,2.2);q.max=rnd(20,45);q.born=q.lastTick=tick;q.c=pick(GRASS);particles.push(q);
    }
  }
  function drawParticles(){
    let n=0;ctx.save();
    for(const q of particles){const age=renderTick-q.born;if(age<0){particles[n++]=q;continue;}if(age>=q.max){particlePool.release(q);continue;}
      C.stepParticle(q,renderTick-q.lastTick);q.lastTick=renderTick;particles[n++]=q;
      ctx.globalAlpha=C.envelope(age,q.max,2,10);ctx.fillStyle=q.c;ctx.fillRect(q.x,q.y-q.z*K,1.5,1.5);
    }particles.length=n;ctx.restore();
  }
  function floater(text,id,x,y){const f=floaterPool.take();if(!f)return;f.text=text;f.id=id;f.x=x;f.y=y;f.born=eventTick;floaters.push(f);}
  function drawFloaters(v){
    let n=0;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='400 8px "Bungee", sans-serif';
    for(const f of floaters){const age=v.t-f.born;if(age<0){floaters[n++]=f;continue;}if(age>=80){floaterPool.release(f);continue;}floaters[n++]=f;
      const p=f.id?v.byId.get(f.id):null,x=p?p.x:f.x,y=p?p.y:f.y,ty=-44-age*.12;if(x===undefined)continue;
      ctx.save();ctx.translate(x,y);ctx.scale(1,1/TILT);ctx.globalAlpha=C.envelope(age,80,3,25)*(p?.alpha??1);ctx.lineWidth=2.4;ctx.strokeStyle='#000';ctx.strokeText(f.text,0,ty);ctx.fillStyle='#ffd23f';ctx.fillText(f.text,0,ty);ctx.restore();
    }floaters.length=n;
  }
  function spawnConfetti(team){
    const k=teamKit(team);
    for(let i=0;i<260;i++){const c=confettiPool.take();if(!c)break;c.x=rnd(0,1000);c.y=rnd(-600,0);c.vx=rnd(-2,2);c.vy=rnd(2,6);c.rot=rnd(0,6);c.vr=rnd(-.3,.3);c.w=rnd(6,12);c.h=rnd(3,7);c.c=i%4===0?k.c1:i%4===1?k.c2:i%4===2?'#ffd23f':'#ffffff';c.life=c.max=rnd(160,260);confetti.push(c);}
  }
  function drawConfetti(dt){
    let n=0;
    for(const c of confetti){C.stepConfetti(c,dt);if(c.life<=0||c.y>=1020){confettiPool.release(c);continue;}confetti[n++]=c;
      ctx.save();ctx.globalAlpha=C.envelope(c.max-c.life,c.max,4,30)*C.ease((1020-c.y)/100);ctx.translate(c.x/1000*cw,c.y/1000*ch);ctx.rotate(c.rot);ctx.fillStyle=c.c;ctx.fillRect(-c.w/2,-c.h/2,c.w,Math.abs(Math.cos(c.rot*2))*c.h+1);ctx.restore();
    }confetti.length=n;
  }

  // ---------- Banners y eventos ----------
  let bannerTimer = 0;
  function banner(title, sub, cls, ms = 1500) {
    const el = $('banner');
    const showing=el.classList.contains('show');
    el.className = 'banner ' + (cls || '')+(showing?' show':'');
    el.querySelector('b').textContent = title;
    el.querySelector('small').textContent = sub || '';
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
      transitionScene();replaySampler.reset();
      replay = { buf, t: buf[0].t, end: buf[buf.length - 1].t };
      $('replayTag').classList.add('show');
    }, 1700);
  }
  function stopReplay() {
    if(replay)transitionScene();
    replay = null;
    clearTimeout(replayTimer);
    $('replayTag').classList.remove('show');
  }

  let cam = C.createCamera(W,H);
  let curState = '', renderTick=0,renderTime=0,visualTime=0; // reloj visual de la simulación (también durante el replay)
  const GK_HINT = 'Apuntá · PASE (S) sacá · TIRO (D) despejá';
  const myTeam = () => { const me = roster.get(myPid); return me ? me.team : -1; };

  function handleEvent(e, s) {
    eventTick=e.tick??s.t;
    const q=s.p.find(p=>p[0]===(e.victim||e.id));
    toon.ingest({...e,x:e.x??q?.[1]??s.b[0],y:e.y??q?.[2]??s.b[1]},s);
    if(e.fall) audio.fall();
    switch (e.type) {
      case 'start':
        toon.reset();
        audio.whistle(1, 0.6); audio.crowdStart(); hideEnd(); stopReplay();
        banner('¡A JUGAR!', '', 'small', 1300);
        break;
      case 'kick':
        audio.kick(clamp(e.p / 18, 0.15, 1)); spawnGrass(e.x, e.y, 4 + (e.p | 0), 1.2);
        const ring=ringPool.take();if(ring){ring.x=e.x;ring.y=e.y;ring.born=eventTick;ring.max=18;ring.size=6+e.p*1.4;rings.push(ring);}
        break;
      case 'pass': if (e.to === myPid) floater('¡TUYA!', e.to); break;
      case 'shot': if (e.kind === 'potente') cam.shake = Math.max(cam.shake, 2.5); break;
      case 'slide': audio.slide(); break;
      case 'tackle': audio.tackle(); spawnGrass(e.x, e.y, 16, 2.5); floater('¡QUITE!', e.id); break;
      case 'foul':
        audio.whistle(1, 0.9); audio.ooh();
        banner(e.pen ? '¡PENAL!' : '¡FALTA!', pitch.wall ? 'PELOTA PARA EL RIVAL · SEGUÍ JUGANDO' : e.pen ? '' : 'TIRO LIBRE', 'small foul', pitch.wall?800:1800);
        spawnGrass(e.x, e.y, 20, 2.5);
        cam.shake = 3;
        break;
      case 'setpiece':
        if (e.kind === 'kickoff') audio.whistle(1, 0.5);
        if (pitch.wall && e.kind === 'goalkick') { banner(e.label,'','small t'+e.team,650); break; }
        if (e.kind === 'goalkick' && myTeam() === e.team) banner(e.label, GK_HINT, 'small t' + e.team, 2600);
        else if (['corner', 'goalkick', 'throw'].includes(e.kind)) banner(e.label, '', 'small t' + e.team, 1200);
        break;
      case 'dive': audio.swish(); break;
      case 'whistle': audio.whistle(1, 0.4); break;
      case 'post':
        audio.post(); audio.boing(); audio.ooh(); cam.shake = 4;
        floater(e.bar ? '¡TRAVESAÑO!' : '¡AL PALO!', 0, s.b[0], s.b[1]);
        break;
      case 'goal':
        audio.cheer(); audio.horn(); audio.whistle(1, 0.5);
        banner(e.own ? '¡EN CONTRA!' : '¡GOLAZO!', e.scorer ? (e.own ? 'Autogol de ' : '') + e.scorer : '', 'goal t' + e.team, 2600);
        spawnConfetti(e.team);
        cam.shake = 6;
        scheduleReplay(s.t);
        break;
      case 'skill': audio.swish(); floater(e.name, e.id); break;
      case 'shoulder': audio.boing(); if(!e.visualOnly)floater('¡CARGA!', e.id); break;
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
    g.beginPath(); g.arc(CX, CY, pitch.circle, 0, Math.PI * 2); g.stroke();
    g.strokeRect(0, BOX_TOP, BOX_D, BOX_BOT - BOX_TOP);
    g.strokeRect(W - BOX_D, BOX_TOP, BOX_D, BOX_BOT - BOX_TOP);
    const scale=ch/VIEW_H,vw=cam.vw||cw/scale,vh=cam.vh||ch/(scale*TILT);
    g.strokeStyle = 'rgba(255,210,63,0.5)';
    g.strokeRect(cam.x - vw / 2, cam.y - vh / 2, vw, vh);
    g.setTransform(1, 0, 0, 1, 0, 0);
    for (const p of v.players) {
      const info = roster.get(p.id);
      if (!info) continue;
      const x = m + p.x * sx, y = m + p.y * sy;
      g.globalAlpha=p.alpha??1;g.fillStyle = kitOf(info).c1;
      g.beginPath(); g.arc(x, y, p.id === myPid ? 5 : 3.6, 0, Math.PI * 2); g.fill();
      g.strokeStyle = p.id === myPid ? '#ffd23f' : 'rgba(0,0,0,0.7)'; g.lineWidth = p.id === myPid ? 2 : 1; g.stroke();
      if ((p.flags & 16) && v.state === 'play') {
        g.strokeStyle = '#7cf3ff'; g.lineWidth = 1.5;
        g.beginPath(); g.arc(x, y, 6 + Math.sin(v.t * 0.18) * 1.2, 0, Math.PI * 2); g.stroke();
      }
    }
    g.globalAlpha=v.ball.alpha??1;g.fillStyle = '#fff';
    g.beginPath(); g.arc(m + v.ball.x * sx, m + v.ball.y * sy, 2.6 + v.ball.z / 20, 0, Math.PI * 2); g.fill();g.globalAlpha=1;
  }

  // ---------- Bucle de render ----------
  const anim = new Map();
  function updateAnims(v, dt) {
    for (const p of v.players) {
      let a = anim.get(p.id);
      if (!a) anim.set(p.id, (a = { phase: p.id * 1.7, speed: 0, run: 0, sprint: 0, call: 0, px: p.x, py: p.y }));
      const dx = p.x - a.px, dy = p.y - a.py, d = Math.hypot(dx, dy);
      a.px = p.x; a.py = p.y;
      if (a.st !== p.st) { a.st = p.st; a.stAt = visualTime; }
      const sp = p.speed??(d > 40 || dt <= 0 ? 0 : d / dt);
      const blend = 1 - Math.pow(0.74, dt);
      const prevSpeed = a.speed;
      if(prevSpeed>2&&sp<.6)a.stopTick=v.t;
      a.speed += (Math.min(sp, 6) - a.speed) * blend;
      a.accel = clamp((a.speed - prevSpeed) / Math.max(dt, 0.01), -1, 1);
      if (d > 0.02 && d < 40) a.moveFace = angLerp(a.moveFace ?? p.face, Math.atan2(dy, dx), blend);
      if (d > 40) { a.moveFace = p.face; a.speed = 0; }

      FootballMotion.smoothWeights(a,p.st==='run'?clamp(a.speed/.6,0,1):0,p.st==='run'?clamp((a.speed-1.1)/1.3,0,1):0,(p.flags&2)&&p.st==='run'&&a.speed>.8?1:0,dt/60);
      a.call += (((p.flags & 16) && v.state === 'play' ? 1 : 0) - a.call) * blend;
      // Cadencia ligada al desplazamiento: zancadas más largas en vez de patinar con pasos diminutos.
      a.phase += (p.st === 'step' ? 0.65 : (0.105 + a.run * 0.1 + a.sprint * 0.055) * clamp(a.speed / 1.2, 0, 1)) * dt;
      a.grass=(a.grass||0)+(p.st==='slide'?1:(p.flags&2)?.08:0)*dt;
      while(a.grass>=1){a.grass--;spawnGrass(p.x+(p.st==='slide'?Math.cos(p.face)*10:0),p.y+(p.st==='slide'?Math.sin(p.face)*10:3),1,p.st==='slide'?1.5:.6,v.t);}
    }
  }

  function drawOverlays(v) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const me = roster.get(myPid), gi = roster.get(v.owner);
    // El botón PASE dice lo que hace: con la pelota del rival, barre
    const passLabel = me && gi && gi.team !== me.team ? 'BARRIDA' : 'PASE';
    if (passBtn.textContent !== passLabel) passBtn.textContent = passLabel;
    // Tu arquero tiene el balón: flecha hacia donde va a sacar (tus flechas, o hacia ti si no apuntas)
    if (me && gi && gi.kind === 'gk' && gi.team === me.team) {
      const gp = v.byId.get(gi.id), mp = v.byId.get(myPid);
      if (gp && mp && (gp.st === 'hold' || v.state === 'setpiece')) {
        let dx = (bits & B.RIGHT ? 1 : 0) - (bits & B.LEFT ? 1 : 0), dy = (bits & B.DOWN ? 1 : 0) - (bits & B.UP ? 1 : 0);
        if (!dx && !dy) { dx = mp.x - gp.x; dy = mp.y - gp.y; }
        const ang = Math.atan2(dy, dx), ex = gp.x + Math.cos(ang) * 70, ey = gp.y + Math.sin(ang) * 70;
        ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2; ctx.setLineDash(DASH_LONG);
        ctx.beginPath(); ctx.moveTo(gp.x, gp.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.setLineDash(DASH_NONE);
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath();
        ctx.moveTo(ex + Math.cos(ang) * 7, ey + Math.sin(ang) * 7);
        ctx.lineTo(ex + Math.cos(ang + 2.4) * 6, ey + Math.sin(ang + 2.4) * 6);
        ctx.lineTo(ex + Math.cos(ang - 2.4) * 6, ey + Math.sin(ang - 2.4) * 6);
        ctx.fill();
        ctx.save();
        ctx.translate(gp.x, gp.y); ctx.scale(1, 1 / TILT);
        ctx.font = '400 6px "Bungee", sans-serif';
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(visualTime / 150);
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
      ctx.globalAlpha=p.alpha??1;ctx.translate(p.x, p.y); ctx.scale(1, 1 / TILT);
      if (info.sid) {
        const k = kitOf(info);
        ctx.font = '700 5.5px "Chakra Petch", sans-serif';
        const w = info.labelWidth||20;
        ctx.fillStyle = k.c1; ctx.fillRect(-w / 2, -43, w, 7);
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 0.5; ctx.strokeRect(-w / 2, -43, w, 7);
        ctx.fillStyle = ink(k.c1); ctx.fillText(info.name, 0, -39.4);
      }
      if (p.id === myPid) {
        const bob = Math.sin(visualTime / 160) * 1.5;
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
        for(let s=-1;s<=1;s+=2){
          const x = s * (24 + pulse * 1.3);
          limb(ctx, x, -3, x + s * 2, -5, 1, '#7cf3ff');
          limb(ctx, x + s * 1, 1, x + s * 4, 1, 1, '#7cf3ff');
        }
        ctx.restore();
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

  const itemPool=Array.from({length:27},()=>({y:0,p:null,post:null,ball:false,bar:false})),drawItems=[];
  const postLayout=()=>[{x:0,y:GOAL_TOP,bar:true},{x:0,y:GOAL_BOT,bar:false},{x:W,y:GOAL_TOP,bar:true},{x:W,y:GOAL_BOT,bar:false}];
  let POST_LAYOUT=postLayout();
  function setPitch(i) {
    pitch = PITCHES[i];
    ({ W, H, CX, CY, GOAL_TOP, GOAL_BOT, GOAL_H, BOX_D, BOX_TOP, BOX_BOT, PEN_SPOT } = pitchGeom(pitch));
    buildField(); leftNet = makeNet(0, -1); rightNet = makeNet(W, 1); POST_LAYOUT = postLayout(); cam = C.createCamera(W, H);
  }
  function render(v, dt) {
    const scale = ch / VIEW_H, vw = cw / scale, vh = ch / (scale * TILT);
    const me = v.byId.get(myPid);
    cam.update(v.ball.x,v.ball.y,me,!!replay,vw,vh,dt/60);
    const sx=cam.sx,sy=cam.sy;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#151a24';
    ctx.fillRect(0, 0, cw, ch);
    ctx.setTransform(scale, 0, 0, scale * TILT, cw / 2 - (cam.x + sx) * scale, ch / 2 - (cam.y + sy) * scale * TILT);
    ctx.drawImage(fieldCv, -FM, -FM, W + FM * 2, H + FM * 2);
    drawNet(0, -1);
    drawNet(W, 1);

    curState = v.state; renderTick=v.t;
    updateAnims(v, dt);
    for(const p of v.players){const info=roster.get(p.id),a=anim.get(p.id);if(!info||!a)continue;const o=a.drawOptions||(a.drawOptions={time:0,fx:null});o.time=renderTime;o.fx=toon.options(p,info,v.t,v.state);FootballPlayer3D.prepare(p,info,kitOf(info),a,o);}
    FootballPlayer3D.renderFrame(renderTime);
    drawRings(dt);
    for (const p of v.players){ctx.save();ctx.globalAlpha=p.alpha??1;drawShadow(p,v);ctx.restore();}
    drawBallShadow(v.ball);
    drawBallTrail(v.ball,dt);
    let count=0;
    for(const p of v.players){const o=itemPool[count];o.y=p.y;o.p=p;o.post=null;o.ball=false;drawItems[count++]=o;}
    {const o=itemPool[count];o.y=v.ball.y+.1;o.p=null;o.post=null;o.ball=true;drawItems[count++]=o;}
    for(const post of POST_LAYOUT){const o=itemPool[count];o.y=post.y;o.p=null;o.post=post.x;o.bar=post.bar;o.ball=false;drawItems[count++]=o;}
    drawItems.length=count;
    for(let i=1;i<count;i++){const o=drawItems[i];let j=i;while(j>0&&drawItems[j-1].y>o.y){drawItems[j]=drawItems[j-1];j--;}drawItems[j]=o;}
    for(const it of drawItems){if(it.ball)drawBall(v.ball);else if(it.post!==null)drawPost(it.post,it.y,it.bar);else drawPlayer(ctx,it.p,roster.get(it.p.id),anim.get(it.p.id));}
    drawParticles(dt);
    drawOverlays(v);
    drawFloaters(v, dt);
    toon.drawComics(ctx,v.t);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawVignette();
    drawConfetti(dt);
    drawRadar(v);
    const weight=sceneBlend.update(dt/60);
    if(weight>0){ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=weight;ctx.drawImage(transitionCv,0,0,cw,ch);ctx.globalAlpha=1;}
    painted=true;
  }

  let lastFrame = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(40, Math.max(0,now - lastFrame)) / TICK_MS;
    lastFrame = now;
    if(document.hidden||!inGame()||netClock.offset===null)return;
    renderTime=now;visualTime+=dt*TICK_MS;
    const liveTick=netClock.advance(now);if(netClock.resumed){transitionScene();clearEffects(confetti,confettiPool); }
    let view = null;
    if (replay) {
      replay.t += dt * 0.65;
      if (replay.t >= replay.end) stopReplay();
      else view = sample(replay.buf, replay.t);
    }
    if (!view) { view = sample(snaps, liveTick); if (view && predictOn) predictMe(view, now, dt / 60); }
    if(view){
      const shown=presentation.update(view,dt/60);if(shown.discontinuity)transitionScene();
      // Saltos legítimos (saque, gol, vuelta de segundo plano) aparte de los que ocurren en juego continuo.
      if(netDiag&&!replay){const play=!netClock.resumed&&shown.state==='play'&&shown.t-stateTick>90;netDiag.frames++;if(shown.discontinuity)netDiag[netClock.resumed?'resumeJumps':play?'playJumps':'setJumps']++;if(play)netDiag.maxPlayStep=Math.max(netDiag.maxPlayStep,shown.maxStep);}
      render(shown,dt);
    }
  }
  requestAnimationFrame(frame);
  drawKit();
})();
