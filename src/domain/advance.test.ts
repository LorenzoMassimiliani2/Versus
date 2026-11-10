import { describe, expect, it } from 'vitest'

import {
  applyAdvance,
  type AdvanceMatch,
  type ApplyAdvanceOptions,
} from './advance'

function match(
  sideA: string | null,
  sideB: string | null,
  winnerElementId: string | null,
  extra: Partial<AdvanceMatch> = {},
): AdvanceMatch {
  return { sideA, sideB, winnerElementId, ...extra }
}

describe('applyAdvance', () => {
  it('restituisce i vincitori delle sfide nell ordine del tabellone, bye inclusi', () => {
    const matches: AdvanceMatch[] = [
      match('e1', null, null, { bye: true }),
      match('e8', 'e9', 'e9'),
      match('e4', 'e13', 'e4'),
      match('e5', 'e12', 'e12'),
    ]

    const result = applyAdvance({ advance: { type: 'winners' }, matches })

    expect(result).toEqual({
      ok: true,
      qualified: ['e1', 'e9', 'e4', 'e12'],
      winnerElementId: null,
    })
  })

  it('la finale 3/4 posto non altera i qualificati della finale', () => {
    const matches: AdvanceMatch[] = [
      match('e1', 'e4', 'e1'),
      match('e2', 'e3', 'e3'),
      match('e2', 'e4', 'e4', { thirdPlace: true }),
    ]

    const result = applyAdvance({ advance: { type: 'winners' }, matches })

    expect(result).toEqual({ ok: true, qualified: ['e1', 'e3'], winnerElementId: null })
  })

  it('con advance winner elegge il vincitore della finale ignorando il terzo posto', () => {
    const matches: AdvanceMatch[] = [
      match('e1', 'e4', 'e1'),
      match('e2', 'e3', 'e3'),
      match('e2', 'e4', 'e4', { thirdPlace: true }),
    ]

    const result = applyAdvance({ advance: { type: 'winner' }, matches })

    expect(result).toEqual({ ok: true, qualified: ['e3'], winnerElementId: 'e3' })
  })

  it('con advance winner su una classifica elegge il primo classificato', () => {
    const result = applyAdvance({
      advance: { type: 'winner' },
      ranking: ['e7', 'e2', 'e9'],
    })

    expect(result).toEqual({ ok: true, qualified: ['e7'], winnerElementId: 'e7' })
  })

  it('top_global prende i primi n nell ordine della classifica', () => {
    const result = applyAdvance({
      advance: { type: 'top_global', n: 3 },
      ranking: ['e5', 'e1', 'e9', 'e2', 'e7'],
    })

    expect(result).toEqual({
      ok: true,
      qualified: ['e5', 'e1', 'e9'],
      winnerElementId: null,
    })
  })

  it('top_per_group prende i primi n di ogni girone nell ordine dei gironi', () => {
    const result = applyAdvance({
      advance: { type: 'top_per_group', n: 2 },
      groups: [
        ['a1', 'a2', 'a3', 'a4'],
        ['b1', 'b2', 'b3'],
      ],
    })

    expect(result).toEqual({
      ok: true,
      qualified: ['a1', 'a2', 'b1', 'b2'],
      winnerElementId: null,
    })
  })

  it('all restituisce tutti gli elementi in ingresso nell ordine dato', () => {
    const result = applyAdvance({
      advance: { type: 'all' },
      entrants: ['e3', 'e1', 'e2'],
    })

    expect(result).toEqual({
      ok: true,
      qualified: ['e3', 'e1', 'e2'],
      winnerElementId: null,
    })
  })

  it('segnala input mancante o vincitore assente', () => {
    const missing: ApplyAdvanceOptions[] = [
      { advance: { type: 'winners' } },
      { advance: { type: 'top_global', n: 2 } },
      { advance: { type: 'top_per_group', n: 2 } },
      { advance: { type: 'all' } },
      { advance: { type: 'winner' }, ranking: [] },
    ]
    for (const options of missing) {
      expect(applyAdvance(options)).toEqual({ ok: false, error: 'missing_input' })
    }

    expect(
      applyAdvance({
        advance: { type: 'winners' },
        matches: [match('e1', 'e2', null)],
      }),
    ).toEqual({ ok: false, error: 'missing_winner' })
  })

  it('e deterministico a parita di input', () => {
    const options: ApplyAdvanceOptions = {
      advance: { type: 'top_per_group', n: 1 },
      groups: [
        ['a1', 'a2'],
        ['b1', 'b2'],
      ],
    }

    expect(applyAdvance(options)).toEqual(applyAdvance(options))
  })
})
