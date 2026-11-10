import { describe, expect, it } from 'vitest'

import {
  computePhaseResults,
  type ComputeResultsInput,
  type ResultsBallotVote,
  type ResultsDuelVote,
} from './phase-results'
import { defaultPhaseConfig, type PhaseAdvance, type PhaseConfig, type PhaseFormula, type PhaseVoteType } from './phases'

function config(overrides: Partial<PhaseConfig> = {}): PhaseConfig {
  return { ...defaultPhaseConfig(), ...overrides }
}

function input(
  formula: PhaseFormula,
  voteType: PhaseVoteType,
  advance: PhaseAdvance,
  overrides: Partial<ComputeResultsInput> & { config?: PhaseConfig } = {},
): ComputeResultsInput {
  return {
    phase: {
      id: 'phase1',
      formula,
      voteType,
      config: overrides.config ?? config(),
      advance,
    },
    entrants: [],
    groups: [],
    matches: [],
    duelVotes: [],
    ballotVotes: [],
    ...overrides,
  }
}

function duelVotes(rows: Array<[string, 'a' | 'b' | 'abstain', number]>): ResultsDuelVote[] {
  return rows.map(([matchId, side, credits]) => ({ matchId, side, credits }))
}

function rankingBallot(targetId: string, assignments: Array<[string, number]>): ResultsBallotVote {
  return {
    targetId,
    kind: 'ranking',
    payload: JSON.stringify({
      assignments: assignments.map(([elementId, points]) => ({ elementId, points })),
    }),
  }
}

describe('computePhaseResults: gironi con duelli', () => {
  it('produce classifica, sfide e qualificati del girone', () => {
    const result = computePhaseResults(
      input('group', 'duel', { type: 'top_per_group', n: 1 }, {
        config: config({ groups: { size: 2, assignment: 'snake', remainder: 'smaller_groups', points: [3, 2, 1], standings: { win: 3, draw: 1, loss: 0 } } }),
        entrants: [{ elementId: 'a1' }, { elementId: 'a2' }],
        groups: [{ id: 'g1', position: 1, memberIds: ['a1', 'a2'] }],
        matches: [
          { id: 'm1', groupId: 'g1', round: 1, position: 1, elementAId: 'a1', elementBId: 'a2', winnerElementId: null, status: 'open' },
        ],
        duelVotes: duelVotes([
          ['m1', 'a', 2],
          ['m1', 'a', 0],
          ['m1', 'b', 0],
        ]),
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.requiresManualResolution).toBe(false)
    expect(result.results.groups).toHaveLength(1)
    expect(result.results.groups[0]!.ranking.map((row) => row.elementId)).toEqual(['a1', 'a2'])
    expect(result.results.groups[0]!.ranking[0]!.score).toBe(3)
    expect(result.results.matches[0]).toMatchObject({
      matchId: 'm1',
      winnerElementId: 'a1',
      resolvedBy: 'weight',
      sideA: { elementId: 'a1', weight: 4, credits: 2, voters: 2 },
      sideB: { elementId: 'a2', weight: 1, credits: 0, voters: 1 },
    })
    expect(result.results.qualified).toEqual(['a1'])
  })

  it('un duello irrisolto richiede la risoluzione manuale', () => {
    const result = computePhaseResults(
      input('group', 'duel', { type: 'all' }, {
        entrants: [{ elementId: 'a1' }, { elementId: 'a2' }],
        groups: [{ id: 'g1', position: 1, memberIds: ['a1', 'a2'] }],
        matches: [
          { id: 'm1', groupId: 'g1', round: 1, position: 1, elementAId: 'a1', elementBId: 'a2', winnerElementId: null, status: 'open' },
        ],
        duelVotes: duelVotes([
          ['m1', 'a', 0],
          ['m1', 'b', 0],
        ]),
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.requiresManualResolution).toBe(true)
    expect(result.unresolved).toEqual([['a1', 'a2']])
  })
})

describe('computePhaseResults: classifiche', () => {
  it('somma i punti delle schede di un girone', () => {
    const result = computePhaseResults(
      input('group', 'ranking', { type: 'top_per_group', n: 1 }, {
        config: config({ ranking: { points: [3, 2, 1], minSelections: 1 } }),
        entrants: [{ elementId: 'a1' }, { elementId: 'a2' }],
        groups: [{ id: 'g1', position: 1, memberIds: ['a1', 'a2'] }],
        ballotVotes: [
          rankingBallot('g1', [['a2', 3], ['a1', 2]]),
          rankingBallot('g1', [['a2', 3]]),
        ],
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.results.groups[0]!.ranking).toMatchObject([
      { elementId: 'a2', score: 6, firstPreferences: 2, position: 1 },
      { elementId: 'a1', score: 2, firstPreferences: 0, position: 2 },
    ])
    expect(result.results.qualified).toEqual(['a2'])
  })

  it('conta i pick di una fase di scelta', () => {
    const result = computePhaseResults(
      input('ranking', 'pick', { type: 'top_global', n: 2 }, {
        entrants: [{ elementId: 'e1' }, { elementId: 'e2' }, { elementId: 'e3' }],
        ballotVotes: [
          { targetId: 'phase1', kind: 'pick', payload: JSON.stringify({ elementId: 'e2' }) },
          { targetId: 'phase1', kind: 'pick', payload: JSON.stringify({ elementId: 'e2' }) },
          { targetId: 'phase1', kind: 'pick', payload: JSON.stringify({ elementId: 'e3' }) },
        ],
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.results.ranking.map((row) => row.elementId)).toEqual(['e2', 'e3', 'e1'])
    expect(result.results.ranking.map((row) => row.score)).toEqual([2, 1, 0])
    expect(result.results.qualified).toEqual(['e2', 'e3'])
  })

  it('un pareggio sulla soglia di qualificazione richiede la risoluzione', () => {
    const result = computePhaseResults(
      input('ranking', 'ranking', { type: 'top_global', n: 1 }, {
        config: config({ ranking: { points: [3, 2, 1], minSelections: 1 } }),
        entrants: [{ elementId: 'e1' }, { elementId: 'e2' }],
        ballotVotes: [rankingBallot('phase1', [['e1', 3], ['e2', 3]])],
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.requiresManualResolution).toBe(true)
    expect(result.unresolved).toEqual([['e1', 'e2']])
  })

  it('un pareggio sotto la soglia non blocca la chiusura', () => {
    const result = computePhaseResults(
      input('ranking', 'ranking', { type: 'top_global', n: 2 }, {
        config: config({ ranking: { points: [3, 2, 1], minSelections: 1 } }),
        entrants: [{ elementId: 'e1' }, { elementId: 'e2' }, { elementId: 'e3' }, { elementId: 'e4' }],
        ballotVotes: [
          rankingBallot('phase1', [['e1', 3], ['e2', 2], ['e3', 1]]),
          rankingBallot('phase1', [['e1', 3], ['e2', 2], ['e3', 1], ['e4', 1]]),
        ],
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.requiresManualResolution).toBe(false)
    expect(result.results.qualified).toEqual(['e1', 'e2'])
  })
})

describe('computePhaseResults: eliminazione', () => {
  it('elegge i vincitori delle sfide e ignora i bye', () => {
    const result = computePhaseResults(
      input('elimination', 'duel', { type: 'winners' }, {
        entrants: [{ elementId: 'e1' }, { elementId: 'e2' }, { elementId: 'e3' }],
        matches: [
          { id: 'm1', groupId: null, round: 1, position: 1, elementAId: 'e1', elementBId: null, winnerElementId: 'e1', status: 'bye' },
          { id: 'm2', groupId: null, round: 1, position: 2, elementAId: 'e2', elementBId: 'e3', winnerElementId: null, status: 'open' },
        ],
        duelVotes: duelVotes([['m2', 'b', 0]]),
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.results.qualified).toEqual(['e1', 'e3'])
    expect(result.results.matches[0]).toMatchObject({
      matchId: 'm1',
      winnerElementId: 'e1',
      resolvedBy: 'bye',
    })
  })

  it('con advance winner elegge il vincitore e lo espone nei risultati', () => {
    const result = computePhaseResults(
      input('elimination', 'duel', { type: 'winner' }, {
        entrants: [{ elementId: 'e1' }, { elementId: 'e2' }],
        matches: [
          { id: 'm1', groupId: null, round: 1, position: 1, elementAId: 'e1', elementBId: 'e2', winnerElementId: null, status: 'open' },
        ],
        duelVotes: duelVotes([['m1', 'a', 0]]),
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.results.winnerElementId).toBe('e1')
    expect(result.results.repechage).toBeNull()
  })
})

describe('computePhaseResults: ripescaggio', () => {
  it('seleziona i ripescati con i criteri configurati', () => {
    const result = computePhaseResults(
      input('group', 'ranking', {
        type: 'top_per_group',
        n: 1,
        repechage: { targetSize: 3, criteria: ['group_points'] },
      }, {
        config: config({ ranking: { points: [3, 2, 1], minSelections: 1 } }),
        entrants: [{ elementId: 'e1' }, { elementId: 'e2' }, { elementId: 'e3' }],
        groups: [{ id: 'g1', position: 1, memberIds: ['e1', 'e2', 'e3'] }],
        ballotVotes: [
          rankingBallot('g1', [['e1', 3], ['e2', 2], ['e3', 1]]),
        ],
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.results.qualified).toEqual(['e1'])
    expect(result.results.repechage).toEqual({
      enabled: true,
      selected: ['e2', 'e3'],
      criteria: ['group_points'],
    })
  })
})
