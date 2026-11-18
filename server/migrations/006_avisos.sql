-- Avisos que Claudio deja en pantalla (resumen de la mañana, "¿has cambiado la arena?"…):
-- los vistos o descartados no vuelven a salir ese día.
CREATE TABLE nudges_seen (
  key TEXT NOT NULL,   -- "briefing", "routine:3", "reading:2", "event:14"
  day TEXT NOT NULL,   -- fecha local "YYYY-MM-DD"
  PRIMARY KEY (key, day)
);
