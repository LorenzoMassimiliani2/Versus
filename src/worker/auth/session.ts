import { uuidv7 } from '../db/ids'
import { createSessionToken, hashSessionToken } from './token'

export const SESSION_COOKIE = 'versus_session'
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000

export interface SessionUser {
  id: string
  username: string
  isAdmin: boolean
}

export interface AuthContext {
  sessionId: string
  user: SessionUser
}

interface SessionRow {
  session_id: string
  expires_at: string
  id: string
  username: string
  is_admin: number
  is_active: number
}

export function parseCookies(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>()
  if (!header) return cookies

  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=')
    if (separator === -1) continue
    const name = pair.slice(0, separator).trim()
    const value = pair.slice(separator + 1).trim()
    if (name) cookies.set(name, value)
  }
  return cookies
}

export function readSessionToken(request: Request): string | null {
  return parseCookies(request.headers.get('Cookie')).get(SESSION_COOKIE) ?? null
}

export async function authenticate(
  request: Request,
  env: Env,
  now = Date.now(),
): Promise<AuthContext | null> {
  const token = readSessionToken(request)
  if (!token) return null

  const tokenHash = await hashSessionToken(token)
  const row = await env.DB.prepare(
    `SELECT s.id AS session_id, s.expires_at, u.id, u.username, u.is_admin, u.is_active
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.revoked_at IS NULL`,
  )
    .bind(tokenHash)
    .first<SessionRow>()

  if (!row) return null
  if (new Date(row.expires_at).getTime() <= now) return null
  if (row.is_active !== 1) return null

  return {
    sessionId: row.session_id,
    user: { id: row.id, username: row.username, isAdmin: row.is_admin === 1 },
  }
}

export interface CreatedSession {
  token: string
  expiresAt: string
}

export async function createSession(
  env: Env,
  userId: string,
  now = Date.now(),
): Promise<CreatedSession> {
  const token = createSessionToken()
  const tokenHash = await hashSessionToken(token)
  const createdAt = new Date(now).toISOString()
  const expiresAt = new Date(now + SESSION_DURATION_MS).toISOString()

  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(uuidv7(now), userId, tokenHash, createdAt, expiresAt)
    .run()

  return { token, expiresAt }
}

export async function revokeSession(env: Env, sessionId: string, now = Date.now()): Promise<void> {
  await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
    .bind(new Date(now).toISOString(), sessionId)
    .run()
}

export async function revokeUserSessions(env: Env, userId: string, now = Date.now()): Promise<void> {
  await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
    .bind(new Date(now).toISOString(), userId)
    .run()
}

export function sessionCookie(token: string, now = Date.now()): string {
  const maxAge = Math.floor(SESSION_DURATION_MS / 1000)
  const expires = new Date(now + SESSION_DURATION_MS).toUTCString()
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}; Expires=${expires}`
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
}
