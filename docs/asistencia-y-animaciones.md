# Asistencia y acciones

Esta versión reemplaza la dirección completamente manual de pase/tiro por asistencia al golpear.
S sigue siendo pase/barrida/pedido y D tiro inmediato; no hay carga ni barra de energía.

`public/assist.js` centraliza las reglas. El servidor aplica las mismas a humanos y bots:

| Parámetro | Antes | Ahora |
|---|---|---|
| Cono de pase | Sin corrección | 0.61 rad (~35°) |
| Corrección máxima de pase | 0 | 0.52 rad (~30°) |
| Rango de destinatario | Sin selección asistida | 32–300 px, limitado por alcance físico |
| Anticipación del receptor | 0 | Hasta 36 ticks de su velocidad actual |
| Cono de tiro | Sin corrección | 0.75 rad (~43°) |
| Corrección máxima de tiro | 0 | 0.65 rad (~37°) |
| Rango de tiro asistido | Sin corrección | Hasta 420 px de distancia horizontal al arco |
| Margen dentro del poste | No aplicaba | 12 px |
| Pase / tiro neutral | 4.752 / 9.648 px/tick | Sin cambio; conservan estadísticas y rasgos |

El pase prioriza alineación, distancia, línea disponible y pedidos. Anticipa un receptor en movimiento
usando rozamiento y velocidad del balón. Descarta adversarios, jugadores caídos y líneas muy tapadas.
Sin blanco elegible conserva la dirección elegida. No corrige el balón en vuelo, no mueve al humano
para recibir y no garantiza superar a un defensor.

Apuntar a una pared cercana conserva el pase libre: no selecciona un compañero situado más allá del
primer encuentro con esa pared. Los rebotes y la recuperación de un pase propio siguen siendo físicos.
El posible receptor aparece marcado usando `pt`; el cálculo de vista previa se reutiliza hasta 3 ticks.

El tiro corrige hacia un punto entre los postes, próximo a la dirección elegida. Apuntar hacia atrás,
fuera del cono o desde demasiado lejos conserva la dirección original. No busca automáticamente
el hueco del arquero ni asegura gol. Los tiros rasos no añaden salto corporal artificial.

## Animaciones

- Cada golpe lleva ID, tick, tipo, dirección y duración visual. El cliente conserva esos eventos aunque
  el flag de un snapshot intermedio ya haya desaparecido.
- Los clips locales tienen su contacto en la fase 0.50 del tiro y 0.60 del pase (definidas por
  `tools/build_player_assets.py`). La animación comienza en contacto más la edad del evento, de modo
  que coincide con la salida visible del balón. No se retrasa la acción del servidor.
- Un nuevo golpe vuelve a activar el clip aunque el flag anterior no haya caído. Un evento repetido
  no lo vuelve a iniciar. La dirección del torso acompaña la dirección real del golpe.
- Corriendo, el pase puede fundirse con locomoción después de 5 ticks y el tiro después de 8 ticks.
  Quieto, continúa el seguimiento del golpe. No se bloquean los controles por animación.
- La barrida ajusta la reproducción del clip a sus 18 ticks físicos. `recover` usa levantada/crouch
  progresivo con la duración publicada, en vez de reproducir otra barrida.
- Croqueta y bicicleta entran/salen con mezcla de 50 ms, incluso si se interrumpen para pasar o correr.
  Mantienen los compromisos, enfriamientos y restricciones físicas anteriores.

## Corrección de arco

La pared del fondo también se aplicaba a la boca del arco antes de cruzar la línea. Dependiendo de la
velocidad y del último paso del integrador, un tiro correcto rebotaba en una pared invisible. Ahora la
abertura deja pasar el balón; postes y travesaño conservan sus colisiones, y el resto del fondo sigue
siendo pared. Se prueban ambos arcos con cuatro velocidades y cuatro puntos de salida.

## Verificación

`npm test` cubre asistencia, límites, anticipación, paredes, simetría, trayectoria libre posterior,
previsualización, gol físico sin arquero, fases de contacto, recepción tardía de eventos, reactivación,
recuperación y barrida. Conserva los tests de cambio de jugador, sprint, perfiles y red.

`npm run test:players` comprueba dos conexiones, con y sin 100 ms ±30 ms por sentido. Estas pruebas no
determinan el equilibrio competitivo: falta ajustar la intensidad de asistencia con partidos humanos.
No se añaden dependencias ni se publica automáticamente en Vercel.
