// Canchas disponibles. Compartido por server.js (require) y el cliente (<script>).
// w/h tamaño, goal ancho del arco, gh alto del travesaño, box/boxH área grande, small/smallH área chica,
// pen punto penal, circle radio del círculo central, look estilo visual, mode jugadores sugeridos por equipo.
(function (root) {
  root.PITCHES = [
    { name: 'Estadio', w: 1000, h: 640, goal: 100, gh: 44, box: 160, boxH: 340, small: 55, smallH: 190, pen: 115, circle: 80, look: 'estadio', mode: 2 },
    { name: 'Fútbol 7', w: 780, h: 500, goal: 84, gh: 38, box: 120, boxH: 270, small: 40, smallH: 150, pen: 90, circle: 62, look: 'sintetico', mode: 6 },
    { name: 'Fútbol sala', w: 620, h: 380, goal: 72, gh: 32, box: 90, boxH: 210, small: 0, smallH: 0, pen: 70, circle: 46, look: 'parquet', mode: 4 },
  ];
  // Jugadores de campo por equipo (el arquero lo maneja la CPU).
  root.MODES = [1, 2, 3, 4, 5, 6, 10];
  root.pitchGeom = p => ({
    W: p.w, H: p.h, CX: p.w / 2, CY: p.h / 2, GOAL_TOP: (p.h - p.goal) / 2, GOAL_BOT: (p.h + p.goal) / 2, GOAL_H: p.gh,
    BOX_D: p.box, BOX_TOP: (p.h - p.boxH) / 2, BOX_BOT: (p.h + p.boxH) / 2, PEN_SPOT: p.pen,
  });
})(typeof module !== 'undefined' ? module.exports : window);
