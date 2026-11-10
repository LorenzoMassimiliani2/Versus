
import {
  ADVANCE_TYPES_BY_FORMULA,
  VOTE_TYPES_BY_FORMULA,
  type GroupPhaseConfig,
  type PhaseAdvance,
  type PhaseConfig,
  type PhaseFormula,
  type PhaseVoteType,
  type RankingPhaseConfig,
} from './phases'
import { buildBracket } from './bracket'
import { validateCustomValues, type CustomFieldDefinition } from './custom-values'
import { groupCountFor, layoutGroups } from './groups'

export interface PlanElementInput {
  id: string
  name: string
  imageUrl: string
  customValues: Record<string, unknown>
  position: number
}

export interface PlanPhaseInput {
  position: number
  name: string
  formula: PhaseFormula
  voteType: PhaseVoteType
  config: PhaseConfig
  advance: PhaseAdvance
}

export interface PlanInput {
  tournament: { name: string; slug: string; settings: { autoAdvance: boolean } }
  elements: PlanElementInput[]
  fields: CustomFieldDefinition[]
  phases: PlanPhaseInput[]
  activeParticipants: number
  now?: Date
}

export interface PlanIssue {
  code: string
  phase?: number
  phaseName?: string
  elementId?: string
}

export interface PlanElementRef {
  id: string
  name: string
}

export interface PlanGroupPreview {
  name: string
  members: PlanElementRef[]
}

export interface PlanMatchPreview {
  a: PlanElementRef | null
  b: PlanElementRef | null
  bye: boolean
}

export interface PlanRepechagePreview {
  targetSize: number
  excluded: number
  selected: number
}

export interface PlanQualifiedPreview {
  direct: number
  repechage: number
  total: number
}

export interface PlanPhasePreview {
  position: number
  name: string
  formula: PhaseFormula
  voteType: PhaseVoteType
  inputCount: number
  outputCount: number
  groups: PlanGroupPreview[]
  byes: PlanElementRef[]
  matches: PlanMatchPreview[]
  qualified: PlanQualifiedPreview
  repechage: PlanRepechagePreview | null
}

export interface PlanPreview {
  elementCount: number
  activeParticipants: number
  phases: PlanPhasePreview[]
}

export interface PlanValidation {
  valid: boolean
  errors: PlanIssue[]
  warnings: PlanIssue[]
  preview: PlanPreview
}

const PARTICIPANT_LIMIT = 20
const FIELD_LIMIT = 10

const DEFAULT_GROUP_CONFIG: GroupPhaseConfig = {
  size: 4,
  assignment: 'random',
  remainder: 'smaller_groups',
  points: [3, 2, 1],
  standings: { win: 3, draw: 1, loss: 0 },
}

const DEFAULT_RANKING_CONFIG: RankingPhaseConfig = {
  points: [12, 10, 8, 6, 4, 2, 1],
  minSelections: 1,
}

function placeholder(prefix: string, count: number, scope: string): PlanElementRef[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => ({
    id: `preview-${scope}-${index + 1}`,
    name: `${prefix} ${index + 1}`,
  }))
}

function deadlineMillis(deadline: string | null): number | null {
  if (!deadline) return null
  const parsed = Date.parse(deadline)
  return Number.isNaN(parsed) ? null : parsed
}

interface RepechageOutcome {
  preview: PlanRepechagePreview | null
  selected: number
  outputCount: number
}

function applyRepechage(
  advance: { repechage?: { targetSize: number; criteria: string[] } },
  direct: number,
  inputCount: number,
  phase: PlanPhaseInput,
  errors: PlanIssue[],
): RepechageOutcome {
  const rule = advance.repechage
  if (!rule) return { preview: null, selected: 0, outputCount: direct }

  const excluded = Math.max(0, inputCount - direct)
  const selected = Math.max(0, rule.targetSize - direct)

  if (rule.targetSize <= direct) {
    errors.push({ code: 'repechage_target_not_above_direct', phase: phase.position, phaseName: phase.name })
  }
  if (rule.targetSize > inputCount) {
    errors.push({ code: 'repechage_target_over_input', phase: phase.position, phaseName: phase.name })
  }
  if (selected > excluded) {
    errors.push({ code: 'repechage_not_enough_excluded', phase: phase.position, phaseName: phase.name })
  }
  for (const criterion of rule.criteria) {
    if (criterion === 'weight_difference' && phase.voteType !== 'duel') {
      errors.push({
        code: 'repechage_criterion_unavailable',
        phase: phase.position,
        phaseName: phase.name,
      })
    }
    if (criterion === 'group_points' && phase.formula !== 'group') {
      errors.push({
        code: 'repechage_criterion_unavailable',
        phase: phase.position,
        phaseName: phase.name,
      })
    }
    if (criterion === 'first_preferences' && phase.voteType !== 'ranking') {
      errors.push({
        code: 'repechage_criterion_unavailable',
        phase: phase.position,
        phaseName: phase.name,
      })
    }
  }

  return {
    preview: { targetSize: rule.targetSize, excluded, selected },
    selected,
    outputCount: direct + Math.min(selected, excluded),
  }
}

/**
 * Applica le regole 1-15 della spec e calcola l'anteprima della struttura.
 * Funzione pura: non accede a D1, HTTP o `window`. Gli errori sono bloccanti,
 * i warning no. Ogni errore di fase riporta posizione e nome.
 */
export function validatePlan(input: PlanInput): PlanValidation {
  const errors: PlanIssue[] = []
  const warnings: PlanIssue[] = []

  const elements = [...input.elements].sort((a, b) => a.position - b.position)
  const phases = [...input.phases].sort((a, b) => a.position - b.position)
  const now = input.now ?? new Date()

  if (input.tournament.name.trim() === '') errors.push({ code: 'tournament_name_missing' })
  if (input.tournament.slug.trim() === '') errors.push({ code: 'tournament_slug_missing' })
  if (elements.length < 2) errors.push({ code: 'elements_min' })
  if (phases.length < 1) errors.push({ code: 'phases_min' })
  if (input.activeParticipants < 1) errors.push({ code: 'participants_min' })
  if (input.activeParticipants > PARTICIPANT_LIMIT) errors.push({ code: 'participants_max' })
  if (input.fields.length > FIELD_LIMIT) errors.push({ code: 'fields_too_many' })

  if (phases.some((phase, index) => phase.position !== index + 1)) {
    errors.push({ code: 'phase_positions' })
  }

  for (const element of elements) {
    if (element.name.trim() === '') {
      errors.push({ code: 'element_name_missing', elementId: element.id })
    }
    if (element.imageUrl.trim() === '') {
      errors.push({ code: 'element_image_missing', elementId: element.id })
    }
    const values = validateCustomValues(input.fields, element.customValues ?? {})
    if (!values.ok) {
      errors.push({
        code: values.error === 'unknown_field' ? 'element_unknown_field' : 'element_values_invalid',
        elementId: element.id,
      })
    }
  }

  let current: PlanElementRef[] = elements.map((element) => ({
    id: element.id,
    name: element.name,
  }))
  const previews: PlanPhasePreview[] = []

  for (const [index, phase] of phases.entries()) {
    const last = index === phases.length - 1
    const inputCount = current.length
    const advance = phase.advance
    const config = phase.config
    const phaseIssue = (code: string) =>
      errors.push({ code, phase: phase.position, phaseName: phase.name })

    if (index > 0 && inputCount < 2) phaseIssue('phase_input_too_small')
    if (!VOTE_TYPES_BY_FORMULA[phase.formula]?.includes(phase.voteType)) {
      phaseIssue('vote_type_not_allowed')
    }
    if (!ADVANCE_TYPES_BY_FORMULA[phase.formula]?.includes(advance.type)) {
      phaseIssue('advance_type_not_allowed')
    }
    if (advance.type === 'winner' && !last) phaseIssue('winner_not_last')

    if (config.credits.perVoter < 0) phaseIssue('credits_invalid')
    if (
      config.credits.maxPerMatch !== null &&
      (config.credits.maxPerMatch < 1 || config.credits.maxPerMatch > config.credits.perVoter)
    ) {
      phaseIssue('credits_invalid')
    }
    if (config.closeTriggers.includes('deadline') && !config.deadline) {
      phaseIssue('deadline_trigger_without_deadline')
    }

    let groups: PlanGroupPreview[] = []
    let byes: PlanElementRef[] = []
    let matches: PlanMatchPreview[] = []
    let direct = 0
    let repechage: PlanRepechagePreview | null = null
    let selected = 0
    let outputCount = inputCount
    let output: PlanElementRef[] = []

    if (phase.formula === 'group') {
      const groupConfig = config.groups ?? DEFAULT_GROUP_CONFIG
      const size = Number.isInteger(groupConfig.size) && groupConfig.size >= 2 ? groupConfig.size : 0
      if (size === 0) phaseIssue('group_size')
      const effectiveSize = size || 2
      const remainder = groupConfig.remainder ?? 'smaller_groups'
      const groupCount = groupCountFor(inputCount, effectiveSize, remainder)
      if (groupCount < 1) phaseIssue('group_empty')

      const built = layoutGroups(
        current,
        effectiveSize,
        remainder,
        groupConfig.assignment === 'snake' ? 'snake' : 'sequential',
      )
      groups = built.groups
      byes = built.byes

      if (advance.type === 'top_per_group') {
        if (advance.n >= effectiveSize) phaseIssue('top_per_group_over_size')
        direct = advance.n * groupCount + byes.length
        const outcome = applyRepechage(
          advance,
          direct,
          inputCount,
          phase,
          errors,
        )
        repechage = outcome.preview
        selected = outcome.selected
        outputCount = outcome.outputCount
        output = [
          ...placeholder('Qualificato', advance.n * groupCount, `p${phase.position}`),
          ...byes,
          ...placeholder('Ripescato', selected, `r${phase.position}`),
        ]
      } else if (advance.type === 'all') {
        direct = inputCount
        outputCount = inputCount
        output = [...current]
      } else {
        direct = inputCount
        outputCount = inputCount
        output = [...current]
      }
    } else if (phase.formula === 'elimination') {
      const bracket = buildBracket(current, { seeding: 'ranking' })
      matches = bracket.ok ? bracket.matches : []
      byes = bracket.ok ? bracket.byes : []
      const matchCount = bracket.ok ? bracket.bracketSize / 2 : 0

      if (advance.type === 'winner') {
        outputCount = 1
      } else {
        outputCount = matchCount
      }
      if (last && advance.type !== 'winner') phaseIssue('elimination_advance_invalid')
      if (!last && advance.type !== 'winners') phaseIssue('elimination_advance_invalid')

      direct = outputCount
      output = placeholder(last ? 'Vincitore' : 'Vincente', outputCount, `e${phase.position}`)
    } else {
      const rankingConfig = config.ranking ?? DEFAULT_RANKING_CONFIG
      if (phase.voteType === 'ranking') {
        const points = rankingConfig.points
        const decreasing = points.every(
          (point, pointIndex) => pointIndex === 0 || points[pointIndex - 1]! > point,
        )
        if (
          points.length === 0 ||
          points.length > inputCount ||
          points.some((point) => !Number.isFinite(point) || point <= 0) ||
          !decreasing
        ) {
          phaseIssue('ranking_scale_invalid')
        }
      }

      if (advance.type === 'top_global') {
        if (advance.n > inputCount) phaseIssue('top_global_over_input')
        direct = advance.n
        const outcome = applyRepechage(
          advance,
          direct,
          inputCount,
          phase,
          errors,
        )
        repechage = outcome.preview
        selected = outcome.selected
        outputCount = outcome.outputCount
        output = [
          ...placeholder('Qualificato', advance.n, `p${phase.position}`),
          ...placeholder('Ripescato', selected, `r${phase.position}`),
        ]
      } else if (advance.type === 'all') {
        direct = inputCount
        outputCount = inputCount
        output = [...current]
      } else if (advance.type === 'winner') {
        direct = 1
        outputCount = 1
        output = placeholder('Vincitore', 1, `w${phase.position}`)
      } else {
        direct = inputCount
        outputCount = inputCount
        output = [...current]
      }
    }

    if (last && outputCount !== 1) phaseIssue('final_qualifies_multiple')
    if (!last && outputCount < 2) phaseIssue('phase_qualifies_too_few')

    previews.push({
      position: phase.position,
      name: phase.name,
      formula: phase.formula,
      voteType: phase.voteType,
      inputCount,
      outputCount,
      groups,
      byes,
      matches,
      qualified: { direct, repechage: selected, total: outputCount },
      repechage,
    })

    current = output.slice(0, Math.max(0, outputCount))
  }

  if (input.tournament.settings.autoAdvance) {
    let previousDeadline: number | null = null
    for (const phase of phases) {
      const deadline = deadlineMillis(phase.config.deadline)
      if (deadline === null) continue
      if (deadline < now.getTime()) {
        warnings.push({ code: 'deadline_in_past', phase: phase.position, phaseName: phase.name })
      }
      if (previousDeadline !== null && deadline <= previousDeadline) {
        warnings.push({
          code: 'deadline_not_after_previous',
          phase: phase.position,
          phaseName: phase.name,
        })
      }
      previousDeadline = deadline
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    preview: {
      elementCount: elements.length,
      activeParticipants: input.activeParticipants,
      phases: previews,
    },
  }
}
