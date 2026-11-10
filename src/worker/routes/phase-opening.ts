import type { AuthContext } from '../auth/session'
import { findOrganizerRole, findTournamentById } from '../db/tournaments'
import { findPhaseById, type PhaseRecord } from '../db/phases'
import { apiError, json } from '../http/json'
import { computeEntrants, openPendingPhase } from '../phase-open'
import { serialisePhase } from './phases'

function readBody(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return {}
  if (typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readStringArray(value: unknown): string[] | null | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return null
  return [...(value as string[])]
}

async function findPhaseForOrganizer(
  env: Env,
  auth: AuthContext,
  phaseId: string,
): Promise<{ phase: PhaseRecord; tournamentStatus: string } | Response> {
  const phase = await findPhaseById(env, phaseId)
  if (!phase) return apiError(404, 'not_found')
  if (!(await findOrganizerRole(env, phase.tournament_id, auth.user.id))) {
    return apiError(403, 'forbidden')
  }
  const tournament = await findTournamentById(env, phase.tournament_id)
  if (!tournament) return apiError(404, 'not_found')
  return { phase, tournamentStatus: tournament.status }
}

function previewBody(preview: Awaited<ReturnType<typeof computeEntrants>>): Record<string, unknown> | null {
  if (!preview.ok) return null
  return {
    entrants: preview.value.entrants.map((entry) => ({ id: entry.id, name: entry.name })),
    directQualified: preview.value.directQualified.map((entry) => ({ id: entry.id, name: entry.name })),
    repechage: preview.value.repechage
      ? {
          targetSize: preview.value.repechage.targetSize,
          slots: preview.value.repechage.slots,
          selected: preview.value.repechage.selected.map((entry) => ({ id: entry.id, name: entry.name })),
          excluded: preview.value.repechage.excluded.map((entry) => ({ id: entry.id, name: entry.name })),
        }
      : null,
  }
}

async function previewOpeningHandler(
  env: Env,
  auth: AuthContext,
  phaseId: string,
): Promise<Response> {
  const context = await findPhaseForOrganizer(env, auth, phaseId)
  if (context instanceof Response) return context

  if (context.phase.status !== 'pending') return apiError(409, 'phase_not_pending')
  if (context.tournamentStatus !== 'published' && context.tournamentStatus !== 'running') {
    return apiError(409, 'tournament_not_openable')
  }

  const preview = await computeEntrants(env, context.phase)
  if (!preview.ok) return apiError(409, preview.error)
  return json(previewBody(preview)!)
}

async function openPhaseHandler(
  request: Request,
  env: Env,
  auth: AuthContext,
  phaseId: string,
  now: number,
): Promise<Response> {
  const context = await findPhaseForOrganizer(env, auth, phaseId)
  if (context instanceof Response) return context

  let rawBody: unknown = {}
  try {
    const text = await request.text()
    rawBody = text ? JSON.parse(text) : {}
  } catch {
    return apiError(400, 'invalid_request')
  }
  const body = readBody(rawBody)
  if (!body) return apiError(400, 'invalid_request')

  const override = readStringArray(body.repechageOverride)
  const seedingOrder = readStringArray(body.seedingOrder)
  if (override === null || seedingOrder === null) return apiError(400, 'invalid_request')

  const result = await openPendingPhase(env, context.phase, {
    override,
    seedingOrder,
    actorId: auth.user.id,
    now,
  })
  if (!result.ok) return apiError(result.status, result.error)

  return json({
    phase: serialisePhase(result.phase),
    operation: result.operation,
  })
}

/** Instrada `/api/phases/:id/open` e `/api/phases/:id/open-preview`. */
export async function handlePhaseOpeningRoute(
  request: Request,
  env: Env,
  auth: AuthContext,
  now = Date.now(),
): Promise<Response | null> {
  const { pathname } = new URL(request.url)
  const method = request.method

  const previewMatch = pathname.match(/^\/api\/phases\/([^/]+)\/open-preview$/)
  if (previewMatch && method === 'GET') {
    return previewOpeningHandler(env, auth, decodeURIComponent(previewMatch[1]!))
  }

  const openMatch = pathname.match(/^\/api\/phases\/([^/]+)\/open$/)
  if (openMatch && method === 'POST') {
    return openPhaseHandler(request, env, auth, decodeURIComponent(openMatch[1]!), now)
  }

  return null
}
