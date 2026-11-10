import { describe, expect, it } from 'vitest'

import { buildBracket, bracketSizeFor } from './bracket'

function elements(count: number): { id: string }[] {
  return Array.from({ length: count }, (_, index) => ({ id: `e${index + 1}` }))
}

function ids(values: ({ id: string } | null)[]): (string | null)[] {
  return values.map((value) => value?.id ?? null)
}

describe('bracketSizeFor', () => {
  it('porta alla potenza di 2 superiore con minimo 2', () => {
    expect([0, 1, 2, 3, 12, 32, 33].map(bracketSizeFor)).toEqual([2, 2, 2, 4, 16, 32, 64])
  })
})

describe('buildBracket', () => {
  it('con 32 elementi produce 16 sfide senza bye', () => {
    const result = buildBracket(elements(32), { seeding: 'ranking' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.bracketSize).toBe(32)
    expect(result.matches).toHaveLength(16)
    expect(result.byeCount).toBe(0)
    expect(result.byes).toEqual([])
    expect(result.matches.every((match) => !match.bye)).toBe(true)
    expect(ids(result.matches.map((match) => match.a))).toEqual(
      Array.from({ length: 16 }, (_, index) => `e${index + 1}`),
    )
    expect(ids(result.matches.map((match) => match.b))).toEqual(
      Array.from({ length: 16 }, (_, index) => `e${32 - index}`),
    )
  })

  it('con 12 elementi produce 4 sfide e 4 bye', () => {
    const result = buildBracket(elements(12), { seeding: 'ranking' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.bracketSize).toBe(16)
    expect(result.matches).toHaveLength(8)
    expect(result.matches.filter((match) => !match.bye)).toHaveLength(4)
    expect(result.byeCount).toBe(4)
    expect(result.byes.map((element) => element.id)).toEqual(['e1', 'e2', 'e3', 'e4'])
    expect(result.matches.filter((match) => !match.bye).map((match) => [match.a!.id, match.b!.id])).toEqual([
      ['e5', 'e12'],
      ['e6', 'e11'],
      ['e7', 'e10'],
      ['e8', 'e9'],
    ])
  })

  it('assegna i bye ai seed migliori lasciando vuoto il lato del seed peggiore', () => {
    const result = buildBracket(elements(5), { seeding: 'ranking' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.bracketSize).toBe(8)
    expect(
      result.matches.map((match) => [match.a?.id ?? null, match.b?.id ?? null, match.bye]),
    ).toEqual([
      ['e1', null, true],
      ['e2', null, true],
      ['e3', null, true],
      ['e4', 'e5', false],
    ])
  })

  it('è deterministico a parità di input e seeding', () => {
    const input = elements(12)
    expect(buildBracket(input, { seeding: 'ranking' })).toEqual(
      buildBracket(input, { seeding: 'ranking' }),
    )
  })

  it('con seeding ranking rispetta l ordine di input come ordine dei seed', () => {
    const input = [{ id: 'e3' }, { id: 'e1' }, { id: 'e2' }, { id: 'e4' }]
    const result = buildBracket(input, { seeding: 'ranking' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.draw).toEqual(['e3', 'e1', 'e2', 'e4'])
    expect(result.matches.map((match) => [match.a!.id, match.b!.id])).toEqual([
      ['e3', 'e4'],
      ['e1', 'e2'],
    ])
  })

  it('con seeding manual usa l ordine fornito dall organizzatore', () => {
    const result = buildBracket(elements(4), {
      seeding: 'manual',
      manual: ['e4', 'e2', 'e1', 'e3'],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.draw).toEqual(['e4', 'e2', 'e1', 'e3'])
    expect(result.matches.map((match) => [match.a!.id, match.b!.id])).toEqual([
      ['e4', 'e3'],
      ['e2', 'e1'],
    ])
  })

  it('rifiuta un seeding manuale incompleto o con elementi sconosciuti', () => {
    expect(buildBracket(elements(4), { seeding: 'manual' })).toEqual({
      ok: false,
      error: 'manual_incomplete',
    })
    expect(
      buildBracket(elements(4), { seeding: 'manual', manual: ['e1', 'e2', 'e3'] }),
    ).toEqual({ ok: false, error: 'manual_incomplete' })
    expect(
      buildBracket(elements(4), { seeding: 'manual', manual: ['e1', 'e2', 'e3', 'e9'] }),
    ).toEqual({ ok: false, error: 'manual_unknown_element' })
  })

  it('con seeding random mescola in modo deterministico e traccia il sorteggio', () => {
    const result = buildBracket(elements(4), { seeding: 'random', randomInt: () => 0 })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.draw).toEqual(['e2', 'e3', 'e4', 'e1'])
    expect(result.matches.map((match) => [match.a!.id, match.b!.id])).toEqual([
      ['e2', 'e1'],
      ['e3', 'e4'],
    ])
  })

  it('con 16 elementi produce un solo turno da 8 sfide', () => {
    const result = buildBracket(elements(16), { seeding: 'ranking' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.bracketSize).toBe(16)
    expect(result.matches).toHaveLength(8)
    expect(result.byeCount).toBe(0)
  })
})
