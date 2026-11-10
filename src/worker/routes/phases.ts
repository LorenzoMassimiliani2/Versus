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
  const phases: PhaseRecord[] = []
  for (const phase of stored) {
    phases.push(await closePhaseIfDue(env, phase, now))
  }
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
  if (tournament.status !== 'draft') return apiError(409, 'tournament_not_editable')

  const result = validatePhaseCreate(await readJson(request))
  if (!result.ok) return apiError(result.error === 'invalid_phase' ? 422 : 400, result.error)

  const phases = await listPhases(env, tournamentId)
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
): Promise<{ phase: PhaseRecord; tournamentStatus: string } | Response> {
  const phase = await findPhaseById(env, phaseId)
  if (!phase) return apiError(404, 'not_found')

  const denied = await authorizeOrganizer(env, auth, phase.tournament_id)
  if (denied) return denied

  const tournament = await findTournamentById(env, phase.tournament_id)
  if (!tournament) return apiError(404, 'not_found')
  return { phase, tournamentStatus: tournament.status }
}

async function patchPhaseHandler(
  request: Request,
  env: Env,
  auth: AuthContext,
  phaseId: string,
  now: number,
): Promise<Response> {
  const context = await findPhaseContext(env, auth, phaseId)
  if (context instanceof Response) return context

  if (context.phase.status !== 'pending') return apiError(409, 'phase_not_editable')
  if (context.tournamentStatus !== 'draft') return apiError(409, 'tournament_not_editable')

  const result = validatePhasePatch(await readJson(request), draftFromRecord(context.phase))
  if (!result.ok) return apiError(result.error === 'invalid_phase' ? 422 : 400, result.error)

  await updatePhase(
    env,
    context.phase.id,
    {
      name: result.phase.name,
      formula: result.phase.formula,
      voteType: result.phase.voteType,
      config: JSON.stringify(result.phase.config),
      advance: JSON.stringify(result.phase.advance),
    },
    new Date(now).toISOString(),
  )

  const updated = await findPhaseById(env, context.phase.id)
  if (!updated) return apiError(500, 'internal_error')
  return json({ phase: serialisePhase(updated) })
}

async function deletePhaseHandler(
  env: Env,
  auth: AuthContext,
  phaseId: string,
): Promise<Response> {
  const context = await findPhaseContext(env, auth, phaseId)
  if (context instanceof Response) return context

  if (context.phase.status !== 'pending') return apiError(409, 'phase_not_editable')
  if (context.tournamentStatus !== 'draft') return apiError(409, 'tournament_not_editable')

  await deletePhase(env, context.phase)
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
  if (tournament.status !== 'draft') return apiError(409, 'tournament_not_editable')

  const body = await readJson(request)
  const ids =
    typeof body === 'object' && body !== null ? (body as { ids?: unknown }).ids : undefined
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
    return apiError(400, 'invalid_request')
  }

  const phases = await listPhases(env, tournamentId)
  const currentIds = new Set(phases.map((phase) => phase.id))
  const nextIds = ids as string[]
  if (
    new Set(nextIds).size !== nextIds.length ||
    nextIds.length !== currentIds.size ||
    nextIds.some((id) => !currentIds.has(id))
  ) {
    return apiError(400, 'invalid_request')
  }
  if (phases.some((phase) => phase.status !== 'pending')) {
    return apiError(409, 'phase_not_editable')
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

  const closingResponse = await handlePhaseCloseRoute(request, env, auth, now)
  if (closingResponse) return closingResponse

  const openingResponse = await handlePhaseOpeningRoute(request, env, auth, now)
  if (openingResponse) return openingResponse

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
