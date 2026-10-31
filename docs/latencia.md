# Red de baja latencia

La simulación sigue a 60 ticks, con el mismo PACE y los mismos mensajes e inputs.

- `vercel.json` fija una única región, `gru1` (São Paulo). Se aplica en el próximo despliegue.
- Snapshots a 60 Hz (antes 30). Con el partido pausado se envían a 10 Hz.
- WebSocket directo en ambos extremos. Una conexión sin WebSocket muestra un error explícito.
- Una conexión congestionada recibe el último estado cuando vuelve a estar disponible. Los eventos se
  conservan aparte, con un límite de 512 por conexión; al salir de sala se limpia la cola.
- El buffer usa el percentil 98 de una ventana de 3 s: mínimo 25 ms y máximo 300 ms. Una ráfaga no reinicia
  el reloj ni provoca un salto de tiempo; el atraso se recupera gradualmente.
- La predicción local aplica el input en el próximo frame y absorbe los errores de nuevos snapshots con
  reconciliación acotada. Se reinicia al reconectar o cambiar de jugador y se desactiva durante la pausa.
- El ping se mide desde la conexión inicial, sin solicitudes superpuestas. La estimación usa la mediana
  reciente para evitar que un pico aislado cambie bruscamente la predicción.
- Los inputs desconectados no se encolan para reproducirse al volver.

## Mediciones reproducibles

`npm run test:net` ejecuta el reloj, muestreo y presentación reales con llegadas TCP simuladas, semilla fija,
80 ms de demora de bajada y frames a 60 Hz. No mide el ping de Vercel ni de un teléfono.

| Escenario | Buffer mediano antes / ahora | Atraso de presentación mediano antes / ahora | Atraso p95 antes / ahora |
|---|---|---|---|
| Red estable | 66.7 / 25 ms | 130 / 105 ms | 130 / 105 ms |
| Jitter exponencial de media 20 ms | 118.9 / 104.1 ms | 188 / 191.1 ms | 205.1 / 198 ms |
| Cortes de 250 ms cada 2 s y jitter | 267.9 / 238.4 ms | 334.6 / 320.3 ms | 340 / 322.2 ms |

Con jitter se prioriza la continuidad: la mediana puede subir unos milisegundos aunque mejore el p95.
No se puede eliminar el tiempo sin datos aumentando la frecuencia del servidor.

`npm test` cubre pausas, ráfagas, segundo plano, reconexión y la marcha compartida con el servidor. Un caso
con jitter de subida y empujones autoritativos de 8 px cada 2 s pasa de 16 saltos de corrección a 0, con
error medio de 1.7 px. También comprueba que el input nuevo responde sin esperar otro snapshot y que una
conexión lenta conserva eventos sin bloquear al resto.

Prueba de sockets locales (3.5 s por caso): 59.9 snapshots/s en 3v3 y 10v10, con unos 18.1 y 41.7 KiB/s
de JSON por cliente respectivamente. Esto no sustituye medir una conexión móvil ni un servidor bajo carga.

## Publicación y comprobación

Publicar estos archivos en el proyecto existente de Vercel y recargar los clientes para abrir conexiones
nuevas: las conexiones anteriores pueden seguir atendidas por el despliegue anterior. Comprobar la región
del endpoint `/socket.io/` en `x-vercel-id`; la ejecución debe indicar `gru1`, no `iad1`.

Abrir `/?netdiag=1` desde dos dispositivos. El menú muestra el ping; la consola resume transporte, buffer,
intervalos de llegada y saltos cada 5 s. Comparar Wi-Fi con datos móviles, y `?predict=0` sólo para diagnóstico.
`?latency=100&jitter=30&stall=250&netdiag=1` reproduce demora y entregas en ráfaga en el navegador.

Las salas continúan en memoria del proceso. Una región única no convierte ese estado en almacenamiento
compartido entre instancias; la arquitectura necesita coordinación adicional si se escala horizontalmente.

Referencias: [región de Functions](https://vercel.com/docs/functions/configuring-functions/region),
[WebSockets en Vercel](https://vercel.com/docs/functions/websockets).
