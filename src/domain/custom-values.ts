export type CustomFieldType = 'text' | 'number' | 'url' | 'date'

export interface CustomFieldDefinition {
  key: string
  type: CustomFieldType
}

export type CustomValue = string | number
export type CustomValues = Record<string, CustomValue>

export type CustomValuesResult =
  | { ok: true; values: CustomValues }
  | { ok: false; error: 'invalid_values' | 'unknown_field' }

const URL_MAX_LENGTH = 2048
const TEXT_MAX_LENGTH = 1000
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Valida e normalizza i valori di un elemento contro i campi del torneo.
 * I campi assenti sono ammessi; chiavi sconosciute o valori del tipo errato
 * sono rifiutati. Funzione pura, senza accesso a D1 o HTTP.
 */
export function validateCustomValues(
  fields: CustomFieldDefinition[],
  input: unknown,
): CustomValuesResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: 'invalid_values' }
  }

  const definitions = new Map(fields.map((field) => [field.key, field.type]))
  const values: CustomValues = {}

  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    const type = definitions.get(key)
    if (!type) return { ok: false, error: 'unknown_field' }
    if (raw === undefined || raw === null) continue

    const value = normalizeValue(type, raw)
    if (value === null) return { ok: false, error: 'invalid_values' }
    values[key] = value
  }

  return { ok: true, values }
}

function normalizeValue(type: CustomFieldType, raw: unknown): CustomValue | null {
  if (type === 'number') {
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : null
  }
  if (typeof raw !== 'string') return null

  const value = raw.trim()
  if (type === 'text') return value.length <= TEXT_MAX_LENGTH ? value : null
  if (type === 'url') return isHttpUrl(value) ? value : null
  if (type === 'date') return isIsoDate(value) ? value : null
  return null
}

function isHttpUrl(value: string): boolean {
  if (!value || value.length > URL_MAX_LENGTH) return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isIsoDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
