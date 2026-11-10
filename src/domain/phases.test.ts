import { describe, expect, it } from 'vitest'

import { validatePhaseCreate, validatePhasePatch, type PhaseDraft } from './phases'

function phaseInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Gironi',
    formula: 'group',
    voteType: 'ranking',
    config: {},
    advance: { type: 'top_per_group', n: 2 },
    ...overrides,
  }
}

describe('validatePhaseCreate', () => {
  it('accetta una formula con la scheda e l avanzamento previsti', () => {
    const result = validatePhaseCreate(phaseInput())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.phase).toMatchObject({
      name: 'Gironi',
      formula: 'group',
      voteType: 'ranking',
      advance: { type: 'top_per_group', n: 2 },
    })
    expect(result.phase.config).toMatchObject({
      deadline: null,
      closeTriggers: [],
      credits: { perVoter: 0, maxPerMatch: null },
    })
  })

  it('accetta la scheda pick e il ripescaggio su una fase ranking', () => {
    const result = validatePhaseCreate(
      phaseInput({
        name: 'Finale',
        formula: 'ranking',
        voteType: 'pick',
        advance: {
          type: 'top_global',
          n: 3,
          repechage: { targetSize: 5, criteria: ['first_preferences', 'draw'] },
        },
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.phase.advance).toEqual({
      type: 'top_global',
      n: 3,
      repechage: { targetSize: 5, criteria: ['first_preferences', 'draw'] },
    })
  })

  it('rifiuta una scheda non ammessa per la formula', () => {
    const result = validatePhaseCreate(
      phaseInput({ formula: 'elimination', voteType: 'ranking' }),
    )

    expect(result).toEqual({ ok: false, error: 'invalid_phase' })
  })

  it('rifiuta un avanzamento non ammesso per la formula', () => {
    const result = validatePhaseCreate(phaseInput({ advance: { type: 'winner' } }))

    expect(result).toEqual({ ok: false, error: 'invalid_phase' })
  })

  it('rifiuta valori della configurazione non validi', () => {
    for (const config of [
      { secrecy: 'pubblica' },
      { votingMode: 'libera' },
      { credits: { perVoter: -1, maxPerMatch: null } },
      { groups: { size: 1 } },
      { deadline: 'non-una-data' },
    ]) {
      expect(validatePhaseCreate(phaseInput({ config }))).toEqual({
        ok: false,
        error: 'invalid_phase',
      })
    }
  })

  it('distingue una richiesta malformata da una fase non valida', () => {
    expect(validatePhaseCreate({ formula: 'group' })).toEqual({
      ok: false,
      error: 'invalid_request',
    })
    expect(validatePhaseCreate('non un oggetto')).toEqual({
      ok: false,
      error: 'invalid_request',
    })
  })
})

describe('validatePhasePatch', () => {
  const current: PhaseDraft = {
    name: 'Gironi',
    formula: 'group',
    voteType: 'ranking',
    config: { deadline: null, closeTriggers: [], secrecy: 'live', votingMode: 'simultaneous', credits: { perVoter: 0, maxPerMatch: null } },
    advance: { type: 'top_per_group', n: 2 },
  }

  it('applica una modifica parziale mantenendo gli altri campi', () => {
    const result = validatePhasePatch({ name: 'Gironi A' }, current)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.phase).toMatchObject({
      name: 'Gironi A',
      formula: 'group',
      voteType: 'ranking',
      advance: { type: 'top_per_group', n: 2 },
    })
  })

  it('rifiuta una coppia formula-scheda non valida dopo la modifica', () => {
    expect(validatePhasePatch({ formula: 'elimination' }, current)).toEqual({
      ok: false,
      error: 'invalid_phase',
    })
  })

  it('rifiuta una modifica vuota', () => {
    expect(validatePhasePatch({}, current)).toEqual({ ok: false, error: 'invalid_request' })
  })
})
