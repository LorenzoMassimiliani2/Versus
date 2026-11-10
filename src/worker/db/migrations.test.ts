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

describe('migrazione 0006', () => {
  function seedPhaseAndElement(db: DatabaseSync): void {
    seedTournament(db, 't1', 'torneo-di-prova')
    seedUser(db, 'u1', 'alice')
    db.prepare(
      `INSERT INTO phases (id, tournament_id, position, name, formula, vote_type, config, advance, created_at, updated_at)
       VALUES ('p1', 't1', 1, 'Gironi', 'group', 'duel', '{}', '{}', '2026-11-10T10:00:00Z', '2026-11-10T10:00:00Z')`,
    ).run()
    db.prepare(
      `INSERT INTO elements (id, tournament_id, name, image_url, custom_values, position, created_at, updated_at)
       VALUES ('e1', 't1', 'Alfa', 'https://images.example.test/a.jpg', '{}', 1, '2026-11-10T10:00:00Z', '2026-11-10T10:00:00Z')`,
    ).run()
    db.prepare(
      `INSERT INTO elements (id, tournament_id, name, image_url, custom_values, position, created_at, updated_at)
       VALUES ('e2', 't1', 'Beta', 'https://images.example.test/b.jpg', '{}', 2, '2026-11-10T10:00:00Z', '2026-11-10T10:00:00Z')`,
    ).run()
  }

  it('crea le tabelle dello stato operativo della fase e i risultati', () => {
    const db = migratedDatabase()

    expect(tableNames(db)).toEqual(
      expect.arrayContaining([
        'phase_entrants',
        'phase_voters',
        'groups',
        'group_members',
        'matches',
        'phase_results',
      ]),
    )
    db.close()
  })

  it('vincola elementi, votanti, gironi e sfide alla fase', () => {
    const db = migratedDatabase()
    seedPhaseAndElement(db)

    db.prepare(
      "INSERT INTO phase_entrants (phase_id, element_id, seed, position) VALUES ('p1', 'e1', 1, 1)",
    ).run()
    expect(() =>
      db
        .prepare(
          "INSERT INTO phase_entrants (phase_id, element_id, seed, position) VALUES ('p1', 'e1', 2, 2)",
        )
        .run(),
    ).toThrow()

    db.prepare(
      "INSERT INTO phase_voters (phase_id, user_id, credits_budget) VALUES ('p1', 'u1', 5)",
    ).run()
    expect(() =>
      db
        .prepare(
          "INSERT INTO phase_voters (phase_id, user_id, credits_budget) VALUES ('p1', 'u1', 9)",
        )
        .run(),
    ).toThrow()

    db.prepare(
      "INSERT INTO groups (id, phase_id, name, position) VALUES ('g1', 'p1', 'Girone A', 1)",
    ).run()
    expect(() =>
      db
        .prepare(
          "INSERT INTO groups (id, phase_id, name, position) VALUES ('g2', 'p1', 'Girone B', 1)",
        )
        .run(),
    ).toThrow()

    db.prepare(
      "INSERT INTO group_members (group_id, element_id, position) VALUES ('g1', 'e1', 1)",
    ).run()
    expect(() =>
      db
        .prepare(
          "INSERT INTO group_members (group_id, element_id, position) VALUES ('g1', 'e1', 2)",
        )
        .run(),
    ).toThrow()

    db.prepare(
      `INSERT INTO matches (id, phase_id, group_id, round, position, element_a_id, element_b_id, status)
       VALUES ('m1', 'p1', 'g1', 1, 1, 'e1', 'e2', 'open')`,
    ).run()
    expect(() =>
      db
        .prepare(
          `INSERT INTO matches (id, phase_id, group_id, round, position, element_a_id, element_b_id, status)
           VALUES ('m2', 'p1', 'g1', 1, 2, 'e1', 'e2', 'sconosciuto')`,
        )
        .run(),
    ).toThrow()

    db.prepare(
      `INSERT INTO phase_results (id, phase_id, version, closed_at, config_snapshot, results)
       VALUES ('r1', 'p1', 1, '2026-11-10T10:00:00Z', '{}', '{}')`,
    ).run()
    expect(() =>
      db
        .prepare(
          `INSERT INTO phase_results (id, phase_id, version, closed_at, config_snapshot, results)
           VALUES ('r2', 'p1', 1, '2026-11-10T10:00:00Z', '{}', '{}')`,
        )
        .run(),
    ).toThrow()

    db.close()
  })

  it('elimina a cascata lo stato operativo con la fase', () => {
    const db = migratedDatabase()
    seedPhaseAndElement(db)
    db.prepare(
      "INSERT INTO phase_entrants (phase_id, element_id, seed, position) VALUES ('p1', 'e1', 1, 1)",
    ).run()
    db.prepare(
      "INSERT INTO phase_voters (phase_id, user_id, credits_budget) VALUES ('p1', 'u1', 5)",
    ).run()
    db.prepare(
      "INSERT INTO groups (id, phase_id, name, position) VALUES ('g1', 'p1', 'Girone A', 1)",
    ).run()
    db.prepare(
      "INSERT INTO group_members (group_id, element_id, position) VALUES ('g1', 'e1', 1)",
    ).run()
    db.prepare(
      `INSERT INTO matches (id, phase_id, group_id, round, position, element_a_id, element_b_id, status)
       VALUES ('m1', 'p1', 'g1', 1, 1, 'e1', 'e2', 'open')`,
    ).run()
    db.prepare(
      `INSERT INTO phase_results (id, phase_id, version, closed_at, config_snapshot, results)
       VALUES ('r1', 'p1', 1, '2026-11-10T10:00:00Z', '{}', '{}')`,
    ).run()

    db.prepare("DELETE FROM phases WHERE id = 'p1'").run()

    for (const table of [
      'phase_entrants',
      'phase_voters',
      'group_members',
      'groups',
      'matches',
      'phase_results',
    ]) {
      expect(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()).toEqual({ count: 0 })
    }
    db.close()
  })

  it('crea gli indici minimi dello stato operativo', () => {
    const db = migratedDatabase()

    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name")
      .all() as { name: string }[]
    expect(rows.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        'idx_groups_phase',
        'idx_matches_phase',
        'idx_phase_entrants_phase',
        'idx_phase_voters_phase',
      ]),
    )
    db.close()
  })
})


describe('migrazione 0008', () => {
  function seedPhase(db: DatabaseSync): void {
    seedTournament(db, 't1', 'torneo-di-prova')
    seedUser(db, 'u1', 'alice')
    db.prepare(
      `INSERT INTO phases (id, tournament_id, position, name, formula, vote_type, config, advance, created_at, updated_at)
       VALUES ('p1', 't1', 1, 'Finale', 'ranking', 'ranking', '{}', '{}', '2026-11-10T10:00:00Z', '2026-11-10T10:00:00Z')`,
    ).run()
  }

  it('crea ballot_votes con chiave composta e vincolo sul kind', () => {
    const db = migratedDatabase()
    seedPhase(db)

    const insert = db.prepare(
      `INSERT INTO ballot_votes (phase_id, target_id, voter_id, kind, payload, created_at, updated_at)
       VALUES ('p1', 'p1', 'u1', ?, '{}', '2026-11-10T10:00:00Z', '2026-11-10T10:00:00Z')`,
    )
    insert.run('ranking')
    expect(() => insert.run('ranking')).toThrow()
    expect(() => insert.run('duel')).toThrow()
    db.close()
  })

  it('elimina le schede a cascata con la fase e crea l indice', () => {
    const db = migratedDatabase()
    seedPhase(db)
    db.prepare(
      `INSERT INTO ballot_votes (phase_id, target_id, voter_id, kind, payload, created_at, updated_at)
       VALUES ('p1', 'p1', 'u1', 'pick', '{}', '2026-11-10T10:00:00Z', '2026-11-10T10:00:00Z')`,
    ).run()

    const indexes = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as Array<{ name: string }>
    ).map((row) => row.name)
    expect(indexes).toContain('idx_ballot_votes_phase')

    db.prepare("DELETE FROM phases WHERE id = 'p1'").run()
    expect(db.prepare('SELECT COUNT(*) AS count FROM ballot_votes').get()).toEqual({ count: 0 })
    db.close()
  })
})
