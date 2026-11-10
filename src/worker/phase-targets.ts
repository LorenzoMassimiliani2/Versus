import type { PhaseConfig, PhaseFormula } from '../domain/phases'
import {
  findOpenPhaseTarget,
  findPhaseTarget,
  type PhaseTargetRecord,
} from './db/phase-targets'
import type { PhaseRecord } from './db/phases'

export interface TargetSpecInput {
  id: string
  /**
   * Id del target cosi come compare in `ballot_votes`: l'id della sfida per
   * `elimination`, del girone per `group`, della fase per le altre formule.
   */
  targetId: string
  name: string
}

export interface TargetSourceMatch {
  id: string
  groupId: string | null
  round: number
  position: number
  status: 'pending' | 'open' | 'closed' | 'bye'
  elementAId: string | null
  elementBId: string | null
}

export interface TargetSourceGroup {
  id: string
  name: string
  position: number
}

function matchLabel(
  match: TargetSourceMatch,
  elementNames: ReadonlyMap<string, string>,
): string {
  const names = [match.elementAId, match.elementBId]
    .map((id) => (id ? elementNames.get(id) : undefined))
    .filter((name): name is string => typeof name === 'string' && name.length > 0)
  return names.length > 0 ? names.join(' vs ') : `Sfida ${match.round}-${match.position}`
}

/**
 * Target votabili della fase nell'ordine in cui la modalita sequenziale li apre.
 * Funzione pura: la persistenza avviene in `phase_open`.
 */
export function sequentialTargetSpecs(input: {
  phase: { id: string; name: string; formula: PhaseFormula }
  groups: readonly TargetSourceGroup[]
  matches: readonly TargetSourceMatch[]
  elementNames: ReadonlyMap<string, string>
}): TargetSpecInput[] {
  if (input.phase.formula === 'elimination') {
    return [...input.matches]
      .filter((match) => match.status !== 'bye')
      .sort((a, b) => a.round - b.round || a.position - b.position)
      .map((match) => ({
        id: match.id,
        targetId: match.id,
        name: matchLabel(match, input.elementNames),
      }))
  }

  if (input.phase.formula === 'group') {
    return [...input.groups]
      .sort((a, b) => a.position - b.position)
      .map((group) => ({ id: group.id, targetId: group.id, name: group.name }))
  }

  return [{ id: input.phase.id, targetId: input.phase.id, name: input.phase.name }]
}

/** Target di voto a cui appartiene una sfida. */
export function matchTargetId(
  phase: Pick<PhaseRecord, 'id' | 'formula'>,
  match: Pick<TargetSourceMatch, 'id' | 'groupId'>,
): string | null {
  if (phase.formula === 'elimination') return match.id
  if (phase.formula === 'group') return match.groupId
  return phase.id
}

function closeMatchesStatements(
  env: Env,
  phase: Pick<PhaseRecord, 'id' | 'formula'>,
  targetId: string,
  timestamp: string,
): D1PreparedStatement[] {
  if (phase.formula === 'elimination') {
    return [
      env.DB.prepare(
        `UPDATE matches SET status = 'closed', closed_at = ?
         WHERE phase_id = ? AND id = ? AND status = 'open'`,
      ).bind(timestamp, phase.id, targetId),
    ]
  }
  if (phase.formula === 'group') {
    return [
      env.DB.prepare(
        `UPDATE matches SET status = 'closed', closed_at = ?
         WHERE phase_id = ? AND group_id = ? AND status = 'open'`,
      ).bind(timestamp, phase.id, targetId),
    ]
  }
  return []
}

function openMatchesStatements(
  env: Env,
  phase: Pick<PhaseRecord, 'id' | 'formula'>,
  targetId: string,
): D1PreparedStatement[] {
  if (phase.formula === 'elimination') {
    return [
      env.DB.prepare(
        `UPDATE matches SET status = 'open', closed_at = NULL
         WHERE phase_id = ? AND id = ? AND status = 'pending'`,
      ).bind(phase.id, targetId),
    ]
  }
  if (phase.formula === 'group') {
    return [
      env.DB.prepare(
        `UPDATE matches SET status = 'open', closed_at = NULL
         WHERE phase_id = ? AND group_id = ? AND status = 'pending'`,
      ).bind(phase.id, targetId),
    ]
  }
  return []
}

async function countMissingDuelVotes(
  env: Env,
  phaseId: string,
  where: string,
  params: (string | number)[],
): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM phase_voters pv
     WHERE pv.phase_id = ? AND EXISTS (
       SELECT 1 FROM matches m
       WHERE m.phase_id = ? AND ${where}
         AND NOT EXISTS (
           SELECT 1 FROM duel_votes dv
           WHERE dv.match_id = m.id AND dv.voter_id = pv.user_id
         )
     )`,
  )
    .bind(phaseId, phaseId, ...params)
    .first<{ count: number }>()
  return row?.count ?? 0
}

/**
 * Vero quando ogni votante attivo ha votato o si e' astenuto su tutti gli
 * elementi del target. L'astensione e' una riga in `duel_votes`.
 */
export async function targetIsComplete(
  env: Env,
  phase: Pick<PhaseRecord, 'id' | 'formula' | 'vote_type'>,
  target: Pick<PhaseTargetRecord, 'target_id'>,
): Promise<boolean> {
  if (phase.vote_type === 'duel') {
    if (phase.formula === 'elimination') {
      const missing = await countMissingDuelVotes(env, phase.id, 'm.id = ?', [target.target_id])
      return missing === 0
    }
    const missing = await countMissingDuelVotes(env, phase.id, "m.group_id = ? AND m.status <> 'bye'", [
      target.target_id,
    ])
    return missing === 0
  }

  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM phase_voters pv
     WHERE pv.phase_id = ? AND NOT EXISTS (
       SELECT 1 FROM ballot_votes bv
       WHERE bv.phase_id = ? AND bv.target_id = ? AND bv.voter_id = pv.user_id
     )`,
  )
    .bind(phase.id, phase.id, target.target_id)
    .first<{ count: number }>()
  return (row?.count ?? 0) === 0
}

export interface AdvanceTargetOutcome {
  advanced: boolean
  targetId: string | null
  nextTargetId: string | null
}

/**
 * Chiude il target corrente e apre il successivo. Il claim condizionale su
 * `status = 'open'` rende l'operazione idempotente: due richieste concorrenti
 * non completano due volte lo stesso target.
 */
export async function advanceTarget(
  env: Env,
  phase: Pick<PhaseRecord, 'id' | 'formula' | 'tournament_id'>,
  target: PhaseTargetRecord,
  now: number,
): Promise<AdvanceTargetOutcome> {
  const timestamp = new Date(now).toISOString()
  const claim = await env.DB.prepare(
    `UPDATE phase_targets SET status = 'completed', completed_at = ?
     WHERE phase_id = ? AND target_id = ? AND status = 'open'`,
  )
    .bind(timestamp, phase.id, target.target_id)
    .run()
  if (claim.meta.changes === 0) {
    return { advanced: false, targetId: target.target_id, nextTargetId: null }
  }

  const next = await env.DB.prepare(
    `SELECT phase_id, target_id, name, position, status, opened_at, completed_at
     FROM phase_targets
     WHERE phase_id = ? AND status = 'pending' ORDER BY position LIMIT 1`,
  )
    .bind(phase.id)
    .first<PhaseTargetRecord>()

  const statements: D1PreparedStatement[] = [
    ...closeMatchesStatements(env, phase, target.target_id, timestamp),
  ]
  if (next) {
    statements.push(
      env.DB.prepare(
        `UPDATE phase_targets SET status = 'open', opened_at = ?
         WHERE phase_id = ? AND target_id = ? AND status = 'pending'`,
      ).bind(timestamp, phase.id, next.target_id),
      ...openMatchesStatements(env, phase, next.target_id),
    )
  }
  statements.push(
    env.DB.prepare('UPDATE phases SET updated_at = ? WHERE id = ?').bind(timestamp, phase.id),
    env.DB.prepare('UPDATE tournaments SET updated_at = ? WHERE id = ?').bind(
      timestamp,
      phase.tournament_id,
    ),
  )

  await env.DB.batch(statements)
  return {
    advanced: true,
    targetId: target.target_id,
    nextTargetId: next?.target_id ?? null,
  }
}

/** Apre il target successivo quando il corrente e' completo. */
export async function maybeAdvanceSequential(
  env: Env,
  phase: Pick<PhaseRecord, 'id' | 'formula' | 'vote_type' | 'tournament_id'>,
  config: PhaseConfig,
  now: number,
): Promise<AdvanceTargetOutcome | null> {
  if (config.votingMode !== 'sequential') return null
  const current = await findOpenPhaseTarget(env, phase.id)
  if (!current) return null
  if (!(await targetIsComplete(env, phase, current))) return null
  return advanceTarget(env, phase, current, now)
}

/**
 * Passaggio forzato dall'organizzatore. Con `targetId` l'operazione e'
 * idempotente: se il target e' gia' completato non avanza un secondo target.
 */
export async function forceAdvanceSequential(
  env: Env,
  phase: Pick<PhaseRecord, 'id' | 'formula' | 'tournament_id'>,
  now: number,
  targetId?: string,
): Promise<AdvanceTargetOutcome | null> {
  if (targetId) {
    const target = await findPhaseTarget(env, phase.id, targetId)
    if (!target) return null
    if (target.status !== 'open') {
      const open = await findOpenPhaseTarget(env, phase.id)
      return { advanced: false, targetId: target.target_id, nextTargetId: open?.target_id ?? null }
    }
    return advanceTarget(env, phase, target, now)
  }

  const current = await findOpenPhaseTarget(env, phase.id)
  if (!current) return { advanced: false, targetId: null, nextTargetId: null }
  return advanceTarget(env, phase, current, now)
}
