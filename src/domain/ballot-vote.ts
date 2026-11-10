import type { RankingVote } from './ranking'
import type { PickVote } from './pick'

export type BallotKind = 'ranking' | 'pick'

export type BallotVoteError = 'invalid_payload'

export interface BallotValidationOptions {
  /** Scala punti della fase. */
  scale: readonly number[]
  /** Elementi del target a cui si possono assegnare punti o scelte. */
  allowedElementIds: ReadonlySet<string>
}

export type RankingBallotValidation =
  | { ok: true; vote: RankingVote }
  | { ok: false; error: BallotVoteError }

export type PickBallotValidation =
  | { ok: true; vote: PickVote }
  | { ok: false; error: BallotVoteError }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Valida una scheda classifica. Una scheda parziale e' valida: si possono
 * usare meno valori della scala. Ogni valore della scala e' usabile una sola
 * volta per scheda, ogni elemento compare una sola volta e i punti vanno solo
 * a elementi del target.
 */
export function validateRankingBallot(
  raw: unknown,
  options: BallotValidationOptions,
): RankingBallotValidation {
  if (!isRecord(raw) || !Array.isArray(raw.assignments)) {
    return { ok: false, error: 'invalid_payload' }
  }

  const scale = new Set(options.scale)
  const usedPoints = new Set<number>()
  const usedElements = new Set<string>()
  const assignments: Array<{ elementId: string; points: number }> = []

  for (const entry of raw.assignments) {
    if (!isRecord(entry)) return { ok: false, error: 'invalid_payload' }
    const elementId = entry.elementId
    const points = entry.points
    if (typeof elementId !== 'string' || elementId.length === 0) {
      return { ok: false, error: 'invalid_payload' }
    }
    if (!options.allowedElementIds.has(elementId)) {
      return { ok: false, error: 'invalid_payload' }
    }
    if (typeof points !== 'number' || !Number.isInteger(points) || !scale.has(points)) {
      return { ok: false, error: 'invalid_payload' }
    }
    if (usedPoints.has(points) || usedElements.has(elementId)) {
      return { ok: false, error: 'invalid_payload' }
    }
    usedPoints.add(points)
    usedElements.add(elementId)
    assignments.push({ elementId, points })
  }

  return { ok: true, vote: { assignments } }
}

/** Valida una scheda pick: un solo elemento del target, vale un punto. */
export function validatePickBallot(
  raw: unknown,
  options: BallotValidationOptions,
): PickBallotValidation {
  if (!isRecord(raw)) return { ok: false, error: 'invalid_payload' }
  const keys = Object.keys(raw)
  if (keys.length !== 1 || keys[0] !== 'elementId') {
    return { ok: false, error: 'invalid_payload' }
  }
  const elementId = raw.elementId
  if (typeof elementId !== 'string' || elementId.length === 0) {
    return { ok: false, error: 'invalid_payload' }
  }
  if (!options.allowedElementIds.has(elementId)) {
    return { ok: false, error: 'invalid_payload' }
  }
  return { ok: true, vote: { elementId } }
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Legge il payload salvato di una scheda; `null` se non e' valido. */
export function parseBallotPayload(
  kind: BallotKind,
  raw: string,
): RankingVote | PickVote | null {
  const parsed = parseJson(raw)
  if (!isRecord(parsed)) return null

  if (kind === 'ranking') {
    if (!Array.isArray(parsed.assignments)) return null
    const assignments: Array<{ elementId: string; points: number }> = []
    for (const entry of parsed.assignments) {
      if (!isRecord(entry)) return null
      if (typeof entry.elementId !== 'string' || typeof entry.points !== 'number') return null
      assignments.push({ elementId: entry.elementId, points: entry.points })
    }
    return { assignments }
  }

  if (typeof parsed.elementId !== 'string') return null
  return { elementId: parsed.elementId }
}
