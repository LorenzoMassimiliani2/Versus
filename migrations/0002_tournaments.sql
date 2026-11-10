-- Tornei e relativi organizzatori.
-- audit_log.tournament_id resta senza foreign key, come deciso nella 0001:
-- la tabella audit_log è stata creata prima dei tornei e SQLite non permette
-- di aggiungere un vincolo dopo. L'integrità referenziale resta applicativa.
-- winner_element_id resta senza foreign key per lo stesso motivo: la tabella
-- elements arriva in una migrazione successiva (TICKET-0005).

CREATE TABLE tournaments (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cover_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft','published','running','concluded','archived')),
  settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  started_at TEXT,
  concluded_at TEXT,
  winner_element_id TEXT
);

CREATE TABLE tournament_organizers (
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('owner','co_organizer')),
  added_by TEXT NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (tournament_id, user_id)
);

CREATE UNIQUE INDEX one_owner_per_tournament
  ON tournament_organizers(tournament_id) WHERE role = 'owner';
CREATE INDEX idx_organizers_user ON tournament_organizers(user_id);
