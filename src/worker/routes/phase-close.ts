import type { AuthContext } from '../auth/session'
import { auditStatement } from '../db/audit'
import { findPhaseById, type PhaseRecord } from '../db/phases'
import {
  countBallotVotersMissingVotes,
  countDuelVotersMissingVotes,
  findLatestResult,
  hasVoteTable,
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
  type ComputeResultsResult,
  type ResultsPayload,
} from '../../domain/phase-results'
import { parseTournamentSettings } from '../../domain/tournament-settings'
import type { ResolutionOrder } from '../../domain/phase-resolution'
import { openPendingPhase, phaseAdvance, phaseConfig } from '../phase-open'
import { serialisePhase } from './phases'

export type CloseTriggerReason = 'deadline' | 'all_voted'

export interface PhaseResolutionInput {
  resolutions: readonly ResolutionOrder[]
  note: string
  actorId: string
}

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

type CloseFailure = { error: 'repechage_unavailable' | 'invalid_resolution' }

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
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
    if (phase.vote_type === 'duel') {
      if (!(await hasVoteTable(env, 'duel_votes'))) return 'all_voted'
      const missing = await countDuelVotersMissingVotes(env, phase.id)
      return missing === 0 ? 'all_voted' : null
    }
    if (!(await hasVoteTable(env, 'ballot_votes'))) return 'all_voted'
    const targetCount = phase.formula === 'group' ? (await listPhaseGroups(env, phase.id)).length : 1
    const missing = await countBallotVotersMissingVotes(env, phase.id, targetCount)
    return missing === 0 ? 'all_voted' : null
  }

  return null
}

/**
 * Calcola i risultati correnti della fase. Usata sia dalla chiusura sia dalla
 * risoluzione manuale, così il calcolo ha una sola sorgente.
 */
export async function computePhaseResultsForPhase(
  env: Env,
  phase: PhaseRecord,
  resolutions?: readonly ResolutionOrder[],
): Promise<ComputeResultsResult> {
  const config = phaseConfig(phase)
  const advance = phaseAdvance(phase)
  const [hasDuelVotes, hasBallotVotes] = await Promise.all([
    hasVoteTable(env, 'duel_votes'),
    hasVoteTable(env, 'ballot_votes'),
  ])
  const [operation, duelVotes, ballotVotes] = await Promise.all([
    loadResultsOperation(env, phase.id),
    hasDuelVotes ? listPhaseDuelVotes(env, phase.id) : Promise.resolve([]),
    hasBallotVotes ? listPhaseBallotVotes(env, phase.id) : Promise.resolve([]),
  ])

  return computePhaseResults({
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
    ...(resolutions ? { resolutions } : {}),
  })
}

/**
 * Calcola i risultati e chiude la fase con un batch condizionale. Due
 * richieste concorrenti non producono due snapshot: il claim e l'insert sono
 * nella stessa transazione e l'insert è protetto da `INSERT OR IGNORE` più il
 * vincolo `UNIQUE(phase_id, version)`.
 *
 * Con `resolution` il claim richiede `status = 'awaiting_resolution'` e il
 * batch scrive anche la riga di `audit_log` con nota e ordinamenti scelti.
 */
export async function closePhase(
  env: Env,
  phase: PhaseRecord,
  now: number,
  resolution?: PhaseResolutionInput,
): Promise<CloseOutcome | CloseFailure> {
  const config = phaseConfig(phase)
  const advance = phaseAdvance(phase)
  const computed = await computePhaseResultsForPhase(env, phase, resolution?.resolutions)

  if (!computed.ok) return { error: computed.error }

  const timestamp = new Date(now).toISOString()

  if (computed.requiresManualResolution) {
    // Una risoluzione incompleta non deve chiudere la fase: la richiesta non
    // copre tutti i target ambigui o l'ordinamento non è applicabile.
    if (resolution) return { error: 'invalid_resolution' }

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
  const claimStatus = resolution ? 'awaiting_resolution' : 'open'

  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `UPDATE phases SET status = 'closed', closed_at = ?, updated_at = ?
       WHERE id = ? AND status = ?`,
    ).bind(timestamp, timestamp, phase.id, claimStatus),
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

  if (resolution) {
    statements.push(
      auditStatement(
        env,
        now,
        {
          tournamentId: phase.tournament_id,
          actorId: resolution.actorId,
          action: 'phase.resolve',
          targetType: 'phase',
          targetId: phase.id,
          before: { status: 'awaiting_resolution' },
          after: {
            status: 'closed',
            note: resolution.note,
            resolutions: resolution.resolutions,
          },
        },
        {
          sql: 'EXISTS (SELECT 1 FROM phase_results WHERE phase_id = ? AND closed_at = ?)',
          params: [phase.id, timestamp],
        },
      ),
    )
  }

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


export interface AutoAdvanceOutcome {
  status: 'opened' | 'concluded' | 'skipped' | 'failed'
  phaseId?: string
  reason?: string
  error?: string
}

/**
 * Se `settings.autoAdvance` è attivo apre la fase immediatamente successiva
 * quando è `pending`. Un errore di apertura non annulla la chiusura: viene
 * restituito all'organizzatore e la fase successiva resta `pending`.
 */
export async function applyAutoAdvance(
  env: Env,
  closedPhase: PhaseRecord,
  now: number,
): Promise<AutoAdvanceOutcome | null> {
  const tournament = await findTournamentById(env, closedPhase.tournament_id)
  if (!tournament) return null
  if (!parseTournamentSettings(tournament.settings).autoAdvance) return null

  const next = await env.DB.prepare(
    `SELECT id, tournament_id, position, name, formula, vote_type, config, advance,
       status, opened_at, closed_at, created_at, updated_at
     FROM phases WHERE tournament_id = ? AND position = ?`,
  )
    .bind(closedPhase.tournament_id, closedPhase.position + 1)
    .first<PhaseRecord>()

  if (!next) {
    const timestamp = new Date(now).toISOString()
    await env.DB.prepare(
      `UPDATE tournaments SET status = 'concluded', concluded_at = COALESCE(concluded_at, ?),
         updated_at = ?
       WHERE id = ? AND status = 'running'`,
    )
      .bind(timestamp, timestamp, closedPhase.tournament_id)
      .run()
    return { status: 'concluded' }
  }

  if (next.status !== 'pending') {
    return { status: 'skipped', reason: 'next_not_pending' }
  }

  const opened = await openPendingPhase(env, next, { now })
  if (!opened.ok) {
    // Due chiusure concorrenti: se l'altra richiesta ha già aperto la fase,
    // l'apertura è comunque avvenuta una sola volta.
    const current = await findPhaseById(env, next.id)
    if (current?.status === 'open') return { status: 'opened', phaseId: current.id }
    return { status: 'failed', error: opened.error }
  }
  return { status: 'opened', phaseId: opened.phase.id }
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
  if (outcome.phase.status === 'closed') {
    await applyAutoAdvance(env, outcome.phase, now)
  }
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
    // Ripetere la chiusura è idempotente; un eventuale avanzamento automatico
    // fallito in precedenza può essere ritentato.
    const [resultRow, autoAdvance] = await Promise.all([
      findLatestResult(env, phase.id),
      applyAutoAdvance(env, phase, now),
    ])
    return json({
      phase: serialisePhase(phase),
      result: resultRow ? serialiseResult(resultRow) : null,
      ...(autoAdvance ? { autoAdvance } : {}),
    })
  }

  const outcome = await closePhase(env, phase, now)
  if ('error' in outcome) return apiError(409, outcome.error)

  const autoAdvance =
    outcome.phase.status === 'closed' ? await applyAutoAdvance(env, outcome.phase, now) : null

  return json({
    phase: serialisePhase(outcome.phase),
    result: outcome.result,
    ...(outcome.phase.status === 'awaiting_resolution'
      ? { unresolved: outcome.unresolved }
      : {}),
    ...(autoAdvance ? { autoAdvance } : {}),
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
