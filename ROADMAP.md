# ROADMAP — Claudio

## Estado de partida (2026-11-17)

- Carpeta vacía, sin repo git todavía (repo creado ese mismo día: deimos97/claudio-task-assistant, público).
- Mac mini: macOS 26.6.2, arm64, Node y Python 3 instalados; sin Tailscale, Caddy ni whisper.cpp.
- iPhone 11 disponible (LCD, sin riesgo de quemado de pantalla; batería: vigilar hinchazón por carga continua).

## Fase 0 — Esqueleto

- [x] Elegir stack del backend y del cliente (2026-11-17)
- [x] `git init`, repo en GitHub, ramas `main` / `dev` (2026-11-17)
- [x] Backend mínimo en el Mac mini como LaunchAgent: dev en :3111 (2026-11-17)
- [ ] Primer merge `dev → main` y `scripts/deploy.sh` → prod en :3110
- [ ] HTTPS para el iPhone (necesario para micro/cámara): Tailscale (MagicDNS + certificados) u otra opción
- [x] PWA con los ojos animados: idle/parpadeo, mirar alrededor, escuchando, pensando, hablando, contento, adormilado, dormido (noche 23:00–07:30) (2026-11-17)
- [ ] Probar en el iPhone 11 real (rendimiento de la animación, wake lock, instalación en pantalla de inicio)
- [ ] iPhone en modo kiosco: pantalla de inicio, Acceso Guiado, bloqueo "Nunca", carga optimizada / enchufe inteligente

## Fase 1 — Hablar con Claudio (texto) + eventos

- [ ] Chat de texto con Haiku y herramientas
- [ ] Entrada por teclado: discreta en móvil (icono pequeño, como respaldo de la voz), visible en escritorio
- [ ] Base de datos (SQLite) + copias de seguridad automáticas desde el primer día
- [ ] Notas y listas (compra, ideas…) que Claudio mantiene
- [ ] Tiempo (clima) junto al reloj (Open-Meteo, sin clave)
- [ ] Varias pantallas: diseño adaptable (escritorio: ojos + lista + chat lado a lado) y sincronización en vivo entre dispositivos (SSE): lo que añades en el Mac aparece al momento en el iPhone
- [ ] Acceso fuera de casa vía Tailscale y emparejamiento sencillo de dispositivos (el servidor no queda abierto a la red)
- [ ] Eventos propios de Claudio y lista "Próximo" bajo los ojos
- [ ] Sincronización con Google Calendar (calendario dedicado "Claudio")

## Fase 2 — Motor de mantenimiento

- [ ] Modelo: activos, contadores, lecturas, tareas (tiempo / uso / lo primero)
- [ ] Estimación de ritmo de uso y fecha proyectada
- [ ] Tareas de mantenimiento en la lista "Próximo"

## Fase 3 — Voz y proactividad

- [ ] Wake word "Claudio" en el navegador + pitido de confirmación
- [ ] VAD (fin de frase) + STT con whisper.cpp en el Mac mini (es/en)
- [ ] TTS (voz de Claudio) e ignorar la wake word mientras habla él mismo
- [ ] Check-ins proactivos (pedir km, confirmar tareas hechas)
- [ ] Resumen diario por la mañana: agenda, mantenimiento que vence, tiempo
- [ ] Papel por dispositivo: solo el iPhone del escritorio ("kiosco") escucha la wake word, duerme de noche y habla en voz alta; el resto son pantallas normales
- [ ] Opcional: los ojos siguen tu cara con la cámara frontal

## Fase 4 — Auto-mejora

- [ ] "Claudio, quiero X" → item en ROADMAP / issue de GitHub
- [ ] Claude Code en el Mac mini lo implementa en `dev` y despliega en dev
- [ ] Aprobación de Javier → merge a `main` → despliegue a producción

## Deuda técnica

- [x] El icono PNG tenía esquinas transparentes; ahora es un cuadrado opaco en pixel art (2026-11-17)

## Decisiones tomadas

| Fecha | Decisión | Por qué |
|---|---|---|
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
