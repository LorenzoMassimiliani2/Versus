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

function seedElements(
  db: DatabaseSync,
  tournamentId: string,
  count: number,
  owners: Record<string, string> = {},
): string[] {
  const ids: string[] = []
  for (let index = 0; index < count; index += 1) {
    const id = `e${index + 1}`
    db.prepare(
      `INSERT INTO elements (id, tournament_id, user_id, name, image_url, custom_values, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, '{}', ?, ?, ?)`,
    ).run(
      id,
      tournamentId,
      owners[id] ?? null,
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

function setSettings(db: DatabaseSync, tournamentId: string, settings: object): void {
  db.prepare('UPDATE tournaments SET settings = ? WHERE id = ?').run(
    JSON.stringify(settings),
    tournamentId,
  )
}

async function openPhase(env: Env, token: string, phaseId: string): Promise<void> {
  const response = await call(env, `/api/phases/${phaseId}/open`, token, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  expect(response.status).toBe(200)
}

function matchIds(db: DatabaseSync, phaseId: string): string[] {
  return (
    db
      .prepare('SELECT id FROM matches WHERE phase_id = ? ORDER BY round, position')
      .all(phaseId) as Array<{ id: string }>
  ).map((row) => row.id)
}

function groupIds(db: DatabaseSync, phaseId: string): string[] {
  return (
    db
      .prepare('SELECT id FROM groups WHERE phase_id = ? ORDER BY position')
      .all(phaseId) as Array<{ id: string }>
  ).map((row) => row.id)
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

function advance(
  env: Env,
  token: string,
  phaseId: string,
  body: Record<string, unknown> = {},
): Promise<Response> {
  return call(env, `/api/phases/${phaseId}/targets/advance`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

function count(db: DatabaseSync, sql: string, ...params: string[]): number {
  return (db.prepare(sql).get(...params) as { count: number }).count
}

interface BaseFixture {
  alice: string
  bob: string
  tournamentId: string
}

async function base(
  env: Env,
  db: DatabaseSync,
  options: { participants?: string[]; ownerOf?: Record<string, string> } = {},
): Promise<BaseFixture> {
  await seedUser(db, 'u1', 'alice')
  await seedUser(db, 'u2', 'bob')
  const alice = await login(env, 'alice')
  const bob = await login(env, 'bob')
  const tournamentId = await createTournament(env, alice)
  seedElements(db, tournamentId, 4, options.ownerOf)
  seedParticipants(db, tournamentId, options.participants ?? ['u1', 'u2'])
  return { alice, bob, tournamentId }
}

const sequential = { votingMode: 'sequential' as const }

interface BallotBody {
  votingMode: 'simultaneous' | 'sequential'
  progress: {
    currentTargetId: string | null
    targets: Array<{
      id: string
      name: string
      position: number
      status: 'pending' | 'open' | 'completed'
      voted: boolean
    }>
  } | null
  completion: { voted: number; total: number }
  matches: Array<{ id: string; status: string }>
  targets: Array<{ id: string; status?: string }>
}

describe('modalita simultanea', () => {
  it('lascia tutte le sfide votabili', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await base(env, db)
    const phaseId = await createPhase(env, fixture.alice, fixture.tournamentId, {
      name: 'Semifinali',
      formula: 'elimination',
      voteType: 'duel',
      config: { elimination: { seeding: 'ranking' }, credits: { perVoter: 0, maxPerMatch: null } },
      advance: { type: 'winners' },
    })
    publish(db, fixture.tournamentId)
    await openPhase(env, fixture.alice, phaseId)

    const ids = matchIds(db, phaseId)
    expect(ids).toHaveLength(2)
    expect(
      count(db, "SELECT COUNT(*) AS count FROM matches WHERE phase_id = ? AND status = 'open'", phaseId),
    ).toBe(2)
    expect(count(db, 'SELECT COUNT(*) AS count FROM phase_targets WHERE phase_id = ?', phaseId)).toBe(0)

    for (const matchId of ids) {
      const response = await vote(env, fixture.alice, phaseId, matchId, { side: 'a', credits: 0 })
      expect(response.status).toBe(200)
    }
  })
})

describe('modalita sequenziale su duelli', () => {
  it('apre una sfida alla volta e passa alla successiva quando tutti hanno votato', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await base(env, db)
    const phaseId = await createPhase(env, fixture.alice, fixture.tournamentId, {
      name: 'Semifinali',
      formula: 'elimination',
      voteType: 'duel',
      config: {
        ...sequential,
        elimination: { seeding: 'ranking' },
        credits: { perVoter: 0, maxPerMatch: null },
      },
      advance: { type: 'winners' },
    })
    publish(db, fixture.tournamentId)
    await openPhase(env, fixture.alice, phaseId)

    const [first, second] = matchIds(db, phaseId) as [string, string]
    expect(
      db.prepare('SELECT status FROM matches WHERE id = ?').get(first),
    ).toEqual({ status: 'open' })
    expect(
      db.prepare('SELECT status FROM matches WHERE id = ?').get(second),
    ).toEqual({ status: 'pending' })

    const rejected = await vote(env, fixture.alice, phaseId, second, { side: 'a', credits: 0 })
    expect(rejected.status).toBe(409)

    expect((await vote(env, fixture.alice, phaseId, first, { side: 'a', credits: 0 })).status).toBe(200)
    expect(
      db.prepare('SELECT status FROM matches WHERE id = ?').get(second),
    ).toEqual({ status: 'pending' })

    const completing = await vote(env, fixture.bob, phaseId, first, { side: 'abstain', credits: 0 })
    expect(completing.status).toBe(200)
    expect(
      db.prepare('SELECT status FROM matches WHERE id = ?').get(first),
    ).toEqual({ status: 'closed' })
    expect(
      db.prepare('SELECT status FROM matches WHERE id = ?').get(second),
    ).toEqual({ status: 'open' })

    const ballotBody = (await (
      await call(env, `/api/phases/${phaseId}/ballot`, fixture.alice)
    ).json()) as BallotBody
    expect(ballotBody.votingMode).toBe('sequential')
    expect(ballotBody.progress?.currentTargetId).toBe(second)
    expect(ballotBody.progress?.targets.map((target) => target.status)).toEqual([
      'completed',
      'open',
    ])
    expect(ballotBody.progress?.targets[0]!.voted).toBe(true)

    expect((await vote(env, fixture.alice, phaseId, second, { side: 'a', credits: 0 })).status).toBe(200)
    expect((await vote(env, fixture.bob, phaseId, second, { side: 'b', credits: 0 })).status).toBe(200)

    const done = (await (
      await call(env, `/api/phases/${phaseId}/ballot`, fixture.alice)
    ).json()) as BallotBody
    expect(done.progress?.currentTargetId).toBeNull()
    expect(done.progress?.targets.every((target) => target.status === 'completed')).toBe(true)
    expect(done.completion).toEqual({ voted: 2, total: 2 })
  })

  it('consente di modificare ed eliminare il voto finche il target e aperto', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await base(env, db)
    const phaseId = await createPhase(env, fixture.alice, fixture.tournamentId, {
      name: 'Semifinali',
      formula: 'elimination',
      voteType: 'duel',
      config: {
        ...sequential,
        elimination: { seeding: 'ranking' },
        credits: { perVoter: 0, maxPerMatch: null },
      },
      advance: { type: 'winners' },
    })
    publish(db, fixture.tournamentId)
    await openPhase(env, fixture.alice, phaseId)

    const [first] = matchIds(db, phaseId) as [string]
    expect((await vote(env, fixture.alice, phaseId, first, { side: 'a', credits: 0 })).status).toBe(200)
    expect((await vote(env, fixture.alice, phaseId, first, { side: 'b', credits: 0 })).status).toBe(200)
    expect(
      db.prepare('SELECT side FROM duel_votes WHERE match_id = ? AND voter_id = ?').get(first, 'u1'),
    ).toEqual({ side: 'b' })

    expect((await vote(env, fixture.bob, phaseId, first, { side: 'a', credits: 0 })).status).toBe(200)

    const modify = await vote(env, fixture.alice, phaseId, first, { side: 'a', credits: 0 })
    expect(modify.status).toBe(409)
    const remove = await call(env, `/api/phases/${phaseId}/duels/${first}/votes`, fixture.alice, {
      method: 'DELETE',
    })
    expect(remove.status).toBe(409)
  })
})

describe('modalita sequenziale sui gironi', () => {
  async function groupFixture(env: Env, db: DatabaseSync): Promise<{
    alice: string
    bob: string
    phaseId: string
    groups: string[]
  }> {
    const fixture = await base(env, db)
    const phaseId = await createPhase(env, fixture.alice, fixture.tournamentId, {
      name: 'Gironi',
      formula: 'group',
      voteType: 'ranking',
      config: {
        ...sequential,
        groups: { size: 2, assignment: 'manual', remainder: 'smaller_groups' },
        ranking: { points: [3, 2, 1], minSelections: 1 },
        credits: { perVoter: 0, maxPerMatch: null },
      },
      advance: { type: 'all' },
    })
    publish(db, fixture.tournamentId)
    await openPhase(env, fixture.alice, phaseId)
    return { alice: fixture.alice, bob: fixture.bob, phaseId, groups: groupIds(db, phaseId) }
  }

  it('apre un girone alla volta e sblocca il successivo al completamento', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await groupFixture(env, db)
    const [firstGroup, secondGroup] = fixture.groups as [string, string]

    const initial = (await (
      await call(env, `/api/phases/${fixture.phaseId}/ballot`, fixture.alice)
    ).json()) as BallotBody
    expect(initial.targets.map((target) => target.status)).toEqual(['open', 'pending'])
    expect(initial.progress?.currentTargetId).toBe(firstGroup)

    const rejected = await ballot(env, fixture.alice, fixture.phaseId, secondGroup, 'ranking', {
      assignments: [{ elementId: 'e3', points: 3 }],
    })
    expect(rejected.status).toBe(409)
    expect(await rejected.json()).toEqual({ error: 'target_not_open' })

    expect(
      (
        await ballot(env, fixture.alice, fixture.phaseId, firstGroup, 'ranking', {
          assignments: [{ elementId: 'e1', points: 3 }],
        })
      ).status,
    ).toBe(200)
    expect(
      (
        await ballot(env, fixture.bob, fixture.phaseId, firstGroup, 'ranking', {
          assignments: [{ elementId: 'e2', points: 3 }],
        })
      ).status,
    ).toBe(200)

    const afterFirst = (await (
      await call(env, `/api/phases/${fixture.phaseId}/ballot`, fixture.bob)
    ).json()) as BallotBody
    expect(afterFirst.targets.map((target) => target.status)).toEqual(['completed', 'open'])
    expect(afterFirst.progress?.currentTargetId).toBe(secondGroup)

    for (const [token, elementId] of [
      [fixture.alice, 'e3'],
      [fixture.bob, 'e4'],
    ] as const) {
      const response = await ballot(env, token, fixture.phaseId, secondGroup, 'ranking', {
        assignments: [{ elementId, points: 3 }],
      })
      expect(response.status).toBe(200)
    }

    const done = (await (
      await call(env, `/api/phases/${fixture.phaseId}/ballot`, fixture.alice)
    ).json()) as BallotBody
    expect(done.progress?.currentTargetId).toBeNull()
    expect(done.progress?.targets.every((target) => target.status === 'completed')).toBe(true)
  })
})

describe('passaggio forzato', () => {
  async function sequentialFixture(env: Env, db: DatabaseSync): Promise<{
    alice: string
    bob: string
    phaseId: string
    matches: string[]
  }> {
    const fixture = await base(env, db)
    const phaseId = await createPhase(env, fixture.alice, fixture.tournamentId, {
      name: 'Semifinali',
      formula: 'elimination',
      voteType: 'duel',
      config: {
        ...sequential,
        elimination: { seeding: 'ranking' },
        credits: { perVoter: 0, maxPerMatch: null },
      },
      advance: { type: 'winners' },
    })
    publish(db, fixture.tournamentId)
    await openPhase(env, fixture.alice, phaseId)
    return { alice: fixture.alice, bob: fixture.bob, phaseId, matches: matchIds(db, phaseId) }
  }

  it('l organizzatore forza il target e l azione finisce in audit_log', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await sequentialFixture(env, db)
    const [first, second] = fixture.matches as [string, string]

    const response = await advance(env, fixture.alice, fixture.phaseId, { targetId: first })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      advanced: true,
      targetId: first,
      nextTargetId: second,
    })
    expect(db.prepare('SELECT status FROM matches WHERE id = ?').get(second)).toEqual({
      status: 'open',
    })
    const audit = db
      .prepare("SELECT action, actor_id, target_id FROM audit_log WHERE action = 'phase.target_advance'")
      .all() as Array<{ action: string; actor_id: string; target_id: string }>
    expect(audit).toEqual([
      { action: 'phase.target_advance', actor_id: 'u1', target_id: first },
    ])

    const repeated = await advance(env, fixture.alice, fixture.phaseId, { targetId: first })
    expect(repeated.status).toBe(200)
    expect(await repeated.json()).toEqual({
      advanced: false,
      targetId: first,
      nextTargetId: second,
    })
    expect(count(db, "SELECT COUNT(*) AS count FROM audit_log WHERE action = 'phase.target_advance'")).toBe(1)
    expect(db.prepare('SELECT status FROM matches WHERE id = ?').get(second)).toEqual({
      status: 'open',
    })
  })

  it('rifiuta chi non organizza e i target non ancora aperti', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await sequentialFixture(env, db)
    const [, second] = fixture.matches as [string, string]

    const forbidden = await advance(env, fixture.bob, fixture.phaseId, {})
    expect(forbidden.status).toBe(403)

    const pending = await advance(env, fixture.alice, fixture.phaseId, { targetId: second })
    expect(pending.status).toBe(409)
    expect(await pending.json()).toEqual({ error: 'target_not_open' })
  })
})

describe('auto-voto disattivato', () => {
  it('rifiuta con 422 il voto su un elemento collegato al votante nei duelli', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await base(env, db, { ownerOf: { e1: 'u1' } })
    setSettings(db, fixture.tournamentId, { selfVoteAllowed: false, autoAdvance: false })
    const phaseId = await createPhase(env, fixture.alice, fixture.tournamentId, {
      name: 'Finale',
      formula: 'elimination',
      voteType: 'duel',
      config: { elimination: { seeding: 'ranking' }, credits: { perVoter: 0, maxPerMatch: null } },
      advance: { type: 'winner' },
    })
    publish(db, fixture.tournamentId)
    await openPhase(env, fixture.alice, phaseId)

    const ids = matchIds(db, phaseId)
    const matchId = ids[0]!
    const match = db.prepare('SELECT element_a_id, element_b_id FROM matches WHERE id = ?').get(matchId) as {
      element_a_id: string
      element_b_id: string
    }
    const ownSide = match.element_a_id === 'e1' ? 'a' : 'b'
    const otherSide = ownSide === 'a' ? 'b' : 'a'

    const rejected = await vote(env, fixture.alice, phaseId, matchId, {
      side: ownSide,
      credits: 0,
    })
    expect(rejected.status).toBe(422)
    expect(await rejected.json()).toEqual({ error: 'self_vote_forbidden' })
    expect(count(db, 'SELECT COUNT(*) AS count FROM duel_votes')).toBe(0)

    const accepted = await vote(env, fixture.alice, phaseId, matchId, {
      side: otherSide,
      credits: 0,
    })
    expect(accepted.status).toBe(200)

    const other = await vote(env, fixture.bob, phaseId, matchId, { side: ownSide, credits: 0 })
    expect(other.status).toBe(200)
  })

  it('rifiuta con 422 le schede che assegnano punti o pick al proprio elemento', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await base(env, db, { ownerOf: { e1: 'u1' } })
    setSettings(db, fixture.tournamentId, { selfVoteAllowed: false, autoAdvance: false })
    const phaseId = await createPhase(env, fixture.alice, fixture.tournamentId, {
      name: 'Finale classifica',
      formula: 'ranking',
      voteType: 'ranking',
      config: { ranking: { points: [5, 3, 1], minSelections: 1 }, credits: { perVoter: 0, maxPerMatch: null } },
      advance: { type: 'all' },
    })
    publish(db, fixture.tournamentId)
    await openPhase(env, fixture.alice, phaseId)

    const rejected = await ballot(env, fixture.alice, phaseId, phaseId, 'ranking', {
      assignments: [{ elementId: 'e1', points: 5 }],
    })
    expect(rejected.status).toBe(422)
    expect(await rejected.json()).toEqual({ error: 'self_vote_forbidden' })
    expect(count(db, 'SELECT COUNT(*) AS count FROM ballot_votes')).toBe(0)

    const accepted = await ballot(env, fixture.alice, phaseId, phaseId, 'ranking', {
      assignments: [{ elementId: 'e2', points: 5 }],
    })
    expect(accepted.status).toBe(200)

  })

  it('rifiuta con 422 una scelta pick sul proprio elemento', async () => {
    const { db, env } = createTestEnvironment()
    const fixture = await base(env, db, { ownerOf: { e1: 'u1' } })
    setSettings(db, fixture.tournamentId, { selfVoteAllowed: false, autoAdvance: false })
    const phaseId = await createPhase(env, fixture.alice, fixture.tournamentId, {
      name: 'Scelta finale',
      formula: 'ranking',
      voteType: 'pick',
      config: { credits: { perVoter: 0, maxPerMatch: null } },
      advance: { type: 'all' },
    })
    publish(db, fixture.tournamentId)
    await openPhase(env, fixture.alice, phaseId)

    const rejected = await ballot(env, fixture.alice, phaseId, phaseId, 'pick', { elementId: 'e1' })
    expect(rejected.status).toBe(422)
    expect(await rejected.json()).toEqual({ error: 'self_vote_forbidden' })
    expect(count(db, 'SELECT COUNT(*) AS count FROM ballot_votes')).toBe(0)

    const accepted = await ballot(env, fixture.alice, phaseId, phaseId, 'pick', { elementId: 'e2' })
    expect(accepted.status).toBe(200)
  })
})
