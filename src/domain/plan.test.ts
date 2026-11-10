
import { describe, expect, it } from 'vitest'

import type { PhaseAdvance, PhaseConfig } from './phases'
import {
  validatePlan,
  type PlanElementInput,
  type PlanInput,
  type PlanPhaseInput,
} from './plan'

function config(overrides: Partial<PhaseConfig> = {}): PhaseConfig {
  return {
    deadline: null,
    closeTriggers: [],
    secrecy: 'live',
    votingMode: 'simultaneous',
    credits: { perVoter: 0, maxPerMatch: null },
    ...overrides,
  }
}

function element(index: number): PlanElementInput {
  return {
    id: `e${index}`,
    name: `Elemento ${index}`,
    imageUrl: 'https://images.example.test/item.jpg',
    customValues: {},
    position: index,
  }
}

function groupConfig(overrides: Record<string, unknown> = {}) {
  return {
    size: 4,
    assignment: 'snake' as const,
    remainder: 'smaller_groups' as const,
    points: [3, 2, 1],
    standings: { win: 3, draw: 1, loss: 0 },
    ...overrides,
  }
}

function groupPhase(overrides: Partial<PlanPhaseInput> = {}): PlanPhaseInput {
  return {
    position: 1,
    name: 'Gironi',
    formula: 'group',
    voteType: 'ranking',
    config: config({ groups: groupConfig() }),
    advance: { type: 'top_per_group', n: 2 },
    ...overrides,
  }
}

function eliminationPhase(overrides: Partial<PlanPhaseInput> = {}): PlanPhaseInput {
  return {
    position: 2,
    name: 'Eliminazione',
    formula: 'elimination',
    voteType: 'duel',
    config: config(),
    advance: { type: 'winners' },
    ...overrides,
  }
}

function rankingPhase(overrides: Partial<PlanPhaseInput> = {}): PlanPhaseInput {
  return {
    position: 2,
    name: 'Finale',
    formula: 'ranking',
    voteType: 'pick',
    config: config(),
    advance: { type: 'winner' },
    ...overrides,
  }
}

function canonicalPlan(): PlanInput {
  return {
    tournament: { name: 'Torneo canonico', slug: 'torneo-canonico', settings: { autoAdvance: false } },
    elements: Array.from({ length: 40 }, (_, index) => element(index + 1)),
    fields: [],
    activeParticipants: 8,
    phases: [
      groupPhase({
        position: 1,
        name: 'Gironi',
        config: config({ groups: groupConfig() }),
        advance: {
          type: 'top_per_group',
          n: 2,
          repechage: { targetSize: 32, criteria: ['group_points', 'draw'] },
        },
      }),
      eliminationPhase({ position: 2, name: 'Sedicesimi' }),
      eliminationPhase({ position: 3, name: 'Ottavi' }),
      rankingPhase({ position: 4, name: 'Classifica finale' }),
    ],
  }
}

function codes(errors: { code: string }[]): string[] {
  return errors.map((error) => error.code)
}

describe('validatePlan', () => {
  it('accetta il piano canonico e ne calcola l anteprima', () => {
    const result = validatePlan(canonicalPlan())

    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
    expect(result.preview.elementCount).toBe(40)
    expect(result.preview.phases).toHaveLength(4)

    const [groups, roundOf32, roundOf16, final] = result.preview.phases
    expect(groups).toMatchObject({
      inputCount: 40,
      outputCount: 32,
      qualified: { direct: 20, repechage: 12, total: 32 },
      repechage: { targetSize: 32, excluded: 20, selected: 12 },
    })
    expect(groups!.groups).toHaveLength(10)
    expect(groups!.groups.every((group) => group.members.length === 4)).toBe(true)

    expect(roundOf32).toMatchObject({ inputCount: 32, outputCount: 16 })
    expect(roundOf32!.matches).toHaveLength(16)
    expect(roundOf16).toMatchObject({ inputCount: 16, outputCount: 8 })
    expect(roundOf16!.matches).toHaveLength(8)
    expect(final).toMatchObject({ inputCount: 8, outputCount: 1 })
  })

  it('richiede almeno due elementi, una fase e un partecipante', () => {
    const plan = canonicalPlan()
    plan.elements = [element(1)]
    plan.phases = []
    plan.activeParticipants = 0

    const result = validatePlan(plan)
    expect(codes(result.errors)).toEqual(
      expect.arrayContaining(['elements_min', 'phases_min', 'participants_min']),
    )
    expect(result.valid).toBe(false)
  })

  it('rifiuta posizioni non contigue', () => {
    const plan = canonicalPlan()
    plan.phases[1]!.position = 5
    plan.phases[2]!.position = 6

    expect(codes(validatePlan(plan).errors)).toContain('phase_positions')
  })

  it('rifiuta una fase successiva che riceve meno di due elementi', () => {
    const plan = canonicalPlan()
    plan.elements = Array.from({ length: 4 }, (_, index) => element(index + 1))
    plan.phases = [
      rankingPhase({
        position: 1,
        name: 'Prima classifica',
        advance: { type: 'top_global', n: 1 },
      }),
      rankingPhase({ position: 2, name: 'Finale' }),
    ]

    const result = validatePlan(plan)
    expect(codes(result.errors)).toContain('phase_input_too_small')
    expect(result.errors.some((error) => error.code === 'phase_input_too_small' && error.phase === 2)).toBe(true)
  })

  it('rifiuta winner su una fase non finale e l ultima fase che qualifica N>1', () => {
    const plan = canonicalPlan()
    plan.phases[1]!.advance = { type: 'winner' }
    const nonFinal = validatePlan(plan)
    expect(codes(nonFinal.errors)).toContain('winner_not_last')
    expect(nonFinal.errors.some((error) => error.code === 'winner_not_last' && error.phase === 2)).toBe(true)

    const finalPlan = canonicalPlan()
    finalPlan.phases[3]!.advance = { type: 'all' }
    const last = validatePlan(finalPlan)
    expect(codes(last.errors)).toContain('final_qualifies_multiple')
    expect(last.errors.some((error) => error.code === 'final_qualifies_multiple' && error.phase === 4)).toBe(true)
  })

  it('rifiuta dimensioni di girone e avanzamento top_per_group non validi', () => {
    const plan = canonicalPlan()
    plan.phases[0]!.config.groups = groupConfig({ size: 1 })
    expect(codes(validatePlan(plan).errors)).toContain('group_size')

    const advancePlan = canonicalPlan()
    advancePlan.phases[0]!.advance = { type: 'top_per_group', n: 4 }
    expect(codes(validatePlan(advancePlan).errors)).toContain('top_per_group_over_size')
  })

  it('rifiuta top_global oltre gli elementi in ingresso', () => {
    const plan = canonicalPlan()
    plan.phases[0] = rankingPhase({
      position: 1,
      name: 'Classifica iniziale',
      voteType: 'pick',
      advance: { type: 'top_global', n: 60 },
    })
    plan.phases = plan.phases.slice(0, 2)
    plan.phases[1]!.position = 2

    expect(codes(validatePlan(plan).errors)).toContain('top_global_over_input')
  })

  it('rifiuta scale punti non decrescenti, non positive o troppo lunghe', () => {
    const plan = canonicalPlan()
    plan.phases[3] = rankingPhase({
      position: 4,
      name: 'Finale ranking',
      voteType: 'ranking',
      config: config({ ranking: { points: [3, 2, 2], minSelections: 1 } }),
      advance: { type: 'top_global', n: 1 },
    })
    const result = validatePlan(plan)
    expect(codes(result.errors)).toContain('ranking_scale_invalid')

    const tooLong = canonicalPlan()
    tooLong.phases[3] = rankingPhase({
      position: 4,
      name: 'Finale ranking',
      voteType: 'ranking',
      config: config({ ranking: { points: [3, 2, 1], minSelections: 1 } }),
      advance: { type: 'winner' },
    })
    tooLong.elements = tooLong.elements.slice(0, 2)
    tooLong.phases = tooLong.phases.slice(3)
    tooLong.phases[0]!.position = 1
    expect(codes(validatePlan(tooLong).errors)).toContain('ranking_scale_invalid')
  })

  it('rifiuta crediti non validi', () => {
    const plan = canonicalPlan()
    plan.phases[0]!.config.credits = { perVoter: 5, maxPerMatch: 6 }
    expect(codes(validatePlan(plan).errors)).toContain('credits_invalid')

    const negative = canonicalPlan()
    negative.phases[0]!.config.credits = { perVoter: -1, maxPerMatch: null }
    expect(codes(validatePlan(negative).errors)).toContain('credits_invalid')
  })

  it('rifiuta il trigger deadline senza deadline', () => {
    const plan = canonicalPlan()
    plan.phases[0]!.config.closeTriggers = ['deadline']
    expect(codes(validatePlan(plan).errors)).toContain('deadline_trigger_without_deadline')
  })

  it('rifiuta ripescaggi non coerenti con qualificati ed elementi', () => {
    const notAbove = canonicalPlan()
    notAbove.phases[0]!.advance = {
      type: 'top_per_group',
      n: 2,
      repechage: { targetSize: 20, criteria: ['group_points'] },
    }
    expect(codes(validatePlan(notAbove).errors)).toContain('repechage_target_not_above_direct')

    const overInput = canonicalPlan()
    overInput.phases[0]!.advance = {
      type: 'top_per_group',
      n: 2,
      repechage: { targetSize: 50, criteria: ['group_points'] },
    }
    expect(codes(validatePlan(overInput).errors)).toContain('repechage_target_over_input')
  })

  it('rifiuta criteri di ripescaggio non applicabili alla fase precedente', () => {
    const plan = canonicalPlan()
    plan.phases[0]!.advance = {
      type: 'top_per_group',
      n: 2,
      repechage: { targetSize: 32, criteria: ['weight_difference'] },
    }
    const result = validatePlan(plan)
    expect(codes(result.errors)).toContain('repechage_criterion_unavailable')
    expect(result.errors.some((error) => error.code === 'repechage_criterion_unavailable' && error.phase === 1)).toBe(true)
  })

  it('rifiuta avanzamento diverso da winners in una eliminazione non finale', () => {
    const plan = canonicalPlan()
    const advance: PhaseAdvance = { type: 'all' }
    plan.phases[1]!.advance = advance
    expect(codes(validatePlan(plan).errors)).toContain('elimination_advance_invalid')

    const finalPlan = canonicalPlan()
    finalPlan.phases = [
      eliminationPhase({ position: 1, name: 'Finale', advance: { type: 'winners' } }),
    ]
    finalPlan.elements = finalPlan.elements.slice(0, 2)
    expect(codes(validatePlan(finalPlan).errors)).toContain('elimination_advance_invalid')
  })

  it('rifiuta elementi e campi personalizzati non validi', () => {
    const plan = canonicalPlan()
    plan.fields = [{ key: 'genere', type: 'text' }]
    plan.elements[0] = {
      ...element(1),
      name: '   ',
      imageUrl: '',
      customValues: { genere: 'pop', sconosciuto: 'x' },
    }

    const result = validatePlan(plan)
    expect(codes(result.errors)).toEqual(
      expect.arrayContaining(['element_name_missing', 'element_image_missing', 'element_unknown_field']),
    )
    expect(result.errors.some((error) => error.elementId === 'e1')).toBe(true)

    const tooManyFields = canonicalPlan()
    tooManyFields.fields = Array.from({ length: 11 }, (_, index) => ({
      key: `campo${index}`,
      type: 'text' as const,
    }))
    expect(codes(validatePlan(tooManyFields).errors)).toContain('fields_too_many')
  })

  it('rifiuta nome e slug del torneo mancanti', () => {
    const plan = canonicalPlan()
    plan.tournament = { name: '  ', slug: '', settings: { autoAdvance: false } }
    expect(codes(validatePlan(plan).errors)).toEqual(
      expect.arrayContaining(['tournament_name_missing', 'tournament_slug_missing']),
    )
  })

  it('rifiuta più di 20 partecipanti attivi', () => {
    const plan = canonicalPlan()
    plan.activeParticipants = 21
    expect(codes(validatePlan(plan).errors)).toContain('participants_max')
  })

  it('mostra gironi pieni, bye e accoppiamenti nell anteprima', () => {
    const plan: PlanInput = {
      tournament: { name: 'Bye', slug: 'bye', settings: { autoAdvance: false } },
      elements: Array.from({ length: 38 }, (_, index) => element(index + 1)),
      fields: [],
      activeParticipants: 2,
      phases: [
        groupPhase({
          config: config({ groups: groupConfig({ remainder: 'byes' }) }),
          advance: { type: 'top_per_group', n: 2 },
        }),
      ],
    }
    const groupPreview = validatePlan(plan).preview.phases[0]!
    expect(groupPreview.groups).toHaveLength(9)
    expect(groupPreview.groups.every((group) => group.members.length === 4)).toBe(true)
    expect(groupPreview.byes.map((ref) => ref.id)).toEqual(['e37', 'e38'])
    expect(groupPreview.qualified.direct).toBe(20)

    const elimination: PlanInput = {
      tournament: { name: 'Bracket', slug: 'bracket', settings: { autoAdvance: false } },
      elements: Array.from({ length: 12 }, (_, index) => element(index + 1)),
      fields: [],
      activeParticipants: 2,
      phases: [eliminationPhase({ position: 1, name: 'Sedicesimi' })],
    }
    const bracket = validatePlan(elimination).preview.phases[0]!
    expect(bracket.matches).toHaveLength(8)
    expect(bracket.matches.filter((match) => match.bye)).toHaveLength(4)
    expect(bracket.byes.map((ref) => ref.id)).toEqual(['e1', 'e2', 'e3', 'e4'])
    expect(bracket.outputCount).toBe(8)
  })

  it('con autoAdvance segnala deadline non successive e già passate senza bloccare', () => {
    const plan = canonicalPlan()
    plan.tournament.settings.autoAdvance = true
    plan.now = new Date('2026-11-10T12:00:00.000Z')
    plan.phases[0]!.config.deadline = '2026-11-12T20:00:00.000Z'
    plan.phases[0]!.config.closeTriggers = ['deadline']
    plan.phases[1]!.config.deadline = '2026-11-11T20:00:00.000Z'
    plan.phases[1]!.config.closeTriggers = ['deadline']
    plan.phases[2]!.config.deadline = '2026-11-01T20:00:00.000Z'
    plan.phases[2]!.config.closeTriggers = ['deadline']

    const result = validatePlan(plan)
    expect(result.valid).toBe(true)
    expect(codes(result.warnings)).toEqual(
      expect.arrayContaining(['deadline_not_after_previous', 'deadline_in_past']),
    )
    expect(result.warnings.some((warning) => warning.code === 'deadline_not_after_previous' && warning.phase === 2)).toBe(true)
    expect(result.warnings.some((warning) => warning.code === 'deadline_in_past' && warning.phase === 3)).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('senza autoAdvance non produce warning sulle deadline', () => {
    const plan = canonicalPlan()
    plan.now = new Date('2026-11-10T12:00:00.000Z')
    plan.phases[0]!.config.deadline = '2026-11-01T20:00:00.000Z'
    plan.phases[0]!.config.closeTriggers = ['deadline']
    expect(validatePlan(plan).warnings).toEqual([])
  })
})
