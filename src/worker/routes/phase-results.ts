import type { AuthContext } from '../auth/session'
import type { ResultsGroupPayload, ResultsPayload } from '../../domain/phase-results'
import { computePhaseResults } from '../../domain/phase-results'
import type { RankingAssignment } from '../../domain/ranking'
import { resultsPolicy, type ResultsVisibility } from '../../domain/results-secrecy'
import type { Secrecy } from '../../domain/phases'
import { listBallotVotesForVoter } from '../db/ballot-votes'
import { listDuelVotesForVoter, type DuelVoteRow } from '../db/duel-votes'
import { listElements } from '../db/elements'
import {
  hasVoteTable,
  listPhaseBallotVotes,
  listPhaseDuelVotes,
  loadResultsOperation,
} from '../db/phase-close'
import {
  findLatestPhaseResult,
  listPhaseGroups,
  listPhaseMatches,
} from '../db/phase-operation'
import { findPhaseById, type PhaseRecord } from '../db/phases'
import { findTournamentRole } from '../db/tournaments'
import { apiError, json } from '../http/json'
import { phaseAdvance, phaseConfig } from '../phase-open'
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

interface OwnDuelVote {
  kind: 'duel'
  targetId: string
  targetName: string
  side: DuelVoteRow['side']
  credits: number
}

interface OwnRankingVote {
  kind: 'ranking'
  targetId: string
  targetName: string
  assignments: RankingAssignment[]
}

interface OwnPickVote {
  kind: 'pick'
  targetId: string
  targetName: string
  elementId: string
}

type OwnVote = OwnDuelVote | OwnRankingVote | OwnPickVote

interface PhaseResultsBody {
  phaseId: string
  phase: ResultsPhaseSummary
  state: 'open' | 'closed'
  secrecy: Secrecy
  visibility: ResultsVisibility
  closedAt: string | null
  version: number
  groups: ResultsGroupBody[]
  matches: ResultsPayload['matches']
  ranking: ResultsPayload['ranking']
  qualified: string[]
  repechage: ResultsPayload['repechage']
  winnerElementId: string | null
  elements: ResultsElementSummary[]
  ownVotes?: OwnVote[]
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
 * Aggregati della fase ancora aperta, calcolati dai voti presenti in quel
 * momento. Non vengono salvati: lo snapshot nasce solo alla chiusura.
 */
async function computeLiveResults(env: Env, phase: PhaseRecord): Promise<ResultsPayload> {
  const [hasDuelVotes, hasBallotVotes] = await Promise.all([
    hasVoteTable(env, 'duel_votes'),
    hasVoteTable(env, 'ballot_votes'),
  ])
  const [operation, duelVotes, ballotVotes] = await Promise.all([
    loadResultsOperation(env, phase.id),
    hasDuelVotes ? listPhaseDuelVotes(env, phase.id) : Promise.resolve([]),
    hasBallotVotes ? listPhaseBallotVotes(env, phase.id) : Promise.resolve([]),
  ])

  const computed = computePhaseResults({
    phase: {
      id: phase.id,
      formula: phase.formula,
      voteType: phase.vote_type,
      config: phaseConfig(phase),
      advance: phaseAdvance(phase),
    },
    ...operation,
    duelVotes,
    ballotVotes,
  })

  // Un ripescaggio non calcolabile non deve rompere la consultazione live.
  return computed.ok ? computed.results : emptyResults(phase.id)
}

function parseAssignments(payload: string): RankingAssignment[] {
  const raw = parseJson<unknown>(payload, null)
  if (typeof raw !== 'object' || raw === null) return []
  const assignments = (raw as { assignments?: unknown }).assignments
  if (!Array.isArray(assignments)) return []
  return assignments.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return []
    const { elementId, points } = entry as { elementId?: unknown; points?: unknown }
    if (typeof elementId !== 'string' || typeof points !== 'number') return []
    return [{ elementId, points }]
  })
}

function parsePick(payload: string): string | null {
  const raw = parseJson<unknown>(payload, null)
  if (typeof raw !== 'object' || raw === null) return null
  const elementId = (raw as { elementId?: unknown }).elementId
  return typeof elementId === 'string' ? elementId : null
}

/**
 * Voti del solo richiedente, con etichette leggibili. Sono gli unici voti
 * individuali ammessi in risposta: nessun altro votante viene nominato.
 */
async function loadOwnVotes(
  env: Env,
  phase: PhaseRecord,
  userId: string,
  elementNames: ReadonlyMap<string, string>,
): Promise<OwnVote[]> {
  if (phase.vote_type === 'duel') {
    const [votes, matches] = await Promise.all([
      listDuelVotesForVoter(env, phase.id, userId),
      listPhaseMatches(env, phase.id),
    ])
    const matchById = new Map(matches.map((match) => [match.id, match]))
    return votes.flatMap((vote) => {
      const match = matchById.get(vote.match_id)
      if (!match) return []
      const nameA = match.element_a_id ? elementNames.get(match.element_a_id) : undefined
      const nameB = match.element_b_id ? elementNames.get(match.element_b_id) : undefined
      const targetName =
        nameA && nameB ? `${nameA} vs ${nameB}` : `Sfida ${match.round}-${match.position}`
      return [
        {
          kind: 'duel' as const,
          targetId: vote.match_id,
          targetName,
          side: vote.side,
          credits: vote.credits,
        },
      ]
    })
  }

  const [votes, groups] = await Promise.all([
    listBallotVotesForVoter(env, phase.id, userId),
    phase.formula === 'group' ? listPhaseGroups(env, phase.id) : Promise.resolve([]),
  ])
  const groupNameById = new Map(groups.map((group) => [group.id, group.name]))

  return votes.flatMap((vote): OwnVote[] => {
    const targetName =
      phase.formula === 'group'
        ? (groupNameById.get(vote.target_id) ?? vote.target_id)
        : phase.name
    if (vote.kind === 'ranking') {
      return [
        {
          kind: 'ranking',
          targetId: vote.target_id,
          targetName,
          assignments: parseAssignments(vote.payload),
        },
      ]
    }
    const elementId = parsePick(vote.payload)
    return elementId
      ? [{ kind: 'pick', targetId: vote.target_id, targetName, elementId }]
      : []
  })
}

/**
 * `GET /api/phases/:id/results`: risultati filtrati per segretezza e ruolo.
 *
 * - `live`: aggregati anche durante la fase.
 * - `blind`: il partecipante vede solo il proprio voto fino alla chiusura.
 * - `secret`: l'organizzatore riceve solo aggregati, anche dopo la chiusura.
 *
 * Gli aggregati non contengono mai l'identità dei votanti; i voti individuali
 * compaiono solo come `ownVotes` del richiedente.
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
  if (phase.status !== 'open' && phase.status !== 'closed') {
    return apiError(409, 'phase_not_closed')
  }

  const secrecy = phaseConfig(phase).secrecy
  const policy = resultsPolicy({
    secrecy,
    role: role === 'participant' ? 'participant' : 'organizer',
    phaseState: phase.status,
  })

  const [groups, elements] = await Promise.all([
    policy.visibility === 'aggregate'
      ? listPhaseGroups(env, phase.id)
      : Promise.resolve([]),
    listElements(env, phase.tournament_id),
  ])

  const groupNames = new Map(groups.map((group) => [group.id, group.name]))
  const elementNames = new Map(elements.map((element) => [element.id, element.name]))

  let results = emptyResults(phase.id)
  let closedAt: string | null = null
  let version = 0

  if (policy.visibility === 'aggregate') {
    if (phase.status === 'closed') {
      const row = await findLatestPhaseResult(env, phase.id)
      if (!row) return apiError(409, 'phase_not_closed')
      results = parseJson<ResultsPayload>(row.results, results)
      closedAt = row.closed_at
      version = row.version
    } else {
      results = await computeLiveResults(env, phase)
    }
  }

  const ownVotes =
    policy.visibility === 'own_vote'
      ? await loadOwnVotes(env, phase, auth.user.id, elementNames)
      : undefined

  const body: PhaseResultsBody = {
    phaseId: phase.id,
    phase: {
      id: phase.id,
      name: phase.name,
      position: phase.position,
      formula: phase.formula,
      voteType: phase.vote_type,
    },
    state: phase.status,
    secrecy,
    visibility: policy.visibility,
    closedAt,
    version,
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
    ...(ownVotes ? { ownVotes } : {}),
  }
  return json(body)
}
