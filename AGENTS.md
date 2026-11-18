# Claudio — asistente de escritorio

Asistente de Javier y Ana (pareja) que vive en un iPhone 11 reciclado sobre la mesa: unos ojos animados en **pixel art** (colores planos, paleta cálida tipo Claude) arriba y la lista de **próximos eventos y tareas** abajo, en vertical. Se le habla por voz con palabra de activación ("Claudio") en español o inglés.

Estado (2026-11-18): en producción, fase 1 y base de la fase 2: agenda, listas, categorías, rutinas de mantenimiento, tiempo, panel dinámico, chat con Haiku por teclado y voz. Solo en dev, pendiente de PR: dos personas (Javier y Ana: dueño de cada cosa y quién habla por el tono de voz, Jorge o Mónica al contestar), subcategorías y prioridad 0–3. Producción se despliega sola al mergear a `main`. Google Calendar y la voz definitiva en castellano, en la fase 5. Ver `ROADMAP.md`.

Repo público: https://github.com/deimos97/claudio-task-assistant

## Arquitectura

```
iPhone 11 (PWA en modo kiosco)  ──►  Backend Claudio (Mac mini)  ──►  Claude Haiku (API, tool use)
  ojos, agenda, micro, wake word        BD, motor de mantenimiento,       │
                                        planificador, STT/TTS              └─► Google Calendar (sincronización)
                                              │
                                              └─► ROADMAP / issues ──► Claude Code (rama dev → main)
```

- **Cliente:** PWA (no app nativa: las apps firmadas con cuenta gratuita caducan a los 7 días y cada actualización exige Xcode). Añadida a pantalla de inicio + Acceso Guiado + bloqueo automático "Nunca".
- **Backend:** en el Mac mini (arm64, macOS 26). Es la fuente de verdad de todos los datos.
- **LLM:** Claude Haiku vía API con herramientas (`create_event`, `log_reading`, `complete_task`, `list_upcoming`, `add_roadmap_item`…). Sin modelo local en el iPhone.
- **Voz:** el navegador corta frases por energía (VAD) → whisper.cpp en el Mac mini las transcribe → si empiezan por "Claudio", pitido / orden → Haiku → voz (Jorge con `say` en español, Kokoro Heart en inglés) → altavoz. Ver `docs/voz.md`.
- **Calendario:** Claudio es dueño de sus eventos; se sincronizan hacia Google Calendar.

## Stack y estructura

- **Backend:** Node ≥ 24 ejecutando TypeScript directamente (type stripping, sin build) + [Hono](https://hono.dev). Solo sintaxis "borrable": nada de `enum` ni `namespace` (lo comprueba `erasableSyntaxOnly`).
- **Cliente:** HTML + CSS + JavaScript (módulos ES) sin framework ni build. Lo que hay en `web/` es lo que se sirve.

```
server/index.ts        API (health, upcoming, items, chat, stream) y sirve web/
server/config.ts       rutas (datos en ~/.claudio/<entorno>/), hora local de Madrid, las dos personas (PEOPLE) y su voz
server/db.ts           SQLite (node:sqlite) + migraciones + copias automáticas
server/migrations/     NNN_nombre.sql, se aplican solas al arrancar
server/items.ts        eventos y tareas: consultas y validación (y `checkCategory`)
server/lists.ts        listas (compra, ideas…) y sus entradas
server/routines.ts     mantenimiento: activos, contadores, lecturas, rutinas y su próxima fecha
server/view.ts         lo que enseña el panel: "Próximo" o la vista que pide Claudio (`show`)
server/weather.ts      tiempo de Open-Meteo (caché 15 min)
server/chat.ts         chat con Claude Haiku (claude-haiku-5-5) y sus herramientas
server/bus.ts          avisos en vivo (SSE) a todas las pantallas
server/voice.ts        voz: whisper (127.0.0.1:3120) para entender; para hablar, `say` Jorge (es) y Kokoro Heart (en, 127.0.0.1:3121)
web/index.html         página única: ojos arriba, panel abajo, pie (tiempo, fecha, conexión, micro, teclado)
web/eyes.js            ojos en pixel art: forma en "bloques" (escena de 40×22) pero posición continua a resolución real → movimiento suave. Estados: idle, listening, thinking, talking, happy, sleepy, sleeping
web/app.js             fecha y tiempo, modo noche, panel dinámico, chat por teclado, voz, avisos en vivo, salud + auto-recarga, wake lock
web/voice.js           oídos: micro → 16 kHz → VAD → frases WAV; pitido; reproducir la voz; detectar "Claudio"
web/capture-worklet.js hilo de audio que pasa las muestras del micro
web/sw.js              service worker (red primero; la API nunca se cachea)
scripts/install-agent.sh  instala el LaunchAgent de dev o prod
scripts/deploy.sh      despliega producción desde origin/main
scripts/auto-deploy.sh      cada minuto: si origin/main cambió, ejecuta deploy.sh (scripts/install-autodeploy.sh lo instala)
scripts/install-whisper.sh  instala whisper.cpp + modelos y su LaunchAgent (común a dev y prod)
scripts/install-tts.sh      instala Kokoro (voz inglesa) + modelos y su LaunchAgent (común a dev y prod)
scripts/kokoro-server.py    servidor HTTP mínimo de Kokoro (127.0.0.1:3121)
```

## Comandos

```bash
npm run dev      # servidor con --watch (PORT=3111 por defecto)
npm run check    # comprobación de tipos
```

## Entornos (Mac mini)

| Entorno | Rama | Carpeta | Puerto | LaunchAgent | Log |
|---|---|---|---|---|---|
| dev (`https://claudio-dev.hotwheelsandbids.com`) | `dev` | esta copia de trabajo | 3111 | `com.deimos97.claudio.dev` (con `--watch`) | `~/Library/Logs/claudio-dev.log` |
| prod (`https://claudio.hotwheelsandbids.com`) | `main` | `~/Services/claudio-prod` (clon aparte) | 3110 | `com.deimos97.claudio.prod` | `~/Library/Logs/claudio-prod.log` |

Servicios compartidos por dev y prod (también LaunchAgents, solo en 127.0.0.1):

| Servicio | LaunchAgent | Puerto | Instalar | Log |
|---|---|---|---|---|
| Reconocimiento de voz (whisper.cpp) | `com.deimos97.claudio.whisper` | 3120 | `scripts/install-whisper.sh` | `~/Library/Logs/claudio-whisper.log` |
| Voz inglesa (Kokoro) | `com.deimos97.claudio.kokoro` | 3121 | `scripts/install-tts.sh` | `~/Library/Logs/claudio-kokoro.log` |
| Despliegue automático (cada minuto) | `com.deimos97.claudio.autodeploy` | — | `scripts/install-autodeploy.sh` | `~/Library/Logs/claudio-deploy.log` |

Datos fuera del repo, en `~/.claudio/`: `dev/` y `prod/` (BD y copias), `models/`, `tts-venv/`, `anthropic-key` (600).

- Se trabaja en `dev`; a `main` solo por PR `dev → main` aprobado por Javier. **Al mergear, prod se despliega sola en menos de un minuto** (LaunchAgent `com.deimos97.claudio.autodeploy`; ver `docs/despliegue.md`). A mano: `scripts/deploy.sh`.
- Nunca editar a mano `~/Services/claudio-prod`: `deploy.sh` hace `git reset --hard origin/main`.
- La PWA consulta `/api/health` cada 30 s y **se recarga sola** si cambia la versión (commit + fecha del último cambio en `web/`). Un despliegue llega al iPhone sin tocarlo.
- Estado del servicio: `launchctl print gui/$(id -u)/com.deimos97.claudio.dev`; reiniciar: `launchctl kickstart -k gui/$(id -u)/com.deimos97.claudio.dev`.
- Depurar los ojos: pulsación larga sobre la cara muestra botones con los estados; en consola, `claudio.eyes.setState('happy')`.

## Conceptos del dominio

- **Categoría:** ruta en minúsculas de hasta 3 niveles en eventos, tareas, listas, entradas y rutinas ("casa/gatos", "yo/salud"). Filtrar por "casa" incluye sus subcategorías. La elige Claudio si no se dice.
- **Dueño (`owner`):** `javier`, `ana` o NULL (de los dos). **Quién habla** se sabe por el tono de voz o por el dueño del dispositivo; ver `docs/voz.md`.
- **Prioridad:** 0 algún día · 1 normal (por defecto) · 2 importante · 3 crítico.
- **Lista:** compra, ideas, notas… con entradas que se tachan. En la compra, la categoría es la sección del súper.
- **Activo:** coche, bici, casa…
- **Contador:** km, horas de motor, lavados…
- **Lectura:** valor fechado de un contador. Con varias lecturas se estima el ritmo de uso (km/día).
- **Rutina** (tarea de mantenimiento, tabla `routines`): disparada por tiempo, por uso, o *lo que llegue antes* (p. ej. neumáticos: 5 años o 40.000 km). Con el ritmo de uso se proyecta una fecha y aparece en la misma lista que los eventos.
- **Check-in:** Claudio pide una lectura cuando la estimación está vieja o se acerca un vencimiento proyectado.

## Reglas

- Docs y UI en español; Claudio habla español e inglés.
- **Nada llega a producción sin el sí de Javier.** Lo que se dice a Claudio es, en la práctica, un prompt para un agente que puede desplegar: el bucle de auto-mejora trabaja en `dev` y solo pasa a `main` con aprobación.
- Secretos (API key de Anthropic, OAuth de Google) en ficheros locales `chmod 600`, nunca en el repo ni en el chat.
- La identidad visual es propia de Claudio: se inspira en los colores de Claude pero no usa logos ni marca de Anthropic.

## Si vas a… → lee…

| Si vas a… | Lee |
|---|---|
| Empezar o cerrar cualquier tarea | `ROADMAP.md` |
| Montar o depurar el iPhone del escritorio (kiosco, PWA, HTTPS) | `docs/iphone-kiosco.md` |
| Desplegar o cambiar cómo se despliega | `docs/despliegue.md` |
| Tocar dominios, certificados, DNS o el nginx de la Raspberry | `docs/servidor-pi.md` |
| Tocar la BD, migraciones, copias, el chat con Haiku, sus herramientas, listas, rutinas o la clave de Anthropic | `docs/backend.md` |
| Tocar la interfaz: panel dinámico, pie, ojos | `docs/interfaz.md` |
| Tocar la voz: micro, wake word, whisper, `say` | `docs/voz.md` |
