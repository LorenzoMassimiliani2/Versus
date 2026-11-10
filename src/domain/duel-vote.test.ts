import { describe, expect, it } from 'vitest'

import { creditBalance, maxDuelCredits, validateDuelVote } from './duel-vote'

const limits = { budget: 5, maxPerMatch: 2, available: 5 }

describe('maxDuelCredits', () => {
  it('usa il minore tra budget e limite per sfida', () => {
    expect(maxDuelCredits(5, 2)).toBe(2)
    expect(maxDuelCredits(3, 5)).toBe(3)
    expect(maxDuelCredits(4, null)).toBe(4)
  })
})

describe('creditBalance', () => {
  it('somma spese negative e rimborsi positivi', () => {
    expect(creditBalance([-2, -3, 2])).toBe(-3)
    expect(creditBalance([])).toBe(0)
  })
})

describe('validateDuelVote', () => {
  it('accetta un voto entro i limiti', () => {
    const result = validateDuelVote({ side: 'a', credits: 2 }, limits)
    expect(result).toEqual({ ok: true, vote: { side: 'a', credits: 2 } })
  })

  it('rifiuta crediti oltre il limite per sfida', () => {
    expect(validateDuelVote({ side: 'a', credits: 3 }, limits)).toEqual({
      ok: false,
      error: 'credits_exceeded',
    })
  })

  it('rifiuta crediti oltre il saldo disponibile', () => {
    expect(validateDuelVote({ side: 'b', credits: 2 }, { ...limits, available: 1 })).toEqual({
      ok: false,
      error: 'credits_exceeded',
    })
  })

  it('rifiuta crediti su astensione', () => {
    expect(validateDuelVote({ side: 'abstain', credits: 1 }, limits)).toEqual({
      ok: false,
      error: 'credits_on_abstain',
    })
  })

  it('accetta astensione senza crediti', () => {
    expect(validateDuelVote({ side: 'abstain', credits: 0 }, limits)).toEqual({
      ok: true,
      vote: { side: 'abstain', credits: 0 },
    })
  })

  it('rifiuta lati e crediti non validi', () => {
    expect(validateDuelVote({ side: 'c', credits: 0 }, limits).ok).toBe(false)
    expect(validateDuelVote({ side: 'a', credits: -1 }, limits).ok).toBe(false)
    expect(validateDuelVote({ side: 'a', credits: 1.5 }, limits).ok).toBe(false)
    expect(validateDuelVote(null, limits).ok).toBe(false)
  })
})
