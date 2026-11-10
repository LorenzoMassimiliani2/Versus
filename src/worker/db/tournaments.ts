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

export type MembershipRole = OrganizerRole | 'participant'
export type TournamentWithRole = TournamentRecord & { role: MembershipRole }

export interface OrganizerRecord {
  user_id: string
  username: string
  role: OrganizerRole
  added_at: string
}

const TOURNAMENT_COLUMNS = `t.id, t.slug, t.name, t.description, t.cover_url, t.status, t.settings,
  t.created_at, t.updated_at, t.published_at, t.started_at, t.concluded_at`

const SLUG_MAX_LENGTH = 60

export const ACTIVE_TOURNAMENT_LIMIT = 10

/** Tornei attivi dell'istanza: pubblicati o in corso. Le bozze non contano. */
export function countActiveTournaments(env: Env): Promise<number> {
  return env.DB.prepare(
    `SELECT COUNT(*) AS count FROM tournaments WHERE status IN ('published','running')`,
  )
    .first<{ count: number }>()
    .then((row) => row?.count ?? 0)
}

/**
 * Porta la bozza in `published`. L'aggiornamento è condizionato allo stato
 * `draft`: due richieste concorrenti non pubblicano due volte.
 */
export function publishTournament(
  env: Env,
  id: string,
  publishedAt: string,
): Promise<D1Result> {
  return env.DB.prepare(
    `UPDATE tournaments SET status = 'published', published_at = ?, updated_at = ?
     WHERE id = ? AND status = 'draft'`,
  )
    .bind(publishedAt, publishedAt, id)
    .run()
}

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

/**
 * Tornei in cui l'utente è organizzatore o partecipante attivo. Le bozze
 * restano riservate agli organizzatori finché non vengono pubblicate.
 * Se l'utente ha entrambi i ruoli prevale quello di organizzatore.
 */
export function listMemberTournaments(
  env: Env,
  userId: string,
): Promise<TournamentWithRole[]> {
  return env.DB.prepare(
    `SELECT ${TOURNAMENT_COLUMNS},
       CASE WHEN o.role IS NULL THEN 'participant' ELSE o.role END AS role
     FROM tournaments t
     LEFT JOIN tournament_organizers o
       ON o.tournament_id = t.id AND o.user_id = ?
     LEFT JOIN tournament_participants p
       ON p.tournament_id = t.id AND p.user_id = ? AND p.status = 'active'
     WHERE o.user_id IS NOT NULL
        OR (p.user_id IS NOT NULL AND t.status <> 'draft')
     ORDER BY t.updated_at DESC, t.created_at DESC`,
  )
    .bind(userId, userId)
    .all<TournamentWithRole>()
    .then((result) => result.results)
}

/**
 * Ruolo dell'utente nel torneo, oppure `null` se non è membro. Un
 * partecipante vede il torneo solo dopo la pubblicazione.
 */
export async function findTournamentRole(
  env: Env,
  tournamentId: string,
  userId: string,
): Promise<MembershipRole | null> {
  const organizerRole = await findOrganizerRole(env, tournamentId, userId)
  if (organizerRole) return organizerRole

  const row = await env.DB.prepare(
    `SELECT p.status, t.status AS tournament_status
     FROM tournament_participants p
     JOIN tournaments t ON t.id = p.tournament_id
     WHERE p.tournament_id = ? AND p.user_id = ?`,
  )
    .bind(tournamentId, userId)
    .first<{ status: string; tournament_status: string }>()

  if (!row || row.status !== 'active' || row.tournament_status === 'draft') return null
  return 'participant'
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

export function deleteOrganizer(
  env: Env,
  tournamentId: string,
  userId: string,
): Promise<unknown> {
  return env.DB.prepare(
    'DELETE FROM tournament_organizers WHERE tournament_id = ? AND user_id = ?',
  )
    .bind(tournamentId, userId)
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
  settings?: string
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
  if (changes.settings !== undefined) {
    assignments.push('settings = ?')
    values.push(changes.settings)
  }

  return env.DB.prepare(`UPDATE tournaments SET ${assignments.join(', ')} WHERE id = ?`)
    .bind(...values, id)
    .run()
}
