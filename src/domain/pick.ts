import {
  PICK_TIEBREAKS,
  resolveTie,
  type TieBreakCriterion,
  type TieBreakEntry,
} from './tiebreak'

export interface PickVote {
  elementId: string
}

export interface PickTally {
  elementId: string
  picks: number
}

export interface PickRow extends PickTally {
  position: number
  tied: boolean
}

export interface PickStandings {
  rows: PickRow[]
  unresolved: string[][]
  requiresManualResolution: boolean
}

export interface TallyPickOptions {
  elementIds?: readonly string[]
  criteria?: readonly TieBreakCriterion[]
  manualOrder?: readonly string[]
}

/** Conta un punto per ogni scheda di scelta. */
export function tallyPick(
  votes: readonly PickVote[],
  options: TallyPickOptions = {},
): PickStandings {
  const tallies = new Map<string, TieBreakEntry & PickTally>()
  const ensure = (elementId: string): TieBreakEntry & PickTally => {
    const existing = tallies.get(elementId)
    if (existing) return existing
    const created = { elementId, points: 0, picks: 0 }
    tallies.set(elementId, created)
    return created
  }

  for (const elementId of options.elementIds ?? []) ensure(elementId)
  for (const vote of votes) {
    const tally = ensure(vote.elementId)
    tally.picks += 1
    tally.points += 1
  }

  const result = resolveTie([...tallies.values()], {
    criteria: options.criteria ?? PICK_TIEBREAKS,
    manualOrder: options.manualOrder,
  })

  return {
    rows: result.rows.map((row) => {
      const tally = tallies.get(row.elementId)!
      return {
        elementId: tally.elementId,
        picks: tally.picks,
        position: row.position,
        tied: row.tied,
      }
    }),
    unresolved: result.unresolved,
    requiresManualResolution: result.requiresManualResolution,
  }
}
