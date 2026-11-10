import { uuidv7 } from './ids'

/** Riga di `audit_log` in scrittura. `before` e `after` sono serializzati qui. */
export interface AuditEntryInput {
  tournamentId?: string | null
  actorId?: string | null
  action: string
  targetType: string
  targetId?: string | null
  before?: unknown
  after?: unknown
}

export interface AuditLogRecord {
  id: string
  actor_id: string | null
  actor_username: string | null
  action: string
  target_type: string
  target_id: string | null
  before: string | null
  after: string | null
  created_at: string
}

/** Clausola `WHERE` per legare la riga all'esito della transazione. */
export interface AuditCondition {
  sql: string
  params?: (string | number | null)[]
}

function toJson(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value)
}

/**
 * Statement pronto per un batch o per una singola esecuzione. L'helper unico
 * evita che ogni area scriva la propria variante dell'INSERT.
 */
export function auditStatement(
  env: Env,
  now: number,
  entry: AuditEntryInput,
  condition?: AuditCondition,
): D1PreparedStatement {
  const where = condition ? ` WHERE ${condition.sql}` : ''
  return env.DB.prepare(
    `INSERT INTO audit_log (id, tournament_id, actor_id, action, target_type, target_id,
       before, after, created_at)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?${where}`,
  ).bind(
    uuidv7(now),
    entry.tournamentId ?? null,
    entry.actorId ?? null,
    entry.action,
    entry.targetType,
    entry.targetId ?? null,
    toJson(entry.before),
    toJson(entry.after),
    new Date(now).toISOString(),
    ...(condition?.params ?? []),
  )
}

export function writeAudit(env: Env, now: number, entry: AuditEntryInput): Promise<unknown> {
  return auditStatement(env, now, entry).run()
}

/** Voci del torneo, dalla più recente. */
export function listAuditEntries(
  env: Env,
  tournamentId: string,
  limit = 200,
): Promise<AuditLogRecord[]> {
  return env.DB.prepare(
    `SELECT a.id, a.actor_id, u.username AS actor_username, a.action, a.target_type,
       a.target_id, a.before, a.after, a.created_at
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.actor_id
     WHERE a.tournament_id = ?
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT ?`,
  )
    .bind(tournamentId, limit)
    .all<AuditLogRecord>()
    .then((result) => result.results)
}
