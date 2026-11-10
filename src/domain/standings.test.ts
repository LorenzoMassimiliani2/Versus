import { describe, expect, it } from 'vitest'

import { computeStandings, type StandingsMatch } from './standings'

function match(
  a: string,
  b: string,
  winner: string,
  weightA = 0,
  weightB = 0,
  creditsA = 0,
  creditsB = 0,
): StandingsMatch {
  return {
    a,
    b,
    winner: winner === 'draw' ? 'draw' : winner === a ? 'a' : 'b',
    weightA,
    weightB,
    creditsA,
    creditsB,
  }
}

describe('computeStandings', () => {
  it('calcola la classifica di un girone da quattro con i punti 3/1/0', () => {
    const matches = [
      match('a', 'b', 'a'),
      match('a', 'c', 'a'),
      match('a', 'd', 'a'),
      match('b', 'c', 'b'),
      match('b', 'd', 'b'),
      match('c', 'd', 'c'),
    ]

    const result = computeStandings(matches)

    expect(result.rows.map((row) => [row.elementId, row.points, row.played, row.won, row.lost])).toEqual([
      ['a', 9, 3, 3, 0],
      ['b', 6, 3, 2, 1],
      ['c', 3, 3, 1, 2],
      ['d', 0, 3, 0, 3],
    ])
    expect(result.requiresManualResolution).toBe(false)
  })

  it('accetta punti vittoria, pareggio e sconfitta configurabili', () => {
    const result = computeStandings(
      [match('a', 'b', 'a'), match('b', 'c', 'b'), match('a', 'c', 'draw')],
      { points: { win: 2, draw: 1, loss: 0 } },
    )

    expect(result.rows.map((row) => [row.elementId, row.points, row.drawn])).toEqual([
      ['a', 3, 1],
      ['b', 2, 0],
      ['c', 1, 1],
    ])
  })

  it('risolve la parità con gli scontri diretti', () => {
    const matches = [
      match('b', 'a', 'b', 2, 1),
      match('a', 'c', 'a', 2, 0),
      match('a', 'd', 'a', 2, 1),
      match('b', 'c', 'b', 1, 0),
      match('d', 'b', 'd', 3, 0),
      match('c', 'd', 'c', 2, 0),
    ]

    const result = computeStandings(matches)

    expect(result.rows.map((row) => [row.elementId, row.points])).toEqual([
      ['b', 6],
      ['a', 6],
      ['c', 3],
      ['d', 3],
    ])
    expect(result.requiresManualResolution).toBe(false)
  })

  it('dopo gli scontri diretti usa la differenza di peso', () => {
    const matches = [
      match('a', 'b', 'draw', 2, 2),
      match('a', 'c', 'a', 5, 0),
      match('d', 'a', 'd', 1, 0),
      match('b', 'c', 'b', 1, 0),
      match('d', 'b', 'd', 3, 0),
      match('c', 'd', 'c', 1, 0),
    ]

    const result = computeStandings(matches)

    const a = result.rows.find((row) => row.elementId === 'a')!
    const b = result.rows.find((row) => row.elementId === 'b')!
    expect([a.points, a.weightDifference]).toEqual([4, 4])
    expect([b.points, b.weightDifference]).toEqual([4, -2])
    expect(result.rows.indexOf(a)).toBeLessThan(result.rows.indexOf(b))
  })

  it('dopo la differenza di peso usa i crediti investiti', () => {
    const matches = [
      match('a', 'b', 'draw', 1, 1, 3, 0),
      match('a', 'c', 'a', 1, 0, 2, 0),
      match('d', 'a', 'd', 1, 0),
      match('b', 'c', 'b', 1, 0),
      match('d', 'b', 'd', 1, 0),
      match('c', 'd', 'c', 1, 0),
    ]

    const result = computeStandings(matches)

    const a = result.rows.find((row) => row.elementId === 'a')!
    const b = result.rows.find((row) => row.elementId === 'b')!
    expect([a.points, a.weightDifference, a.credits]).toEqual([4, 0, 5])
    expect([b.points, b.weightDifference, b.credits]).toEqual([4, 0, 0])
    expect(result.rows.indexOf(a)).toBeLessThan(result.rows.indexOf(b))
  })

  it('segnala il pareggio irrisolto e accetta un ordine manuale', () => {
    const matches = [
      match('a', 'b', 'draw', 1, 1),
      match('a', 'c', 'a', 1, 0),
      match('d', 'a', 'd', 1, 0),
      match('b', 'c', 'b', 1, 0),
      match('d', 'b', 'd', 1, 0),
      match('c', 'd', 'c', 1, 0),
    ]

    const unresolved = computeStandings(matches)
    expect(unresolved.unresolved).toEqual([['a', 'b']])
    expect(unresolved.requiresManualResolution).toBe(true)
    expect(
      unresolved.rows.filter((row) => row.elementId === 'a' || row.elementId === 'b'),
    ).toEqual([
      expect.objectContaining({ elementId: 'a', position: 2, tied: true }),
      expect.objectContaining({ elementId: 'b', position: 2, tied: true }),
    ])

    const manual = computeStandings(matches, { manualOrder: ['b', 'a'] })
    expect(manual.requiresManualResolution).toBe(false)
    expect(manual.unresolved).toEqual([])
    expect(manual.rows.map((row) => row.elementId)).toEqual(['d', 'b', 'a', 'c'])
  })

  it('golden: stessa fixture, stessa classifica', () => {
    const matches = [
      match('a', 'b', 'a', 3, 1, 1, 0),
      match('a', 'c', 'a', 2, 0, 0, 2),
      match('a', 'd', 'a', 1, 0),
      match('b', 'c', 'b', 2, 1),
      match('b', 'd', 'b', 3, 0),
      match('c', 'd', 'draw', 1, 1),
    ]

    expect(computeStandings(matches)).toEqual({
      rows: [
        {
          elementId: 'a',
          points: 9,
          played: 3,
          won: 3,
          drawn: 0,
          lost: 0,
          weightDifference: 5,
          credits: 1,
          position: 1,
          tied: false,
        },
        {
          elementId: 'b',
          points: 6,
          played: 3,
          won: 2,
          drawn: 0,
          lost: 1,
          weightDifference: 2,
          credits: 0,
          position: 2,
          tied: false,
        },
        {
          elementId: 'c',
          points: 1,
          played: 3,
          won: 0,
          drawn: 1,
          lost: 2,
          weightDifference: -3,
          credits: 2,
          position: 3,
          tied: false,
        },
        {
          elementId: 'd',
          points: 1,
          played: 3,
          won: 0,
          drawn: 1,
          lost: 2,
          weightDifference: -4,
          credits: 0,
          position: 4,
          tied: false,
        },
      ],
      unresolved: [],
      requiresManualResolution: false,
    })
  })
})
