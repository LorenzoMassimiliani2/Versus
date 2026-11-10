import type { GroupAssignment, GroupRemainder } from './phases'
import { cryptoRandomInt, shuffle } from './random'

/** Elemento minimo che può entrare in un girone. */
export interface GroupElement {
  id: string
}

/** Girone composto: nome progressivo e membri nell'ordine di assegnazione. */
export interface Group<T extends GroupElement> {
  name: string
  members: T[]
}

/** Disposizione deterministica usata anche dall'anteprima del piano. */
export type GroupLayout = 'sequential' | 'snake'

export type BuildGroupsError =
  | 'size_invalid'
  | 'manual_incomplete'
  | 'manual_unknown_element'
  | 'manual_invalid_group'
  | 'manual_group_full'

export interface BuildGroupsOptions {
  /** Dimensione massima di un girone. */
  size: number
  assignment: GroupAssignment
  remainder: GroupRemainder
  /**
   * Assegnazione manuale: id elemento -> indice del girone (0-based).
   * In modalità `manual` tutti gli elementi devono comparire una volta.
   */
  manual?: Record<string, number>
  /**
   * Sorgente casuale iniettabile per i test: interi uniformi in [0, maxExclusive).
   * Il default usa `crypto.getRandomValues` con rejection sampling.
   */
  randomInt?: (maxExclusive: number) => number
}

export type BuildGroupsResult<T extends GroupElement> =
  | { ok: true; groups: Group<T>[]; byes: T[]; draw: string[] }
  | { ok: false; error: BuildGroupsError }

/** Nome progressivo del girone: Girone A, Girone B, ..., Girone Z, Girone A1. */
export function groupName(index: number): string {
  const letter = String.fromCharCode(65 + (index % 26))
  const cycle = Math.floor(index / 26)
  return `Girone ${cycle === 0 ? letter : `${letter}${cycle}`}`
}

/** Numero di gironi: pieno con `byes`, arrotondato per eccesso con `smaller_groups`. */
export function groupCountFor(
  elementCount: number,
  size: number,
  remainder: GroupRemainder,
): number {
  if (size < 2 || elementCount <= 0) return 0
  return remainder === 'byes'
    ? Math.floor(elementCount / size)
    : Math.ceil(elementCount / size)
}

/**
 * Dimensioni dei gironi per `smaller_groups`: i gironi differiscono al massimo
 * di un elemento e gli ultimi sono i più piccoli.
 * Con `byes` i gironi sono pieni e il resto non compare qui.
 */
export function groupSizes(
  elementCount: number,
  size: number,
  remainder: GroupRemainder,
): number[] {
  const count = groupCountFor(elementCount, size, remainder)
  if (count === 0) return []
  if (remainder === 'byes') return Array(count).fill(size)

  const base = Math.floor(elementCount / count)
  const extra = elementCount % count
  return Array.from({ length: count }, (_, index) => base + (index < extra ? 1 : 0))
}

function chunk<T>(elements: T[], sizes: number[]): T[][] {
  let offset = 0
  return sizes.map((groupSize) => {
    const members = elements.slice(offset, offset + groupSize)
    offset += groupSize
    return members
  })
}

function divideSnake<T>(elements: T[], sizes: number[]): T[][] {
  const buckets: T[][] = sizes.map(() => [])
  let offset = 0
  let round = 0
  while (offset < elements.length) {
    const order = Array.from({ length: sizes.length }, (_, index) => index)
    if (round % 2 === 1) order.reverse()
    for (const index of order) {
      if (offset >= elements.length) break
      if (buckets[index]!.length >= sizes[index]!) continue
      buckets[index]!.push(elements[offset]!)
      offset += 1
    }
    round += 1
  }
  return buckets
}

/**
 * Compone i gironi in modo deterministico, senza sorteggio.
 * Usata dall'anteprima del piano: serpentina per `snake`, blocchi per le altre modalità.
 */
export function layoutGroups<T extends GroupElement>(
  elements: T[],
  size: number,
  remainder: GroupRemainder,
  layout: GroupLayout,
): { groups: Group<T>[]; byes: T[] } {
  const count = groupCountFor(elements.length, size, remainder)
  if (count === 0) return { groups: [], byes: [] }

  const assignedCount = remainder === 'byes' ? count * size : elements.length
  const assigned = elements.slice(0, assignedCount)
  const byes = elements.slice(assignedCount)
  const sizes = groupSizes(elements.length, size, remainder)
  const buckets = layout === 'snake' ? divideSnake(assigned, sizes) : chunk(assigned, sizes)

  return {
    groups: buckets.map((members, index) => ({ name: groupName(index), members })),
    byes,
  }
}

function buildManual<T extends GroupElement>(
  elements: T[],
  size: number,
  count: number,
  manual: Record<string, number>,
): BuildGroupsResult<T> {
  const byId = new Map(elements.map((element) => [element.id, element]))
  for (const key of Object.keys(manual)) {
    if (!byId.has(key)) return { ok: false, error: 'manual_unknown_element' }
  }
  for (const element of elements) {
    if (!Object.prototype.hasOwnProperty.call(manual, element.id)) {
      return { ok: false, error: 'manual_incomplete' }
    }
  }

  const groups: Group<T>[] = Array.from({ length: count }, (_, index) => ({
    name: groupName(index),
    members: [],
  }))
  for (const element of elements) {
    const index = manual[element.id]!
    if (!Number.isInteger(index) || index < 0 || index >= count) {
      return { ok: false, error: 'manual_invalid_group' }
    }
    groups[index]!.members.push(element)
  }
  if (groups.some((group) => group.members.length > size)) {
    return { ok: false, error: 'manual_group_full' }
  }
  return { ok: true, groups, byes: [], draw: elements.map((element) => element.id) }
}

/**
 * Compone i gironi come funzione pura.
 *
 * - `random`: mescolamento crittografico (o generatore iniettato) e risultato salvabile
 *   tramite `groups`, `byes` e `draw`.
 * - `snake`: distribuzione a serpentina degli elementi già ordinati per seed.
 * - `manual`: assegnazione esplicita che deve coprire tutti gli elementi.
 */
export function buildGroups<T extends GroupElement>(
  elements: T[],
  options: BuildGroupsOptions,
): BuildGroupsResult<T> {
  const { size, assignment, remainder } = options
  if (!Number.isInteger(size) || size < 2) {
    return { ok: false, error: 'size_invalid' }
  }

  if (assignment === 'manual') {
    const count = groupCountFor(elements.length, size, remainder)
    return buildManual(elements, size, count, options.manual ?? {})
  }

  const randomInt = options.randomInt ?? cryptoRandomInt
  const ordered =
    assignment === 'random'
      ? shuffle(elements, randomInt)
      : elements
  const layout = assignment === 'snake' ? 'snake' : 'sequential'
  const { groups, byes } = layoutGroups(ordered, size, remainder, layout)

  return {
    ok: true,
    groups,
    byes,
    draw: ordered.map((element) => element.id),
  }
}

export interface RoundRobinMatch<T> {
  a: T
  b: T
}

const BYE = Symbol('bye')

/**
 * Genera tutte le sfide di un girone con metodo del cerchio.
 * Con un numero dispari di elementi il turno di riposo non produce una sfida.
 */
export function buildRoundRobin<T>(members: readonly T[]): RoundRobinMatch<T>[] {
  if (members.length < 2) return []

  const participants: (T | symbol)[] =
    members.length % 2 === 0 ? [...members] : [...members, BYE]
  const roundCount = participants.length - 1
  const rotation = participants.slice(1)
  const matches: RoundRobinMatch<T>[] = []

  for (let round = 0; round < roundCount; round += 1) {
    const lineup = [participants[0]!, ...rotation]
    const half = lineup.length / 2
    for (let index = 0; index < half; index += 1) {
      const a = lineup[index]!
      const b = lineup[lineup.length - 1 - index]!
      if (a !== BYE && b !== BYE) {
        matches.push({ a: a as T, b: b as T })
      }
    }
    rotation.unshift(rotation.pop()!)
  }

  return matches
}
