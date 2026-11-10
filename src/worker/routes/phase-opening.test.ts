import type { DatabaseSync } from 'node:sqlite'

import { describe, expect, it } from 'vitest'

import worker from '../index'
import { createTestEnvironment } from '../../test/d1'
import { hashPassword } from '../auth/password'

const ORIGIN = 'https://versus.test'
const NOW = '2026-11-10T10:00:00.000Z'

interface ElementSeed {
  id: string
  name: string
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
): ElementSeed[] {
  const elements: ElementSeed[] = []
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
    elements.push({ id, name: `Elemento ${index + 1}` })
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

async function baseTournament(
  env: Env,
  db: DatabaseSync,
  elementCount: number,
  participantIds: string[],
): Promise<{ alice: string; tournamentId: string; elements: ElementSeed[] }> {
  await seedUser(db, 'u1', 'alice')
  for (const id of participantIds) {
    if (id !== 'u1') await seedUser(db, id, id)
  }
  const alice = await login(env, 'alice')
  const tournamentId = await createTournament(env, alice)
  const elements = seedElements(db, tournamentId, elementCount)
  seedParticipants(db, tournamentId, participantIds)
  return { alice, tournamentId, elements }
}

function count(db: DatabaseSync, sql: string, ...params: string[]): number {
  return (db.prepare(sql).get(...params) as { count: number }).count
}

describe('POST /api/phases/:id/open', () => {
  it('apre la prima fase, crea gironi, sfide e snapshot votanti e porta il torneo in running', async () => {
    const { db, env } = createTestEnvironment()
    const { alice, tournamentId, elements } = await baseTournament(env, db, 8, ['u1', 'u2', 'u3'])
    const phase = await createPhase(env, alice, tournamentId, {
      name: 'Gironi',
      formula: 'group',
      voteType: 'duel',
      config: { groups: { size: 4 }, credits: { perVoter: 5, maxPerMatch: null } },
      advance: { type: 'top_per_group', n: 2 },
    })
    publish(db, tournamentId)

    const response = await call(env, `/api/phases/${phase.id}/open`, alice, {
      method: 'POST',
      body: JSON.stringify({}),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      phase: { status: string; openedAt: string | null }
      operation: {
        entrants: Array<{ elementId: string; seed: number }>
        voters: Array<{ userId: string; creditsBudget: number }>
        groups: Array<{ name: string; members: Array<{ elementId: string }> }>
        matches: Array<{ status: string; groupId: string | null }>
      }
    }
    expect(body.phase.status).toBe('open')
    expect(body.phase.openedAt).not.toBeNull()
    expect(body.operation.groups).toHaveLength(2)
    expect(body.operation.groups.every((group) => group.members.length === 4)).toBe(true)
    expect(body.operation.matches).toHaveLength(12)
    expect(body.operation.matches.every((match) => match.status === 'open')).toBe(true)
    expect(body.operation.voters).toHaveLength(3)
    expect(body.operation.voters.every((voter) => voter.creditsBudget === 5)).toBe(true)
    expect(body.operation.entrants.map((entrant) => entrant.elementId).sort()).toEqual(
      elements.map((element) => element.id).sort(),
    )

    const tournament = db.prepare('SELECT status, started_at FROM tournaments WHERE id = ?').get(
      tournamentId,
    ) as { status: string; started_at: string | null }
    expect(tournament.status).toBe('running')
    expect(tournament.started_at).not.toBeNull()

    expect(count(db, 'SELECT COUNT(*) AS count FROM groups WHERE phase_id = ?', phase.id)).toBe(2)
    expect(
      count(
        db,
        `SELECT COUNT(*) AS count FROM group_members gm
         JOIN groups g ON g.id = gm.group_id WHERE g.phase_id = ?`,
        phase.id,
      ),
    ).toBe(8)
    expect(count(db, 'SELECT COUNT(*) AS count FROM matches WHERE phase_id = ?', phase.id)).toBe(12)
    expect(
      count(db, 'SELECT COUNT(*) AS count FROM phase_entrants WHERE phase_id = ?', phase.id),
    ).toBe(8)
    expect(
      count(db, 'SELECT COUNT(*) AS count FROM phase_voters WHERE phase_id = ?', phase.id),
    ).toBe(3)
  })

  it('crea il tabellone con bye chiusi automaticamente', async () => {
    const { db, env } = createTestEnvironment()
    const { alice, tournamentId } = await baseTournament(env, db, 12, ['u1', 'u2'])
    const phase = await createPhase(env, alice, tournamentId, {
      name: 'Sedicesimi',
      formula: 'elimination',
      voteType: 'duel',
      config: { elimination: { seeding: 'ranking' } },
      advance: { type: 'winners' },
    })
    publish(db, tournamentId)

    const response = await call(env, `/api/phases/${phase.id}/open`, alice, {
      method: 'POST',
      body: JSON.stringify({}),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      operation: { matches: Array<{ status: string; winnerElementId: string | null }> }
    }
    const byes = body.operation.matches.filter((match) => match.status === 'bye')
    const open = body.operation.matches.filter((match) => match.status === 'open')
    expect(body.operation.matches).toHaveLength(8)
    expect(open).toHaveLength(4)
    expect(byes).toHaveLength(4)
    expect(byes.every((match) => match.winnerElementId !== null)).toBe(true)

    const closedAt = db
      .prepare("SELECT COUNT(*) AS count FROM matches WHERE phase_id = ? AND status = 'bye' AND closed_at IS NOT NULL")
      .get(phase.id) as { count: number }
    expect(closedAt.count).toBe(4)
  })

  it('rifiuta una fase non pending con 409', async () => {
    const { db, env } = createTestEnvironment()
    const { alice, tournamentId } = await baseTournament(env, db, 4, ['u1'])
    const phase = await createPhase(env, alice, tournamentId, {
      name: 'Gironi',
      formula: 'group',
      voteType: 'ranking',
      config: {},
      advance: { type: 'top_per_group', n: 1 },
    })
    publish(db, tournamentId)

    const first = await call(env, `/api/phases/${phase.id}/open`, alice, { method: 'POST' })
    expect(first.status).toBe(200)

    const second = await call(env, `/api/phases/${phase.id}/open`, alice, { method: 'POST' })
    expect(second.status).toBe(409)
    expect(await second.json()).toEqual({ error: 'phase_not_pending' })
  })

  it('rifiuta con 409 se la fase precedente non è chiusa', async () => {
    const { db, env } = createTestEnvironment()
    const { alice, tournamentId } = await baseTournament(env, db, 4, ['u1'])
    await createPhase(env, alice, tournamentId, {
      name: 'Prima',
      formula: 'group',
      voteType: 'ranking',
      config: {},
      advance: { type: 'all' },
    })
    const second = await createPhase(env, alice, tournamentId, {
      name: 'Seconda',
      formula: 'ranking',
      voteType: 'ranking',
      config: {},
      advance: { type: 'top_global', n: 1 },
    })
    publish(db, tournamentId)

    const response = await call(env, `/api/phases/${second.id}/open`, alice, { method: 'POST' })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'previous_phase_not_closed' })
  })

  it('rifiuta con 409 un torneo non pubblicato', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice)
    seedElements(db, tournamentId, 4)
    const phase = await createPhase(env, alice, tournamentId, {
      name: 'Gironi',
      formula: 'group',
      voteType: 'ranking',
      config: {},
      advance: { type: 'all' },
    })

    const response = await call(env, `/api/phases/${phase.id}/open`, alice, { method: 'POST' })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'tournament_not_openable' })
  })

  it('richiede il ruolo di organizzatore', async () => {
    const { db, env } = createTestEnvironment()
    const { tournamentId } = await baseTournament(env, db, 4, ['u1', 'u2'])
    await seedUser(db, 'u9', 'estraneo')
    const alice = await login(env, 'alice')
    const stranger = await login(env, 'estraneo')
    const phase = await createPhase(env, alice, tournamentId, {
      name: 'Gironi',
      formula: 'group',
      voteType: 'ranking',
      config: {},
      advance: { type: 'all' },
    })
    publish(db, tournamentId)

    const response = await call(env, `/api/phases/${phase.id}/open`, stranger, {
      method: 'POST',
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'forbidden' })
  })

  it('risponde 404 per una fase inesistente', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')

    const response = await call(env, '/api/phases/inesistente/open', alice, { method: 'POST' })

    expect(response.status).toBe(404)
  })

  it('apre una sola volta con due richieste concorrenti', async () => {
    const { db, env } = createTestEnvironment()
    const { alice, tournamentId } = await baseTournament(env, db, 4, ['u1'])
    const phase = await createPhase(env, alice, tournamentId, {
      name: 'Gironi',
      formula: 'group',
      voteType: 'duel',
      config: { groups: { size: 2 } },
      advance: { type: 'all' },
    })
    publish(db, tournamentId)

    const responses = await Promise.all([
      call(env, `/api/phases/${phase.id}/open`, alice, { method: 'POST' }),
      call(env, `/api/phases/${phase.id}/open`, alice, { method: 'POST' }),
    ])

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409])
    expect(count(db, 'SELECT COUNT(*) AS count FROM groups WHERE phase_id = ?', phase.id)).toBe(2)
    expect(
      count(db, 'SELECT COUNT(*) AS count FROM phase_entrants WHERE phase_id = ?', phase.id),
    ).toBe(4)
    expect(count(db, 'SELECT COUNT(*) AS count FROM matches WHERE phase_id = ?', phase.id)).toBe(2)
  })
})

function seedClosedRepechagePhase(
  db: DatabaseSync,
  tournamentId: string,
  elements: ElementSeed[],
): string {
  const phaseId = 'prev'
  db.prepare(
    `INSERT INTO phases (id, tournament_id, position, name, formula, vote_type, config, advance,
       status, opened_at, closed_at, created_at, updated_at)
     VALUES (?, ?, 1, 'Gironi', 'group', 'ranking', ?, ?, 'closed', ?, ?, ?, ?)`,
  ).run(
    phaseId,
    tournamentId,
    JSON.stringify({
      deadline: null,
      closeTriggers: [],
      secrecy: 'live',
      votingMode: 'simultaneous',
      credits: { perVoter: 0, maxPerMatch: null },
      groups: {
        size: 4,
        assignment: 'random',
        remainder: 'smaller_groups',
        points: [3, 2, 1],
        standings: { win: 3, draw: 1, loss: 0 },
      },
    }),
    JSON.stringify({
      type: 'top_per_group',
      n: 2,
      repechage: { targetSize: 6, criteria: ['group_points'] },
    }),
    NOW,
    NOW,
    NOW,
    NOW,
  )

  elements.forEach((element, index) => {
    db.prepare(
      'INSERT INTO phase_entrants (phase_id, element_id, seed, position) VALUES (?, ?, ?, ?)',
    ).run(phaseId, element.id, index + 1, index + 1)
  })

  const scores = [20, 18, 16, 14, 12, 10, 8, 6]
  const ranking = elements.map((element, index) => ({
    elementId: element.id,
    score: scores[index],
    firstPreferences: 0,
    tieBreak: null,
  }))
  const results = {
    qualified: elements.slice(0, 4).map((element) => element.id),
    groups: [{ groupId: 'g1', ranking }],
    matches: [],
    repechage: {
      enabled: true,
      selected: [elements[4]!.id, elements[5]!.id],
      criteria: ['group_points'],
    },
    winnerElementId: null,
  }
  db.prepare(
    `INSERT INTO phase_results (id, phase_id, version, closed_at, config_snapshot, results)
     VALUES ('res1', ?, 1, ?, '{}', ?)`,
  ).run(phaseId, NOW, JSON.stringify(results))
  return phaseId
}

describe('override dei ripescati', () => {
  it('sostituisce i ripescati e traccia la modifica in audit_log', async () => {
    const { db, env } = createTestEnvironment()
    const { alice, tournamentId, elements } = await baseTournament(env, db, 8, ['u1', 'u2'])
    seedClosedRepechagePhase(db, tournamentId, elements)
    const phase = await createPhase(env, alice, tournamentId, {
      name: 'Fase finale',
      formula: 'ranking',
      voteType: 'ranking',
      config: {},
      advance: { type: 'all' },
    })
    publish(db, tournamentId)

    const preview = await call(env, `/api/phases/${phase.id}/open-preview`, alice)
    expect(preview.status).toBe(200)
    const previewBody = (await preview.json()) as {
      directQualified: Array<{ id: string }>
      repechage: { slots: number; selected: Array<{ id: string }>; excluded: Array<{ id: string }> }
    }
    expect(previewBody.directQualified.map((entry) => entry.id)).toEqual([
      'e1',
      'e2',
      'e3',
      'e4',
    ])
    expect(previewBody.repechage.slots).toBe(2)
    expect(previewBody.repechage.selected.map((entry) => entry.id)).toEqual(['e5', 'e6'])
    expect(previewBody.repechage.excluded.map((entry) => entry.id)).toEqual([
      'e5',
      'e6',
      'e7',
      'e8',
    ])

    const response = await call(env, `/api/phases/${phase.id}/open`, alice, {
      method: 'POST',
      body: JSON.stringify({ repechageOverride: ['e7', 'e8'] }),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      operation: { entrants: Array<{ elementId: string }> }
    }
    expect(body.operation.entrants.map((entrant) => entrant.elementId)).toEqual([
      'e1',
      'e2',
      'e3',
      'e4',
      'e7',
      'e8',
    ])

    const audit = db
      .prepare(
        `SELECT tournament_id, actor_id, action, target_type, target_id, before, after
         FROM audit_log WHERE action = 'phase.repechage_override'`,
      )
      .get() as {
      tournament_id: string
      actor_id: string
      action: string
      target_type: string
      target_id: string
      before: string
      after: string
    }
    expect(audit).toMatchObject({
      tournament_id: tournamentId,
      actor_id: 'u1',
      target_type: 'phase',
      target_id: phase.id,
    })
    expect(JSON.parse(audit.before)).toEqual(['e5', 'e6'])
    expect(JSON.parse(audit.after)).toEqual(['e7', 'e8'])
  })

  it('rifiuta un override con elementi non esclusi o numero errato', async () => {
    const { db, env } = createTestEnvironment()
    const { alice, tournamentId, elements } = await baseTournament(env, db, 8, ['u1'])
    seedClosedRepechagePhase(db, tournamentId, elements)
    const phase = await createPhase(env, alice, tournamentId, {
      name: 'Fase finale',
      formula: 'ranking',
      voteType: 'ranking',
      config: {},
      advance: { type: 'all' },
    })
    publish(db, tournamentId)

    for (const override of [['e7'], ['e1', 'e7'], ['e7', 'e7']]) {
      const response = await call(env, `/api/phases/${phase.id}/open`, alice, {
        method: 'POST',
        body: JSON.stringify({ repechageOverride: override }),
      })
      expect(response.status).toBe(422)
      expect(await response.json()).toEqual({ error: 'invalid_repechage_override' })
    }

    expect(count(db, 'SELECT COUNT(*) AS count FROM phase_entrants WHERE phase_id = ?', phase.id)).toBe(0)
  })

  it('rifiuta l override manuale quando l avanzamento automatico è attivo', async () => {
    const { db, env } = createTestEnvironment()
    const { alice, tournamentId, elements } = await baseTournament(env, db, 8, ['u1'])
    seedClosedRepechagePhase(db, tournamentId, elements)
    const phase = await createPhase(env, alice, tournamentId, {
      name: 'Fase finale',
      formula: 'ranking',
      voteType: 'ranking',
      config: {},
      advance: { type: 'all' },
    })
    db.prepare('UPDATE tournaments SET settings = ? WHERE id = ?').run(
      JSON.stringify({ selfVoteAllowed: true, autoAdvance: true }),
      tournamentId,
    )
    publish(db, tournamentId)

    const withOverride = await call(env, `/api/phases/${phase.id}/open`, alice, {
      method: 'POST',
      body: JSON.stringify({ repechageOverride: ['e7', 'e8'] }),
    })
    expect(withOverride.status).toBe(422)
    expect(await withOverride.json()).toEqual({ error: 'repechage_override_unavailable' })

    const automatic = await call(env, `/api/phases/${phase.id}/open`, alice, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    expect(automatic.status).toBe(200)
    const body = (await automatic.json()) as {
      operation: { entrants: Array<{ elementId: string }> }
    }
    expect(body.operation.entrants.map((entrant) => entrant.elementId)).toEqual([
      'e1',
      'e2',
      'e3',
      'e4',
      'e5',
      'e6',
    ])
  })
})
