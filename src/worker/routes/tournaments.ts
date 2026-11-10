import type { AuthContext } from '../auth/session'
import { defaultPhaseConfig, type PhaseAdvance, type PhaseConfig } from '../../domain/phases'
import type { CustomFieldDefinition } from '../../domain/custom-values'
import { validatePlan, type PlanInput } from '../../domain/plan'
import {
  DEFAULT_TOURNAMENT_SETTINGS,
  parseTournamentSettings,
  readTournamentSettings,
  readTournamentSettingsPatch,
  type TournamentSettings,
} from '../../domain/tournament-settings'
import { uuidv7 } from '../db/ids'
import {
  ACTIVE_TOURNAMENT_LIMIT,
  countActiveTournaments,
  findOrganizerRole,
  findTournamentById,
  findTournamentRole,
  insertOrganizer,
  insertTournament,
  listMemberTournaments,
  listOrganizers,
  publishTournament,
  uniqueSlug,
  updateTournamentDetails,
  type MembershipRole,
  type OrganizerRecord,
  type OrganizerRole,
  type TournamentRecord,
  type TournamentWithRole,
} from '../db/tournaments'
import { listCustomFields, listElements } from '../db/elements'
import { countActiveParticipants } from '../db/participants'
import { countStartedPhases, listPhases } from '../db/phases'
import { apiError, json } from '../http/json'

const NAME_MAX_LENGTH = 120
const DESCRIPTION_MAX_LENGTH = 2000
const URL_MAX_LENGTH = 2048

interface TournamentInput {
  name?: string
  description?: string
  coverUrl?: string | null
  settings?: Partial<TournamentSettings>
}

interface OrganizerSummary {
  userId: string
  username: string
  role: OrganizerRole
  addedAt: string
}

interface TournamentSummary {
  id: string
  slug: string
  name: string
  description: string
  coverUrl: string | null
  status: string
  createdAt: string
  updatedAt: string
  role: MembershipRole
}

interface TournamentDetail extends TournamentSummary {
  settings: TournamentSettings
  publishedAt: string | null
  startedAt: string | null
  concludedAt: string | null
  organizers: OrganizerSummary[]
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function readName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim()
  if (!name || name.length > NAME_MAX_LENGTH) return null
  return name
}

function readDescription(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > DESCRIPTION_MAX_LENGTH) return null
  return value
}

function readCoverUrl(value: unknown): { valid: boolean; value: string | null } {
  if (value === null) return { valid: true, value: null }
  if (typeof value !== 'string') return { valid: false, value: null }

  const url = value.trim()
  if (!url) return { valid: true, value: null }
  if (url.length > URL_MAX_LENGTH) return { valid: false, value: null }

  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, value: null }
    }
  } catch {
    return { valid: false, value: null }
  }
  return { valid: true, value: url }
}

function parseCreateInput(value: unknown): TournamentInput | null {
  if (typeof value !== 'object' || value === null) return null
  const body = value as Record<string, unknown>

  const name = readName(body.name)
  if (!name) return null

  const input: TournamentInput = { name }
  if (body.description !== undefined) {
    const description = readDescription(body.description)
    if (description === null) return null
    input.description = description
  }
  if (body.coverUrl !== undefined) {
    const coverUrl = readCoverUrl(body.coverUrl)
    if (!coverUrl.valid) return null
    input.coverUrl = coverUrl.value
  }
  if (body.settings !== undefined) {
    const settings = readTournamentSettings(body.settings)
    if (!settings) return null
    input.settings = settings
  }
  return input
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function parsePatchInput(value: unknown): TournamentInput | null {
  if (typeof value !== 'object' || value === null) return null
  const body = value as Record<string, unknown>
  const input: TournamentInput = {}

  if (body.name !== undefined) {
    const name = readName(body.name)
    if (!name) return null
    input.name = name
  }
  if (body.description !== undefined) {
    const description = readDescription(body.description)
    if (description === null) return null
    input.description = description
  }
  if (body.coverUrl !== undefined) {
    const coverUrl = readCoverUrl(body.coverUrl)
    if (!coverUrl.valid) return null
    input.coverUrl = coverUrl.value
  }

  if (body.settings !== undefined) {
    const settings = readTournamentSettingsPatch(body.settings)
    if (!settings) return null
    input.settings = settings
  }

  if (
    input.name === undefined &&
    input.description === undefined &&
    input.coverUrl === undefined &&
    input.settings === undefined
  ) {
    return null
  }
  return input
}

function summarize(tournament: TournamentRecord, role: MembershipRole): TournamentSummary {
  return {
    id: tournament.id,
    slug: tournament.slug,
    name: tournament.name,
    description: tournament.description,
    coverUrl: tournament.cover_url,
    status: tournament.status,
    createdAt: tournament.created_at,
    updatedAt: tournament.updated_at,
    role,
  }
}

function summarizeOrganizer(organizer: OrganizerRecord): OrganizerSummary {
  return {
    userId: organizer.user_id,
    username: organizer.username,
    role: organizer.role,
    addedAt: organizer.added_at,
  }
}

function toDetail(
  tournament: TournamentRecord,
  role: MembershipRole,
  organizers: OrganizerRecord[],
): TournamentDetail {
  return {
    ...summarize(tournament, role),
    settings: parseTournamentSettings(tournament.settings),
    publishedAt: tournament.published_at,
    startedAt: tournament.started_at,
    concludedAt: tournament.concluded_at,
    organizers: organizers.map(summarizeOrganizer),
  }
}

async function listTournamentsHandler(env: Env, auth: AuthContext): Promise<Response> {
  const tournaments = await listMemberTournaments(env, auth.user.id)
  return json({
    tournaments: tournaments.map((tournament: TournamentWithRole) =>
      summarize(tournament, tournament.role),
    ),
  })
}

async function createTournamentHandler(
  request: Request,
  env: Env,
  auth: AuthContext,
  now: number,
): Promise<Response> {
  const input = parseCreateInput(await readJson(request))
  if (!input) return apiError(400, 'invalid_request')

  const id = uuidv7(now)
  const timestamp = new Date(now).toISOString()
  const slug = await uniqueSlug(env, input.name!)

  await insertTournament(env, {
    id,
    slug,
    name: input.name!,
    description: input.description ?? '',
    coverUrl: input.coverUrl ?? null,
    settings: JSON.stringify({
      ...DEFAULT_TOURNAMENT_SETTINGS,
      ...input.settings,
    }),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await insertOrganizer(env, {
    tournamentId: id,
    userId: auth.user.id,
    role: 'owner',
    addedBy: auth.user.id,
    addedAt: timestamp,
  })

  const tournament = await findTournamentById(env, id)
  if (!tournament) return apiError(500, 'internal_error')

  const organizers = await listOrganizers(env, id)
  return json({ tournament: toDetail(tournament, 'owner', organizers) }, { status: 201 })
}

async function getTournamentHandler(
  env: Env,
  auth: AuthContext,
  tournamentId: string,
): Promise<Response> {
  const tournament = await findTournamentById(env, tournamentId)
  if (!tournament) return apiError(404, 'not_found')

  const role = await findTournamentRole(env, tournamentId, auth.user.id)
  if (!role) return apiError(403, 'forbidden')

  const organizers = await listOrganizers(env, tournamentId)
  return json({ tournament: toDetail(tournament, role, organizers) })
}

async function patchTournamentHandler(
  request: Request,
  env: Env,
  auth: AuthContext,
  tournamentId: string,
  now: number,
): Promise<Response> {
  const tournament = await findTournamentById(env, tournamentId)
  if (!tournament) return apiError(404, 'not_found')

  const role = await findOrganizerRole(env, tournamentId, auth.user.id)
  if (!role) return apiError(403, 'forbidden')

  const input = parsePatchInput(await readJson(request))
  if (!input) return apiError(400, 'invalid_request')

  if (input.settings !== undefined) {
    const current = parseTournamentSettings(tournament.settings)
    const settingsChanged =
      (input.settings.autoAdvance !== undefined &&
        input.settings.autoAdvance !== current.autoAdvance) ||
      (input.settings.selfVoteAllowed !== undefined &&
        input.settings.selfVoteAllowed !== current.selfVoteAllowed)
    if (settingsChanged && (await countStartedPhases(env, tournamentId)) > 0) {
      return apiError(409, 'tournament_settings_locked')
    }
  }

  const changes: Parameters<typeof updateTournamentDetails>[2] = {
    name: input.name,
    description: input.description,
    coverUrl: input.coverUrl,
  }
  if (input.settings !== undefined) {
    changes.settings = JSON.stringify({
      ...parseTournamentSettings(tournament.settings),
      ...input.settings,
    })
  }

  await updateTournamentDetails(env, tournamentId, changes, new Date(now).toISOString())

  const updated = await findTournamentById(env, tournamentId)
  if (!updated) return apiError(500, 'internal_error')

  const organizers = await listOrganizers(env, tournamentId)
  return json({ tournament: toDetail(updated, role, organizers) })
}

async function loadPlanValidation(
  env: Env,
  tournament: TournamentRecord,
  now: number,
): Promise<ReturnType<typeof validatePlan>> {
  const tournamentId = tournament.id
  const [elements, fields, phases, activeParticipants] = await Promise.all([
    listElements(env, tournamentId),
    listCustomFields(env, tournamentId),
    listPhases(env, tournamentId),
    countActiveParticipants(env, tournamentId),
  ])

  const input: PlanInput = {
    tournament: {
      name: tournament.name,
      slug: tournament.slug,
      settings: parseTournamentSettings(tournament.settings),
    },
    elements: elements.map((element) => ({
      id: element.id,
      name: element.name,
      imageUrl: element.image_url,
      customValues: parseJson<Record<string, unknown>>(element.custom_values, {}),
      position: element.position,
    })),
    fields: fields.map((field): CustomFieldDefinition => ({ key: field.key, type: field.type })),
    phases: phases.map((phase) => ({
      position: phase.position,
      name: phase.name,
      formula: phase.formula,
      voteType: phase.vote_type,
      config: parseJson<PhaseConfig>(phase.config, defaultPhaseConfig()),
      advance: parseJson<PhaseAdvance>(phase.advance, { type: 'all' }),
    })),
    activeParticipants,
    now: new Date(now),
  }

  return validatePlan(input)
}

async function previewHandler(
  env: Env,
  auth: AuthContext,
  tournamentId: string,
  now: number,
): Promise<Response> {
  const tournament = await findTournamentById(env, tournamentId)
  if (!tournament) return apiError(404, 'not_found')

  const role = await findOrganizerRole(env, tournamentId, auth.user.id)
  if (!role) return apiError(403, 'forbidden')

  const validation = await loadPlanValidation(env, tournament, now)
  return json({
    valid: validation.valid,
    errors: validation.errors,
    warnings: validation.warnings,
    preview: validation.preview,
  })
}

async function publishHandler(
  env: Env,
  auth: AuthContext,
  tournamentId: string,
  now: number,
): Promise<Response> {
  const tournament = await findTournamentById(env, tournamentId)
  if (!tournament) return apiError(404, 'not_found')

  const role = await findOrganizerRole(env, tournamentId, auth.user.id)
  if (!role) return apiError(403, 'forbidden')

  if (tournament.status !== 'draft') return apiError(409, 'tournament_not_editable')

  const validation = await loadPlanValidation(env, tournament, now)
  if (!validation.valid) {
    return json({ error: 'plan_invalid', errors: validation.errors }, { status: 422 })
  }

  if ((await countActiveTournaments(env)) >= ACTIVE_TOURNAMENT_LIMIT) {
    return apiError(409, 'tournament_limit_reached')
  }

  const publishedAt = new Date(now).toISOString()
  const result = await publishTournament(env, tournamentId, publishedAt)
  if (result.meta.changes === 0) return apiError(409, 'tournament_not_editable')

  const updated = await findTournamentById(env, tournamentId)
  if (!updated) return apiError(500, 'internal_error')

  const organizers = await listOrganizers(env, tournamentId)
  return json({ tournament: toDetail(updated, role, organizers) })
}

/**
 * Instrada le richieste sotto `/api/tournaments`. Restituisce `null` quando il
 * percorso o il metodo non appartengono all'area tornei.
 */
export async function handleTournamentsRoute(
  request: Request,
  env: Env,
  auth: AuthContext,
  now = Date.now(),
): Promise<Response | null> {
  const url = new URL(request.url)
  const { pathname } = url
  const method = request.method

  if (pathname === '/api/tournaments') {
    if (method === 'GET') return listTournamentsHandler(env, auth)
    if (method === 'POST') return createTournamentHandler(request, env, auth, now)
    return null
  }

  const previewMatch = pathname.match(/^\/api\/tournaments\/([^/]+)\/preview$/)
  if (previewMatch && method === 'GET') {
    return previewHandler(env, auth, decodeURIComponent(previewMatch[1]!), now)
  }

  const publishMatch = pathname.match(/^\/api\/tournaments\/([^/]+)\/publish$/)
  if (publishMatch && method === 'POST') {
    return publishHandler(env, auth, decodeURIComponent(publishMatch[1]!), now)
  }

  const detailMatch = pathname.match(/^\/api\/tournaments\/([^/]+)$/)
  if (detailMatch) {
    const tournamentId = decodeURIComponent(detailMatch[1]!)
    if (method === 'GET') return getTournamentHandler(env, auth, tournamentId)
    if (method === 'PATCH') return patchTournamentHandler(request, env, auth, tournamentId, now)
    return null
  }

  return null
}
