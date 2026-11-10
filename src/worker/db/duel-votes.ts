import type { DuelSide } from '../../domain/duel-vote'

export interface PhaseVoterRow {
  phase_id: string
  user_id: string
  credits_budget: number
}

export interface DuelVoteRow {
  match_id: string
  voter_id: string
  side: DuelSide
  credits: number
  created_at: string
  updated_at: string
}

export function findPhaseVoter(
  env: Env,
  phaseId: string,
  userId: string,
): Promise<PhaseVoterRow | null> {
  return env.DB.prepare(
    'SELECT phase_id, user_id, credits_budget FROM phase_voters WHERE phase_id = ? AND user_id = ?',
  )
    .bind(phaseId, userId)
    .first<PhaseVoterRow>()
}

export function findDuelVote(
  env: Env,
  matchId: string,
  voterId: string,
): Promise<DuelVoteRow | null> {
  return env.DB.prepare(
    `SELECT match_id, voter_id, side, credits, created_at, updated_at
     FROM duel_votes WHERE match_id = ? AND voter_id = ?`,
  )
    .bind(matchId, voterId)
    .first<DuelVoteRow>()
}

export function listDuelVotesForVoter(
  env: Env,
  phaseId: string,
  voterId: string,
): Promise<DuelVoteRow[]> {
  return env.DB.prepare(
    `SELECT dv.match_id, dv.voter_id, dv.side, dv.credits, dv.created_at, dv.updated_at
     FROM duel_votes dv
     JOIN matches m ON m.id = dv.match_id
     WHERE m.phase_id = ? AND dv.voter_id = ?`,
  )
    .bind(phaseId, voterId)
    .all<DuelVoteRow>()
    .then((result) => result.results)
}

/** Movimenti del ledger per il votante nella fase, in ordine di creazione. */
export function listCreditAmounts(
  env: Env,
  phaseId: string,
  voterId: string,
): Promise<number[]> {
  return env.DB.prepare(
    `SELECT amount FROM credit_entries
     WHERE phase_id = ? AND voter_id = ?
     ORDER BY created_at, id`,
  )
    .bind(phaseId, voterId)
    .all<{ amount: number }>()
    .then((result) => result.results.map((row) => row.amount))
}
