
import type { DatabaseSync } from 'node:sqlite'

import { describe, expect, it } from 'vitest'

import worker from '../index'
import { createTestEnvironment } from '../../test/d1'
import { hashPassword } from '../auth/password'

const ORIGIN = 'https://versus.test'

interface PlanIssue {
  code: string
  phase?: number
  phaseName?: string
}

interface PreviewPhase {
  position: number
  name: string
  inputCount: number
  outputCount: number
  groups: { name: string; members: { id: string; name: string }[] }[]
  byes: { id: string; name: string }[]
  matches: { a: { id: string; name: string } | null; b: { id: string; name: string } | null; bye: boolean }[]
  qualified: { direct: number; repechage: number; total: number }
  repechage: { targetSize: number; excluded: number; selected: number } | null
}

interface PreviewBody {
  valid: boolean
  errors: PlanIssue[]
  warnings: PlanIssue[]
  preview: {
    elementCount: number
    activeParticipants: number
    phases: PreviewPhase[]
  }
}

async function seedUser(db: DatabaseSync, id: string, username: string): Promise<string> {
  db.prepare(
    'INSERT INTO users (id, username, password_hash, is_admin, is_active, created_at) VALUES (?, ?, ?, 0, 1, ?)',
  ).run(id, username, await hashPassword('password123'), new Date().toISOString())
  return id
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
  return worker.fetch(
    new Request(`${ORIGIN}${path}`, { ...init, headers }),
    env,
    {} as ExecutionContext,
  )
}

async function createTournament(
  env: Env,
  token: string,
  settings: Record<string, unknown> = {},
): Promise<string> {
  const response = await call(env, '/api/tournaments', token, {
    method: 'POST',
    body: JSON.stringify({ name: 'Torneo di Prova', settings }),
  })
  expect(response.status).toBe(201)
  return ((await response.json()) as { tournament: { id: string } }).tournament.id
}

function seedElements(db: DatabaseSync, tournamentId: string, count: number): void {
  const timestamp = new Date().toISOString()
  const statement = db.prepare(
    `INSERT INTO elements (id, tournament_id, user_id, name, description, image_url, video_url,
       custom_values, position, created_at, updated_at)
     VALUES (?, ?, NULL, ?, '', ?, NULL, '{}', ?, ?, ?)`,
  )
  for (let index = 1; index <= count; index += 1) {
    statement.run(
      `e${index}`,
      tournamentId,
      `Elemento ${index}`,
      'https://images.example.test/item.jpg',
      index,
      timestamp,
      timestamp,
    )
  }
}

function seedParticipants(db: DatabaseSync, tournamentId: string, userIds: string[]): void {
  const timestamp = new Date().toISOString()
  const statement = db.prepare(
    `INSERT INTO tournament_participants (tournament_id, user_id, status, added_by, added_at, removed_at)
     VALUES (?, ?, 'active', ?, ?, NULL)`,
  )
  for (const userId of userIds) statement.run(tournamentId, userId, userId, timestamp)
}

interface SeedPhase {
  position: number
  name: string
  formula: 'group' | 'elimination' | 'ranking'
  voteType: 'duel' | 'ranking' | 'pick'
  config?: Record<string, unknown>
  advance: Record<string, unknown>
}

function config(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    deadline: null,
    closeTriggers: [],
    secrecy: 'live',
    votingMode: 'simultaneous',
    credits: { perVoter: 0, maxPerMatch: null },
    ...overrides,
  }
}

function seedPhases(db: DatabaseSync, tournamentId: string, phases: SeedPhase[]): void {
  const timestamp = new Date().toISOString()
  const statement = db.prepare(
    `INSERT INTO phases (id, tournament_id, position, name, formula, vote_type, config, advance,
       status, opened_at, closed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?)`,
  )
  for (const phase of phases) {
    statement.run(
      `p${phase.position}`,
      tournamentId,
      phase.position,
      phase.name,
      phase.formula,
      phase.voteType,
      JSON.stringify(phase.config ?? config()),
      JSON.stringify(phase.advance),
      timestamp,
      timestamp,
    )
  }
}

function canonicalPhases(deadlines: (string | null)[] = [null, null, null, null]): SeedPhase[] {
  return [
    {
      position: 1,
      name: 'Gironi',
      formula: 'group',
      voteType: 'ranking',
      config: config({
        deadline: deadlines[0],
        closeTriggers: deadlines[0] ? ['deadline'] : [],
        groups: {
          size: 4,
          assignment: 'snake',
          remainder: 'smaller_groups',
          points: [3, 2, 1],
          standings: { win: 3, draw: 1, loss: 0 },
        },
      }),
      advance: {
        type: 'top_per_group',
        n: 2,
        repechage: { targetSize: 32, criteria: ['group_points', 'draw'] },
      },
    },
    {
      position: 2,
      name: 'Sedicesimi',
      formula: 'elimination',
      voteType: 'duel',
      config: config({
        deadline: deadlines[1],
        closeTriggers: deadlines[1] ? ['deadline'] : [],
      }),
      advance: { type: 'winners' },
    },
    {
      position: 3,
      name: 'Ottavi',
      formula: 'elimination',
      voteType: 'duel',
      config: config({
        deadline: deadlines[2],
        closeTriggers: deadlines[2] ? ['deadline'] : [],
      }),
      advance: { type: 'winners' },
    },
    {
      position: 4,
      name: 'Classifica finale',
      formula: 'ranking',
      voteType: 'pick',
      config: config({
        deadline: deadlines[3],
        closeTriggers: deadlines[3] ? ['deadline'] : [],
      }),
      advance: { type: 'winner' },
    },
  ]
}

async function setupCanonical(
  env: Env,
  db: DatabaseSync,
  token: string,
  options: { autoAdvance?: boolean; deadlines?: (string | null)[] } = {},
): Promise<string> {
  const tournamentId = await createTournament(env, token, {
    autoAdvance: options.autoAdvance ?? false,
  })
  seedElements(db, tournamentId, 40)
  seedParticipants(db, tournamentId, ['u1'])
  seedPhases(db, tournamentId, canonicalPhases(options.deadlines))
  return tournamentId
}

async function preview(env: Env, token: string, tournamentId: string): Promise<Response> {
  return call(env, `/api/tournaments/${tournamentId}/preview`, token)
}

describe('GET /api/tournaments/:id/preview', () => {
  it('valida il piano canonico e mostra 20 qualificati diretti e 12 ripescati', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await setupCanonical(env, db, alice)

    const response = await preview(env, alice, tournamentId)
    expect(response.status).toBe(200)

    const body = (await response.json()) as PreviewBody
    expect(body.valid).toBe(true)
    expect(body.errors).toEqual([])
    expect(body.preview.elementCount).toBe(40)
    expect(body.preview.phases).toHaveLength(4)

    const [groups, roundOf32, roundOf16, final] = body.preview.phases
    expect(groups!.groups).toHaveLength(10)
    expect(groups!.groups.every((group) => group.members.length === 4)).toBe(true)
    expect(groups!.qualified).toEqual({ direct: 20, repechage: 12, total: 32 })
    expect(groups!.repechage).toEqual({ targetSize: 32, excluded: 20, selected: 12 })
    expect(roundOf32).toMatchObject({ inputCount: 32, outputCount: 16 })
    expect(roundOf32!.matches).toHaveLength(16)
    expect(roundOf16).toMatchObject({ inputCount: 16, outputCount: 8 })
    expect(final).toMatchObject({ inputCount: 8, outputCount: 1 })
  })

  it('restituisce gli errori bloccanti con la fase', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await setupCanonical(env, db, alice)

    db.prepare("UPDATE phases SET advance = ? WHERE tournament_id = ? AND position = 4").run(
      JSON.stringify({ type: 'all' }),
      tournamentId,
    )

    const response = await preview(env, alice, tournamentId)
    expect(response.status).toBe(200)
    const body = (await response.json()) as PreviewBody
    expect(body.valid).toBe(false)
    expect(body.errors).toContainEqual(
      expect.objectContaining({ code: 'final_qualifies_multiple', phase: 4 }),
    )
  })

  it('mostra i warning delle deadline con autoAdvance senza bloccare', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await setupCanonical(env, db, alice, {
      autoAdvance: true,
      deadlines: [
        '2027-01-10T20:00:00.000Z',
        '2027-01-09T20:00:00.000Z',
        '2020-01-01T20:00:00.000Z',
        null,
      ],
    })

    const response = await preview(env, alice, tournamentId)
    const body = (await response.json()) as PreviewBody
    expect(body.valid).toBe(true)
    expect(body.errors).toEqual([])
    expect(body.warnings).toContainEqual(
      expect.objectContaining({ code: 'deadline_not_after_previous', phase: 2 }),
    )
    expect(body.warnings).toContainEqual(
      expect.objectContaining({ code: 'deadline_in_past', phase: 3 }),
    )
  })

  it('è riservata agli organizzatori del torneo', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    await seedUser(db, 'u2', 'bruno')
    const alice = await login(env, 'alice')
    const bruno = await login(env, 'bruno')
    const tournamentId = await setupCanonical(env, db, alice)

    const denied = await preview(env, bruno, tournamentId)
    expect(denied.status).toBe(403)
    expect(await denied.json()).toEqual({ error: 'forbidden' })

    const missing = await preview(env, alice, 'tournament-inesistente')
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ error: 'not_found' })
  })
})
