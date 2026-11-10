import type { DatabaseSync } from 'node:sqlite'

import { describe, expect, it } from 'vitest'

import worker from '../index'
import { createTestEnvironment } from '../../test/d1'
import { hashPassword } from '../auth/password'

const ORIGIN = 'https://versus.test'

interface PhaseBody {
  id: string
  position: number
  name: string
  formula: 'group' | 'elimination' | 'ranking'
  voteType: 'duel' | 'ranking' | 'pick'
  config: Record<string, unknown>
  advance: Record<string, unknown>
  status: string
  openedAt: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string
}

interface PlanBody {
  settings: { selfVoteAllowed: boolean; autoAdvance: boolean }
  phases: PhaseBody[]
}

interface PhaseResponse {
  phase: PhaseBody
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

async function createTournament(
  env: Env,
  token: string,
  body: Record<string, unknown> = { name: 'Torneo di Prova' },
): Promise<string> {
  const response = await call(env, '/api/tournaments', token, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  expect(response.status).toBe(201)
  return ((await response.json()) as { tournament: { id: string } }).tournament.id
}

function groupPhase(name = 'Gironi', overrides: Record<string, unknown> = {}) {
  return {
    name,
    formula: 'group',
    voteType: 'ranking',
    config: {},
    advance: { type: 'top_per_group', n: 2 },
    ...overrides,
  }
}

async function createPhase(
  env: Env,
  token: string,
  tournamentId: string,
  body: Record<string, unknown> = groupPhase(),
): Promise<PhaseBody> {
  const response = await call(env, `/api/tournaments/${tournamentId}/phases`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  expect(response.status).toBe(201)
  return ((await response.json()) as PhaseResponse).phase
}

async function listPlan(env: Env, token: string, tournamentId: string): Promise<PlanBody> {
  const response = await call(env, `/api/tournaments/${tournamentId}/phases`, token)
  expect(response.status).toBe(200)
  return (await response.json()) as PlanBody
}

function publish(db: DatabaseSync, tournamentId: string): void {
  db.prepare("UPDATE tournaments SET status = 'published' WHERE id = ?").run(tournamentId)
}

function seedPhase(
  db: DatabaseSync,
  options: { id: string; tournamentId: string; position: number; status?: string; name?: string },
): void {
  const timestamp = new Date().toISOString()
  db.prepare(
    `INSERT INTO phases (id, tournament_id, position, name, formula, vote_type, config, advance,
       status, opened_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'group', 'ranking', ?, ?, ?, ?, ?, ?)`,
  ).run(
    options.id,
    options.tournamentId,
    options.position,
    options.name ?? `Fase ${options.position}`,
    JSON.stringify({
      deadline: null,
      closeTriggers: [],
      secrecy: 'live',
      votingMode: 'simultaneous',
      credits: { perVoter: 0, maxPerMatch: null },
    }),
    JSON.stringify({ type: 'all' }),
    options.status ?? 'pending',
    options.status && options.status !== 'pending' ? timestamp : null,
    timestamp,
    timestamp,
  )
}

describe('POST /api/tournaments/:id/phases', () => {
  it('salva e rilegge un piano con posizioni contigue e impostazioni', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice, {
      name: 'Torneo di Prova',
      settings: { selfVoteAllowed: false },
    })

    await createPhase(env, alice, tournamentId, groupPhase('Gironi'))
    await createPhase(
      env,
      alice,
      tournamentId,
      {
        name: 'Eliminazione',
        formula: 'elimination',
        voteType: 'duel',
        config: { deadline: '2026-12-01T20:00:00.000Z', closeTriggers: ['deadline'] },
        advance: { type: 'winners' },
      },
    )
    await createPhase(
      env,
      alice,
      tournamentId,
      {
        name: 'Finale',
        formula: 'ranking',
        voteType: 'pick',
        config: {},
        advance: { type: 'winner' },
      },
    )

    const plan = await listPlan(env, alice, tournamentId)

    expect(plan.settings).toEqual({ selfVoteAllowed: false, autoAdvance: false })
    expect(plan.phases.map((phase) => phase.position)).toEqual([1, 2, 3])
    expect(plan.phases.map((phase) => phase.name)).toEqual([
      'Gironi',
      'Eliminazione',
      'Finale',
    ])
    expect(plan.phases[0]).toMatchObject({
      formula: 'group',
      voteType: 'ranking',
      status: 'pending',
      openedAt: null,
      advance: { type: 'top_per_group', n: 2 },
    })
    expect(plan.phases[1]!.config).toMatchObject({
      deadline: '2026-12-01T20:00:00.000Z',
      closeTriggers: ['deadline'],
    })
  })

  it('rifiuta formule, schede e avanzamenti non ammessi con 422', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice)

    const invalid = [
      groupPhase('Sbagliata', { voteType: 'pick' }),
      groupPhase('Sbagliata', { advance: { type: 'winner' } }),
      groupPhase('Sbagliata', { formula: 'elimination', voteType: 'ranking' }),
      groupPhase('Sbagliata', { config: { secrecy: 'pubblica' } }),
    ]

    for (const body of invalid) {
      const response = await call(env, `/api/tournaments/${tournamentId}/phases`, alice, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      expect(response.status).toBe(422)
      expect(await response.json()).toEqual({ error: 'invalid_phase' })
    }

    const plan = await listPlan(env, alice, tournamentId)
    expect(plan.phases).toEqual([])
  })

  it('rifiuta richieste malformate con 400', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice)

    for (const body of [{}, { name: 'Senza formula' }, { ...groupPhase(), name: '   ' }]) {
      const response = await call(env, `/api/tournaments/${tournamentId}/phases`, alice, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'invalid_request' })
    }
  })

  it('rifiuta chi non è organizzatore con 403', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    await seedUser(db, 'u2', 'bruno')
    const alice = await login(env, 'alice')
    const bruno = await login(env, 'bruno')
    const tournamentId = await createTournament(env, alice)

    const response = await call(env, `/api/tournaments/${tournamentId}/phases`, bruno, {
      method: 'POST',
      body: JSON.stringify(groupPhase()),
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'forbidden' })
  })

  it('consente di aggiungere fasi dopo la pubblicazione finché il piano non è avviato', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice)
    publish(db, tournamentId)

    const phase = await createPhase(env, alice, tournamentId)

    expect(phase.position).toBe(1)
    expect(phase.status).toBe('pending')
  })

  it('rifiuta una nuova fase durante il torneo se l ultima fase non è chiusa', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice)
    seedPhase(db, { id: 'p1', tournamentId, position: 1, status: 'open' })
    db.prepare("UPDATE tournaments SET status = 'running' WHERE id = ?").run(tournamentId)

    const response = await call(env, `/api/tournaments/${tournamentId}/phases`, alice, {
      method: 'POST',
      body: JSON.stringify(groupPhase()),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'previous_phase_not_closed' })
  })

  it('consente di aggiungere una fase durante il torneo quando l ultima fase è chiusa', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice)
    seedPhase(db, { id: 'p1', tournamentId, position: 1, status: 'closed' })
    db.prepare("UPDATE tournaments SET status = 'running' WHERE id = ?").run(tournamentId)

    const phase = await createPhase(env, alice, tournamentId, groupPhase('Nuova fase'))

    expect(phase).toMatchObject({ position: 2, status: 'pending' })
  })

  it('risponde 404 per un torneo inesistente', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')

    const response = await call(env, '/api/tournaments/inesistente/phases', alice, {
      method: 'POST',
      body: JSON.stringify(groupPhase()),
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'not_found' })
  })
})

describe('GET /api/tournaments/:id/phases', () => {
  it('restituisce le impostazioni del piano e le fasi in ordine', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice)

    const plan = await listPlan(env, alice, tournamentId)

    expect(plan).toEqual({
      settings: { selfVoteAllowed: true, autoAdvance: false },
      phases: [],
    })
  })

  it('nasconde il piano a chi non è membro del torneo', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    await seedUser(db, 'u2', 'bruno')
    const alice = await login(env, 'alice')
    const bruno = await login(env, 'bruno')
    const tournamentId = await createTournament(env, alice)

    const response = await call(env, `/api/tournaments/${tournamentId}/phases`, bruno)

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'forbidden' })
  })
})

describe('PATCH /api/phases/:id', () => {
  it('modifica una fase pending e persiste i cambiamenti', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice)
    const phase = await createPhase(env, alice, tournamentId)

    const response = await call(env, `/api/phases/${phase.id}`, alice, {
      method: 'PATCH',
      body: JSON.stringify({
        name: 'Semifinali',
        formula: 'elimination',
        voteType: 'duel',
        advance: { type: 'winner' },
      }),
    })

    expect(response.status).toBe(200)
    const changed = ((await response.json()) as PhaseResponse).phase
    expect(changed).toMatchObject({
      name: 'Semifinali',
      formula: 'elimination',
      voteType: 'duel',
      advance: { type: 'winner' },
      status: 'pending',
    })

    const plan = await listPlan(env, alice, tournamentId)
    expect(plan.phases[0]).toMatchObject({ name: 'Semifinali', formula: 'elimination' })
  })

  it('rifiuta una modifica che rende la coppia formula-scheda non valida', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice)
    const phase = await createPhase(env, alice, tournamentId)

    const response = await call(env, `/api/phases/${phase.id}`, alice, {
      method: 'PATCH',
      body: JSON.stringify({ formula: 'elimination' }),
    })

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ error: 'invalid_phase' })
  })

  it('non modifica una fase avviata', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice)
    seedPhase(db, { id: 'p1', tournamentId, position: 1, status: 'open' })
    seedPhase(db, { id: 'p2', tournamentId, position: 2, status: 'closed' })

    for (const id of ['p1', 'p2']) {
      const patch = await call(env, `/api/phases/${id}`, alice, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Nuovo nome' }),
      })
      const remove = await call(env, `/api/phases/${id}`, alice, { method: 'DELETE' })

      expect(patch.status).toBe(409)
      expect(await patch.json()).toEqual({ error: 'phase_not_editable' })
      expect(remove.status).toBe(409)
      expect(await remove.json()).toEqual({ error: 'phase_not_editable' })
    }
  })

  it('modifica una fase pending durante il torneo quando la precedente è chiusa', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice)
    seedPhase(db, { id: 'p1', tournamentId, position: 1, status: 'closed' })
    seedPhase(db, { id: 'p2', tournamentId, position: 2 })
    db.prepare("UPDATE tournaments SET status = 'running' WHERE id = ?").run(tournamentId)

    const response = await call(env, '/api/phases/p2', alice, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Finale corretto' }),
    })

    expect(response.status).toBe(200)
    expect(((await response.json()) as PhaseResponse).phase).toMatchObject({
      name: 'Finale corretto',
      status: 'pending',
    })
  })

  it('rifiuta una fase pending la cui precedente non è chiusa', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice)
    seedPhase(db, { id: 'p1', tournamentId, position: 1, status: 'open' })
    seedPhase(db, { id: 'p2', tournamentId, position: 2 })
    db.prepare("UPDATE tournaments SET status = 'running' WHERE id = ?").run(tournamentId)

    const response = await call(env, '/api/phases/p2', alice, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Nuovo nome' }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'previous_phase_not_closed' })
  })

  it('risponde 404 per una fase inesistente', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')

    const response = await call(env, '/api/phases/inesistente', alice, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Nuovo nome' }),
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'not_found' })
  })
})

describe('DELETE /api/phases/:id', () => {
  it('elimina una fase pending e chiude il buco nelle posizioni', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice)
    const first = await createPhase(env, alice, tournamentId, groupPhase('Prima'))
    const second = await createPhase(env, alice, tournamentId, groupPhase('Seconda'))
    await createPhase(env, alice, tournamentId, groupPhase('Terza'))

    const response = await call(env, `/api/phases/${second.id}`, alice, { method: 'DELETE' })

    expect(response.status).toBe(204)
    const plan = await listPlan(env, alice, tournamentId)
    expect(plan.phases.map((phase) => [phase.id, phase.position, phase.name])).toEqual([
      [first.id, 1, 'Prima'],
      [expect.any(String), 2, 'Terza'],
    ])
  })

  it('rifiuta chi non è organizzatore con 403', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    await seedUser(db, 'u2', 'bruno')
    const alice = await login(env, 'alice')
    const bruno = await login(env, 'bruno')
    const tournamentId = await createTournament(env, alice)
    const phase = await createPhase(env, alice, tournamentId)

    const response = await call(env, `/api/phases/${phase.id}`, bruno, { method: 'DELETE' })

    expect(response.status).toBe(403)
  })
})

describe('PUT /api/tournaments/:id/phases/order', () => {
  it('riordina le fasi e aggiorna le posizioni', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice)
    const a = await createPhase(env, alice, tournamentId, groupPhase('Prima'))
    const b = await createPhase(env, alice, tournamentId, groupPhase('Seconda'))
    const c = await createPhase(env, alice, tournamentId, groupPhase('Terza'))

    const response = await call(env, `/api/tournaments/${tournamentId}/phases/order`, alice, {
      method: 'PUT',
      body: JSON.stringify({ ids: [c.id, a.id, b.id] }),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as { phases: PhaseBody[] }
    expect(body.phases.map((phase) => [phase.name, phase.position])).toEqual([
      ['Terza', 1],
      ['Prima', 2],
      ['Seconda', 3],
    ])
    const plan = await listPlan(env, alice, tournamentId)
    expect(plan.phases.map((phase) => phase.id)).toEqual([c.id, a.id, b.id])
  })

  it('rifiuta elenchi incompleti o duplicati con 400', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice)
    const a = await createPhase(env, alice, tournamentId)
    await createPhase(env, alice, tournamentId)

    for (const ids of [[a.id], [a.id, a.id], [a.id, 'inesistente']]) {
      const response = await call(env, `/api/tournaments/${tournamentId}/phases/order`, alice, {
        method: 'PUT',
        body: JSON.stringify({ ids }),
      })
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'invalid_request' })
    }
  })

  it('rifiuta il riordino se una fase è già avviata', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice)
    seedPhase(db, { id: 'p1', tournamentId, position: 1, status: 'open' })
    seedPhase(db, { id: 'p2', tournamentId, position: 2 })

    const response = await call(env, `/api/tournaments/${tournamentId}/phases/order`, alice, {
      method: 'PUT',
      body: JSON.stringify({ ids: ['p2', 'p1'] }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'phase_not_editable' })
  })
})

describe('modificabilità del piano durante il torneo (A2)', () => {
  it('elimina una fase pending durante il torneo e ricompatta le posizioni', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice)
    seedPhase(db, { id: 'p1', tournamentId, position: 1, status: 'closed' })
    seedPhase(db, { id: 'p2', tournamentId, position: 2 })
    seedPhase(db, { id: 'p3', tournamentId, position: 3 })
    db.prepare("UPDATE tournaments SET status = 'running' WHERE id = ?").run(tournamentId)

    const response = await call(env, '/api/phases/p2', alice, { method: 'DELETE' })

    expect(response.status).toBe(204)
    const plan = await listPlan(env, alice, tournamentId)
    expect(plan.phases.map((phase) => [phase.id, phase.position])).toEqual([
      ['p1', 1],
      ['p3', 2],
    ])
  })

  it('rifiuta di eliminare una fase pending con la precedente non chiusa', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice)
    seedPhase(db, { id: 'p1', tournamentId, position: 1, status: 'open' })
    seedPhase(db, { id: 'p2', tournamentId, position: 2 })
    db.prepare("UPDATE tournaments SET status = 'running' WHERE id = ?").run(tournamentId)

    const response = await call(env, '/api/phases/p2', alice, { method: 'DELETE' })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'previous_phase_not_closed' })
  })

  it('riordina le sole fasi pending durante il torneo', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice)
    seedPhase(db, { id: 'p1', tournamentId, position: 1, status: 'closed' })
    seedPhase(db, { id: 'p2', tournamentId, position: 2, name: 'Seconda' })
    seedPhase(db, { id: 'p3', tournamentId, position: 3, name: 'Terza' })
    db.prepare("UPDATE tournaments SET status = 'running' WHERE id = ?").run(tournamentId)

    const response = await call(env, `/api/tournaments/${tournamentId}/phases/order`, alice, {
      method: 'PUT',
      body: JSON.stringify({ ids: ['p1', 'p3', 'p2'] }),
    })

    expect(response.status).toBe(200)
    const plan = await listPlan(env, alice, tournamentId)
    expect(plan.phases.map((phase) => [phase.id, phase.position])).toEqual([
      ['p1', 1],
      ['p3', 2],
      ['p2', 3],
    ])
  })

  it('rifiuta il riordino che sposta una fase chiusa', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice)
    seedPhase(db, { id: 'p1', tournamentId, position: 1, status: 'closed' })
    seedPhase(db, { id: 'p2', tournamentId, position: 2 })
    db.prepare("UPDATE tournaments SET status = 'running' WHERE id = ?").run(tournamentId)

    const response = await call(env, `/api/tournaments/${tournamentId}/phases/order`, alice, {
      method: 'PUT',
      body: JSON.stringify({ ids: ['p2', 'p1'] }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'phase_not_editable' })
  })

  it('ricalcola l anteprima dopo una modifica al piano', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice)

    const before = await call(env, `/api/tournaments/${tournamentId}/preview`, alice)
    expect(before.status).toBe(200)
    expect(
      ((await before.json()) as { preview: { phases: unknown[] } }).preview.phases,
    ).toHaveLength(0)

    await createPhase(env, alice, tournamentId, groupPhase('Gironi aggiornati'))

    const after = await call(env, `/api/tournaments/${tournamentId}/preview`, alice)
    expect(after.status).toBe(200)
    const body = (await after.json()) as {
      preview: { phases: Array<{ name: string }> }
    }
    expect(body.preview.phases.map((phase) => phase.name)).toEqual(['Gironi aggiornati'])
  })

  it('rifiuta modifiche e riordino a chi non è organizzatore', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    await seedUser(db, 'u2', 'bruno')
    const alice = await login(env, 'alice')
    const bruno = await login(env, 'bruno')
    const tournamentId = await createTournament(env, alice)
    seedPhase(db, { id: 'p1', tournamentId, position: 1 })

    const patch = await call(env, '/api/phases/p1', bruno, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Hack' }),
    })
    const order = await call(env, `/api/tournaments/${tournamentId}/phases/order`, bruno, {
      method: 'PUT',
      body: JSON.stringify({ ids: ['p1'] }),
    })

    expect(patch.status).toBe(403)
    expect(order.status).toBe(403)
  })
})

describe('impostazioni del piano', () => {
  it('persiste selfVoteAllowed e autoAdvance e li restituisce nel piano', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const alice = await login(env, 'alice')
    const tournamentId = await createTournament(env, alice)

    const patched = await call(env, `/api/tournaments/${tournamentId}`, alice, {
      method: 'PATCH',
      body: JSON.stringify({ settings: { selfVoteAllowed: false, autoAdvance: true } }),
    })
    expect(patched.status).toBe(200)
    expect(
      ((await patched.json()) as { tournament: { settings: unknown } }).tournament.settings,
    ).toEqual({ selfVoteAllowed: false, autoAdvance: true })

    const plan = await listPlan(env, alice, tournamentId)
    expect(plan.settings).toEqual({ selfVoteAllowed: false, autoAdvance: true })

    const stored = db
      .prepare('SELECT settings FROM tournaments WHERE id = ?')
      .get(tournamentId) as { settings: string }
    expect(JSON.parse(stored.settings)).toEqual({ selfVoteAllowed: false, autoAdvance: true })
  })
})
