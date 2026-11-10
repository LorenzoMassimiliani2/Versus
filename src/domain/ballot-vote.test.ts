import { describe, expect, it } from 'vitest'

import {
  parseBallotPayload,
  validatePickBallot,
  validateRankingBallot,
} from './ballot-vote'

const options = {
  scale: [5, 3, 1],
  allowedElementIds: new Set(['e1', 'e2', 'e3']),
}

describe('validateRankingBallot', () => {
  it('accetta una scheda completa con valori della scala una sola volta', () => {
    const result = validateRankingBallot(
      {
        assignments: [
          { elementId: 'e2', points: 5 },
          { elementId: 'e1', points: 3 },
        ],
      },
      options,
    )

    expect(result).toEqual({
      ok: true,
      vote: {
        assignments: [
          { elementId: 'e2', points: 5 },
          { elementId: 'e1', points: 3 },
        ],
      },
    })
  })

  it('accetta una scheda parziale e una scheda vuota', () => {
    expect(validateRankingBallot({ assignments: [] }, options).ok).toBe(true)
    expect(
      validateRankingBallot({ assignments: [{ elementId: 'e3', points: 1 }] }, options).ok,
    ).toBe(true)
  })

  it('rifiuta lo stesso valore della scala due volte', () => {
    const result = validateRankingBallot(
      {
        assignments: [
          { elementId: 'e1', points: 5 },
          { elementId: 'e2', points: 5 },
        ],
      },
      options,
    )
    expect(result).toEqual({ ok: false, error: 'invalid_payload' })
  })

  it('rifiuta lo stesso elemento due volte', () => {
    const result = validateRankingBallot(
      {
        assignments: [
          { elementId: 'e1', points: 5 },
          { elementId: 'e1', points: 3 },
        ],
      },
      options,
    )
    expect(result).toEqual({ ok: false, error: 'invalid_payload' })
  })

  it('rifiuta punti fuori scala e elementi fuori dal target', () => {
    for (const payload of [
      { assignments: [{ elementId: 'e1', points: 4 }] },
      { assignments: [{ elementId: 'x', points: 5 }] },
      { assignments: [{ elementId: 'e1', points: 1.5 }] },
      { assignments: 'nope' },
      {},
    ]) {
      expect(validateRankingBallot(payload, options)).toEqual({
        ok: false,
        error: 'invalid_payload',
      })
    }
  })
})

describe('validatePickBallot', () => {
  it('accetta un solo elemento del target', () => {
    expect(validatePickBallot({ elementId: 'e2' }, options)).toEqual({
      ok: true,
      vote: { elementId: 'e2' },
    })
  })

  it('rifiuta due elementi, elementi fuori target e payload non validi', () => {
    for (const payload of [
      { elementId: 'e1', other: 'e2' },
      { elementId: ['e1', 'e2'] },
      { elementId: 'x' },
      { elementId: '' },
      [],
      null,
    ]) {
      expect(validatePickBallot(payload, options)).toEqual({
        ok: false,
        error: 'invalid_payload',
      })
    }
  })
})

describe('parseBallotPayload', () => {
  it('rilegge i payload validi e scarta quelli corrotti', () => {
    expect(parseBallotPayload('ranking', '{"assignments":[{"elementId":"e1","points":5}]}')).toEqual({
      assignments: [{ elementId: 'e1', points: 5 }],
    })
    expect(parseBallotPayload('pick', '{"elementId":"e1"}')).toEqual({ elementId: 'e1' })
    expect(parseBallotPayload('ranking', 'not-json')).toBeNull()
    expect(parseBallotPayload('pick', '{"assignments":[]}')).toBeNull()
  })
})
