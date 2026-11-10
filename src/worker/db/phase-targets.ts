export type PhaseTargetStatus = 'pending' | 'open' | 'completed'

export interface PhaseTargetRecord {
  phase_id: string
  target_id: string
  name: string
  position: number
  status: PhaseTargetStatus
  opened_at: string | null
  completed_at: string | null
}

const TARGET_COLUMNS = 'phase_id, target_id, name, position, status, opened_at, completed_at'

export function listPhaseTargets(env: Env, phaseId: string): Promise<PhaseTargetRecord[]> {
  return env.DB.prepare(
    `SELECT ${TARGET_COLUMNS} FROM phase_targets WHERE phase_id = ? ORDER BY position`,
  )
    .bind(phaseId)
    .all<PhaseTargetRecord>()
    .then((result) => result.results)
}

export function findPhaseTarget(
  env: Env,
  phaseId: string,
  targetId: string,
): Promise<PhaseTargetRecord | null> {
  return env.DB.prepare(
    `SELECT ${TARGET_COLUMNS} FROM phase_targets WHERE phase_id = ? AND target_id = ?`,
  )
    .bind(phaseId, targetId)
    .first<PhaseTargetRecord>()
}

export function findOpenPhaseTarget(
  env: Env,
  phaseId: string,
): Promise<PhaseTargetRecord | null> {
  return env.DB.prepare(
    `SELECT ${TARGET_COLUMNS} FROM phase_targets
     WHERE phase_id = ? AND status = 'open' ORDER BY position LIMIT 1`,
  )
    .bind(phaseId)
    .first<PhaseTargetRecord>()
}

export interface NewPhaseTarget {
  targetId: string
  name: string
  position: number
  status: PhaseTargetStatus
  openedAt: string | null
}

export function insertPhaseTargetStatements(
  env: Env,
  phaseId: string,
  targets: readonly NewPhaseTarget[],
): D1PreparedStatement[] {
  return targets.map((target) =>
    env.DB.prepare(
      `INSERT INTO phase_targets (phase_id, target_id, name, position, status, opened_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    ).bind(
      phaseId,
      target.targetId,
      target.name,
      target.position,
      target.status,
      target.openedAt,
    ),
  )
}
