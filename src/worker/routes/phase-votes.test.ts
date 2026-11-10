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
  credits: { perVoter: number; maxPerMatch: number | null },
): Promise<{ id: string }> {
  const response = await call(env, `/api/tournaments/${tournamentId}/phases`, token, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Semifinali',
      formula: 'elimination',
      voteType: 'duel',
      config: { elimination: { seeding: 'ranking' }, credits },
      advance: { type: 'winners' },
    }),
  })
  expect(response.status).toBe(201)
  return ((await response.json()) as { phase: { id: string } }).phase
}

function seedElements(
  db: DatabaseSync,
  tournamentId: string,
  count: number,
): Array<{ id: string; name: string }> {
  const elements: Array<{ id: string; name: string }> = []
  for (let index = 0; index < count; index += 1) {
    const id = `e${index + 1}`
    const name = `Elemento ${index + 1}`
    db.prepare(
      `INSERT INTO elements (id, tournament_id, name, image_url, video_url, custom_values, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, '{}', ?, ?, ?)`,
    ).run(
      id,
      tournamentId,
      name,
      `https://images.example.test/${id}.jpg`,
      `https://www.youtube.com/watch?v=${id}`,
      index + 1,
      NOW,
      NOW,
    )
    elements.push({ id, name })
  }
  return elements
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

function matches(db: DatabaseSync, phaseId: string): string[] {
  return (
    db
      .prepare('SELECT id FROM matches WHERE phase_id = ? ORDER BY round, position')
      .all(phaseId) as Array<{ id: string }>
  ).map((row) => row.id)
}

function count(db: DatabaseSync, sql: string, ...params: string[]): number {
  return (db.prepare(sql).get(...params) as { count: number }).count
}

interface Fixture {
  alice: string
  bob: string
  tournamentId: string
  phaseId: string
  matchIds: string[]
  elements: Array<{ id: string; name: string }>
}

async function setup(
  env: Env,
  db: DatabaseSync,
  options: {
    elementCount?: number
    participants?: string[]
    perVoter?: number
    maxPerMatch?: number | null
  } = {},
): Promise<Fixture> {
  const elementCount = options.elementCount ?? 2
  const participants = options.participants ?? ['u1']
  await seedUser(db, 'u1', 'alice')
  await seedUser(db, 'u2', 'bob')
  const alice = await login(env, 'alice')
  const bob = await login(env, 'bob')
  const tournamentId = await createTournament(env, alice)
  const elements = seedElements(db, tournamentId, elementCount)
  seedParticipants(db, tournamentId, participants)
  const phase = await createPhase(env, alice, tournamentId, {
    perVoter: options.perVoter ?? 5,
    maxPerMatch: options.maxPerMatch ?? null,
  })
  publish(db, tournamentId)

  const opened = await call(env, `/api/phases/${phase.id}/open`, alice, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  expect(opened.status).toBe(200)

  return {
    alice,
    bob,
    tournamentId,
    phaseId: phase.id,
    matchIds: matches(db, phase.id),
    elements,
  }
}

function vote(
  env: Env,
  token: string,
  phaseId: string,
  matchId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return call(env, `/api/phases/${phaseId}/duels/${matchId}/votes`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/phases/:id/duels/:matchId/votes', () => {
  it('salva un voto con 5 crediti: peso 6 e una riga di spesa', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await setup(env, db, { perVoter: 10, maxPerMatch: null })

    const response = await vote(env, fixture.alice, fixture.phaseId, fixture.matchIds[0]!, {
      side: 'a',
      credits: 5,
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      balance: number
      matches: Array<{ id: string; vote: { side: string; credits: number } | null }>
    }
    expect(body.balance).toBe(5)
    expect(body.matches[0]!.vote).toEqual({ side: 'a', credits: 5 })

    const row = db
      .prepare('SELECT side, credits FROM duel_votes WHERE match_id = ? AND voter_id = ?')
      .get(fixture.matchIds[0]!, 'u1') as { side: string; credits: number }
    expect(row).toEqual({ side: 'a', credits: 5 })
    expect(
      count(
        db,
        "SELECT COUNT(*) AS count FROM credit_entries WHERE phase_id = ? AND voter_id = ? AND reason = 'spend' AND amount = -5",
        fixture.phaseId,
        'u1',
      ),
    ).toBe(1)

    const closed = await call(env, `/api/phases/${fixture.phaseId}/close`, fixture.alice, {
      method: 'POST',
    })
    expect(closed.status).toBe(200)
    const result = (await closed.json()) as {
      result: { results: { matches: Array<{ sideA: { weight: number }; sideB: { weight: number } }> } }
    }
    expect(result.result.results.matches[0]!.sideA.weight).toBe(6)
    expect(result.result.results.matches[0]!.sideB.weight).toBe(0)
  })

  it('rifiuta crediti oltre il limite per sfida con 422', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await setup(env, db, { perVoter: 5, maxPerMatch: 2 })

    const response = await vote(env, fixture.alice, fixture.phaseId, fixture.matchIds[0]!, {
      side: 'a',
      credits: 3,
    })

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ error: 'credits_exceeded' })
    expect(
      count(db, 'SELECT COUNT(*) AS count FROM duel_votes WHERE match_id = ?', fixture.matchIds[0]!),
    ).toBe(0)
    expect(
      count(db, 'SELECT COUNT(*) AS count FROM credit_entries WHERE phase_id = ?', fixture.phaseId),
    ).toBe(0)
  })

  it('cambiare lato rimborsa il lato precedente e addebita il nuovo', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await setup(env, db, { perVoter: 5, maxPerMatch: 3 })

    const first = await vote(env, fixture.alice, fixture.phaseId, fixture.matchIds[0]!, {
      side: 'a',
      credits: 2,
    })
    expect(first.status).toBe(200)

    const second = await vote(env, fixture.alice, fixture.phaseId, fixture.matchIds[0]!, {
      side: 'b',
      credits: 3,
    })
    expect(second.status).toBe(200)
    expect(((await second.json()) as { balance: number }).balance).toBe(2)

    const ledger = db
      .prepare(
        'SELECT amount, reason FROM credit_entries WHERE phase_id = ? AND voter_id = ? ORDER BY created_at, reason DESC',
      )
      .all(fixture.phaseId, 'u1') as Array<{ amount: number; reason: string }>
    expect(ledger.map((row) => [row.reason, row.amount]).sort()).toEqual([
      ['refund', 2],
      ['spend', -2],
      ['spend', -3],
    ])

    const saved = db
      .prepare('SELECT side, credits FROM duel_votes WHERE match_id = ? AND voter_id = ?')
      .get(fixture.matchIds[0]!, 'u1') as { side: string; credits: number }
    expect(saved).toEqual({ side: 'b', credits: 3 })
  })

  it('accetta astensione senza crediti e rifiuta crediti su astensione', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await setup(env, db, { participants: ['u1', 'u2'] })

    const rejected = await vote(env, fixture.alice, fixture.phaseId, fixture.matchIds[0]!, {
      side: 'abstain',
      credits: 1,
    })
    expect(rejected.status).toBe(422)
    expect(await rejected.json()).toEqual({ error: 'credits_on_abstain' })

    const accepted = await vote(env, fixture.alice, fixture.phaseId, fixture.matchIds[0]!, {
      side: 'abstain',
      credits: 0,
    })
    expect(accepted.status).toBe(200)
    expect(((await accepted.json()) as { balance: number }).balance).toBe(5)
    expect(
      count(
        db,
        "SELECT COUNT(*) AS count FROM credit_entries WHERE phase_id = ? AND voter_id = ?",
        fixture.phaseId,
        'u1',
      ),
    ).toBe(0)

    // Bob rompe il pareggio: l'astensione di Alice non deve aggiungere peso.
    const bobVote = await vote(env, fixture.bob, fixture.phaseId, fixture.matchIds[0]!, {
      side: 'a',
      credits: 0,
    })
    expect(bobVote.status).toBe(200)

    const closed = await call(env, `/api/phases/${fixture.phaseId}/close`, fixture.alice, {
      method: 'POST',
    })
    const result = (await closed.json()) as {
      result: { results: { matches: Array<{ sideA: { weight: number; voters: number }; sideB: { weight: number } }> } }
    }
    expect(result.result.results.matches[0]!.sideA.weight).toBe(1)
    expect(result.result.results.matches[0]!.sideA.voters).toBe(1)
    expect(result.result.results.matches[0]!.sideB.weight).toBe(0)
  })

  it('rifiuta il voto su una fase chiusa con 409', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await setup(env, db)
    const closed = await call(env, `/api/phases/${fixture.phaseId}/close`, fixture.alice, {
      method: 'POST',
    })
    expect(closed.status).toBe(200)

    const response = await vote(env, fixture.alice, fixture.phaseId, fixture.matchIds[0]!, {
      side: 'a',
      credits: 0,
    })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'phase_not_open' })
  })

  it('rifiuta il voto su una sfida chiusa con 409', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await setup(env, db)
    db.prepare("UPDATE matches SET status = 'closed' WHERE id = ?").run(fixture.matchIds[0]!)

    const response = await vote(env, fixture.alice, fixture.phaseId, fixture.matchIds[0]!, {
      side: 'a',
      credits: 0,
    })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'match_not_open' })
  })

  it('è idempotente per voto uguale e registra un evento per ogni modifica', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await setup(env, db, { perVoter: 10, maxPerMatch: null })

    await vote(env, fixture.alice, fixture.phaseId, fixture.matchIds[0]!, {
      side: 'a',
      credits: 1,
    })
    await vote(env, fixture.alice, fixture.phaseId, fixture.matchIds[0]!, {
      side: 'a',
      credits: 1,
    })
    expect(
      count(db, 'SELECT COUNT(*) AS count FROM vote_events WHERE phase_id = ?', fixture.phaseId),
    ).toBe(1)
    expect(
      count(db, 'SELECT COUNT(*) AS count FROM credit_entries WHERE phase_id = ?', fixture.phaseId),
    ).toBe(1)

    await vote(env, fixture.alice, fixture.phaseId, fixture.matchIds[0]!, {
      side: 'a',
      credits: 2,
    })
    expect(
      count(db, 'SELECT COUNT(*) AS count FROM vote_events WHERE phase_id = ?', fixture.phaseId),
    ).toBe(2)
    expect(
      count(
        db,
        "SELECT COUNT(*) AS count FROM credit_entries WHERE phase_id = ? AND reason = 'refund'",
        fixture.phaseId,
      ),
    ).toBe(1)
  })

  it('DELETE rimuove il voto e rimborsa i crediti', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await setup(env, db, { perVoter: 5, maxPerMatch: 2 })
    await vote(env, fixture.alice, fixture.phaseId, fixture.matchIds[0]!, {
      side: 'a',
      credits: 2,
    })

    const response = await call(
      env,
      `/api/phases/${fixture.phaseId}/duels/${fixture.matchIds[0]!}/votes`,
      fixture.alice,
      { method: 'DELETE' },
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      balance: number
      matches: Array<{ vote: unknown }>
    }
    expect(body.balance).toBe(5)
    expect(body.matches[0]!.vote).toBeNull()
    expect(
      count(db, 'SELECT COUNT(*) AS count FROM duel_votes WHERE match_id = ?', fixture.matchIds[0]!),
    ).toBe(0)
    expect(
      count(
        db,
        "SELECT COUNT(*) AS count FROM credit_entries WHERE phase_id = ? AND reason = 'refund' AND amount = 2",
        fixture.phaseId,
      ),
    ).toBe(1)
  })

  it('il saldo tra più sfide non può scendere sotto zero', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await setup(env, db, {
      elementCount: 4,
      perVoter: 3,
      maxPerMatch: 2,
    })
    expect(fixture.matchIds).toHaveLength(2)

    const first = await vote(env, fixture.alice, fixture.phaseId, fixture.matchIds[0]!, {
      side: 'a',
      credits: 2,
    })
    expect(first.status).toBe(200)

    const second = await vote(env, fixture.alice, fixture.phaseId, fixture.matchIds[1]!, {
      side: 'a',
      credits: 2,
    })
    expect(second.status).toBe(422)
    expect(await second.json()).toEqual({ error: 'credits_exceeded' })
  })

  it('rifiuta crediti negativi o non interi', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await setup(env, db)

    for (const credits of [-1, 1.5]) {
      const response = await vote(env, fixture.alice, fixture.phaseId, fixture.matchIds[0]!, {
        side: 'a',
        credits,
      })
      expect(response.status).toBe(422)
      expect(await response.json()).toEqual({ error: 'invalid_vote' })
    }
  })

  it('autorizza solo i votanti fotografati nella fase', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await setup(env, db, { participants: ['u2'] })

    const ballot = await call(env, `/api/phases/${fixture.phaseId}/ballot`, fixture.alice)
    expect(ballot.status).toBe(403)

    const response = await vote(env, fixture.alice, fixture.phaseId, fixture.matchIds[0]!, {
      side: 'a',
      credits: 0,
    })
    expect(response.status).toBe(403)
  })
})

describe('GET /api/phases/:id/ballot', () => {
  it('restituisce sfide, elementi, proprio voto e completamento', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await setup(env, db, { participants: ['u1', 'u2'], perVoter: 5, maxPerMatch: 2 })

    const first = await call(env, `/api/phases/${fixture.phaseId}/ballot`, fixture.alice)
    expect(first.status).toBe(200)
    const empty = (await first.json()) as {
      budget: number
      maxPerMatch: number
      balance: number
      completion: { voted: number; total: number }
      matches: Array<{
        sideA: { name: string; imageUrl: string; videoUrl: string | null } | null
        sideB: { name: string } | null
        vote: unknown
      }>
    }
    expect(empty.budget).toBe(5)
    expect(empty.maxPerMatch).toBe(2)
    expect(empty.balance).toBe(5)
    expect(empty.completion).toEqual({ voted: 0, total: 1 })
    expect(empty.matches[0]!.sideA!.name).toBe(fixture.elements[0]!.name)
    expect(empty.matches[0]!.sideA!.imageUrl).toContain('e1.jpg')
    expect(empty.matches[0]!.sideA!.videoUrl).toContain('youtube.com')
    expect(empty.matches[0]!.vote).toBeNull()

    await vote(env, fixture.alice, fixture.phaseId, fixture.matchIds[0]!, {
      side: 'b',
      credits: 2,
    })

    const second = await call(env, `/api/phases/${fixture.phaseId}/ballot`, fixture.alice)
    const ballot = (await second.json()) as {
      balance: number
      completion: { voted: number; total: number }
      matches: Array<{ vote: { side: string; credits: number } | null }>
    }
    expect(ballot.balance).toBe(3)
    expect(ballot.completion).toEqual({ voted: 1, total: 1 })
    expect(ballot.matches[0]!.vote).toEqual({ side: 'b', credits: 2 })
  })
})
