// Movimiento propio inspirado en las transiciones de PES/eFootball.
// Referencias: konami.com/games/eu/es/topics/16014/ y pubmed.ncbi.nlm.nih.gov/7416353/
(function (root) {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const TAU = Math.PI * 2;
  // fase, avance del tobillo, altura, inclinación del botín.
  // Caminata: talón, apoyo, despegue, recuperación baja. Sprint: apoyo corto, talón alto, rodilla adelante.
  const WALK = [[0,3.2,0,-0.25],[0.12,2,0,0],[0.5,-2.5,0,0.1],[0.62,-3.2,0,0.65],[0.76,-1.8,1.4,0.25],[0.9,2,0.8,-0.2],[1,3.2,0,-0.25]];
  const JOG = [[0,3.8,0,0.05],[0.15,0,0,0],[0.36,-4.2,0,0.7],[0.52,-3.8,5.6,1],[0.68,0,5.4,0.3],[0.84,4.2,2.7,-0.25],[1,3.8,0,0.05]];
  const SPRINT = [[0,3.6,0,0.2],[0.1,0,0,0.2],[0.23,-4.8,0,0.85],[0.42,-4.3,7.6,1.1],[0.6,0.3,8,0.5],[0.78,5.5,4.3,-0.2],[0.9,5,1.5,-0.2],[1,3.6,0,0.2]];
  function curve(keys, t) {
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
    const a = keys[i], b = keys[i + 1], u = (t - a[0]) / (b[0] - a[0]);
    // Interpolación suave sin sobrepasar los apoyos ni atravesar el suelo.
    const k = u * u * (3 - 2 * u);
    return [mix(a[1],b[1],k),mix(a[2],b[2],k),mix(a[3],b[3],k)];
  }
  function leg(phase, moving, jog, sprint, hipHeight) {
    const t = ((phase / TAU) % 1 + 1) % 1;
    const w = curve(WALK,t), r = curve(JOG,t), s = curve(SPRINT,t);
    let f = mix(mix(w[0],r[0],jog),s[0],sprint) * moving;
    let h = mix(mix(w[1],r[1],jog),s[1],sprint) * moving;
    const pitch = mix(mix(w[2],r[2],jog),s[2],sprint) * moving;
    const length = 6.8, df = f, dh = h - hipHeight;
    const d = clamp(Math.hypot(df,dh),0.1,2 * length - 0.01);
    const angle = Math.atan2(dh,df), bend = Math.acos(d / (2 * length));
    f = Math.cos(angle) * d; h = hipHeight + Math.sin(angle) * d;
    return { footF:f, footH:h, kneeF:Math.cos(angle + bend)*length,
      kneeH:hipHeight + Math.sin(angle + bend)*length, pitch };
  }
  function body(phase, moving, jog, sprint) {
    const cycle = ((phase / TAU) % 0.5 + 0.5) % 0.5;
    // En caminata la cadera sube sobre el apoyo; en carrera baja al cargar y sube en vuelo.
    const walkHeight = 12.35 + Math.sin(cycle * TAU * 2) * 0.18;
    const runHeight = 10.9 - Math.sin(cycle * TAU * 2) * 0.65;
    const sprintHeight = 10.45 - Math.sin(cycle * TAU * 2) * 0.85;
    return { height:mix(12.35,mix(mix(walkHeight,runHeight,jog),sprintHeight,sprint),moving),
      lean:moving * mix(mix(0.025,0.13,jog),0.3,sprint),
      armSwing:mix(mix(0.28,0.65,jog),0.95,sprint), elbow:mix(mix(0.35,1.35,jog),1.55,sprint) };
  }
  root.FootballMotion = { leg, body };
})(typeof module !== 'undefined' ? module.exports : window);
