import { describe, expect, it } from 'vitest'

import { applyRepechage, type RepechageCandidate } from './repechage'

/** Generatore deterministico per i test: LCG semplice, non crittografico. */
function seededRandomInt(seed: number): (maxExclusive: number) => number {
  let state = seed >>> 0
  return (maxExclusive: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state % maxExclusive
  }
}

function candidates(count: number): RepechageCandidate[] {
  return Array.from({ length: count }, (_, index) => ({
    elementId: `e${index + 1}`,
    groupPoints: count - index,
  }))
}

describe('applyRepechage', () => {
  it('con 20 qualificati diretti e target 32 seleziona 12 ripescati', () => {
    const result = applyRepechage({
      excluded: candidates(20),
      directQualified: 20,
      targetSize: 32,
      criteria: ['group_points'],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.slots).toBe(12)
    expect(result.selected).toEqual([
      'e1',
      'e2',
      'e3',
      'e4',
      'e5',
      'e6',
      'e7',
      'e8',
      'e9',
      'e10',
      'e11',
      'e12',
    ])
    expect(result.excluded).toEqual([
      'e13',
      'e14',
      'e15',
      'e16',
      'e17',
      'e18',
      'e19',
      'e20',
    ])
    expect(result.order).toEqual(candidates(20).map((candidate) => candidate.elementId))
  })

  it('applica i criteri nell ordine configurato', () => {
    const excluded: RepechageCandidate[] = [
      { elementId: 'a', groupPoints: 10, firstPreferences: 1 },
      { elementId: 'b', groupPoints: 8, firstPreferences: 9 },
    ]

    const byGroupPoints = applyRepechage({
      excluded,
      directQualified: 0,
      targetSize: 2,
      criteria: ['group_points', 'first_preferences'],
    })
    expect(byGroupPoints.ok).toBe(true)
    if (!byGroupPoints.ok) return
    expect(byGroupPoints.order).toEqual(['a', 'b'])

    const byFirstPreferences = applyRepechage({
      excluded,
      directQualified: 0,
      targetSize: 2,
      criteria: ['first_preferences', 'group_points'],
    })
    expect(byFirstPreferences.ok).toBe(true)
    if (!byFirstPreferences.ok) return
    expect(byFirstPreferences.order).toEqual(['b', 'a'])
  })

  it('passa al criterio successivo quando il precedente pareggia', () => {
    const excluded: RepechageCandidate[] = [
      { elementId: 'a', groupPoints: 10, firstPreferences: 2 },
      { elementId: 'b', groupPoints: 10, firstPreferences: 7 },
      { elementId: 'c', groupPoints: 12, firstPreferences: 0 },
    ]

    const result = applyRepechage({
      excluded,
      directQualified: 0,
      targetSize: 2,
      criteria: ['group_points', 'first_preferences'],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.selected).toEqual(['c', 'b'])
    expect(result.excluded).toEqual(['a'])
  })

  it('con target gia raggiunto non seleziona nessuno', () => {
    const result = applyRepechage({
      excluded: candidates(5),
      directQualified: 21,
      targetSize: 20,
      criteria: ['group_points'],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.slots).toBe(0)
    expect(result.selected).toEqual([])
    expect(result.excluded).toEqual(['e1', 'e2', 'e3', 'e4', 'e5'])
    expect(result.draw).toBeNull()
  })

  it('rifiuta weight_difference quando la fase precedente non ha prodotto duelli', () => {
    const result = applyRepechage({
      excluded: [
        { elementId: 'a', weightDifference: 4 },
        { elementId: 'b', weightDifference: 1 },
      ],
      directQualified: 0,
      targetSize: 1,
      criteria: ['weight_difference'],
    })

    expect(result).toEqual({
      ok: false,
      error: 'criterion_unavailable',
      criterion: 'weight_difference',
    })
  })

  it('usa weight_difference quando la fase precedente ha prodotto duelli', () => {
    const result = applyRepechage({
      excluded: [
        { elementId: 'a', weightDifference: 4 },
        { elementId: 'b', weightDifference: 9 },
        { elementId: 'c', weightDifference: -2 },
      ],
      directQualified: 0,
      targetSize: 2,
      criteria: ['weight_difference'],
      hasDuels: true,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.selected).toEqual(['b', 'a'])
    expect(result.excluded).toEqual(['c'])
  })

  it('rifiuta group_points quando manca il dato di girone', () => {
    const result = applyRepechage({
      excluded: [{ elementId: 'a' }, { elementId: 'b' }],
      directQualified: 0,
      targetSize: 1,
      criteria: ['group_points'],
    })

    expect(result).toEqual({
      ok: false,
      error: 'criterion_unavailable',
      criterion: 'group_points',
    })
  })

  it('rifiuta first_preferences quando manca il dato delle schede', () => {
    const result = applyRepechage({
      excluded: [{ elementId: 'a' }, { elementId: 'b' }],
      directQualified: 0,
      targetSize: 1,
      criteria: ['first_preferences'],
    })

    expect(result).toEqual({
      ok: false,
      error: 'criterion_unavailable',
      criterion: 'first_preferences',
    })
  })

  it('restituisce un errore se gli esclusi non bastano', () => {
    const result = applyRepechage({
      excluded: candidates(3),
      directQualified: 20,
      targetSize: 32,
      criteria: ['group_points'],
    })

    expect(result).toEqual({
      ok: false,
      error: 'not_enough_excluded',
      required: 12,
      available: 3,
    })
  })

  it('draw e deterministico con lo stesso seed e traccia il sorteggio', () => {
    const options = {
      excluded: candidates(20),
      directQualified: 20,
      targetSize: 32,
      criteria: ['draw'] as const,
      randomInt: seededRandomInt(42),
    }

    const first = applyRepechage({ ...options, randomInt: seededRandomInt(42) })
    const second = applyRepechage({ ...options, randomInt: seededRandomInt(42) })

    expect(first).toEqual(second)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.draw).toHaveLength(20)
    expect(new Set(first.draw)).toEqual(new Set(candidates(20).map((candidate) => candidate.elementId)))
    expect(first.draw).toEqual(first.order)
    expect(first.selected).toEqual(first.order.slice(0, 12))
  })

  it('draw rompe la parita al confine e il risultato segue il sorteggio', () => {
    const excluded: RepechageCandidate[] = [
      { elementId: 'a', groupPoints: 5 },
      { elementId: 'b', groupPoints: 5 },
      { elementId: 'c', groupPoints: 5 },
      { elementId: 'd', groupPoints: 5 },
    ]

    const result = applyRepechage({
      excluded,
      directQualified: 0,
      targetSize: 2,
      criteria: ['group_points', 'draw'],
      randomInt: seededRandomInt(7),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.draw).not.toBeNull()
    expect(result.selected).toEqual(result.draw!.slice(0, 2))
    expect(result.excluded).toEqual(result.draw!.slice(2))
  })

  it('draw senza generatore iniettato usa il sorteggio crittografico', () => {
    const result = applyRepechage({
      excluded: candidates(8),
      directQualified: 0,
      targetSize: 3,
      criteria: ['draw'],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.draw).toHaveLength(8)
    expect(new Set(result.draw)).toEqual(new Set(candidates(8).map((candidate) => candidate.elementId)))
    expect(result.selected).toHaveLength(3)
  })

  it('senza draw una parita totale resta nell ordine di input', () => {
    const excluded: RepechageCandidate[] = [
      { elementId: 'c', groupPoints: 5 },
      { elementId: 'a', groupPoints: 5 },
      { elementId: 'b', groupPoints: 5 },
    ]

    const result = applyRepechage({
      excluded,
      directQualified: 0,
      targetSize: 1,
      criteria: ['group_points'],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.selected).toEqual(['c'])
    expect(result.order).toEqual(['c', 'a', 'b'])
    expect(result.draw).toBeNull()
  })
})
