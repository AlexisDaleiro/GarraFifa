// Selecciones disponibles. Compartido por server.js (require) y el cliente (<script>).
// c1 camiseta, c2 detalle/número, pat diseño, sh pantalón, so medias, alt = camiseta suplente [c1, c2].
(function (root) {
  root.TEAMS = [
    { name: 'Argentina', code: 'ARG', c1: '#7cc0ea', c2: '#ffffff', pat: 'rayas', sh: '#111111', so: '#ffffff', alt: ['#1b2a5c', '#7cc0ea'] },
    { name: 'Brasil', code: 'BRA', c1: '#ffdc1f', c2: '#0a8f3c', pat: 'liso', sh: '#1f3fa8', so: '#ffffff', alt: ['#1f3fa8', '#ffffff'] },
    { name: 'Uruguay', code: 'URU', c1: '#5cbfeb', c2: '#111111', pat: 'liso', sh: '#111111', so: '#111111', alt: ['#ffffff', '#5cbfeb'] },
    { name: 'España', code: 'ESP', c1: '#c8102e', c2: '#ffc400', pat: 'liso', sh: '#0b2a6f', so: '#0b2a6f', alt: ['#ffffff', '#c8102e'] },
    { name: 'Alemania', code: 'GER', c1: '#f4f4f4', c2: '#111111', pat: 'liso', sh: '#111111', so: '#ffffff', alt: ['#1d7a3a', '#ffffff'] },
    { name: 'Francia', code: 'FRA', c1: '#1e3a8a', c2: '#ffffff', pat: 'liso', sh: '#ffffff', so: '#c8102e', alt: ['#ffffff', '#1e3a8a'] },
    { name: 'Italia', code: 'ITA', c1: '#1f64c8', c2: '#ffffff', pat: 'liso', sh: '#ffffff', so: '#1f64c8', alt: ['#ffffff', '#1f64c8'] },
    { name: 'Inglaterra', code: 'ENG', c1: '#f4f4f4', c2: '#c8102e', pat: 'liso', sh: '#0b1d4f', so: '#ffffff', alt: ['#c8102e', '#ffffff'] },
    { name: 'Holanda', code: 'NED', c1: '#ff6f00', c2: '#ffffff', pat: 'liso', sh: '#ffffff', so: '#ff6f00', alt: ['#1b2a5c', '#ff6f00'] },
    { name: 'México', code: 'MEX', c1: '#006847', c2: '#ffffff', pat: 'liso', sh: '#ffffff', so: '#c8102e', alt: ['#111111', '#d4af37'] },
    { name: 'Croacia', code: 'CRO', c1: '#ffffff', c2: '#e30613', pat: 'cuadros', sh: '#ffffff', so: '#1b2a5c', alt: ['#1b2a5c', '#e30613'] },
    { name: 'Colombia', code: 'COL', c1: '#fcd116', c2: '#003893', pat: 'liso', sh: '#003893', so: '#c8102e', alt: ['#c8102e', '#ffffff'] },
    { name: 'Portugal', code: 'POR', c1: '#9e1b32', c2: '#0a6b3a', pat: 'liso', sh: '#0a6b3a', so: '#9e1b32', alt: ['#ffffff', '#9e1b32'] },
    { name: 'Garra FC', code: 'GFC', c1: '#d62828', c2: '#ffd23f', pat: 'franja', sh: '#111111', so: '#d62828', alt: ['#111111', '#ffd23f'] },
    { name: 'Chile', code: 'CHI', c1: '#d52b1e', c2: '#ffffff', pat: 'liso', sh: '#0039a6', so: '#ffffff', alt: ['#ffffff', '#d52b1e'] },
    { name: 'Perú', code: 'PER', c1: '#ffffff', c2: '#d91023', pat: 'franja', sh: '#ffffff', so: '#ffffff', alt: ['#d91023', '#ffffff'] },
    { name: 'Japón', code: 'JPN', c1: '#173a8a', c2: '#ffffff', pat: 'liso', sh: '#ffffff', so: '#173a8a', alt: ['#ffffff', '#bc002d'] },
    { name: 'Nigeria', code: 'NGA', c1: '#008751', c2: '#ffffff', pat: 'liso', sh: '#ffffff', so: '#008751', alt: ['#ffffff', '#008751'] },
    { name: 'Bélgica', code: 'BEL', c1: '#d71920', c2: '#fdda24', pat: 'liso', sh: '#111111', so: '#d71920', alt: ['#fdda24', '#111111'] },
    { name: 'Suecia', code: 'SWE', c1: '#fecc00', c2: '#006aa7', pat: 'liso', sh: '#006aa7', so: '#fecc00', alt: ['#006aa7', '#fecc00'] },
  ];
  // Misma decisión en vista previa, cancha y pruebas.
  root.teamKitFor = (ids, slot) => {
    const t=root.TEAMS[ids[slot]],a=parseInt(t.c1.slice(1),16),b=parseInt(root.TEAMS[ids[0]].c1.slice(1),16);
    const d=Math.hypot((a>>16)-(b>>16),((a>>8)&255)-((b>>8)&255),(a&255)-(b&255));
    return slot===1&&d<120?{...t,c1:t.alt[0],c2:t.alt[1],pat:'liso'}:t;
  };
})(typeof module !== 'undefined' ? module.exports : window);
