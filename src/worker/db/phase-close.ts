import type {
  ResultsBallotVote,
  ResultsDuelVote,
  ResultsEntrant,
  ResultsGroup,
  ResultsMatch,
} from '../../domain/phase-results'
import type { PhaseResultRecord } from './phase-operation'
import {
  listGroupMembers,
  listPhaseEntrants,
  listPhaseGroups,
  listPhaseMatches,
} from './phase-operation'


/**
 * Le tabelle dei voti arrivano con i ticket di voto (TICKET-0018/0019). Prima
 * della loro migrazione la chiusura le considera vuote, così il ciclo della
 * fase resta utilizzabile e la computazione non fallisce su schema assente.
 */
export async function hasVoteTable(env: Env, name: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?`,
  )
    .bind(name)
    .first<{ count: number }>()
  return (row?.count ?? 0) === 1
}

export interface PhaseVoterRecord {
  user_id: string
  credits_budget: number
}

export function listPhaseVoters(env: Env, phaseId: string): Promise<PhaseVoterRecord[]> {
  return env.DB.prepare(
    'SELECT user_id, credits_budget FROM phase_voters WHERE phase_id = ? ORDER BY user_id',
  )
    .bind(phaseId)
    .all<PhaseVoterRecord>()
    .then((result) => result.results)
}

export function listPhaseDuelVotes(env: Env, phaseId: string): Promise<ResultsDuelVote[]> {
  return env.DB.prepare(
    `SELECT dv.match_id, dv.side, dv.credits
     FROM duel_votes dv
     JOIN matches m ON m.id = dv.match_id
     WHERE m.phase_id = ?`,
  )
    .bind(phaseId)
    .all<{ match_id: string; side: ResultsDuelVote['side']; credits: number }>()
    .then((result) =>
      result.results.map((row) => ({
        matchId: row.match_id,
        side: row.side,
        credits: row.credits,
      })),
    )
}

export function listPhaseBallotVotes(env: Env, phaseId: string): Promise<ResultsBallotVote[]> {
  return env.DB.prepare(
    `SELECT target_id, kind, payload FROM ballot_votes WHERE phase_id = ?`,
  )
    .bind(phaseId)
    .all<{ target_id: string; kind: ResultsBallotVote['kind']; payload: string }>()
    .then((result) =>
      result.results.map((row) => ({
        targetId: row.target_id,
        kind: row.kind,
        payload: row.payload,
      })),
    )
}

export interface ResultsOperation {
  entrants: ResultsEntrant[]
  groups: ResultsGroup[]
  matches: ResultsMatch[]
}

/** Stato operativo della fase nell'ordine deterministico usato dal calcolo. */
export async function loadResultsOperation(env: Env, phaseId: string): Promise<ResultsOperation> {
  const [entrants, groups, members, matches] = await Promise.all([
    listPhaseEntrants(env, phaseId),
    listPhaseGroups(env, phaseId),
    listGroupMembers(env, phaseId),
    listPhaseMatches(env, phaseId),
  ])

  return {
    entrants: entrants.map((row) => ({ elementId: row.element_id })),
    groups: groups.map((group) => ({
      id: group.id,
      position: group.position,
      memberIds: members
        .filter((member) => member.group_id === group.id)
        .map((member) => member.element_id),
    })),
    matches: matches.map((match) => ({
      id: match.id,
      groupId: match.group_id,
      round: match.round,
      position: match.position,
      elementAId: match.element_a_id,
      elementBId: match.element_b_id,
      winnerElementId: match.winner_element_id,
      status: match.status,
    })),
  }
}

/**
 * Votanti che non hanno ancora espresso un voto o un'astensione su ogni sfida
 * aperta della fase. Zero significa che `all_voted` è soddisfatto.
 */
export function countDuelVotersMissingVotes(env: Env, phaseId: string): Promise<number> {
  return env.DB.prepare(
    `SELECT COUNT(*) AS count FROM phase_voters pv
     WHERE pv.phase_id = ?
       AND EXISTS (
         SELECT 1 FROM matches m
         WHERE m.phase_id = ? AND m.status = 'open'
           AND NOT EXISTS (
             SELECT 1 FROM duel_votes dv
             WHERE dv.match_id = m.id AND dv.voter_id = pv.user_id
           )
       )`,
  )
    .bind(phaseId, phaseId)
    .first<{ count: number }>()
    .then((row) => row?.count ?? 0)
}

/**
 * Votanti che non hanno una scheda per ogni target della fase. Per le fasi a
 * gironi i target sono i gironi; per le altre fasi il target è la fase stessa.
 */
export function countBallotVotersMissingVotes(
  env: Env,
  phaseId: string,
  targetCount: number,
): Promise<number> {
  if (targetCount === 0) return Promise.resolve(0)
  return env.DB.prepare(
    `SELECT COUNT(*) AS count FROM phase_voters pv
     WHERE pv.phase_id = ?
       AND (
         SELECT COUNT(DISTINCT bv.target_id) FROM ballot_votes bv
         WHERE bv.phase_id = ? AND bv.voter_id = pv.user_id
       ) < ?`,
  )
    .bind(phaseId, phaseId, targetCount)
    .first<{ count: number }>()
    .then((row) => row?.count ?? 0)
}

export function findLatestResult(env: Env, phaseId: string): Promise<PhaseResultRecord | null> {
  return env.DB.prepare(
    `SELECT id, phase_id, version, closed_at, config_snapshot, results
     FROM phase_results WHERE phase_id = ? ORDER BY version DESC LIMIT 1`,
  )
    .bind(phaseId)
    .first<PhaseResultRecord>()
}
