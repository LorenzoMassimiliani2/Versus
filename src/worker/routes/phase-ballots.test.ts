import type { DatabaseSync } from 'node:sqlite'

import { describe, expect, it } from 'vitest'

import worker from '../index'
import { createTestEnvironment } from '../../test/d1'
import { hashPassword } from '../auth/password'

const ORIGIN = 'https://versus.test'
const NOW = '2026-11-10T10:00:00.000Z'

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
  return worker.fetch(
    new Request(`${ORIGIN}${path}`, { ...init, headers }),
    env,
    {} as ExecutionContext,
  )
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
): Promise<string> {
  const response = await call(env, `/api/tournaments/${tournamentId}/phases`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  expect(response.status).toBe(201)
  return ((await response.json()) as { phase: { id: string } }).phase.id
}

function seedElements(db: DatabaseSync, tournamentId: string, count: number): string[] {
  const ids: string[] = []
  for (let index = 0; index < count; index += 1) {
    const id = `e${index + 1}`
    db.prepare(
      `INSERT INTO elements (id, tournament_id, name, image_url, custom_values, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, '{}', ?, ?, ?)`,
    ).run(id, tournamentId, `Elemento ${index + 1}`, `https://images.example.test/${id}.jpg`, index + 1, NOW, NOW)
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

function count(db: DatabaseSync, sql: string, ...params: string[]): number {
  return (db.prepare(sql).get(...params) as { count: number }).count
}

interface BaseFixture {
  alice: string
  bob: string
  tournamentId: string
  elementIds: string[]
}

async function base(
  env: Env,
  db: DatabaseSync,
  options: { elementCount?: number; participants?: string[] } = {},
): Promise<BaseFixture> {
  await seedUser(db, 'u1', 'alice')
  await seedUser(db, 'u2', 'bob')
  const alice = await login(env, 'alice')
  const bob = await login(env, 'bob')
  const tournamentId = await createTournament(env, alice)
  const elementIds = seedElements(db, tournamentId, options.elementCount ?? 3)
  seedParticipants(db, tournamentId, options.participants ?? ['u1'])
  return { alice, bob, tournamentId, elementIds }
}

async function openPhase(env: Env, token: string, phaseId: string): Promise<void> {
  const response = await call(env, `/api/phases/${phaseId}/open`, token, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  expect(response.status).toBe(200)
}

interface RankingFixture extends BaseFixture {
  phaseId: string
}

async function rankingFixture(
  env: Env,
  db: DatabaseSync,
  options: { elementCount?: number; participants?: string[] } = {},
): Promise<RankingFixture> {
  const fixture = await base(env, db, options)
  const phaseId = await createPhase(env, fixture.alice, fixture.tournamentId, {
    name: 'Finale classifica',
    formula: 'ranking',
    voteType: 'ranking',
    config: {
      ranking: { points: [5, 3, 1], minSelections: 1 },
      credits: { perVoter: 0, maxPerMatch: null },
    },
    advance: { type: 'all' },
  })
  publish(db, fixture.tournamentId)
  await openPhase(env, fixture.alice, phaseId)
  return { ...fixture, phaseId }
}

async function groupFixture(env: Env, db: DatabaseSync): Promise<BaseFixture & { phaseId: string; groupIds: string[] }> {
  const fixture = await base(env, db, { elementCount: 4 })
  const phaseId = await createPhase(env, fixture.alice, fixture.tournamentId, {
    name: 'Gironi',
    formula: 'group',
    voteType: 'ranking',
    config: {
      groups: { size: 2, assignment: 'manual', remainder: 'smaller_groups' },
      ranking: { points: [3, 2, 1], minSelections: 1 },
      credits: { perVoter: 0, maxPerMatch: null },
    },
    advance: { type: 'all' },
  })
  publish(db, fixture.tournamentId)
  await openPhase(env, fixture.alice, phaseId)
  const groupIds = (
    db.prepare('SELECT id FROM groups WHERE phase_id = ? ORDER BY position').all(phaseId) as Array<{
      id: string
    }>
  ).map((row) => row.id)
  return { ...fixture, phaseId, groupIds }
}

function ballot(
  env: Env,
  token: string,
  phaseId: string,
  targetId: string,
  kind: 'ranking' | 'pick',
  payload: unknown,
): Promise<Response> {
  return call(env, `/api/phases/${phaseId}/ballots`, token, {
    method: 'POST',
    body: JSON.stringify({ targetId, kind, payload }),
  })
}

interface BallotResponse {
  targets: Array<{
    id: string
    name: string
    elements: Array<{ elementId: string }>
    vote: { kind: string; assignments?: Array<{ elementId: string; points: number }>; elementId?: string } | null
    points: { scale: number[]; used: number[]; remaining: number[] }
  }>
  completion: { voted: number; total: number }
  matches: Array<{ id: string }>
}

describe('POST /api/phases/:id/ballots (ranking)', () => {
  it('salva una scheda parziale e restituisce punti residui e completamento', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await rankingFixture(env, db)

    const response = await ballot(env, fixture.alice, fixture.phaseId, fixture.phaseId, 'ranking', {
      assignments: [{ elementId: 'e2', points: 5 }],
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as BallotResponse
    expect(body.targets).toHaveLength(1)
    expect(body.targets[0]).toMatchObject({
      id: fixture.phaseId,
      vote: { kind: 'ranking', assignments: [{ elementId: 'e2', points: 5 }] },
      points: { scale: [5, 3, 1], used: [5], remaining: [3, 1] },
    })
    expect(body.targets[0]!.elements.map((element) => element.elementId)).toEqual(['e1', 'e2', 'e3'])
    expect(body.completion).toEqual({ voted: 1, total: 1 })
    expect(body.matches).toEqual([])

    const row = db
      .prepare('SELECT kind, payload FROM ballot_votes WHERE phase_id = ? AND target_id = ? AND voter_id = ?')
      .get(fixture.phaseId, fixture.phaseId, 'u1') as { kind: string; payload: string }
    expect(row.kind).toBe('ranking')
    expect(JSON.parse(row.payload)).toEqual({ assignments: [{ elementId: 'e2', points: 5 }] })

    const event = db
      .prepare('SELECT target_id, kind, payload FROM vote_events WHERE phase_id = ?')
      .get(fixture.phaseId) as { target_id: string; kind: string; payload: string }
    expect(event).toMatchObject({ target_id: fixture.phaseId, kind: 'ranking' })
  })

  it('rifiuta lo stesso valore della scala due volte e i punti fuori scala', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await rankingFixture(env, db)

    for (const assignments of [
      [
        { elementId: 'e1', points: 5 },
        { elementId: 'e2', points: 5 },
      ],
      [{ elementId: 'e1', points: 4 }],
      [{ elementId: 'fuori', points: 5 }],
    ]) {
      const response = await ballot(env, fixture.alice, fixture.phaseId, fixture.phaseId, 'ranking', {
        assignments,
      })
      expect(response.status).toBe(422)
      expect(await response.json()).toEqual({ error: 'invalid_payload' })
    }
    expect(count(db, 'SELECT COUNT(*) AS count FROM ballot_votes')).toBe(0)
    expect(count(db, 'SELECT COUNT(*) AS count FROM vote_events')).toBe(0)
  })

  it('modifica una scheda e aggiunge un evento per ogni modifica', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await rankingFixture(env, db)

    await ballot(env, fixture.alice, fixture.phaseId, fixture.phaseId, 'ranking', {
      assignments: [{ elementId: 'e1', points: 5 }],
    })
    const updated = await ballot(env, fixture.alice, fixture.phaseId, fixture.phaseId, 'ranking', {
      assignments: [
        { elementId: 'e1', points: 3 },
        { elementId: 'e2', points: 5 },
      ],
    })

    expect(updated.status).toBe(200)
    const body = (await updated.json()) as BallotResponse
    expect(body.targets[0]!.points).toEqual({ scale: [5, 3, 1], used: [3, 5], remaining: [1] })
    expect(count(db, 'SELECT COUNT(*) AS count FROM vote_events WHERE phase_id = ?', fixture.phaseId)).toBe(2)
  })

  it('è idempotente per una scheda identica', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await rankingFixture(env, db)

    await ballot(env, fixture.alice, fixture.phaseId, fixture.phaseId, 'ranking', {
      assignments: [{ elementId: 'e1', points: 5 }],
    })
    await ballot(env, fixture.alice, fixture.phaseId, fixture.phaseId, 'ranking', {
      assignments: [{ elementId: 'e1', points: 5 }],
    })
    expect(count(db, 'SELECT COUNT(*) AS count FROM vote_events WHERE phase_id = ?', fixture.phaseId)).toBe(1)
  })

  it('rifiuta un target che non appartiene alla fase', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await rankingFixture(env, db)

    const response = await ballot(env, fixture.alice, fixture.phaseId, 'altro-target', 'ranking', {
      assignments: [],
    })
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ error: 'invalid_target' })
  })

  it('rifiuta il voto su una fase chiusa con 409', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await rankingFixture(env, db)
    const closed = await call(env, `/api/phases/${fixture.phaseId}/close`, fixture.alice, {
      method: 'POST',
    })
    expect(closed.status).toBe(200)

    const response = await ballot(env, fixture.alice, fixture.phaseId, fixture.phaseId, 'ranking', {
      assignments: [],
    })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'phase_not_open' })
  })

  it('autorizza solo i votanti fotografati nella fase', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await rankingFixture(env, db, { participants: ['u2'] })

    const response = await ballot(env, fixture.alice, fixture.phaseId, fixture.phaseId, 'ranking', {
      assignments: [],
    })
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'forbidden' })
  })

  it('rifiuta un kind diverso dalla scheda della fase', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await rankingFixture(env, db)

    const response = await ballot(env, fixture.alice, fixture.phaseId, fixture.phaseId, 'pick', {
      elementId: 'e1',
    })
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ error: 'invalid_payload' })
  })
})

describe('POST /api/phases/:id/ballots (pick)', () => {
  async function pickFixture(env: Env, db: DatabaseSync): Promise<RankingFixture> {
    const fixture = await base(env, db)
    const phaseId = await createPhase(env, fixture.alice, fixture.tournamentId, {
      name: 'Scelta finale',
      formula: 'ranking',
      voteType: 'pick',
      config: { credits: { perVoter: 0, maxPerMatch: null } },
      advance: { type: 'all' },
    })
    publish(db, fixture.tournamentId)
    await openPhase(env, fixture.alice, phaseId)
    return { ...fixture, phaseId }
  }

  it('salva una scelta singola e la rilegge nella scheda', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await pickFixture(env, db)

    const response = await ballot(env, fixture.alice, fixture.phaseId, fixture.phaseId, 'pick', {
      elementId: 'e3',
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as BallotResponse
    expect(body.targets[0]!.vote).toEqual({ kind: 'pick', elementId: 'e3' })
    expect(body.targets[0]!.points).toEqual({ scale: [1], used: [1], remaining: [] })
    expect(body.completion).toEqual({ voted: 1, total: 1 })

    const event = db.prepare('SELECT kind FROM vote_events WHERE phase_id = ?').get(fixture.phaseId) as {
      kind: string
    }
    expect(event.kind).toBe('pick')
  })

  it('rifiuta due elementi e un elemento fuori target', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await pickFixture(env, db)

    for (const payload of [{ elementId: 'e1', second: 'e2' }, { elementId: 'fuori' }]) {
      const response = await ballot(env, fixture.alice, fixture.phaseId, fixture.phaseId, 'pick', payload)
      expect(response.status).toBe(422)
      expect(await response.json()).toEqual({ error: 'invalid_payload' })
    }
  })
})

describe('DELETE /api/phases/:id/ballots/:targetId', () => {
  it('elimina il voto, aggiorna la scheda e aggiunge un evento', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await rankingFixture(env, db)
    await ballot(env, fixture.alice, fixture.phaseId, fixture.phaseId, 'ranking', {
      assignments: [{ elementId: 'e1', points: 5 }],
    })

    const response = await call(
      env,
      `/api/phases/${fixture.phaseId}/ballots/${fixture.phaseId}`,
      fixture.alice,
      { method: 'DELETE' },
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as BallotResponse
    expect(body.targets[0]!.vote).toBeNull()
    expect(body.targets[0]!.points.remaining).toEqual([5, 3, 1])
    expect(body.completion).toEqual({ voted: 0, total: 1 })

    expect(count(db, 'SELECT COUNT(*) AS count FROM ballot_votes')).toBe(0)
    const events = db
      .prepare('SELECT kind, payload FROM vote_events WHERE phase_id = ? ORDER BY created_at, id')
      .all(fixture.phaseId) as Array<{ kind: string; payload: string }>
    expect(events).toHaveLength(2)
    expect(events[1]!.kind).toBe('ranking')
    expect(JSON.parse(events[1]!.payload)).toMatchObject({ deleted: true })
  })

  it('è idempotente senza voto esistente e rifiuta una fase chiusa', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await rankingFixture(env, db)

    const missing = await call(
      env,
      `/api/phases/${fixture.phaseId}/ballots/${fixture.phaseId}`,
      fixture.alice,
      { method: 'DELETE' },
    )
    expect(missing.status).toBe(200)
    expect(count(db, 'SELECT COUNT(*) AS count FROM vote_events')).toBe(0)

    await call(env, `/api/phases/${fixture.phaseId}/close`, fixture.alice, { method: 'POST' })
    const closed = await call(
      env,
      `/api/phases/${fixture.phaseId}/ballots/${fixture.phaseId}`,
      fixture.alice,
      { method: 'DELETE' },
    )
    expect(closed.status).toBe(409)
    expect(await closed.json()).toEqual({ error: 'phase_not_open' })
  })
})

describe('GET /api/phases/:id/ballot per le schede', () => {
  it('espone i gironi come target per una fase group', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await groupFixture(env, db)

    const first = await call(env, `/api/phases/${fixture.phaseId}/ballot`, fixture.alice)
    expect(first.status).toBe(200)
    const empty = (await first.json()) as BallotResponse
    expect(empty.targets).toHaveLength(2)
    expect(empty.targets.map((target) => target.id)).toEqual(fixture.groupIds)
    expect(empty.targets[0]!.elements).toHaveLength(2)
    expect(empty.targets[0]!.points).toEqual({ scale: [3, 2, 1], used: [], remaining: [3, 2, 1] })
    expect(empty.completion).toEqual({ voted: 0, total: 2 })

    const saved = await ballot(
      env,
      fixture.alice,
      fixture.phaseId,
      fixture.groupIds[1]!,
      'ranking',
      { assignments: [{ elementId: 'e3', points: 3 }] },
    )
    expect(saved.status).toBe(200)
    const body = (await saved.json()) as BallotResponse
    expect(body.completion).toEqual({ voted: 1, total: 2 })
    expect(body.targets[0]!.points.remaining).toEqual([3, 2, 1])
    expect(body.targets[1]!.points.remaining).toEqual([2, 1])
  })

  it('mantiene la scheda del duello invariata', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await base(env, db, { elementCount: 2 })
    const phaseId = await createPhase(env, fixture.alice, fixture.tournamentId, {
      name: 'Semifinali',
      formula: 'elimination',
      voteType: 'duel',
      config: { elimination: { seeding: 'ranking' }, credits: { perVoter: 5, maxPerMatch: 2 } },
      advance: { type: 'winners' },
    })
    publish(db, fixture.tournamentId)
    await openPhase(env, fixture.alice, phaseId)

    const response = await call(env, `/api/phases/${phaseId}/ballot`, fixture.alice)
    expect(response.status).toBe(200)
    const body = (await response.json()) as BallotResponse & { budget: number; maxPerMatch: number }
    expect(body.matches).toHaveLength(1)
    expect(body.targets).toEqual([])
    expect(body.budget).toBe(5)
    expect(body.maxPerMatch).toBe(2)
  })
})
