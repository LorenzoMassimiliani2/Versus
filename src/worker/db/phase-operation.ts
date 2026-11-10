import type { PhaseRecord } from './phases'

export interface PhaseEntrantRecord {
  phase_id: string
  element_id: string
  element_name: string
  seed: number
  position: number
}

export interface PhaseVoterRecord {
  phase_id: string
  user_id: string
  credits_budget: number
}

export interface GroupRecord {
  id: string
  phase_id: string
  name: string
  position: number
}

export interface GroupMemberRecord {
  group_id: string
  element_id: string
  position: number
}

export interface MatchRecord {
  id: string
  phase_id: string
  group_id: string | null
  round: number
  position: number
  element_a_id: string | null
  element_b_id: string | null
  winner_element_id: string | null
  status: 'pending' | 'open' | 'closed' | 'bye'
  closed_at: string | null
}

export interface PhaseResultRecord {
  id: string
  phase_id: string
  version: number
  closed_at: string
  config_snapshot: string
  results: string
}

export function listPhaseEntrants(env: Env, phaseId: string): Promise<PhaseEntrantRecord[]> {
  return env.DB.prepare(
    `SELECT pe.phase_id, pe.element_id, e.name AS element_name, pe.seed, pe.position
     FROM phase_entrants pe
     JOIN elements e ON e.id = pe.element_id
     WHERE pe.phase_id = ?
     ORDER BY pe.position`,
  )
    .bind(phaseId)
    .all<PhaseEntrantRecord>()
    .then((result) => result.results)
}

export function listPhaseGroups(env: Env, phaseId: string): Promise<GroupRecord[]> {
  return env.DB.prepare(
    'SELECT id, phase_id, name, position FROM groups WHERE phase_id = ? ORDER BY position',
  )
    .bind(phaseId)
    .all<GroupRecord>()
    .then((result) => result.results)
}

export function listGroupMembers(env: Env, phaseId: string): Promise<GroupMemberRecord[]> {
  return env.DB.prepare(
    `SELECT gm.group_id, gm.element_id, gm.position
     FROM group_members gm
     JOIN groups g ON g.id = gm.group_id
     WHERE g.phase_id = ?
     ORDER BY g.position, gm.position`,
  )
    .bind(phaseId)
    .all<GroupMemberRecord>()
    .then((result) => result.results)
}

export function listPhaseMatches(env: Env, phaseId: string): Promise<MatchRecord[]> {
  return env.DB.prepare(
    `SELECT id, phase_id, group_id, round, position, element_a_id, element_b_id,
       winner_element_id, status, closed_at
     FROM matches
     WHERE phase_id = ?
     ORDER BY round, position`,
  )
    .bind(phaseId)
    .all<MatchRecord>()
    .then((result) => result.results)
}

export function findPhaseMatch(
  env: Env,
  phaseId: string,
  matchId: string,
): Promise<MatchRecord | null> {
  return env.DB.prepare(
    `SELECT id, phase_id, group_id, round, position, element_a_id, element_b_id,
       winner_element_id, status, closed_at
     FROM matches WHERE phase_id = ? AND id = ?`,
  )
    .bind(phaseId, matchId)
    .first<MatchRecord>()
}

/** Risultato piu recente della fase, se la fase e' stata chiusa. */
export function findLatestPhaseResult(
  env: Env,
  phaseId: string,
): Promise<PhaseResultRecord | null> {
  return env.DB.prepare(
    `SELECT id, phase_id, version, closed_at, config_snapshot, results
     FROM phase_results WHERE phase_id = ? ORDER BY version DESC LIMIT 1`,
  )
    .bind(phaseId)
    .first<PhaseResultRecord>()
}

/** Utenti con partecipazione attiva, fotografati come votanti della fase. */
export function listActiveParticipantIds(env: Env, tournamentId: string): Promise<string[]> {
  return env.DB.prepare(
    `SELECT user_id FROM tournament_participants
     WHERE tournament_id = ? AND status = 'active'
     ORDER BY added_at, user_id`,
  )
    .bind(tournamentId)
    .all<{ user_id: string }>()
    .then((result) => result.results.map((row) => row.user_id))
}

export interface NewGroup {
  id: string
  name: string
  position: number
  memberIds: string[]
}

export interface NewMatch {
  id: string
  groupId: string | null
  round: number
  position: number
  elementAId: string | null
  elementBId: string | null
  winnerElementId: string | null
  status: 'open' | 'bye'
  closedAt: string | null
}

export interface NewPhaseOperation {
  phaseId: string
  entrantIds: string[]
  voterIds: string[]
  creditsBudget: number
  groups: NewGroup[]
  matches: NewMatch[]
}

/**
 * Statement che creano lo stato operativo della fase, gia nell'ordine di
 * esecuzione. Non includono il passaggio di stato della fase ne del torneo.
 */
export function phaseOperationStatements(
  env: Env,
  operation: NewPhaseOperation,
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = []

  operation.entrantIds.forEach((elementId, index) => {
    statements.push(
      env.DB.prepare(
        `INSERT INTO phase_entrants (phase_id, element_id, seed, position)
         VALUES (?, ?, ?, ?)`,
      ).bind(operation.phaseId, elementId, index + 1, index + 1),
    )
  })

  for (const userId of operation.voterIds) {
    statements.push(
      env.DB.prepare(
        'INSERT INTO phase_voters (phase_id, user_id, credits_budget) VALUES (?, ?, ?)',
      ).bind(operation.phaseId, userId, operation.creditsBudget),
    )
  }

  operation.groups.forEach((group) => {
    statements.push(
      env.DB.prepare('INSERT INTO groups (id, phase_id, name, position) VALUES (?, ?, ?, ?)').bind(
        group.id,
        operation.phaseId,
        group.name,
        group.position,
      ),
    )
    group.memberIds.forEach((elementId, index) => {
      statements.push(
        env.DB.prepare(
          'INSERT INTO group_members (group_id, element_id, position) VALUES (?, ?, ?)',
        ).bind(group.id, elementId, index + 1),
      )
    })
  })

  operation.matches.forEach((match) => {
    statements.push(
      env.DB.prepare(
        `INSERT INTO matches (id, phase_id, group_id, round, position, element_a_id,
           element_b_id, winner_element_id, status, closed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        match.id,
        operation.phaseId,
        match.groupId,
        match.round,
        match.position,
        match.elementAId,
        match.elementBId,
        match.winnerElementId,
        match.status,
        match.closedAt,
      ),
    )
  })

  return statements
}

/** Cancella lo stato operativo parziale dopo un'apertura fallita. */
export function deletePhaseOperationStatements(
  env: Env,
  phaseId: string,
): D1PreparedStatement[] {
  return [
    env.DB.prepare('DELETE FROM matches WHERE phase_id = ?').bind(phaseId),
    env.DB.prepare(
      'DELETE FROM group_members WHERE group_id IN (SELECT id FROM groups WHERE phase_id = ?)',
    ).bind(phaseId),
    env.DB.prepare('DELETE FROM groups WHERE phase_id = ?').bind(phaseId),
    env.DB.prepare('DELETE FROM phase_voters WHERE phase_id = ?').bind(phaseId),
    env.DB.prepare('DELETE FROM phase_entrants WHERE phase_id = ?').bind(phaseId),
  ]
}

export function findPhaseByPosition(
  env: Env,
  tournamentId: string,
  position: number,
): Promise<PhaseRecord | null> {
  return env.DB.prepare(
    `SELECT id, tournament_id, position, name, formula, vote_type, config, advance,
       status, opened_at, closed_at, created_at, updated_at
     FROM phases WHERE tournament_id = ? AND position = ?`,
  )
    .bind(tournamentId, position)
    .first<PhaseRecord>()
}
