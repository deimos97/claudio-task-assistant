# Claudio — asistente de escritorio

Asistente personal que vive en un iPhone 11 reciclado sobre la mesa: unos ojos animados en **pixel art** (colores planos, paleta cálida tipo Claude) arriba y la lista de **próximos eventos y tareas** abajo, en vertical. Se le habla por voz con palabra de activación ("Claudio") en español o inglés.

Estado: **fase 0 en curso** (2026-11-17): servidor y PWA con los ojos funcionando en dev. Ver `ROADMAP.md`.

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
- **Voz:** wake word en el navegador (WASM) → pitido → grabación hasta silencio (VAD) → STT en el Mac mini (whisper.cpp, multilingüe) → Haiku → TTS.
- **Calendario:** Claudio es dueño de sus eventos; se sincronizan hacia Google Calendar.

## Stack y estructura

- **Backend:** Node ≥ 24 ejecutando TypeScript directamente (type stripping, sin build) + [Hono](https://hono.dev). Solo sintaxis "borrable": nada de `enum` ni `namespace` (lo comprueba `erasableSyntaxOnly`).
- **Cliente:** HTML + CSS + JavaScript (módulos ES) sin framework ni build. Lo que hay en `web/` es lo que se sirve.

```
server/index.ts        API (/api/health, /api/upcoming) y sirve web/
web/index.html         página única: ojos arriba, "Próximo" abajo
web/eyes.js            ojos en pixel art (canvas 40×22 ampliado con image-rendering: pixelated; estados: idle, listening, thinking, talking, happy, sleepy, sleeping)
web/app.js             reloj, modo noche, lista, salud + auto-recarga, wake lock
web/sw.js              service worker (red primero; la API nunca se cachea)
scripts/install-agent.sh  instala el LaunchAgent de dev o prod
scripts/deploy.sh      despliega producción desde origin/main
```

## Comandos

```bash
npm run dev      # servidor con --watch (PORT=3111 por defecto)
npm run check    # comprobación de tipos
```

## Entornos (Mac mini)

| Entorno | Rama | Carpeta | Puerto | LaunchAgent | Log |
|---|---|---|---|---|---|
| dev | `dev` | esta copia de trabajo | 3111 | `com.deimos97.claudio.dev` (con `--watch`) | `~/Library/Logs/claudio-dev.log` |
| prod | `main` | `~/Services/claudio-prod` (clon aparte) | 3110 | `com.deimos97.claudio.prod` | `~/Library/Logs/claudio-prod.log` |

- Se trabaja en `dev`; a `main` solo por PR `dev → main` aprobado por Javier. Después: `scripts/deploy.sh`.
- Nunca editar a mano `~/Services/claudio-prod`: `deploy.sh` hace `git reset --hard origin/main`.
- La PWA consulta `/api/health` cada 30 s y **se recarga sola** si cambia la versión (commit + fecha del último cambio en `web/`). Un despliegue llega al iPhone sin tocarlo.
- Estado del servicio: `launchctl print gui/$(id -u)/com.deimos97.claudio.dev`; reiniciar: `launchctl kickstart -k gui/$(id -u)/com.deimos97.claudio.dev`.
- Depurar los ojos: pulsación larga sobre la cara muestra botones con los estados; en consola, `claudio.eyes.setState('happy')`.

## Conceptos del dominio

- **Activo:** coche, bici, casa…
- **Contador:** km, horas de motor, lavados…
- **Lectura:** valor fechado de un contador. Con varias lecturas se estima el ritmo de uso (km/día).
- **Tarea de mantenimiento:** disparada por tiempo, por uso, o *lo que llegue antes* (p. ej. neumáticos: 5 años o 40.000 km). Con el ritmo de uso se proyecta una fecha y aparece en la misma lista que los eventos.
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
