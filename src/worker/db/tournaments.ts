import { slugify } from '../../domain/slug'

export type TournamentStatus = 'draft' | 'published' | 'running' | 'concluded' | 'archived'
export type OrganizerRole = 'owner' | 'co_organizer'

export interface TournamentRecord {
  id: string
  slug: string
  name: string
  description: string
  cover_url: string | null
  status: TournamentStatus
  settings: string
  created_at: string
  updated_at: string
  published_at: string | null
  started_at: string | null
  concluded_at: string | null
}

export type TournamentWithRole = TournamentRecord & { role: OrganizerRole }

export interface OrganizerRecord {
  user_id: string
  username: string
  role: OrganizerRole
  added_at: string
}

const TOURNAMENT_COLUMNS = `t.id, t.slug, t.name, t.description, t.cover_url, t.status, t.settings,
  t.created_at, t.updated_at, t.published_at, t.started_at, t.concluded_at`

const SLUG_MAX_LENGTH = 60

export function findTournamentById(env: Env, id: string): Promise<TournamentRecord | null> {
  return env.DB.prepare(`SELECT ${TOURNAMENT_COLUMNS} FROM tournaments t WHERE t.id = ?`)
    .bind(id)
    .first<TournamentRecord>()
}

export function findTournamentBySlug(env: Env, slug: string): Promise<TournamentRecord | null> {
  return env.DB.prepare(`SELECT ${TOURNAMENT_COLUMNS} FROM tournaments t WHERE t.slug = ?`)
    .bind(slug)
    .first<TournamentRecord>()
}

/**
 * Restituisce lo slug generato dal nome, aggiungendo un suffisso numerico
 * quando esiste già. Lo slug non cambia più dopo la creazione.
 */
export async function uniqueSlug(env: Env, name: string): Promise<string> {
  const base = slugify(name)
  let candidate = base
  let suffix = 1

  while (await findTournamentBySlug(env, candidate)) {
    suffix += 1
    const tail = `-${suffix}`
    candidate = `${base.slice(0, SLUG_MAX_LENGTH - tail.length).replace(/-+$/, '')}${tail}`
  }
  return candidate
}

export function listOrganizedTournaments(
  env: Env,
  userId: string,
): Promise<TournamentWithRole[]> {
  return env.DB.prepare(
    `SELECT ${TOURNAMENT_COLUMNS}, o.role
     FROM tournaments t
     JOIN tournament_organizers o ON o.tournament_id = t.id
     WHERE o.user_id = ?
     ORDER BY t.updated_at DESC, t.created_at DESC`,
  )
    .bind(userId)
    .all<TournamentWithRole>()
    .then((result) => result.results)
}

export function findOrganizerRole(
  env: Env,
  tournamentId: string,
  userId: string,
): Promise<OrganizerRole | null> {
  return env.DB.prepare(
    'SELECT role FROM tournament_organizers WHERE tournament_id = ? AND user_id = ?',
  )
    .bind(tournamentId, userId)
    .first<{ role: OrganizerRole }>()
    .then((row) => row?.role ?? null)
}

export function listOrganizers(env: Env, tournamentId: string): Promise<OrganizerRecord[]> {
  return env.DB.prepare(
    `SELECT o.user_id, u.username, o.role, o.added_at
     FROM tournament_organizers o
     JOIN users u ON u.id = o.user_id
     WHERE o.tournament_id = ?
     ORDER BY CASE o.role WHEN 'owner' THEN 0 ELSE 1 END, u.username`,
  )
    .bind(tournamentId)
    .all<OrganizerRecord>()
    .then((result) => result.results)
}

export interface NewTournament {
  id: string
  slug: string
  name: string
  description: string
  coverUrl: string | null
  settings: string
  createdAt: string
  updatedAt: string
}

export function insertTournament(env: Env, tournament: NewTournament): Promise<unknown> {
  return env.DB.prepare(
    `INSERT INTO tournaments (id, slug, name, description, cover_url, status, settings, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
  )
    .bind(
      tournament.id,
      tournament.slug,
      tournament.name,
      tournament.description,
      tournament.coverUrl,
      tournament.settings,
      tournament.createdAt,
      tournament.updatedAt,
    )
    .run()
}

export interface NewOrganizer {
  tournamentId: string
  userId: string
  role: OrganizerRole
  addedBy: string
  addedAt: string
}

export function insertOrganizer(env: Env, organizer: NewOrganizer): Promise<unknown> {
  return env.DB.prepare(
    `INSERT INTO tournament_organizers (tournament_id, user_id, role, added_by, added_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(
      organizer.tournamentId,
      organizer.userId,
      organizer.role,
      organizer.addedBy,
      organizer.addedAt,
    )
    .run()
}

export interface TournamentChanges {
  name?: string
  description?: string
  coverUrl?: string | null
}

export function updateTournamentDetails(
  env: Env,
  id: string,
  changes: TournamentChanges,
  updatedAt: string,
): Promise<unknown> {
  const assignments = ['updated_at = ?']
  const values: (string | null)[] = [updatedAt]

  if (changes.name !== undefined) {
    assignments.push('name = ?')
    values.push(changes.name)
  }
  if (changes.description !== undefined) {
    assignments.push('description = ?')
    values.push(changes.description)
  }
  if (changes.coverUrl !== undefined) {
    assignments.push('cover_url = ?')
    values.push(changes.coverUrl)
  }

  return env.DB.prepare(`UPDATE tournaments SET ${assignments.join(', ')} WHERE id = ?`)
    .bind(...values, id)
    .run()
}
