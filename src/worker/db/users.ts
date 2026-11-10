export interface UserRecord {
  id: string
  username: string
  password_hash: string
  is_admin: number
  is_active: number
}

const USER_COLUMNS = 'id, username, password_hash, is_admin, is_active'

export function findUserByUsername(env: Env, username: string): Promise<UserRecord | null> {
  return env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE username = ?`)
    .bind(username)
    .first<UserRecord>()
}
