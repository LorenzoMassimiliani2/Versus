import { readFileSync } from 'node:fs'

import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  new URL('../../../migrations/0001_initial_schema.sql', import.meta.url),
  'utf8',
)

function migratedDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec(migrationSql)
  return db
}

function tableNames(db: DatabaseSync): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all() as { name: string }[]
  return rows.map((row) => row.name)
}

describe('migrazione 0001', () => {
  it('crea users, sessions, login_attempts e audit_log su un database vuoto', () => {
    const db = migratedDatabase()

    expect(tableNames(db)).toEqual(
      expect.arrayContaining(['audit_log', 'login_attempts', 'sessions', 'users']),
    )
    db.close()
  })

  it('applica i default e i vincoli di users', () => {
    const db = migratedDatabase()

    db.prepare(
      "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u1', 'alice', 'hash', '2026-11-10T10:00:00Z')",
    ).run()
    const user = db.prepare("SELECT is_admin, is_active FROM users WHERE id = 'u1'").get()

    expect(user).toEqual({ is_admin: 0, is_active: 1 })
    expect(() =>
      db
        .prepare(
          "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u2', 'alice', 'hash', '2026-11-10T10:00:00Z')",
        )
        .run(),
    ).toThrow()
    expect(() =>
      db
        .prepare(
          "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u3', 'bob', NULL, '2026-11-10T10:00:00Z')",
        )
        .run(),
    ).toThrow()
    db.close()
  })

  it('collega le sessioni all utente e le elimina a cascata', () => {
    const db = migratedDatabase()

    db.prepare(
      "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u1', 'alice', 'hash', '2026-11-10T10:00:00Z')",
    ).run()
    expect(() =>
      db
        .prepare(
          "INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at) VALUES ('s0', 'ignoto', 't0', '2026-11-10T10:00:00Z', '2026-12-10T10:00:00Z')",
        )
        .run(),
    ).toThrow()

    db.prepare(
      "INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at) VALUES ('s1', 'u1', 't1', '2026-11-10T10:00:00Z', '2026-12-10T10:00:00Z')",
    ).run()
    expect(() =>
      db
        .prepare(
          "INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at) VALUES ('s2', 'u1', 't1', '2026-11-10T10:00:00Z', '2026-12-10T10:00:00Z')",
        )
        .run(),
    ).toThrow()

    db.prepare("DELETE FROM users WHERE id = 'u1'").run()

    expect(db.prepare('SELECT COUNT(*) AS count FROM sessions').get()).toEqual({ count: 0 })
    db.close()
  })

  it('vincola la chiave primaria composta dei tentativi di login', () => {
    const db = migratedDatabase()

    db.prepare(
      "INSERT INTO login_attempts (key, window_start, count) VALUES ('alice', '2026-11-10T10:00:00Z', 1)",
    ).run()
    expect(() =>
      db
        .prepare(
          "INSERT INTO login_attempts (key, window_start, count) VALUES ('alice', '2026-11-10T10:00:00Z', 2)",
        )
        .run(),
    ).toThrow()
    db.close()
  })

  it('accetta righe di audit senza torneo e richiede i campi obbligatori', () => {
    const db = migratedDatabase()

    db.prepare(
      "INSERT INTO audit_log (id, tournament_id, actor_id, action, target_type, created_at) VALUES ('a1', NULL, NULL, 'user.create', 'user', '2026-11-10T10:00:00Z')",
    ).run()
    expect(() =>
      db
        .prepare("INSERT INTO audit_log (id, action, created_at) VALUES ('a2', 'user.create', '2026-11-10T10:00:00Z')")
        .run(),
    ).toThrow()
    db.close()
  })

  it('crea gli indici minimi', () => {
    const db = migratedDatabase()

    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name")
      .all() as { name: string }[]
    expect(rows.map((row) => row.name)).toEqual(
      expect.arrayContaining(['idx_audit_tournament', 'idx_sessions_token', 'idx_sessions_user']),
    )
    db.close()
  })
})
