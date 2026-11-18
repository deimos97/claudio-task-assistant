-- Dos personas (Javier y Ana), prioridad 0–3 y subcategorías.
-- owner: 'javier', 'ana' o NULL (de los dos). Subcategorías: la categoría es una ruta
-- "casa/gatos" (no hace falta columna nueva). Prioridad: 0 algún día · 1 normal · 2 importante · 3 crítico.

ALTER TABLE items ADD COLUMN owner TEXT CHECK (owner IN ('javier', 'ana'));
ALTER TABLE items ADD COLUMN priority INTEGER NOT NULL DEFAULT 1 CHECK (priority BETWEEN 0 AND 3);

ALTER TABLE routines ADD COLUMN owner TEXT CHECK (owner IN ('javier', 'ana'));
ALTER TABLE routines ADD COLUMN priority INTEGER NOT NULL DEFAULT 1 CHECK (priority BETWEEN 0 AND 3);

ALTER TABLE lists ADD COLUMN owner TEXT CHECK (owner IN ('javier', 'ana'));

-- Quién dijo cada mensaje (NULL = no se sabe)
ALTER TABLE chat_messages ADD COLUMN who TEXT;
