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

function authenticatedRequest(path: string, sessionToken: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  headers.set('Origin', ORIGIN)
  headers.set('Cookie', `versus_session=${sessionToken}`)
  if (init.body !== undefined) headers.set('Content-Type', 'application/json')
  return new Request(`${ORIGIN}${path}`, { ...init, headers })
}

async function login(env: Env, username: string, password: string): Promise<string> {
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
  const cookie = response.headers.get('Set-Cookie') ?? ''
  const match = cookie.match(/versus_session=([^;]+)/)
  if (!match) throw new Error('Set-Cookie versus_session assente')
  return match[1]!
}

async function adminToken(env: Env): Promise<string> {
  return login(env, 'alice', 'password123')
}

function jsonBody(value: unknown): string {
  return JSON.stringify(value)
}

describe('autorizzazione delle rotte utenti', () => {
  it('risponde 401 senza sessione', async () => {
    const { env } = createTestEnvironment()

    for (const init of [
      { method: 'GET' },
      { method: 'POST', body: jsonBody({ username: 'nuovo', password: 'password123' }) },
      { method: 'PATCH', body: jsonBody({ isActive: false }) },
      { method: 'POST', body: jsonBody({ password: 'password123' }) },
    ] as RequestInit[]) {
      const path = init.method === 'POST' || init.method === 'PATCH' ? '/api/users/u2' : '/api/users'
      const response = await worker.fetch(
        new Request(`${ORIGIN}${path}`, {
          ...init,
          headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
        }),
        env,
        {} as ExecutionContext,
      )
      expect(response.status).toBe(401)
    }
  })

  it('risponde 403 a un utente che non è admin su tutte le rotte', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, { id: 'admin', username: 'alice', isAdmin: true })
    await seedUser(db, { id: 'u2', username: 'bruno' })
    const token = await login(env, 'bruno', 'password123')

    const responses = await Promise.all([
      worker.fetch(authenticatedRequest('/api/users', token), env, {} as ExecutionContext),
      worker.fetch(
        authenticatedRequest('/api/users', token, {
          method: 'POST',
          body: jsonBody({ username: 'nuovo', password: 'password123' }),
        }),
        env,
        {} as ExecutionContext,
      ),
      worker.fetch(
        authenticatedRequest('/api/users/u2', token, {
          method: 'PATCH',
          body: jsonBody({ isActive: false }),
        }),
        env,
        {} as ExecutionContext,
      ),
      worker.fetch(
        authenticatedRequest('/api/users/u2/password', token, {
          method: 'POST',
          body: jsonBody({ password: 'password456' }),
        }),
        env,
        {} as ExecutionContext,
      ),
    ])

    for (const response of responses) {
      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: 'forbidden' })
    }

    const bruno = db.prepare('SELECT is_active, is_admin FROM users WHERE id = ?').get('u2') as {
      is_active: number
      is_admin: number
    }
    expect(bruno).toEqual({ is_active: 1, is_admin: 0 })
  })
})

describe('POST /api/users', () => {
  it('crea un utente e restituisce la password iniziale una sola volta', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, { id: 'admin', username: 'alice', isAdmin: true })
    const token = await adminToken(env)

    const created = await worker.fetch(
      authenticatedRequest('/api/users', token, {
        method: 'POST',
        body: jsonBody({ username: '  Bruno ', password: 'password123' }),
      }),
      env,
      {} as ExecutionContext,
    )

    expect(created.status).toBe(201)
    const createdBody = (await created.json()) as {
      user: { id: string; username: string; isAdmin: boolean; isActive: boolean }
      initialPassword: string
    }
    expect(createdBody.user).toMatchObject({
      username: 'bruno',
      isAdmin: false,
      isActive: true,
    })
    expect(createdBody.user.id).toBeTruthy()
    expect(createdBody.initialPassword).toBe('password123')
    expect(JSON.stringify(createdBody)).not.toContain('password_hash')
    expect(JSON.stringify(createdBody)).not.toContain('pbkdf2$')

    const list = await worker.fetch(
      authenticatedRequest('/api/users?q=bruno', token),
      env,
      {} as ExecutionContext,
    )
    expect(list.status).toBe(200)
    const listBody = (await list.json()) as { users: unknown[] }
    expect(listBody.users).toEqual([
      {
        id: createdBody.user.id,
        username: 'bruno',
        isAdmin: false,
        isActive: true,
        createdAt: expect.any(String),
      },
    ])
    expect(JSON.stringify(listBody)).not.toContain('password')

    await login(env, 'bruno', 'password123')
  })

  it('rifiuta uno username già esistente con 409', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, { id: 'admin', username: 'alice', isAdmin: true })
    await seedUser(db, { id: 'u2', username: 'bruno' })
    const token = await adminToken(env)

    const response = await worker.fetch(
      authenticatedRequest('/api/users', token, {
        method: 'POST',
        body: jsonBody({ username: 'bruno', password: 'password123' }),
      }),
      env,
      {} as ExecutionContext,
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'username_taken' })
  })

  it('rifiuta username o password non validi con 400', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, { id: 'admin', username: 'alice', isAdmin: true })
    const token = await adminToken(env)

    for (const body of [
      { username: 'ab', password: 'password123' },
      { username: 'con spazio', password: 'password123' },
      { username: 'valido', password: 'corta' },
      { username: 'valido' },
    ]) {
      const response = await worker.fetch(
        authenticatedRequest('/api/users', token, { method: 'POST', body: jsonBody(body) }),
        env,
        {} as ExecutionContext,
      )
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'invalid_request' })
    }
  })
})

describe('GET /api/users', () => {
  it('elenca gli utenti e filtra per username con q', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, { id: 'admin', username: 'alice', isAdmin: true })
    await seedUser(db, { id: 'u2', username: 'bruno' })
    await seedUser(db, { id: 'u3', username: 'alberto' })
    const token = await adminToken(env)

    const all = await worker.fetch(
      authenticatedRequest('/api/users', token),
      env,
      {} as ExecutionContext,
    )
    const allBody = (await all.json()) as { users: { username: string }[] }
    expect(allBody.users.map((user) => user.username).sort()).toEqual(['alberto', 'alice', 'bruno'])

    const filtered = await worker.fetch(
      authenticatedRequest('/api/users?q=alb', token),
      env,
      {} as ExecutionContext,
    )
    const filteredBody = (await filtered.json()) as { users: { username: string }[] }
    expect(filteredBody.users.map((user) => user.username)).toEqual(['alberto'])
  })
})

describe('PATCH /api/users/:id', () => {
  it('disattiva un utente e revoca tutte le sue sessioni', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, { id: 'admin', username: 'alice', isAdmin: true })
    await seedUser(db, { id: 'u2', username: 'bruno' })
    const admin = await adminToken(env)
    const bruno = await login(env, 'bruno', 'password123')
    await login(env, 'bruno', 'password123')

    const response = await worker.fetch(
      authenticatedRequest('/api/users/u2', admin, {
        method: 'PATCH',
        body: jsonBody({ isActive: false }),
      }),
      env,
      {} as ExecutionContext,
    )

    expect(response.status).toBe(200)
    expect(((await response.json()) as { user: { isActive: boolean } }).user.isActive).toBe(false)

    const sessions = db.prepare('SELECT revoked_at FROM sessions WHERE user_id = ?').all('u2') as {
      revoked_at: string | null
    }[]
    expect(sessions).toHaveLength(2)
    expect(sessions.every((session) => session.revoked_at !== null)).toBe(true)

    const me = await worker.fetch(authenticatedRequest('/api/me', bruno), env, {} as ExecutionContext)
    expect(me.status).toBe(401)

    const loginAttempt = await worker.fetch(
      new Request(`${ORIGIN}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: ORIGIN,
          'CF-Connecting-IP': '198.51.100.1',
        },
        body: jsonBody({ username: 'bruno', password: 'password123' }),
      }),
      env,
      {} as ExecutionContext,
    )
    expect(loginAttempt.status).toBe(403)
  })

  it('riattiva un utente disattivato', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, { id: 'admin', username: 'alice', isAdmin: true })
    await seedUser(db, { id: 'u2', username: 'bruno', isActive: false })
    const token = await adminToken(env)

    const response = await worker.fetch(
      authenticatedRequest('/api/users/u2', token, {
        method: 'PATCH',
        body: jsonBody({ isActive: true }),
      }),
      env,
      {} as ExecutionContext,
    )

    expect(response.status).toBe(200)
    expect(((await response.json()) as { user: { isActive: boolean } }).user.isActive).toBe(true)
    await login(env, 'bruno', 'password123')
  })

  it('promuove e revoca un admin tracciando ogni operazione in audit_log', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, { id: 'admin', username: 'alice', isAdmin: true })
    await seedUser(db, { id: 'u2', username: 'bruno' })
    const token = await adminToken(env)

    const promote = await worker.fetch(
      authenticatedRequest('/api/users/u2', token, {
        method: 'PATCH',
        body: jsonBody({ isAdmin: true }),
      }),
      env,
      {} as ExecutionContext,
    )
    expect(promote.status).toBe(200)
    expect(((await promote.json()) as { user: { isAdmin: boolean } }).user.isAdmin).toBe(true)

    const demote = await worker.fetch(
      authenticatedRequest('/api/users/u2', token, {
        method: 'PATCH',
        body: jsonBody({ isAdmin: false }),
      }),
      env,
      {} as ExecutionContext,
    )
    expect(demote.status).toBe(200)
    expect(((await demote.json()) as { user: { isAdmin: boolean } }).user.isAdmin).toBe(false)

    const audit = db
      .prepare('SELECT actor_id, action, target_type, target_id, before, after FROM audit_log ORDER BY created_at')
      .all() as {
      actor_id: string
      action: string
      target_type: string
      target_id: string
      before: string
      after: string
    }[]

    expect(audit).toHaveLength(2)
    expect(audit[0]).toMatchObject({
      actor_id: 'admin',
      action: 'user.promote',
      target_type: 'user',
      target_id: 'u2',
      before: JSON.stringify({ isAdmin: false }),
      after: JSON.stringify({ isAdmin: true }),
    })
    expect(audit[1]).toMatchObject({
      actor_id: 'admin',
      action: 'user.demote',
      target_id: 'u2',
    })
  })

  it('rifiuta un body non valido e un utente inesistente', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, { id: 'admin', username: 'alice', isAdmin: true })
    const token = await adminToken(env)

    for (const body of [{}, { isActive: 'no' }, { unknown: true }]) {
      const response = await worker.fetch(
        authenticatedRequest('/api/users/admin', token, {
          method: 'PATCH',
          body: jsonBody(body),
        }),
        env,
        {} as ExecutionContext,
      )
      expect(response.status).toBe(400)
    }

    const missing = await worker.fetch(
      authenticatedRequest('/api/users/inesistente', token, {
        method: 'PATCH',
        body: jsonBody({ isActive: false }),
      }),
      env,
      {} as ExecutionContext,
    )
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ error: 'not_found' })
  })
})

describe('POST /api/users/:id/password', () => {
  it('imposta la nuova password e revoca tutte le sessioni attive', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, { id: 'admin', username: 'alice', isAdmin: true })
    await seedUser(db, { id: 'u2', username: 'bruno' })
    const admin = await adminToken(env)
    const bruno = await login(env, 'bruno', 'password123')

    const response = await worker.fetch(
      authenticatedRequest('/api/users/u2/password', admin, {
        method: 'POST',
        body: jsonBody({ password: 'nuovapassword' }),
      }),
      env,
      {} as ExecutionContext,
    )

    expect(response.status).toBe(204)

    const sessions = db.prepare('SELECT revoked_at FROM sessions WHERE user_id = ?').all('u2') as {
      revoked_at: string | null
    }[]
    expect(sessions.length).toBeGreaterThan(0)
    expect(sessions.every((session) => session.revoked_at !== null)).toBe(true)

    const oldSession = await worker.fetch(
      authenticatedRequest('/api/me', bruno),
      env,
      {} as ExecutionContext,
    )
    expect(oldSession.status).toBe(401)

    await login(env, 'bruno', 'nuovapassword')

    const oldPassword = await worker.fetch(
      new Request(`${ORIGIN}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: ORIGIN,
          'CF-Connecting-IP': '198.51.100.2',
        },
        body: jsonBody({ username: 'bruno', password: 'password123' }),
      }),
      env,
      {} as ExecutionContext,
    )
    expect(oldPassword.status).toBe(401)
  })

  it('rifiuta una password non valida e un utente inesistente', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, { id: 'admin', username: 'alice', isAdmin: true })
    await seedUser(db, { id: 'u2', username: 'bruno' })
    const token = await adminToken(env)

    const invalid = await worker.fetch(
      authenticatedRequest('/api/users/u2/password', token, {
        method: 'POST',
        body: jsonBody({ password: 'corta' }),
      }),
      env,
      {} as ExecutionContext,
    )
    expect(invalid.status).toBe(400)

    const missing = await worker.fetch(
      authenticatedRequest('/api/users/inesistente/password', token, {
        method: 'POST',
        body: jsonBody({ password: 'password123' }),
      }),
      env,
      {} as ExecutionContext,
    )
    expect(missing.status).toBe(404)
  })
})

describe('limite di 20 utenti attivi', () => {
  async function seedActiveUsers(db: DatabaseSync, count: number): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      await seedUser(db, { id: `u${index}`, username: `utente${index}` })
    }
  }

  it('rifiuta il ventunesimo utente attivo con 409', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, { id: 'admin', username: 'alice', isAdmin: true })
    await seedActiveUsers(db, 19)
    const token = await adminToken(env)

    const response = await worker.fetch(
      authenticatedRequest('/api/users', token, {
        method: 'POST',
        body: jsonBody({ username: 'ventunesimo', password: 'password123' }),
      }),
      env,
      {} as ExecutionContext,
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'user_limit_reached' })
    expect(db.prepare('SELECT COUNT(*) AS count FROM users').get()).toEqual({ count: 20 })
  })

  it('un utente disattivato libera un posto e la riattivazione oltre il limite è rifiutata', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, { id: 'admin', username: 'alice', isAdmin: true })
    await seedActiveUsers(db, 19)
    const token = await adminToken(env)

    const deactivate = await worker.fetch(
      authenticatedRequest('/api/users/u0', token, {
        method: 'PATCH',
        body: jsonBody({ isActive: false }),
      }),
      env,
      {} as ExecutionContext,
    )
    expect(deactivate.status).toBe(200)

    const create = await worker.fetch(
      authenticatedRequest('/api/users', token, {
        method: 'POST',
        body: jsonBody({ username: 'nuovo', password: 'password123' }),
      }),
      env,
      {} as ExecutionContext,
    )
    expect(create.status).toBe(201)

    const reactivate = await worker.fetch(
      authenticatedRequest('/api/users/u0', token, {
        method: 'PATCH',
        body: jsonBody({ isActive: true }),
      }),
      env,
      {} as ExecutionContext,
    )
    expect(reactivate.status).toBe(409)
    expect(await reactivate.json()).toEqual({ error: 'user_limit_reached' })
  })
})
