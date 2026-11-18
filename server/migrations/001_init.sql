-- Eventos y tareas de Claudio. Fechas en hora local de Madrid, como texto que
-- ordena bien: "YYYY-MM-DD" (todo el día) o "YYYY-MM-DDTHH:MM".
CREATE TABLE items (
  id         INTEGER PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN ('event', 'task')),
  title      TEXT NOT NULL,
  at         TEXT,              -- evento: cuándo empieza; tarea: para cuándo (NULL = sin fecha)
  end_at     TEXT,              -- solo eventos, opcional
  notes      TEXT,
  done_at    TEXT,              -- tarea hecha (UTC ISO)
  google_id  TEXT,              -- sincronización futura con Google Calendar
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX items_open ON items (done_at, at);

-- Conversación única con Claudio, compartida por todas las pantallas.
-- Solo el texto de cada turno; las llamadas a herramientas no se guardan.
CREATE TABLE chat_messages (
  id         INTEGER PRIMARY KEY,
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
