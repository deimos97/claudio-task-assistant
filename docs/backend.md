# Backend: BD, copias y chat con Haiku

Lee esto si vas a: cambiar el esquema de la BD, restaurar una copia, tocar el chat o sus herramientas, o configurar la clave de Anthropic.

## Datos (fuera del repo)

| Qué | Dónde |
|---|---|
| BD de dev / prod | `~/.claudio/dev/claudio.db` · `~/.claudio/prod/claudio.db` |
| Copias | `~/.claudio/<entorno>/backups/claudio-<UTC>-auto.db` (al arrancar y cada 24 h; se guardan 14) y `…-pre-migracion-N.db` (antes de cada migración; no se borran) |
| Clave de Anthropic | `~/.claudio/anthropic-key` (`chmod 600`), común a dev y prod. Si existe `ANTHROPIC_API_KEY` en el entorno, gana esa |

Se pueden mover con `CLAUDIO_HOME` (todo) o `CLAUDIO_DATA_DIR` (solo los datos de un entorno).

### Poner la clave (Javier)

Copia la clave de console.anthropic.com al portapapeles y:

```bash
mkdir -p ~/.claudio && chmod 700 ~/.claudio && (umask 077; pbpaste > ~/.claudio/anthropic-key)
```

Así no queda en el historial de la shell. Comprobar: `curl -s localhost:3111/api/health` → `"chat": true`. Si se cambia la clave, reiniciar el servicio (el cliente se crea una vez).

### Restaurar una copia

```bash
launchctl bootout gui/$(id -u)/com.deimos97.claudio.prod
cp ~/.claudio/prod/claudio.db ~/.claudio/prod/claudio-antes-de-restaurar.db
cp ~/.claudio/prod/backups/<copia>.db ~/.claudio/prod/claudio.db && rm -f ~/.claudio/prod/claudio.db-wal ~/.claudio/prod/claudio.db-shm
scripts/install-agent.sh prod
```

## Migraciones

- Ficheros `server/migrations/NNN_nombre.sql`; la versión aplicada está en `PRAGMA user_version`.
- Se aplican solas al arrancar, en transacción y tras una copia `pre-migracion-N`. En dev al guardar (por `--watch`), en prod al desplegar.
- Nunca editar una migración ya aplicada: crear la siguiente.

## Fechas

Todo en **hora local de Madrid** como texto que ordena bien: `"YYYY-MM-DD"` (todo el día) o `"YYYY-MM-DDTHH:MM"`. Así el modelo no hace cuentas de zonas horarias. Los sellos internos (`created_at`, `done_at`) van en UTC ISO.

## Chat (`server/chat.ts`)

- Modelo `claude-haiku-5-5` con `effort: "low"`; bucle manual de herramientas (máx. 8 llamadas por turno).
- Herramientas: `list_items`, `create_item`, `update_item`, `complete_item`, `delete_item`. Un error de validación vuelve al modelo como `tool_result` con `is_error`, para que lo corrija o lo diga.
- Una sola conversación para todas las pantallas; los turnos se atienden de uno en uno. Se guardan solo el texto del usuario y la respuesta final (`chat_messages`); el contexto son los últimos 20.
- La fecha y hora actual van en un segundo bloque del `system`, después del prompt fijo (que lleva `cache_control`).

## Gasto

Cada llamada al modelo se apunta en `api_usage` (tokens y coste en USD con los precios de Haiku 5.5: 0,10 $/M entrada, 0,50 $/M salida, caché a 0,1×) y el log del servicio dice `chat: <ms>, $<coste>` por turno.

Medido el 2026-11-18 con 8 órdenes de prueba (crear, mover, completar, borrar, preguntar): **0,0027 $ en total**, de 0,00007 $ a 0,0009 $ por mensaje (media 0,00034 $). El prompt fijo y las herramientas (~1.570 tokens) salen de la caché. 30 mensajes al día ≈ 0,30 $/mes. Whisper y la voz son locales: coste cero.

## API

| Ruta | Qué hace |
|---|---|
| `GET /api/health` | `{ok, env, version, chat}`; `chat` = hay clave |
| `GET /api/upcoming` | tareas abiertas (vencidas incluidas) y eventos que no han pasado |
| `POST /api/items/:id/done` | marca hecha (`{"done": false}` la reabre) |
| `GET /api/chat` · `POST /api/chat` | últimos 30 mensajes · `{text}` → `{reply, changed}` |
| `GET /api/usage` | gasto de la API de Anthropic: hoy, este mes y total (llamadas, tokens, USD) |
| `GET /api/stream` | SSE: `items` (cambió la agenda), `chat` (mensaje nuevo), `ping` cada 25 s |

Los POST exigen `Content-Type: application/json` (protección CSRF).

## Monkey noises

- **Cada reinicio de dev hace una copia** (`--watch` reinicia al guardar): por eso solo se guardan las 14 últimas `-auto`.
- **Sin clave, el chat responde 503** con un mensaje claro y el campo de texto dice "Falta la clave de Anthropic".
- **Cambios hechos desde otro proceso** (un script con `node`) escriben en la BD pero no avisan a las pantallas: el bus de avisos vive dentro del servidor.
