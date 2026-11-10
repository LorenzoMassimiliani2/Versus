import type { PhaseAdvance } from './phases'

/** Sfida in ingresso all'avanzamento, con l'esito gia deciso dal tally. */
export interface AdvanceMatch {
  sideA: string | null
  sideB: string | null
  /** Vincitore della sfida; assente per i bye e per i duelli irrisolti. */
  winnerElementId: string | null
  /** Sfida con un solo elemento: passa automaticamente il lato presente. */
  bye?: boolean
  /** Finale 3/4 posto: non produce qualificati per la fase successiva. */
  thirdPlace?: boolean
}

export interface ApplyAdvanceOptions {
  advance: PhaseAdvance
  /** Elementi in ingresso alla fase, per `advance.type = all`. */
  entrants?: readonly string[]
  /** Sfide della fase, per `advance.type = winners` o `winner` in eliminazione. */
  matches?: readonly AdvanceMatch[]
  /** Classifica ordinata, per `top_global` e `winner` in classifica. */
  ranking?: readonly string[]
  /** Classifiche dei gironi, ciascuna ordinata, per `top_per_group`. */
  groups?: readonly (readonly string[])[]
}

export type AdvanceError = 'missing_input' | 'missing_winner'

export type ApplyAdvanceResult =
  | { ok: true; qualified: string[]; winnerElementId: string | null }
  | { ok: false; error: AdvanceError }

function matchWinner(match: AdvanceMatch): string | null {
  if (match.winnerElementId) return match.winnerElementId
  if (match.bye) return match.sideA ?? match.sideB
  return null
}

function advancingMatches(matches: readonly AdvanceMatch[]): AdvanceMatch[] {
  return matches.filter((match) => !match.thirdPlace)
}

function missingInput(): ApplyAdvanceResult {
  return { ok: false, error: 'missing_input' }
}

/**
 * Calcola gli elementi che passano alla fase successiva.
 *
 * - `winners`: vincitori delle sfide nell'ordine del tabellone, bye inclusi.
 * - `top_global`: primi `n` della classifica.
 * - `top_per_group`: primi `n` di ogni girone, nell'ordine dei gironi.
 * - `all`: tutti gli elementi in ingresso.
 * - `winner`: vincitore della finale o primo classificato.
 *
 * La finale 3/4 posto non altera mai i qualificati. L'ordine di output segue
 * sempre l'ordine deterministico dell'input.
 */
export function applyAdvance(options: ApplyAdvanceOptions): ApplyAdvanceResult {
  const { advance } = options

  switch (advance.type) {
    case 'all': {
      if (!options.entrants) return missingInput()
      return { ok: true, qualified: [...options.entrants], winnerElementId: null }
    }

    case 'winners': {
      if (!options.matches) return missingInput()
      const qualified: string[] = []
      for (const match of advancingMatches(options.matches)) {
        const winner = matchWinner(match)
        if (!winner) return { ok: false, error: 'missing_winner' }
        qualified.push(winner)
      }
      return { ok: true, qualified, winnerElementId: null }
    }

    case 'winner': {
      if (options.matches) {
        const final = advancingMatches(options.matches).at(-1)
        if (!final) return missingInput()
        const winner = matchWinner(final)
        if (!winner) return { ok: false, error: 'missing_winner' }
        return { ok: true, qualified: [winner], winnerElementId: winner }
      }
      const first = options.ranking?.[0]
      if (!first) return missingInput()
      return { ok: true, qualified: [first], winnerElementId: first }
    }

    case 'top_global': {
      if (!options.ranking) return missingInput()
      return {
        ok: true,
        qualified: options.ranking.slice(0, advance.n),
        winnerElementId: null,
      }
    }

    case 'top_per_group': {
      if (!options.groups) return missingInput()
      return {
        ok: true,
        qualified: options.groups.flatMap((group) => group.slice(0, advance.n)),
        winnerElementId: null,
      }
    }
  }
}
