import type { AuthContext } from '../auth/session'
import { validateCustomValues, type CustomFieldType } from '../../domain/custom-values'
import { initialSeeding } from '../../domain/seeding'
import { parseYouTubeVideoId } from '../../domain/youtube'
import { uuidv7 } from '../db/ids'
import { writeAudit } from '../db/audit'
import {
  countCustomFields,
  deleteCustomField,
  deleteElement,
  findCustomFieldById,
  findElementById,
  insertCustomField,
  insertElement,
  isElementUsed,
  listCustomFields,
  listElements,
  listUsedElementIds,
  parseCustomValues,
  reorderElements,
  updateCustomFieldLabel,
  updateElement,
  userExists,
  type CustomFieldRecord,
  type ElementRecord,
} from '../db/elements'
import { countOpenedPhases } from '../db/phases'
import { findOrganizerRole, findTournamentById } from '../db/tournaments'
import { apiError, json } from '../http/json'

export const CUSTOM_FIELD_LIMIT = 10

const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{0,31}$/
const FIELD_TYPES: CustomFieldType[] = ['text', 'number', 'url', 'date']
const LABEL_MAX_LENGTH = 80
const NAME_MAX_LENGTH = 120
const DESCRIPTION_MAX_LENGTH = 2000
const URL_MAX_LENGTH = 2048

interface FieldBody {
  id: string
  key: string
  label: string
  type: CustomFieldType
  position: number
}

interface ElementBody {
  id: string
  userId: string | null
  name: string
  description: string
  imageUrl: string
  videoUrl: string | null
  customValues: Record<string, string | number>
  position: number
  locked: boolean
  createdAt: string
  updatedAt: string
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function serialiseField(field: CustomFieldRecord): FieldBody {
  return {
    id: field.id,
    key: field.key,
    label: field.label,
    type: field.type,
    position: field.position,
  }
}

function serialiseElement(element: ElementRecord, locked = false): ElementBody {
  return {
    id: element.id,
    userId: element.user_id,
    name: element.name,
    description: element.description,
    imageUrl: element.image_url,
    videoUrl: element.video_url,
    customValues: parseCustomValues(element.custom_values),
    position: element.position,
    locked,
    createdAt: element.created_at,
    updatedAt: element.updated_at,
  }
}

/** 404 se il torneo non esiste, 403 se l'utente non lo organizza. */
async function authorizeTournament(
  env: Env,
  auth: AuthContext,
  tournamentId: string,
): Promise<Response | null> {
  if (!(await findTournamentById(env, tournamentId))) return apiError(404, 'not_found')
  if (!(await findOrganizerRole(env, tournamentId, auth.user.id))) {
    return apiError(403, 'forbidden')
  }
  return null
}

function readKey(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const key = value.trim().toLowerCase()
  return FIELD_KEY_PATTERN.test(key) ? key : null
}

function readLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const label = value.trim()
  return label && label.length <= LABEL_MAX_LENGTH ? label : null
}

function readFieldType(value: unknown): CustomFieldType | null {
  return FIELD_TYPES.includes(value as CustomFieldType) ? (value as CustomFieldType) : null
}

function readName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim()
  return name && name.length <= NAME_MAX_LENGTH ? name : null
}

function readDescription(value: unknown): string | null {
  return typeof value === 'string' && value.length <= DESCRIPTION_MAX_LENGTH ? value : null
}

function readHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const url = value.trim()
  if (!url || url.length > URL_MAX_LENGTH) return null
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/** `null` per assenza, `undefined` per video non valido. */
function readVideoUrl(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') return undefined
  const url = value.trim()
  if (!url) return null
  return parseYouTubeVideoId(url) ? url : undefined
}

async function listFieldsHandler(
  env: Env,
  auth: AuthContext,
  tournamentId: string,
): Promise<Response> {
  const denied = await authorizeTournament(env, auth, tournamentId)
  if (denied) return denied

  const fields = await listCustomFields(env, tournamentId)
  return json({ fields: fields.map(serialiseField) })
}

async function createFieldHandler(
  request: Request,
  env: Env,
  auth: AuthContext,
  tournamentId: string,
  now: number,
): Promise<Response> {
  const denied = await authorizeTournament(env, auth, tournamentId)
  if (denied) return denied

  const body = await readJson(request)
  if (typeof body !== 'object' || body === null) return apiError(400, 'invalid_request')
  const input = body as Record<string, unknown>

  const key = readKey(input.key)
  const label = readLabel(input.label)
  const type = readFieldType(input.type)
  if (!key || !label || !type) return apiError(400, 'invalid_request')

  if ((await countCustomFields(env, tournamentId)) >= CUSTOM_FIELD_LIMIT) {
    return apiError(409, 'field_limit_reached')
  }
  const fields = await listCustomFields(env, tournamentId)
  if (fields.some((field) => field.key === key)) {
    return apiError(409, 'duplicate_field_key')
  }

  const id = uuidv7(now)
  await insertCustomField(env, { id, tournamentId, key, label, type })

  const field = await findCustomFieldById(env, id)
  if (!field) return apiError(500, 'internal_error')

  await writeAudit(env, now, {
    tournamentId,
    actorId: auth.user.id,
    action: 'field.create',
    targetType: 'custom_field',
    targetId: id,
    after: serialiseField(field),
  })

  return json({ field: serialiseField(field) }, { status: 201 })
}

async function patchFieldHandler(
  request: Request,
  env: Env,
  auth: AuthContext,
  fieldId: string,
  now: number,
): Promise<Response> {
  const field = await findCustomFieldById(env, fieldId)
  if (!field) return apiError(404, 'not_found')

  const denied = await authorizeTournament(env, auth, field.tournament_id)
  if (denied) return denied

  const body = await readJson(request)
  if (typeof body !== 'object' || body === null) return apiError(400, 'invalid_request')
  const input = body as Record<string, unknown>

  // Chiave e tipo restano immutabili: cambiarli invaliderebbe i valori già salvati.
  if (input.key !== undefined || input.type !== undefined) return apiError(400, 'invalid_request')
  const label = readLabel(input.label)
  if (!label) return apiError(400, 'invalid_request')

  await updateCustomFieldLabel(env, field.id, label)
  const updated = await findCustomFieldById(env, field.id)
  await writeAudit(env, now, {
    tournamentId: field.tournament_id,
    actorId: auth.user.id,
    action: 'field.update',
    targetType: 'custom_field',
    targetId: field.id,
    before: { label: field.label },
    after: { label: updated?.label ?? label },
  })
  return json({ field: serialiseField(updated ?? field) })
}

async function deleteFieldHandler(
  env: Env,
  auth: AuthContext,
  fieldId: string,
  now: number,
): Promise<Response> {
  const field = await findCustomFieldById(env, fieldId)
  if (!field) return apiError(404, 'not_found')

  const denied = await authorizeTournament(env, auth, field.tournament_id)
  if (denied) return denied

  await deleteCustomField(env, field, new Date(now).toISOString())
  await writeAudit(env, now, {
    tournamentId: field.tournament_id,
    actorId: auth.user.id,
    action: 'field.delete',
    targetType: 'custom_field',
    targetId: field.id,
    before: serialiseField(field),
  })
  return new Response(null, { status: 204 })
}

async function listElementsHandler(
  env: Env,
  auth: AuthContext,
  tournamentId: string,
): Promise<Response> {
  // I partecipanti arriveranno con TICKET-0006: finché non esistono, solo gli
  // organizzatori sono membri del torneo.
  const denied = await authorizeTournament(env, auth, tournamentId)
  if (denied) return denied

  const [stored, used] = await Promise.all([
    listElements(env, tournamentId),
    listUsedElementIds(env, tournamentId),
  ])
  const elements = initialSeeding(stored)
  return json({ elements: elements.map((element) => serialiseElement(element, used.has(element.id))) })
}

async function createElementHandler(
  request: Request,
  env: Env,
  auth: AuthContext,
  tournamentId: string,
  now: number,
): Promise<Response> {
  const denied = await authorizeTournament(env, auth, tournamentId)
  if (denied) return denied

  // A2: dopo l'apertura della prima fase l'insieme degli elementi e' congelato.
  if ((await countOpenedPhases(env, tournamentId)) > 0) {
    return apiError(409, 'element_locked')
  }

  const body = await readJson(request)
  if (typeof body !== 'object' || body === null) return apiError(400, 'invalid_request')
  const input = body as Record<string, unknown>

  const name = readName(input.name)
  if (!name) return apiError(400, 'invalid_request')

  const imageUrl = readHttpUrl(input.imageUrl)
  if (!imageUrl) return apiError(400, 'invalid_request')

  const description = input.description === undefined ? '' : readDescription(input.description)
  if (description === null) return apiError(400, 'invalid_request')

  const videoUrl = readVideoUrl(input.videoUrl)
  if (videoUrl === undefined) return apiError(400, 'invalid_request')

  const fields = await listCustomFields(env, tournamentId)
  const values = validateCustomValues(fields, input.customValues ?? {})
  if (!values.ok) {
    return apiError(values.error === 'unknown_field' ? 400 : 422, values.error)
  }

  const userId = input.userId === undefined || input.userId === null ? null : input.userId
  if (userId !== null) {
    if (typeof userId !== 'string' || !(await userExists(env, userId))) {
      return apiError(400, 'invalid_request')
    }
  }

  const id = uuidv7(now)
  await insertElement(env, {
    id,
    tournamentId,
    userId,
    name,
    description,
    imageUrl,
    videoUrl,
    customValues: JSON.stringify(values.values),
    createdAt: new Date(now).toISOString(),
  })

  const element = await findElementById(env, id)
  if (!element) return apiError(500, 'internal_error')

  await writeAudit(env, now, {
    tournamentId,
    actorId: auth.user.id,
    action: 'element.create',
    targetType: 'element',
    targetId: id,
    after: serialiseElement(element),
  })

  return json({ element: serialiseElement(element) }, { status: 201 })
}

async function patchElementHandler(
  request: Request,
  env: Env,
  auth: AuthContext,
  elementId: string,
  now: number,
): Promise<Response> {
  const element = await findElementById(env, elementId)
  if (!element) return apiError(404, 'not_found')

  const denied = await authorizeTournament(env, auth, element.tournament_id)
  if (denied) return denied

  const body = await readJson(request)
  if (typeof body !== 'object' || body === null) return apiError(400, 'invalid_request')
  const input = body as Record<string, unknown>

  const changes: Parameters<typeof updateElement>[2] = {}

  if (input.name !== undefined) {
    const name = readName(input.name)
    if (!name) return apiError(400, 'invalid_request')
    changes.name = name
  }
  if (input.description !== undefined) {
    const description = readDescription(input.description)
    if (description === null) return apiError(400, 'invalid_request')
    changes.description = description
  }
  if (input.imageUrl !== undefined) {
    const imageUrl = readHttpUrl(input.imageUrl)
    if (!imageUrl) return apiError(400, 'invalid_request')
    changes.imageUrl = imageUrl
  }
  if (input.videoUrl !== undefined) {
    const videoUrl = readVideoUrl(input.videoUrl)
    if (videoUrl === undefined) return apiError(400, 'invalid_request')
    changes.videoUrl = videoUrl
  }
  if (input.customValues !== undefined) {
    const fields = await listCustomFields(env, element.tournament_id)
    const values = validateCustomValues(fields, input.customValues)
    if (!values.ok) {
      return apiError(values.error === 'unknown_field' ? 400 : 422, values.error)
    }
    changes.customValues = JSON.stringify(values.values)
  }
  if (input.userId !== undefined) {
    if (input.userId === null) {
      changes.userId = null
    } else if (typeof input.userId === 'string' && (await userExists(env, input.userId))) {
      changes.userId = input.userId
    } else {
      return apiError(400, 'invalid_request')
    }
  }

  if (Object.keys(changes).length === 0) return apiError(400, 'invalid_request')

  await updateElement(env, element.id, changes, new Date(now).toISOString())
  const updated = await findElementById(env, element.id)
  const locked = await isElementUsed(env, element)
  await writeAudit(env, now, {
    tournamentId: element.tournament_id,
    actorId: auth.user.id,
    action: 'element.update',
    targetType: 'element',
    targetId: element.id,
    before: serialiseElement(element, locked),
    after: serialiseElement(updated ?? element, locked),
  })
  return json({ element: serialiseElement(updated ?? element, locked) })
}

async function deleteElementHandler(
  env: Env,
  auth: AuthContext,
  elementId: string,
  now: number,
): Promise<Response> {
  const element = await findElementById(env, elementId)
  if (!element) return apiError(404, 'not_found')

  const denied = await authorizeTournament(env, auth, element.tournament_id)
  if (denied) return denied

  // A2: un elemento usato in una fase avviata non si elimina; i referenti nelle
  // tabelle della fase restano validi e i metadati sono comunque modificabili.
  if (await isElementUsed(env, element)) return apiError(409, 'element_in_use')

  await deleteElement(env, element, new Date(now).toISOString())
  await writeAudit(env, now, {
    tournamentId: element.tournament_id,
    actorId: auth.user.id,
    action: 'element.delete',
    targetType: 'element',
    targetId: element.id,
    before: serialiseElement(element),
  })
  return new Response(null, { status: 204 })
}

async function reorderElementsHandler(
  request: Request,
  env: Env,
  auth: AuthContext,
  tournamentId: string,
  now: number,
): Promise<Response> {
  const denied = await authorizeTournament(env, auth, tournamentId)
  if (denied) return denied

  const body = await readJson(request)
  if (typeof body !== 'object' || body === null) return apiError(400, 'invalid_request')
  const ids = (body as { ids?: unknown }).ids
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
    return apiError(400, 'invalid_request')
  }

  const elements = await listElements(env, tournamentId)
  const currentIds = new Set(elements.map((element) => element.id))
  const nextIds = ids as string[]
  const uniqueIds = new Set(nextIds)
  if (
    uniqueIds.size !== nextIds.length ||
    nextIds.length !== currentIds.size ||
    nextIds.some((id) => !currentIds.has(id))
  ) {
    return apiError(400, 'invalid_request')
  }

  await reorderElements(env, tournamentId, nextIds, new Date(now).toISOString())

  await writeAudit(env, now, {
    tournamentId,
    actorId: auth.user.id,
    action: 'element.reorder',
    targetType: 'tournament',
    targetId: tournamentId,
    before: { ids: elements.map((element) => element.id) },
    after: { ids: nextIds },
  })

  const [stored, used] = await Promise.all([
    listElements(env, tournamentId),
    listUsedElementIds(env, tournamentId),
  ])
  const reordered = initialSeeding(stored)
  return json({
    elements: reordered.map((element) => serialiseElement(element, used.has(element.id))),
  })
}

/**
 * Instrada le richieste su campi personalizzati ed elementi. Restituisce
 * `null` quando percorso e metodo non appartengono a quest'area.
 */
export async function handleElementsRoute(
  request: Request,
  env: Env,
  auth: AuthContext,
  now = Date.now(),
): Promise<Response | null> {
  const { pathname } = new URL(request.url)
  const method = request.method

  const fieldsMatch = pathname.match(/^\/api\/tournaments\/([^/]+)\/fields$/)
  if (fieldsMatch) {
    const tournamentId = decodeURIComponent(fieldsMatch[1]!)
    if (method === 'GET') return listFieldsHandler(env, auth, tournamentId)
    if (method === 'POST') return createFieldHandler(request, env, auth, tournamentId, now)
    return null
  }

  const orderMatch = pathname.match(/^\/api\/tournaments\/([^/]+)\/elements\/order$/)
  if (orderMatch && method === 'PUT') {
    return reorderElementsHandler(
      request,
      env,
      auth,
      decodeURIComponent(orderMatch[1]!),
      now,
    )
  }

  const elementsMatch = pathname.match(/^\/api\/tournaments\/([^/]+)\/elements$/)
  if (elementsMatch) {
    const tournamentId = decodeURIComponent(elementsMatch[1]!)
    if (method === 'GET') return listElementsHandler(env, auth, tournamentId)
    if (method === 'POST') return createElementHandler(request, env, auth, tournamentId, now)
    return null
  }

  const fieldMatch = pathname.match(/^\/api\/fields\/([^/]+)$/)
  if (fieldMatch) {
    const fieldId = decodeURIComponent(fieldMatch[1]!)
    if (method === 'PATCH') return patchFieldHandler(request, env, auth, fieldId, now)
    if (method === 'DELETE') return deleteFieldHandler(env, auth, fieldId, now)
    return null
  }

  const elementMatch = pathname.match(/^\/api\/elements\/([^/]+)$/)
  if (elementMatch) {
    const elementId = decodeURIComponent(elementMatch[1]!)
    if (method === 'PATCH') return patchElementHandler(request, env, auth, elementId, now)
    if (method === 'DELETE') return deleteElementHandler(env, auth, elementId, now)
    return null
  }

  return null
}
