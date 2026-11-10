import { hashPassword } from '../auth/password'
import { revokeUserSessions, type AuthContext } from '../auth/session'
import { uuidv7 } from '../db/ids'
import {
  countActiveUsers,
  findUserById,
  findUserByUsername,
  insertUser,
  listUsers,
  updateUserFlags,
  updateUserPassword,
  type UserRecord,
} from '../db/users'
import { writeAudit } from '../db/audit'
import { apiError, json } from '../http/json'

const USERNAME_PATTERN = /^[a-z0-9_.-]{3,32}$/
const PASSWORD_MIN = 8
const PASSWORD_MAX = 128
export const ACTIVE_USER_LIMIT = 20

interface UserSummary {
  id: string
  username: string
  isAdmin: boolean
  isActive: boolean
  createdAt: string
}

function summarize(user: UserRecord): UserSummary {
  return {
    id: user.id,
    username: user.username,
    isAdmin: user.is_admin === 1,
    isActive: user.is_active === 1,
    createdAt: user.created_at,
  }
}

function readCredentials(value: unknown): { username: string; password: string } | null {
  if (typeof value !== 'object' || value === null) return null
  const body = value as { username?: unknown; password?: unknown }
  if (typeof body.username !== 'string' || typeof body.password !== 'string') return null

  const username = body.username.trim().toLowerCase()
  if (!USERNAME_PATTERN.test(username)) return null
  if (body.password.length < PASSWORD_MIN || body.password.length > PASSWORD_MAX) return null

  return { username, password: body.password }
}

function readPassword(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null
  const body = value as { password?: unknown }
  if (typeof body.password !== 'string') return null
  if (body.password.length < PASSWORD_MIN || body.password.length > PASSWORD_MAX) return null
  return body.password
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

async function recordUserAudit(
  env: Env,
  auth: AuthContext,
  action: string,
  target: UserRecord,
  before: unknown,
  after: unknown,
  now: number,
): Promise<void> {
  await writeAudit(env, now, {
    actorId: auth.user.id,
    action,
    targetType: 'user',
    targetId: target.id,
    before,
    after,
  })
}

function forbiddenUnlessAdmin(auth: AuthContext): Response | null {
  return auth.user.isAdmin ? null : apiError(403, 'forbidden')
}

async function listUsersHandler(env: Env, auth: AuthContext, query: string): Promise<Response> {
  const forbidden = forbiddenUnlessAdmin(auth)
  if (forbidden) return forbidden

  const users = await listUsers(env, query)
  return json({ users: users.map(summarize) })
}

async function createUserHandler(
  request: Request,
  env: Env,
  auth: AuthContext,
  now: number,
): Promise<Response> {
  const forbidden = forbiddenUnlessAdmin(auth)
  if (forbidden) return forbidden

  const credentials = readCredentials(await readJson(request))
  if (!credentials) return apiError(400, 'invalid_request')

  if (await findUserByUsername(env, credentials.username)) {
    return apiError(409, 'username_taken')
  }
  if ((await countActiveUsers(env)) >= ACTIVE_USER_LIMIT) {
    return apiError(409, 'user_limit_reached')
  }

  const id = uuidv7(now)
  const passwordHash = await hashPassword(credentials.password)
  const createdAt = new Date(now).toISOString()

  await insertUser(env, {
    id,
    username: credentials.username,
    passwordHash,
    createdAt,
    createdBy: auth.user.id,
  })

  const user = await findUserById(env, id)
  if (!user) return apiError(500, 'internal_error')

  await recordUserAudit(
    env,
    auth,
    'user.create',
    user,
    null,
    { username: user.username, isAdmin: false, isActive: true },
    now,
  )

  return json({ user: summarize(user), initialPassword: credentials.password }, { status: 201 })
}

async function updateUserHandler(
  request: Request,
  env: Env,
  auth: AuthContext,
  userId: string,
  now: number,
): Promise<Response> {
  const forbidden = forbiddenUnlessAdmin(auth)
  if (forbidden) return forbidden

  const body = await readJson(request)
  if (typeof body !== 'object' || body === null) return apiError(400, 'invalid_request')
  const { isActive, isAdmin } = body as { isActive?: unknown; isAdmin?: unknown }
  if (isActive === undefined && isAdmin === undefined) return apiError(400, 'invalid_request')
  if (isActive !== undefined && typeof isActive !== 'boolean') return apiError(400, 'invalid_request')
  if (isAdmin !== undefined && typeof isAdmin !== 'boolean') return apiError(400, 'invalid_request')

  const user = await findUserById(env, userId)
  if (!user) return apiError(404, 'not_found')

  const wasActive = user.is_active === 1
  const wasAdmin = user.is_admin === 1
  const nextActive = typeof isActive === 'boolean' ? isActive : wasActive

  if (nextActive && !wasActive) {
    if ((await countActiveUsers(env)) >= ACTIVE_USER_LIMIT) {
      return apiError(409, 'user_limit_reached')
    }
  }

  const flags: { isActive?: boolean; isAdmin?: boolean } = {}
  if (typeof isActive === 'boolean' && isActive !== wasActive) flags.isActive = isActive
  if (typeof isAdmin === 'boolean' && isAdmin !== wasAdmin) flags.isAdmin = isAdmin

  if (Object.keys(flags).length === 0) return json({ user: summarize(user) })

  await updateUserFlags(env, user.id, flags)

  if (flags.isActive === false) await revokeUserSessions(env, user.id, now)

  if (flags.isActive !== undefined) {
    await recordUserAudit(
      env,
      auth,
      flags.isActive ? 'user.reactivate' : 'user.deactivate',
      user,
      { isActive: wasActive },
      { isActive: flags.isActive },
      now,
    )
  }
  if (flags.isAdmin !== undefined) {
    await recordUserAudit(
      env,
      auth,
      flags.isAdmin ? 'user.promote' : 'user.demote',
      user,
      { isAdmin: wasAdmin },
      { isAdmin: flags.isAdmin },
      now,
    )
  }

  const updated = await findUserById(env, user.id)
  return json({ user: summarize(updated ?? user) })
}

async function resetPasswordHandler(
  request: Request,
  env: Env,
  auth: AuthContext,
  userId: string,
  now: number,
): Promise<Response> {
  const forbidden = forbiddenUnlessAdmin(auth)
  if (forbidden) return forbidden

  const password = readPassword(await readJson(request))
  if (!password) return apiError(400, 'invalid_request')

  const user = await findUserById(env, userId)
  if (!user) return apiError(404, 'not_found')

  await updateUserPassword(env, user.id, await hashPassword(password))
  await revokeUserSessions(env, user.id, now)
  await recordUserAudit(env, auth, 'user.password_reset', user, null, null, now)

  return new Response(null, { status: 204 })
}

/**
 * Instrada le richieste sotto `/api/users`. Restituisce `null` quando il
 * percorso o il metodo non appartengono all'area utenti.
 */
export async function handleUsersRoute(
  request: Request,
  env: Env,
  auth: AuthContext,
  now = Date.now(),
): Promise<Response | null> {
  const url = new URL(request.url)
  const { pathname } = url
  const method = request.method

  if (pathname === '/api/users') {
    if (method === 'GET') return listUsersHandler(env, auth, url.searchParams.get('q') ?? '')
    if (method === 'POST') return createUserHandler(request, env, auth, now)
    return null
  }

  const passwordMatch = pathname.match(/^\/api\/users\/([^/]+)\/password$/)
  if (passwordMatch && method === 'POST') {
    return resetPasswordHandler(request, env, auth, decodeURIComponent(passwordMatch[1]!), now)
  }

  const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/)
  if (userMatch && method === 'PATCH') {
    return updateUserHandler(request, env, auth, decodeURIComponent(userMatch[1]!), now)
  }

  return null
}
