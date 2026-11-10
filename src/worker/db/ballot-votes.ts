import type { BallotKind } from '../../domain/ballot-vote'

export interface BallotVoteRow {
  phase_id: string
  target_id: string
  voter_id: string
  kind: BallotKind
  payload: string
  created_at: string
  updated_at: string
}

export function findBallotVote(
  env: Env,
  phaseId: string,
  targetId: string,
  voterId: string,
): Promise<BallotVoteRow | null> {
  return env.DB.prepare(
    `SELECT phase_id, target_id, voter_id, kind, payload, created_at, updated_at
     FROM ballot_votes WHERE phase_id = ? AND target_id = ? AND voter_id = ?`,
  )
    .bind(phaseId, targetId, voterId)
    .first<BallotVoteRow>()
}

export function listBallotVotesForVoter(
  env: Env,
  phaseId: string,
  voterId: string,
): Promise<BallotVoteRow[]> {
  return env.DB.prepare(
    `SELECT phase_id, target_id, voter_id, kind, payload, created_at, updated_at
     FROM ballot_votes WHERE phase_id = ? AND voter_id = ? ORDER BY target_id`,
  )
    .bind(phaseId, voterId)
    .all<BallotVoteRow>()
    .then((result) => result.results)
}
