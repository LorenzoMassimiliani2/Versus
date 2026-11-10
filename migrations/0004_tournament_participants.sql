-- Partecipanti ai tornei. Un utente può partecipare a più tornei.
-- La rimozione è logica: la riga resta con status = 'removed' per conservare
-- lo storico, mentre la chiave composta impedisce duplicati.

CREATE TABLE tournament_participants (
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('active','removed')),
  added_by TEXT NOT NULL,
  added_at TEXT NOT NULL,
  removed_at TEXT,
  PRIMARY KEY (tournament_id, user_id)
);

CREATE INDEX idx_participants_user ON tournament_participants(user_id);
