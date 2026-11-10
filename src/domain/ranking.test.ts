import { describe, expect, it } from 'vitest'

import { tallyRanking } from './ranking'

const SCALE = [12, 10, 8, 6, 4, 2, 1]

describe('tallyRanking', () => {
  it('somma i punti delle schede parziali senza redistribuire quelli non assegnati', () => {
    const result = tallyRanking(
      [
        { assignments: [{ elementId: 'x', points: 12 }, { elementId: 'y', points: 10 }] },
        { assignments: [{ elementId: 'x', points: 10 }] },
      ],
      { scale: SCALE, elementIds: ['x', 'y', 'z'] },
    )

    expect(result.rows).toEqual([
      { elementId: 'x', points: 22, firstPreferences: 1, ballots: 2, position: 1, tied: false },
      { elementId: 'y', points: 10, firstPreferences: 0, ballots: 1, position: 2, tied: false },
      { elementId: 'z', points: 0, firstPreferences: 0, ballots: 0, position: 3, tied: false },
    ])
    expect(result.requiresManualResolution).toBe(false)
  })

  it('conta le prime preferenze sul valore massimo della scala', () => {
    const result = tallyRanking(
      [
        { assignments: [{ elementId: 'x', points: 12 }, { elementId: 'y', points: 8 }] },
        { assignments: [{ elementId: 'y', points: 12 }, { elementId: 'x', points: 8 }] },
        { assignments: [{ elementId: 'x', points: 12 }] },
      ],
      { scale: SCALE, elementIds: ['x', 'y'] },
    )

    expect(result.rows.map((row) => [row.elementId, row.points, row.firstPreferences])).toEqual([
      ['x', 32, 2],
      ['y', 20, 1],
    ])
  })

  it('risolve la parità sui punti con le prime preferenze', () => {
    const result = tallyRanking(
      [
        { assignments: [{ elementId: 'x', points: 12 }, { elementId: 'y', points: 10 }] },
        { assignments: [{ elementId: 'y', points: 12 }, { elementId: 'x', points: 10 }] },
      ],
      { scale: SCALE, elementIds: ['x', 'y'] },
    )

    expect(result.rows.map((row) => [row.elementId, row.points, row.firstPreferences])).toEqual([
      ['x', 22, 1],
      ['y', 22, 1],
    ])
    expect(result.requiresManualResolution).toBe(true)
    expect(result.unresolved).toEqual([['x', 'y']])
    expect(result.rows.map((row) => row.position)).toEqual([1, 1])
    expect(result.rows.map((row) => row.tied)).toEqual([true, true])
  })

  it('dopo le prime preferenze usa il numero di schede', () => {
    const result = tallyRanking(
      [
        { assignments: [{ elementId: 'x', points: 12 }] },
        { assignments: [{ elementId: 'x', points: 4 }] },
        { assignments: [{ elementId: 'x', points: 4 }] },
        { assignments: [{ elementId: 'y', points: 12 }] },
        { assignments: [{ elementId: 'y', points: 8 }] },
      ],
      { scale: SCALE, elementIds: ['x', 'y'] },
    )

    expect(
      result.rows.map((row) => [row.elementId, row.points, row.firstPreferences, row.ballots]),
    ).toEqual([
      ['x', 20, 1, 3],
      ['y', 20, 1, 2],
    ])
  })

  it('segnala il pareggio irrisolto e accetta un ordine manuale', () => {
    const votes = [
      { assignments: [{ elementId: 'x', points: 12 }, { elementId: 'y', points: 8 }] },
      { assignments: [{ elementId: 'y', points: 12 }, { elementId: 'x', points: 8 }] },
    ]

    const manual = tallyRanking(votes, {
      scale: SCALE,
      elementIds: ['x', 'y'],
      manualOrder: ['y', 'x'],
    })

    expect(manual.rows.map((row) => [row.elementId, row.position, row.tied])).toEqual([
      ['y', 1, false],
      ['x', 2, false],
    ])
    expect(manual.unresolved).toEqual([])
    expect(manual.requiresManualResolution).toBe(false)
  })

  it('golden: stessa fixture, stesso ordine', () => {
    const votes = [
      {
        assignments: [
          { elementId: 'alba', points: 12 },
          { elementId: 'bruno', points: 10 },
          { elementId: 'carla', points: 8 },
        ],
      },
      { assignments: [{ elementId: 'carla', points: 12 }, { elementId: 'bruno', points: 10 }] },
      {
        assignments: [
          { elementId: 'bruno', points: 12 },
          { elementId: 'carla', points: 10 },
          { elementId: 'alba', points: 8 },
        ],
      },
    ]

    const result = tallyRanking(votes, {
      scale: SCALE,
      elementIds: ['alba', 'bruno', 'carla'],
    })

    expect(result).toEqual({
      rows: [
        { elementId: 'bruno', points: 32, firstPreferences: 1, ballots: 3, position: 1, tied: false },
        { elementId: 'carla', points: 30, firstPreferences: 1, ballots: 3, position: 2, tied: false },
        { elementId: 'alba', points: 20, firstPreferences: 1, ballots: 2, position: 3, tied: false },
      ],
      unresolved: [],
      requiresManualResolution: false,
    })
  })
})
