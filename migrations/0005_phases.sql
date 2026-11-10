-- Piano a fasi di un torneo (TICKET-0007).
-- Posizione, configurazione e regola di avanzamento stanno sulla fase; la
-- contiguita' delle posizioni e' garantita dall'applicazione, perche' SQLite
-- non conosce il concetto di sequenza contigua.

CREATE TABLE phases (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  formula TEXT NOT NULL CHECK (formula IN ('group','elimination','ranking')),
  vote_type TEXT NOT NULL CHECK (vote_type IN ('duel','ranking','pick')),
  config TEXT NOT NULL,
  advance TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','open','awaiting_resolution','closed','cancelled')),
  opened_at TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (tournament_id, position)
);

CREATE INDEX idx_phases_tournament ON phases(tournament_id, position);
