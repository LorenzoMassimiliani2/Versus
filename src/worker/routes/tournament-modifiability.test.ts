import type { DatabaseSync } from 'node:sqlite'

import { describe, expect, it } from 'vitest'

import worker from '../index'
import { createTestEnvironment } from '../../test/d1'
import { hashPassword } from '../auth/password'

const ORIGIN = 'https://versus.test'
const NOW = '2026-11-10T10:00:00.000Z'
const IMAGE = 'https://images.example.test/item.jpg'

interface ElementRun {
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

async function createTournament(env: Env, token: string, name = 'Torneo di Prova'): Promise<string> {
  const response = await call(env, '/api/tournaments', token, {
    method: 'POST',
    body: JSON.stringify({ name }),
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
): ElementRun[] {
  const elements: ElementRun[] = []
  for (let index = 0; index < count; index += 1) {
    const id = `${prefix}${index + 1}`
    db.prepare(
      `INSERT INTO elements (id, tournament_id, name, image_url, custom_values, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, '{}', ?, ?, ?)`,
    ).run(id, tournamentId, `Elemento ${index + 1}`, `https://images.example.test/${id}.jpg`, index + 1, NOW, NOW)
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

interface Fixture {
  env: Env
  db: DatabaseSync
  alice: string
  tournamentId: string
  elements: ElementRun[]
}

/** Torneo con 4 elementi e 2 partecipanti, pronto per aprire una fase a gironi. */
async function openGroupFixture(): Promise<Fixture & { phaseId: string; matches: string[] }> {
  const { db, env } = createTestEnvironment()
  await seedUser(db, 'u1', 'alice')
  await seedUser(db, 'u2', 'bruno')
  await seedUser(db, 'u3', 'carla')
  const alice = await login(env, 'alice')
  const tournamentId = await createTournament(env, alice)
  const elements = seedElements(db, tournamentId, 4)
  seedParticipants(db, tournamentId, ['u1', 'u2'])
  const phase = await createPhase(env, alice, tournamentId, {
    name: 'Gironi',
    formula: 'group',
    voteType: 'duel',
    config: { groups: { size: 2 }, credits: { perVoter: 0, maxPerMatch: null } },
    advance: { type: 'top_per_group', n: 1 },
  })
  publish(db, tournamentId)

  const opened = await call(env, `/api/phases/${phase.id}/open`, alice, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  expect(opened.status).toBe(200)
  const body = (await opened.json()) as { operation: { matches: Array<{ id: string }> } }
  return {
    db,
    env,
    alice,
    tournamentId,
    elements,
    phaseId: phase.id,
    matches: body.operation.matches.map((match) => match.id),
  }
}

async function voteAll(env: Env, token: string, phaseId: string, matchIds: string[]): Promise<void> {
  for (const matchId of matchIds) {
    const response = await call(env, `/api/phases/${phaseId}/duels/${matchId}/votes`, token, {
      method: 'POST',
      body: JSON.stringify({ side: 'a', credits: 0 }),
    })
    expect(response.status).toBe(200)
  }
}

async function auditActions(env: Env, token: string, tournamentId: string): Promise<string[]> {
  const response = await call(env, `/api/tournaments/${tournamentId}/audit`, token)
  expect(response.status).toBe(200)
  const body = (await response.json()) as { entries: Array<{ action: string }> }
  return body.entries.map((entry) => entry.action)
}

function count(db: DatabaseSync, sql: string, ...params: string[]): number {
  return (db.prepare(sql).get(...params) as { count: number }).count
}

describe('elementi durante il torneo', () => {
  it('blocca con 409 l eliminazione di un elemento che ha partecipato a una fase avviata', async () => {
    const fixture = await openGroupFixture()

    const response = await call(
      fixture.env,
      `/api/elements/${fixture.elements[0]!.id}`,
      fixture.alice,
      { method: 'DELETE' },
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'element_in_use' })
    expect(
      count(fixture.db, 'SELECT COUNT(*) AS count FROM elements WHERE id = ?', fixture.elements[0]!.id),
    ).toBe(1)

    const listed = (await (
      await call(fixture.env, `/api/tournaments/${fixture.tournamentId}/elements`, fixture.alice)
    ).json()) as { elements: Array<{ id: string; locked: boolean }> }
    expect(listed.elements.find((element) => element.id === fixture.elements[0]!.id)?.locked).toBe(
      true,
    )
  })

  it('mantiene modificabili i metadati di un elemento usato con una riga di audit', async () => {
    const fixture = await openGroupFixture()

    const response = await call(fixture.env, `/api/elements/${fixture.elements[0]!.id}`, fixture.alice, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Elemento rinominato', description: 'Nuova descrizione' }),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      element: { name: string; description: string; locked: boolean }
    }
    expect(body.element).toMatchObject({
      name: 'Elemento rinominato',
      description: 'Nuova descrizione',
      locked: true,
    })

    const log = (await (
      await call(fixture.env, `/api/tournaments/${fixture.tournamentId}/audit`, fixture.alice)
    ).json()) as {
      entries: Array<{ action: string; before: Record<string, unknown>; after: Record<string, unknown> }>
    }
    const entry = log.entries.find((item) => item.action === 'element.update')
    expect(entry).toBeDefined()
    expect(entry!.before).toMatchObject({ name: 'Elemento 1' })
    expect(entry!.after).toMatchObject({ name: 'Elemento rinominato' })
  })

  it('blocca con 409 l aggiunta di un elemento dopo l apertura della prima fase', async () => {
    const fixture = await openGroupFixture()

    const response = await call(
      fixture.env,
      `/api/tournaments/${fixture.tournamentId}/elements`,
      fixture.alice,
      { method: 'POST', body: JSON.stringify({ name: 'Nuovo', imageUrl: IMAGE }) },
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'element_locked' })
  })

  it('consente aggiunta ed eliminazione finché nessuna fase è stata aperta', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice)
    publish(db, tournamentId)

    const created = await call(env, `/api/tournaments/${tournamentId}/elements`, alice, {
      method: 'POST',
      body: JSON.stringify({ name: 'Canzone', imageUrl: IMAGE }),
    })
    expect(created.status).toBe(201)
    const element = ((await created.json()) as { element: { id: string; locked: boolean } }).element
    expect(element.locked).toBe(false)

    const deleted = await call(env, `/api/elements/${element.id}`, alice, { method: 'DELETE' })
    expect(deleted.status).toBe(204)
  })
})

describe('partecipanti tra una fase e l altra', () => {
  it('blocca aggiunta e rimozione mentre una fase è aperta', async () => {
    const fixture = await openGroupFixture()

    const add = await call(
      fixture.env,
      `/api/tournaments/${fixture.tournamentId}/participants`,
      fixture.alice,
      { method: 'POST', body: JSON.stringify({ userId: 'u3' }) },
    )
    expect(add.status).toBe(409)
    expect(await add.json()).toEqual({ error: 'phase_in_progress' })

    const remove = await call(
      fixture.env,
      `/api/tournaments/${fixture.tournamentId}/participants/u2`,
      fixture.alice,
      { method: 'DELETE' },
    )
    expect(remove.status).toBe(409)
    expect(await remove.json()).toEqual({ error: 'phase_in_progress' })
  })

  it('rimuove un partecipante tra due fasi e conserva i voti passati', async () => {
    const fixture = await openGroupFixture()
    const bruno = await login(fixture.env, 'bruno')
    await voteAll(fixture.env, fixture.alice, fixture.phaseId, fixture.matches)
    await voteAll(fixture.env, bruno, fixture.phaseId, fixture.matches)

    const closed = await call(fixture.env, `/api/phases/${fixture.phaseId}/close`, fixture.alice, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    expect(closed.status).toBe(200)
    expect(((await closed.json()) as { phase: { status: string } }).phase.status).toBe('closed')

    const before = (await (
      await call(fixture.env, `/api/phases/${fixture.phaseId}/results`, fixture.alice)
    ).json()) as { matches: unknown[]; groups: unknown[] }
    const votesBefore = count(
      fixture.db,
      'SELECT COUNT(*) AS count FROM vote_events WHERE phase_id = ?',
      fixture.phaseId,
    )

    const removed = await call(
      fixture.env,
      `/api/tournaments/${fixture.tournamentId}/participants/u2`,
      fixture.alice,
      { method: 'DELETE' },
    )
    expect(removed.status).toBe(204)

    const after = (await (
      await call(fixture.env, `/api/phases/${fixture.phaseId}/results`, fixture.alice)
    ).json()) as { matches: unknown[]; groups: unknown[] }
    expect(after.matches).toEqual(before.matches)
    expect(after.groups).toEqual(before.groups)
    expect(
      count(fixture.db, 'SELECT COUNT(*) AS count FROM vote_events WHERE phase_id = ?', fixture.phaseId),
    ).toBe(votesBefore)
    expect(
      count(
        fixture.db,
        "SELECT COUNT(*) AS count FROM tournament_participants WHERE tournament_id = ? AND user_id = 'u2' AND status = 'removed'",
        fixture.tournamentId,
      ),
    ).toBe(1)
  })

  it('consente di aggiungere un partecipante tra due fasi e di riaggiungerne uno rimosso', async () => {
    const fixture = await openGroupFixture()
    await voteAll(fixture.env, fixture.alice, fixture.phaseId, fixture.matches)
    const closed = await call(fixture.env, `/api/phases/${fixture.phaseId}/close`, fixture.alice, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    expect(closed.status).toBe(200)

    const added = await call(
      fixture.env,
      `/api/tournaments/${fixture.tournamentId}/participants`,
      fixture.alice,
      { method: 'POST', body: JSON.stringify({ userId: 'u3' }) },
    )
    expect(added.status).toBe(201)

    await call(fixture.env, `/api/tournaments/${fixture.tournamentId}/participants/u2`, fixture.alice, {
      method: 'DELETE',
    })
    const readded = await call(
      fixture.env,
      `/api/tournaments/${fixture.tournamentId}/participants`,
      fixture.alice,
      { method: 'POST', body: JSON.stringify({ userId: 'u2' }) },
    )
    expect(readded.status).toBe(201)
  })

  it('traccia la rimozione del partecipante in audit log', async () => {
    const fixture = await openGroupFixture()
    await voteAll(fixture.env, fixture.alice, fixture.phaseId, fixture.matches)
    await call(fixture.env, `/api/phases/${fixture.phaseId}/close`, fixture.alice, {
      method: 'POST',
      body: JSON.stringify({}),
    })

    await call(fixture.env, `/api/tournaments/${fixture.tournamentId}/participants/u2`, fixture.alice, {
      method: 'DELETE',
    })

    expect(await auditActions(fixture.env, fixture.alice, fixture.tournamentId)).toContain(
      'participant.remove',
    )
  })
})

describe('co-organizzatori durante il torneo', () => {
  it('l owner nomina e revoca un co-organizzatore con una fase aperta, con audit', async () => {
    const fixture = await openGroupFixture()
    const bruno = await login(fixture.env, 'bruno')

    const nominated = await call(
      fixture.env,
      `/api/tournaments/${fixture.tournamentId}/organizers`,
      fixture.alice,
      { method: 'POST', body: JSON.stringify({ userId: 'u2' }) },
    )
    expect(nominated.status).toBe(201)

    const forbidden = await call(
      fixture.env,
      `/api/tournaments/${fixture.tournamentId}/organizers`,
      bruno,
      { method: 'POST', body: JSON.stringify({ userId: 'u3' }) },
    )
    expect(forbidden.status).toBe(403)

    const revoked = await call(
      fixture.env,
      `/api/tournaments/${fixture.tournamentId}/organizers/u2`,
      fixture.alice,
      { method: 'DELETE' },
    )
    expect(revoked.status).toBe(204)

    const actions = await auditActions(fixture.env, fixture.alice, fixture.tournamentId)
    expect(actions).toContain('organizer.nominate')
    expect(actions).toContain('organizer.revoke')
  })
})
