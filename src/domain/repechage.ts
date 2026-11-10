import type { RepechageCriterion } from './phases'

/** Escluso con le misure usate dai criteri di ripescaggio. */
export interface RepechageCandidate {
  elementId: string
  /** Punti ottenuti nel girone; assente se la fase non ha prodotto gironi. */
  groupPoints?: number
  /** Schede che gli hanno dato il valore massimo della scala. */
  firstPreferences?: number
  /** Pesi a favore meno pesi contro nei duelli. */
  weightDifference?: number
}

export interface ApplyRepechageOptions {
  /** Esclusi dalla fase precedente, nell'ordine di partenza. */
  excluded: readonly RepechageCandidate[]
  /** Qualificati diretti già ammessi alla fase successiva. */
  directQualified: number
  /** Dimensione che la fase successiva deve raggiungere. */
  targetSize: number
  /** Criteri applicati nell'ordine dato. */
  criteria: readonly RepechageCriterion[]
  /** La fase precedente ha prodotto duelli: abilita `weight_difference`. */
  hasDuels?: boolean
  /**
   * Sorgente casuale iniettabile per il criterio `draw`: interi uniformi in
   * [0, maxExclusive). Il default usa `crypto.getRandomValues`.
   */
  randomInt?: (maxExclusive: number) => number
}

export type RepechageFailure =
  | { ok: false; error: 'not_enough_excluded'; required: number; available: number }
  | { ok: false; error: 'criterion_unavailable'; criterion: RepechageCriterion }

export interface RepechageSelection {
  ok: true
  targetSize: number
  directQualified: number
  /** Posti da riempire con il ripescaggio. */
  slots: number
  /** Ripescati, nell'ordine di selezione. */
  selected: string[]
  /** Esclusi che restano fuori, nell'ordine del criterio. */
  excluded: string[]
  /** Tutti gli esclusi nell'ordine deterministico applicato. */
  order: string[]
  criteria: RepechageCriterion[]
  /** Ordine sorteggiato quando si usa `draw`, altrimenti `null`. */
  draw: string[] | null
}

export type ApplyRepechageResult = RepechageSelection | RepechageFailure

type MetricCriterion = Exclude<RepechageCriterion, 'draw'>

const METRIC_KEYS = {
  group_points: 'groupPoints',
  first_preferences: 'firstPreferences',
  weight_difference: 'weightDifference',
} as const satisfies Record<MetricCriterion, keyof RepechageCandidate>

function defaultRandomInt(maxExclusive: number): number {
  const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive
  const buffer = new Uint32Array(1)
  let value = 0
  do {
    globalThis.crypto.getRandomValues(buffer)
    value = buffer[0]!
  } while (value >= limit)
  return value % maxExclusive
}

function shuffle(ids: readonly string[], randomInt: (maxExclusive: number) => number): string[] {
  const result = [...ids]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1)
    const item = result[index]!
    result[index] = result[swap]!
    result[swap] = item
  }
  return result
}

function unavailable(
  criterion: RepechageCriterion,
  excluded: readonly RepechageCandidate[],
  hasDuels: boolean,
): boolean {
  if (criterion === 'draw') return false
  if (criterion === 'weight_difference' && !hasDuels) return true
  const key = METRIC_KEYS[criterion]
  return excluded.some((candidate) => typeof candidate[key] !== 'number')
}

/**
 * Ordina tutti gli esclusi applicando i criteri nell'ordine dato. Un criterio
 * che non separa il gruppo passa il gruppo intatto al criterio successivo; a
 * parità totale resta l'ordine di input.
 */
function orderExcluded(
  excluded: readonly RepechageCandidate[],
  criteria: readonly RepechageCriterion[],
  drawRank: Map<string, number> | null,
): RepechageCandidate[] {
  const apply = (
    group: readonly RepechageCandidate[],
    index: number,
  ): RepechageCandidate[][] => {
    if (group.length < 2 || index >= criteria.length) return [[...group]]

    const criterion = criteria[index]!
    const next = (parts: RepechageCandidate[][]): RepechageCandidate[][] =>
      parts.flatMap((part) => apply(part, index + 1))

    if (criterion === 'draw') {
      const sorted = [...group].sort(
        (left, right) => drawRank!.get(left.elementId)! - drawRank!.get(right.elementId)!,
      )
      return sorted.map((candidate) => [candidate])
    }

    const key = METRIC_KEYS[criterion]
    const buckets = new Map<number, RepechageCandidate[]>()
    for (const candidate of group) {
      const value = candidate[key]!
      const bucket = buckets.get(value)
      if (bucket) bucket.push(candidate)
      else buckets.set(value, [candidate])
    }

    if (buckets.size < 2) return apply(group, index + 1)

    return next(
      [...buckets.entries()]
        .sort(([left], [right]) => right - left)
        .map(([, entries]) => entries),
    )
  }

  return apply(excluded, 0).flat()
}

/**
 * Seleziona i ripescati tra gli esclusi della fase precedente.
 *
 * - Applica i criteri configurati nell'ordine dato.
 * - Seleziona fino a `targetSize` al netto dei qualificati diretti.
 * - `draw` usa il generatore iniettato (crittografico di default) e restituisce
 *   l'ordine sorteggiato, così il risultato è tracciabile.
 * - `weight_difference` è disponibile solo con `hasDuels`.
 * - Esclusi insufficienti o criteri non applicabili producono un errore.
 */
export function applyRepechage(options: ApplyRepechageOptions): ApplyRepechageResult {
  const { excluded, directQualified, targetSize, criteria, hasDuels = false } = options
  const configured = [...criteria]

  for (const criterion of configured) {
    if (unavailable(criterion, excluded, hasDuels)) {
      return { ok: false, error: 'criterion_unavailable', criterion }
    }
  }

  const slots = Math.max(0, targetSize - directQualified)
  if (slots === 0) {
    return {
      ok: true,
      targetSize,
      directQualified,
      slots,
      selected: [],
      excluded: excluded.map((candidate) => candidate.elementId),
      order: excluded.map((candidate) => candidate.elementId),
      criteria: configured,
      draw: null,
    }
  }

  if (excluded.length < slots) {
    return {
      ok: false,
      error: 'not_enough_excluded',
      required: slots,
      available: excluded.length,
    }
  }

  let draw: string[] | null = null
  let drawRank: Map<string, number> | null = null
  if (configured.includes('draw')) {
    const randomInt = options.randomInt ?? defaultRandomInt
    draw = shuffle(
      excluded.map((candidate) => candidate.elementId),
      randomInt,
    )
    drawRank = new Map(draw.map((elementId, position) => [elementId, position]))
  }

  const order = orderExcluded(excluded, configured, drawRank).map(
    (candidate) => candidate.elementId,
  )

  return {
    ok: true,
    targetSize,
    directQualified,
    slots,
    selected: order.slice(0, slots),
    excluded: order.slice(slots),
    order,
    criteria: configured,
    draw,
  }
}
