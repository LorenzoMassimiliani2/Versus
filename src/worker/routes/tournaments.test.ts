import type { DatabaseSync } from 'node:sqlite'

import { describe, expect, it } from 'vitest'

import worker from '../index'
import { createTestEnvironment } from '../../test/d1'
import { hashPassword } from '../auth/password'

const ORIGIN = 'https://versus.test'

interface SeedUser {
  id?: string
  username?: string
  password?: string
  isAdmin?: boolean
  isActive?: boolean
}

interface TournamentBody {
  tournament: {
    id: string
    slug: string
    name: string
    description: string
    coverUrl: string | null
    status: string
    role: string
    settings?: { selfVoteAllowed: boolean; autoAdvance: boolean }
    organizers?: { userId: string; username: string; role: string }[]
    createdAt: string
    updatedAt: string
  }
}

async function seedUser(db: DatabaseSync, options: SeedUser = {}): Promise<string> {
  const id = options.id ?? 'u1'
  const username = options.username ?? 'alice'
  const password = options.password ?? 'password123'
  const isAdmin = options.isAdmin ?? false
  const isActive = options.isActive ?? true

  db.prepare(
    'INSERT INTO users (id, username, password_hash, is_admin, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    id,
    username,
    await hashPassword(password),
    isAdmin ? 1 : 0,
    isActive ? 1 : 0,
    new Date().toISOString(),
  )
  return id
}

async function login(env: Env, username = 'alice', password = 'password123'): Promise<string> {
  const response = await worker.fetch(
    new Request(`${ORIGIN}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'CF-Connecting-IP': '203.0.113.10',
      },
      body: JSON.stringify({ username, password }),
    }),
    env,
    {} as ExecutionContext,
  )
  expect(response.status).toBe(200)
  const match = (response.headers.get('Set-Cookie') ?? '').match(/versus_session=([^;]+)/)
  if (!match) throw new Error('Set-Cookie versus_session assente')
  return match[1]!
}

function authenticatedRequest(
  path: string,
  sessionToken: string,
  init: RequestInit = {},
): Request {
  const headers = new Headers(init.headers)
  headers.set('Origin', ORIGIN)
  headers.set('Cookie', `versus_session=${sessionToken}`)
  if (init.body !== undefined) headers.set('Content-Type', 'application/json')
  return new Request(`${ORIGIN}${path}`, { ...init, headers })
}

function jsonBody(value: unknown): string {
  return JSON.stringify(value)
}

async function createTournament(
  env: Env,
  token: string,
  body: Record<string, unknown> = { name: 'Torneo di Prova' },
): Promise<TournamentBody> {
  const response = await worker.fetch(
    authenticatedRequest('/api/tournaments', token, {
      method: 'POST',
      body: jsonBody(body),
    }),
    env,
    {} as ExecutionContext,
  )
  expect(response.status).toBe(201)
  return (await response.json()) as TournamentBody
}

async function getTournament(env: Env, token: string, id: string): Promise<Response> {
  return worker.fetch(authenticatedRequest(`/api/tournaments/${id}`, token), env, {} as ExecutionContext)
}

async function patchTournament(
  env: Env,
  token: string,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return worker.fetch(
    authenticatedRequest(`/api/tournaments/${id}`, token, {
      method: 'PATCH',
      body: jsonBody(body),
    }),
    env,
    {} as ExecutionContext,
  )
}

async function addOrganizer(
  db: DatabaseSync,
  tournamentId: string,
  userId: string,
  role: 'owner' | 'co_organizer',
  addedBy: string,
): Promise<void> {
  db.prepare(
    `INSERT INTO tournament_organizers (tournament_id, user_id, role, added_by, added_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(tournamentId, userId, role, addedBy, new Date().toISOString())
}

describe('POST /api/tournaments', () => {
  it('crea un torneo in bozza e ne rende owner chi lo crea', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, { id: 'u1', username: 'alice' })
    const token = await login(env)

    const response = await worker.fetch(
      authenticatedRequest('/api/tournaments', token, {
        method: 'POST',
        body: jsonBody({
          name: '  Torneo di Prova ',
          description: 'Un torneo per provare.',
          coverUrl: 'https://example.test/cover.jpg',
        }),
      }),
      env,
      {} as ExecutionContext,
    )

    expect(response.status).toBe(201)
    const body = (await response.json()) as TournamentBody
    expect(body.tournament).toMatchObject({
      name: 'Torneo di Prova',
      description: 'Un torneo per provare.',
      coverUrl: 'https://example.test/cover.jpg',
      status: 'draft',
      slug: 'torneo-di-prova',
      role: 'owner',
      settings: { selfVoteAllowed: true, autoAdvance: false },
    })
    expect(body.tournament.id).toBeTruthy()
    expect(body.tournament.organizers).toEqual([
      expect.objectContaining({ userId: 'u1', username: 'alice', role: 'owner' }),
    ])

    const organizer = db
      .prepare('SELECT user_id, role, added_by FROM tournament_organizers WHERE tournament_id = ?')
      .get(body.tournament.id)
    expect(organizer).toEqual({ user_id: 'u1', role: 'owner', added_by: 'u1' })

    const stored = db
      .prepare('SELECT settings FROM tournaments WHERE id = ?')
      .get(body.tournament.id) as { settings: string }
    expect(JSON.parse(stored.settings)).toEqual({ selfVoteAllowed: true, autoAdvance: false })
  })

  it('genera slug univoci per nomi uguali', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, { id: 'u1', username: 'alice' })
    const token = await login(env)

    const first = await createTournament(env, token, { name: 'Torneo di Prova' })
    const second = await createTournament(env, token, { name: 'Torneo di Prova' })
    const third = await createTournament(env, token, { name: 'torneo di prova!' })

    expect(first.tournament.slug).toBe('torneo-di-prova')
    expect(second.tournament.slug).toBe('torneo-di-prova-2')
    expect(third.tournament.slug).toBe('torneo-di-prova-3')
  })

  it('mantiene lo slug stabile quando il nome cambia', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, { id: 'u1', username: 'alice' })
    const token = await login(env)
    const created = await createTournament(env, token, { name: 'Vecchio Nome' })

    const patched = await patchTournament(env, token, created.tournament.id, {
      name: 'Nuovo Nome',
    })

    expect(patched.status).toBe(200)
    const body = (await patched.json()) as TournamentBody
    expect(body.tournament.name).toBe('Nuovo Nome')
    expect(body.tournament.slug).toBe('vecchio-nome')
  })

  it('accetta settings con autoAdvance', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, { id: 'u1', username: 'alice' })
    const token = await login(env)

    const created = await createTournament(env, token, {
      name: 'Con avanzamento',
      settings: { autoAdvance: true },
    })

    expect(created.tournament.settings).toEqual({ selfVoteAllowed: true, autoAdvance: true })
  })

  it('rifiuta body non validi con 400', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, { id: 'u1', username: 'alice' })
    const token = await login(env)

    for (const body of [
      {},
      { name: '   ' },
      { name: 'ok', description: 42 },
      { name: 'ok', coverUrl: 'non-un-url' },
      { name: 'ok', settings: { autoAdvance: 'sì' } },
      { name: 'x'.repeat(121) },
    ]) {
      const response = await worker.fetch(
        authenticatedRequest('/api/tournaments', token, {
          method: 'POST',
          body: jsonBody(body),
        }),
        env,
        {} as ExecutionContext,
      )
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'invalid_request' })
    }
  })

  it('richiede una sessione valida', async () => {
    const { env } = createTestEnvironment()

    const response = await worker.fetch(
      new Request(`${ORIGIN}/api/tournaments`, {
        method: 'POST',
        headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
        body: jsonBody({ name: 'Torneo' }),
      }),
      env,
      {} as ExecutionContext,
    )

    expect(response.status).toBe(401)
  })
})

describe('GET /api/tournaments', () => {
  it('elenca solo i tornei che l utente organizza con il ruolo', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, { id: 'u1', username: 'alice' })
    await seedUser(db, { id: 'u2', username: 'bruno' })
    const alice = await login(env, 'alice')
    const bruno = await login(env, 'bruno')

    const own = await createTournament(env, alice, { name: 'Torneo di Alice' })
    await createTournament(env, bruno, { name: 'Torneo di Bruno' })

    const shared = await createTournament(env, bruno, { name: 'Torneo condiviso' })
    await addOrganizer(db, shared.tournament.id, 'u1', 'co_organizer', 'u2')

    const response = await worker.fetch(
      authenticatedRequest('/api/tournaments', alice),
      env,
      {} as ExecutionContext,
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      tournaments: { id: string; name: string; role: string; status: string }[]
    }
    expect(body.tournaments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: own.tournament.id, name: 'Torneo di Alice', role: 'owner' }),
        expect.objectContaining({ id: shared.tournament.id, role: 'co_organizer', status: 'draft' }),
      ]),
    )
    expect(body.tournaments).toHaveLength(2)
    expect(body.tournaments.map((t) => t.name)).not.toContain('Torneo di Bruno')

    const brunoList = await worker.fetch(
      authenticatedRequest('/api/tournaments', bruno),
      env,
      {} as ExecutionContext,
    )
    const brunoBody = (await brunoList.json()) as { tournaments: { name: string }[] }
    expect(brunoBody.tournaments.map((t) => t.name).sort()).toEqual([
      'Torneo condiviso',
      'Torneo di Bruno',
    ])
  })

  it('restituisce una lista vuota a chi non organizza tornei', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, { id: 'u1', username: 'alice' })
    await seedUser(db, { id: 'u2', username: 'bruno' })
    const alice = await login(env, 'alice')
    const bruno = await login(env, 'bruno')
    await createTournament(env, alice, { name: 'Torneo di Alice' })

    const response = await worker.fetch(
      authenticatedRequest('/api/tournaments', bruno),
      env,
      {} as ExecutionContext,
    )

    expect(await response.json()).toEqual({ tournaments: [] })
  })

  it('non mostra i tornei altrui nemmeno a un admin', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, { id: 'admin', username: 'alice', isAdmin: true })
    await seedUser(db, { id: 'u2', username: 'bruno' })
    const admin = await login(env, 'alice')
    const bruno = await login(env, 'bruno')
    await createTournament(env, bruno, { name: 'Torneo di Bruno' })

    const response = await worker.fetch(
      authenticatedRequest('/api/tournaments', admin),
      env,
      {} as ExecutionContext,
    )

    expect(await response.json()).toEqual({ tournaments: [] })
  })
})

describe('GET /api/tournaments/:id', () => {
  it('mostra la bozza agli organizzatori con settings e organizzatori', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, { id: 'u1', username: 'alice' })
    await seedUser(db, { id: 'u2', username: 'bruno' })
    const alice = await login(env, 'alice')
    const bruno = await login(env, 'bruno')
    const created = await createTournament(env, alice, { name: 'Torneo di Prova' })
    await addOrganizer(db, created.tournament.id, 'u2', 'co_organizer', 'u1')

    const response = await getTournament(env, bruno, created.tournament.id)

    expect(response.status).toBe(200)
    const body = (await response.json()) as TournamentBody
    expect(body.tournament).toMatchObject({
      id: created.tournament.id,
      slug: 'torneo-di-prova',
      status: 'draft',
      role: 'co_organizer',
      settings: { selfVoteAllowed: true, autoAdvance: false },
    })
    expect(body.tournament.organizers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: 'u1', username: 'alice', role: 'owner' }),
        expect.objectContaining({ userId: 'u2', username: 'bruno', role: 'co_organizer' }),
      ]),
    )
  })

  it('nasconde la bozza a chi non è organizzatore, admin compreso', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, { id: 'admin', username: 'alice', isAdmin: true })
    await seedUser(db, { id: 'u2', username: 'bruno' })
    const admin = await login(env, 'alice')
    const bruno = await login(env, 'bruno')
    const created = await createTournament(env, bruno, { name: 'Torneo di Bruno' })

    const response = await getTournament(env, admin, created.tournament.id)

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'forbidden' })
  })

  it('risponde 404 per un torneo inesistente', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, { id: 'u1', username: 'alice' })
    const token = await login(env)

    const response = await getTournament(env, token, 'inesistente')

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'not_found' })
  })

  it('richiede una sessione valida', async () => {
    const { env } = createTestEnvironment()

    const response = await worker.fetch(
      new Request(`${ORIGIN}/api/tournaments/t1`),
      env,
      {} as ExecutionContext,
    )

    expect(response.status).toBe(401)
  })
})

describe('PATCH /api/tournaments/:id', () => {
  it('aggiorna nome, descrizione e copertina e persiste le modifiche', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, { id: 'u1', username: 'alice' })
    const token = await login(env)
    const created = await createTournament(env, token, { name: 'Torneo di Prova' })

    const response = await patchTournament(env, token, created.tournament.id, {
      name: 'Torneo Rinominato',
      description: 'Nuova descrizione',
      coverUrl: 'https://example.test/nuova.jpg',
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as TournamentBody
    expect(body.tournament).toMatchObject({
      name: 'Torneo Rinominato',
      description: 'Nuova descrizione',
      coverUrl: 'https://example.test/nuova.jpg',
    })

    const reread = (await (await getTournament(env, token, created.tournament.id)).json()) as TournamentBody
    expect(reread.tournament).toMatchObject({
      name: 'Torneo Rinominato',
      description: 'Nuova descrizione',
      coverUrl: 'https://example.test/nuova.jpg',
      slug: 'torneo-di-prova',
    })
  })

  it('permette al co-organizzatore di modificare e cancella la copertina con null', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, { id: 'u1', username: 'alice' })
    await seedUser(db, { id: 'u2', username: 'bruno' })
    const alice = await login(env, 'alice')
    const bruno = await login(env, 'bruno')
    const created = await createTournament(env, alice, {
      name: 'Torneo di Prova',
      coverUrl: 'https://example.test/cover.jpg',
    })
    await addOrganizer(db, created.tournament.id, 'u2', 'co_organizer', 'u1')

    const response = await patchTournament(env, bruno, created.tournament.id, { coverUrl: null })

    expect(response.status).toBe(200)
    expect(((await response.json()) as TournamentBody).tournament.coverUrl).toBeNull()
  })

  it('rifiuta chi non è organizzatore con 403', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, { id: 'u1', username: 'alice' })
    await seedUser(db, { id: 'u2', username: 'bruno' })
    const alice = await login(env, 'alice')
    const bruno = await login(env, 'bruno')
    const created = await createTournament(env, alice, { name: 'Torneo di Alice' })

    const response = await patchTournament(env, bruno, created.tournament.id, { name: 'Rubato' })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'forbidden' })
  })

  it('rifiuta body non validi e tornei inesistenti', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, { id: 'u1', username: 'alice' })
    const token = await login(env)
    const created = await createTournament(env, token, { name: 'Torneo di Prova' })

    for (const body of [{}, { name: '' }, { name: 42 }, { coverUrl: 'non-un-url' }]) {
      const response = await patchTournament(env, token, created.tournament.id, body)
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'invalid_request' })
    }

    const missing = await patchTournament(env, token, 'inesistente', { name: 'Nuovo' })
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ error: 'not_found' })
  })
})
