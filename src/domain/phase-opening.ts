import { buildBracket } from './bracket'
import { buildGroups, buildRoundRobin, layoutGroups, type Group } from './groups'
import type { PhaseAdvance, PhaseConfig, PhaseFormula, PhaseVoteType } from './phases'

/** Elemento che entra in una fase, con l'ordine scelto a monte. */
export interface OpeningElement {
  id: string
}

/** Girone calcolato prima della persistenza. */
export interface OpeningGroup {
  name: string
  position: number
  memberIds: string[]
}

/** Sfida calcolata prima della persistenza. `groupIndex` e' l'indice del girone. */
export interface OpeningMatch {
  groupIndex: number | null
  round: number
  position: number
  elementAId: string | null
  elementBId: string | null
  winnerElementId: string | null
  status: 'open' | 'bye'
}

export interface OpeningPhaseInput {
  formula: PhaseFormula
  voteType: PhaseVoteType
  config: PhaseConfig
  advance: PhaseAdvance
}

export interface PlanOpeningOptions {
  /** Ordine dei seed per il seeding `manual` dell'eliminazione. */
  seedingOrder?: readonly string[]
}

export type OpeningError = 'manual_seeding_required'

export type OpeningPlan =
  | {
      ok: true
      /** Elementi in ingresso nell'ordine di seed. */
      entrantIds: string[]
      groups: OpeningGroup[]
      matches: OpeningMatch[]
      /** Elementi senza girone (resto `byes` o bye del tabellone). */
      byes: string[]
    }
  | { ok: false; error: OpeningError }

const DEFAULT_GROUP_SIZE = 4

function planGroups(
  elements: OpeningElement[],
  phase: OpeningPhaseInput,
): { groups: OpeningGroup[]; matches: OpeningMatch[]; byes: string[] } {
  const config = phase.config.groups
  const size = config?.size ?? DEFAULT_GROUP_SIZE
  const remainder = config?.remainder ?? 'smaller_groups'
  const assignment = config?.assignment ?? 'random'

  // L'assegnazione manuale non ha ancora una UI di trascinamento: all'apertura
  // si conserva l'ordine di ingresso invece di rifiutare la fase.
  const built =
    assignment === 'manual'
      ? layoutGroups(elements, size, remainder, 'sequential')
      : (() => {
          const result = buildGroups(elements, { size, assignment, remainder })
          return result.ok ? result : null
        })()

  if (!built) return { groups: [], matches: [], byes: [] }

  const groups: OpeningGroup[] = built.groups.map((group, index) => ({
    name: group.name,
    position: index + 1,
    memberIds: group.members.map((member) => member.id),
  }))
  const byes = built.byes.map((element) => element.id)

  const matches: OpeningMatch[] = []
  if (phase.voteType === 'duel') {
    let position = 1
    built.groups.forEach((group: Group<OpeningElement>, groupIndex) => {
      for (const pair of buildRoundRobin(group.members)) {
        matches.push({
          groupIndex,
          round: 1,
          position,
          elementAId: pair.a.id,
          elementBId: pair.b.id,
          winnerElementId: null,
          status: 'open',
        })
        position += 1
      }
    })
  }

  return { groups, matches, byes }
}

function planElimination(
  elements: OpeningElement[],
  phase: OpeningPhaseInput,
  options: PlanOpeningOptions,
): OpeningPlan {
  const seeding = phase.config.elimination?.seeding ?? 'ranking'
  const bracket = buildBracket(elements, { seeding, manual: options.seedingOrder })
  if (!bracket.ok) {
    return { ok: false, error: 'manual_seeding_required' }
  }

  const matches: OpeningMatch[] = bracket.matches.map((match, index) => {
    const elementAId = match.a?.id ?? null
    const elementBId = match.b?.id ?? null
    return {
      groupIndex: null,
      round: 1,
      position: index + 1,
      elementAId,
      elementBId,
      winnerElementId: match.bye ? (elementAId ?? elementBId) : null,
      status: match.bye ? 'bye' : 'open',
    }
  })

  return {
    ok: true,
    entrantIds: bracket.seeds.map((element) => element.id),
    groups: [],
    matches,
    byes: bracket.byes.map((element) => element.id),
  }
}

/**
 * Calcola lo stato operativo di una fase a partire dagli elementi in ingresso.
 * Funzione pura: usa `buildGroups`, `buildRoundRobin` e `buildBracket` e non
 * accede a D1, HTTP o UI. La finale 3/4 posto non viene creata all'apertura:
 * i suoi partecipanti dipendono dai risultati dei turni.
 */
export function planOpening(
  elements: OpeningElement[],
  phase: OpeningPhaseInput,
  options: PlanOpeningOptions = {},
): OpeningPlan {
  if (phase.formula === 'elimination') {
    return planElimination(elements, phase, options)
  }

  if (phase.formula === 'group') {
    const { groups, matches, byes } = planGroups(elements, phase)
    return {
      ok: true,
      entrantIds: elements.map((element) => element.id),
      groups,
      matches,
      byes,
    }
  }

  return {
    ok: true,
    entrantIds: elements.map((element) => element.id),
    groups: [],
    matches: [],
    byes: [],
  }
}
