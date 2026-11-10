import type { AuthContext } from '../auth/session'
import { uuidv7 } from '../db/ids'
import { findOpenPhaseTarget, findPhaseTarget } from '../db/phase-targets'
import { findPhaseById } from '../db/phases'
import { findOrganizerRole } from '../db/tournaments'
import { apiError, json } from '../http/json'
import { phaseConfig } from '../phase-open'
import { forceAdvanceSequential } from '../phase-targets'

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

/**
 * `POST /api/phases/:id/targets/advance`: l'organizzatore forza il passaggio al
 * target successivo in modalita sequenziale. Con `targetId` l'operazione e'
 * idempotente: ripeterla sullo stesso target gia' completato non avanza oltre.
 */
export async function handlePhaseTargetsRoute(
  request: Request,
  env: Env,
  auth: AuthContext,
  now = Date.now(),
): Promise<Response | null> {
  const { pathname } = new URL(request.url)
  const match = pathname.match(/^\/api\/phases\/([^/]+)\/targets\/advance$/)
  if (!match || request.method !== 'POST') return null

  const phase = await findPhaseById(env, decodeURIComponent(match[1]!))
  if (!phase) return apiError(404, 'not_found')
  if (!(await findOrganizerRole(env, phase.tournament_id, auth.user.id))) {
    return apiError(403, 'forbidden')
  }
  if (phase.status !== 'open') return apiError(409, 'phase_not_open')

  const config = phaseConfig(phase)
  if (config.votingMode !== 'sequential') return apiError(409, 'not_sequential')

  const raw = await readJson(request)
  let targetId: string | undefined
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    const value = (raw as { targetId?: unknown }).targetId
    if (value !== undefined) {
      if (typeof value !== 'string' || value.length === 0) {
        return apiError(400, 'invalid_request')
      }
      targetId = value
    }
  } else if (raw !== null) {
    return apiError(400, 'invalid_request')
  }

  if (targetId) {
    const target = await findPhaseTarget(env, phase.id, targetId)
    if (!target) return apiError(422, 'invalid_target')
    if (target.status === 'pending') return apiError(409, 'target_not_open')
  } else if (!(await findOpenPhaseTarget(env, phase.id))) {
    return apiError(409, 'no_open_target')
  }

  const outcome = await forceAdvanceSequential(env, phase, now, targetId)
  if (!outcome) return apiError(422, 'invalid_target')

  if (outcome.advanced && outcome.targetId) {
    const timestamp = new Date(now).toISOString()
    await env.DB.prepare(
      `INSERT INTO audit_log (id, tournament_id, actor_id, action, target_type, target_id,
         before, after, created_at)
       VALUES (?, ?, ?, 'phase.target_advance', 'phase_target', ?, ?, ?, ?)`,
    )
      .bind(
        uuidv7(now),
        phase.tournament_id,
        auth.user.id,
        outcome.targetId,
        JSON.stringify({ targetId: outcome.targetId, status: 'open' }),
        JSON.stringify({ nextTargetId: outcome.nextTargetId }),
        timestamp,
      )
      .run()
  }

  return json({
    advanced: outcome.advanced,
    targetId: outcome.targetId,
    nextTargetId: outcome.nextTargetId,
  })
}
