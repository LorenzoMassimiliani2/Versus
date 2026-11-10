/** Criteri di spareggio ammessi, nell'ordine in cui vengono applicati. */
export type TieBreakCriterion =
  | 'points'
  | 'first_preferences'
  | 'ballots'
  | 'head_to_head'
  | 'weight_difference'
  | 'credits'
  | 'manual'

export const RANKING_TIEBREAKS: readonly TieBreakCriterion[] = [
  'points',
  'first_preferences',
  'ballots',
  'manual',
]

export const PICK_TIEBREAKS: readonly TieBreakCriterion[] = ['points', 'manual']

export const GROUP_TIEBREAKS: readonly TieBreakCriterion[] = [
  'points',
  'head_to_head',
  'weight_difference',
  'credits',
  'manual',
]

/** Valori confrontabili di un elemento; i criteri non applicabili restano assenti. */
export interface TieBreakEntry {
  elementId: string
  points: number
  firstPreferences?: number
  ballots?: number
  weightDifference?: number
  credits?: number
}

export interface TieBreakOptions {
  criteria: readonly TieBreakCriterion[]
  /** Ordine scelto dall'organizzatore per gli elementi ancora a pari merito. */
  manualOrder?: readonly string[]
  /** Esito degli scontri diretti: positivo se `a` precede `b`, negativo se segue. */
  headToHead?: (a: string, b: string) => number
}

export interface TieBreakRow extends TieBreakEntry {
  position: number
  tied: boolean
}

export interface TieBreakResult {
  rows: TieBreakRow[]
  /** Gruppi di elementi ancora a pari merito dopo i criteri automatici. */
  unresolved: string[][]
  requiresManualResolution: boolean
}

const METRIC_KEYS = {
  points: 'points',
  first_preferences: 'firstPreferences',
  ballots: 'ballots',
  weight_difference: 'weightDifference',
  credits: 'credits',
} as const satisfies Record<
  Exclude<TieBreakCriterion, 'head_to_head' | 'manual'>,
  keyof TieBreakEntry
>

function splitByMetric(
  group: readonly TieBreakEntry[],
  criterion: Exclude<TieBreakCriterion, 'head_to_head' | 'manual'>,
): TieBreakEntry[][] | null {
  const key = METRIC_KEYS[criterion]
  const values = group.map((entry) => entry[key])
  if (values.some((value) => value === undefined)) return null

  const buckets = new Map<number, TieBreakEntry[]>()
  group.forEach((entry, index) => {
    const value = values[index]!
    const bucket = buckets.get(value)
    if (bucket) bucket.push(entry)
    else buckets.set(value, [entry])
  })

  return [...buckets.entries()]
    .sort(([left], [right]) => right - left)
    .map(([, entries]) => entries)
}

function splitByHeadToHead(
  group: readonly TieBreakEntry[],
  headToHead: ((a: string, b: string) => number) | undefined,
): TieBreakEntry[][] | null {
  if (!headToHead || group.length < 2) return null

  const wins = new Map<string, number>()
  for (const entry of group) wins.set(entry.elementId, 0)
  for (let left = 0; left < group.length; left += 1) {
    for (let right = left + 1; right < group.length; right += 1) {
      const a = group[left]!.elementId
      const b = group[right]!.elementId
      const outcome = headToHead(a, b)
      if (outcome > 0) wins.set(a, wins.get(a)! + 1)
      else if (outcome < 0) wins.set(b, wins.get(b)! + 1)
    }
  }

  const buckets = new Map<number, TieBreakEntry[]>()
  for (const entry of group) {
    const value = wins.get(entry.elementId)!
    const bucket = buckets.get(value)
    if (bucket) bucket.push(entry)
    else buckets.set(value, [entry])
  }

  if (buckets.size < 2) return null
  return [...buckets.entries()]
    .sort(([left], [right]) => right - left)
    .map(([, entries]) => entries)
}

function splitByManual(
  group: readonly TieBreakEntry[],
  manualOrder: readonly string[] | undefined,
): TieBreakEntry[][] | null {
  if (!manualOrder) return null

  const index = new Map(manualOrder.map((elementId, position) => [elementId, position]))
  if (group.some((entry) => !index.has(entry.elementId))) return null

  return [...group]
    .sort((left, right) => index.get(left.elementId)! - index.get(right.elementId)!)
    .map((entry) => [entry])
}

/**
 * Ordina gli elementi applicando i criteri nell'ordine dato. Un criterio che non
 * separa il gruppo non cambia l'ordine. I gruppi ancora a pari merito restano uniti
 * e con la stessa posizione, così l'organizzatore può risolverli manualmente.
 */
export function resolveTie(
  entries: readonly TieBreakEntry[],
  options: TieBreakOptions,
): TieBreakResult {
  function apply(group: readonly TieBreakEntry[], index: number): TieBreakEntry[][] {
    if (group.length < 2 || index >= options.criteria.length) return [[...group]]

    const criterion = options.criteria[index]!
    const split =
      criterion === 'head_to_head'
        ? splitByHeadToHead(group, options.headToHead)
        : criterion === 'manual'
          ? splitByManual(group, options.manualOrder)
          : splitByMetric(group, criterion)

    if (!split) return apply(group, index + 1)
    return split.flatMap((part) => apply(part, index + 1))
  }

  const groups = apply(entries, 0)
  const rows: TieBreakRow[] = []
  const unresolved: string[][] = []
  let position = 1

  for (const group of groups) {
    const tied = group.length > 1
    if (tied) unresolved.push(group.map((entry) => entry.elementId))
    for (const entry of group) {
      rows.push({ ...entry, position, tied })
    }
    position += group.length
  }

  return { rows, unresolved, requiresManualResolution: unresolved.length > 0 }
}
