-- Elementi e campi personalizzati di un torneo (TICKET-0005).
-- I valori dei campi stanno in elements.custom_values come oggetto JSON:
-- la conformita' ai tipi e' validata dall'applicazione, perche' SQLite non
-- conosce i tipi dei campi dinamici.

CREATE TABLE custom_fields (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('text','number','url','date')),
  position INTEGER NOT NULL,
  UNIQUE (tournament_id, key)
);

CREATE TABLE elements (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL,
  video_url TEXT,
  custom_values TEXT NOT NULL DEFAULT '{}',
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_custom_fields_tournament ON custom_fields(tournament_id, position);
CREATE INDEX idx_elements_tournament ON elements(tournament_id, position);
CREATE INDEX idx_elements_user ON elements(user_id);
