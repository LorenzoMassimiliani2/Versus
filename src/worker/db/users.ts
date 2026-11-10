export interface UserRecord {
  id: string
  username: string
  password_hash: string
  is_admin: number
  is_active: number
  created_at: string
}

const USER_COLUMNS = 'id, username, password_hash, is_admin, is_active, created_at'

export function findUserByUsername(env: Env, username: string): Promise<UserRecord | null> {
  return env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE username = ?`)
    .bind(username)
    .first<UserRecord>()
}

export function findUserById(env: Env, id: string): Promise<UserRecord | null> {
  return env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(id).first<UserRecord>()
}

export function listUsers(env: Env, query: string): Promise<UserRecord[]> {
  const term = `%${query.trim().toLowerCase()}%`
  return env.DB.prepare(
    `SELECT ${USER_COLUMNS} FROM users WHERE username LIKE ? ORDER BY username`,
  )
    .bind(term)
    .all<UserRecord>()
    .then((result) => result.results)
}

export function countActiveUsers(env: Env): Promise<number> {
  return env.DB.prepare('SELECT COUNT(*) AS count FROM users WHERE is_active = 1')
    .first<{ count: number }>()
    .then((row) => row?.count ?? 0)
}

export interface NewUser {
  id: string
  username: string
  passwordHash: string
  createdAt: string
  createdBy: string
}

export function insertUser(env: Env, user: NewUser): Promise<unknown> {
  return env.DB.prepare(
    `INSERT INTO users (id, username, password_hash, is_admin, is_active, created_at, created_by)
     VALUES (?, ?, ?, 0, 1, ?, ?)`,
  )
    .bind(user.id, user.username, user.passwordHash, user.createdAt, user.createdBy)
    .run()
}

export interface UserFlags {
  isActive?: boolean
  isAdmin?: boolean
}

export function updateUserFlags(env: Env, id: string, flags: UserFlags): Promise<unknown> {
  const assignments: string[] = []
  const values: (string | number)[] = []
  if (flags.isActive !== undefined) {
    assignments.push('is_active = ?')
    values.push(flags.isActive ? 1 : 0)
  }
  if (flags.isAdmin !== undefined) {
    assignments.push('is_admin = ?')
    values.push(flags.isAdmin ? 1 : 0)
  }
  return env.DB.prepare(`UPDATE users SET ${assignments.join(', ')} WHERE id = ?`)
    .bind(...values, id)
    .run()
}

export function updateUserPassword(env: Env, id: string, passwordHash: string): Promise<unknown> {
  return env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .bind(passwordHash, id)
    .run()
}
