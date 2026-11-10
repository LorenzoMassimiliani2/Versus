import { readdirSync, readFileSync } from 'node:fs'

import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'

const migrationsDir = new URL('../../../migrations/', import.meta.url)
const migrationSql = readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) => readFileSync(new URL(file, migrationsDir), 'utf8'))
  .join('\n')

function migratedDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(migrationSql)
  return db
}

function seedUser(db: DatabaseSync, id: string, username: string): void {
  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, 'hash', '2026-11-10T10:00:00Z')",
  ).run(id, username)
}

function seedTournament(db: DatabaseSync, id: string, slug: string): void {
  db.prepare(
    `INSERT INTO tournaments (id, slug, name, status, created_at, updated_at)
     VALUES (?, ?, ?, 'draft', '2026-11-10T10:00:00Z', '2026-11-10T10:00:00Z')`,
  ).run(id, slug, slug)
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

describe('migrazione 0002', () => {
  it('crea tournaments e tournament_organizers con i default', () => {
    const db = migratedDatabase()

    seedTournament(db, 't1', 'torneo-di-prova')
    const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get('t1') as Record<
      string,
      unknown
    >

    expect(tournament).toMatchObject({
      name: 'torneo-di-prova',
      description: '',
      cover_url: null,
      status: 'draft',
      settings: '{}',
      published_at: null,
      started_at: null,
      concluded_at: null,
      winner_element_id: null,
    })
    db.close()
  })

  it('rifiuta slug duplicati e stati fuori dall elenco', () => {
    const db = migratedDatabase()
    seedTournament(db, 't1', 'torneo-di-prova')

    expect(() => seedTournament(db, 't2', 'torneo-di-prova')).toThrow()
    expect(() =>
      db
        .prepare(
          `INSERT INTO tournaments (id, slug, name, status, created_at, updated_at)
           VALUES ('t2', 'altro', 'Altro', 'sconosciuto', '2026-11-10T10:00:00Z', '2026-11-10T10:00:00Z')`,
        )
        .run(),
    ).toThrow()
    db.close()
  })

  it('vincola gli organizzatori al torneo e all utente e ne impone un solo owner', () => {
    const db = migratedDatabase()
    seedUser(db, 'u1', 'alice')
    seedUser(db, 'u2', 'bruno')
    seedTournament(db, 't1', 'torneo-di-prova')

    db.prepare(
      `INSERT INTO tournament_organizers (tournament_id, user_id, role, added_by, added_at)
       VALUES ('t1', 'u1', 'owner', 'u1', '2026-11-10T10:00:00Z')`,
    ).run()

    expect(() =>
      db
        .prepare(
          `INSERT INTO tournament_organizers (tournament_id, user_id, role, added_by, added_at)
           VALUES ('t1', 'u2', 'owner', 'u2', '2026-11-10T10:00:00Z')`,
        )
        .run(),
    ).toThrow()

    db.prepare(
      `INSERT INTO tournament_organizers (tournament_id, user_id, role, added_by, added_at)
       VALUES ('t1', 'u2', 'co_organizer', 'u1', '2026-11-10T10:00:00Z')`,
    ).run()

    expect(() =>
      db
        .prepare(
          `INSERT INTO tournament_organizers (tournament_id, user_id, role, added_by, added_at)
           VALUES ('t1', 'u3', 'co_organizer', 'u1', '2026-11-10T10:00:00Z')`,
        )
        .run(),
    ).toThrow()

    expect(() =>
      db
        .prepare(
          `INSERT INTO tournament_organizers (tournament_id, user_id, role, added_by, added_at)
           VALUES ('t9', 'u1', 'owner', 'u1', '2026-11-10T10:00:00Z')`,
        )
        .run(),
    ).toThrow()
    db.close()
  })

  it('elimina gli organizzatori a cascata con il torneo', () => {
    const db = migratedDatabase()
    seedUser(db, 'u1', 'alice')
    seedTournament(db, 't1', 'torneo-di-prova')
    db.prepare(
      `INSERT INTO tournament_organizers (tournament_id, user_id, role, added_by, added_at)
       VALUES ('t1', 'u1', 'owner', 'u1', '2026-11-10T10:00:00Z')`,
    ).run()

    db.prepare("DELETE FROM tournaments WHERE id = 't1'").run()

    expect(db.prepare('SELECT COUNT(*) AS count FROM tournament_organizers').get()).toEqual({
      count: 0,
    })
    db.close()
  })

  it('crea l indice degli organizzatori per utente', () => {
    const db = migratedDatabase()

    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name")
      .all() as { name: string }[]
    expect(rows.map((row) => row.name)).toEqual(
      expect.arrayContaining(['idx_organizers_user', 'one_owner_per_tournament']),
    )
    db.close()
  })
})

describe('migrazione 0003', () => {
  it('crea custom_fields ed elements con i vincoli previsti', () => {
    const db = migratedDatabase()
    seedUser(db, 'u1', 'alice')
    seedTournament(db, 't1', 'torneo-di-prova')

    db.prepare(
      "INSERT INTO custom_fields (id, tournament_id, key, label, type, position) VALUES ('f1', 't1', 'genere', 'Genere', 'text', 1)",
    ).run()
    expect(() =>
      db
        .prepare(
          "INSERT INTO custom_fields (id, tournament_id, key, label, type, position) VALUES ('f2', 't1', 'genere', 'Genere bis', 'text', 2)",
        )
        .run(),
    ).toThrow()
    expect(() =>
      db
        .prepare(
          "INSERT INTO custom_fields (id, tournament_id, key, label, type, position) VALUES ('f3', 't1', 'anno', 'Anno', 'boolean', 2)",
        )
        .run(),
    ).toThrow()

    db.prepare(
      `INSERT INTO elements (id, tournament_id, user_id, name, image_url, custom_values, position, created_at, updated_at)
       VALUES ('e1', 't1', 'u1', 'Canzone', 'https://images.example.test/e1.jpg', '{}', 1, '2026-11-10T10:00:00Z', '2026-11-10T10:00:00Z')`,
    ).run()
    expect(() =>
      db
        .prepare(
          `INSERT INTO elements (id, tournament_id, name, image_url, custom_values, position, created_at, updated_at)
           VALUES ('e2', 't1', 'Senza immagine', NULL, '{}', 2, '2026-11-10T10:00:00Z', '2026-11-10T10:00:00Z')`,
        )
        .run(),
    ).toThrow()
    expect(() =>
      db
        .prepare(
          `INSERT INTO elements (id, tournament_id, user_id, name, image_url, custom_values, position, created_at, updated_at)
           VALUES ('e3', 't1', 'ignoto', 'Utente inesistente', 'https://images.example.test/e3.jpg', '{}', 2, '2026-11-10T10:00:00Z', '2026-11-10T10:00:00Z')`,
        )
        .run(),
    ).toThrow()

    db.prepare("DELETE FROM tournaments WHERE id = 't1'").run()
    expect(db.prepare('SELECT COUNT(*) AS count FROM custom_fields').get()).toEqual({ count: 0 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM elements').get()).toEqual({ count: 0 })
    db.close()
  })

  it('crea gli indici di campi ed elementi', () => {
    const db = migratedDatabase()

    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name")
      .all() as { name: string }[]
    expect(rows.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        'idx_custom_fields_tournament',
        'idx_elements_tournament',
        'idx_elements_user',
      ]),
    )
    db.close()
  })
})


describe('migrazione 0005', () => {
  function seedPhase(
    db: DatabaseSync,
    overrides: Partial<Record<'id' | 'position' | 'formula' | 'voteType' | 'status', string | number>> = {},
  ): void {
    db.prepare(
      `INSERT INTO phases (id, tournament_id, position, name, formula, vote_type, config, advance,
         status, created_at, updated_at)
       VALUES (?, 't1', ?, 'Fase', ?, ?, '{}', '{}', ?, '2026-11-10T10:00:00Z', '2026-11-10T10:00:00Z')`,
    ).run(
      (overrides.id as string) ?? 'p1',
      (overrides.position as number) ?? 1,
      (overrides.formula as string) ?? 'group',
      (overrides.voteType as string) ?? 'ranking',
      (overrides.status as string) ?? 'pending',
    )
  }

  it('crea phases con posizione unica per torneo e stato predefinito', () => {
    const db = migratedDatabase()
    seedTournament(db, 't1', 'torneo-di-prova')

    seedPhase(db)
    const row = db.prepare('SELECT * FROM phases WHERE id = ?').get('p1') as Record<string, unknown>
    expect(row).toMatchObject({
      tournament_id: 't1',
      position: 1,
      name: 'Fase',
      formula: 'group',
      vote_type: 'ranking',
      config: '{}',
      advance: '{}',
      status: 'pending',
      opened_at: null,
      closed_at: null,
    })

    expect(() => seedPhase(db, { id: 'p2', position: 1 })).toThrow()
    db.close()
  })

  it('rifiuta formule, schede e stati fuori dall elenco', () => {
    const db = migratedDatabase()
    seedTournament(db, 't1', 'torneo-di-prova')

    expect(() => seedPhase(db, { formula: 'sconosciuta' })).toThrow()
    expect(() => seedPhase(db, { voteType: 'sconosciuta' })).toThrow()
    expect(() => seedPhase(db, { status: 'sconosciuto' })).toThrow()
    db.close()
  })

  it('collega le fasi al torneo e le elimina a cascata', () => {
    const db = migratedDatabase()
    seedTournament(db, 't1', 'torneo-di-prova')
    seedPhase(db)

    expect(() =>
      db
        .prepare(
          `INSERT INTO phases (id, tournament_id, position, name, formula, vote_type, config, advance, created_at, updated_at)
           VALUES ('p9', 'ignoto', 1, 'Fase', 'group', 'ranking', '{}', '{}', '2026-11-10T10:00:00Z', '2026-11-10T10:00:00Z')`,
        )
        .run(),
    ).toThrow()

    db.prepare("DELETE FROM tournaments WHERE id = 't1'").run()
    expect(db.prepare('SELECT COUNT(*) AS count FROM phases').get()).toEqual({ count: 0 })
    db.close()
  })

  it('crea l indice delle fasi per torneo e posizione', () => {
    const db = migratedDatabase()

    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name")
      .all() as { name: string }[]
    expect(rows.map((row) => row.name)).toContain('idx_phases_tournament')
    db.close()
  })
})
