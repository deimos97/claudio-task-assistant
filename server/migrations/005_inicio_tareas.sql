-- Tareas con margen: "pedir cita antes del 1 de diciembre, pero con 2 semanas de antelación".
-- at = fecha límite; start_at = desde cuándo hay que ponerse ("YYYY-MM-DD", hora de Madrid).
-- Antes de start_at la tarea no sale en "Próximo" (Claudio sí la ve).
ALTER TABLE items ADD COLUMN start_at TEXT;
