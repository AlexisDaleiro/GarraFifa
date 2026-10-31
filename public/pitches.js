// Canchas disponibles. Compartido por server.js (require) y el cliente (<script>).
// w/h tamaño, goal ancho del arco, gh alto del travesaño, box/boxH área grande, small/smallH área chica,
// pen punto penal, circle radio del círculo central, look estilo visual, mode jugadores sugeridos por equipo.
(function (root) {
  root.PITCHES = [
    { name: 'Jaula', w: 640, h: 400, goal: 72, gh: 34, box: 100, boxH: 220, small: 0, smallH: 0, pen: 70, circle: 48, look: 'jaula', mode: 3, wall: true, area: false },
    { name: 'Fútbol 7', w: 780, h: 500, goal: 84, gh: 38, box: 120, boxH: 270, small: 40, smallH: 150, pen: 90, circle: 62, look: 'sintetico', mode: 6 },
    { name: 'Fútbol sala', w: 620, h: 380, goal: 72, gh: 32, box: 90, boxH: 210, small: 0, smallH: 0, pen: 70, circle: 46, look: 'parquet', mode: 4, wall: true },
    { name: 'Potrero', w: 700, h: 440, goal: 76, gh: 32, box: 100, boxH: 220, small: 0, smallH: 0, pen: 70, circle: 48, look: 'potrero', mode: 5, wall: true, area: false },
    { name: 'Azotea', w: 560, h: 360, goal: 68, gh: 32, box: 90, boxH: 200, small: 0, smallH: 0, pen: 65, circle: 42, look: 'azotea', mode: 3, wall: true, area: false },
  ];
  // Jugadores de campo por equipo (el arquero lo maneja la CPU).
  root.MODES = [1, 2, 3, 4, 5, 6, 10];
  root.pitchGeom = p => ({
    W: p.w, H: p.h, CX: p.w / 2, CY: p.h / 2, GOAL_TOP: (p.h - p.goal) / 2, GOAL_BOT: (p.h + p.goal) / 2, GOAL_H: p.gh,
    BOX_D: p.box, BOX_TOP: (p.h - p.boxH) / 2, BOX_BOT: (p.h + p.boxH) / 2, PEN_SPOT: p.pen,
  });
})(typeof module !== 'undefined' ? module.exports : window);
