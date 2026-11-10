export const LOGIN_LIMIT = 10
export const LOGIN_WINDOW_MS = 15 * 60 * 1000

export function loginRateKeys(username: string, ip: string): { keys: string[]; windowStart: string } {
  return {
    keys: [`username:${username}`, `ip:${ip}`],
    windowStart: currentWindowStart(),
  }
}

export function currentWindowStart(now = Date.now()): string {
  return new Date(Math.floor(now / LOGIN_WINDOW_MS) * LOGIN_WINDOW_MS).toISOString()
}

export function clientIp(request: Request): string {
  const connectingIp = request.headers.get('CF-Connecting-IP')?.trim()
  if (connectingIp) return connectingIp

  const forwarded = request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
  return forwarded || 'unknown'
}

export async function isLoginRateLimited(
  env: Env,
  keys: string[],
  windowStart: string,
): Promise<boolean> {
  const placeholders = keys.map(() => '?').join(', ')
  const result = await env.DB.prepare(
    `SELECT count FROM login_attempts WHERE window_start = ? AND key IN (${placeholders})`,
  )
    .bind(windowStart, ...keys)
    .all<{ count: number }>()

  return result.results.some((row) => row.count >= LOGIN_LIMIT)
}

export async function recordFailedLogin(
  env: Env,
  keys: string[],
  windowStart: string,
): Promise<void> {
  await env.DB.batch(
    keys.map((key) =>
      env.DB.prepare(
        `INSERT INTO login_attempts (key, window_start, count) VALUES (?, ?, 1)
         ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1`,
      ).bind(key, windowStart),
    ),
  )
}

export async function clearUsernameAttempts(
  env: Env,
  username: string,
  windowStart: string,
): Promise<void> {
  await env.DB.prepare('DELETE FROM login_attempts WHERE key = ? AND window_start = ?')
    .bind(`username:${username}`, windowStart)
    .run()
}

export async function pruneLoginAttempts(env: Env, windowStart: string): Promise<void> {
  await env.DB.prepare('DELETE FROM login_attempts WHERE window_start < ?').bind(windowStart).run()
}
