-- Schema iniziale di Versus: utenti, sessioni, tentativi di login, audit.
-- I timestamp sono stringhe ISO 8601 in UTC; gli id sono UUID v7 testuali.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  created_by TEXT REFERENCES users(id)
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_seen_at TEXT
);

CREATE TABLE login_attempts (
  key TEXT NOT NULL,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (key, window_start)
);

-- tournament_id non ha un vincolo REFERENCES verso tournaments: la tabella
-- arriva nella migrazione successiva (TICKET-0004) e SQLite non permette di
-- aggiungere una foreign key dopo. L'integrità referenziale resta applicativa.
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  tournament_id TEXT,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  before TEXT,
  after TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_sessions_token ON sessions(token_hash);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_audit_tournament ON audit_log(tournament_id, created_at);
