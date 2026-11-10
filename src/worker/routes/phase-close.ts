import type { AuthContext } from '../auth/session'
import { findPhaseById, type PhaseRecord } from '../db/phases'
import {
  countBallotVotersMissingVotes,
  countDuelVotersMissingVotes,
  findLatestResult,
  hasVoteTables,
  listPhaseBallotVotes,
  listPhaseDuelVotes,
  loadResultsOperation,
} from '../db/phase-close'
import { listPhaseGroups, type PhaseResultRecord } from '../db/phase-operation'
import { uuidv7 } from '../db/ids'
import { findOrganizerRole, findTournamentById } from '../db/tournaments'
import { apiError, json } from '../http/json'
import {
  computePhaseResults,
  type ResultsPayload,
} from '../../domain/phase-results'
import {
  defaultPhaseConfig,
  type PhaseAdvance,
  type PhaseConfig,
} from '../../domain/phases'
import { serialisePhase } from './phases'

export type CloseTriggerReason = 'deadline' | 'all_voted'

interface SerialisedResult {
  version: number
  closedAt: string
  configSnapshot: unknown
  results: ResultsPayload
}

interface CloseOutcome {
  phase: PhaseRecord
  result: SerialisedResult | null
  unresolved: string[][]
}

type CloseFailure = { error: 'repechage_unavailable' }

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function phaseConfig(phase: PhaseRecord): PhaseConfig {
  return parseJson<PhaseConfig>(phase.config, defaultPhaseConfig())
}

function phaseAdvance(phase: PhaseRecord): PhaseAdvance {
  return parseJson<PhaseAdvance>(phase.advance, { type: 'all' })
}

function serialiseResult(row: PhaseResultRecord): SerialisedResult {
  return {
    version: row.version,
    closedAt: row.closed_at,
    configSnapshot: parseJson<unknown>(row.config_snapshot, {}),
    results: parseJson<ResultsPayload>(row.results, {
      phaseId: row.phase_id,
      groups: [],
      matches: [],
      ranking: [],
      qualified: [],
      repechage: null,
      winnerElementId: null,
    }),
  }
}

/**
 * Verifica i trigger configurati. `deadline` ha precedenza su `all_voted` perché
 * è il criterio più semplice da valutare e la chiusura è comunque la stessa.
 */
export async function evaluateCloseTrigger(
  env: Env,
  phase: PhaseRecord,
  now: number,
): Promise<CloseTriggerReason | null> {
  const config = phaseConfig(phase)
  const triggers = config.closeTriggers

  if (
    triggers.includes('deadline') &&
    config.deadline !== null &&
    now >= Date.parse(config.deadline)
  ) {
    return 'deadline'
  }

  if (triggers.includes('all_voted')) {
    if (!(await hasVoteTables(env))) return 'all_voted'
    if (phase.vote_type === 'duel') {
      const missing = await countDuelVotersMissingVotes(env, phase.id)
      return missing === 0 ? 'all_voted' : null
    }
    const targetCount = phase.formula === 'group' ? (await listPhaseGroups(env, phase.id)).length : 1
    const missing = await countBallotVotersMissingVotes(env, phase.id, targetCount)
    return missing === 0 ? 'all_voted' : null
  }

  return null
}

/**
 * Calcola i risultati e chiude la fase con un batch condizionale su
 * `status = 'open'`. Due richieste concorrenti non producono due snapshot:
 * il claim e l'insert sono nella stessa transazione e l'insert è protetto da
 * `INSERT OR IGNORE` più il vincolo `UNIQUE(phase_id, version)`.
 */
async function closePhase(
  env: Env,
  phase: PhaseRecord,
  now: number,
): Promise<CloseOutcome | CloseFailure> {
  const config = phaseConfig(phase)
  const advance = phaseAdvance(phase)
  const withVotes = await hasVoteTables(env)
  const [operation, duelVotes, ballotVotes] = await Promise.all([
    loadResultsOperation(env, phase.id),
    withVotes ? listPhaseDuelVotes(env, phase.id) : Promise.resolve([]),
    withVotes ? listPhaseBallotVotes(env, phase.id) : Promise.resolve([]),
  ])

  const computed = computePhaseResults({
    phase: {
      id: phase.id,
      formula: phase.formula,
      voteType: phase.vote_type,
      config,
      advance,
    },
    ...operation,
    duelVotes,
    ballotVotes,
  })

  if (!computed.ok) return { error: computed.error }

  const timestamp = new Date(now).toISOString()

  if (computed.requiresManualResolution) {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE phases SET status = 'awaiting_resolution', updated_at = ?
         WHERE id = ? AND status = 'open'`,
      ).bind(timestamp, phase.id),
      env.DB.prepare(
        `UPDATE tournaments SET updated_at = ?
         WHERE id = ? AND EXISTS (
           SELECT 1 FROM phases WHERE id = ? AND status = 'awaiting_resolution' AND updated_at = ?
         )`,
      ).bind(timestamp, phase.tournament_id, phase.id, timestamp),
    ])

    const updated = await findPhaseById(env, phase.id)
    return {
      phase: updated ?? phase,
      result: null,
      unresolved: computed.unresolved,
    }
  }

  const resultsJson = JSON.stringify(computed.results)
  const configSnapshot = JSON.stringify({
    formula: phase.formula,
    voteType: phase.vote_type,
    config,
    advance,
  })

  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `UPDATE phases SET status = 'closed', closed_at = ?, updated_at = ?
       WHERE id = ? AND status = 'open'`,
    ).bind(timestamp, timestamp, phase.id),
    env.DB.prepare(
      `INSERT OR IGNORE INTO phase_results (id, phase_id, version, closed_at,
         config_snapshot, results)
       SELECT ?, ?, 1, ?, ?, ?
       WHERE EXISTS (
         SELECT 1 FROM phases WHERE id = ? AND status = 'closed' AND closed_at = ?
       )`,
    ).bind(
      uuidv7(now),
      phase.id,
      timestamp,
      configSnapshot,
      resultsJson,
      phase.id,
      timestamp,
    ),
    env.DB.prepare(
      `UPDATE tournaments SET updated_at = ?
       WHERE id = ? AND EXISTS (
         SELECT 1 FROM phase_results WHERE phase_id = ? AND closed_at = ?
       )`,
    ).bind(timestamp, phase.tournament_id, phase.id, timestamp),
  ]

  if (advance.type === 'winner' && computed.results.winnerElementId) {
    statements.push(
      env.DB.prepare(
        `UPDATE tournaments
         SET status = 'concluded', concluded_at = COALESCE(concluded_at, ?),
           winner_element_id = ?, updated_at = ?
         WHERE id = ? AND status = 'running' AND EXISTS (
           SELECT 1 FROM phase_results WHERE phase_id = ? AND closed_at = ?
         )`,
      ).bind(
        timestamp,
        computed.results.winnerElementId,
        timestamp,
        phase.tournament_id,
        phase.id,
        timestamp,
      ),
    )
  }

  await env.DB.batch(statements)

  const [updated, resultRow] = await Promise.all([
    findPhaseById(env, phase.id),
    findLatestResult(env, phase.id),
  ])

  return {
    phase: updated ?? phase,
    result: resultRow ? serialiseResult(resultRow) : null,
    unresolved: [],
  }
}

/**
 * Chiude la fase se un trigger configurato è scaduto o soddisfatto. Usata dalle
 * richieste di stato della fase per applicare la regola lazy.
 */
export async function closePhaseIfDue(
  env: Env,
  phase: PhaseRecord,
  now: number,
): Promise<PhaseRecord> {
  if (phase.status !== 'open') return phase
  const trigger = await evaluateCloseTrigger(env, phase, now)
  if (!trigger) return phase
  const outcome = await closePhase(env, phase, now)
  if ('error' in outcome) return phase
  return outcome.phase
}

async function closePhaseHandler(
  env: Env,
  auth: AuthContext,
  phaseId: string,
  now: number,
): Promise<Response> {
  const phase = await findPhaseById(env, phaseId)
  if (!phase) return apiError(404, 'not_found')
  if (!(await findOrganizerRole(env, phase.tournament_id, auth.user.id))) {
    return apiError(403, 'forbidden')
  }
  if (!(await findTournamentById(env, phase.tournament_id))) {
    return apiError(404, 'not_found')
  }

  if (phase.status === 'awaiting_resolution') {
    return apiError(409, 'phase_awaiting_resolution')
  }
  if (phase.status === 'cancelled' || phase.status === 'pending') {
    return apiError(409, 'phase_not_open')
  }

  if (phase.status === 'closed') {
    const resultRow = await findLatestResult(env, phase.id)
    return json({
      phase: serialisePhase(phase),
      result: resultRow ? serialiseResult(resultRow) : null,
    })
  }

  const outcome = await closePhase(env, phase, now)
  if ('error' in outcome) return apiError(409, outcome.error)

  return json({
    phase: serialisePhase(outcome.phase),
    result: outcome.result,
    ...(outcome.phase.status === 'awaiting_resolution'
      ? { unresolved: outcome.unresolved }
      : {}),
  })
}

/** Instrada `POST /api/phases/:id/close`. */
export async function handlePhaseCloseRoute(
  request: Request,
  env: Env,
  auth: AuthContext,
  now = Date.now(),
): Promise<Response | null> {
  const { pathname } = new URL(request.url)
  const closeMatch = pathname.match(/^\/api\/phases\/([^/]+)\/close$/)
  if (closeMatch && request.method === 'POST') {
    return closePhaseHandler(env, auth, decodeURIComponent(closeMatch[1]!), now)
  }
  return null
}
