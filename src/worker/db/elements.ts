import type { CustomFieldType } from '../../domain/custom-values'

export interface CustomFieldRecord {
  id: string
  tournament_id: string
  key: string
  label: string
  type: CustomFieldType
  position: number
}

export interface ElementRecord {
  id: string
  tournament_id: string
  user_id: string | null
  name: string
  description: string
  image_url: string
  video_url: string | null
  custom_values: string
  position: number
  created_at: string
  updated_at: string
}

const FIELD_COLUMNS = 'id, tournament_id, key, label, type, position'
const ELEMENT_COLUMNS = `id, tournament_id, user_id, name, description, image_url, video_url,
  custom_values, position, created_at, updated_at`

export function listCustomFields(env: Env, tournamentId: string): Promise<CustomFieldRecord[]> {
  return env.DB.prepare(
    `SELECT ${FIELD_COLUMNS} FROM custom_fields WHERE tournament_id = ? ORDER BY position, id`,
  )
    .bind(tournamentId)
    .all<CustomFieldRecord>()
    .then((result) => result.results)
}

export function findCustomFieldById(env: Env, id: string): Promise<CustomFieldRecord | null> {
  return env.DB.prepare(`SELECT ${FIELD_COLUMNS} FROM custom_fields WHERE id = ?`)
    .bind(id)
    .first<CustomFieldRecord>()
}

export function countCustomFields(env: Env, tournamentId: string): Promise<number> {
  return env.DB.prepare('SELECT COUNT(*) AS count FROM custom_fields WHERE tournament_id = ?')
    .bind(tournamentId)
    .first<{ count: number }>()
    .then((row) => row?.count ?? 0)
}

export interface NewCustomField {
  id: string
  tournamentId: string
  key: string
  label: string
  type: CustomFieldType
}

export function insertCustomField(env: Env, field: NewCustomField): Promise<unknown> {
  return env.DB.prepare(
    `INSERT INTO custom_fields (id, tournament_id, key, label, type, position)
     VALUES (?, ?, ?, ?, ?, (
       SELECT COALESCE(MAX(position), 0) + 1 FROM custom_fields WHERE tournament_id = ?
     ))`,
  )
    .bind(field.id, field.tournamentId, field.key, field.label, field.type, field.tournamentId)
    .run()
}

export function updateCustomFieldLabel(env: Env, id: string, label: string): Promise<unknown> {
  return env.DB.prepare('UPDATE custom_fields SET label = ? WHERE id = ?').bind(label, id).run()
}

/** Cancella il campo e rimuove la sua chiave dai valori degli elementi del torneo. */
export async function deleteCustomField(
  env: Env,
  field: CustomFieldRecord,
  updatedAt: string,
): Promise<void> {
  const elements = await listElements(env, field.tournament_id)
  const statements = elements.flatMap((element) => {
    const values = parseCustomValues(element.custom_values)
    if (!(field.key in values)) return []
    delete values[field.key]
    return [
      env.DB.prepare('UPDATE elements SET custom_values = ?, updated_at = ? WHERE id = ?').bind(
        JSON.stringify(values),
        updatedAt,
        element.id,
      ),
    ]
  })
  statements.push(env.DB.prepare('DELETE FROM custom_fields WHERE id = ?').bind(field.id))
  statements.push(
    env.DB.prepare('UPDATE tournaments SET updated_at = ? WHERE id = ?').bind(
      updatedAt,
      field.tournament_id,
    ),
  )
  await env.DB.batch(statements)
}

export function listElements(env: Env, tournamentId: string): Promise<ElementRecord[]> {
  return env.DB.prepare(
    `SELECT ${ELEMENT_COLUMNS} FROM elements WHERE tournament_id = ? ORDER BY position, id`,
  )
    .bind(tournamentId)
    .all<ElementRecord>()
    .then((result) => result.results)
}

/**
 * Elementi che hanno preso parte a una fase gia' aperta (aperta, in attesa di
 * risoluzione, chiusa o annullata dopo l'apertura). Sono gli elementi che non
 * si possono eliminare: i loro riferimenti restano nelle tabelle della fase.
 */
export function listUsedElementIds(env: Env, tournamentId: string): Promise<Set<string>> {
  return env.DB.prepare(
    `SELECT DISTINCT element_id FROM (
       SELECT pe.element_id AS element_id
       FROM phase_entrants pe
       JOIN phases p ON p.id = pe.phase_id
       WHERE p.tournament_id = ? AND p.opened_at IS NOT NULL
       UNION
       SELECT gm.element_id
       FROM group_members gm
       JOIN groups g ON g.id = gm.group_id
       JOIN phases p ON p.id = g.phase_id
       WHERE p.tournament_id = ? AND p.opened_at IS NOT NULL
       UNION
       SELECT m.element_a_id
       FROM matches m
       JOIN phases p ON p.id = m.phase_id
       WHERE p.tournament_id = ? AND m.element_a_id IS NOT NULL AND p.opened_at IS NOT NULL
       UNION
       SELECT m.element_b_id
       FROM matches m
       JOIN phases p ON p.id = m.phase_id
       WHERE p.tournament_id = ? AND m.element_b_id IS NOT NULL AND p.opened_at IS NOT NULL
     )`,
  )
    .bind(tournamentId, tournamentId, tournamentId, tournamentId)
    .all<{ element_id: string }>()
    .then((result) => new Set(result.results.map((row) => row.element_id)))
}

export async function isElementUsed(env: Env, element: ElementRecord): Promise<boolean> {
  return (await listUsedElementIds(env, element.tournament_id)).has(element.id)
}

export function findElementById(env: Env, id: string): Promise<ElementRecord | null> {
  return env.DB.prepare(`SELECT ${ELEMENT_COLUMNS} FROM elements WHERE id = ?`)
    .bind(id)
    .first<ElementRecord>()
}

export interface NewElement {
  id: string
  tournamentId: string
  userId: string | null
  name: string
  description: string
  imageUrl: string
  videoUrl: string | null
  customValues: string
  createdAt: string
}

export function insertElement(env: Env, element: NewElement): Promise<unknown> {
  return env.DB.prepare(
    `INSERT INTO elements (id, tournament_id, user_id, name, description, image_url, video_url,
       custom_values, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, (
       SELECT COALESCE(MAX(position), 0) + 1 FROM elements WHERE tournament_id = ?
     ), ?, ?)`,
  )
    .bind(
      element.id,
      element.tournamentId,
      element.userId,
      element.name,
      element.description,
      element.imageUrl,
      element.videoUrl,
      element.customValues,
      element.tournamentId,
      element.createdAt,
      element.createdAt,
    )
    .run()
}

export interface ElementChanges {
  userId?: string | null
  name?: string
  description?: string
  imageUrl?: string
  videoUrl?: string | null
  customValues?: string
}

export function updateElement(
  env: Env,
  id: string,
  changes: ElementChanges,
  updatedAt: string,
): Promise<unknown> {
  const assignments = ['updated_at = ?']
  const values: (string | null)[] = [updatedAt]

  if (changes.userId !== undefined) {
    assignments.push('user_id = ?')
    values.push(changes.userId)
  }
  if (changes.name !== undefined) {
    assignments.push('name = ?')
    values.push(changes.name)
  }
  if (changes.description !== undefined) {
    assignments.push('description = ?')
    values.push(changes.description)
  }
  if (changes.imageUrl !== undefined) {
    assignments.push('image_url = ?')
    values.push(changes.imageUrl)
  }
  if (changes.videoUrl !== undefined) {
    assignments.push('video_url = ?')
    values.push(changes.videoUrl)
  }
  if (changes.customValues !== undefined) {
    assignments.push('custom_values = ?')
    values.push(changes.customValues)
  }

  return env.DB.prepare(`UPDATE elements SET ${assignments.join(', ')} WHERE id = ?`)
    .bind(...values, id)
    .run()
}

/** Cancella l'elemento e compatta le posizioni restanti. */
export async function deleteElement(
  env: Env,
  element: ElementRecord,
  updatedAt: string,
): Promise<void> {
  const remaining = (await listElements(env, element.tournament_id)).filter(
    (item) => item.id !== element.id,
  )
  const statements = [
    env.DB.prepare('DELETE FROM elements WHERE id = ?').bind(element.id),
    ...positionStatements(env, remaining, updatedAt),
    env.DB.prepare('UPDATE tournaments SET updated_at = ? WHERE id = ?').bind(
      updatedAt,
      element.tournament_id,
    ),
  ]
  await env.DB.batch(statements)
}

export async function reorderElements(
  env: Env,
  tournamentId: string,
  ids: string[],
  updatedAt: string,
): Promise<void> {
  const statements = ids.map((id, index) =>
    env.DB.prepare('UPDATE elements SET position = ? WHERE id = ?').bind(index + 1, id),
  )
  statements.push(
    env.DB.prepare('UPDATE tournaments SET updated_at = ? WHERE id = ?').bind(
      updatedAt,
      tournamentId,
    ),
  )
  await env.DB.batch(statements)
}

function positionStatements(env: Env, elements: ElementRecord[], updatedAt: string) {
  return elements.map((element, index) =>
    env.DB.prepare('UPDATE elements SET position = ?, updated_at = ? WHERE id = ?').bind(
      index + 1,
      updatedAt,
      element.id,
    ),
  )
}

export function userExists(env: Env, userId: string): Promise<boolean> {
  return env.DB.prepare('SELECT 1 AS found FROM users WHERE id = ? AND is_active = 1')
    .bind(userId)
    .first<{ found: number }>()
    .then((row) => row !== null)
}

export function parseCustomValues(raw: string): Record<string, string | number> {
  try {
    const parsed = JSON.parse(raw) as unknown
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, string | number>)
      : {}
  } catch {
    return {}
  }
}
