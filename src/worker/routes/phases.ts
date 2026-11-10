import type { AuthContext } from '../auth/session'
import {
  validatePhaseCreate,
  validatePhasePatch,
  type PhaseAdvance,
  type PhaseConfig,
  type PhaseDraft,
  type PhaseFormula,
  type PhaseStatus,
  type PhaseVoteType,
} from '../../domain/phases'
import { parseTournamentSettings } from '../../domain/tournament-settings'
import { uuidv7 } from '../db/ids'
import {
  deletePhase,
  findPhaseById,
  insertPhase,
  listPhases,
  reorderPhases,
  updatePhase,
  type PhaseRecord,
} from '../db/phases'
import { findOrganizerRole, findTournamentById, findTournamentRole } from '../db/tournaments'
import { apiError, json } from '../http/json'
import { closePhaseIfDue, handlePhaseCloseRoute } from './phase-close'
import { handlePhaseOpeningRoute } from './phase-opening'
import { handlePhaseResolutionRoute } from './phase-resolution'
import { handlePhaseResultsRoute } from './phase-results'
import { handlePhaseTargetsRoute } from './phase-targets'
import { handlePhaseVotesRoute } from './phase-votes'

interface PhaseBody {
  id: string
  position: number
  name: string
  formula: PhaseFormula
  voteType: PhaseVoteType
  config: PhaseConfig
  advance: PhaseAdvance
  status: PhaseStatus
  openedAt: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function serialisePhase(phase: PhaseRecord): PhaseBody {
  return {
    id: phase.id,
    position: phase.position,
    name: phase.name,
    formula: phase.formula,
    voteType: phase.vote_type,
    config: parseJson<PhaseConfig>(phase.config, {
      deadline: null,
      closeTriggers: [],
      secrecy: 'live',
      votingMode: 'simultaneous',
      credits: { perVoter: 0, maxPerMatch: null },
    }),
    advance: parseJson<PhaseAdvance>(phase.advance, { type: 'all' }),
    status: phase.status,
    openedAt: phase.opened_at,
    closedAt: phase.closed_at,
    createdAt: phase.created_at,
    updatedAt: phase.updated_at,
  }
}

function draftFromRecord(phase: PhaseRecord): PhaseDraft {
  const body = serialisePhase(phase)
  return {
    name: body.name,
    formula: body.formula,
    voteType: body.voteType,
    config: body.config,
    advance: body.advance,
  }
}

function sortByPosition(phases: PhaseRecord[]): PhaseRecord[] {
  return [...phases].sort((a, b) => a.position - b.position)
}

/** Il torneo è avviato quando almeno una fase non è più `pending`. */
function planStarted(phases: PhaseRecord[]): boolean {
  return phases.some((phase) => phase.status !== 'pending')
}

/**
 * A2: prima dell'avvio tutto è modificabile; dopo l'avvio la coda `pending` è
 * modificabile solo se la fase non pending che la precede è `closed`.
 */
function isPendingEditable(phases: PhaseRecord[], phase: PhaseRecord): boolean {
  if (phase.status !== 'pending') return false
  if (!planStarted(phases)) return true

  // Le fasi pending formano una coda: conta l'ultima fase non pending che le precede.
  const ordered = sortByPosition(phases)
  const index = ordered.findIndex((item) => item.id === phase.id)
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const previous = ordered[cursor]!
    if (previous.status !== 'pending') return previous.status === 'closed'
  }
  return true
}

/** Dopo l'avvio si può aggiungere in coda solo quando l'ultima fase è chiusa. */
function canAppendPhase(phases: PhaseRecord[]): boolean {
  if (!planStarted(phases)) return true
  const last = sortByPosition(phases).at(-1)
  return last === undefined || last.status === 'closed'
}

/** 404 se il torneo non esiste, 403 se l'utente non lo organizza. */
async function authorizeOrganizer(
  env: Env,
  auth: AuthContext,
  tournamentId: string,
): Promise<Response | null> {
  if (!(await findTournamentById(env, tournamentId))) return apiError(404, 'not_found')
  if (!(await findOrganizerRole(env, tournamentId, auth.user.id))) {
    return apiError(403, 'forbidden')
  }
  return null
}

async function listPhasesHandler(
  env: Env,
  auth: AuthContext,
  tournamentId: string,
  now: number,
): Promise<Response> {
  const tournament = await findTournamentById(env, tournamentId)
  if (!tournament) return apiError(404, 'not_found')

  const role = await findTournamentRole(env, tournamentId, auth.user.id)
  if (!role) return apiError(403, 'forbidden')

  const stored = await listPhases(env, tournamentId)
  let changed = false
  for (const phase of stored) {
    const updated = await closePhaseIfDue(env, phase, now)
    if (updated.status !== phase.status || updated.updated_at !== phase.updated_at) {
      changed = true
    }
  }
  // La chiusura lazy può aver aperto la fase successiva: il piano va riletto.
  const phases = changed ? await listPhases(env, tournamentId) : stored
  return json({
    settings: parseTournamentSettings(tournament.settings),
    phases: phases.map(serialisePhase),
  })
}

async function createPhaseHandler(
  request: Request,
  env: Env,
  auth: AuthContext,
  tournamentId: string,
  now: number,
): Promise<Response> {
  const denied = await authorizeOrganizer(env, auth, tournamentId)
  if (denied) return denied

  const tournament = await findTournamentById(env, tournamentId)
  if (!tournament) return apiError(404, 'not_found')
  if (
    tournament.status !== 'draft' &&
    tournament.status !== 'published' &&
    tournament.status !== 'running'
  ) {
    return apiError(409, 'tournament_not_editable')
  }

  const result = validatePhaseCreate(await readJson(request))
  if (!result.ok) return apiError(result.error === 'invalid_phase' ? 422 : 400, result.error)

  const phases = await listPhases(env, tournamentId)
  if (!canAppendPhase(phases)) return apiError(409, 'previous_phase_not_closed')

  const position = phases.reduce((max, phase) => Math.max(max, phase.position), 0) + 1
  const timestamp = new Date(now).toISOString()
  const id = uuidv7(now)

  await insertPhase(env, {
    id,
    tournamentId,
    position,
    name: result.phase.name,
    formula: result.phase.formula,
    voteType: result.phase.voteType,
    config: JSON.stringify(result.phase.config),
    advance: JSON.stringify(result.phase.advance),
    createdAt: timestamp,
    updatedAt: timestamp,
  })

  const phase = await findPhaseById(env, id)
  if (!phase) return apiError(500, 'internal_error')
  return json({ phase: serialisePhase(phase) }, { status: 201 })
}

async function findPhaseContext(
  env: Env,
  auth: AuthContext,
  phaseId: string,
): Promise<PhaseRecord | Response> {
  const phase = await findPhaseById(env, phaseId)
  if (!phase) return apiError(404, 'not_found')

  const denied = await authorizeOrganizer(env, auth, phase.tournament_id)
  if (denied) return denied
  return phase
}

async function patchPhaseHandler(
  request: Request,
  env: Env,
  auth: AuthContext,
  phaseId: string,
  now: number,
): Promise<Response> {
  const phase = await findPhaseContext(env, auth, phaseId)
  if (phase instanceof Response) return phase

  if (phase.status !== 'pending') return apiError(409, 'phase_not_editable')

  const phases = await listPhases(env, phase.tournament_id)
  if (!isPendingEditable(phases, phase)) {
    return apiError(409, 'previous_phase_not_closed')
  }

  const result = validatePhasePatch(await readJson(request), draftFromRecord(phase))
  if (!result.ok) return apiError(result.error === 'invalid_phase' ? 422 : 400, result.error)

  await updatePhase(
    env,
    phase.id,
    {
      name: result.phase.name,
      formula: result.phase.formula,
      voteType: result.phase.voteType,
      config: JSON.stringify(result.phase.config),
      advance: JSON.stringify(result.phase.advance),
    },
    new Date(now).toISOString(),
  )

  const updated = await findPhaseById(env, phase.id)
  if (!updated) return apiError(500, 'internal_error')
  return json({ phase: serialisePhase(updated) })
}

async function deletePhaseHandler(
  env: Env,
  auth: AuthContext,
  phaseId: string,
): Promise<Response> {
  const phase = await findPhaseContext(env, auth, phaseId)
  if (phase instanceof Response) return phase

  if (phase.status !== 'pending') return apiError(409, 'phase_not_editable')

  const phases = await listPhases(env, phase.tournament_id)
  if (!isPendingEditable(phases, phase)) {
    return apiError(409, 'previous_phase_not_closed')
  }

  await deletePhase(env, phase)
  return new Response(null, { status: 204 })
}

async function reorderPhasesHandler(
  request: Request,
  env: Env,
  auth: AuthContext,
  tournamentId: string,
): Promise<Response> {
  const denied = await authorizeOrganizer(env, auth, tournamentId)
  if (denied) return denied

  const tournament = await findTournamentById(env, tournamentId)
  if (!tournament) return apiError(404, 'not_found')
  if (
    tournament.status !== 'draft' &&
    tournament.status !== 'published' &&
    tournament.status !== 'running'
  ) {
    return apiError(409, 'tournament_not_editable')
  }

  const body = await readJson(request)
  const ids =
    typeof body === 'object' && body !== null ? (body as { ids?: unknown }).ids : undefined
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
    return apiError(400, 'invalid_request')
  }

  const phases = sortByPosition(await listPhases(env, tournamentId))
  const currentIds = new Set(phases.map((phase) => phase.id))
  const nextIds = ids as string[]
  if (
    new Set(nextIds).size !== nextIds.length ||
    nextIds.length !== currentIds.size ||
    nextIds.some((id) => !currentIds.has(id))
  ) {
    return apiError(400, 'invalid_request')
  }

  const byId = new Map(phases.map((phase) => [phase.id, phase]))
  const proposed: PhaseRecord[] = nextIds.map((id, index) => {
    const phase = byId.get(id)!
    return { ...phase, position: index + 1 }
  })

  // Le fasi avviate o chiuse non cambiano posizione: si riordinano solo le pending.
  for (const [index, id] of nextIds.entries()) {
    const phase = byId.get(id)!
    if (phase.status !== 'pending' && phase.position !== index + 1) {
      return apiError(409, 'phase_not_editable')
    }
  }

  if (planStarted(phases)) {
    for (const phase of proposed) {
      if (phase.status !== 'pending') continue
      if (!isPendingEditable(proposed, phase)) {
        return apiError(409, 'previous_phase_not_closed')
      }
    }
  }

  await reorderPhases(env, tournamentId, nextIds)
  const reordered = await listPhases(env, tournamentId)
  return json({ phases: reordered.map(serialisePhase) })
}

/**
 * Instrada il piano di fasi. Restituisce `null` quando percorso e metodo non
 * appartengono a quest'area.
 */
export async function handlePhasesRoute(
  request: Request,
  env: Env,
  auth: AuthContext,
  now = Date.now(),
): Promise<Response | null> {
  const { pathname } = new URL(request.url)
  const method = request.method

  const votesResponse = await handlePhaseVotesRoute(request, env, auth, now)
  if (votesResponse) return votesResponse

  const resultsResponse = await handlePhaseResultsRoute(request, env, auth, now)
  if (resultsResponse) return resultsResponse

  const closingResponse = await handlePhaseCloseRoute(request, env, auth, now)
  if (closingResponse) return closingResponse

  const resolutionResponse = await handlePhaseResolutionRoute(request, env, auth, now)
  if (resolutionResponse) return resolutionResponse

  const openingResponse = await handlePhaseOpeningRoute(request, env, auth, now)
  if (openingResponse) return openingResponse

  const targetsResponse = await handlePhaseTargetsRoute(request, env, auth, now)
  if (targetsResponse) return targetsResponse

  const orderMatch = pathname.match(/^\/api\/tournaments\/([^/]+)\/phases\/order$/)
  if (orderMatch && method === 'PUT') {
    return reorderPhasesHandler(
      request,
      env,
      auth,
      decodeURIComponent(orderMatch[1]!),
    )
  }

  const planMatch = pathname.match(/^\/api\/tournaments\/([^/]+)\/phases$/)
  if (planMatch) {
    const tournamentId = decodeURIComponent(planMatch[1]!)
    if (method === 'GET') return listPhasesHandler(env, auth, tournamentId, now)
    if (method === 'POST') return createPhaseHandler(request, env, auth, tournamentId, now)
    return null
  }

  const phaseMatch = pathname.match(/^\/api\/phases\/([^/]+)$/)
  if (phaseMatch) {
    const phaseId = decodeURIComponent(phaseMatch[1]!)
    if (method === 'PATCH') return patchPhaseHandler(request, env, auth, phaseId, now)
    if (method === 'DELETE') return deletePhaseHandler(env, auth, phaseId)
    return null
  }

  return null
}
