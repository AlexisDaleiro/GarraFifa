# Prompt para Codex: jugadores más cómicos en Garra FC

Copiar todo lo que está debajo de la línea.

---

Estás trabajando en **Garra FC**, un juego de fútbol arcade multijugador en el navegador (Node + Express + Socket.IO en el servidor, Three.js en el cliente). Quiero que los jugadores sean **mucho más cómicos**, estilo dibujo animado, **sin cambiar la jugabilidad ni el balance**.

## Contexto del proyecto (leelo antes de tocar nada)

- `server.js` (~1200 líneas): simulación autoritativa. Los jugadores tienen un estado `st` (`run`, `slide`, `recover`, `down`, `dive`, `hold`, etc.) y un temporizador `stT`. El servidor emite eventos con `emitEv(room, { type, ... })`. Tipos existentes: `foul`, `goal`, `kick`, `pass`, `shot`, `slide`, `tackle`, `shoulder`, `dive`, `save`, `post`, `whistle`, `setpiece`, `start`, `end`, `skill`.
  - `foul(room, s, o)` (cerca de la línea 245) pone a la víctima en `down` durante 70 ticks.
  - La barrida limpia (cerca de la línea 807) también pone `down` durante 30 ticks.
  - Los choques entre jugadores están cerca de la línea 817.
- `public/game.js`: cliente, render, HUD, banners (`banner(...)`), audio sintetizado con WebAudio (`AudioContext` cerca de la línea 34) y manejo de eventos (`case 'foul':` cerca de la línea 773). `ST_NAMES` mapea índices de estado a nombres.
- `public/player3d.js`: carga `models/player.glb` + clips de `models/anims/`, aplica toon shading (`MeshToonMaterial`), contorno de tinta y una caricatura por escala de huesos (`CARICATURE = { Head: 2.9, ... }`). Hay una cara dibujada pegada al hueso `Head`. Hoy el estado `down` reusa el clip de `slide`, así que **todas las caídas se ven iguales y ni siquiera parecen caídas**.
- `public/locomotion.js`, `public/teams.js`, `tools/build_player_assets.py`, `tests/`.
- Controles: el juego se simplificó a **3 botones** a propósito. No agregues botones nuevos.
- `npm test` corre `tests/locomotion.test.js`, `tests/player3d.test.js` y `node server.js --selftest`. Tiene que seguir pasando.

## Reglas

1. **Sin cambios de gameplay**: no cambies velocidades, tiempos de `stT`, hitboxes, física de pelota ni reglas. Todo es visual o de sonido. Si necesitás datos nuevos del servidor (por ejemplo, la dirección del golpe o una semilla para elegir la variante de caída), agregalos como campos extra en los eventos existentes y no toques la lógica.
2. **Determinismo entre clientes**: cualquier cosa aleatoria visible (variante de caída, tipo de cuerpo, peinado, festejo) tiene que salir igual para todos los jugadores de la sala. Usá el `id` del jugador o una semilla que mande el servidor, nunca `Math.random()` suelto en el cliente.
3. **Sin assets nuevos pesados**: preferí animación procedural (rotar y escalar huesos, mover el `root`, interpolar con curvas de easing) por encima de clips o modelos nuevos. Si usás un clip que ya existe en `models/anims/`, perfecto. Los sonidos van sintetizados con el `AudioContext` que ya existe, sin archivos de audio.
4. **Rendimiento**: puede haber 22 jugadores en pantalla, también en celular. Nada de partículas por miles ni materiales nuevos por frame. Reusá geometrías y materiales.
5. Estilo de código: imitá el del archivo que estés tocando (es compacto, comentarios en español, sin frameworks nuevos). No agregues dependencias.

## Qué implementar

### 1. Caídas variadas en las faltas (prioridad máxima)

Cuando un jugador queda en `down`, elegir una variante de caída y animarla de forma procedural durante el tiempo que dura `down`, y después pasar a `recover`:

- **Piscinazo**: vuela de cabeza con los brazos abiertos y se desliza panza abajo.
- **Voltereta**: una vuelta completa en el aire y cae de espaldas.
- **Rodando**: gira 3 o 4 veces por el pasto, como un tronco.
- **Sentón**: cae de culo y rebota un par de veces.
- **Trompo**: gira sobre un pie y se desploma.
- **Drama**: cae y se queda pataleando, agarrándose la pierna.

Contexto:
- La **dirección del golpe** (de quien comete la falta hacia la víctima) decide hacia dónde sale despedido.
- Si quien comete la falta venía rápido, la caída es más exagerada (más altura y distancia **visual**; la posición real del servidor no cambia).
- Aplicar a **faltas, barridas limpias y choques**. En la barrida limpia y en los choques el `down` dura menos, así que usá versiones más cortas o elegí variantes que entren en ese tiempo.
- Mientras está en el piso: **estrellitas o pajaritos girando** sobre la cabeza.
- En el golpe: onomatopeya flotante ("¡ZAS!", "¡AUCH!", "¡PAF!").

### 2. Cuerpo y proporciones

- **Tipos de cuerpo** por jugador, fijos según su `id`: petiso gordito, flaco larguirucho, grandote, normal. Hacelo escalando huesos (columna, piernas, brazos, panza) igual que con `CARICATURE`. Que se distingan de un vistazo, pero sin cambiar el hitbox.
- **Piernas cortitas que se mueven muy rápido** al correr, estilo dibujo animado: subí la velocidad del ciclo de carrera respecto de la velocidad real.
- **Squash & stretch**: aplastarse al caer o aterrizar, estirarse al saltar o rematar (escala del `root` con conservación aproximada de volumen).

### 3. Caras y expresiones

La cara ya está dibujada y pegada al hueso `Head`. Hacé que cambie según la situación:
- Ojos **enojados** al barrer.
- Ojos **bizcos o en espiral** al recibir un pelotazo o una falta.
- **Llorando** (lagrimones) cuando le hacen un gol a su equipo.
- Boca con **grito abierto** al patear; **dientes apretados** al correr con sprint.
- **Peinados y accesorios** fijos por jugador (según `id`): afro, cresta, pelado brillante, bigotón, sin nada. Geometría simple y low-poly con toon shading.

### 4. Reacciones físicas

- Barrida recibida: cubierta por la sección 1.
- **Choque entre jugadores**: rebote visual tipo goma (squash de los dos + pequeño salto hacia atrás, solo visual).
- **Arquero**: estirada exagerada en `dive` y, si la pelota pega en el palo (evento `post`) cerca del arquero, "plancha" cómica contra el poste.

### 5. Celebraciones y momentos

Con el evento `goal`:
- El que hizo el gol (y compañeros cercanos) hace un festejo: **avioncito**, **baile**, **panza al piso deslizando**, **salto en grupo**. Elegilo de forma determinística.
- El equipo que recibe el gol: **tirados, cabizbajos o pataleando**, con la cara llorando.
- Todo esto solo durante la pausa posterior al gol que ya existe; no la alargues.

### 6. Efectos visuales y sonido

- **Líneas de velocidad** al sprintar y una **nubecita de polvo** al frenar en seco o al caer.
- **Onomatopeyas** flotantes estilo cómic: "¡PUM!" en `shot`, "¡ZAS!" en `slide` y `tackle`, "¡BOING!" en `post`. Usá un sprite o un overlay HTML posicionado en pantalla, con un pop de escala y un fade.
- **Sonidos chistosos** sintetizados: bocina en el gol, silbido descendente de caída, "boing" en los choques y en el palo.

## Cómo trabajar

1. Leé `player3d.js`, la parte de render y eventos de `game.js` y las funciones `foul`, slide y colisiones de `server.js` antes de diseñar.
2. Implementá **en este orden**, y que cada paso deje el juego funcionando: (1) caídas, (6) onomatopeyas y sonidos, (3) expresiones, (2) cuerpos y peinados, (4) reacciones, (5) festejos.
3. Centralizá la animación procedural en un solo lugar (por ejemplo, un módulo `public/toon-fx.js` o una sección dentro de `player3d.js`) en vez de desparramarla.
4. Después de cada paso, corré `npm test`. Si cambiás algo que validan los tests (por ejemplo, clips requeridos), actualizá el test y no lo borres.
5. Agregá **un** test chico para la lógica pura nueva (por ejemplo, que la elección de variante de caída sea determinística según la semilla y que respete la duración de `down`).
6. Al final, levantá el server (`npm start`), abrí una partida con bots y verificá a ojo: faltas, barridas, choques, gol, sprint, tiro al palo. Revisá también en un viewport de celular.

## Entregable

- Código funcionando, con `npm test` en verde.
- Un resumen corto: qué implementaste, dónde vive cada cosa, qué quedó afuera y por qué.
