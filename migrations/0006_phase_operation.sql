-- Stato operativo di una fase (TICKET-0015).
-- All'apertura si congelano elementi in ingresso, votanti, gironi e sfide.
-- `phase_results` e' la proiezione scritta alla chiusura (TICKET-0016) e letta
-- dall'apertura della fase successiva per calcolare qualificati e ripescati.

CREATE TABLE phase_entrants (
  phase_id TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  element_id TEXT NOT NULL REFERENCES elements(id),
  seed INTEGER NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (phase_id, element_id)
);

CREATE TABLE phase_voters (
  phase_id TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  credits_budget INTEGER NOT NULL,
  PRIMARY KEY (phase_id, user_id)
);

CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  phase_id TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  UNIQUE (phase_id, position)
);

CREATE TABLE group_members (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  element_id TEXT NOT NULL REFERENCES elements(id),
  position INTEGER NOT NULL,
  PRIMARY KEY (group_id, element_id)
);

CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  phase_id TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES groups(id),
  round INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL,
  element_a_id TEXT REFERENCES elements(id),
  element_b_id TEXT REFERENCES elements(id),
  winner_element_id TEXT REFERENCES elements(id),
  status TEXT NOT NULL CHECK (status IN ('pending','open','closed','bye')),
  closed_at TEXT
);

CREATE TABLE phase_results (
  id TEXT PRIMARY KEY,
  phase_id TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  closed_at TEXT NOT NULL,
  config_snapshot TEXT NOT NULL,
  results TEXT NOT NULL,
  UNIQUE (phase_id, version)
);

CREATE INDEX idx_phase_entrants_phase ON phase_entrants(phase_id, seed);
CREATE INDEX idx_phase_voters_phase ON phase_voters(phase_id);
CREATE INDEX idx_groups_phase ON groups(phase_id, position);
CREATE INDEX idx_matches_phase ON matches(phase_id, round, position);
CREATE INDEX idx_matches_group ON matches(group_id);
