import type { EliminationSeeding } from './phases'
import { cryptoRandomInt, shuffle } from './random'

/** Elemento minimo che può entrare nel tabellone. */
export interface BracketElement {
  id: string
}

/** Sfida del turno: `bye` quando uno dei due lati è vuoto. */
export interface BracketMatch<T extends BracketElement> {
  a: T | null
  b: T | null
  bye: boolean
}

export interface BuildBracketOptions {
  seeding: EliminationSeeding
  /**
   * Ordine dei seed per il seeding `manual`: id dalla testa di serie 1 in giù.
   * Deve coprire tutti gli elementi una sola volta.
   */
  manual?: readonly string[]
  /**
   * Sorgente casuale iniettabile per i test: interi uniformi in [0, maxExclusive).
   * Il default usa `crypto.getRandomValues` con rejection sampling.
   */
  randomInt?: (maxExclusive: number) => number
}

export type BuildBracketError =
  | 'manual_incomplete'
  | 'manual_unknown_element'

export type BuildBracketResult<T extends BracketElement> =
  | {
      ok: true
      /** Elementi nell'ordine di seed effettivo, seed 1 per primo. */
      seeds: T[]
      bracketSize: number
      matches: BracketMatch<T>[]
      byes: T[]
      byeCount: number
      /** Ordine dei seed come id: traccia il sorteggio del seeding `random`. */
      draw: string[]
    }
  | { ok: false; error: BuildBracketError }

/** Potenza di 2 strettamente superiore o uguale a `count`, con minimo 2. */
export function bracketSizeFor(count: number): number {
  let power = 2
  while (power < count) power *= 2
  return power
}

function manualSeeds<T extends BracketElement>(
  elements: T[],
  manual: readonly string[] | undefined,
): { ok: true; seeds: T[] } | { ok: false; error: BuildBracketError } {
  if (!manual) return { ok: false, error: 'manual_incomplete' }

  const byId = new Map(elements.map((element) => [element.id, element]))
  const seen = new Set<string>()
  const seeds: T[] = []
  for (const id of manual) {
    const element = byId.get(id)
    if (!element) return { ok: false, error: 'manual_unknown_element' }
    if (seen.has(id)) return { ok: false, error: 'manual_incomplete' }
    seen.add(id)
    seeds.push(element)
  }
  if (seeds.length !== elements.length) return { ok: false, error: 'manual_incomplete' }
  return { ok: true, seeds }
}

/**
 * Genera il tabellone di un solo turno a eliminazione diretta.
 *
 * - `ranking`: l'input è già ordinato per seed.
 * - `random`: mescolamento crittografico (o generatore iniettato) e ordine tracciato in `draw`.
 * - `manual`: ordine dei seed fornito dall'organizzatore tramite `manual`.
 *
 * Il tabellone è portato alla potenza di 2 superiore e accoppiato `1 vs P`,
 * `2 vs P-1`, ecc. I seed oltre il numero di elementi sono bye assegnati ai seed migliori.
 */
export function buildBracket<T extends BracketElement>(
  elements: readonly T[],
  options: BuildBracketOptions,
): BuildBracketResult<T> {
  let seeds: T[]

  if (options.seeding === 'manual') {
    const manual = manualSeeds([...elements], options.manual)
    if (!manual.ok) return manual
    seeds = manual.seeds
  } else if (options.seeding === 'random') {
    seeds = shuffle(elements, options.randomInt ?? cryptoRandomInt)
  } else {
    seeds = [...elements]
  }

  const bracketSize = bracketSizeFor(seeds.length)
  const matchCount = bracketSize / 2
  const matches: BracketMatch<T>[] = []

  for (let index = 0; index < matchCount; index += 1) {
    const a = seeds[index] ?? null
    const b = seeds[bracketSize - 1 - index] ?? null
    matches.push({ a, b, bye: a === null || b === null })
  }

  const byeCount = bracketSize - seeds.length
  const byes = seeds.slice(0, byeCount)

  return {
    ok: true,
    seeds,
    bracketSize,
    matches,
    byes,
    byeCount,
    draw: seeds.map((element) => element.id),
  }
}
