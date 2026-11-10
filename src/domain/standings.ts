import {
  GROUP_TIEBREAKS,
  resolveTie,
  type TieBreakCriterion,
} from './tiebreak'

export interface StandingsMatch {
  a: string
  b: string
  winner: 'a' | 'b' | 'draw'
  weightA: number
  weightB: number
  creditsA?: number
  creditsB?: number
}

export interface StandingsPoints {
  win: number
  draw: number
  loss: number
}

export const DEFAULT_STANDINGS_POINTS: StandingsPoints = { win: 3, draw: 1, loss: 0 }

export interface ComputeStandingsOptions {
  /** Elementi da includere anche senza sfide. */
  elementIds?: readonly string[]
  /** Punti assegnati per vittoria, pareggio e sconfitta. */
  points?: StandingsPoints
  criteria?: readonly TieBreakCriterion[]
  manualOrder?: readonly string[]
}

interface StandingsStat {
  elementId: string
  points: number
  played: number
  won: number
  drawn: number
  lost: number
  weightDifference: number
  credits: number
}

export interface StandingsRow extends StandingsStat {
  position: number
  tied: boolean
}

export interface GroupStandings {
  rows: StandingsRow[]
  unresolved: string[][]
  requiresManualResolution: boolean
}

function emptyStat(elementId: string): StandingsStat {
  return {
    elementId,
    points: 0,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    weightDifference: 0,
    credits: 0,
  }
}

/**
 * Classifica di un girone round-robin. `matches` contiene l'esito già deciso di
 * ogni sfida; `computeStandings` assegna i punti e applica gli spareggi.
 */
export function computeStandings(
  matches: readonly StandingsMatch[],
  options: ComputeStandingsOptions = {},
): GroupStandings {
  const scoring = options.points ?? DEFAULT_STANDINGS_POINTS
  const stats = new Map<string, StandingsStat>()
  const ensure = (elementId: string): StandingsStat => {
    const existing = stats.get(elementId)
    if (existing) return existing
    const created = emptyStat(elementId)
    stats.set(elementId, created)
    return created
  }

  for (const elementId of options.elementIds ?? []) ensure(elementId)

  for (const match of matches) {
    const a = ensure(match.a)
    const b = ensure(match.b)
    a.played += 1
    b.played += 1
    a.weightDifference += match.weightA - match.weightB
    b.weightDifference += match.weightB - match.weightA
    a.credits += match.creditsA ?? 0
    b.credits += match.creditsB ?? 0

    if (match.winner === 'draw') {
      a.drawn += 1
      b.drawn += 1
      a.points += scoring.draw
      b.points += scoring.draw
    } else if (match.winner === 'a') {
      a.won += 1
      b.lost += 1
      a.points += scoring.win
      b.points += scoring.loss
    } else {
      b.won += 1
      a.lost += 1
      b.points += scoring.win
      a.points += scoring.loss
    }
  }

  const headToHead = (left: string, right: string): number => {
    let outcome = 0
    for (const match of matches) {
      const direct =
        (match.a === left && match.b === right) || (match.a === right && match.b === left)
      if (!direct || match.winner === 'draw') continue
      const leftIsA = match.a === left
      if ((match.winner === 'a') === leftIsA) outcome += 1
      else outcome -= 1
    }
    return outcome
  }

  const result = resolveTie([...stats.values()], {
    criteria: options.criteria ?? GROUP_TIEBREAKS,
    manualOrder: options.manualOrder,
    headToHead,
  })

  return {
    rows: result.rows.map((row) => {
      const stat = stats.get(row.elementId)!
      return { ...stat, position: row.position, tied: row.tied }
    }),
    unresolved: result.unresolved,
    requiresManualResolution: result.requiresManualResolution,
  }
}
