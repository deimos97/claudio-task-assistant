-- Gasto de la API de Anthropic: una fila por llamada al modelo.
CREATE TABLE api_usage (
  id            INTEGER PRIMARY KEY,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  model         TEXT NOT NULL,
  input_tokens  INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cache_read    INTEGER NOT NULL DEFAULT 0,
  cache_write   INTEGER NOT NULL DEFAULT 0,
  cost_usd      REAL NOT NULL
);
CREATE INDEX api_usage_date ON api_usage (created_at);
