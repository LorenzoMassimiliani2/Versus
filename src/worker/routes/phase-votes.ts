import type { AuthContext } from '../auth/session'
import {
  creditBalance,
  maxDuelCredits,
  validateDuelVote,
  type DuelSide,
} from '../../domain/duel-vote'
import {
  parseBallotPayload,
  validatePickBallot,
  validateRankingBallot,
} from '../../domain/ballot-vote'
import type { RankingAssignment } from '../../domain/ranking'
import { findBallotVote, listBallotVotesForVoter } from '../db/ballot-votes'
import { listElements, type ElementRecord } from '../db/elements'
import {
  findPhaseVoter,
  findDuelVote,
  listCreditAmounts,
  listDuelVotesForVoter,
  type PhaseVoterRow,
} from '../db/duel-votes'
import { uuidv7 } from '../db/ids'
import {
  findPhaseMatch,
  listGroupMembers,
  listPhaseEntrants,
  listPhaseGroups,
  listPhaseMatches,
  type MatchRecord,
} from '../db/phase-operation'
import { findPhaseById, type PhaseRecord } from '../db/phases'
import { apiError, json } from '../http/json'
import { phaseConfig } from '../phase-open'

interface BallotElement {
  elementId: string
  name: string
  imageUrl: string
  videoUrl: string | null
}

interface BallotVote {
  side: DuelSide
  credits: number
}

interface BallotMatch {
  id: string
  groupId: string | null
  round: number
  position: number
  status: MatchRecord['status']
  sideA: BallotElement | null
  sideB: BallotElement | null
  vote: BallotVote | null
}

type SerialisedBallotVote =
  | { kind: 'ranking'; assignments: RankingAssignment[] }
  | { kind: 'pick'; elementId: string }

interface BallotTarget {
  id: string
  name: string
  elements: BallotElement[]
  vote: SerialisedBallotVote | null
  points: { scale: number[]; used: number[]; remaining: number[] }
}

interface BallotBody {
  phase: {
    id: string
    tournamentId: string
    name: string
    status: PhaseRecord['status']
    voteType: PhaseRecord['vote_type']
  }
  budget: number
  maxPerMatch: number
  balance: number
  matches: BallotMatch[]
  targets: BallotTarget[]
  completion: { voted: number; total: number }
}

const DEFAULT_RANKING_SCALE = [12, 10, 8, 6, 4, 2, 1]

function elementSummary(element: ElementRecord | undefined): BallotElement | null {
  if (!element) return null
  return {
    elementId: element.id,
    name: element.name,
    imageUrl: element.image_url,
    videoUrl: element.video_url,
  }
}

function rankingScale(phase: PhaseRecord): number[] {
  return phaseConfig(phase).ranking?.points ?? DEFAULT_RANKING_SCALE
}

interface BallotTargetData {
  id: string
  name: string
  elements: BallotElement[]
  elementIds: Set<string>
}

function summariesFor(
  ids: readonly string[],
  byId: ReadonlyMap<string, ElementRecord>,
): BallotElement[] {
  return ids.flatMap((id) => {
    const summary = elementSummary(byId.get(id))
    return summary ? [summary] : []
  })
}

/** Target di voto: i gironi per le fasi `group`, la fase stessa per le altre. */
async function loadBallotTargetData(
  env: Env,
  phase: PhaseRecord,
): Promise<BallotTargetData[]> {
  const elements = await listElements(env, phase.tournament_id)
  const byId = new Map(elements.map((element) => [element.id, element]))

  if (phase.formula === 'group') {
    const [groups, members] = await Promise.all([
      listPhaseGroups(env, phase.id),
      listGroupMembers(env, phase.id),
    ])
    return groups.map((group) => {
      const ids = members
        .filter((member) => member.group_id === group.id)
        .map((member) => member.element_id)
      return {
        id: group.id,
        name: group.name,
        elements: summariesFor(ids, byId),
        elementIds: new Set(ids),
      }
    })
  }

  const entrants = await listPhaseEntrants(env, phase.id)
  const ids = entrants.map((entrant) => entrant.element_id)
  return [
    {
      id: phase.id,
      name: phase.name,
      elements: summariesFor(ids, byId),
      elementIds: new Set(ids),
    },
  ]
}

async function findBallotTarget(
  env: Env,
  phase: PhaseRecord,
  targetId: string,
): Promise<BallotTargetData | null> {
  if (phase.formula !== 'group') {
    if (targetId !== phase.id) return null
    const entrants = await listPhaseEntrants(env, phase.id)
    return {
      id: phase.id,
      name: phase.name,
      elements: [],
      elementIds: new Set(entrants.map((entrant) => entrant.element_id)),
    }
  }

  const groups = await listPhaseGroups(env, phase.id)
  const group = groups.find((candidate) => candidate.id === targetId)
  if (!group) return null
  const members = await listGroupMembers(env, phase.id)
  return {
    id: group.id,
    name: group.name,
    elements: [],
    elementIds: new Set(
      members
        .filter((member) => member.group_id === targetId)
        .map((member) => member.element_id),
    ),
  }
}

async function loadBallot(
  env: Env,
  phase: PhaseRecord,
  voter: PhaseVoterRow,
): Promise<BallotBody> {
  const [elements, matches, votes, amounts] = await Promise.all([
    listElements(env, phase.tournament_id),
    phase.vote_type === 'duel' ? listPhaseMatches(env, phase.id) : Promise.resolve([]),
    phase.vote_type === 'duel'
      ? listDuelVotesForVoter(env, phase.id, voter.user_id)
      : Promise.resolve([]),
    listCreditAmounts(env, phase.id, voter.user_id),
  ])

  const byId = new Map(elements.map((element) => [element.id, element]))
  const votesByMatch = new Map(votes.map((vote) => [vote.match_id, vote]))
  const visible = matches.filter((match) => match.status !== 'bye')
  const config = phaseConfig(phase)
  const body: BallotBody = {
    phase: {
      id: phase.id,
      tournamentId: phase.tournament_id,
      name: phase.name,
      status: phase.status,
      voteType: phase.vote_type,
    },
    budget: voter.credits_budget,
    maxPerMatch: maxDuelCredits(voter.credits_budget, config.credits.maxPerMatch),
    balance: voter.credits_budget + creditBalance(amounts),
    matches: visible.map((match) => {
      const vote = votesByMatch.get(match.id)
      return {
        id: match.id,
        groupId: match.group_id,
        round: match.round,
        position: match.position,
        status: match.status,
        sideA: elementSummary(match.element_a_id ? byId.get(match.element_a_id) : undefined),
        sideB: elementSummary(match.element_b_id ? byId.get(match.element_b_id) : undefined),
        vote: vote ? { side: vote.side, credits: vote.credits } : null,
      }
    }),
    targets: [],
    completion: {
      voted: visible.filter((match) => votesByMatch.has(match.id)).length,
      total: visible.length,
    },
  }

  if (phase.vote_type === 'duel') return body

  const [targets, ballots] = await Promise.all([
    loadBallotTargetData(env, phase),
    listBallotVotesForVoter(env, phase.id, voter.user_id),
  ])
  const ballotsByTarget = new Map(ballots.map((ballot) => [ballot.target_id, ballot]))
  const scale = phase.vote_type === 'pick' ? [1] : rankingScale(phase)

  body.targets = targets.map((target) => {
    const row = ballotsByTarget.get(target.id)
    let vote: SerialisedBallotVote | null = null
    let used: number[] = []
    if (row) {
      const parsed = parseBallotPayload(row.kind, row.payload)
      if (row.kind === 'ranking' && parsed && 'assignments' in parsed) {
        vote = { kind: 'ranking', assignments: parsed.assignments }
        used = parsed.assignments.map((assignment) => assignment.points)
      } else if (row.kind === 'pick' && parsed && 'elementId' in parsed) {
        vote = { kind: 'pick', elementId: parsed.elementId }
        used = [1]
      }
    }

    return {
      id: target.id,
      name: target.name,
      elements: target.elements,
      vote,
      points: {
        scale,
        used,
        remaining: scale.filter((points) => !used.includes(points)),
      },
    }
  })

  body.completion = {
    voted: body.targets.filter((target) => target.vote !== null).length,
    total: body.targets.length,
  }
  return body
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

interface VoteContext {
  phase: PhaseRecord
  voter: PhaseVoterRow
}

async function findVoteContext(
  env: Env,
  auth: AuthContext,
  phaseId: string,
): Promise<VoteContext | Response> {
  const phase = await findPhaseById(env, phaseId)
  if (!phase) return apiError(404, 'not_found')

  const voter = await findPhaseVoter(env, phase.id, auth.user.id)
  if (!voter) return apiError(403, 'forbidden')
  return { phase, voter }
}

async function ballotHandler(
  env: Env,
  auth: AuthContext,
  phaseId: string,
): Promise<Response> {
  const context = await findVoteContext(env, auth, phaseId)
  if (context instanceof Response) return context
  return json(await loadBallot(env, context.phase, context.voter))
}

function voteTimestampStatements(
  env: Env,
  phase: PhaseRecord,
  timestamp: string,
): D1PreparedStatement[] {
  return [
    env.DB.prepare('UPDATE phases SET updated_at = ? WHERE id = ?').bind(timestamp, phase.id),
    env.DB.prepare('UPDATE tournaments SET updated_at = ? WHERE id = ?').bind(
      timestamp,
      phase.tournament_id,
    ),
  ]
}

async function saveVoteHandler(
  request: Request,
  env: Env,
  auth: AuthContext,
  phaseId: string,
  matchId: string,
  now: number,
): Promise<Response> {
  const context = await findVoteContext(env, auth, phaseId)
  if (context instanceof Response) return context
  if (context.phase.vote_type !== 'duel') return apiError(422, 'invalid_vote')

  const match = await findPhaseMatch(env, context.phase.id, matchId)
  if (!match) return apiError(404, 'not_found')
  if (context.phase.status !== 'open') return apiError(409, 'phase_not_open')
  if (match.status !== 'open') return apiError(409, 'match_not_open')

  const existing = await findDuelVote(env, match.id, auth.user.id)
  const amounts = await listCreditAmounts(env, context.phase.id, auth.user.id)
  const balance = context.voter.credits_budget + creditBalance(amounts)
  const refundable = existing?.credits ?? 0

  const config = phaseConfig(context.phase)
  const validation = validateDuelVote(await readJson(request), {
    budget: context.voter.credits_budget,
    maxPerMatch: config.credits.maxPerMatch,
    available: balance + refundable,
  })
  if (!validation.ok) return apiError(422, validation.error)

  const vote = validation.vote
  if (vote.side === 'a' && !match.element_a_id) return apiError(422, 'invalid_vote')
  if (vote.side === 'b' && !match.element_b_id) return apiError(422, 'invalid_vote')

  if (existing && existing.side === vote.side && existing.credits === vote.credits) {
    return json(await loadBallot(env, context.phase, context.voter))
  }

  const timestamp = new Date(now).toISOString()
  const eventId = uuidv7(now)
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO vote_events (id, phase_id, target_id, voter_id, kind, payload, created_at)
       VALUES (?, ?, ?, ?, 'duel', ?, ?)`,
    ).bind(
      eventId,
      context.phase.id,
      match.id,
      auth.user.id,
      JSON.stringify({ side: vote.side, credits: vote.credits }),
      timestamp,
    ),
  ]

  if (existing && existing.credits > 0) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO credit_entries (id, phase_id, voter_id, match_id, amount, reason, vote_event_id, created_at)
         VALUES (?, ?, ?, ?, ?, 'refund', ?, ?)`,
      ).bind(
        uuidv7(now),
        context.phase.id,
        auth.user.id,
        match.id,
        existing.credits,
        eventId,
        timestamp,
      ),
    )
  }
  if (vote.credits > 0) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO credit_entries (id, phase_id, voter_id, match_id, amount, reason, vote_event_id, created_at)
         VALUES (?, ?, ?, ?, ?, 'spend', ?, ?)`,
      ).bind(
        uuidv7(now),
        context.phase.id,
        auth.user.id,
        match.id,
        -vote.credits,
        eventId,
        timestamp,
      ),
    )
  }

  statements.push(
    env.DB.prepare(
      `INSERT INTO duel_votes (match_id, voter_id, side, credits, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (match_id, voter_id) DO UPDATE SET
         side = excluded.side,
         credits = excluded.credits,
         updated_at = excluded.updated_at`,
    ).bind(match.id, auth.user.id, vote.side, vote.credits, timestamp, timestamp),
    ...voteTimestampStatements(env, context.phase, timestamp),
  )

  await env.DB.batch(statements)
  return json(await loadBallot(env, context.phase, context.voter))
}

async function deleteVoteHandler(
  env: Env,
  auth: AuthContext,
  phaseId: string,
  matchId: string,
  now: number,
): Promise<Response> {
  const context = await findVoteContext(env, auth, phaseId)
  if (context instanceof Response) return context
  if (context.phase.vote_type !== 'duel') return apiError(422, 'invalid_vote')

  const match = await findPhaseMatch(env, context.phase.id, matchId)
  if (!match) return apiError(404, 'not_found')
  if (context.phase.status !== 'open') return apiError(409, 'phase_not_open')
  if (match.status !== 'open') return apiError(409, 'match_not_open')

  const existing = await findDuelVote(env, match.id, auth.user.id)
  if (!existing) return json(await loadBallot(env, context.phase, context.voter))

  const timestamp = new Date(now).toISOString()
  const eventId = uuidv7(now)
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO vote_events (id, phase_id, target_id, voter_id, kind, payload, created_at)
       VALUES (?, ?, ?, ?, 'duel', ?, ?)`,
    ).bind(
      eventId,
      context.phase.id,
      match.id,
      auth.user.id,
      JSON.stringify({ deleted: true, side: existing.side, credits: existing.credits }),
      timestamp,
    ),
    env.DB.prepare('DELETE FROM duel_votes WHERE match_id = ? AND voter_id = ?').bind(
      match.id,
      auth.user.id,
    ),
  ]

  if (existing.credits > 0) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO credit_entries (id, phase_id, voter_id, match_id, amount, reason, vote_event_id, created_at)
         VALUES (?, ?, ?, ?, ?, 'refund', ?, ?)`,
      ).bind(
        uuidv7(now),
        context.phase.id,
        auth.user.id,
        match.id,
        existing.credits,
        eventId,
        timestamp,
      ),
    )
  }
  statements.push(...voteTimestampStatements(env, context.phase, timestamp))

  await env.DB.batch(statements)
  return json(await loadBallot(env, context.phase, context.voter))
}

interface BallotSaveBody {
  targetId?: unknown
  kind?: unknown
  payload?: unknown
}

async function saveBallotHandler(
  request: Request,
  env: Env,
  auth: AuthContext,
  phaseId: string,
  now: number,
): Promise<Response> {
  const context = await findVoteContext(env, auth, phaseId)
  if (context instanceof Response) return context
  if (context.phase.vote_type !== 'ranking' && context.phase.vote_type !== 'pick') {
    return apiError(422, 'invalid_vote')
  }
  if (context.phase.status !== 'open') return apiError(409, 'phase_not_open')

  const raw = await readJson(request)
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return apiError(422, 'invalid_payload')
  }
  const body = raw as BallotSaveBody
  if (typeof body.targetId !== 'string' || body.targetId.length === 0) {
    return apiError(422, 'invalid_payload')
  }
  if (body.kind !== 'ranking' && body.kind !== 'pick') {
    return apiError(422, 'invalid_payload')
  }
  if (body.kind !== context.phase.vote_type) return apiError(422, 'invalid_payload')

  const target = await findBallotTarget(env, context.phase, body.targetId)
  if (!target) return apiError(422, 'invalid_target')

  const validation =
    body.kind === 'ranking'
      ? validateRankingBallot(body.payload, {
          scale: rankingScale(context.phase),
          allowedElementIds: target.elementIds,
        })
      : validatePickBallot(body.payload, {
          scale: [1],
          allowedElementIds: target.elementIds,
        })
  if (!validation.ok) return apiError(422, validation.error)

  const payload = JSON.stringify(validation.vote)
  const existing = await findBallotVote(
    env,
    context.phase.id,
    target.id,
    auth.user.id,
  )
  if (existing && existing.kind === body.kind && existing.payload === payload) {
    return json(await loadBallot(env, context.phase, context.voter))
  }

  const timestamp = new Date(now).toISOString()
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO vote_events (id, phase_id, target_id, voter_id, kind, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      uuidv7(now),
      context.phase.id,
      target.id,
      auth.user.id,
      body.kind,
      payload,
      timestamp,
    ),
    env.DB.prepare(
      `INSERT INTO ballot_votes (phase_id, target_id, voter_id, kind, payload, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (phase_id, target_id, voter_id) DO UPDATE SET
         kind = excluded.kind,
         payload = excluded.payload,
         updated_at = excluded.updated_at`,
    ).bind(
      context.phase.id,
      target.id,
      auth.user.id,
      body.kind,
      payload,
      timestamp,
      timestamp,
    ),
    ...voteTimestampStatements(env, context.phase, timestamp),
  ]

  await env.DB.batch(statements)
  return json(await loadBallot(env, context.phase, context.voter))
}

async function deleteBallotHandler(
  env: Env,
  auth: AuthContext,
  phaseId: string,
  targetId: string,
  now: number,
): Promise<Response> {
  const context = await findVoteContext(env, auth, phaseId)
  if (context instanceof Response) return context
  if (context.phase.vote_type !== 'ranking' && context.phase.vote_type !== 'pick') {
    return apiError(422, 'invalid_vote')
  }
  if (context.phase.status !== 'open') return apiError(409, 'phase_not_open')

  const target = await findBallotTarget(env, context.phase, targetId)
  if (!target) return apiError(404, 'not_found')

  const existing = await findBallotVote(env, context.phase.id, target.id, auth.user.id)
  if (!existing) return json(await loadBallot(env, context.phase, context.voter))

  const timestamp = new Date(now).toISOString()
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO vote_events (id, phase_id, target_id, voter_id, kind, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      uuidv7(now),
      context.phase.id,
      target.id,
      auth.user.id,
      existing.kind,
      JSON.stringify({ deleted: true, payload: parseBallotPayload(existing.kind, existing.payload) }),
      timestamp,
    ),
    env.DB.prepare(
      'DELETE FROM ballot_votes WHERE phase_id = ? AND target_id = ? AND voter_id = ?',
    ).bind(context.phase.id, target.id, auth.user.id),
    ...voteTimestampStatements(env, context.phase, timestamp),
  ]

  await env.DB.batch(statements)
  return json(await loadBallot(env, context.phase, context.voter))
}

/** Instrada schede e voti di duello, classifica e pick. */
export async function handlePhaseVotesRoute(
  request: Request,
  env: Env,
  auth: AuthContext,
  now = Date.now(),
): Promise<Response | null> {
  const { pathname } = new URL(request.url)
  const method = request.method

  const ballotMatch = pathname.match(/^\/api\/phases\/([^/]+)\/ballot$/)
  if (ballotMatch && method === 'GET') {
    return ballotHandler(env, auth, decodeURIComponent(ballotMatch[1]!))
  }

  const voteMatch = pathname.match(/^\/api\/phases\/([^/]+)\/duels\/([^/]+)\/votes$/)
  if (voteMatch) {
    const phaseId = decodeURIComponent(voteMatch[1]!)
    const matchId = decodeURIComponent(voteMatch[2]!)
    if (method === 'POST') return saveVoteHandler(request, env, auth, phaseId, matchId, now)
    if (method === 'DELETE') return deleteVoteHandler(env, auth, phaseId, matchId, now)
  }

  const saveBallotMatch = pathname.match(/^\/api\/phases\/([^/]+)\/ballots$/)
  if (saveBallotMatch && method === 'POST') {
    return saveBallotHandler(
      request,
      env,
      auth,
      decodeURIComponent(saveBallotMatch[1]!),
      now,
    )
  }

  const deleteBallotMatch = pathname.match(/^\/api\/phases\/([^/]+)\/ballots\/([^/]+)$/)
  if (deleteBallotMatch && method === 'DELETE') {
    return deleteBallotHandler(
      env,
      auth,
      decodeURIComponent(deleteBallotMatch[1]!),
      decodeURIComponent(deleteBallotMatch[2]!),
      now,
    )
  }

  return null
}
