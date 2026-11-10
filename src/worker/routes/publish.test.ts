import type { DatabaseSync } from 'node:sqlite'

import { describe, expect, it } from 'vitest'

import worker from '../index'
import { createTestEnvironment } from '../../test/d1'
import { hashPassword } from '../auth/password'

const ORIGIN = 'https://versus.test'

interface TournamentBody {
  tournament: {
    id: string
    status: string
    role: string
    publishedAt: string | null
    settings: { selfVoteAllowed: boolean; autoAdvance: boolean }
  }
}

async function seedUser(
  db: DatabaseSync,
  id: string,
  username: string,
): Promise<string> {
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
  return ((await response.json()) as TournamentBody).tournament.id
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

/** Piano minimo valido: 2 elementi, finale di eliminazione che elegge il vincitore. */
function seedValidPlan(db: DatabaseSync, tournamentId: string): void {
  const timestamp = new Date().toISOString()
  db.prepare(
    `INSERT INTO phases (id, tournament_id, position, name, formula, vote_type, config, advance,
       status, opened_at, closed_at, created_at, updated_at)
     VALUES ('p1', ?, 1, 'Finale', 'elimination', 'duel', ?, ?, 'pending', NULL, NULL, ?, ?)`,
  ).run(
    tournamentId,
    JSON.stringify({
      deadline: null,
      closeTriggers: [],
      secrecy: 'live',
      votingMode: 'simultaneous',
      credits: { perVoter: 0, maxPerMatch: null },
      elimination: { seeding: 'ranking', thirdPlaceMatch: false },
    }),
    JSON.stringify({ type: 'winner' }),
    timestamp,
    timestamp,
  )
}

function seedTournament(
  db: DatabaseSync,
  id: string,
  status: string,
  ownerId: string,
): void {
  const timestamp = new Date().toISOString()
  db.prepare(
    `INSERT INTO tournaments (id, slug, name, description, cover_url, status, settings,
       created_at, updated_at, published_at)
     VALUES (?, ?, ?, '', NULL, ?, '{}', ?, ?, ?)`,
  ).run(
    id,
    `torneo-${id}`,
    `Torneo ${id}`,
    status,
    timestamp,
    timestamp,
    status === 'published' || status === 'running' ? timestamp : null,
  )
  db.prepare(
    `INSERT INTO tournament_organizers (tournament_id, user_id, role, added_by, added_at)
     VALUES (?, ?, 'owner', ?, ?)`,
  ).run(id, ownerId, ownerId, timestamp)
}

async function publish(env: Env, token: string, id: string): Promise<Response> {
  return call(env, `/api/tournaments/${id}/publish`, token, { method: 'POST' })
}

describe('POST /api/tournaments/:id/publish', () => {
  it('pubblica un piano valido e imposta published_at', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const token = await login(env, 'alice')
    const id = await createTournament(env, token)
    seedElements(db, id, 2)
    seedParticipants(db, id, ['u1'])
    seedValidPlan(db, id)

    const response = await publish(env, token, id)

    expect(response.status).toBe(200)
    const body = (await response.json()) as TournamentBody
    expect(body.tournament.status).toBe('published')
    expect(body.tournament.publishedAt).toBeTruthy()

    const stored = db
      .prepare('SELECT status, published_at FROM tournaments WHERE id = ?')
      .get(id) as { status: string; published_at: string | null }
    expect(stored.status).toBe('published')
    expect(stored.published_at).toBe(body.tournament.publishedAt)
  })

  it('blocca la pubblicazione senza elementi, fasi o partecipanti con un errore chiaro', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const token = await login(env, 'alice')
    const id = await createTournament(env, token)

    const response = await publish(env, token, id)

    expect(response.status).toBe(422)
    const body = (await response.json()) as {
      error: string
      errors: { code: string }[]
    }
    expect(body.error).toBe('plan_invalid')
    expect(body.errors.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['elements_min', 'phases_min', 'participants_min']),
    )
  })

  it('blocca la pubblicazione senza partecipanti attivi', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const token = await login(env, 'alice')
    const id = await createTournament(env, token)
    seedElements(db, id, 2)
    seedValidPlan(db, id)

    const response = await publish(env, token, id)

    expect(response.status).toBe(422)
    const body = (await response.json()) as { errors: { code: string }[] }
    expect(body.errors.map((issue) => issue.code)).toContain('participants_min')
  })

  it('rifiuta la pubblicazione dell undicesimo torneo attivo con 409', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const token = await login(env, 'alice')
    const id = await createTournament(env, token)
    seedElements(db, id, 2)
    seedParticipants(db, id, ['u1'])
    seedValidPlan(db, id)

    for (let index = 0; index < 10; index += 1) {
      seedTournament(db, `active-${index}`, index % 2 === 0 ? 'published' : 'running', 'u1')
    }

    const response = await publish(env, token, id)

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'tournament_limit_reached' })
    const stored = db.prepare('SELECT status FROM tournaments WHERE id = ?').get(id) as {
      status: string
    }
    expect(stored.status).toBe('draft')
  })

  it('non conta le bozze nel limite dei tornei attivi', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const token = await login(env, 'alice')
    const id = await createTournament(env, token)
    seedElements(db, id, 2)
    seedParticipants(db, id, ['u1'])
    seedValidPlan(db, id)

    for (let index = 0; index < 10; index += 1) {
      seedTournament(db, `draft-${index}`, 'draft', 'u1')
    }

    const response = await publish(env, token, id)

    expect(response.status).toBe(200)
    expect(((await response.json()) as TournamentBody).tournament.status).toBe('published')
  })

  it('rifiuta chi non è organizzatore con 403', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    await seedUser(db, 'u2', 'bruno')
    const alice = await login(env, 'alice')
    const bruno = await login(env, 'bruno')
    const id = await createTournament(env, alice)
    seedElements(db, id, 2)
    seedParticipants(db, id, ['u1', 'u2'])
    seedValidPlan(db, id)

    const response = await publish(env, bruno, id)

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'forbidden' })
  })

  it('non ripubblica un torneo già pubblicato', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const token = await login(env, 'alice')
    const id = await createTournament(env, token)
    seedElements(db, id, 2)
    seedParticipants(db, id, ['u1'])
    seedValidPlan(db, id)
    expect((await publish(env, token, id)).status).toBe(200)

    const response = await publish(env, token, id)

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'tournament_not_editable' })
  })
})

describe('visibilità del torneo pubblicato', () => {
  it('rendo il torneo visibile ai partecipanti solo dopo la pubblicazione', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    await seedUser(db, 'u2', 'bruno')
    const alice = await login(env, 'alice')
    const bruno = await login(env, 'bruno')
    const id = await createTournament(env, alice)
    seedElements(db, id, 2)
    seedParticipants(db, id, ['u1', 'u2'])
    seedValidPlan(db, id)

    const beforeDetail = await call(env, `/api/tournaments/${id}`, bruno)
    expect(beforeDetail.status).toBe(403)
    const beforeList = await call(env, '/api/tournaments', bruno)
    expect(await beforeList.json()).toEqual({ tournaments: [] })

    expect((await publish(env, alice, id)).status).toBe(200)

    const detail = await call(env, `/api/tournaments/${id}`, bruno)
    expect(detail.status).toBe(200)
    const body = (await detail.json()) as TournamentBody
    expect(body.tournament).toMatchObject({ status: 'published', role: 'participant' })

    const list = await call(env, '/api/tournaments', bruno)
    const listBody = (await list.json()) as {
      tournaments: { id: string; status: string; role: string }[]
    }
    expect(listBody.tournaments).toEqual([
      expect.objectContaining({ id, status: 'published', role: 'participant' }),
    ])

    const patch = await call(env, `/api/tournaments/${id}`, bruno, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Rubato' }),
    })
    expect(patch.status).toBe(403)
  })
})

describe('impostazioni del torneo dopo l apertura della prima fase', () => {
  it('permette di modificare autoAdvance e selfVoteAllowed prima dell apertura', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const token = await login(env, 'alice')
    const id = await createTournament(env, token)

    const response = await call(env, `/api/tournaments/${id}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ settings: { autoAdvance: true, selfVoteAllowed: false } }),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as TournamentBody
    expect(body.tournament.settings).toEqual({ autoAdvance: true, selfVoteAllowed: false })
  })

  it('rifiuta con 409 la modifica delle impostazioni dopo l apertura', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const token = await login(env, 'alice')
    const id = await createTournament(env, token)
    seedElements(db, id, 2)
    seedValidPlan(db, id)
    db.prepare("UPDATE phases SET status = 'open' WHERE tournament_id = ?").run(id)

    const autoAdvance = await call(env, `/api/tournaments/${id}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ settings: { autoAdvance: true } }),
    })
    expect(autoAdvance.status).toBe(409)
    expect(await autoAdvance.json()).toEqual({ error: 'tournament_settings_locked' })

    const selfVote = await call(env, `/api/tournaments/${id}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ settings: { selfVoteAllowed: false } }),
    })
    expect(selfVote.status).toBe(409)
    expect(await selfVote.json()).toEqual({ error: 'tournament_settings_locked' })
  })

  it('permette di rinominare il torneo dopo l apertura lasciando le impostazioni invariate', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const token = await login(env, 'alice')
    const id = await createTournament(env, token)
    seedValidPlan(db, id)
    db.prepare("UPDATE phases SET status = 'closed' WHERE tournament_id = ?").run(id)

    const response = await call(env, `/api/tournaments/${id}`, token, {
      method: 'PATCH',
      body: JSON.stringify({
        name: 'Nuovo nome',
        settings: { autoAdvance: false, selfVoteAllowed: true },
      }),
    })

    expect(response.status).toBe(200)
    expect(((await response.json()) as TournamentBody).tournament.status).toBe('draft')
  })
})
