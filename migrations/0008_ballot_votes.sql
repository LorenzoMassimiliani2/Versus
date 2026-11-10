-- Schede di voto classifica e pick (TICKET-0019).
-- `ballot_votes` contiene il voto corrente di ogni partecipante per target:
-- l'id del girone per le fasi `group`, l'id della fase per le altre formule.
-- `payload` e' JSON: `{ assignments: [{ elementId, points }] }` per ranking,
-- `{ elementId }` per pick. Ogni modifica aggiunge una riga in `vote_events`.

CREATE TABLE ballot_votes (
  phase_id TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL,
  voter_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('ranking','pick')),
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (phase_id, target_id, voter_id)
);

CREATE INDEX idx_ballot_votes_phase ON ballot_votes(phase_id, target_id);
