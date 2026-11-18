# ROADMAP — Claudio

## Estado de partida (2026-11-17)

- Carpeta vacía, sin repo git todavía (repo creado ese mismo día: deimos97/claudio-task-assistant, público).
- Mac mini: macOS 26.6.2, arm64, Node y Python 3 instalados; sin Tailscale, Caddy ni whisper.cpp. IP 192.168.0.215 (Ethernet).
- Raspberry 192.168.0.5 (Debian 13): Pi-hole (DNS + DHCP) y nginx público en :443 con certbot para `hotwheelsandbids.com` (home-portal) y `pihole.`; DNS del dominio en Cloudflare.
- iPhone 11 disponible (LCD, sin riesgo de quemado de pantalla; batería: vigilar hinchazón por carga continua).

## Fase 0 — Esqueleto

- [x] Elegir stack del backend y del cliente (2026-11-17)
- [x] `git init`, repo en GitHub, ramas `main` / `dev` (2026-11-17)
- [x] Backend mínimo en el Mac mini como LaunchAgent: dev en :3111 (2026-11-17)
- [x] Primer merge `dev → main` (PR #1) y `scripts/deploy.sh` → prod en :3110 (2026-11-18, dc3dad8)
- [x] Config de nginx (`deploy/nginx/claudio.conf`) y guía `docs/servidor-pi.md` para servir por dominio (2026-11-18)
- [x] HTTPS por dominio: `https://claudio.hotwheelsandbids.com` (prod) y `https://claudio-dev.hotwheelsandbids.com` (dev); certificado Let's Encrypt válido hasta 2027-02-16, HTTP→HTTPS, red local sin login (2026-11-18)
- [x] Pi-hole: registro local `claudio-dev.hotwheelsandbids.com` → `192.168.0.5` (2026-11-18)
- [x] Comprobado desde fuera de casa (datos móviles): pide el login del portal y después abre Claudio, prod y dev (2026-11-18)
- [x] `sudo certbot renew --dry-run` en la Raspberry: las tres renovaciones simuladas OK (2026-11-18)
- [x] PWA con los ojos animados: idle/parpadeo, mirar alrededor, escuchando, pensando, hablando, contento, adormilado, dormido (noche 23:00–07:30) (2026-11-17)
- [x] Probar en el iPhone 11 real (rendimiento de la animación, wake lock, instalación en pantalla de inicio) (2026-11-18)
- [x] iPhone en modo kiosco: pantalla de inicio, Acceso Guiado, bloqueo "Nunca" (2026-11-18)

## Fase 1 — Hablar con Claudio (texto y voz) + eventos

- [x] Base de datos (SQLite, `node:sqlite`) + migraciones versionadas + copia al arrancar y cada 24 h, 14 guardadas (2026-11-18)
- [x] Chat de texto con Haiku (`claude-haiku-5-5`, esfuerzo bajo) y herramientas: listar, crear, cambiar, completar y borrar eventos/tareas (2026-11-18; probado con una API simulada)
- [x] Probado con la API real en dev: crear, mover, completar y borrar; responde en el idioma de la pregunta y pide la hora si falta; ~1–2,5 s por respuesta (2026-11-18)
- [x] Entrada por teclado: botón pequeño en móvil que abre un panel; en escritorio, columna de chat siempre visible (2026-11-18)
- [x] Fase 1 (texto + voz) desplegada a prod: PR #2 mergeado y `scripts/deploy.sh` (2026-11-18, c7a5abc). BD de prod nueva y vacía; migraciones 001–002 aplicadas
- [x] Wake word "Claudio" + pitido: el navegador detecta frases por energía (VAD) y whisper las transcribe; si empiezan por "Claudio" (o "oye/hey Claudio") es para él. "Claudio" solo → pitido y espera la orden 7 s; "Claudio, haz X" de un tirón → directo (2026-11-18; probado con audio grabado en el navegador)
- [x] Reconocimiento de voz en el Mac mini: whisper.cpp (`large-v3-turbo` q5 + VAD Silero) como LaunchAgent en 127.0.0.1:3120; idioma fijado a "es" (entiende igual el inglés) → ~0,85 s por frase (2026-11-18)
- [x] Claudio contesta en voz alta: `say` de macOS (voz Reed, es/en según el texto) → AAC; mientras habla no escucha. Si su respuesta es una pregunta, vuelve a escuchar sin wake word (2026-11-18)
- [x] Botón de micro en la cabecera (activa la voz en ese dispositivo y lo recuerda); con la voz activada, tocar la cara = "te escucho" (2026-11-18)
- [x] Voz probada en el iPhone real: funciona (2026-11-18). Javier sigue probando por si hay fallos
- [x] Voz nueva (provisional): **Jorge (mejorada)** de macOS en español y **Kokoro Heart** en inglés, con Samantha de respaldo (2026-11-18)
- [x] Claudio decía "te dije que había mirado la lista y no lo hice": el historial sin herramientas le confundía. Ahora recibe la agenda en cada turno y el historial es de las últimas 3 h (2026-11-18)
- [x] Las muestras de voz no sonaban en el iPhone: el service worker ya no intercepta audio (2026-11-18)
- [x] Registro del gasto de la API (`api_usage`, `GET /api/usage`): ~0,00034 $ por mensaje de media (2026-11-18)
- [x] Listas que Claudio mantiene (compra, ideas, notas…): la de la compra va por secciones del súper; no duplica lo pendiente; lo comprado se tacha (2026-11-18)
- [x] Categorías en todo (eventos, tareas, listas, rutinas): Claudio pone las obvias y dice cuál ha puesto (2026-11-18)
- [x] Tiempo (Open-Meteo, sin clave) en el pie junto a la fecha ("Miércoles - 18-11-26") y en la agenda de Claudio. Lugar por defecto: Madrid (`CLAUDIO_LAT`/`CLAUDIO_LON`/`CLAUDIO_PLACE`) (2026-11-18)
- [ ] Confirmar la ubicación del tiempo (ahora Madrid)
- [x] Interfaz: fuera la barra de arriba; tiempo, fecha, punto de conexión, micro y teclado en un pie de una línea; ojos al 36 % en reposo (2026-11-18)
- [x] Panel dinámico: Claudio "te enseña" lo que pides con la herramienta `show` (una lista, una categoría, lo de N días…): los ojos encogen al 13 %, el panel sube como una tarjeta y lo miran; vuelve a "Próximo" tras 60 s sin tocarlo, al tocar los ojos o la ×, o con una respuesta que no enseña nada (2026-11-18)
- [x] Pie y altura comprobados en el iPhone real: la PWA solo enseña `100svh` (848 de 896) (2026-11-18)
- [ ] Probar el panel dinámico en el iPhone real
- [x] Sincronización en vivo entre pantallas (SSE, `/api/stream`): agenda y chat aparecen al momento en todas (2026-11-18)
- [x] Diseño de escritorio básico: ojos + lista a la izquierda, chat a la derecha (≥ 900 px con ratón) (2026-11-18)
- [x] Eventos y tareas propios de Claudio en "Próximo": vencidas en rojo, tocar el círculo marca una tarea como hecha (2026-11-18)

## Fase 1b — Dos personas, subcategorías y prioridad

- [x] Subcategorías: la categoría es una ruta "casa/gatos", "yo/salud"; pedir "casa" incluye todo lo de dentro y la vista agrupa por subcategoría (2026-11-18)
- [x] Prioridad 0–3 en tareas y rutinas: 0 algún día (gris) · 1 normal (por defecto) · 2 importante (!) · 3 crítico (‼ en rojo) (2026-11-18)
- [x] Dueño: Javier, Ana o los dos (migración 004). Lo de la casa, de los dos; "recuérdame…" de quien habla; "recuérdale a Ana…" de Ana; si Haiku duda, pregunta. Probado con la API real (2026-11-18)
- [x] Quién habla: por voz, el tono medio de la frase (autocorrelación en el navegador; corte 150 Hz ±10, en la duda el dueño del dispositivo); por teclado, el dueño del dispositivo (menú de la pulsación larga) (2026-11-18)
- [ ] Calibrar el corte de tono con las voces reales de Javier y Ana (las medidas de la pulsación larga enseñan el tono de la última frase)
- [x] Voz según quién habla: Jorge a Javier (y si no se sabe), Mónica (mejorada) a Ana (2026-11-18)
- [x] Plazos con antelación ("la limpieza dental antes del 1 de diciembre, pero hay que pedirla con 1–2 semanas"): la tarea es la gestión, con `at` = último día para hacerla y `start_at` = desde cuándo avisar; el límite real va en las notas. Antes de `start_at` no sale en pantalla; después enseña "quedan N días". Si el margen ya pasó, Claudio lo dice y sube la prioridad (migración 005) (2026-11-18)
- [x] Pie: fecha corta sin año ("Mié - 18-11") y círculo de dispositivo: K (kiosco, compartido) → J → A (2026-11-18)
- [x] Vistas por prioridad: "¿qué tengo que hacer hoy sí o sí?" → `show` con `days: 1`, `who`, `sort: "priority"` (2026-11-18)

## Fase 2 — Motor de mantenimiento

- [x] Modelo: activos, contadores, lecturas, rutinas (tiempo / uso / lo primero) e historial (`003_listas_rutinas.sql`) (2026-11-18)
- [x] Rutinas solo por tiempo, sin activo: "cambiar la arena de los gatos cada 5 días" (probado con la API real) (2026-11-18)
- [x] Estimación de ritmo de uso (lecturas del último año) y fecha proyectada; vence lo primero que llegue (2026-11-18)
- [x] Rutinas en "Próximo" (las que tocan en 14 días; círculo discontinuo); marcarlas hechas apunta la fecha (y el contador) y recalcula la siguiente (2026-11-18)
- [ ] Probar una rutina por uso con lecturas reales (coche: km)

## Fase 3 — Proactividad (y mejoras de voz)

- [ ] (Si hiciera falta) wake word dedicada en el navegador (openWakeWord/Porcupine) en vez de transcribir cada frase
- [x] Avisos en pantalla en vez de hablar solo (2026-11-18): rutina que toca ("¿Hecho? Cambiar la arena"), contador con lectura vieja ("Coche: ¿cuántos km?"), cita pasada sin marcar ("¿Lo tuviste?"). Al tocarlo, Claudio pregunta y apunta la respuesta. `server/nudges.ts`
- [x] Resumen de la mañana como aviso (6:00–12:30): tiempo, lo de hoy y lo que no hay que olvidar, más la vista de hoy (2026-11-18)
- [x] Papel por dispositivo (2026-11-18): el kiosco escucha «Claudio», habla y duerme de noche; el móvil de Javier o Ana tiene micro de pulsar para hablar y no duerme. Se elige en el menú del pie
- [x] Los ojos te siguen con la cámara frontal, por movimiento (2026-11-18). `web/camera.js`
- [ ] Probar en el iPhone: cámara + micro a la vez (iOS a veces corta un `getUserMedia` al abrir otro), avisos y anillo de las rutinas
- [x] Tras un cambio, el panel enseña solo lo cambiado, resaltado, 12 s (2026-11-18)
- [ ] Calibrar el tono con vuestras voces: el 2026-11-18 una frase de Javier ("Ahí está") salió como Ana
- [ ] Si el seguimiento por movimiento se queda corto: detección de caras (p. ej. MediaPipe en local)

## Fase 4 — Auto-mejora

- [ ] "Claudio, quiero X" → item en ROADMAP / issue de GitHub
- [ ] Claude Code en el Mac mini lo implementa en `dev` y despliega en dev
- [x] Aprobación de Javier → merge a `main` → despliegue a producción: el despliegue ya es automático al mergear (2026-11-18)

## Fase 5 — Integraciones y voz definitiva

- [ ] Sincronización con Google Calendar (calendario dedicado "Claudio"); necesita un proyecto en Google Cloud con OAuth
- [ ] Voz definitiva en castellano con carácter de "robot Disney" (entrañable, expresivo; no efectos robóticos): clonar en local (Chatterbox/F5) con una grabación de referencia, o voz diseñada en la nube (ElevenLabs)

## Deuda técnica

- [x] Despliegue automático al mergear a `main`: el Mac mini mira `origin/main` cada minuto y ejecuta `deploy.sh` (2026-11-18)
- [ ] Si un despliegue automático falla, que Claudio lo diga (ahora solo queda en `~/Library/Logs/claudio-deploy.log`)
- [x] Cuando se le da hora a una tarea ("la limpieza dental el jueves a las 17:00"), Claudio la dejaba como tarea con hora en vez de pasarla a evento: regla en el prompt ("si te dan hora, es un evento") (2026-11-18)
- [ ] El chat de la API no tiene login en la red de casa: cualquiera en la Wi-Fi puede usarlo (y gastar API). Bajo riesgo hoy; revisar si se abre más
- [ ] Sesión más larga fuera de casa: si molesta volver a entrar cada 12 h, "recordarme" en el home-portal (decidido en vez de emparejar dispositivos)

- [x] El icono PNG tenía esquinas transparentes; ahora es un cuadrado opaco en pixel art (2026-11-17)

## Decisiones tomadas

| Fecha | Decisión | Por qué |
|---|---|---|
| 2026-11-18 | Tras cada cambio, la pantalla enseña sola dónde ha quedado (resaltado) y se quita a los 12 s | Javier quiere ver lo que se ha añadido sin pedirlo |
| 2026-11-18 | Claudio no habla por su cuenta: lo proactivo (resumen, preguntas de rutinas, km, citas pasadas) sale como aviso en pantalla y se dice al tocarlo o pedirlo | Javier no quiere que hable si no hay nadie delante |
| 2026-11-18 | Las citas también se marcan ("la tuve"); si pasan sin marcar, siguen en rojo 30 días | Para no olvidar reprogramar una cita a la que no se fue |
| 2026-11-18 | Pie con solo micro, cámara y menú; teclado, gestión y perfil van en el menú | Despejar el pie y dejar a mano lo que se activa a menudo |
| 2026-11-18 | Página de gestión propia (`admin.html`) sobre la misma API, sin login aparte | Crear y corregir a mano sin pasar por Claudio; misma protección que el resto (LAN o login del portal) |
| 2026-11-18 | Seguimiento de la cámara por movimiento, sin librerías de caras | Funciona en Safari, pesa cero y basta para que los ojos miren hacia quien se mueve |
| 2026-11-17 | LLM en la nube (Claude Haiku), sin modelo local en el iPhone | El iPhone 11 no tiene Apple Intelligence; un modelo de 1–3B se calienta y es mucho peor |
| 2026-11-17 | Cliente web (PWA), no app nativa | Las apps con cuenta gratuita caducan a los 7 días; la PWA permite que Claude Code despliegue solo |
| 2026-11-17 | Backend en el Mac mini al principio | Siempre encendido y es donde ya corre Claude Code; se puede mover a un VPS más adelante |
| 2026-11-17 | Claudio es dueño de sus eventos y sincroniza hacia Google Calendar | Fuente de verdad única; Google como vista |
| 2026-11-17 | Claudio habla español e inglés | Preferencia de Javier |
| 2026-11-17 | Activación por palabra ("Claudio") con pitido de confirmación | Preferencia de Javier |
| 2026-11-17 | Backend: Node ≥ 24 con TypeScript sin build + Hono; cliente: HTML/CSS/JS sin framework | Mínimas piezas para que Claude Code pueda cambiar y desplegar sin cadena de build |
| 2026-11-17 | Prod en clon aparte (`~/Services/claudio-prod`, :3110), dev en la copia de trabajo (:3111) | Trabajar en dev nunca toca lo que muestra el iPhone |
| 2026-11-17 | Sin atribución de Claude en commits ni PRs | Preferencia de Javier (desactivado también en `~/.claude/settings.json`) |
| 2026-11-17 | Ojos en pixel art con colores planos (coral sobre fondo oscuro, brillo crema) en vez de ojos realistas | A Javier los ojos realistas le daban mal rollo; el pixel art es más mono y más "asistente" |
| 2026-11-17 | Ojos: forma pixelada pero movimiento suave (sprite a resolución real con muelle amortiguado) y más recorrido de mirada | El movimiento a saltos de bloque no le gustaba a Javier |
| 2026-11-18 | Añadidos: teclado, notas/listas, tiempo, copias de seguridad, varias pantallas con sincronización en vivo, resumen diario y papel por dispositivo | Ideas aprobadas por Javier |
| 2026-11-18 | Datos fuera del repo, en `~/.claudio/<entorno>/` (BD y copias); clave de Anthropic en `~/.claudio/anthropic-key` (600), común a dev y prod | `deploy.sh` hace `git reset --hard` en prod; dev y prod no comparten datos |
| 2026-11-18 | Chat: una sola conversación compartida por todas las pantallas; solo se guarda el texto de cada turno (no las llamadas a herramientas); contexto de 20 mensajes | Simple y barato; la agenda real está en la BD, no en el historial |
| 2026-11-18 | POST de la API solo con `Content-Type: application/json` | Protección CSRF barata: otra web no puede enviarlo sin preflight CORS |
| 2026-11-18 | Despliegue automático por sondeo desde el Mac mini (cada minuto), no con GitHub Actions ni webhook | Repo público: un runner propio en casa es arriesgado y un webhook expone otro punto de entrada. El merge de Javier sigue siendo el sí |
| 2026-11-18 | Voces provisionales: Jorge (macOS, mejorada) en español y Kokoro Heart en inglés | A Javier le gustan; ninguna local tenía acento de España con carácter a la vez. La original de Loquendo no se puede usar (discontinuada, con licencia) |
| 2026-11-18 | Voz adelantada de la fase 3 a la fase 1 | Preferencia de Javier |
| 2026-11-18 | Wake word = VAD por energía en el navegador + whisper en el Mac mini, sin modelo de wake word ni cuentas externas | Todo local, sin entrenar un modelo ni depender de Picovoice; whisper ya hacía falta para las órdenes. Si hay falsos positivos o va lento, se cambia solo esa pieza |
| 2026-11-18 | Fuera el emparejamiento de dispositivos; si hace falta una sesión más larga fuera de casa, se mejora la sesión del home-portal ("recordarme") | Una sola forma de entrar para todos los servicios de la casa |
| 2026-11-18 | Google Calendar y la voz definitiva en castellano pasan a una fase 5 | Ni bloquean el uso diario ni son urgentes; primero listas, tiempo y mantenimiento |
| 2026-11-18 | Categorías en todo; Claudio elige las obvias y lo dice | Para poder pedir "lo de casa" sin clasificar a mano |
| 2026-11-18 | Panel dinámico que Claudio controla: en reposo ojos al 36 %, al enseñar algo el panel crece como tarjeta sobre los ojos (13 %) y vuelve solo a los 60 s | Que la pantalla muestre lo que preguntas sin tocarla (solo para hacer scroll); como tarjeta parece que Claudio te lo enseña |
| 2026-11-18 | Plazos con antelación = tarea de la gestión con fecha límite (`at`) y fecha de aviso (`start_at`), no dos tareas ni un evento | Lo que hay que hacer es pedir la cita; el plazo real va en las notas y la tarea se calla hasta que toca |
| 2026-11-18 | Prioridad en 4 niveles (0–3) | Pocos niveles: Haiku los asigna con criterio estable y se eligen bien a voz |
| 2026-11-18 | Claudio es de Javier y Ana; cada cosa es de uno, del otro o de los dos | Ana también lo usa; lo de la casa es compartido |
| 2026-11-18 | Quién habla: tono de voz (local) + dueño del dispositivo para el teclado; huella de voz solo si el tono falla | Gratis, sin entrenar nada y suficiente para dos voces de distinto tono |
| 2026-11-18 | Jorge contesta a Javier y Mónica a Ana | Así se oye a quién ha entendido Claudio que le habla |
| 2026-11-18 | Lo repetitivo es una "rutina" (tabla `routines`), no una tarea que se clona | Una sola fila con su historial; la siguiente fecha se calcula, no se guarda |
| 2026-11-18 | Categorías como texto libre en minúsculas, sin tabla aparte | Claudio las elige y reutiliza las que ve en uso; no hace falta gestionarlas |
| 2026-11-18 | Dominio propio en vez de Tailscale: `claudio.` / `claudio-dev.hotwheelsandbids.com`, nginx de la Raspberry como proxy al Mac mini; red local sin login, fuera con login del home-portal | Reutiliza la infraestructura que ya existe (nginx, certbot, Pi-hole, login) y no exige app en cada dispositivo |
