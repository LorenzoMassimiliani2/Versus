import type { DatabaseSync } from 'node:sqlite'

import { describe, expect, it } from 'vitest'

import worker from '../index'
import { createTestEnvironment } from '../../test/d1'
import { hashPassword } from '../auth/password'

const ORIGIN = 'https://versus.test'
const NOW = '2026-11-10T10:00:00.000Z'

function createEnv() {
  return createTestEnvironment()
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

async function createTournament(
  env: Env,
  token: string,
  settings?: { autoAdvance?: boolean },
): Promise<string> {
  const response = await call(env, '/api/tournaments', token, {
    method: 'POST',
    body: JSON.stringify({ name: 'Torneo di Prova', settings }),
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
): string[] {
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

interface AwaitingFixture {
  db: DatabaseSync
  env: Env
  alice: string
  tournamentId: string
  phase: { id: string; name: string }
  elementIds: string[]
}

/**
 * Fase di classifica con due elementi a pari punti e soglia di qualificazione
 * a 1: la chiusura porta la fase in `awaiting_resolution`.
 */
async function awaitingFixture(
  settings?: { autoAdvance?: boolean },
): Promise<AwaitingFixture> {
  const { db, env } = createEnv()
  await seedUser(db, 'u1', 'alice')
  await seedUser(db, 'u2', 'bruno')
  const alice = await login(env, 'alice')
  const tournamentId = await createTournament(env, alice, settings)
  const elementIds = seedElements(db, tournamentId, 2)
  seedParticipants(db, tournamentId, ['u1', 'u2'])
  const phase = await createPhase(env, alice, tournamentId, {
    name: 'Finale classifica',
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
  const closed = await call(env, `/api/phases/${phase.id}/close`, alice, { method: 'POST' })
  expect(closed.status).toBe(200)
  expect(((await closed.json()) as { phase: { status: string } }).phase.status).toBe(
    'awaiting_resolution',
  )
  return {
    db,
    env,
    alice,
    tournamentId,
    phase: { id: phase.id, name: 'Finale classifica' },
    elementIds,
  }
}

function resolutionBody(targetId: string, ordering: string[], note = 'Regolamento') {
  return JSON.stringify({ note, resolutions: [{ targetId, ordering }] })
}

describe('GET /api/phases/:id/resolution', () => {
  it('espone all organizzatore i target ambigui con i loro elementi', async () => {
    const { env, alice, phase, elementIds } = await awaitingFixture()

    const response = await call(env, `/api/phases/${phase.id}/resolution`, alice)

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      phase: { id: string; status: string }
      targets: Array<{ targetId: string; name: string; elements: Array<{ id: string; name: string }> }>
    }
    expect(body.phase).toMatchObject({ id: phase.id, status: 'awaiting_resolution' })
    expect(body.targets).toEqual([
      {
        targetId: phase.id,
        name: 'Finale classifica',
        elements: [
          { id: elementIds[0], name: 'Elemento 1' },
          { id: elementIds[1], name: 'Elemento 2' },
        ],
      },
    ])
  })

  it('risponde 409 se la fase non attende una risoluzione', async () => {
    const { db, env } = createEnv()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice)
    seedElements(db, tournamentId, 2)
    seedParticipants(db, tournamentId, ['u1'])
    const phase = await createPhase(env, alice, tournamentId, {
      name: 'Fase',
      formula: 'ranking',
      voteType: 'ranking',
      config: {},
      advance: { type: 'all' },
    })

    const response = await call(env, `/api/phases/${phase.id}/resolution`, alice)

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'phase_not_awaiting_resolution' })
  })
})

describe('POST /api/phases/:id/resolve', () => {
  it('applica l ordine, chiude la fase e scrive snapshot e audit', async () => {
    const { db, env, alice, tournamentId, phase, elementIds } = await awaitingFixture()

    const response = await call(env, `/api/phases/${phase.id}/resolve`, alice, {
      method: 'POST',
      body: resolutionBody(phase.id, [elementIds[1]!, elementIds[0]!], 'Testa o croce'),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      phase: { status: string; closedAt: string | null }
      result: { results: { qualified: string[]; ranking: Array<{ elementId: string }> } }
    }
    expect(body.phase.status).toBe('closed')
    expect(body.phase.closedAt).not.toBeNull()
    expect(body.result.results.qualified).toEqual([elementIds[1]])
    expect(body.result.results.ranking.map((row) => row.elementId)).toEqual([
      elementIds[1],
      elementIds[0],
    ])

    expect(count(db, 'SELECT COUNT(*) AS count FROM phase_results WHERE phase_id = ?', phase.id)).toBe(1)
    expect(
      count(db, "SELECT COUNT(*) AS count FROM audit_log WHERE action = 'phase.resolve' AND target_id = ?", phase.id),
    ).toBe(1)
    const audit = db
      .prepare("SELECT tournament_id, actor_id, before, after FROM audit_log WHERE action = 'phase.resolve'")
      .get() as { tournament_id: string; actor_id: string; before: string; after: string }
    expect(audit.tournament_id).toBe(tournamentId)
    expect(audit.actor_id).toBe('u1')
    expect(JSON.parse(audit.before)).toEqual({ status: 'awaiting_resolution' })
    expect(JSON.parse(audit.after)).toEqual({
      status: 'closed',
      note: 'Testa o croce',
      resolutions: [{ targetId: phase.id, ordering: [elementIds[1], elementIds[0]] }],
    })
  })

  it('rifiuta una nota mancante', async () => {
    const { env, alice, phase, elementIds } = await awaitingFixture()

    const response = await call(env, `/api/phases/${phase.id}/resolve`, alice, {
      method: 'POST',
      body: JSON.stringify({
        resolutions: [{ targetId: phase.id, ordering: [elementIds[1], elementIds[0]] }],
      }),
    })

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ error: 'note_required' })
  })

  it('rifiuta un ordinamento su un target che non è ambiguo', async () => {
    const { db, env, alice, phase, elementIds } = await awaitingFixture()

    const wrongTarget = await call(env, `/api/phases/${phase.id}/resolve`, alice, {
      method: 'POST',
      body: resolutionBody('altro-target', [elementIds[1]!, elementIds[0]!]),
    })
    expect(wrongTarget.status).toBe(422)
    expect(await wrongTarget.json()).toEqual({ error: 'invalid_resolution' })

    const incomplete = await call(env, `/api/phases/${phase.id}/resolve`, alice, {
      method: 'POST',
      body: resolutionBody(phase.id, [elementIds[1]!]),
    })
    expect(incomplete.status).toBe(422)
    expect(await incomplete.json()).toEqual({ error: 'invalid_resolution' })
    expect(count(db, 'SELECT COUNT(*) AS count FROM phase_results WHERE phase_id = ?', phase.id)).toBe(0)
  })

  it('rifiuta un secondo tentativo sulla stessa fase', async () => {
    const { env, alice, phase, elementIds } = await awaitingFixture()
    const first = await call(env, `/api/phases/${phase.id}/resolve`, alice, {
      method: 'POST',
      body: resolutionBody(phase.id, [elementIds[1]!, elementIds[0]!]),
    })
    expect(first.status).toBe(200)

    const second = await call(env, `/api/phases/${phase.id}/resolve`, alice, {
      method: 'POST',
      body: resolutionBody(phase.id, [elementIds[0]!, elementIds[1]!]),
    })
    expect(second.status).toBe(409)
    expect(await second.json()).toEqual({ error: 'phase_not_awaiting_resolution' })
  })

  it('rifiuta un partecipante con 403', async () => {
    const { env, phase, elementIds } = await awaitingFixture()
    const participant = await login(env, 'bruno')

    const list = await call(env, `/api/phases/${phase.id}/resolution`, participant)
    expect(list.status).toBe(403)

    const response = await call(env, `/api/phases/${phase.id}/resolve`, participant, {
      method: 'POST',
      body: resolutionBody(phase.id, [elementIds[1]!, elementIds[0]!]),
    })
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'forbidden' })
  })

  it('con autoAdvance apre la fase successiva dopo la chiusura', async () => {
    const { db, env } = createEnv()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice, { autoAdvance: true })
    const elementIds = seedElements(db, tournamentId, 2)
    seedParticipants(db, tournamentId, ['u1'])
    const first = await createPhase(env, alice, tournamentId, {
      name: 'Fase 1',
      formula: 'ranking',
      voteType: 'ranking',
      config: { ranking: { points: [3, 2, 1], minSelections: 1 } },
      advance: { type: 'top_global', n: 1 },
    })
    const second = await createPhase(env, alice, tournamentId, {
      name: 'Fase 2',
      formula: 'ranking',
      voteType: 'ranking',
      config: { ranking: { points: [3, 2, 1], minSelections: 1 } },
      advance: { type: 'all' },
    })
    publish(db, tournamentId)
    await openPhase(env, alice, first.id)
    seedBallot(db, first.id, first.id, 'u1', [
      [elementIds[0]!, 3],
      [elementIds[1]!, 3],
    ])
    const closed = await call(env, `/api/phases/${first.id}/close`, alice, { method: 'POST' })
    expect(((await closed.json()) as { phase: { status: string } }).phase.status).toBe(
      'awaiting_resolution',
    )
    expect(
      (db.prepare('SELECT status FROM phases WHERE id = ?').get(second.id) as { status: string }).status,
    ).toBe('pending')

    const response = await call(env, `/api/phases/${first.id}/resolve`, alice, {
      method: 'POST',
      body: resolutionBody(first.id, [elementIds[1]!, elementIds[0]!]),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      phase: { status: string }
      autoAdvance?: { status: string; phaseId?: string }
    }
    expect(body.phase.status).toBe('closed')
    expect(body.autoAdvance).toMatchObject({ status: 'opened', phaseId: second.id })
    expect(
      (db.prepare('SELECT status FROM phases WHERE id = ?').get(second.id) as { status: string }).status,
    ).toBe('open')
  })

  it('risolve un duello ambiguo usando l id della sfida come target', async () => {
    const { db, env } = createEnv()
    await seedUser(db, 'u1', 'alice')
    await seedUser(db, 'u2', 'bruno')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice)
    const elementIds = seedElements(db, tournamentId, 2)
    seedParticipants(db, tournamentId, ['u1', 'u2'])
    const phase = await createPhase(env, alice, tournamentId, {
      name: 'Finale',
      formula: 'elimination',
      voteType: 'duel',
      config: { elimination: { seeding: 'ranking' }, credits: { perVoter: 5, maxPerMatch: 2 } },
      advance: { type: 'winner' },
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
       VALUES (?, 'u1', 'a', 0, ?, ?), (?, 'u2', 'b', 0, ?, ?)`,
    ).run(matchId, NOW, NOW, matchId, NOW, NOW)

    const closed = await call(env, `/api/phases/${phase.id}/close`, alice, { method: 'POST' })
    expect(((await closed.json()) as { phase: { status: string } }).phase.status).toBe(
      'awaiting_resolution',
    )

    const list = await call(env, `/api/phases/${phase.id}/resolution`, alice)
    const listBody = (await list.json()) as { targets: Array<{ targetId: string }> }
    expect(listBody.targets.map((target) => target.targetId)).toEqual([matchId])

    const response = await call(env, `/api/phases/${phase.id}/resolve`, alice, {
      method: 'POST',
      body: resolutionBody(matchId, [elementIds[1]!, elementIds[0]!]),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      phase: { status: string }
      result: { results: { matches: Array<{ winnerElementId: string; resolvedBy: string }>; winnerElementId: string } }
    }
    expect(body.phase.status).toBe('closed')
    expect(body.result.results.matches[0]).toMatchObject({
      winnerElementId: elementIds[1],
      resolvedBy: 'manual',
    })
    expect(body.result.results.winnerElementId).toBe(elementIds[1])
  })
})
