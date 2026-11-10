import { DUMMY_PASSWORD_HASH, verifyPassword } from '../auth/password'
import {
  clearUsernameAttempts,
  clientIp,
  isLoginRateLimited,
  loginRateKeys,
  pruneLoginAttempts,
  recordFailedLogin,
} from '../auth/rate-limit'
import {
  clearedSessionCookie,
  createSession,
  revokeSession,
  revokeUserSessions,
  sessionCookie,
  type AuthContext,
} from '../auth/session'
import { findUserByUsername } from '../db/users'
import { apiError, json } from '../http/json'

const USERNAME_PATTERN = /^[a-z0-9_.-]{3,32}$/
const PASSWORD_MIN = 8
const PASSWORD_MAX = 128

interface LoginBody {
  username?: unknown
  password?: unknown
}

function readLoginBody(value: unknown): { username: string; password: string } | null {
  if (typeof value !== 'object' || value === null) return null
  const body = value as LoginBody
  if (typeof body.username !== 'string' || typeof body.password !== 'string') return null

  const username = body.username.trim().toLowerCase()
  const password = body.password
  if (!USERNAME_PATTERN.test(username)) return null
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) return null

  return { username, password }
}

export async function handleLogin(request: Request, env: Env, now = Date.now()): Promise<Response> {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return apiError(400, 'invalid_request')
  }

  const credentials = readLoginBody(payload)
  if (!credentials) return apiError(400, 'invalid_request')

  const { keys, windowStart } = loginRateKeys(credentials.username, clientIp(request))
  await pruneLoginAttempts(env, windowStart)
  if (await isLoginRateLimited(env, keys, windowStart)) {
    return apiError(429, 'rate_limited', { 'Retry-After': '900' })
  }

  const user = await findUserByUsername(env, credentials.username)
  const matches = await verifyPassword(
    credentials.password,
    user?.password_hash ?? DUMMY_PASSWORD_HASH,
  )

  if (!user || !matches) {
    await recordFailedLogin(env, keys, windowStart)
    return apiError(401, 'invalid_credentials')
  }

  if (user.is_active !== 1) {
    await revokeUserSessions(env, user.id, now)
    return apiError(403, 'account_disabled')
  }

  const session = await createSession(env, user.id, now)
  await clearUsernameAttempts(env, credentials.username, windowStart)

  return json(
    { user: { id: user.id, username: user.username, isAdmin: user.is_admin === 1 } },
    { status: 200, headers: { 'Set-Cookie': sessionCookie(session.token, now) } },
  )
}

export async function handleLogout(env: Env, auth: AuthContext, now = Date.now()): Promise<Response> {
  await revokeSession(env, auth.sessionId, now)
  return new Response(null, { status: 204, headers: { 'Set-Cookie': clearedSessionCookie() } })
}

export function handleMe(auth: AuthContext): Response {
  return json({ user: auth.user })
}
