import type { DatabaseSync } from 'node:sqlite'

import { describe, expect, it } from 'vitest'

import worker from '../index'
import { createTestEnvironment } from '../../test/d1'
import { hashPassword } from '../auth/password'

const ORIGIN = 'https://versus.test'

interface TournamentBody {
  tournament: { id: string; status: string; role: string; name: string }
  tournaments?: { id: string; role: string; name: string }[]
}

interface ParticipantBody {
  participant: {
    userId: string
    username: string
    status: 'active' | 'removed'
    addedBy: string
    addedAt: string
    removedAt: string | null
  }
}

interface ParticipantsBody {
  participants: ParticipantBody['participant'][]
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

function authenticatedRequest(path: string, token: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  headers.set('Origin', ORIGIN)
  headers.set('Cookie', `versus_session=${token}`)
  if (init.body !== undefined) headers.set('Content-Type', 'application/json')
  return new Request(`${ORIGIN}${path}`, { ...init, headers })
}

function call(env: Env, path: string, token: string, init: RequestInit = {}): Promise<Response> {
  return worker.fetch(authenticatedRequest(path, token, init), env, {} as ExecutionContext)
}

async function createTournament(env: Env, token: string, name: string): Promise<string> {
  const response = await call(env, '/api/tournaments', token, {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
  expect(response.status).toBe(201)
  return ((await response.json()) as TournamentBody).tournament.id
}

async function publish(db: DatabaseSync, tournamentId: string): Promise<void> {
  db.prepare("UPDATE tournaments SET status = 'published' WHERE id = ?").run(tournamentId)
}

async function addParticipant(
  env: Env,
  token: string,
  tournamentId: string,
  userId: string,
): Promise<Response> {
  return call(env, `/api/tournaments/${tournamentId}/participants`, token, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  })
}

async function seedParticipant(
  db: DatabaseSync,
  tournamentId: string,
  userId: string,
  status: 'active' | 'removed' = 'active',
): Promise<void> {
  db.prepare(
    `INSERT INTO tournament_participants (tournament_id, user_id, status, added_by, added_at, removed_at)
     VALUES (?, ?, ?, 'u1', ?, ?)`,
  ).run(
    tournamentId,
    userId,
    status,
    new Date().toISOString(),
    status === 'removed' ? new Date().toISOString() : null,
  )
}

describe('POST /api/tournaments/:id/participants', () => {
  it('permette all organizzatore di aggiungere un partecipante in bozza', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    await seedUser(db, 'u2', 'bruno')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice, 'Torneo di Alice')

    const response = await addParticipant(env, alice, tournamentId, 'u2')

    expect(response.status).toBe(201)
    const body = (await response.json()) as ParticipantBody
    expect(body.participant).toMatchObject({
      userId: 'u2',
      username: 'bruno',
      status: 'active',
      addedBy: 'u1',
      removedAt: null,
    })

    const listed = (await (
      await call(env, `/api/tournaments/${tournamentId}/participants`, alice)
    ).json()) as ParticipantsBody
    expect(listed.participants).toEqual([expect.objectContaining({ userId: 'u2', status: 'active' })])
  })

  it('è idempotente su un partecipante già attivo', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    await seedUser(db, 'u2', 'bruno')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice, 'Torneo di Alice')

    expect((await addParticipant(env, alice, tournamentId, 'u2')).status).toBe(201)
    expect((await addParticipant(env, alice, tournamentId, 'u2')).status).toBe(200)
  })

  it('rifiuta il ventunesimo partecipante attivo con 409', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice, 'Torneo affollato')

    for (let index = 2; index <= 21; index += 1) {
      await seedUser(db, `u${index}`, `utente${index}`)
    }
    for (let index = 2; index <= 21; index += 1) {
      expect((await addParticipant(env, alice, tournamentId, `u${index}`)).status).toBe(201)
    }

    await seedUser(db, 'u22', 'utente22')
    const response = await addParticipant(env, alice, tournamentId, 'u22')

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'participant_limit_reached' })
  })

  it('permette a un utente di partecipare a più tornei', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    await seedUser(db, 'u2', 'bruno')
    const alice = await login(env, 'alice')
    const bruno = await login(env, 'bruno')
    const first = await createTournament(env, alice, 'Primo torneo')
    const second = await createTournament(env, alice, 'Secondo torneo')

    expect((await addParticipant(env, alice, first, 'u2')).status).toBe(201)
    expect((await addParticipant(env, alice, second, 'u2')).status).toBe(201)
    await publish(db, first)
    await publish(db, second)

    const list = (await (await call(env, '/api/tournaments', bruno)).json()) as TournamentBody
    expect(list.tournaments!.map((tournament) => tournament.name).sort()).toEqual([
      'Primo torneo',
      'Secondo torneo',
    ])
  })

  it('rifiuta chi non è organizzatore con 403', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    await seedUser(db, 'u2', 'bruno')
    await seedUser(db, 'u3', 'carla')
    const alice = await login(env, 'alice')
    const bruno = await login(env, 'bruno')
    const tournamentId = await createTournament(env, alice, 'Torneo di Alice')
    await seedParticipant(db, tournamentId, 'u2')

    const response = await addParticipant(env, bruno, tournamentId, 'u3')

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'forbidden' })
  })

  it('rifiuta utenti inesistenti e body non validi con 400', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice, 'Torneo di Alice')

    for (const body of [{}, { userId: 42 }, { userId: 'inesistente' }]) {
      const response = await call(env, `/api/tournaments/${tournamentId}/participants`, alice, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'invalid_request' })
    }
  })

  it('consente di aggiungere partecipanti tra una fase e l altra, ma non a torneo concluso', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    await seedUser(db, 'u2', 'bruno')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice, 'Torneo pubblicato')
    await publish(db, tournamentId)

    expect((await addParticipant(env, alice, tournamentId, 'u2')).status).toBe(201)

    db.prepare("UPDATE tournaments SET status = 'concluded' WHERE id = ?").run(tournamentId)
    await seedUser(db, 'u3', 'carla')
    const response = await addParticipant(env, alice, tournamentId, 'u3')

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'tournament_not_editable' })
  })

  it('risponde 404 per un torneo inesistente', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')

    const response = await addParticipant(env, alice, 'inesistente', 'u1')

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'not_found' })
  })
})

describe('DELETE /api/tournaments/:id/participants/:userId', () => {
  it('rimuove logicamente il partecipante e lo si può riaggiungere', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    await seedUser(db, 'u2', 'bruno')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice, 'Torneo di Alice')
    await addParticipant(env, alice, tournamentId, 'u2')

    const response = await call(env, `/api/tournaments/${tournamentId}/participants/u2`, alice, {
      method: 'DELETE',
    })

    expect(response.status).toBe(204)

    const listed = (await (
      await call(env, `/api/tournaments/${tournamentId}/participants`, alice)
    ).json()) as ParticipantsBody
    expect(listed.participants).toEqual([
      expect.objectContaining({ userId: 'u2', status: 'removed', removedAt: expect.any(String) }),
    ])

    const readded = await addParticipant(env, alice, tournamentId, 'u2')
    expect(readded.status).toBe(201)
    expect(((await readded.json()) as ParticipantBody).participant).toMatchObject({
      userId: 'u2',
      status: 'active',
      removedAt: null,
    })
  })

  it('toglie l accesso al dettaglio a chi è stato rimosso', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    await seedUser(db, 'u2', 'bruno')
    const alice = await login(env, 'alice')
    const bruno = await login(env, 'bruno')
    const tournamentId = await createTournament(env, alice, 'Torneo pubblicato')
    await addParticipant(env, alice, tournamentId, 'u2')
    await publish(db, tournamentId)

    expect((await call(env, `/api/tournaments/${tournamentId}`, bruno)).status).toBe(200)

    // La rimozione è consentita solo in bozza: qui si verifica l'effetto
    // sull'accesso, quindi il torneo torna in bozza per la DELETE.
    db.prepare("UPDATE tournaments SET status = 'draft' WHERE id = ?").run(tournamentId)
    await call(env, `/api/tournaments/${tournamentId}/participants/u2`, alice, { method: 'DELETE' })
    await publish(db, tournamentId)

    expect((await call(env, `/api/tournaments/${tournamentId}`, bruno)).status).toBe(403)
  })
})

describe('GET /api/tournaments/:id/participants', () => {
  it('mostra stato e utenti solo all organizzatore', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    await seedUser(db, 'u2', 'bruno')
    await seedUser(db, 'u3', 'carla')
    const alice = await login(env, 'alice')
    const bruno = await login(env, 'bruno')
    const tournamentId = await createTournament(env, alice, 'Torneo di Alice')
    await addParticipant(env, alice, tournamentId, 'u2')
    await seedParticipant(db, tournamentId, 'u3', 'removed')

    const response = await call(env, `/api/tournaments/${tournamentId}/participants`, alice)

    expect(response.status).toBe(200)
    const body = (await response.json()) as ParticipantsBody
    expect(body.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: 'u2', username: 'bruno', status: 'active' }),
        expect.objectContaining({ userId: 'u3', username: 'carla', status: 'removed' }),
      ]),
    )

    const forbidden = await call(env, `/api/tournaments/${tournamentId}/participants`, bruno)
    expect(forbidden.status).toBe(403)
  })
})

describe('visibilità dei tornei per i partecipanti', () => {
  it('mostra nella lista solo i tornei pubblicati a cui si partecipa', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    await seedUser(db, 'u2', 'bruno')
    const alice = await login(env, 'alice')
    const bruno = await login(env, 'bruno')
    const draft = await createTournament(env, alice, 'Ancora bozza')
    const published = await createTournament(env, alice, 'Già pubblicato')
    await addParticipant(env, alice, draft, 'u2')
    await addParticipant(env, alice, published, 'u2')
    await publish(db, published)

    const list = (await (await call(env, '/api/tournaments', bruno)).json()) as TournamentBody

    expect(list.tournaments).toEqual([
      expect.objectContaining({ id: published, name: 'Già pubblicato', role: 'participant' }),
    ])

    expect((await call(env, `/api/tournaments/${draft}`, bruno)).status).toBe(403)
    const detail = await call(env, `/api/tournaments/${published}`, bruno)
    expect(detail.status).toBe(200)
    expect(((await detail.json()) as TournamentBody).tournament.role).toBe('participant')
  })
})

describe('co-organizzatori', () => {
  it('l owner nomina un co-organizzatore che può gestire i partecipanti ma non nominarne altri', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    await seedUser(db, 'u2', 'bruno')
    await seedUser(db, 'u3', 'carla')
    const alice = await login(env, 'alice')
    const bruno = await login(env, 'bruno')
    const tournamentId = await createTournament(env, alice, 'Torneo di Alice')

    const nomination = await call(env, `/api/tournaments/${tournamentId}/organizers`, alice, {
      method: 'POST',
      body: JSON.stringify({ userId: 'u2' }),
    })

    expect(nomination.status).toBe(201)
    expect(((await nomination.json()) as { organizer: { role: string; username: string } }).organizer).toMatchObject({
      userId: 'u2',
      username: 'bruno',
      role: 'co_organizer',
    })

    expect((await addParticipant(env, bruno, tournamentId, 'u3')).status).toBe(201)

    const selfNomination = await call(env, `/api/tournaments/${tournamentId}/organizers`, bruno, {
      method: 'POST',
      body: JSON.stringify({ userId: 'u3' }),
    })
    expect(selfNomination.status).toBe(403)
    expect(await selfNomination.json()).toEqual({ error: 'forbidden' })
  })

  it('l owner revoca un co-organizzatore ma non può rimuovere se stesso', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    await seedUser(db, 'u2', 'bruno')
    const alice = await login(env, 'alice')
    const bruno = await login(env, 'bruno')
    const tournamentId = await createTournament(env, alice, 'Torneo di Alice')

    await call(env, `/api/tournaments/${tournamentId}/organizers`, alice, {
      method: 'POST',
      body: JSON.stringify({ userId: 'u2' }),
    })

    const revoked = await call(env, `/api/tournaments/${tournamentId}/organizers/u2`, alice, {
      method: 'DELETE',
    })
    expect(revoked.status).toBe(204)
    expect((await call(env, `/api/tournaments/${tournamentId}`, bruno)).status).toBe(403)

    const ownerRemoval = await call(env, `/api/tournaments/${tournamentId}/organizers/u1`, alice, {
      method: 'DELETE',
    })
    expect(ownerRemoval.status).toBe(409)
    expect(await ownerRemoval.json()).toEqual({ error: 'cannot_remove_owner' })
  })

  it('solo l owner può nominare e revocare', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    await seedUser(db, 'u2', 'bruno')
    await seedUser(db, 'u3', 'carla')
    const alice = await login(env, 'alice')
    const bruno = await login(env, 'bruno')
    const tournamentId = await createTournament(env, alice, 'Torneo di Alice')
    await call(env, `/api/tournaments/${tournamentId}/organizers`, alice, {
      method: 'POST',
      body: JSON.stringify({ userId: 'u2' }),
    })

    const nominate = await call(env, `/api/tournaments/${tournamentId}/organizers`, bruno, {
      method: 'POST',
      body: JSON.stringify({ userId: 'u3' }),
    })
    expect(nominate.status).toBe(403)

    const revoke = await call(env, `/api/tournaments/${tournamentId}/organizers/u1`, bruno, {
      method: 'DELETE',
    })
    expect(revoke.status).toBe(403)
  })

  it('valida il body e l utente da nominare', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice, 'Torneo di Alice')

    for (const body of [{}, { userId: 'inesistente' }]) {
      const response = await call(env, `/api/tournaments/${tournamentId}/organizers`, alice, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      expect(response.status).toBe(400)
    }
  })
})

describe('GET /api/tournaments/:id/candidates', () => {
  it('elenca gli utenti attivi selezionabili con il loro stato di partecipazione', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    await seedUser(db, 'u2', 'bruno')
    await seedUser(db, 'u3', 'carla')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice, 'Torneo di Alice')
    await addParticipant(env, alice, tournamentId, 'u2')

    const response = await call(env, `/api/tournaments/${tournamentId}/candidates`, alice)

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      users: { id: string; username: string; isParticipant: boolean }[]
    }
    expect(body.users).toEqual([
      expect.objectContaining({ id: 'u1', username: 'alice', isParticipant: false }),
      expect.objectContaining({ id: 'u2', username: 'bruno', isParticipant: true }),
      expect.objectContaining({ id: 'u3', username: 'carla', isParticipant: false }),
    ])
  })
})
