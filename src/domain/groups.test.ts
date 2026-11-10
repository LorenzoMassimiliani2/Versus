import { describe, expect, it } from 'vitest'

import {
  buildGroups,
  buildRoundRobin,
  groupCountFor,
  groupName,
  type GroupElement,
} from './groups'

function elements(count: number): GroupElement[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `e${index + 1}`,
    position: index + 1,
  }))
}

/** Generatore deterministico per i test: LCG semplice, non crittografico. */
function seededRandomInt(seed: number): (maxExclusive: number) => number {
  let state = seed >>> 0
  return (maxExclusive: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state % maxExclusive
  }
}

function sizes(groups: { members: unknown[] }[]): number[] {
  return groups.map((group) => group.members.length)
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('-')
}

describe('groupName', () => {
  it('usa lettere progressive e ricomincia dopo la Z', () => {
    expect(groupName(0)).toBe('Girone A')
    expect(groupName(25)).toBe('Girone Z')
    expect(groupName(26)).toBe('Girone A1')
  })
})

describe('groupCountFor', () => {
  it('calcola il numero di gironi secondo il resto', () => {
    expect(groupCountFor(40, 4, 'smaller_groups')).toBe(10)
    expect(groupCountFor(38, 4, 'smaller_groups')).toBe(10)
    expect(groupCountFor(38, 4, 'byes')).toBe(9)
  })
})

describe('buildGroups', () => {
  it('con 40 elementi e dimensione 4 crea 10 gironi da 4', () => {
    const result = buildGroups(elements(40), {
      size: 4,
      assignment: 'snake',
      remainder: 'smaller_groups',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.groups).toHaveLength(10)
    expect(sizes(result.groups)).toEqual(Array(10).fill(4))
    expect(result.byes).toEqual([])
    expect(result.groups[0]!.name).toBe('Girone A')
    expect(result.groups[9]!.name).toBe('Girone J')
  })

  it('con 38 elementi e smaller_groups crea 8 gironi da 4 e 2 da 3', () => {
    const result = buildGroups(elements(38), {
      size: 4,
      assignment: 'snake',
      remainder: 'smaller_groups',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(sizes(result.groups)).toEqual([4, 4, 4, 4, 4, 4, 4, 4, 3, 3])
    expect(result.byes).toEqual([])
  })

  it('con 38 elementi e byes crea 9 gironi da 4 e 2 bye', () => {
    const result = buildGroups(elements(38), {
      size: 4,
      assignment: 'snake',
      remainder: 'byes',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.groups).toHaveLength(9)
    expect(sizes(result.groups)).toEqual(Array(9).fill(4))
    expect(result.byes.map((element) => element.id)).toEqual(['e37', 'e38'])
  })

  it('snake separa le teste di serie e bilancia i gironi', () => {
    const result = buildGroups(elements(8), {
      size: 4,
      assignment: 'snake',
      remainder: 'smaller_groups',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(sizes(result.groups)).toEqual([4, 4])

    const groups = result.groups.map((group) => group.members.map((member) => member.id))
    expect(groups).toEqual([
      ['e1', 'e4', 'e5', 'e8'],
      ['e2', 'e3', 'e6', 'e7'],
    ])
    expect(groups[0]!.includes('e1') && groups[0]!.includes('e2')).toBe(false)
  })

  it('random usa il generatore iniettato e ripete lo stesso risultato con lo stesso seed', () => {
    const first = buildGroups(elements(40), {
      size: 4,
      assignment: 'random',
      remainder: 'smaller_groups',
      randomInt: seededRandomInt(7),
    })
    const second = buildGroups(elements(40), {
      size: 4,
      assignment: 'random',
      remainder: 'smaller_groups',
      randomInt: seededRandomInt(7),
    })

    expect(first).toEqual(second)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(sizes(first.groups)).toEqual(Array(10).fill(4))
    expect(first.draw).toHaveLength(40)
    expect(new Set(first.draw)).toEqual(new Set(elements(40).map((element) => element.id)))
  })

  it('random con byes sorteggia anche gli elementi che passano direttamente', () => {
    const result = buildGroups(elements(38), {
      size: 4,
      assignment: 'random',
      remainder: 'byes',
      randomInt: seededRandomInt(11),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(sizes(result.groups)).toEqual(Array(9).fill(4))
    expect(result.byes).toHaveLength(2)
    expect(result.draw).toHaveLength(38)
  })

  it('random senza generatore usa il sorteggio crittografico di default', () => {
    const result = buildGroups(elements(40), {
      size: 4,
      assignment: 'random',
      remainder: 'smaller_groups',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(sizes(result.groups)).toEqual(Array(10).fill(4))
    expect(new Set(result.draw).size).toBe(40)
  })

  it('manual crea i gironi dalle assegnazioni dell organizzatore', () => {
    const manual: Record<string, number> = {
      e1: 0,
      e2: 1,
      e3: 0,
      e4: 1,
      e5: 0,
      e6: 1,
      e7: 0,
      e8: 1,
    }

    const result = buildGroups(elements(8), {
      size: 4,
      assignment: 'manual',
      remainder: 'smaller_groups',
      manual,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.groups.map((group) => group.members.map((member) => member.id))).toEqual([
      ['e1', 'e3', 'e5', 'e7'],
      ['e2', 'e4', 'e6', 'e8'],
    ])
    expect(result.byes).toEqual([])
  })

  it('manual richiede che tutti gli elementi siano assegnati', () => {
    const result = buildGroups(elements(8), {
      size: 4,
      assignment: 'manual',
      remainder: 'smaller_groups',
      manual: { e1: 0, e2: 1, e3: 0, e4: 1, e5: 0, e6: 1, e7: 0 },
    })

    expect(result).toEqual({ ok: false, error: 'manual_incomplete' })
  })

  it('manual rifiuta elementi sconosciuti e gironi inesistenti', () => {
    const base: Record<string, number> = {
      e1: 0,
      e2: 1,
      e3: 0,
      e4: 1,
      e5: 0,
      e6: 1,
      e7: 0,
      e8: 1,
    }

    expect(
      buildGroups(elements(8), {
        size: 4,
        assignment: 'manual',
        remainder: 'smaller_groups',
        manual: { ...base, sconosciuto: 0 },
      }),
    ).toEqual({ ok: false, error: 'manual_unknown_element' })

    expect(
      buildGroups(elements(8), {
        size: 4,
        assignment: 'manual',
        remainder: 'smaller_groups',
        manual: { ...base, e8: 2 },
      }),
    ).toEqual({ ok: false, error: 'manual_invalid_group' })
  })

  it('manual rifiuta un girone oltre la dimensione', () => {
    const manual: Record<string, number> = {
      e1: 0,
      e2: 0,
      e3: 0,
      e4: 0,
      e5: 0,
      e6: 1,
      e7: 1,
      e8: 1,
    }

    expect(
      buildGroups(elements(8), {
        size: 4,
        assignment: 'manual',
        remainder: 'smaller_groups',
        manual,
      }),
    ).toEqual({ ok: false, error: 'manual_group_full' })
  })

  it('rifiuta una dimensione non valida', () => {
    expect(
      buildGroups(elements(8), {
        size: 1,
        assignment: 'snake',
        remainder: 'smaller_groups',
      }),
    ).toEqual({ ok: false, error: 'size_invalid' })
  })
})

describe('buildRoundRobin', () => {
  it('un girone da 4 produce 6 sfide, tutte le coppie una sola volta', () => {
    const matches = buildRoundRobin(['a', 'b', 'c', 'd'])

    expect(matches).toHaveLength(6)
    expect(matches.map((match) => pairKey(match.a, match.b))).toEqual([
      'a-d',
      'b-c',
      'a-c',
      'b-d',
      'a-b',
      'c-d',
    ])
    expect(new Set(matches.map((match) => pairKey(match.a, match.b))).size).toBe(6)
  })

  it('gestisce gironi dispari senza sfide con bye', () => {
    const matches = buildRoundRobin(['a', 'b', 'c'])

    expect(matches).toHaveLength(3)
    expect(new Set(matches.map((match) => pairKey(match.a, match.b)))).toEqual(
      new Set(['a-b', 'a-c', 'b-c']),
    )
    expect(matches.every((match) => match.a !== match.b)).toBe(true)
  })

  it('un girone da 5 produce 10 sfide', () => {
    expect(buildRoundRobin(['a', 'b', 'c', 'd', 'e'])).toHaveLength(10)
  })

  it('non modifica l array di input', () => {
    const members = ['a', 'b', 'c', 'd']
    buildRoundRobin(members)
    expect(members).toEqual(['a', 'b', 'c', 'd'])
  })
})
