import { describe, expect, it } from 'vitest'

import { planOpening } from './phase-opening'
import { defaultPhaseConfig, type PhaseConfig } from './phases'

function elements(count: number) {
  return Array.from({ length: count }, (_, index) => ({ id: `e${index + 1}` }))
}

function config(overrides: Partial<PhaseConfig> = {}): PhaseConfig {
  return { ...defaultPhaseConfig(), ...overrides }
}

describe('planOpening', () => {
  it('crea gironi da quattro e tutte le sfide del round-robin', () => {
    const plan = planOpening(elements(8), {
      formula: 'group',
      voteType: 'duel',
      config: config({ groups: { size: 4, assignment: 'snake', remainder: 'smaller_groups', points: [3, 2, 1], standings: { win: 3, draw: 1, loss: 0 } } }),
      advance: { type: 'top_per_group', n: 2 },
    })

    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.groups).toHaveLength(2)
    expect(plan.groups.every((group) => group.memberIds.length === 4)).toBe(true)
    expect(plan.matches).toHaveLength(12)
    expect(plan.matches.every((match) => match.status === 'open')).toBe(true)
    expect(plan.matches.every((match) => match.round === 1)).toBe(true)
  })

  it('lascia i bye fuori dai gironi con resto byes', () => {
    const plan = planOpening(elements(10), {
      formula: 'group',
      voteType: 'duel',
      config: config({ groups: { size: 4, assignment: 'random', remainder: 'byes', points: [3, 2, 1], standings: { win: 3, draw: 1, loss: 0 } } }),
      advance: { type: 'top_per_group', n: 2 },
    })

    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.groups).toHaveLength(2)
    expect(plan.byes).toHaveLength(2)
    expect(plan.groups.flatMap((group) => group.memberIds)).toHaveLength(8)
  })

  it('crea il tabellone con quattro bye su dodici elementi', () => {
    const plan = planOpening(elements(12), {
      formula: 'elimination',
      voteType: 'duel',
      config: config({ elimination: { seeding: 'ranking', thirdPlaceMatch: false } }),
      advance: { type: 'winners' },
    })

    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.entrantIds).toHaveLength(12)
    expect(plan.matches).toHaveLength(8)
    expect(plan.matches.filter((match) => match.status === 'bye')).toHaveLength(4)
    expect(plan.byes).toHaveLength(4)
    expect(
      plan.matches
        .filter((match) => match.status === 'bye')
        .every((match) => match.winnerElementId !== null),
    ).toBe(true)
  })

  it('per una classifica registra solo gli elementi in ingresso', () => {
    const plan = planOpening(elements(6), {
      formula: 'ranking',
      voteType: 'ranking',
      config: config(),
      advance: { type: 'top_global', n: 4 },
    })

    expect(plan).toEqual({
      ok: true,
      entrantIds: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'],
      groups: [],
      matches: [],
      byes: [],
    })
  })
})
