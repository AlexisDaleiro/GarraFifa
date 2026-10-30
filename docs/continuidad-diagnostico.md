# Diagnóstico de continuidad

Referencias al código anterior a esta revisión. La simulación y `server.js` quedan intactos.

| Archivo:línea | Causa | Corrección |
|---|---|---|
| public/game.js:185–195 | Paquetes viejos vacían el buffer y el reloj se corrige de golpe | Descartar fuera de orden; corregir desfase y cursor gradualmente; reiniciar sólo al cambiar sala/conexión |
| public/game.js:8,395–429 | Colchón fijo, congelamiento al agotar snapshots, saltos de 60/80 unidades | Colchón adaptativo, extrapolación hasta 100 ms y presentación persistente con blend/fundido |
| public/game.js:418–427 | Estado del snapshot futuro aplicado antes de su tick; altura lineal | Frontera discreta correcta y Hermite balístico sin cambiar la pelota autoritativa |
| public/player3d.js:44–80 | Umbral único, resets, cadencia cruda y crossfade único | Histéresis, permanencia mínima, filtro de velocidad y fundidos por transición |
| public/player3d.js:277–304 | Primer jugador dispara el atlas antes de preparar al resto | Preparación completa de estados y una sola pasada de render |
| public/player3d.js:285–287 | Cambio instantáneo entre rumbo y orientación | Camino angular corto con velocidad máxima |
| public/player3d.js:315–434 | Reinicio del root y huesos, orden Euler, entrada/salida de caída, muletas y expresiones | Filtrar pose final con memoria, desvanecer accesorios y conservar continuidad en interrupciones |
| public/game.js:877–896 | Velocidad visual incluye reposicionamientos y polvo nace por frame | Derivar velocidad del muestreo; conservar blends y emitir polvo por tiempo |
| public/locomotion.js:21–43 | API acepta pesos discontinuos; actualmente no es el renderer activo | Ofrecer filtro temporal puro y probar sus pesos; alimentar el renderer con valores filtrados |
| public/game.js:1003–1019 | Cambio brusco del objetivo, clamp tras mover y shake blanco | Mezclar objetivo y límites antes de integrar; shake continuo con reloj visual |
| public/game.js:749–761 | Entrada/salida de replay cambia timeline de un cuadro a otro | Fundido de la imagen anterior, buffers de muestreo separados y vuelta continua a vivo |
| public/game.js:185,749 | Eventos en vivo se dibujan sobre un replay; HUD puede anticipar el dibujo | Separar efectos temporales y vista mostrada; mantener reloj propio en cada timeline |
| public/game.js:736–744 | Reinicio de clase + reflow vuelve a lanzar el pop de un banner visible | Preservar la transición activa y evitar reflow forzado |
| public/style.css:267–306 | Replay, ayuda, fin y táctil cambian `display`; etiqueta parpadea con steps | Opacidad, visibilidad y transform; pulso continuo |
| public/game.js:666–733 | Filtros crean arrays; partículas se integran una sola vez con dt largo; confeti desaparece sin fade | Pools y compactación in situ; pasos cortos y alpha de entrada/salida |
| public/game.js:592–609 | Estela de pelota agrega un punto por frame y conserva trazos de otro timeline | Muestreo por tiempo, buffer fijo y vaciado bajo fundido |
| public/toon-fx.js:38–87 | Objetos nuevos por jugador/frame; fallback down se reinicia cada 30 ticks; estrellas/velocidad aparecen de golpe | Salidas reutilizadas, inicio de caída estable y envolventes temporales |
| public/game.js:993–1067 | Reanudación tras segundo plano mezcla reloj real y dt truncado; resize borra el canvas | Rebase sólo bajo fundido, dt acotado y transición de resize |
| public/game.js:1035–1051 | La pelota cambia de capa bruscamente al cruzar z=12 | Ordenar continuamente por profundidad del suelo, sin alternar dos rutas de dibujo |
| public/game.js:185–199 | Descartar paquetes viejos también descarta eventos; callbacks demorados pueden pertenecer a otra sala | Deduplicar eventos por tick/tipo/ID y cancelar recepción demorada por época de conexión |

Validación: pruebas puras con latencia 100 ms y jitter ±30 ms, saltos/reordenamiento, vuelo, cámara, clips y recuperación; rigs reales y revisión en navegador. La emulación de viewport no sustituye medir una GPU de celular real.

## Resultado por fase

1. Diagnóstico: tabla anterior, más modo `Continuidad · red 100 ms ±30 ms` en `public/player-benchmark.html` con máximos de desplazamiento, orientación y pose.
2. Red: `public/continuity.js` contiene reloj, muestreo y presentación reutilizables. Delay adaptativo de 4–10 ticks, extrapolación de hasta 6 ticks, altura Hermite balística y reposicionamiento con blend de 200 ms o fundido si supera 240 unidades. Eventos tardíos se conservan sin repetir audio. Se mantiene la simulación original.
3. Animación: `public/player3d.js` aplica histéresis, permanencia de 180 ms para locomoción, crossfades de 80–240 ms, velocidad filtrada, orientación limitada y filtro final de huesos/root/accesorios. Se prepara todo el atlas antes de su única pasada. `locomotion.js` filtra los pesos sin crear objetos.
4. Cámara: objetivo y límites convergen suavemente, incluyendo pérdida de control, replay y orientación de pantalla. Shake con senos continuos y decaimiento temporal; ventana del radar filtrada.
5. Transiciones: captura de la imagen anterior y fundido de 220 ms al cambiar de timeline, reposicionar o reanudar. Replay conserva buffers separados. Ayuda, etiqueta, fin de partido, barras y controles tienen transiciones CSS. Se eliminó el reflow forzado de banners.
6. Efectos: partículas, anillos, confeti y textos usan pools, tiempos y envelopes. Estela circular muestreada a 60 Hz; redes, sombras y fondo de pelota cacheados. Opciones y poses toon se reutilizan; caída de fallback tiene inicio estable. Pestañas ocultas dejan de renderizar. Atlas móvil a resolución interna 2, conservando dimensiones y proporciones.

## Verificación

- `npm test`: locomoción, continuidad, clips/atlas, efectos toon y selftest del servidor en verde después de cada fase.
- `npm run test:rig`: 22 esqueletos reales, seis caídas, recuperación, choque, poste, festejos, lágrimas, accesorios y límites del atlas. Comprueba límites de giro y continuidad de pose.
- Prueba pura de red: máximo 2,58 unidades/cuadro en la trayectoria lineal reproducible con 100 ms de latencia y ±30 ms de jitter, incluyendo paquetes fuera de orden.
- Navegador: partida 3v3 con bots usando `/?latency=100&jitter=30`, sin errores de consola; se comprobaron falta, fin y revancha. Escritorio, 390×844 y 844×390.
- Benchmark de 22 modelos, viewport móvil de escritorio: captura de 114,2 FPS y p95 11,2 ms después de reducir rasterización y cerrar una vista duplicada. Máximos acumulados en esa captura: 7,18 u/cuadro, 8,6° de orientación y 55° en nodos de pose. Estos máximos incluyen transiciones y frames de hasta 40 ms; no son velocidades por segundo ni una medición en hardware móvil.
- Los desplazamientos se limitan por tiempo: jugadores 1200 u/s, pelota 2000 u/s y cámara 900 u/s. Orientación 9 rad/s; huesos/accesorios 24 rad/s, con 60 rad/s para el root de las volteretas deliberadas. Reubicaciones mayores se hacen con opacidad cero.
- `server.js` no tiene modificaciones. No se agregaron dependencias, clips, modelos ni efectos de juego.

## Límites pendientes

- Medir 60 FPS sostenidos en un teléfono físico: no hay uno conectado; el viewport usa la GPU de escritorio.
- La predicción termina a los 100 ms. Una interrupción de red mayor necesita nuevos snapshots; al reanudar después de segundo plano se cubre el ajuste con fundido.
- Los estados, dueño de pelota y números del marcador siguen siendo discretos. La presentación de posiciones, poses y overlays es gradual; el marcador sigue mostrando el resultado en vivo durante el replay.
