# Gameplay PC: defensa, movilidad y apoyos

Actualización: la dirección de pase y tiro ahora tiene asistencia limitada. Ver [asistencia y animaciones](asistencia-y-animaciones.md); las referencias a dirección manual describen la versión anterior.

Versión local; no publicada automáticamente. Se conservan simulación a 60 Hz, snapshots, perfiles,
rasgos, modelos, canchas, paredes y relojes de partido/saques/pausas.

## Auditoría y cambios

- No había cambio manual. El automático copiaba inputs completos y no limpiaba toques pendientes.
  Ahora C selecciona un CPU de campo del equipo cuando el rival tiene el balón o está libre. Considera
  dirección, distancia a la jugada, cobertura y selecciones recientes. No toma humanos ni arqueros.
- Acelerar y frenar usaban la misma constante. La nueva marcha compartida separa frenada, corte a baja
  velocidad y giro al sprint. La velocidad máxima no sube. Los atributos se aplican una sola vez.
- Croqueta/bicicleta impedían moverse o pasar durante 22/30 ticks completos. Se conserva su duración
  visual máxima, pero después de 6/8 ticks se puede salir con dirección o pase/tiro. No hay invulnerabilidad.
- Varios bots próximos perseguían el balón. El plan asigna un perseguidor y coberturas; en posesión
  genera apoyo atrás, amplitud, ruptura y coberturas según cantidad de compañeros disponibles.
- La elección de pase de IA ignoraba pedidos y descartaba pases hacia atrás. Ahora evalúa espacio,
  línea y distancia alcanzable; un pedido mejora la prioridad sin obligar a pasar por una línea tapada.
- Los contactos se resolvían por penetración completa y velocidad escalar. Ahora se acota el empujón,
  se resuelve coincidencia exacta y se conserva la velocidad tangencial para rodear al rival. Un quite
  exige orientación y cierre efectivo: correr en paralelo no basta.
- TIRO podía preparar una acción lejos del balón. Primera intención ahora requiere cercanía y caduca
  pronto. Mantener un botón no vuelve a ejecutar la acción al recibir.
- Una ventana angosta de PC ocultaba instrucciones de teclado y mostraba táctiles. Ese cambio de
  controles ahora depende del tipo de puntero, no sólo del ancho de ventana.

## Controles

| Tecla | Acción |
|---|---|
| Flechas | Mover y apuntar |
| Espacio sostenido | Sprint con/sin balón, sin energía; diagonal normalizada |
| S | Pase manual / barrida con posesión rival / pedido con posesión compañera |
| D | Tiro inmediato; cerca del balón libre prepara primera intención |
| Q / E | Croqueta / bicicleta |
| C | Cambio defensivo; con flechas prioriza la dirección indicada |
| Esc / P | Menú; soltar controles no pausa al resto |

El triángulo, nombre y texto CONTROL muestran el cuerpo controlado. Cambiar conserva posiciones,
velocidades, estados, dorsales y atributos; limpia acciones pendientes de ambos y transfiere sólo
dirección/sprint sostenidos. Se detecta el flanco de C por conexión, no por cuerpo.

El cambio automático se puede activar por persona en lobby/menú. La opción de sala del anfitrión
también debe permitirlo; sigue reservado al único humano de su equipo. Una elección manual lo
bloquea durante dos segundos. C funciona aunque el automático esté desactivado.

El servidor publica el tick del cambio. El cliente reinicia el historial de predicción y sus offsets;
espera un snapshot del cuerpo posterior al cambio para predecirlo. No transfiere su trayectoria anterior.

## Parámetros: anterior → nuevo

En `server.js`, objeto PACE; los de marcha viajan en el roster y se usan también en continuity.steer.

| Parámetro | Anterior | Nuevo neutral |
|---|---|---|
| run / sprint | 2.125 / 2.76 | Sin cambio |
| gkRun / gkSprint | 2.21 / 2.64 | Sin cambio |
| acc / ballAcc | 0.12 / 0.09 | Sin cambio para marcha estable |
| stopAcc / ballStopAcc | Usaba 0.12 / 0.09 | 0.26 / 0.23 |
| cutAcc / ballCutAcc | Usaba 0.12 / 0.09 | 0.20 / 0.17 |
| reverseBrake | 0.78 | 0.65 |
| lowSpeed | No existía | 0.65 × velocidad normal |
| lowTurn | Giro fijo | 1.30 × giro a baja velocidad |
| sprintTurn | Giro fijo | 0.65 × giro al sprint, fuera de baja velocidad |
| sprintAcc | Aceleración común | 0.85 × aceleración fuera de baja velocidad |
| switchT | No existía | 18 ticks (300 ms) |
| manualGuard | No existía | 120 ticks (2 s) |
| switchRange | No existía | 420 px adicionales respecto del candidato más cercano |
| switchRecent | No existía | 90 puntos de penalización para los últimos tres cuerpos |
| skillCommit / stepCommit | Bloqueo completo 22/30 ticks | 6 / 8 ticks |
| firstTouchT | 18 ticks | 10 ticks |
| contactPush | Penetración completa | Máximo 2.5 px por par y tick |
| aiPlanT | Reacción independiente por bot | Plan compartido cada 8 ticks o cambio de posesión |
| supportBack / supportWide / supportRun | Desplazamiento de formación genérico | 90 / 85 / 140 px |
| contain | Perseguía el centro del portador | 24 px hacia el arco propio |
| separation | Sin separación preventiva | 34 px entre compañeros CPU |

En atributos.motion, Aceleración también escala frenada/corte. Agilidad escala el giro antes de los
modificadores comunes de marcha. Los efectos individuales mantienen el límite conjunto de ±10 %.

## Pruebas y límites

`npm test`: cambio útil/direccional, cuerpos exclusivos, cooldown, C sostenida, limpieza de acciones,
elección manual frente al automático, sprint diagonal sostenido, giro a baja velocidad, primera intención,
salida de regate con pase, barrida fallada, contactos, apoyos y paridad de marcha para todos los perfiles.
Se conserva la prueba del pase raso de 200 px y de recuperación del pase tras rebotar en cada pared.

Frenada aislada desde 2.76 px/tick hasta menos de 0.1, sin contactos ni movimiento nuevo:

| Parámetro de frenada | Antes | Ahora |
|---|---|---|
| Sin balón | 26 ticks / 19.5 px | 12 ticks / 7.6 px |
| Con balón, misma velocidad inicial de comparación | 36 ticks / 27.0 px | 13 ticks / 8.9 px |

No son mediciones de ping. La prueba de continuidad usa la marcha nueva y la reconciliación del cliente:
con jitter y correcciones de 8 px obtiene 19 saltos sin reconciliar y 0 reconciliados; error medio 2.0 px.

`npm run test:players`: dos clientes WebSocket, sin demora y con 100 ms ±30 ms por sentido, compartiendo
perfiles, cambio defensivo, configuración individual y control exclusivo. `npm run test:net` mantiene
la medición reproducible del reloj/interpolación. Las demoras son simuladas, no una mejora medida en Vercel.

La IA usa posiciones y decisiones locales, sin planificador táctico de varias jugadas. Las direcciones
del teclado siguen en ocho sectores. Con un solo jugador de campo no existe otro cuerpo al que cambiar.
Los tests no determinan si el balance resulta divertido: hace falta jugar partidos humanos y ajustar
PACE con esa experiencia. No se añadieron dependencias ni servicios.

Comprobación adicional en dos navegadores de PC contra localhost: C cambió CONTROL #10 Velocista a
CONTROL #11 Defensor, y Espacio + flecha produjo desplazamiento. El segundo navegador retrasó snapshots
con `?latency=100&jitter=30&stall=250&netdiag=1` (sólo bajada; no representa RTT real). Ambos terminaron
sin errores de consola. En las muestras revisadas, el diagnóstico registró `playJumps:0`, unos 300
snapshots por 5 s y ráfagas de llegada de hasta 154 ms. Esto comprueba el flujo, no el balance competitivo.
