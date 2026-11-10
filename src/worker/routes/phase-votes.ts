import type { AuthContext } from '../auth/session'
import {
  creditBalance,
  maxDuelCredits,
  validateDuelVote,
  type DuelSide,
} from '../../domain/duel-vote'
import { listElements, type ElementRecord } from '../db/elements'
import {
  findPhaseVoter,
  findDuelVote,
  listCreditAmounts,
  listDuelVotesForVoter,
  type PhaseVoterRow,
} from '../db/duel-votes'
import { uuidv7 } from '../db/ids'
import { findPhaseMatch, listPhaseMatches, type MatchRecord } from '../db/phase-operation'
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
  completion: { voted: number; total: number }
}

function elementSummary(element: ElementRecord | undefined): BallotElement | null {
  if (!element) return null
  return {
    elementId: element.id,
    name: element.name,
    imageUrl: element.image_url,
    videoUrl: element.video_url,
  }
}

async function loadBallot(
  env: Env,
  phase: PhaseRecord,
  voter: PhaseVoterRow,
): Promise<BallotBody> {
  const [elements, matches, votes, amounts] = await Promise.all([
    listElements(env, phase.tournament_id),
    listPhaseMatches(env, phase.id),
    listDuelVotesForVoter(env, phase.id, voter.user_id),
    listCreditAmounts(env, phase.id, voter.user_id),
  ])

  const byId = new Map(elements.map((element) => [element.id, element]))
  const votesByMatch = new Map(votes.map((vote) => [vote.match_id, vote]))
  const visible = matches.filter((match) => match.status !== 'bye')
  const config = phaseConfig(phase)

  return {
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
    completion: {
      voted: visible.filter((match) => votesByMatch.has(match.id)).length,
      total: visible.length,
    },
  }
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
  if (phase.vote_type !== 'duel') return apiError(422, 'invalid_vote')

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

/** Instrada voto e scheda del duello. */
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

  return null
}
