import type { PhaseFormula, PhaseStatus, PhaseVoteType } from '../../domain/phases'

export interface PhaseRecord {
  id: string
  tournament_id: string
  position: number
  name: string
  formula: PhaseFormula
  vote_type: PhaseVoteType
  config: string
  advance: string
  status: PhaseStatus
  opened_at: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
}

const PHASE_COLUMNS = `id, tournament_id, position, name, formula, vote_type, config, advance,
  status, opened_at, closed_at, created_at, updated_at`

export function listPhases(env: Env, tournamentId: string): Promise<PhaseRecord[]> {
  return env.DB.prepare(
    `SELECT ${PHASE_COLUMNS} FROM phases WHERE tournament_id = ? ORDER BY position`,
  )
    .bind(tournamentId)
    .all<PhaseRecord>()
    .then((result) => result.results)
}

export function findPhaseById(env: Env, id: string): Promise<PhaseRecord | null> {
  return env.DB.prepare(`SELECT ${PHASE_COLUMNS} FROM phases WHERE id = ?`)
    .bind(id)
    .first<PhaseRecord>()
}

export interface NewPhase {
  id: string
  tournamentId: string
  position: number
  name: string
  formula: PhaseFormula
  voteType: PhaseVoteType
  config: string
  advance: string
  createdAt: string
  updatedAt: string
}

export function insertPhase(env: Env, phase: NewPhase): Promise<unknown> {
  return env.DB.prepare(
    `INSERT INTO phases (id, tournament_id, position, name, formula, vote_type, config, advance,
       status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
  )
    .bind(
      phase.id,
      phase.tournamentId,
      phase.position,
      phase.name,
      phase.formula,
      phase.voteType,
      phase.config,
      phase.advance,
      phase.createdAt,
      phase.updatedAt,
    )
    .run()
}

export interface PhaseChanges {
  name?: string
  formula?: PhaseFormula
  voteType?: PhaseVoteType
  config?: string
  advance?: string
}

export function updatePhase(
  env: Env,
  id: string,
  changes: PhaseChanges,
  updatedAt: string,
): Promise<unknown> {
  const assignments = ['updated_at = ?']
  const values: string[] = [updatedAt]

  if (changes.name !== undefined) {
    assignments.push('name = ?')
    values.push(changes.name)
  }
  if (changes.formula !== undefined) {
    assignments.push('formula = ?')
    values.push(changes.formula)
  }
  if (changes.voteType !== undefined) {
    assignments.push('vote_type = ?')
    values.push(changes.voteType)
  }
  if (changes.config !== undefined) {
    assignments.push('config = ?')
    values.push(changes.config)
  }
  if (changes.advance !== undefined) {
    assignments.push('advance = ?')
    values.push(changes.advance)
  }

  return env.DB.prepare(`UPDATE phases SET ${assignments.join(', ')} WHERE id = ?`)
    .bind(...values, id)
    .run()
}

/**
 * Elimina la fase e chiude il buco nelle posizioni. Il passaggio temporaneo a
 * posizioni negative evita di violare UNIQUE(tournament_id, position) mentre
 * le righe successive scivolano indietro.
 */
export function deletePhase(env: Env, phase: PhaseRecord): Promise<unknown> {
  return env.DB.batch([
    env.DB.prepare('DELETE FROM phases WHERE id = ?').bind(phase.id),
    env.DB.prepare(
      'UPDATE phases SET position = -position WHERE tournament_id = ? AND position > ?',
    ).bind(phase.tournament_id, phase.position),
    env.DB.prepare(
      'UPDATE phases SET position = -position - 1 WHERE tournament_id = ? AND position < 0',
    ).bind(phase.tournament_id),
  ])
}

/** Riscrive le posizioni nell'ordine ricevuto, passando da valori negativi. */
export function reorderPhases(env: Env, tournamentId: string, ids: string[]): Promise<unknown> {
  const statements = [
    env.DB.prepare('UPDATE phases SET position = -position WHERE tournament_id = ?').bind(
      tournamentId,
    ),
    ...ids.map((id, index) =>
      env.DB.prepare('UPDATE phases SET position = ? WHERE id = ? AND tournament_id = ?').bind(
        index + 1,
        id,
        tournamentId,
      ),
    ),
  ]
  return env.DB.batch(statements)
}
