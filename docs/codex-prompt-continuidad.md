# Prompt para Codex: continuidad de animaciones y gráficos (sin saltos ni cortes)

Copiá todo lo de abajo de la línea y pegalo en Codex.

---

Sos un desarrollador senior de juegos web trabajando en **GarraFifa**, un juego de fútbol multijugador (Node + Express + Socket.IO en `server.js`, cliente en `public/`, render 2D canvas + jugadores 3D Three.js con estilo toon). El servidor simula a 60 Hz y emite un snapshot (`'s'`) por cada paso. El cliente interpola con un buffer de snapshots.

## Objetivo

Que **todo lo que se ve tenga continuidad**: jugadores, pelota, cámara, clips de animación, rotaciones, transiciones de estado (gol, saque, falta, replay) y efectos. Cero teletransportes visibles, cero congelamientos, cero cambios de pose de un frame a otro, cero parpadeos entre clips.

## Reglas

1. **No cambiar el gameplay ni la simulación del servidor.** Todo arreglo es visual/cliente, salvo que un salto venga de datos del servidor que el cliente no puede suavizar (en ese caso, explicá por qué antes de tocar `server.js`).
2. Respetar el estilo del código existente (compacto, comentarios cortos en español, sin dependencias nuevas).
3. Rendimiento: 22 jugadores a 60 fps en móvil. Nada de asignaciones por frame en caminos calientes.
4. Cada cambio con lógica no trivial deja **un test** chico en `tests/` o en el `selfTest` existente. Correr `npm test` al final de cada fase; todo debe pasar.
5. No agregar efectos nuevos: sólo suavizar lo que ya existe.

## Puntos de salto ya identificados (verificalos y buscá más)

### A. Interpolación de red — `public/game.js` (`sample` / `build`, ~línea 399)
- `build()` hace snap instantáneo (`kk = 1`) si un jugador se movió más de 60 unidades o la pelota más de 80. Eso produce teletransporte en reinicios, saques y reposicionamientos. Reemplazar por un blend corto (ej. 150–250 ms, easing) desde la posición mostrada hasta la nueva, o un fundido rápido si el salto es enorme.
- Si `t` pasa el último snapshot, `sample()` congela en el último frame. Con jitter de red eso se ve como tartamudeo. Agregar extrapolación acotada (máx ~100 ms usando la velocidad de los dos últimos snapshots) y volver suave a la interpolación cuando llega el siguiente.
- `INTERP = 4` ticks (~66 ms) es poco colchón. Hacerlo adaptativo según el jitter medido de llegada de snapshots (con piso y techo).
- `socket.on('s')` (~línea 185): `tickOffset` se resetea de golpe si el desvío supera 20 ticks, y el buffer se vacía si llega un tick viejo. Asegurar que la corrección del reloj sea siempre gradual salvo reconexión real.
- La pelota se interpola lineal en `z`; en vuelo eso aplana el arco. Considerar interpolación que respete la parábola (Hermite con velocidad) cuando la pelota está en el aire.

### B. Animación 3D — `public/player3d.js`
- `updateAction` (~línea 43): `next.reset()` en cada cambio de clip reinicia la pose; con estados que alternan rápido (idle/jog cerca del umbral `speed < 0.12` en `selectClip`, ~línea 23) hay parpadeo. Agregar **histéresis** al umbral de velocidad y un tiempo mínimo por clip.
- `CROSSFADE = 0.15` fijo para todo. Usar duraciones por par de clips (ej. idle↔jog más largo, hacia kick/pass/slide más corto) y que los clips de una sola vez (`ONCE`) vuelvan a locomoción con fundido, nunca cortando.
- `setEffectiveTimeScale` usa `anim.speed` crudo; el ruido de velocidad hace temblar la cadencia de pasos. Suavizar la velocidad (filtro exponencial) antes de usarla.
- Rotación (~líneas 285–286): cambia entre `anim.moveFace` y `p.face` según el mismo umbral de velocidad, produciendo un giro instantáneo. Rotar siempre con velocidad angular limitada / slerp por camino corto.
- Revisar la recuperación de poses (`recovery`, ~línea 356) y la caída/levantada (`down`): entrar y salir debe ser continuo, sin saltar a la pose base.
- `public/locomotion.js`: verificar que el blend walk/jog/sprint (pesos `jog`, `sprint`) se alimente de valores suavizados, no de saltos 0→1.

### C. Cámara y efectos — `public/game.js` (`render`, ~línea 1003)
- El objetivo de cámara cambia de golpe cuando `me` aparece/desaparece o al entrar/salir del replay (`!replay`). Suavizar la transición del objetivo, no sólo la posición.
- `cam.shake` usa `Math.random()` por frame: se ve como ruido blanco. Cambiar por ruido suave (senos desfasados o value noise) con el mismo decaimiento.
- El clamp de bordes puede saltar al cambiar tamaño de ventana u orientación. Que converja suave.

### D. Transiciones de estado
- Gol, saque de centro, falta, tiro libre, fin de tiempo: buscar todo lugar donde el estado cambie y las posiciones se reseteen. Ocultar el reposicionamiento con un fundido corto o un blend (ver A).
- Replay (`startReplay`/`stopReplay`, ~línea 745): entrada y salida con fundido o wipe corto, no corte seco. Al salir, cámara y jugadores continúan desde el estado en vivo sin salto.
- Overlays/HUD (`#replayTag`, banners de gol, ayuda, controles táctiles en `style.css`): mostrar/ocultar con transición CSS, nunca cambio de `display` instantáneo cuando el jugador lo ve.

### E. Otros
- `public/toon-fx.js`, confetti, viñeta, radar: que dependan de `dt` y no del número de frames, y que no aparezcan/desaparezcan de golpe.
- Todo acumulador con `dt` debe tolerar frames largos (pestaña en segundo plano) sin saltar.

## Orden de trabajo (una fase a la vez, `npm test` entre fases)

1. **Diagnóstico**: listá cada salto encontrado con `archivo:línea`, causa y fix propuesto, incluidos los que no están en esta lista. Si podés, agregá a `public/player-benchmark.html` un modo que mida el delta máximo de posición/rotación por frame para detectar saltos de forma objetiva.
2. **Red/interpolación** (sección A).
3. **Animación 3D** (sección B).
4. **Cámara y shake** (sección C).
5. **Transiciones de estado, replay y HUD** (sección D).
6. **Efectos restantes** (sección E).

## Criterio de terminado

- Ninguna entidad visible mueve más de un umbral razonable por frame salvo durante un blend controlado.
- Nunca se ve un clip cortarse ni una pose reiniciarse sin fundido.
- Con 100 ms de latencia y 30 ms de jitter simulados, el movimiento sigue fluido.
- `npm test` pasa. Al final, resumen corto por fase: qué cambió, qué quedó pendiente y por qué.
