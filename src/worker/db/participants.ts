export type ParticipantStatus = 'active' | 'removed'

export interface ParticipantRecord {
  user_id: string
  username: string
  status: ParticipantStatus
  added_by: string
  added_at: string
  removed_at: string | null
}

const PARTICIPANT_COLUMNS = `p.user_id, u.username, p.status, p.added_by, p.added_at, p.removed_at`

export function listParticipants(env: Env, tournamentId: string): Promise<ParticipantRecord[]> {
  return env.DB.prepare(
    `SELECT ${PARTICIPANT_COLUMNS}
     FROM tournament_participants p
     JOIN users u ON u.id = p.user_id
     WHERE p.tournament_id = ?
     ORDER BY CASE p.status WHEN 'active' THEN 0 ELSE 1 END, u.username`,
  )
    .bind(tournamentId)
    .all<ParticipantRecord>()
    .then((result) => result.results)
}

export function findParticipant(
  env: Env,
  tournamentId: string,
  userId: string,
): Promise<ParticipantRecord | null> {
  return env.DB.prepare(
    `SELECT ${PARTICIPANT_COLUMNS}
     FROM tournament_participants p
     JOIN users u ON u.id = p.user_id
     WHERE p.tournament_id = ? AND p.user_id = ?`,
  )
    .bind(tournamentId, userId)
    .first<ParticipantRecord>()
}

export function countActiveParticipants(env: Env, tournamentId: string): Promise<number> {
  return env.DB.prepare(
    `SELECT COUNT(*) AS count FROM tournament_participants
     WHERE tournament_id = ? AND status = 'active'`,
  )
    .bind(tournamentId)
    .first<{ count: number }>()
    .then((row) => row?.count ?? 0)
}

export interface NewParticipant {
  tournamentId: string
  userId: string
  addedBy: string
  addedAt: string
}

export function insertParticipant(env: Env, participant: NewParticipant): Promise<unknown> {
  return env.DB.prepare(
    `INSERT INTO tournament_participants (tournament_id, user_id, status, added_by, added_at, removed_at)
     VALUES (?, ?, 'active', ?, ?, NULL)`,
  )
    .bind(participant.tournamentId, participant.userId, participant.addedBy, participant.addedAt)
    .run()
}

export function reactivateParticipant(env: Env, participant: NewParticipant): Promise<unknown> {
  return env.DB.prepare(
    `UPDATE tournament_participants
     SET status = 'active', added_by = ?, added_at = ?, removed_at = NULL
     WHERE tournament_id = ? AND user_id = ?`,
  )
    .bind(participant.addedBy, participant.addedAt, participant.tournamentId, participant.userId)
    .run()
}

export function removeParticipant(
  env: Env,
  tournamentId: string,
  userId: string,
  removedAt: string,
): Promise<unknown> {
  return env.DB.prepare(
    `UPDATE tournament_participants
     SET status = 'removed', removed_at = ?
     WHERE tournament_id = ? AND user_id = ? AND status = 'active'`,
  )
    .bind(removedAt, tournamentId, userId)
    .run()
}

export interface CandidateRecord {
  id: string
  username: string
  is_participant: number
}

/** Utenti attivi selezionabili, con l'indicazione di chi partecipa già. */
export function listParticipantCandidates(
  env: Env,
  tournamentId: string,
): Promise<CandidateRecord[]> {
  return env.DB.prepare(
    `SELECT u.id, u.username,
       EXISTS (
         SELECT 1 FROM tournament_participants p
         WHERE p.tournament_id = ? AND p.user_id = u.id AND p.status = 'active'
       ) AS is_participant
     FROM users u
     WHERE u.is_active = 1
     ORDER BY u.username`,
  )
    .bind(tournamentId)
    .all<CandidateRecord>()
    .then((result) => result.results)
}
