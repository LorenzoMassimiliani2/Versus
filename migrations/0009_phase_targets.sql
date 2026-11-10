-- Target di voto per la modalita sequenziale (TICKET-0020).
-- In una fase `sequential` e' aperto un solo target alla volta: una sfida per
-- `elimination`, un girone per `group`, la fase stessa per le altre formule.
-- La tabella conserva ordine e stato dei target; per `simultaneous` non ha righe
-- e tutti i target restano aperti come prima.

CREATE TABLE phase_targets (
  phase_id TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','open','completed')),
  opened_at TEXT,
  completed_at TEXT,
  PRIMARY KEY (phase_id, target_id),
  UNIQUE (phase_id, position)
);

CREATE INDEX idx_phase_targets_phase ON phase_targets(phase_id, position, status);
