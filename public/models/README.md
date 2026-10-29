# Futbolista riggeado incluido

`player.glb` ya está incluido: adaptación del humano **Superhero Male** y pelo **Hair Buzzed** de Quaternius Universal Base Characters (CC0). El cuerpo importado conserva su malla, esqueleto y pesos; se separaron sus índices por zonas para camiseta, pantalón, medias, piel y botines. No hay generación de primitivas en el partido. Las texturas externas se sustituyeron por materiales neutros coloreables.

## Animaciones incluidas

- idle: Idle_Loop, Quaternius UAL1.
- jog: Jog_Fwd_Loop, Quaternius UAL1.
- sprint: Sprint_Loop, Quaternius UAL1.
- slide: Slide_Start, Quaternius UAL2.
- celebrate: Dance_Loop, Quaternius UAL1.
- kick, pass, gk_dive: gestos de fútbol propios horneados sobre el mismo rig. No son capturas de PES ni de jugadores reales.

Los ocho GLB están en `anims/` y se validan contra los nombres de huesos del modelo. El loader usa Three.js 0.184.0 desde CDN y mantiene `FootballPlayer3D.draw(g,p,info,kit,anim,options)`.

## Fuentes y licencia

https://quaternius.com/packs/universalbasecharacters.html
https://quaternius.com/packs/universalanimationlibrary.html
https://quaternius.com/packs/universalanimationlibrary2.html

Todos estos assets son CC0 1.0. Ver `LICENSE-Quaternius.txt`. Los archivos originales provienen de la copia pública fijada en `tools/player-assets-source.json`; ahí se registra el repositorio y revisión exacta. La adaptación del kit y las acciones de fútbol son propias de este proyecto.

## Reproducir y verificar

`python tools/build_player_assets.py` reconstruye los GLB desde la caché `tools/source-assets/`; si falta, descarga las fuentes fijadas. No se necesita Blender. `npm test` valida también los binarios incluidos, evitando volver a publicar una ruta sin modelo.

`node tools/verify_player_assets.mjs` realiza una prueba adicional con GLTFLoader, SkeletonUtils y AnimationMixer reales. Usa la copia de Three.js 0.184.0 guardada en la caché durante la verificación; el juego utiliza los módulos CDN.

`/player-benchmark.html` ejecuta 22 jugadores con el renderer real para medir FPS en el navegador. La geometría y los clips se comparten; cada jugador tiene un esqueleto y un mixer. Los materiales se clonan por jugador; las texturas no se duplican. El atlas hace una pasada de WebGL por cuadro y conserva hasta un cuadro de latencia para las poses. El rendimiento depende del dispositivo; medirlo en el equipo objetivo.
