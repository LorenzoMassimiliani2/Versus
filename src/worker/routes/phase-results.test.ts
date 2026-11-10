import type { DatabaseSync } from 'node:sqlite'

import { describe, expect, it } from 'vitest'

import type { Secrecy } from '../../domain/phases'

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
  return worker.fetch(new Request(`${ORIGIN}${path}`, { ...init, headers }), env, {} as ExecutionContext)
}

function seedElements(
  db: DatabaseSync,
  tournamentId: string,
  count: number,
): string[] {
  const ids: string[] = []
  for (let index = 0; index < count; index += 1) {
    const id = `e${index + 1}`
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

function publish(db: DatabaseSync, tournamentId: string): void {
  db.prepare("UPDATE tournaments SET status = 'published' WHERE id = ?").run(tournamentId)
}

async function openPhase(env: Env, token: string, phaseId: string): Promise<void> {
  const response = await call(env, `/api/phases/${phaseId}/open`, token, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  expect(response.status).toBe(200)
}

async function closePhase(env: Env, token: string, phaseId: string): Promise<void> {
  const response = await call(env, `/api/phases/${phaseId}/close`, token, { method: 'POST' })
  expect(response.status).toBe(200)
}

interface ResultsBody {
  phaseId: string
  phase: { id: string; name: string; formula: string; voteType: string }
  closedAt: string | null
  version: number
  groups: Array<{
    groupId: string
    name: string | null
    ranking: Array<{ elementId: string; score: number; position: number }>
  }>
  matches: Array<{
    matchId: string
    sideA: { elementId: string | null; weight: number; credits: number; voters: number }
    sideB: { elementId: string | null; weight: number; credits: number; voters: number }
    winnerElementId: string | null
    resolvedBy: string | null
  }>
  ranking: Array<{ elementId: string; score: number; position: number }>
  qualified: string[]
  repechage: { enabled: boolean; selected: string[]; criteria: string[] } | null
  winnerElementId: string | null
  elements: Array<{ id: string; name: string; imageUrl: string }>
  state?: 'open' | 'closed'
  secrecy?: Secrecy
  visibility?: 'aggregate' | 'own_vote' | 'hidden'
  ownVotes?: Array<Record<string, unknown>>
}

async function setupDuelGroupPhase(secrecy: Secrecy = 'live') {
  const { db, env } = createTestEnvironment()
  await seedUser(db, 'u1', 'alice')
  await seedUser(db, 'u2', 'bruno')
  await seedUser(db, 'u3', 'carla')
  const alice = await login(env, 'alice')
  const bruno = await login(env, 'bruno')
  const tournamentId = await createTournament(env, alice)
  const elementIds = seedElements(db, tournamentId, 2)
  seedParticipants(db, tournamentId, ['u1', 'u2'])
  const phaseId = await createPhase(env, alice, tournamentId, {
    name: 'Girone',
    formula: 'group',
    voteType: 'duel',
    config: {
      secrecy,
      groups: { size: 2, assignment: 'snake', remainder: 'smaller_groups', points: [3, 2, 1] },
      credits: { perVoter: 5, maxPerMatch: 2 },
    },
    advance: { type: 'top_per_group', n: 1 },
  })
  publish(db, tournamentId)
  await openPhase(env, alice, phaseId)
  const matchId = (
    db.prepare('SELECT id FROM matches WHERE phase_id = ? ORDER BY position LIMIT 1').get(phaseId) as {
      id: string
    }
  ).id
  db.prepare(
    `INSERT INTO duel_votes (match_id, voter_id, side, credits, created_at, updated_at)
     VALUES (?, 'u1', 'a', 2, ?, ?), (?, 'u2', 'b', 0, ?, ?)`,
  ).run(matchId, NOW, NOW, matchId, NOW, NOW)
  await closePhase(env, alice, phaseId)
  return { db, env, alice, bruno, tournamentId, elementIds, phaseId, matchId }
}

describe('GET /api/phases/:id/results', () => {
  it('restituisce lo snapshot di una fase chiusa a un partecipante', async () => {
    const { env, bruno, phaseId, elementIds, matchId } = await setupDuelGroupPhase()

    const response = await call(env, `/api/phases/${phaseId}/results`, bruno)

    expect(response.status).toBe(200)
    const body = (await response.json()) as ResultsBody
    expect(body.phaseId).toBe(phaseId)
    expect(body.phase).toMatchObject({ id: phaseId, name: 'Girone', formula: 'group', voteType: 'duel' })
    expect(body.version).toBe(1)
    expect(body.closedAt).toBeTruthy()
    expect(body.matches).toHaveLength(1)
    expect(body.matches[0]).toMatchObject({
      matchId,
      winnerElementId: elementIds[0],
      resolvedBy: 'weight',
      sideA: { elementId: elementIds[0], weight: 3, credits: 2, voters: 1 },
      sideB: { elementId: elementIds[1], weight: 1, credits: 0, voters: 1 },
    })
    expect(body.groups[0]!.ranking[0]).toMatchObject({ elementId: elementIds[0], score: 3 })
    expect(body.qualified).toEqual([elementIds[0]])
    expect(body.winnerElementId).toBeNull()
    expect(body.elements).toEqual([
      { id: elementIds[0], name: 'Elemento 1', imageUrl: 'https://images.example.test/e1.jpg' },
      { id: elementIds[1], name: 'Elemento 2', imageUrl: 'https://images.example.test/e2.jpg' },
    ])
    expect(body.repechage).toBeNull()
  })

  it('non ricalcola i risultati dopo la chiusura', async () => {
    const { db, env, alice, phaseId } = await setupDuelGroupPhase()

    db.prepare("UPDATE duel_votes SET side = 'b', credits = 2 WHERE match_id = (SELECT id FROM matches WHERE phase_id = ? LIMIT 1)").run(phaseId)

    const response = await call(env, `/api/phases/${phaseId}/results`, alice)

    expect(response.status).toBe(200)
    const body = (await response.json()) as ResultsBody
    expect(body.matches[0]!.winnerElementId).toBe(body.matches[0]!.sideA.elementId)
    expect(body.matches[0]!.sideA).toMatchObject({ weight: 3, credits: 2, voters: 1 })
    const rows = db
      .prepare('SELECT COUNT(*) AS count FROM phase_results WHERE phase_id = ?')
      .get(phaseId) as { count: number }
    expect(rows.count).toBe(1)
  })

  it('elenca i ripescati quando la fase lo prevede', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    await seedUser(db, 'u2', 'bruno')
    const alice = await login(env, 'alice')
    const bruno = await login(env, 'bruno')
    const tournamentId = await createTournament(env, alice)
    const elementIds = seedElements(db, tournamentId, 2)
    seedParticipants(db, tournamentId, ['u1', 'u2'])
    const phaseId = await createPhase(env, alice, tournamentId, {
      name: 'Girone classifica',
      formula: 'group',
      voteType: 'ranking',
      config: {
        groups: { size: 2, assignment: 'snake', remainder: 'smaller_groups' },
        ranking: { points: [3, 2, 1], minSelections: 1 },
      },
      advance: {
        type: 'top_per_group',
        n: 1,
        repechage: { targetSize: 2, criteria: ['group_points'] },
      },
    })
    publish(db, tournamentId)
    await openPhase(env, alice, phaseId)
    const groupId = (
      db.prepare('SELECT id FROM groups WHERE phase_id = ? LIMIT 1').get(phaseId) as { id: string }
    ).id
    db.prepare(
      `INSERT INTO ballot_votes (phase_id, target_id, voter_id, kind, payload, created_at, updated_at)
       VALUES (?, ?, 'u1', 'ranking', ?, ?, ?)`,
    ).run(
      phaseId,
      groupId,
      JSON.stringify({ assignments: [{ elementId: elementIds[0], points: 3 }] }),
      NOW,
      NOW,
    )
    await closePhase(env, alice, phaseId)

    const response = await call(env, `/api/phases/${phaseId}/results`, bruno)

    expect(response.status).toBe(200)
    const body = (await response.json()) as ResultsBody
    expect(body.groups[0]!.name).toBeTruthy()
    expect(body.qualified).toEqual([elementIds[0]])
    expect(body.repechage).toEqual({
      enabled: true,
      selected: [elementIds[1]],
      criteria: ['group_points'],
    })
  })

  it('richiede l appartenenza al torneo', async () => {
    const { env, phaseId } = await setupDuelGroupPhase()
    const carla = await login(env, 'carla')

    const response = await call(env, `/api/phases/${phaseId}/results`, carla)

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'forbidden' })
  })

  it('espone aggregati provvisori di una fase aperta e non di una pending', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    await seedUser(db, 'u2', 'bruno')
    const alice = await login(env, 'alice')
    const bruno = await login(env, 'bruno')
    const tournamentId = await createTournament(env, alice)
    seedElements(db, tournamentId, 2)
    seedParticipants(db, tournamentId, ['u1', 'u2'])

    const openPhaseId = await createPhase(env, alice, tournamentId, {
      name: 'Girone',
      formula: 'group',
      voteType: 'duel',
      config: {
        groups: { size: 2, assignment: 'snake', remainder: 'smaller_groups' },
        credits: { perVoter: 0, maxPerMatch: null },
      },
      advance: { type: 'all' },
    })
    const pendingPhaseId = await createPhase(env, alice, tournamentId, {
      name: 'Finale',
      formula: 'ranking',
      voteType: 'pick',
      config: { ranking: { points: [3, 2, 1], minSelections: 1 } },
      advance: { type: 'winner' },
    })
    publish(db, tournamentId)
    await openPhase(env, alice, openPhaseId)

    const open = await call(env, `/api/phases/${openPhaseId}/results`, bruno)
    expect(open.status).toBe(200)
    const openBody = (await open.json()) as ResultsBody
    expect(openBody).toMatchObject({ state: 'open', visibility: 'aggregate' })
    expect(openBody.closedAt).toBeNull()
    const snapshots = db
      .prepare('SELECT COUNT(*) AS count FROM phase_results WHERE phase_id = ?')
      .get(openPhaseId) as { count: number }
    expect(snapshots.count).toBe(0)

    const pending = await call(env, `/api/phases/${pendingPhaseId}/results`, bruno)
    expect(pending.status).toBe(409)
    expect(await pending.json()).toEqual({ error: 'phase_not_closed' })
  })

  it('risponde 404 per una fase inesistente', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')

    const response = await call(env, '/api/phases/inesistente/results', alice)

    expect(response.status).toBe(404)
  })
})


async function setupOpenDuelGroupPhase(secrecy: Secrecy = 'live') {
  const { db, env } = createTestEnvironment()
  await seedUser(db, 'u1', 'alice')
  await seedUser(db, 'u2', 'bruno')
  const alice = await login(env, 'alice')
  const bruno = await login(env, 'bruno')
  const tournamentId = await createTournament(env, alice)
  const elementIds = seedElements(db, tournamentId, 2)
  seedParticipants(db, tournamentId, ['u1', 'u2'])
  const phaseId = await createPhase(env, alice, tournamentId, {
    name: 'Girone',
    formula: 'group',
    voteType: 'duel',
    config: {
      secrecy,
      groups: { size: 2, assignment: 'snake', remainder: 'smaller_groups', points: [3, 2, 1] },
      credits: { perVoter: 5, maxPerMatch: 2 },
    },
    advance: { type: 'top_per_group', n: 1 },
  })
  publish(db, tournamentId)
  await openPhase(env, alice, phaseId)
  const matchId = (
    db.prepare('SELECT id FROM matches WHERE phase_id = ? ORDER BY position LIMIT 1').get(phaseId) as {
      id: string
    }
  ).id
  db.prepare(
    `INSERT INTO duel_votes (match_id, voter_id, side, credits, created_at, updated_at)
     VALUES (?, 'u1', 'a', 2, ?, ?), (?, 'u2', 'b', 0, ?, ?)`,
  ).run(matchId, NOW, NOW, matchId, NOW, NOW)
  return { db, env, alice, bruno, tournamentId, elementIds, phaseId, matchId }
}

describe('GET /api/phases/:id/results e segretezza', () => {
  it('in live mostra gli aggregati a un partecipante durante la fase', async () => {
    const { env, bruno, phaseId, elementIds } = await setupOpenDuelGroupPhase('live')

    const response = await call(env, `/api/phases/${phaseId}/results`, bruno)

    expect(response.status).toBe(200)
    const body = (await response.json()) as ResultsBody
    expect(body).toMatchObject({ state: 'open', secrecy: 'live', visibility: 'aggregate' })
    expect(body.closedAt).toBeNull()
    expect(body.version).toBe(0)
    expect(body.matches[0]).toMatchObject({
      winnerElementId: elementIds[0],
      sideA: { elementId: elementIds[0], weight: 3, credits: 2, voters: 1 },
      sideB: { elementId: elementIds[1], weight: 1, credits: 0, voters: 1 },
    })
    expect(body.groups[0]!.ranking.map((row) => row.elementId)).toEqual(elementIds)
    expect(body.ownVotes).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('u1')
    expect(JSON.stringify(body)).not.toContain('u2')
  })

  it('in blind mostra solo il proprio voto al partecipante prima della chiusura', async () => {
    const { env, bruno, phaseId, matchId } = await setupOpenDuelGroupPhase('blind')

    const response = await call(env, `/api/phases/${phaseId}/results`, bruno)

    expect(response.status).toBe(200)
    const body = (await response.json()) as ResultsBody
    expect(body).toMatchObject({ state: 'open', secrecy: 'blind', visibility: 'own_vote' })
    expect(body.groups).toEqual([])
    expect(body.matches).toEqual([])
    expect(body.qualified).toEqual([])
    expect(body.ownVotes).toEqual([
      {
        kind: 'duel',
        targetId: matchId,
        targetName: 'Elemento 1 vs Elemento 2',
        side: 'b',
        credits: 0,
      },
    ])
    expect(JSON.stringify(body)).not.toContain('u1')
    expect(JSON.stringify(body)).not.toContain('u2')
  })

  it('in blind mostra gli aggregati al partecipante dopo la chiusura', async () => {
    const { env, bruno, phaseId, elementIds } = await setupDuelGroupPhase('blind')

    const response = await call(env, `/api/phases/${phaseId}/results`, bruno)

    expect(response.status).toBe(200)
    const body = (await response.json()) as ResultsBody
    expect(body).toMatchObject({ state: 'closed', secrecy: 'blind', visibility: 'aggregate' })
    expect(body.closedAt).toBeTruthy()
    expect(body.matches[0]!.sideA.elementId).toBe(elementIds[0])
    expect(body.groups).toHaveLength(1)
    expect(JSON.stringify(body)).not.toContain('u1')
    expect(JSON.stringify(body)).not.toContain('u2')
  })

  it('in secret mostra solo il proprio voto al partecipante prima della chiusura', async () => {
    const { env, bruno, phaseId, matchId } = await setupOpenDuelGroupPhase('secret')

    const response = await call(env, `/api/phases/${phaseId}/results`, bruno)

    expect(response.status).toBe(200)
    const body = (await response.json()) as ResultsBody
    expect(body).toMatchObject({ state: 'open', secrecy: 'secret', visibility: 'own_vote' })
    expect(body.groups).toEqual([])
    expect(body.ownVotes).toEqual([
      {
        kind: 'duel',
        targetId: matchId,
        targetName: 'Elemento 1 vs Elemento 2',
        side: 'b',
        credits: 0,
      },
    ])
    expect(JSON.stringify(body)).not.toContain('u1')
    expect(JSON.stringify(body)).not.toContain('u2')
  })

  it('in secret non espone voti individuali all organizzatore nemmeno dopo la chiusura', async () => {
    const { env, alice, phaseId, elementIds } = await setupDuelGroupPhase('secret')

    const response = await call(env, `/api/phases/${phaseId}/results`, alice)

    expect(response.status).toBe(200)
    const body = (await response.json()) as ResultsBody
    expect(body).toMatchObject({ state: 'closed', secrecy: 'secret', visibility: 'aggregate' })
    expect(body.closedAt).toBeTruthy()
    expect(body.matches[0]).toMatchObject({
      sideA: { weight: 3, credits: 2, voters: 1 },
      sideB: { weight: 1, credits: 0, voters: 1 },
    })
    expect(body.ownVotes).toBeUndefined()
    const serialised = JSON.stringify(body)
    expect(serialised).not.toContain('u1')
    expect(serialised).not.toContain('u2')
    expect(serialised).not.toContain('voterId')
    expect(body.matches[0]!.sideA.elementId).toBe(elementIds[0])
  })

  it('in secret mostra gli aggregati al partecipante dopo la chiusura', async () => {
    const { env, bruno, phaseId, elementIds } = await setupDuelGroupPhase('secret')

    const response = await call(env, `/api/phases/${phaseId}/results`, bruno)

    expect(response.status).toBe(200)
    const body = (await response.json()) as ResultsBody
    expect(body).toMatchObject({ state: 'closed', secrecy: 'secret', visibility: 'aggregate' })
    expect(body.matches[0]!.sideA.elementId).toBe(elementIds[0])
    expect(body.ownVotes).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('u1')
    expect(JSON.stringify(body)).not.toContain('u2')
  })

  it('in secret mostra solo aggregati all organizzatore durante la fase aperta', async () => {
    const { env, alice, phaseId, elementIds } = await setupOpenDuelGroupPhase('secret')

    const response = await call(env, `/api/phases/${phaseId}/results`, alice)

    expect(response.status).toBe(200)
    const body = (await response.json()) as ResultsBody
    expect(body).toMatchObject({ state: 'open', secrecy: 'secret', visibility: 'aggregate' })
    expect(body.ownVotes).toBeUndefined()
    expect(body.matches[0]!.sideA.elementId).toBe(elementIds[0])
    expect(JSON.stringify(body)).not.toContain('u1')
    expect(JSON.stringify(body)).not.toContain('u2')
  })

  it('restituisce al partecipante il proprio pick senza aggregati in una fase secret aperta', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    await seedUser(db, 'u2', 'bruno')
    const alice = await login(env, 'alice')
    const bruno = await login(env, 'bruno')
    const tournamentId = await createTournament(env, alice)
    const elementIds = seedElements(db, tournamentId, 2)
    seedParticipants(db, tournamentId, ['u1', 'u2'])
    const phaseId = await createPhase(env, alice, tournamentId, {
      name: 'Classifica finale',
      formula: 'ranking',
      voteType: 'pick',
      config: {
        secrecy: 'secret',
        ranking: { points: [3, 2, 1], minSelections: 1 },
      },
      advance: { type: 'winner' },
    })
    publish(db, tournamentId)
    await openPhase(env, alice, phaseId)
    db.prepare(
      `INSERT INTO ballot_votes (phase_id, target_id, voter_id, kind, payload, created_at, updated_at)
       VALUES (?, ?, 'u1', 'pick', ?, ?, ?), (?, ?, 'u2', 'pick', ?, ?, ?)`,
    ).run(
      phaseId,
      phaseId,
      JSON.stringify({ elementId: elementIds[0] }),
      NOW,
      NOW,
      phaseId,
      phaseId,
      JSON.stringify({ elementId: elementIds[1] }),
      NOW,
      NOW,
    )

    const response = await call(env, `/api/phases/${phaseId}/results`, bruno)

    expect(response.status).toBe(200)
    const body = (await response.json()) as ResultsBody
    expect(body.visibility).toBe('own_vote')
    expect(body.ranking).toEqual([])
    expect(body.ownVotes).toEqual([
      {
        kind: 'pick',
        targetId: phaseId,
        targetName: 'Classifica finale',
        elementId: elementIds[1],
      },
    ])
    expect(JSON.stringify(body)).not.toContain('u1')
    expect(JSON.stringify(body)).not.toContain('u2')
  })
})
