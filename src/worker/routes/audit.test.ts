import type { DatabaseSync } from 'node:sqlite'

import { describe, expect, it } from 'vitest'

import worker from '../index'
import { createTestEnvironment } from '../../test/d1'
import { hashPassword } from '../auth/password'

const ORIGIN = 'https://versus.test'
const NOW = '2026-11-10T10:00:00.000Z'

interface AuditResponse {
  entries: Array<{
    id: string
    actorId: string | null
    actorUsername: string | null
    action: string
    targetType: string
    targetId: string | null
    before: unknown
    after: unknown
    createdAt: string
  }>
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
): Promise<{ id: string; name: string }> {
  const response = await call(env, `/api/tournaments/${tournamentId}/phases`, token, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Gironi',
      formula: 'group',
      voteType: 'ranking',
      config: {},
      advance: { type: 'top_per_group', n: 2 },
    }),
  })
  expect(response.status).toBe(201)
  return ((await response.json()) as { phase: { id: string; name: string } }).phase
}

async function createElement(
  env: Env,
  token: string,
  tournamentId: string,
  name = 'Elemento uno',
): Promise<{ id: string; name: string }> {
  const response = await call(env, `/api/tournaments/${tournamentId}/elements`, token, {
    method: 'POST',
    body: JSON.stringify({ name, imageUrl: 'https://images.example.test/one.jpg' }),
  })
  expect(response.status).toBe(201)
  return ((await response.json()) as { element: { id: string; name: string } }).element
}

async function createField(
  env: Env,
  token: string,
  tournamentId: string,
): Promise<{ id: string; label: string }> {
  const response = await call(env, `/api/tournaments/${tournamentId}/fields`, token, {
    method: 'POST',
    body: JSON.stringify({ key: 'autore', label: 'Autore', type: 'text' }),
  })
  expect(response.status).toBe(201)
  return ((await response.json()) as { field: { id: string; label: string } }).field
}

function auditRows(
  db: DatabaseSync,
  tournamentId: string,
  action?: string,
): Array<{
  actor_id: string | null
  action: string
  target_type: string
  target_id: string | null
  before: string | null
  after: string | null
  created_at: string
}> {
  const sql = action
    ? 'SELECT * FROM audit_log WHERE tournament_id = ? AND action = ? ORDER BY created_at, id'
    : 'SELECT * FROM audit_log WHERE tournament_id = ? ORDER BY created_at, id'
  return (action ? db.prepare(sql).all(tournamentId, action) : db.prepare(sql).all(tournamentId)) as never
}

describe('audit log strutturale', () => {
  it('traccia la modifica del torneo con before e after', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice)

    const response = await call(env, `/api/tournaments/${tournamentId}`, alice, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Torneo rinominato', description: 'Nuova descrizione' }),
    })
    expect(response.status).toBe(200)

    const rows = auditRows(db, tournamentId, 'tournament.update')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ actor_id: 'u1', target_type: 'tournament', target_id: tournamentId })
    expect(JSON.parse(rows[0]!.before!)).toMatchObject({
      name: 'Torneo di Prova',
      description: '',
    })
    expect(JSON.parse(rows[0]!.after!)).toMatchObject({
      name: 'Torneo rinominato',
      description: 'Nuova descrizione',
    })
    expect(rows[0]!.created_at).toBeTruthy()
  })

  it('traccia creazione e modifica di una fase pending', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice)

    const phase = await createPhase(env, alice, tournamentId)
    expect(auditRows(db, tournamentId, 'phase.create')).toHaveLength(1)

    const response = await call(env, `/api/phases/${phase.id}`, alice, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Gironi A', formula: 'group' }),
    })
    expect(response.status).toBe(200)

    const rows = auditRows(db, tournamentId, 'phase.update')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ actor_id: 'u1', target_type: 'phase', target_id: phase.id })
    const before = JSON.parse(rows[0]!.before!) as Record<string, unknown>
    const after = JSON.parse(rows[0]!.after!) as Record<string, unknown>
    expect(before.name).toBe('Gironi')
    expect(after.name).toBe('Gironi A')
    expect(before).not.toEqual(after)
  })

  it('traccia elemento e campo personalizzato, compresa la cancellazione', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice)

    const element = await createElement(env, alice, tournamentId)
    const field = await createField(env, alice, tournamentId)

    await call(env, `/api/elements/${element.id}`, alice, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Elemento rinominato' }),
    })
    await call(env, `/api/fields/${field.id}`, alice, {
      method: 'PATCH',
      body: JSON.stringify({ label: 'Autore principale' }),
    })
    await call(env, `/api/elements/${element.id}`, alice, { method: 'DELETE' })
    await call(env, `/api/fields/${field.id}`, alice, { method: 'DELETE' })

    const elementUpdate = auditRows(db, tournamentId, 'element.update')[0]!
    expect(JSON.parse(elementUpdate.before!)).toMatchObject({ name: 'Elemento uno' })
    expect(JSON.parse(elementUpdate.after!)).toMatchObject({ name: 'Elemento rinominato' })

    const elementDelete = auditRows(db, tournamentId, 'element.delete')[0]!
    expect(elementDelete.target_id).toBe(element.id)
    expect(JSON.parse(elementDelete.before!)).toMatchObject({ name: 'Elemento rinominato' })
    expect(elementDelete.after).toBeNull()

    const fieldUpdate = auditRows(db, tournamentId, 'field.update')[0]!
    expect(fieldUpdate.target_type).toBe('custom_field')
    expect(JSON.parse(fieldUpdate.before!)).toEqual({ label: 'Autore' })
    expect(JSON.parse(fieldUpdate.after!)).toEqual({ label: 'Autore principale' })

    expect(auditRows(db, tournamentId, 'field.delete')).toHaveLength(1)
  })

  it('traccia partecipanti e co-organizzatori', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    await seedUser(db, 'u2', 'bruno')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice)

    const added = await call(env, `/api/tournaments/${tournamentId}/participants`, alice, {
      method: 'POST',
      body: JSON.stringify({ userId: 'u2' }),
    })
    expect(added.status).toBe(201)
    const removed = await call(env, `/api/tournaments/${tournamentId}/participants/u2`, alice, {
      method: 'DELETE',
    })
    expect(removed.status).toBe(204)

    const nominated = await call(env, `/api/tournaments/${tournamentId}/organizers`, alice, {
      method: 'POST',
      body: JSON.stringify({ userId: 'u2' }),
    })
    expect(nominated.status).toBe(201)
    const revoked = await call(env, `/api/tournaments/${tournamentId}/organizers/u2`, alice, {
      method: 'DELETE',
    })
    expect(revoked.status).toBe(204)

    const participantAdd = auditRows(db, tournamentId, 'participant.add')[0]!
    expect(participantAdd).toMatchObject({ actor_id: 'u1', target_type: 'participant', target_id: 'u2' })
    expect(JSON.parse(participantAdd.after!)).toEqual({ status: 'active' })

    const participantRemove = auditRows(db, tournamentId, 'participant.remove')[0]!
    expect(JSON.parse(participantRemove.before!)).toEqual({ status: 'active' })
    expect(JSON.parse(participantRemove.after!)).toEqual({ status: 'removed' })

    const organizerNominate = auditRows(db, tournamentId, 'organizer.nominate')[0]!
    expect(organizerNominate).toMatchObject({ target_type: 'organizer', target_id: 'u2' })
    expect(JSON.parse(organizerNominate.after!)).toEqual({ role: 'co_organizer' })
    expect(auditRows(db, tournamentId, 'organizer.revoke')[0]!.before).not.toBeNull()
  })

  it('l organizzatore legge solo il log del proprio torneo', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    await seedUser(db, 'u2', 'bruno')
    await seedUser(db, 'u3', 'carla')
    const alice = await login(env, 'alice')
    const bruno = await login(env, 'bruno')

    const tournamentId = await createTournament(env, alice, 'Torneo di Alice')
    const otherTournamentId = await createTournament(env, bruno, 'Torneo di Bruno')
    await call(env, `/api/tournaments/${otherTournamentId}`, bruno, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Torneo di Bruno rinominato' }),
    })

    const response = await call(env, `/api/tournaments/${tournamentId}/audit`, alice)
    expect(response.status).toBe(200)
    const body = (await response.json()) as AuditResponse
    expect(body.entries.length).toBeGreaterThan(0)
    expect(body.entries.every((entry) => entry.action !== 'tournament.update')).toBe(true)
    expect(body.entries[0]).toMatchObject({ actorId: 'u1', actorUsername: 'alice' })

    const other = (await (
      await call(env, `/api/tournaments/${otherTournamentId}/audit`, bruno)
    ).json()) as AuditResponse
    expect(other.entries.some((entry) => entry.action === 'tournament.update')).toBe(true)
    expect(other.entries.every((entry) => entry.targetId !== tournamentId)).toBe(true)
  })

  it('rifiuta il log ai partecipanti e ai non membri', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    await seedUser(db, 'u2', 'bruno')
    await seedUser(db, 'u3', 'carla')
    const alice = await login(env, 'alice')
    const bruno = await login(env, 'bruno')
    const carla = await login(env, 'carla')

    const tournamentId = await createTournament(env, alice)
    db.prepare(
      `INSERT INTO tournament_participants (tournament_id, user_id, status, added_by, added_at)
       VALUES (?, 'u2', 'active', 'u1', ?)`,
    ).run(tournamentId, NOW)
    db.prepare("UPDATE tournaments SET status = 'published' WHERE id = ?").run(tournamentId)

    const participant = await call(env, `/api/tournaments/${tournamentId}/audit`, bruno)
    expect(participant.status).toBe(403)
    const outsider = await call(env, `/api/tournaments/${tournamentId}/audit`, carla)
    expect(outsider.status).toBe(403)
  })

  it('il voto non produce righe di audit', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice)

    for (const [index, id] of ['e1', 'e2'].entries()) {
      db.prepare(
        `INSERT INTO elements (id, tournament_id, name, image_url, custom_values, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, '{}', ?, ?, ?)`,
      ).run(id, tournamentId, `Elemento ${index + 1}`, `https://images.example.test/${id}.jpg`, index + 1, NOW, NOW)
    }
    db.prepare(
      `INSERT INTO tournament_participants (tournament_id, user_id, status, added_by, added_at)
       VALUES (?, 'u1', 'active', 'u1', ?)`,
    ).run(tournamentId, NOW)

    const phaseResponse = await call(env, `/api/tournaments/${tournamentId}/phases`, alice, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Finale',
        formula: 'elimination',
        voteType: 'duel',
        config: { elimination: { seeding: 'ranking' }, credits: { perVoter: 10, maxPerMatch: null } },
        advance: { type: 'winner' },
      }),
    })
    expect(phaseResponse.status).toBe(201)
    const phaseId = ((await phaseResponse.json()) as { phase: { id: string } }).phase.id
    db.prepare("UPDATE tournaments SET status = 'published' WHERE id = ?").run(tournamentId)

    const opened = await call(env, `/api/phases/${phaseId}/open`, alice, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    expect(opened.status).toBe(200)
    const matchId = (
      db.prepare('SELECT id FROM matches WHERE phase_id = ? ORDER BY position').get(phaseId) as {
        id: string
      }
    ).id

    const before = (db.prepare('SELECT COUNT(*) AS count FROM audit_log').get() as { count: number })
      .count
    const voteResponse = await call(env, `/api/phases/${phaseId}/duels/${matchId}/votes`, alice, {
      method: 'POST',
      body: JSON.stringify({ side: 'a', credits: 1 }),
    })
    expect(voteResponse.status).toBe(200)
    const after = (db.prepare('SELECT COUNT(*) AS count FROM audit_log').get() as { count: number })
      .count
    expect(after).toBe(before)
  })
})
