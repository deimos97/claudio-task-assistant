# Interfaz: ojos, panel dinámico y pie

Lee esto si vas a: cambiar la distribución de la pantalla, lo que enseña el panel o el pie.

## Distribución (móvil, vertical)

```
┌───────────────────────┐
│  ojos (36 %)          │  ← en reposo; 13 % cuando Claudio enseña algo
│  leyenda              │
├───────────────────────┤
│  panel                │  ← "Próximo", o la vista que pide Claudio (tarjeta que sube)
│                       │
├───────────────────────┤
│ 🌧️ 17° 💧95%  Miércoles - 18-11-26   ● 🎤 ⌨ │  ← pie de una línea
└───────────────────────┘
```

- Sin barra de arriba: la hora ya la da el iPhone (también en Acceso Guiado).
- Pie: tiempo (lluvia solo si ≥ 40 %; máximas/mínimas en el `title`), fecha, punto de conexión, micro y teclado. El chat de teclado (móvil) se abre justo encima del pie.
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
| Evento | cuándo | — |
| Tarea | cuándo (rojo si vencida) | marca hecha |
| Rutina | cuándo toca | discontinuo: "hecho hoy" |
| Entrada de lista | — | tacha / destacha |

Delante del título: `!` importante (coral), `‼` crítico (rojo); lo de prioridad 0 ("algún día") va en gris.

Debajo del título, en gris: el dueño si no es de los dos (y no es la persona de la vista), la categoría (solo en "Próximo"; las vistas ya agrupan por ella) y el detalle de la rutina ("cada 5 días · última vez 15-11").

## Monkey noises

- **Hueco vacío bajo el pie en la PWA del iPhone** (2026-11-18): con `height: 100%` la altura calculada no siempre coincide con la pantalla, sobre todo tras abrir y cerrar el teclado, que deja la página desplazada. Arreglo: `body { position: fixed; inset: 0 }` y `scrollTo(0, 0)` al cerrar el teclado. Seguía sin llenar en el iPhone: ahora la altura es `100lvh` (la pantalla entera; en la PWA no hay barras). Para depurar: pulsación larga sobre la cara → medidas de la pantalla (`inner`, `visual`, `lvh`, `svh`, `body`, `pieAbajo`, zonas seguras, `standalone`).
- **Medido en el iPhone (2026-11-18):** el layout ya mide 896 (pantalla entera), pero sin teclado visible iOS seguía con `inner` 483 y `scrollY` 365: la página quedaba desplazada tras cerrar el teclado. Ahora se vuelve arriba cada vez que cambia la ventana visible (`visualViewport` resize) o hay scroll sin un campo enfocado. Además, el pie respeta solo 20 px de los 34 px de la barra de inicio.
- **Con `100lvh` el pie quedaba tapado** por una franja abajo (foto del iPhone, 2026-11-18): la PWA medía `lvh` 896 y `svh` 848, y solo se ven 848. Ahora `100svh`: comprobado en el iPhone, se ve bien. Si vuelve a fallar, pedir una captura de pantalla real (botón lateral + volumen), no una foto: mide los píxeles exactos.
