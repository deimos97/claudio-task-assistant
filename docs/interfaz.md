# Interfaz: ojos, panel dinámico y pie

Lee esto si vas a: cambiar la distribución de la pantalla, lo que enseña el panel o el pie.

## Distribución (móvil, vertical)

```
┌───────────────────────┐
│  ojos (36 %)          │  ← en reposo; 13 % cuando Claudio enseña algo
│  leyenda              │
│  [☀️ Resumen de hoy ×] │  ← avisos: Claudio espera a que los toques
├───────────────────────┤
│  panel                │  ← "Próximo", o la vista que pide Claudio (tarjeta que sube)
│                       │
├───────────────────────┤
│ 🌧️ 17° 💧95%  Mié - 18-11   ● 🎤 📷 K │  ← pie de una línea
└───────────────────────┘
```

- Sin barra de arriba: la hora ya la da el iPhone (también en Acceso Guiado).
- Pie: tiempo (lluvia solo si ≥ 40 %; máximas/mínimas en el `title`), fecha corta sin año (la larga en el `title`), punto de conexión, micro, cámara y menú. El botón del menú lleva la inicial del perfil (K kiosco, J Javier, A Ana).
- Menú (sube desde el pie): teclado (abre el chat justo encima del pie; en escritorio no sale porque el chat siempre se ve), **Gestionar** (`admin.html`), perfil de este dispositivo y estados de los ojos con medidas de pantalla (lo mismo que la pulsación larga).
- Perfil (`localStorage` `claudio.who`): **Kiosco** escucha «Claudio» siempre que el micro esté activo, habla y duerme de 23:00 a 7:30. **Javier / Ana**: el micro es pulsar para hablar (pitido, una orden, se apaga) y no duerme.
- Cámara (`web/camera.js`): frontal a 48×36 en gris, ~9 fotogramas/s; el centro de lo que cambia entre fotogramas es hacia donde miran los ojos (en espejo). Nada sale del iPhone. Se recuerda encendida (`claudio.cam`) y se reabre al volver a la app.

## Avisos (Claudio no habla solo)

- `GET /api/nudges` (`server/nudges.ts`): resumen de hoy (6:00–12:30), citas pasadas sin marcar, rutinas que tocan hoy o antes y contadores con rutinas por uso cuya última lectura tiene más de 21 días. Como mucho 4.
- Salen como botones bajo los ojos (los ojos los miran un momento al aparecer). Tocar = se manda a Claudio el `ask` ("Pregúntame si ya he hecho «…»") y él hace la pregunta; con el micro del kiosco activo la dice en voz alta y se queda escuchando; si no, se abre el teclado. La × lo quita por hoy.
- Tocado o descartado = fila en `nudges_seen` (clave + día): no vuelve hasta mañana. Pedir "el resumen" de palabra también lo quita.
- Claudio ve los avisos pendientes en su agenda: a "¿qué querías?" pregunta por ellos.

## Gestión (`admin.html`)

Página normal (con scroll) para crear, editar, completar y borrar a mano: pestañas Agenda (citas y tareas, con "ver lo hecho"), Listas (añadir con sección, tachar, quitar tachadas, borrar lista) y Rutinas (hecha hoy u otro día, editar, borrar). Usa la API de `docs/backend.md` y se refresca con los avisos en vivo.
- Escritorio (≥ 900 px con ratón): ojos + panel + pie a la izquierda, chat a la derecha.
- Los ojos caben en su caja (`.eyes-box`): `Eyes.resize()` ajusta el canvas a lo que quepa con la proporción 40:22 y se recalcula con un `ResizeObserver` mientras la caja encoge o crece.

## Panel dinámico

- Claudio usa la herramienta `show` con una especificación: `{list}` (una lista), `{lists: true}`, `{category}`, `{kinds: [events|tasks|routines]}`, `{days}` y `title` opcional. `server/view.ts` la convierte en grupos de filas.
- El servidor avisa con el evento SSE `show` (todas las pantallas lo enseñan) y la respuesta de `POST /api/chat` trae `view`.
- Al enseñar: `body.showing` → los ojos encogen, el panel sube como tarjeta con el título de la vista y la respuesta de Claudio debajo, y los ojos miran hacia abajo.
- Vuelve a "Próximo": a los 60 s sin tocar el panel (scroll o toques reinician la cuenta), al tocar la × o los ojos, o cuando llega una respuesta que no enseña nada.
- La pantalla guarda la especificación y vuelve a pedir `GET /api/view?spec=…` con cada aviso `items`, así la vista sigue viva (p. ej. al tachar en la compra).
- Depurar: `claudio.show({ list: 'Compra' })`, `claudio.show({ category: 'casa' })`, `claudio.show(null)`.

## Filas

| Tipo | Izquierda | Círculo |
|---|---|---|
| Evento | cuándo; debajo "en 25 min" / "hace 2 h" si es hoy | "la tuve"; si pasó sin marcar, borde rojo y "¿La tuviste?" |
| Tarea | cuándo (rojo si vencida); "en 25 min" si tiene hora | marca hecha |
| Rutina | "En 2 días" / "Hoy" / "Hace 3 días" (rojo) y el día debajo | anillo: arco = parte del ciclo pasada, número = días que faltan ("!" si toca); tocar = hecha hoy |
| Entrada de lista | — | tacha / destacha |

Tareas con margen (`start_at`): antes de empezar, a la izquierda "desde 18 ene" en gris y en el detalle el plazo; después, el plazo y "quedan N días".

Delante del título: `!` importante (coral), `‼` crítico (rojo); lo de prioridad 0 ("algún día") va en gris.

Debajo del título, en gris: el dueño si no es de los dos (y no es la persona de la vista), la categoría (solo en "Próximo"; las vistas ya agrupan por ella) y el punto del ciclo de la rutina ("día 3 de 5", o "≈ 12.300 / 15.000 km"). La fila se repinta cada minuto para que "en 25 min" no se quede viejo.

## Monkey noises

- **Hueco vacío bajo el pie en la PWA del iPhone** (2026-11-18): con `height: 100%` la altura calculada no siempre coincide con la pantalla, sobre todo tras abrir y cerrar el teclado, que deja la página desplazada. Arreglo: `body { position: fixed; inset: 0 }` y `scrollTo(0, 0)` al cerrar el teclado. Seguía sin llenar en el iPhone: ahora la altura es `100lvh` (la pantalla entera; en la PWA no hay barras). Para depurar: pulsación larga sobre la cara → medidas de la pantalla (`inner`, `visual`, `lvh`, `svh`, `body`, `pieAbajo`, zonas seguras, `standalone`).
- **Medido en el iPhone (2026-11-18):** el layout ya mide 896 (pantalla entera), pero sin teclado visible iOS seguía con `inner` 483 y `scrollY` 365: la página quedaba desplazada tras cerrar el teclado. Ahora se vuelve arriba cada vez que cambia la ventana visible (`visualViewport` resize) o hay scroll sin un campo enfocado. Además, el pie respeta solo 20 px de los 34 px de la barra de inicio.
- **Con `100lvh` el pie quedaba tapado** por una franja abajo (foto del iPhone, 2026-11-18): la PWA medía `lvh` 896 y `svh` 848, y solo se ven 848. Ahora `100svh`: comprobado en el iPhone, se ve bien. Si vuelve a fallar, pedir una captura de pantalla real (botón lateral + volumen), no una foto: mide los píxeles exactos.
