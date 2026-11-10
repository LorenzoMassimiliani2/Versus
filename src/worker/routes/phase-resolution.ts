import type { AuthContext } from '../auth/session'
import { listElements } from '../db/elements'
import { listPhaseGroups, listPhaseMatches } from '../db/phase-operation'
import { findPhaseById, type PhaseRecord } from '../db/phases'
import { findOrganizerRole } from '../db/tournaments'
import { apiError, json } from '../http/json'
import { parseResolutionRequest, validateResolutions } from '../../domain/phase-resolution'
import type { UnresolvedTarget } from '../../domain/phase-resolution'
import {
  applyAutoAdvance,
  closePhase,
  computePhaseResultsForPhase,
  type PhaseResolutionInput,
} from './phase-close'
import { serialisePhase } from './phases'

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

export interface ResolutionTarget {
  targetId: string
  name: string
  elements: Array<{ id: string; name: string }>
}

interface ResolutionLabelSources {
  phase: PhaseRecord
  groupNames: ReadonlyMap<string, string>
  matchNames: ReadonlyMap<string, string>
  elementNames: ReadonlyMap<string, string>
}

function targetName(target: UnresolvedTarget, sources: ResolutionLabelSources): string {
  if (sources.phase.formula === 'group') {
    return sources.groupNames.get(target.targetId) ?? target.targetId
  }
  if (sources.phase.formula === 'elimination') {
    return sources.matchNames.get(target.targetId) ?? target.targetId
  }
  return sources.phase.name
}

async function buildTargets(
  env: Env,
  phase: PhaseRecord,
  unresolvedTargets: readonly UnresolvedTarget[],
): Promise<ResolutionTarget[]> {
  const [elements, groups, matches] = await Promise.all([
    listElements(env, phase.tournament_id),
    phase.formula === 'group' ? listPhaseGroups(env, phase.id) : Promise.resolve([]),
    phase.formula === 'elimination' ? listPhaseMatches(env, phase.id) : Promise.resolve([]),
  ])

  const elementNames = new Map(elements.map((element) => [element.id, element.name]))
  const sources: ResolutionLabelSources = {
    phase,
    groupNames: new Map(groups.map((group) => [group.id, group.name])),
    matchNames: new Map(
      matches.map((match) => {
        const sideA = match.element_a_id ? elementNames.get(match.element_a_id) : undefined
        const sideB = match.element_b_id ? elementNames.get(match.element_b_id) : undefined
        const label =
          sideA && sideB ? `${sideA} vs ${sideB}` : `Sfida ${match.round}-${match.position}`
        return [match.id, label]
      }),
    ),
    elementNames,
  }

  return unresolvedTargets.map((target) => ({
    targetId: target.targetId,
    name: targetName(target, sources),
    elements: target.elementIds.map((elementId) => ({
      id: elementId,
      name: elementNames.get(elementId) ?? elementId,
    })),
  }))
}

async function authorizeOrganizer(
  env: Env,
  auth: AuthContext,
  phase: PhaseRecord,
): Promise<Response | null> {
  if (!(await findOrganizerRole(env, phase.tournament_id, auth.user.id))) {
    return apiError(403, 'forbidden')
  }
  return null
}

async function listResolutionHandler(
  env: Env,
  auth: AuthContext,
  phaseId: string,
): Promise<Response> {
  const phase = await findPhaseById(env, phaseId)
  if (!phase) return apiError(404, 'not_found')
  const denied = await authorizeOrganizer(env, auth, phase)
  if (denied) return denied

  if (phase.status !== 'awaiting_resolution') {
    return apiError(409, 'phase_not_awaiting_resolution')
  }

  const computed = await computePhaseResultsForPhase(env, phase)
  const unresolvedTargets = computed.ok ? computed.unresolvedTargets : []
  const targets = await buildTargets(env, phase, unresolvedTargets)

  return json({
    phase: {
      id: phase.id,
      name: phase.name,
      position: phase.position,
      status: phase.status,
    },
    targets,
  })
}

async function resolvePhaseHandler(
  request: Request,
  env: Env,
  auth: AuthContext,
  phaseId: string,
  now: number,
): Promise<Response> {
  const phase = await findPhaseById(env, phaseId)
  if (!phase) return apiError(404, 'not_found')
  const denied = await authorizeOrganizer(env, auth, phase)
  if (denied) return denied

  if (phase.status !== 'awaiting_resolution') {
    return apiError(409, 'phase_not_awaiting_resolution')
  }

  const parsed = parseResolutionRequest(await readJson(request))
  if (!parsed.ok) {
    return apiError(parsed.error === 'note_required' ? 422 : 400, parsed.error)
  }

  const computed = await computePhaseResultsForPhase(env, phase)
  if (!computed.ok) return apiError(409, computed.error)
  if (
    !validateResolutions(computed.unresolvedTargets, parsed.request.resolutions)
  ) {
    return apiError(422, 'invalid_resolution')
  }

  const resolution: PhaseResolutionInput = {
    resolutions: parsed.request.resolutions,
    note: parsed.request.note,
    actorId: auth.user.id,
  }

  const outcome = await closePhase(env, phase, now, resolution)
  if ('error' in outcome) {
    return apiError(outcome.error === 'invalid_resolution' ? 422 : 409, outcome.error)
  }
  if (outcome.phase.status !== 'closed') {
    return apiError(409, 'phase_already_resolved')
  }

  const autoAdvance = await applyAutoAdvance(env, outcome.phase, now)

  return json({
    phase: serialisePhase(outcome.phase),
    result: outcome.result,
    ...(autoAdvance ? { autoAdvance } : {}),
  })
}

/**
 * Risoluzione manuale degli spareggi: `GET` espone i target ambigui
 * all'organizzatore, `POST /resolve` applica gli ordinamenti scelti e chiude la
 * fase. Un partecipante riceve `403` su entrambe le rotte.
 */
export async function handlePhaseResolutionRoute(
  request: Request,
  env: Env,
  auth: AuthContext,
  now = Date.now(),
): Promise<Response | null> {
  const { pathname } = new URL(request.url)

  const listMatch = pathname.match(/^\/api\/phases\/([^/]+)\/resolution$/)
  if (listMatch && request.method === 'GET') {
    return listResolutionHandler(env, auth, decodeURIComponent(listMatch[1]!))
  }

  const resolveMatch = pathname.match(/^\/api\/phases\/([^/]+)\/resolve$/)
  if (resolveMatch && request.method === 'POST') {
    return resolvePhaseHandler(request, env, auth, decodeURIComponent(resolveMatch[1]!), now)
  }

  return null
}
