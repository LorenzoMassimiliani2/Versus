import type { AuthContext } from '../auth/session'
import type { ResultsGroupPayload, ResultsPayload } from '../../domain/phase-results'
import { listElements } from '../db/elements'
import { findLatestPhaseResult, listPhaseGroups } from '../db/phase-operation'
import { findPhaseById, type PhaseRecord } from '../db/phases'
import { findTournamentRole } from '../db/tournaments'
import { apiError, json } from '../http/json'
import { closePhaseIfDue } from './phase-close'

interface ResultsPhaseSummary {
  id: string
  name: string
  position: number
  formula: PhaseRecord['formula']
  voteType: PhaseRecord['vote_type']
}

interface ResultsElementSummary {
  id: string
  name: string
  imageUrl: string
}

interface ResultsGroupBody extends ResultsGroupPayload {
  name: string | null
}

interface PhaseResultsBody {
  phaseId: string
  phase: ResultsPhaseSummary
  closedAt: string
  version: number
  groups: ResultsGroupBody[]
  matches: ResultsPayload['matches']
  ranking: ResultsPayload['ranking']
  qualified: string[]
  repechage: ResultsPayload['repechage']
  winnerElementId: string | null
  elements: ResultsElementSummary[]
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function emptyResults(phaseId: string): ResultsPayload {
  return {
    phaseId,
    groups: [],
    matches: [],
    ranking: [],
    qualified: [],
    repechage: null,
    winnerElementId: null,
  }
}

/**
 * `GET /api/phases/:id/results`: risultati definitivi di una fase chiusa, letti
 * dallo snapshot salvato alla chiusura. Una fase non chiusa non espone risultati
 * definitivi. La risposta e' disponibile a tutti i membri del torneo.
 */
export async function handlePhaseResultsRoute(
  request: Request,
  env: Env,
  auth: AuthContext,
  now = Date.now(),
): Promise<Response | null> {
  const { pathname } = new URL(request.url)
  const match = pathname.match(/^\/api\/phases\/([^/]+)\/results$/)
  if (!match || request.method !== 'GET') return null

  const phaseId = decodeURIComponent(match[1]!)
  const stored = await findPhaseById(env, phaseId)
  if (!stored) return apiError(404, 'not_found')

  const role = await findTournamentRole(env, stored.tournament_id, auth.user.id)
  if (!role) return apiError(403, 'forbidden')

  const phase = await closePhaseIfDue(env, stored, now)
  if (phase.status === 'awaiting_resolution') {
    return apiError(409, 'phase_awaiting_resolution')
  }
  if (phase.status !== 'closed') return apiError(409, 'phase_not_closed')

  const [row, groups, elements] = await Promise.all([
    findLatestPhaseResult(env, phase.id),
    listPhaseGroups(env, phase.id),
    listElements(env, phase.tournament_id),
  ])
  if (!row) return apiError(409, 'phase_not_closed')

  const results = parseJson<ResultsPayload>(row.results, emptyResults(phase.id))
  const groupNames = new Map(groups.map((group) => [group.id, group.name]))
  const body: PhaseResultsBody = {
    phaseId: phase.id,
    phase: {
      id: phase.id,
      name: phase.name,
      position: phase.position,
      formula: phase.formula,
      voteType: phase.vote_type,
    },
    closedAt: row.closed_at,
    version: row.version,
    groups: results.groups.map((group) => ({
      ...group,
      name: groupNames.get(group.groupId) ?? null,
    })),
    matches: results.matches,
    ranking: results.ranking,
    qualified: results.qualified,
    repechage: results.repechage,
    winnerElementId: results.winnerElementId,
    elements: elements.map((element) => ({
      id: element.id,
      name: element.name,
      imageUrl: element.image_url,
    })),
  }
  return json(body)
}
