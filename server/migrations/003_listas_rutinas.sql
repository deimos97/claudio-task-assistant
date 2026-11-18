-- Categorías, listas (compra, ideas…) y motor de mantenimiento (activos, contadores,
-- lecturas y rutinas). Categorías: texto libre en minúsculas ("casa", "gatos", "coche").

ALTER TABLE items ADD COLUMN category TEXT;

CREATE TABLE lists (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE COLLATE NOCASE,   -- "Compra", "Ideas"…
  category   TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE list_entries (
  id         INTEGER PRIMARY KEY,
  list_id    INTEGER NOT NULL REFERENCES lists (id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  category   TEXT,                -- en la compra: "fruta", "limpieza"…
  done_at    TEXT,                -- comprado / hecho (UTC ISO)
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX list_entries_list ON list_entries (list_id, done_at);

-- Activo: coche, bici, casa… Contador: km, horas… Lectura: valor de un contador en una fecha.
CREATE TABLE assets (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  category   TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE counters (
  id         INTEGER PRIMARY KEY,
  asset_id   INTEGER NOT NULL REFERENCES assets (id) ON DELETE CASCADE,
  unit       TEXT NOT NULL COLLATE NOCASE,          -- "km", "horas"
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (asset_id, unit)
);

CREATE TABLE readings (
  id         INTEGER PRIMARY KEY,
  counter_id INTEGER NOT NULL REFERENCES counters (id) ON DELETE CASCADE,
  value      REAL NOT NULL,
  at         TEXT NOT NULL,       -- fecha local "YYYY-MM-DD"
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX readings_counter ON readings (counter_id, at);

-- Rutina: algo que se repite cada N días, cada N unidades de un contador, o lo primero que llegue.
CREATE TABLE routines (
  id              INTEGER PRIMARY KEY,
  title           TEXT NOT NULL,
  category        TEXT,
  asset_id        INTEGER REFERENCES assets (id) ON DELETE SET NULL,
  counter_id      INTEGER REFERENCES counters (id) ON DELETE SET NULL,
  every_days      INTEGER,        -- cada N días (NULL = no va por tiempo)
  every_amount    REAL,           -- cada N unidades del contador (NULL = no va por uso)
  last_done_at    TEXT,           -- fecha local de la última vez
  last_done_value REAL,           -- valor del contador la última vez
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE routine_log (
  id         INTEGER PRIMARY KEY,
  routine_id INTEGER NOT NULL REFERENCES routines (id) ON DELETE CASCADE,
  done_at    TEXT NOT NULL,       -- fecha local
  value      REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
