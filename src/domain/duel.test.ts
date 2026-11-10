import { describe, expect, it } from 'vitest'

import { DUEL_TIEBREAKS, tallyDuel, type DuelVote } from './duel'

function vote(side: DuelVote['side'], credits = 0): DuelVote {
  return { side, credits }
}

describe('tallyDuel', () => {
  it('un voto con 5 crediti pesa 6', () => {
    const result = tallyDuel({
      sideA: 'a',
      sideB: 'b',
      votes: [vote('a', 5)],
    })

    expect(result.sideA).toEqual({ elementId: 'a', weight: 6, credits: 5, voters: 1 })
    expect(result.sideB).toEqual({ elementId: 'b', weight: 0, credits: 0, voters: 0 })
    expect(result.winner).toBe('a')
    expect(result.winnerElementId).toBe('a')
    expect(result.resolvedBy).toBe('weight')
    expect(result.unresolved).toBe(false)
  })

  it('il lato con peso maggiore vince sommando i voti', () => {
    const result = tallyDuel({
      sideA: 'a',
      sideB: 'b',
      votes: [vote('a', 1), vote('b', 3), vote('b'), vote('a')],
    })

    // A: (1+1) + (1+0) = 3. B: (1+3) + (1+0) = 5.
    expect(result.sideA.weight).toBe(3)
    expect(result.sideA.credits).toBe(1)
    expect(result.sideA.voters).toBe(2)
    expect(result.sideB.weight).toBe(5)
    expect(result.sideB.credits).toBe(3)
    expect(result.sideB.voters).toBe(2)
    expect(result.winner).toBe('b')
    expect(result.resolvedBy).toBe('weight')
  })

  it('a parita di peso vince il lato con piu crediti investiti', () => {
    const result = tallyDuel({
      sideA: 'a',
      sideB: 'b',
      votes: [vote('a', 2), vote('b'), vote('b'), vote('b')],
    })

    // A: peso 3, crediti 2, votanti 1. B: peso 3, crediti 0, votanti 3.
    expect(result.sideA.weight).toBe(3)
    expect(result.sideB.weight).toBe(3)
    expect(result.sideA.credits).toBe(2)
    expect(result.sideB.credits).toBe(0)
    expect(result.winner).toBe('a')
    expect(result.resolvedBy).toBe('credits')
  })

  it('rispetta l ordine degli spareggi configurato per la fase', () => {
    const votes = [vote('a', 2), vote('b'), vote('b'), vote('b')]

    const byCredits = tallyDuel({ sideA: 'a', sideB: 'b', votes })
    expect(byCredits.winner).toBe('a')
    expect(byCredits.resolvedBy).toBe('credits')

    const byVoters = tallyDuel({ sideA: 'a', sideB: 'b', votes, criteria: ['voters', 'credits'] })
    expect(byVoters.winner).toBe('b')
    expect(byVoters.resolvedBy).toBe('voters')
  })

  it('usa la risoluzione manuale quando i criteri automatici non separano i lati', () => {
    const votes = [vote('a', 1), vote('b', 1)]

    const unresolved = tallyDuel({ sideA: 'a', sideB: 'b', votes })
    expect(unresolved.winner).toBeNull()
    expect(unresolved.winnerElementId).toBeNull()
    expect(unresolved.resolvedBy).toBeNull()
    expect(unresolved.unresolved).toBe(true)

    const resolved = tallyDuel({ sideA: 'a', sideB: 'b', votes, manualWinner: 'b' })
    expect(resolved.winner).toBe('b')
    expect(resolved.winnerElementId).toBe('b')
    expect(resolved.resolvedBy).toBe('manual')
    expect(resolved.unresolved).toBe(false)
  })

  it('le astensioni non aggiungono peso ne contano come votanti del lato', () => {
    const result = tallyDuel({
      sideA: 'a',
      sideB: 'b',
      votes: [vote('a'), vote('abstain'), vote('abstain')],
    })

    expect(result.sideA).toEqual({ elementId: 'a', weight: 1, credits: 0, voters: 1 })
    expect(result.sideB).toEqual({ elementId: 'b', weight: 0, credits: 0, voters: 0 })
    expect(result.winner).toBe('a')
  })

  it('un duello con sole astensioni resta irrisolto', () => {
    const result = tallyDuel({
      sideA: 'a',
      sideB: 'b',
      votes: [vote('abstain'), vote('abstain')],
    })

    expect(result.sideA.weight).toBe(0)
    expect(result.sideB.weight).toBe(0)
    expect(result.winner).toBeNull()
    expect(result.unresolved).toBe(true)
  })

  it('un duello senza voti resta irrisolto', () => {
    const result = tallyDuel({ sideA: 'a', sideB: 'b', votes: [] })

    expect(result.sideA).toEqual({ elementId: 'a', weight: 0, credits: 0, voters: 0 })
    expect(result.sideB).toEqual({ elementId: 'b', weight: 0, credits: 0, voters: 0 })
    expect(result.winner).toBeNull()
    expect(result.unresolved).toBe(true)
  })

  it('e deterministico a parita di input', () => {
    const input = {
      sideA: 'a',
      sideB: 'b',
      votes: [vote('a', 2), vote('b', 2), vote('abstain')],
    }

    expect(tallyDuel(input)).toEqual(tallyDuel(input))
    expect(DUEL_TIEBREAKS).toEqual(['credits', 'voters', 'manual'])
  })
})
