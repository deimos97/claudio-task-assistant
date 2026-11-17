# ROADMAP — Claudio

## Estado de partida (2026-11-17)

- Carpeta vacía, sin repo git todavía.
- Mac mini: macOS 26.6.2, arm64, Node y Python 3 instalados; sin Tailscale, Caddy ni whisper.cpp.
- iPhone 11 disponible (LCD, sin riesgo de quemado de pantalla; batería: vigilar hinchazón por carga continua).

## Fase 0 — Esqueleto

- [ ] Elegir stack del backend y del cliente
- [ ] `git init`, repo en GitHub, ramas `main` / `dev`
- [ ] Backend mínimo en el Mac mini como LaunchAgent (prod y dev en puertos distintos)
- [ ] HTTPS para el iPhone (necesario para micro/cámara): Tailscale (MagicDNS + certificados) u otra opción
- [ ] PWA con los ojos animados: idle/parpadeo, mirar alrededor, escuchando, pensando, hablando, contento, dormido (noche)
- [ ] iPhone en modo kiosco: pantalla de inicio, Acceso Guiado, bloqueo "Nunca", carga optimizada / enchufe inteligente

## Fase 1 — Hablar con Claudio (texto) + eventos

- [ ] Chat de texto con Haiku y herramientas
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
- [ ] Opcional: los ojos siguen tu cara con la cámara frontal

## Fase 4 — Auto-mejora

- [ ] "Claudio, quiero X" → item en ROADMAP / issue de GitHub
- [ ] Claude Code en el Mac mini lo implementa en `dev` y despliega en dev
- [ ] Aprobación de Javier → merge a `main` → despliegue a producción

## Deuda técnica

(nada todavía)

## Decisiones tomadas

| Fecha | Decisión | Por qué |
|---|---|---|
| 2026-11-17 | LLM en la nube (Claude Haiku), sin modelo local en el iPhone | El iPhone 11 no tiene Apple Intelligence; un modelo de 1–3B se calienta y es mucho peor |
| 2026-11-17 | Cliente web (PWA), no app nativa | Las apps con cuenta gratuita caducan a los 7 días; la PWA permite que Claude Code despliegue solo |
| 2026-11-17 | Backend en el Mac mini al principio | Siempre encendido y es donde ya corre Claude Code; se puede mover a un VPS más adelante |
| 2026-11-17 | Claudio es dueño de sus eventos y sincroniza hacia Google Calendar | Fuente de verdad única; Google como vista |
| 2026-11-17 | Claudio habla español e inglés | Preferencia de Javier |
| 2026-11-17 | Activación por palabra ("Claudio") con pitido de confirmación | Preferencia de Javier |
