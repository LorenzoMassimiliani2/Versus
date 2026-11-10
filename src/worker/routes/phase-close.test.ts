import type { DatabaseSync } from 'node:sqlite'

import { describe, expect, it } from 'vitest'

import worker from '../index'
import { createTestEnvironment } from '../../test/d1'
import { hashPassword } from '../auth/password'

const ORIGIN = 'https://versus.test'
const NOW = '2026-11-10T10:00:00.000Z'

/**
 * Schema dei voti previsto dai ticket TICKET-0018/0019. La chiusura funziona
 * anche senza queste tabelle; qui servono per verificare il calcolo dei risultati.
 */
function createEnv() {
  const created = createTestEnvironment()
  created.db.exec(`
    CREATE TABLE duel_votes (
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      voter_id TEXT NOT NULL REFERENCES users(id),
      side TEXT NOT NULL CHECK (side IN ('a','b','abstain')),
      credits INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (match_id, voter_id)
    );
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
  `)
  return created
}


async function seedUser(db: DatabaseSync, id: string, username: string): Promise<void> {
  db.prepare(
    'INSERT INTO users (id, username, password_hash, is_admin, is_active, created_at) VALUES (?, ?, ?, 0, 1, ?)',
  ).run(id, username, await hashPassword('password123'), NOW)
}

async function login(env: Env, username: string): Promise<string> {
  const response = await worker.fetch(
    new Request(`${ORIGIN}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'CF-Connecting-IP': '203.0.113.10',
      },
      body: JSON.stringify({ username, password: 'password123' }),
    }),
    env,
    {} as ExecutionContext,
  )
  expect(response.status).toBe(200)
  const match = (response.headers.get('Set-Cookie') ?? '').match(/versus_session=([^;]+)/)
  if (!match) throw new Error('Set-Cookie versus_session assente')
  return match[1]!
}

function call(env: Env, path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('Origin', ORIGIN)
  headers.set('Cookie', `versus_session=${token}`)
  if (init.body !== undefined) headers.set('Content-Type', 'application/json')
  return worker.fetch(new Request(`${ORIGIN}${path}`, { ...init, headers }), env, {} as ExecutionContext)
}

async function createTournament(env: Env, token: string): Promise<string> {
  const response = await call(env, '/api/tournaments', token, {
    method: 'POST',
    body: JSON.stringify({ name: 'Torneo di Prova' }),
  })
  expect(response.status).toBe(201)
  return ((await response.json()) as { tournament: { id: string } }).tournament.id
}

async function createPhase(
  env: Env,
  token: string,
  tournamentId: string,
  body: Record<string, unknown>,
): Promise<{ id: string; position: number; status: string }> {
  const response = await call(env, `/api/tournaments/${tournamentId}/phases`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  expect(response.status).toBe(201)
  return ((await response.json()) as { phase: { id: string; position: number; status: string } })
    .phase
}

function seedElements(
  db: DatabaseSync,
  tournamentId: string,
  count: number,
  prefix = 'e',
): string[] {
  const ids: string[] = []
  for (let index = 0; index < count; index += 1) {
    const id = `${prefix}${index + 1}`
    db.prepare(
      `INSERT INTO elements (id, tournament_id, name, image_url, custom_values, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, '{}', ?, ?, ?)`,
    ).run(
      id,
      tournamentId,
      `Elemento ${index + 1}`,
      `https://images.example.test/${id}.jpg`,
      index + 1,
      NOW,
      NOW,
    )
    ids.push(id)
  }
  return ids
}

function seedParticipants(db: DatabaseSync, tournamentId: string, userIds: string[]): void {
  for (const userId of userIds) {
    db.prepare(
      `INSERT INTO tournament_participants (tournament_id, user_id, status, added_by, added_at)
       VALUES (?, ?, 'active', ?, ?)`,
    ).run(tournamentId, userId, userId, NOW)
  }
}

function publish(db: DatabaseSync, tournamentId: string): void {
  db.prepare("UPDATE tournaments SET status = 'published' WHERE id = ?").run(tournamentId)
}

async function baseTournament(
  env: Env,
  db: DatabaseSync,
  elementCount: number,
  participantIds: string[],
): Promise<{ alice: string; tournamentId: string; elementIds: string[] }> {
  await seedUser(db, 'u1', 'alice')
  for (const id of participantIds) {
    if (id !== 'u1') await seedUser(db, id, id)
  }
  const alice = await login(env, 'alice')
  const tournamentId = await createTournament(env, alice)
  const elementIds = seedElements(db, tournamentId, elementCount)
  seedParticipants(db, tournamentId, participantIds)
  return { alice, tournamentId, elementIds }
}

async function openPhase(env: Env, token: string, phaseId: string): Promise<void> {
  const response = await call(env, `/api/phases/${phaseId}/open`, token, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  expect(response.status).toBe(200)
}

function count(db: DatabaseSync, sql: string, ...params: string[]): number {
  return (db.prepare(sql).get(...params) as { count: number }).count
}

function seedBallot(
  db: DatabaseSync,
  phaseId: string,
  targetId: string,
  voterId: string,
  assignments: Array<[string, number]>,
): void {
  db.prepare(
    `INSERT INTO ballot_votes (phase_id, target_id, voter_id, kind, payload, created_at, updated_at)
     VALUES (?, ?, ?, 'ranking', ?, ?, ?)`,
  ).run(
    phaseId,
    targetId,
    voterId,
    JSON.stringify({ assignments: assignments.map(([elementId, points]) => ({ elementId, points })) }),
    NOW,
    NOW,
  )
}

function groupId(db: DatabaseSync, phaseId: string): string {
  return (db.prepare('SELECT id FROM groups WHERE phase_id = ? ORDER BY position LIMIT 1').get(phaseId) as {
    id: string
  }).id
}

function resultRow(db: DatabaseSync, phaseId: string): {
  id: string
  version: number
  closed_at: string
  config_snapshot: string
  results: string
} | undefined {
  return db
    .prepare('SELECT id, version, closed_at, config_snapshot, results FROM phase_results WHERE phase_id = ?')
    .get(phaseId) as
    | { id: string; version: number; closed_at: string; config_snapshot: string; results: string }
    | undefined
}

describe('POST /api/phases/:id/close', () => {
  it('chiude una fase aperta e salva lo snapshot dei risultati', async () => {
    const { db, env } = createEnv()
    const { alice, tournamentId, elementIds } = await baseTournament(env, db, 2, ['u1'])
    const phase = await createPhase(env, alice, tournamentId, {
      name: 'Finale classifica',
      formula: 'ranking',
      voteType: 'ranking',
      config: {
        ranking: { points: [3, 2, 1], minSelections: 1 },
        credits: { perVoter: 0, maxPerMatch: null },
      },
      advance: { type: 'winner' },
    })
    publish(db, tournamentId)
    await openPhase(env, alice, phase.id)
    seedBallot(db, phase.id, phase.id, 'u1', [
      [elementIds[1]!, 3],
      [elementIds[0]!, 2],
    ])

    const response = await call(env, `/api/phases/${phase.id}/close`, alice, { method: 'POST' })

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      phase: { status: string; closedAt: string | null }
      result: {
        version: number
        closedAt: string
        configSnapshot: { formula: string; config: { ranking: { points: number[] } } }
        results: { phaseId: string; ranking: Array<{ elementId: string; score: number }>; qualified: string[]; winnerElementId: string | null }
      }
    }
    expect(body.phase.status).toBe('closed')
    expect(body.phase.closedAt).not.toBeNull()
    expect(body.result.version).toBe(1)
    expect(body.result.configSnapshot.formula).toBe('ranking')
    expect(body.result.configSnapshot.config.ranking.points).toEqual([3, 2, 1])
    expect(body.result.results.phaseId).toBe(phase.id)
    expect(body.result.results.ranking[0]).toMatchObject({ elementId: elementIds[1], score: 3 })
    expect(body.result.results.qualified).toEqual([elementIds[1]])
    expect(body.result.results.winnerElementId).toBe(elementIds[1])

    const row = resultRow(db, phase.id)
    expect(row?.version).toBe(1)
    expect(JSON.parse(row!.results).qualified).toEqual([elementIds[1]])

    const tournament = db
      .prepare('SELECT status, winner_element_id, concluded_at FROM tournaments WHERE id = ?')
      .get(tournamentId) as { status: string; winner_element_id: string | null; concluded_at: string | null }
    expect(tournament.status).toBe('concluded')
    expect(tournament.winner_element_id).toBe(elementIds[1])
    expect(tournament.concluded_at).not.toBeNull()
  })

  it('calcola i risultati di un girone con duelli e crediti', async () => {
    const { db, env } = createEnv()
    const { alice, tournamentId, elementIds } = await baseTournament(env, db, 2, ['u1', 'u2'])
    const phase = await createPhase(env, alice, tournamentId, {
      name: 'Girone',
      formula: 'group',
      voteType: 'duel',
      config: {
        groups: { size: 2, assignment: 'snake', remainder: 'smaller_groups', points: [3, 2, 1] },
        credits: { perVoter: 5, maxPerMatch: 2 },
      },
      advance: { type: 'top_per_group', n: 1 },
    })
    publish(db, tournamentId)
    await openPhase(env, alice, phase.id)
    const matchId = (
      db.prepare('SELECT id FROM matches WHERE phase_id = ? ORDER BY position LIMIT 1').get(phase.id) as {
        id: string
      }
    ).id
    db.prepare(
      `INSERT INTO duel_votes (match_id, voter_id, side, credits, created_at, updated_at)
       VALUES (?, 'u1', 'a', 2, ?, ?), (?, 'u2', 'b', 0, ?, ?)`,
    ).run(matchId, NOW, NOW, matchId, NOW, NOW)

    const response = await call(env, `/api/phases/${phase.id}/close`, alice, { method: 'POST' })

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      phase: { status: string }
      result: {
        results: {
          groups: Array<{ ranking: Array<{ elementId: string; score: number }> }>
          matches: Array<{
            sideA: { weight: number; credits: number; voters: number }
            sideB: { weight: number; credits: number; voters: number }
            winnerElementId: string
            resolvedBy: string
          }>
          qualified: string[]
        }
      }
    }
    expect(body.phase.status).toBe('closed')
    const result = body.result.results
    expect(result.matches[0]).toMatchObject({
      winnerElementId: elementIds[0],
      resolvedBy: 'weight',
      sideA: { weight: 3, credits: 2, voters: 1 },
      sideB: { weight: 1, credits: 0, voters: 1 },
    })
    expect(result.groups[0]!.ranking[0]).toMatchObject({ elementId: elementIds[0], score: 3 })
    expect(result.qualified).toEqual([elementIds[0]])
  })

  it('chiude con all_voted alla richiesta di stato successiva', async () => {
    const { db, env } = createEnv()
    const { alice, tournamentId, elementIds } = await baseTournament(env, db, 2, ['u1', 'u2'])
    const phase = await createPhase(env, alice, tournamentId, {
      name: 'Classifica',
      formula: 'ranking',
      voteType: 'ranking',
      config: {
        closeTriggers: ['all_voted'],
        ranking: { points: [3, 2, 1], minSelections: 1 },
      },
      advance: { type: 'all' },
    })
    publish(db, tournamentId)
    await openPhase(env, alice, phase.id)
    seedBallot(db, phase.id, phase.id, 'u1', [[elementIds[0]!, 3]])

    const before = await call(env, `/api/tournaments/${tournamentId}/phases`, alice)
    expect(before.status).toBe(200)
    const beforeBody = (await before.json()) as { phases: Array<{ status: string }> }
    expect(beforeBody.phases[0]!.status).toBe('open')
    expect(resultRow(db, phase.id)).toBeUndefined()

    seedBallot(db, phase.id, phase.id, 'u2', [[elementIds[1]!, 3]])
    const after = await call(env, `/api/tournaments/${tournamentId}/phases`, alice)

    const afterBody = (await after.json()) as { phases: Array<{ status: string }> }
    expect(afterBody.phases[0]!.status).toBe('closed')
    expect(count(db, 'SELECT COUNT(*) AS count FROM phase_results WHERE phase_id = ?', phase.id)).toBe(1)
  })

  it('con all_voted aspetta anche le astensioni dei duelli', async () => {
    const { db, env } = createEnv()
    const { alice, tournamentId } = await baseTournament(env, db, 2, ['u1', 'u2'])
    const phase = await createPhase(env, alice, tournamentId, {
      name: 'Girone',
      formula: 'group',
      voteType: 'duel',
      config: {
        closeTriggers: ['all_voted'],
        groups: { size: 2, assignment: 'snake', remainder: 'smaller_groups' },
        credits: { perVoter: 5, maxPerMatch: 2 },
      },
      advance: { type: 'all' },
    })
    publish(db, tournamentId)
    await openPhase(env, alice, phase.id)
    const matchId = (
      db.prepare('SELECT id FROM matches WHERE phase_id = ? ORDER BY position LIMIT 1').get(phase.id) as {
        id: string
      }
    ).id

    const before = await call(env, `/api/tournaments/${tournamentId}/phases`, alice)
    const beforeBody = (await before.json()) as { phases: Array<{ status: string }> }
    expect(beforeBody.phases[0]!.status).toBe('open')

    db.prepare(
      `INSERT INTO duel_votes (match_id, voter_id, side, credits, created_at, updated_at)
       VALUES (?, 'u1', 'a', 0, ?, ?), (?, 'u2', 'abstain', 0, ?, ?)`,
    ).run(matchId, NOW, NOW, matchId, NOW, NOW)
    const after = await call(env, `/api/tournaments/${tournamentId}/phases`, alice)

    const afterBody = (await after.json()) as { phases: Array<{ status: string }> }
    expect(afterBody.phases[0]!.status).toBe('closed')
    expect(resultRow(db, phase.id)).toBeDefined()
  })

  it('chiude alla prima richiesta dopo la deadline', async () => {
    const { db, env } = createEnv()
    const { alice, tournamentId } = await baseTournament(env, db, 2, ['u1'])
    const phase = await createPhase(env, alice, tournamentId, {
      name: 'Classifica',
      formula: 'ranking',
      voteType: 'ranking',
      config: {
        closeTriggers: ['deadline'],
        deadline: '2026-11-09T00:00:00.000Z',
        ranking: { points: [3, 2, 1], minSelections: 1 },
      },
      advance: { type: 'all' },
    })
    publish(db, tournamentId)
    await openPhase(env, alice, phase.id)

    const response = await call(env, `/api/tournaments/${tournamentId}/phases`, alice)

    expect(response.status).toBe(200)
    const body = (await response.json()) as { phases: Array<{ status: string }> }
    expect(body.phases[0]!.status).toBe('closed')
    expect(resultRow(db, phase.id)).toBeDefined()
  })

  it('non chiude alla deadline se il trigger non è configurato', async () => {
    const { db, env } = createEnv()
    const { alice, tournamentId } = await baseTournament(env, db, 2, ['u1'])
    const phase = await createPhase(env, alice, tournamentId, {
      name: 'Classifica',
      formula: 'ranking',
      voteType: 'ranking',
      config: {
        closeTriggers: ['all_voted'],
        deadline: '2026-11-09T00:00:00.000Z',
        ranking: { points: [3, 2, 1], minSelections: 1 },
      },
      advance: { type: 'all' },
    })
    publish(db, tournamentId)
    await openPhase(env, alice, phase.id)

    const response = await call(env, `/api/tournaments/${tournamentId}/phases`, alice)

    const body = (await response.json()) as { phases: Array<{ status: string }> }
    expect(body.phases[0]!.status).toBe('open')
  })

  it('due richieste concorrenti producono un solo snapshot', async () => {
    const { db, env } = createEnv()
    const { alice, tournamentId, elementIds } = await baseTournament(env, db, 2, ['u1'])
    const phase = await createPhase(env, alice, tournamentId, {
      name: 'Classifica',
      formula: 'ranking',
      voteType: 'ranking',
      config: { ranking: { points: [3, 2, 1], minSelections: 1 } },
      advance: { type: 'all' },
    })
    publish(db, tournamentId)
    await openPhase(env, alice, phase.id)
    seedBallot(db, phase.id, phase.id, 'u1', [[elementIds[0]!, 3]])

    const responses = await Promise.all([
      call(env, `/api/phases/${phase.id}/close`, alice, { method: 'POST' }),
      call(env, `/api/phases/${phase.id}/close`, alice, { method: 'POST' }),
    ])

    expect(responses.map((response) => response.status)).toEqual([200, 200])
    expect(count(db, 'SELECT COUNT(*) AS count FROM phase_results WHERE phase_id = ?', phase.id)).toBe(1)
  })

  it('un pareggio irrisolto porta la fase in awaiting_resolution senza snapshot', async () => {
    const { db, env } = createEnv()
    const { alice, tournamentId, elementIds } = await baseTournament(env, db, 2, ['u1'])
    const phase = await createPhase(env, alice, tournamentId, {
      name: 'Classifica',
      formula: 'ranking',
      voteType: 'ranking',
      config: { ranking: { points: [3, 2, 1], minSelections: 1 } },
      advance: { type: 'top_global', n: 1 },
    })
    publish(db, tournamentId)
    await openPhase(env, alice, phase.id)
    seedBallot(db, phase.id, phase.id, 'u1', [
      [elementIds[0]!, 3],
      [elementIds[1]!, 3],
    ])

    const response = await call(env, `/api/phases/${phase.id}/close`, alice, { method: 'POST' })

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      phase: { status: string }
      result: unknown
      unresolved: string[][]
    }
    expect(body.phase.status).toBe('awaiting_resolution')
    expect(body.result).toBeNull()
    expect(body.unresolved).toEqual([[elementIds[0], elementIds[1]]])
    expect(resultRow(db, phase.id)).toBeUndefined()
  })

  it('chiude i gironi con le schede di classifica e calcola i ripescati', async () => {
    const { db, env } = createEnv()
    const { alice, tournamentId, elementIds } = await baseTournament(env, db, 3, ['u1'])
    const phase = await createPhase(env, alice, tournamentId, {
      name: 'Gironi',
      formula: 'group',
      voteType: 'ranking',
      config: {
        groups: { size: 3, assignment: 'snake', remainder: 'smaller_groups' },
        ranking: { points: [3, 2, 1], minSelections: 1 },
      },
      advance: {
        type: 'top_per_group',
        n: 1,
        repechage: { targetSize: 3, criteria: ['group_points'] },
      },
    })
    publish(db, tournamentId)
    await openPhase(env, alice, phase.id)
    const target = groupId(db, phase.id)
    seedBallot(db, phase.id, target, 'u1', [
      [elementIds[0]!, 3],
      [elementIds[1]!, 2],
      [elementIds[2]!, 1],
    ])

    const response = await call(env, `/api/phases/${phase.id}/close`, alice, { method: 'POST' })

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      phase: { status: string }
      result: {
        results: {
          groups: Array<{ groupId: string; ranking: Array<{ elementId: string; score: number }> }>
          qualified: string[]
          repechage: { enabled: boolean; selected: string[]; criteria: string[] } | null
        }
      }
    }
    expect(body.phase.status).toBe('closed')
    expect(body.result.results.groups[0]!.groupId).toBe(target)
    expect(body.result.results.groups[0]!.ranking.map((row) => row.elementId)).toEqual(elementIds)
    expect(body.result.results.qualified).toEqual([elementIds[0]])
    expect(body.result.results.repechage).toEqual({
      enabled: true,
      selected: [elementIds[1], elementIds[2]],
      criteria: ['group_points'],
    })
  })

  it('richiede il ruolo di organizzatore e una fase aperta', async () => {
    const { db, env } = createEnv()
    const { alice, tournamentId } = await baseTournament(env, db, 2, ['u1', 'u2'])
    await seedUser(db, 'u9', 'estraneo')
    const stranger = await login(env, 'estraneo')
    const phase = await createPhase(env, alice, tournamentId, {
      name: 'Classifica',
      formula: 'ranking',
      voteType: 'ranking',
      config: {},
      advance: { type: 'all' },
    })
    publish(db, tournamentId)

    const pending = await call(env, `/api/phases/${phase.id}/close`, alice, { method: 'POST' })
    expect(pending.status).toBe(409)
    expect(await pending.json()).toEqual({ error: 'phase_not_open' })

    await openPhase(env, alice, phase.id)
    const forbidden = await call(env, `/api/phases/${phase.id}/close`, stranger, { method: 'POST' })
    expect(forbidden.status).toBe(403)
    expect(await forbidden.json()).toEqual({ error: 'forbidden' })

    const missing = await call(env, '/api/phases/inesistente/close', alice, { method: 'POST' })
    expect(missing.status).toBe(404)
  })

  it('ripete la chiusura in modo idempotente restituendo lo stesso snapshot', async () => {
    const { db, env } = createEnv()
    const { alice, tournamentId, elementIds } = await baseTournament(env, db, 2, ['u1'])
    const phase = await createPhase(env, alice, tournamentId, {
      name: 'Classifica',
      formula: 'ranking',
      voteType: 'ranking',
      config: { ranking: { points: [3, 2, 1], minSelections: 1 } },
      advance: { type: 'all' },
    })
    publish(db, tournamentId)
    await openPhase(env, alice, phase.id)
    seedBallot(db, phase.id, phase.id, 'u1', [[elementIds[0]!, 3]])

    const first = await call(env, `/api/phases/${phase.id}/close`, alice, { method: 'POST' })
    const second = await call(env, `/api/phases/${phase.id}/close`, alice, { method: 'POST' })

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    const firstBody = (await first.json()) as { result: { version: number } }
    const secondBody = (await second.json()) as { result: { version: number } }
    expect(secondBody.result.version).toBe(firstBody.result.version)
    expect(count(db, 'SELECT COUNT(*) AS count FROM phase_results WHERE phase_id = ?', phase.id)).toBe(1)
  })
})
