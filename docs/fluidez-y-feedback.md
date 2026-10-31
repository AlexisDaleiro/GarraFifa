# Fluidez y avisos

Los textos de movimiento usan 5.5 px (antes 8), contorno de 1.5 px (antes 2.4) y duran
54 ticks (antes 80). Avisos del mismo jugador dentro de 18 ticks se reemplazan para no
superponerse. Las onomatopeyas de impacto usan 8.5 px (antes 13), contorno de 1.6 px
(antes 3), expansión máxima 1.05 (antes 1.20) y duran 30 ticks (antes 42).
El globo de pedido «¡ACÁ!» también se reduce un 25 %.
Los avisos de falta, saque y posesión del arquero pasan de 26–54 a 18–30 px; sus subtítulos,
de 22 a 11–14 px. Aparecen arriba del campo para despejar el centro de la jugada.

`PACE.actionBufferT = 6`: en los últimos 100 ms de recuperación se puede preparar un pase
o tiro si se tiene la pelota o está libre a menos de 40 px. Sale cuando termina la recuperación.
No acorta la penalización de una barrida fallada, no repite al mantener el botón y no conserva
acciones sobre una pelota lejana. Reutiliza la ventana de primera intención de 10 ticks.

`PACE.oneTwoT = 150`: después de un pase con destinatario, el CPU ofrece una devolución
durante hasta 2.5 s. Busca un punto adelantado 140 px (`supportRun`) y separado lateralmente
34 px (`separation`), evaluando líneas de pase y respetando límites y velocidad del perfil. Durante el vuelo
no persigue el pase que acaba de dar. Los demás apoyos mantienen una opción hacia atrás.
Recibir la pelota, perder la posesión o reponer el partido cancela el desmarque. Los humanos
siguen moviéndose con su propio input; no se fuerza una devolución ni se altera el balón en vuelo.

Se prueban la espera hasta terminar de recuperarse, pulsaciones tempranas, ausencia de repetición,
distancia, desmarque, apoyo atrás y control humano. Los relojes y el protocolo no cambian.
