-- Voti di duello, eventi di voto e ledger crediti (TICKET-0018).
-- `duel_votes` contiene il voto corrente di ogni partecipante per sfida.
-- `vote_events` e `credit_entries` sono append-only: ogni modifica aggiunge righe.

CREATE TABLE duel_votes (
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  voter_id TEXT NOT NULL REFERENCES users(id),
  side TEXT NOT NULL CHECK (side IN ('a','b','abstain')),
  credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (match_id, voter_id)
);

CREATE TABLE vote_events (
  id TEXT PRIMARY KEY,
  phase_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  voter_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('duel','ranking','pick')),
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE credit_entries (
  id TEXT PRIMARY KEY,
  phase_id TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  voter_id TEXT NOT NULL REFERENCES users(id),
  match_id TEXT,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('spend','refund','adjust')),
  vote_event_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_duel_votes_match ON duel_votes(match_id);
CREATE INDEX idx_vote_events_phase ON vote_events(phase_id, created_at);
CREATE INDEX idx_credit_entries_phase ON credit_entries(phase_id, voter_id);
