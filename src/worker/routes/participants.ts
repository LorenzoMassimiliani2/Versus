import type { AuthContext } from '../auth/session'
import { findUserById } from '../db/users'
import {
  countActiveParticipants,
  findParticipant,
  insertParticipant,
  listParticipantCandidates,
  listParticipants,
  reactivateParticipant,
  removeParticipant,
  type ParticipantRecord,
} from '../db/participants'
import { hasActivePhases } from '../db/phases'
import {
  deleteOrganizer,
  findOrganizerRole,
  findTournamentById,
  insertOrganizer,
  listOrganizers,
  type OrganizerRecord,
  type TournamentRecord,
} from '../db/tournaments'
import { writeAudit } from '../db/audit'
import { apiError, json } from '../http/json'

export const PARTICIPANT_LIMIT = 20

interface ParticipantBody {
  userId: string
  username: string
  status: ParticipantRecord['status']
  addedBy: string
  addedAt: string
  removedAt: string | null
}

interface OrganizerBody {
  userId: string
  username: string
  role: OrganizerRecord['role']
  addedAt: string
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function readUserId(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null
  const userId = (value as { userId?: unknown }).userId
  if (typeof userId !== 'string') return null
  const trimmed = userId.trim()
  return trimmed ? trimmed : null
}

function serialiseParticipant(participant: ParticipantRecord): ParticipantBody {
  return {
    userId: participant.user_id,
    username: participant.username,
    status: participant.status,
    addedBy: participant.added_by,
    addedAt: participant.added_at,
    removedAt: participant.removed_at,
  }
}

function serialiseOrganizer(organizer: OrganizerRecord): OrganizerBody {
  return {
    userId: organizer.user_id,
    username: organizer.username,
    role: organizer.role,
    addedAt: organizer.added_at,
  }
}

/**
 * A2: i partecipanti si aggiungono e rimuovono solo tra una fase e l'altra.
 * Nessuna fase aperta o in attesa di risoluzione deve esistere; un torneo
 * concluso o archiviato non si modifica piu'.
 */
async function participantEditBlocker(
  env: Env,
  tournament: TournamentRecord,
): Promise<string | null> {
  if (!['draft', 'published', 'running'].includes(tournament.status)) {
    return 'tournament_not_editable'
  }
  if (await hasActivePhases(env, tournament.id)) return 'phase_in_progress'
  return null
}

/** 404 se il torneo non esiste, 403 se l'utente non lo organizza. */
async function authorizeOrganizer(
  env: Env,
  auth: AuthContext,
  tournamentId: string,
): Promise<TournamentRecord | Response> {
  const tournament = await findTournamentById(env, tournamentId)
  if (!tournament) return apiError(404, 'not_found')
  if (!(await findOrganizerRole(env, tournamentId, auth.user.id))) {
    return apiError(403, 'forbidden')
  }
  return tournament
}

async function listParticipantsHandler(
  env: Env,
  auth: AuthContext,
  tournamentId: string,
): Promise<Response> {
  const tournament = await authorizeOrganizer(env, auth, tournamentId)
  if (tournament instanceof Response) return tournament

  const participants = await listParticipants(env, tournamentId)
  return json({ participants: participants.map(serialiseParticipant) })
}

async function addParticipantHandler(
  request: Request,
  env: Env,
  auth: AuthContext,
  tournamentId: string,
  now: number,
): Promise<Response> {
  const tournament = await authorizeOrganizer(env, auth, tournamentId)
  if (tournament instanceof Response) return tournament
  const blocker = await participantEditBlocker(env, tournament)
  if (blocker) return apiError(409, blocker)

  const userId = readUserId(await readJson(request))
  if (!userId) return apiError(400, 'invalid_request')

  const user = await findUserById(env, userId)
  if (!user || user.is_active !== 1) return apiError(400, 'invalid_request')

  const existing = await findParticipant(env, tournamentId, userId)
  if (existing?.status === 'active') {
    return json({ participant: serialiseParticipant(existing) })
  }

  if ((await countActiveParticipants(env, tournamentId)) >= PARTICIPANT_LIMIT) {
    return apiError(409, 'participant_limit_reached')
  }

  const addedAt = new Date(now).toISOString()
  const input = { tournamentId, userId, addedBy: auth.user.id, addedAt }
  if (existing) {
    await reactivateParticipant(env, input)
  } else {
    await insertParticipant(env, input)
  }

  const participant = await findParticipant(env, tournamentId, userId)
  if (!participant) return apiError(500, 'internal_error')

  await writeAudit(env, now, {
    tournamentId,
    actorId: auth.user.id,
    action: 'participant.add',
    targetType: 'participant',
    targetId: userId,
    before: { status: existing?.status ?? null },
    after: { status: 'active' },
  })

  return json({ participant: serialiseParticipant(participant) }, { status: 201 })
}

async function removeParticipantHandler(
  env: Env,
  auth: AuthContext,
  tournamentId: string,
  userId: string,
  now: number,
): Promise<Response> {
  const tournament = await authorizeOrganizer(env, auth, tournamentId)
  if (tournament instanceof Response) return tournament
  const blocker = await participantEditBlocker(env, tournament)
  if (blocker) return apiError(409, blocker)

  const participant = await findParticipant(env, tournamentId, userId)
  if (!participant || participant.status !== 'active') return apiError(404, 'not_found')

  await removeParticipant(env, tournamentId, userId, new Date(now).toISOString())
  await writeAudit(env, now, {
    tournamentId,
    actorId: auth.user.id,
    action: 'participant.remove',
    targetType: 'participant',
    targetId: userId,
    before: { status: 'active' },
    after: { status: 'removed' },
  })
  return new Response(null, { status: 204 })
}

async function listCandidatesHandler(
  env: Env,
  auth: AuthContext,
  tournamentId: string,
): Promise<Response> {
  const tournament = await authorizeOrganizer(env, auth, tournamentId)
  if (tournament instanceof Response) return tournament

  const candidates = await listParticipantCandidates(env, tournamentId)
  return json({
    users: candidates.map((candidate) => ({
      id: candidate.id,
      username: candidate.username,
      isParticipant: candidate.is_participant === 1,
    })),
  })
}

async function nominateOrganizerHandler(
  request: Request,
  env: Env,
  auth: AuthContext,
  tournamentId: string,
  now: number,
): Promise<Response> {
  const tournament = await findTournamentById(env, tournamentId)
  if (!tournament) return apiError(404, 'not_found')
  if ((await findOrganizerRole(env, tournamentId, auth.user.id)) !== 'owner') {
    return apiError(403, 'forbidden')
  }

  const userId = readUserId(await readJson(request))
  if (!userId) return apiError(400, 'invalid_request')

  const user = await findUserById(env, userId)
  if (!user || user.is_active !== 1) return apiError(400, 'invalid_request')

  const existingRole = await findOrganizerRole(env, tournamentId, userId)
  if (existingRole === 'owner') return apiError(409, 'already_organizer')
  if (existingRole === 'co_organizer') {
    const organizer = (await listOrganizers(env, tournamentId)).find(
      (item) => item.user_id === userId,
    )
    if (!organizer) return apiError(500, 'internal_error')
    return json({ organizer: serialiseOrganizer(organizer) })
  }

  await insertOrganizer(env, {
    tournamentId,
    userId,
    role: 'co_organizer',
    addedBy: auth.user.id,
    addedAt: new Date(now).toISOString(),
  })

  const organizer = (await listOrganizers(env, tournamentId)).find(
    (item) => item.user_id === userId,
  )
  if (!organizer) return apiError(500, 'internal_error')

  await writeAudit(env, now, {
    tournamentId,
    actorId: auth.user.id,
    action: 'organizer.nominate',
    targetType: 'organizer',
    targetId: userId,
    after: { role: 'co_organizer' },
  })

  return json({ organizer: serialiseOrganizer(organizer) }, { status: 201 })
}

async function revokeOrganizerHandler(
  env: Env,
  auth: AuthContext,
  tournamentId: string,
  userId: string,
  now: number,
): Promise<Response> {
  const tournament = await findTournamentById(env, tournamentId)
  if (!tournament) return apiError(404, 'not_found')
  if ((await findOrganizerRole(env, tournamentId, auth.user.id)) !== 'owner') {
    return apiError(403, 'forbidden')
  }

  const targetRole = await findOrganizerRole(env, tournamentId, userId)
  if (targetRole === 'owner') return apiError(409, 'cannot_remove_owner')
  if (targetRole !== 'co_organizer') return apiError(404, 'not_found')

  await deleteOrganizer(env, tournamentId, userId)
  await writeAudit(env, now, {
    tournamentId,
    actorId: auth.user.id,
    action: 'organizer.revoke',
    targetType: 'organizer',
    targetId: userId,
    before: { role: 'co_organizer' },
  })
  return new Response(null, { status: 204 })
}

/**
 * Instrada partecipanti, co-organizzatori e candidati di un torneo.
 * Restituisce `null` quando percorso e metodo non appartengono a quest'area.
 */
export async function handleParticipantsRoute(
  request: Request,
  env: Env,
  auth: AuthContext,
  now = Date.now(),
): Promise<Response | null> {
  const { pathname } = new URL(request.url)
  const method = request.method

  const participantsMatch = pathname.match(/^\/api\/tournaments\/([^/]+)\/participants$/)
  if (participantsMatch) {
    const tournamentId = decodeURIComponent(participantsMatch[1]!)
    if (method === 'GET') return listParticipantsHandler(env, auth, tournamentId)
    if (method === 'POST') return addParticipantHandler(request, env, auth, tournamentId, now)
    return null
  }

  const participantMatch = pathname.match(
    /^\/api\/tournaments\/([^/]+)\/participants\/([^/]+)$/,
  )
  if (participantMatch && method === 'DELETE') {
    return removeParticipantHandler(
      env,
      auth,
      decodeURIComponent(participantMatch[1]!),
      decodeURIComponent(participantMatch[2]!),
      now,
    )
  }

  const candidatesMatch = pathname.match(/^\/api\/tournaments\/([^/]+)\/candidates$/)
  if (candidatesMatch && method === 'GET') {
    return listCandidatesHandler(env, auth, decodeURIComponent(candidatesMatch[1]!))
  }

  const organizersMatch = pathname.match(/^\/api\/tournaments\/([^/]+)\/organizers$/)
  if (organizersMatch) {
    const tournamentId = decodeURIComponent(organizersMatch[1]!)
    if (method === 'POST') {
      return nominateOrganizerHandler(request, env, auth, tournamentId, now)
    }
    return null
  }

  const organizerMatch = pathname.match(/^\/api\/tournaments\/([^/]+)\/organizers\/([^/]+)$/)
  if (organizerMatch && method === 'DELETE') {
    return revokeOrganizerHandler(
      env,
      auth,
      decodeURIComponent(organizerMatch[1]!),
      decodeURIComponent(organizerMatch[2]!),
      now,
    )
  }

  return null
}
