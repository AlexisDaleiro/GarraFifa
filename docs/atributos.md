# Jugadores y selecciones

Actualización: la dirección de pase y tiro ahora tiene asistencia limitada. Ver [asistencia y animaciones](asistencia-y-animaciones.md); las referencias a dirección manual describen la versión anterior.

`public/attributes.js` centraliza las ocho estadísticas, seis rasgos, perfiles y estilos de selección.
Son perfiles ficticios: no representan valoraciones oficiales de futbolistas ni selecciones reales.

Cada perfil suma 400 puntos y tiene como máximo dos rasgos. El valor neutral es 50; 1 equivale a −10 %
y 100 a +10 %. Un rasgo aporta hasta 3 puntos porcentuales al mismo modificador. Se suma antes de aplicar
el límite conjunto de ±10 %, por lo que una estadística máxima nunca obtiene otro +3 % encima.
Es un presupuesto inicial de equilibrio; el balance competitivo requiere partidas reales.

| Estadística | Efecto determinista |
|---|---|
| Velocidad | Velocidad máxima normal y de sprint, también para arqueros |
| Aceleración | Arranque y frenada progresiva, con y sin pelota |
| Agilidad | Giro y duración de croqueta/bicicleta |
| Control | Radio de control, separación al pie y seguimiento del balón |
| Pase | Velocidad del pase y del despeje del arquero |
| Tiro | Velocidad de salida, sin cambiar dirección ni agregar dispersión |
| Defensa | Alcance de la barrida y fuerza de una disputa legal |
| Equilibrio | Masa de contacto y umbral para resistir una disputa |

Croqueta y bicicleta reciben el rasgo correspondiente sobre Agilidad. Control cercano, Pase fuerte,
Rematador y Buen equilibrio se suman respectivamente a Control, Pase, Tiro y Equilibrio. Las duraciones
se redondean a ticks dentro del límite conjunto; un cambio de pocos puntos puede no superar un tick.
La bicicleta es un amague visual; nunca fuerza al rival humano a perder control.

Las selecciones eligen una composición de perfiles y una táctica de bots (circulación, presión,
amplitud y frecuencia de regate). No multiplican las estadísticas de sus jugadores. Las decisiones
de la IA conservan variación aleatoria; los efectos físicos de las estadísticas no usan azar.

## Elección y red

El lobby permite elegir un perfil de campo o conservar el asignado por la selección. Muestra las
ocho estadísticas y rasgos; los compañeros CPU muestran su perfil. El arquero usa su perfil propio.
El servidor valida únicamente el ID: ignora estadísticas y rasgos que intente mandar un cliente.
La elección queda bloqueada durante el partido. Al entrar en un partido iniciado se hereda el cuerpo
del bot disponible; el perfil elegido se usa al formar el próximo plantel.

Los atributos y la marcha individual se calculan una vez por jugador y viajan en `roster`, no en cada
snapshot. El cliente predice con la marcha individual enviada por el servidor. Cambiar de jugador
con autoSwitch mueve el control y nombre, no los atributos del cuerpo.

## Controles y parámetros

Flechas: mover/apuntar. S: pase manual, barrida o pedido según posesión. D: tiro inmediato. Espacio:
sprint sin energía. Q: croqueta. E: bicicleta. No se reintroducen barras de GARRA ni potencia.
Los índices de energía/carga del snapshot se reservan en 100/0 para conservar su formato.

La base anterior todavía tenía asistencia y carga; estos ajustes permiten aplicar los atributos
sin autoapuntado ni dispersión:

| Parámetro | Antes | Ahora (perfil neutral) |
|---|---|---|
| Pase | Velocidad según distancia/tipo, destinatario asistido y dispersión | 4.752 px/tick, dirección manual |
| Tiro | 6.84–13.68 px/tick según carga, autoapuntado y dispersión | 9.648 px/tick, dirección manual al pulsar |
| Marcha / sprint | 2.125 / 2.76, agotamiento | 2.125 / 2.76, sin agotamiento |
| Aceleración sin/con balón | 0.12 / 0.09 | Base igual, según perfil |
| Giro sin/con balón | 0.3 / 0.12 rad/tick | Base igual, según perfil |
| Recepción | 17 px general / 26 px destinatario, carrera asistida | 17 px × Control, sin carrera automática |
| Separación al pie | 11 px | 11 × (2 − Control) px |
| Seguimiento al pie | 0.55 | 0.55 × Control |
| Alcance de barrida | 13 px | 13 × Defensa |
| Contacto legal | Probabilidad aleatoria; escudo 0.35 | Fuerza frente a umbral, escudo 1.2 sin sprint |
| Croqueta / bicicleta | Sin activación | 22 / 30 ticks base |
| Enfriamiento de regates | Sin activación | 65 ticks compartidos |
| Velocidad lateral croqueta | Sin activación | 1.6 px/tick inicial, fricción 0.94 |
| Rasgos y estadísticas | No existían | 50 neutral, límite conjunto ±10 %, rasgo hasta +3 pp |

No cambian las duraciones del partido, saques ni pausas. El rozamiento de pelota permanece igual.

## Verificación

`npm test` comprueba límites, validación, dirección manual para todos los perfiles, recepción,
duración/enfriamiento de regates, entradas y paridad exacta entre marcha de servidor y predicción.
El pase neutral recorre 200 px en más de 24 ticks; con receptor se controla en 53 ticks (883 ms).

`npm run test:players` inicia un servidor local en un puerto libre y conecta dos clientes WebSocket.
Comprueba elección compartida, metadatos autoritativos, bloqueo durante el partido y formato estable.
La prueba cierra sus conexiones y servidor al terminar. No publica ni toca Vercel.
