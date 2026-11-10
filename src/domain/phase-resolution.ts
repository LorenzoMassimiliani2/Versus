export interface ResolutionOrder {
  targetId: string
  ordering: string[]
}

export interface UnresolvedTarget {
  targetId: string
  elementIds: string[]
}

export interface ResolutionRequest {
  resolutions: ResolutionOrder[]
  note: string
}

export type ResolutionParseError = 'invalid_request' | 'note_required'

export type ResolutionParseResult =
  | { ok: true; request: ResolutionRequest }
  | { ok: false; error: ResolutionParseError }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readOrdering(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  if (value.some((entry) => typeof entry !== 'string' || entry.length === 0)) return null
  return new Set(value).size === value.length ? [...(value as string[])] : null
}

/**
 * Valida il corpo di `POST /api/phases/:id/resolve`. La nota e' obbligatoria:
 * senza una spiegazione la scelta manuale non e' tracciabile in `audit_log`.
 */
export function parseResolutionRequest(
  raw: unknown,
  maxNoteLength = 2000,
): ResolutionParseResult {
  if (!isRecord(raw)) return { ok: false, error: 'invalid_request' }

  const note = typeof raw.note === 'string' ? raw.note.trim() : ''
  if (note.length === 0) return { ok: false, error: 'note_required' }
  if (note.length > maxNoteLength) return { ok: false, error: 'invalid_request' }

  const rawResolutions = raw.resolutions
  if (!Array.isArray(rawResolutions) || rawResolutions.length === 0) {
    return { ok: false, error: 'invalid_request' }
  }

  const resolutions: ResolutionOrder[] = []
  const seen = new Set<string>()
  for (const entry of rawResolutions) {
    if (!isRecord(entry)) return { ok: false, error: 'invalid_request' }
    const targetId = entry.targetId
    if (typeof targetId !== 'string' || targetId.length === 0) {
      return { ok: false, error: 'invalid_request' }
    }
    const ordering = readOrdering(entry.ordering)
    if (!ordering) return { ok: false, error: 'invalid_request' }
    if (seen.has(targetId)) return { ok: false, error: 'invalid_request' }
    seen.add(targetId)
    resolutions.push({ targetId, ordering })
  }

  return { ok: true, request: { resolutions, note } }
}

function sameElements(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  const expected = new Set(right)
  if (expected.size !== right.length) return false
  return left.every((elementId) => expected.has(elementId))
}

/**
 * Un ordine e' valido quando copre esattamente gli elementi di ogni target
 * ambiguo, senza target in piu e senza doppioni. Tutti i target ambigui devono
 * essere risolti nella stessa richiesta.
 */
export function validateResolutions(
  unresolved: readonly UnresolvedTarget[],
  resolutions: readonly ResolutionOrder[],
): boolean {
  if (unresolved.length === 0) return false
  if (resolutions.length !== unresolved.length) return false

  const expectedByTarget = new Map(
    unresolved.map((target) => [target.targetId, target.elementIds]),
  )
  const seen = new Set<string>()
  for (const resolution of resolutions) {
    if (seen.has(resolution.targetId)) return false
    seen.add(resolution.targetId)
    const expected = expectedByTarget.get(resolution.targetId)
    if (!expected || !sameElements(resolution.ordering, expected)) return false
  }

  return true
}
