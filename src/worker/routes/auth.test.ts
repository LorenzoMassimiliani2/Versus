import type { DatabaseSync } from 'node:sqlite'

import { describe, expect, it } from 'vitest'

import worker from '../index'
import { createTestEnvironment } from '../../test/d1'
import { hashPassword } from '../auth/password'
import { hashSessionToken } from '../auth/token'

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
  ).run(id, username, await hashPassword(password), isAdmin ? 1 : 0, isActive ? 1 : 0, new Date().toISOString())
  return id
}

function loginRequest(
  username: string,
  password: string,
  options: { ip?: string; origin?: string } = {},
): Request {
  return new Request(`${ORIGIN}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: options.origin ?? ORIGIN,
      'CF-Connecting-IP': options.ip ?? '203.0.113.10',
    },
    body: JSON.stringify({ username, password }),
  })
}

function authenticatedRequest(
  path: string,
  sessionToken: string,
  init: RequestInit = {},
): Request {
  return new Request(`${ORIGIN}${path}`, {
    ...init,
    headers: {
      Origin: ORIGIN,
      Cookie: `versus_session=${sessionToken}`,
      ...init.headers,
    },
  })
}

function sessionTokenFrom(response: Response): string {
  const header = response.headers.get('Set-Cookie') ?? ''
  const match = header.match(/versus_session=([^;]+)/)
  if (!match) throw new Error('Set-Cookie versus_session assente')
  return match[1]!
}

async function login(env: Env, username = 'alice', password = 'password123'): Promise<string> {
  const response = await worker.fetch(loginRequest(username, password), env, {} as ExecutionContext)
  expect(response.status).toBe(200)
  return sessionTokenFrom(response)
}

describe('POST /api/auth/login', () => {
  it('imposta un cookie di sessione con i flag richiesti e salva solo l hash del token', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, { isAdmin: true })

    const response = await worker.fetch(loginRequest('alice', 'password123'), env, {} as ExecutionContext)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      user: { id: 'u1', username: 'alice', isAdmin: true },
    })

    const cookie = response.headers.get('Set-Cookie') ?? ''
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Max-Age=2592000')

    const token = sessionTokenFrom(response)
    const session = db.prepare('SELECT token_hash, expires_at FROM sessions').get() as {
      token_hash: string
      expires_at: string
    }
    expect(session.token_hash).toBe(await hashSessionToken(token))
    expect(session.token_hash).not.toBe(token)
    const days = (new Date(session.expires_at).getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(29.9)
    expect(days).toBeLessThanOrEqual(30)
  })

  it('rifiuta credenziali errate senza creare sessioni e registra il tentativo', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db)

    const response = await worker.fetch(loginRequest('alice', 'sbagliata'), env, {} as ExecutionContext)

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'invalid_credentials' })
    expect(response.headers.get('Set-Cookie')).toBeNull()
    expect(db.prepare('SELECT COUNT(*) AS count FROM sessions').get()).toEqual({ count: 0 })
    const attempts = db.prepare('SELECT key, count FROM login_attempts ORDER BY key').all()
    expect(attempts).toEqual([
      { key: 'ip:203.0.113.10', count: 1 },
      { key: 'username:alice', count: 1 },
    ])
  })

  it('risponde 403 a un utente disattivato e revoca le sue sessioni', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db)
    const token = await login(env)

    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run('u1')

    const response = await worker.fetch(loginRequest('alice', 'password123'), env, {} as ExecutionContext)
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'account_disabled' })

    const session = db.prepare('SELECT revoked_at FROM sessions').get() as { revoked_at: string | null }
    expect(session.revoked_at).not.toBeNull()

    const me = await worker.fetch(authenticatedRequest('/api/me', token), env, {} as ExecutionContext)
    expect(me.status).toBe(401)
  })

  it('rifiuta un body non valido', async () => {
    const { env } = createTestEnvironment()
    const response = await worker.fetch(
      new Request(`${ORIGIN}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({ username: 'AL', password: 'x' }),
      }),
      env,
      {} as ExecutionContext,
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid_request' })
  })

  it('rifiuta le mutazioni con Origin diverso', async () => {
    const { env } = createTestEnvironment()

    const response = await worker.fetch(
      loginRequest('alice', 'password123', { origin: 'https://evil.test' }),
      env,
      {} as ExecutionContext,
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'invalid_origin' })
  })
})

describe('rate limit del login', () => {
  it('risponde 429 dopo 10 tentativi falliti per username', async () => {
    const { env } = createTestEnvironment()
    const results: number[] = []

    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await worker.fetch(
        loginRequest('sconosciuto', 'password-sbagliata', { ip: `203.0.113.${attempt}` }),
        env,
        {} as ExecutionContext,
      )
      results.push(response.status)
      if (attempt === 10) {
        expect(response.headers.get('Retry-After')).toBe('900')
      }
    }

    expect(results.slice(0, 10)).toEqual(Array(10).fill(401))
    expect(results[10]).toBe(429)
  }, 30_000)

  it('risponde 429 dopo 10 tentativi falliti dallo stesso IP anche con username diversi', async () => {
    const { env } = createTestEnvironment()
    const results: number[] = []

    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await worker.fetch(
        loginRequest(`utente${attempt}`, 'password-sbagliata', { ip: '198.51.100.7' }),
        env,
        {} as ExecutionContext,
      )
      results.push(response.status)
    }

    expect(results.slice(0, 10)).toEqual(Array(10).fill(401))
    expect(results[10]).toBe(429)
  }, 30_000)
})

describe('sessione autenticata', () => {
  it('GET /api/me restituisce l utente della sessione', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db)
    const token = await login(env)

    const response = await worker.fetch(authenticatedRequest('/api/me', token), env, {} as ExecutionContext)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ user: { id: 'u1', username: 'alice', isAdmin: false } })
  })

  it('logout revoca la sessione e la stessa richiesta successiva risponde 401', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db)
    const token = await login(env)

    const logout = await worker.fetch(
      authenticatedRequest('/api/auth/logout', token, { method: 'POST' }),
      env,
      {} as ExecutionContext,
    )
    expect(logout.status).toBe(204)
    expect(logout.headers.get('Set-Cookie')).toContain('Max-Age=0')

    const session = db.prepare('SELECT revoked_at FROM sessions').get() as { revoked_at: string | null }
    expect(session.revoked_at).not.toBeNull()

    const me = await worker.fetch(authenticatedRequest('/api/me', token), env, {} as ExecutionContext)
    expect(me.status).toBe(401)
  })

  it('rifiuta una sessione scaduta', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db)
    const token = await login(env)

    db.prepare('UPDATE sessions SET expires_at = ?').run('2020-01-01T00:00:00.000Z')

    const me = await worker.fetch(authenticatedRequest('/api/me', token), env, {} as ExecutionContext)
    expect(me.status).toBe(401)
  })

  it('rifiuta la sessione di un utente disattivato', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db)
    const token = await login(env)

    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run('u1')

    const me = await worker.fetch(authenticatedRequest('/api/me', token), env, {} as ExecutionContext)
    expect(me.status).toBe(401)
  })
})

describe('protezione delle rotte /api', () => {
  it('lascia pubblico solo GET /api/health', async () => {
    const { env } = createTestEnvironment()

    const health = await worker.fetch(
      new Request(`${ORIGIN}/api/health`),
      env,
      {} as ExecutionContext,
    )
    expect(health.status).toBe(200)

    const me = await worker.fetch(new Request(`${ORIGIN}/api/me`), env, {} as ExecutionContext)
    expect(me.status).toBe(401)

    const other = await worker.fetch(
      new Request(`${ORIGIN}/api/altro`),
      env,
      {} as ExecutionContext,
    )
    expect(other.status).toBe(401)

    const logout = await worker.fetch(
      new Request(`${ORIGIN}/api/auth/logout`, { method: 'POST', headers: { Origin: ORIGIN } }),
      env,
      {} as ExecutionContext,
    )
    expect(logout.status).toBe(401)
  })
})
