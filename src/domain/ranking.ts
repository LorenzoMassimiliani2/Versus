import {
  RANKING_TIEBREAKS,
  resolveTie,
  type TieBreakCriterion,
  type TieBreakEntry,
} from './tiebreak'

export interface RankingAssignment {
  elementId: string
  points: number
}

export interface RankingVote {
  assignments: RankingAssignment[]
}

export interface RankingTally {
  elementId: string
  points: number
  firstPreferences: number
  ballots: number
}

export interface RankingRow extends RankingTally {
  position: number
  tied: boolean
}

export interface RankingStandings {
  rows: RankingRow[]
  unresolved: string[][]
  requiresManualResolution: boolean
}

export interface TallyRankingOptions {
  /** Scala punti della fase; il massimo determina le prime preferenze. */
  scale: readonly number[]
  /** Elementi da includere anche senza punti. */
  elementIds?: readonly string[]
  criteria?: readonly TieBreakCriterion[]
  manualOrder?: readonly string[]
}

function emptyTally(elementId: string): TieBreakEntry & RankingTally {
  return { elementId, points: 0, firstPreferences: 0, ballots: 0 }
}

/**
 * Somma i punti delle schede classifica. Le schede parziali sono valide: i punti
 * non assegnati restano non assegnati e non vengono redistribuiti.
 */
export function tallyRanking(
  votes: readonly RankingVote[],
  options: TallyRankingOptions,
): RankingStandings {
  const firstPreferencePoints = Math.max(...options.scale)
  const tallies = new Map<string, TieBreakEntry & RankingTally>()
  const ensure = (elementId: string): TieBreakEntry & RankingTally => {
    const existing = tallies.get(elementId)
    if (existing) return existing
    const created = emptyTally(elementId)
    tallies.set(elementId, created)
    return created
  }

  const ballots = new Map<string, Set<number>>()
  const firstPreferences = new Map<string, Set<number>>()
  const mark = (map: Map<string, Set<number>>, elementId: string, voteIndex: number): void => {
    const current = map.get(elementId)
    if (current) current.add(voteIndex)
    else map.set(elementId, new Set([voteIndex]))
  }

  for (const elementId of options.elementIds ?? []) ensure(elementId)

  votes.forEach((vote, voteIndex) => {
    for (const assignment of vote.assignments) {
      const tally = ensure(assignment.elementId)
      tally.points += assignment.points
      if (assignment.points === firstPreferencePoints) {
        mark(firstPreferences, assignment.elementId, voteIndex)
      }
      if (assignment.points > 0) mark(ballots, assignment.elementId, voteIndex)
    }
  })

  for (const [elementId, tally] of tallies) {
    tally.ballots = ballots.get(elementId)?.size ?? 0
    tally.firstPreferences = firstPreferences.get(elementId)?.size ?? 0
  }

  const result = resolveTie([...tallies.values()], {
    criteria: options.criteria ?? RANKING_TIEBREAKS,
    manualOrder: options.manualOrder,
  })

  return {
    rows: result.rows.map((row) => ({
      elementId: row.elementId,
      points: row.points,
      firstPreferences: row.firstPreferences ?? 0,
      ballots: row.ballots ?? 0,
      position: row.position,
      tied: row.tied,
    })),
    unresolved: result.unresolved,
    requiresManualResolution: result.requiresManualResolution,
  }
}
