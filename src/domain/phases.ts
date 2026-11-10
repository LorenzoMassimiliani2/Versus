export type PhaseFormula = 'group' | 'elimination' | 'ranking'
export type PhaseVoteType = 'duel' | 'ranking' | 'pick'
export type PhaseStatus = 'pending' | 'open' | 'awaiting_resolution' | 'closed' | 'cancelled'
export type CloseTrigger = 'all_voted' | 'deadline'
export type Secrecy = 'live' | 'blind' | 'secret'
export type VotingMode = 'simultaneous' | 'sequential'
export type GroupAssignment = 'random' | 'snake' | 'manual'
export type GroupRemainder = 'smaller_groups' | 'byes'
export type EliminationSeeding = 'ranking' | 'random' | 'manual'
export type RepechageCriterion =
  | 'group_points'
  | 'first_preferences'
  | 'weight_difference'
  | 'draw'

export interface GroupPhaseConfig {
  size: number
  assignment: GroupAssignment
  remainder: GroupRemainder
  points: number[]
  standings: { win: number; draw: number; loss: number }
}

export interface RankingPhaseConfig {
  points: number[]
  minSelections: number
}

export interface EliminationPhaseConfig {
  seeding: EliminationSeeding
  thirdPlaceMatch: boolean
}

export interface PhaseConfig {
  deadline: string | null
  closeTriggers: CloseTrigger[]
  secrecy: Secrecy
  votingMode: VotingMode
  credits: { perVoter: number; maxPerMatch: number | null }
  groups?: GroupPhaseConfig
  ranking?: RankingPhaseConfig
  elimination?: EliminationPhaseConfig
}

export interface RepechageRule {
  targetSize: number
  criteria: RepechageCriterion[]
}

export type PhaseAdvance =
  | { type: 'all' }
  | { type: 'winners' }
  | { type: 'top_global'; n: number; repechage?: RepechageRule }
  | { type: 'top_per_group'; n: number; repechage?: RepechageRule }
  | { type: 'winner' }

export interface Phase {
  position: number
  name: string
  formula: PhaseFormula
  voteType: PhaseVoteType
  config: PhaseConfig
  advance: PhaseAdvance
}

/** Fase in ingresso alle API, senza la posizione assegnata dal server. */
export type PhaseDraft = Omit<Phase, 'position'>

export type PhaseValidationError = 'invalid_request' | 'invalid_phase'
export type PhaseValidation =
  | { ok: true; phase: PhaseDraft }
  | { ok: false; error: PhaseValidationError }

export const PHASE_FORMULAS: readonly PhaseFormula[] = ['group', 'elimination', 'ranking']
export const PHASE_VOTE_TYPES: readonly PhaseVoteType[] = ['duel', 'ranking', 'pick']
export const CLOSE_TRIGGERS: readonly CloseTrigger[] = ['all_voted', 'deadline']
export const SECRECY_MODES: readonly Secrecy[] = ['live', 'blind', 'secret']
export const VOTING_MODES: readonly VotingMode[] = ['simultaneous', 'sequential']
export const GROUP_ASSIGNMENTS: readonly GroupAssignment[] = ['random', 'snake', 'manual']
export const GROUP_REMAINDERS: readonly GroupRemainder[] = ['smaller_groups', 'byes']
export const ELIMINATION_SEEDINGS: readonly EliminationSeeding[] = ['ranking', 'random', 'manual']
export const REPECHAGE_CRITERIA: readonly RepechageCriterion[] = [
  'group_points',
  'first_preferences',
  'weight_difference',
  'draw',
]

/** Schede ammesse per formula, come da tabella della spec. */
export const VOTE_TYPES_BY_FORMULA: Record<PhaseFormula, readonly PhaseVoteType[]> = {
  group: ['ranking', 'duel'],
  elimination: ['duel'],
  ranking: ['ranking', 'pick'],
}

/** Regole di avanzamento ammesse per formula, come da tabella della spec. */
export const ADVANCE_TYPES_BY_FORMULA: Record<
  PhaseFormula,
  readonly PhaseAdvance['type'][]
> = {
  group: ['top_per_group', 'all'],
  elimination: ['winners', 'winner'],
  ranking: ['top_global', 'all', 'winner'],
}

export function allowedVoteTypes(formula: PhaseFormula): readonly PhaseVoteType[] {
  return VOTE_TYPES_BY_FORMULA[formula]
}

export function allowedAdvanceTypes(formula: PhaseFormula): readonly PhaseAdvance['type'][] {
  return ADVANCE_TYPES_BY_FORMULA[formula]
}

export function defaultPhaseConfig(): PhaseConfig {
  return {
    deadline: null,
    closeTriggers: [],
    secrecy: 'live',
    votingMode: 'simultaneous',
    credits: { perVoter: 0, maxPerMatch: null },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readFormula(value: unknown): PhaseFormula | null {
  return PHASE_FORMULAS.includes(value as PhaseFormula) ? (value as PhaseFormula) : null
}

function readVoteType(value: unknown): PhaseVoteType | null {
  return PHASE_VOTE_TYPES.includes(value as PhaseVoteType) ? (value as PhaseVoteType) : null
}

function readName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim()
  return name && name.length <= 120 ? name : null
}

function readNumberArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null
  return value.every((item) => typeof item === 'number' && Number.isFinite(item))
    ? [...value]
    : null
}

function readPositiveInteger(value: unknown, minimum = 1): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum ? value : null
}

function readConfig(raw: unknown): PhaseConfig | null {
  if (raw === undefined) return defaultPhaseConfig()
  if (!isRecord(raw)) return null

  const config = defaultPhaseConfig()

  if (raw.deadline !== undefined && raw.deadline !== null) {
    if (typeof raw.deadline !== 'string' || Number.isNaN(Date.parse(raw.deadline))) return null
    config.deadline = raw.deadline
  }

  if (raw.closeTriggers !== undefined) {
    if (
      !Array.isArray(raw.closeTriggers) ||
      raw.closeTriggers.some((trigger) => !CLOSE_TRIGGERS.includes(trigger as CloseTrigger))
    ) {
      return null
    }
    config.closeTriggers = [...(raw.closeTriggers as CloseTrigger[])]
  }

  if (raw.secrecy !== undefined) {
    if (!SECRECY_MODES.includes(raw.secrecy as Secrecy)) return null
    config.secrecy = raw.secrecy as Secrecy
  }

  if (raw.votingMode !== undefined) {
    if (!VOTING_MODES.includes(raw.votingMode as VotingMode)) return null
    config.votingMode = raw.votingMode as VotingMode
  }

  if (raw.credits !== undefined) {
    if (!isRecord(raw.credits)) return null
    const perVoter = readPositiveInteger(raw.credits.perVoter, 0)
    if (perVoter === null) return null
    const maxPerMatch = raw.credits.maxPerMatch
    if (maxPerMatch !== null && maxPerMatch !== undefined) {
      const max = readPositiveInteger(maxPerMatch)
      if (max === null) return null
      config.credits = { perVoter, maxPerMatch: max }
    } else {
      config.credits = { perVoter, maxPerMatch: null }
    }
  }

  if (raw.groups !== undefined) {
    if (!isRecord(raw.groups)) return null
    const size = raw.groups.size === undefined ? 4 : readPositiveInteger(raw.groups.size, 2)
    if (size === null) return null
    const assignment = raw.groups.assignment ?? 'random'
    if (!GROUP_ASSIGNMENTS.includes(assignment as GroupAssignment)) return null
    const remainder = raw.groups.remainder ?? 'smaller_groups'
    if (!GROUP_REMAINDERS.includes(remainder as GroupRemainder)) return null
    const points = raw.groups.points === undefined ? [3, 2, 1] : readNumberArray(raw.groups.points)
    if (!points) return null
    let standings = { win: 3, draw: 1, loss: 0 }
    if (raw.groups.standings !== undefined) {
      if (!isRecord(raw.groups.standings)) return null
      const { win, draw, loss } = raw.groups.standings
      if (
        typeof win !== 'number' ||
        typeof draw !== 'number' ||
        typeof loss !== 'number'
      ) {
        return null
      }
      standings = { win, draw, loss }
    }
    config.groups = {
      size,
      assignment: assignment as GroupAssignment,
      remainder: remainder as GroupRemainder,
      points,
      standings,
    }
  }

  if (raw.ranking !== undefined) {
    if (!isRecord(raw.ranking)) return null
    const points =
      raw.ranking.points === undefined
        ? [12, 10, 8, 6, 4, 2, 1]
        : readNumberArray(raw.ranking.points)
    if (!points) return null
    const minSelections =
      raw.ranking.minSelections === undefined
        ? 1
        : readPositiveInteger(raw.ranking.minSelections)
    if (minSelections === null) return null
    config.ranking = { points, minSelections }
  }

  if (raw.elimination !== undefined) {
    if (!isRecord(raw.elimination)) return null
    const seeding = raw.elimination.seeding ?? 'ranking'
    if (!ELIMINATION_SEEDINGS.includes(seeding as EliminationSeeding)) return null
    if (
      raw.elimination.thirdPlaceMatch !== undefined &&
      typeof raw.elimination.thirdPlaceMatch !== 'boolean'
    ) {
      return null
    }
    config.elimination = {
      seeding: seeding as EliminationSeeding,
      thirdPlaceMatch: raw.elimination.thirdPlaceMatch === true,
    }
  }

  return config
}

function readRepechage(raw: unknown): RepechageRule | null | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!isRecord(raw)) return null
  const targetSize = readPositiveInteger(raw.targetSize)
  if (targetSize === null) return null
  if (
    !Array.isArray(raw.criteria) ||
    raw.criteria.length === 0 ||
    raw.criteria.some(
      (criterion) => !REPECHAGE_CRITERIA.includes(criterion as RepechageCriterion),
    )
  ) {
    return null
  }
  return {
    targetSize,
    criteria: [...(raw.criteria as RepechageCriterion[])],
  }
}

function readAdvance(raw: unknown, formula: PhaseFormula): PhaseAdvance | null {
  if (!isRecord(raw) || typeof raw.type !== 'string') return null
  const type = raw.type as PhaseAdvance['type']
  if (!(ADVANCE_TYPES_BY_FORMULA[formula] as readonly string[]).includes(type)) return null

  if (type === 'top_global' || type === 'top_per_group') {
    const n = readPositiveInteger(raw.n)
    if (n === null) return null
    const repechage = readRepechage(raw.repechage)
    if (repechage === null) return null
    return repechage ? { type, n, repechage } : { type, n }
  }

  // `all`, `winners` e `winner` non portano altri parametri.
  return { type } as PhaseAdvance
}

function checkPairAndAdvance(
  formula: PhaseFormula,
  voteType: PhaseVoteType,
  advance: PhaseAdvance,
): boolean {
  return (
    VOTE_TYPES_BY_FORMULA[formula].includes(voteType) &&
    ADVANCE_TYPES_BY_FORMULA[formula].includes(advance.type)
  )
}

/** Valida la creazione di una fase. La posizione la assegna il server. */
export function validatePhaseCreate(raw: unknown): PhaseValidation {
  if (!isRecord(raw)) return { ok: false, error: 'invalid_request' }

  const name = readName(raw.name)
  if (!name) return { ok: false, error: 'invalid_request' }
  if (raw.formula === undefined || raw.voteType === undefined || raw.advance === undefined) {
    return { ok: false, error: 'invalid_request' }
  }

  const formula = readFormula(raw.formula)
  const voteType = readVoteType(raw.voteType)
  if (!formula || !voteType) return { ok: false, error: 'invalid_phase' }

  const config = readConfig(raw.config)
  if (!config) return { ok: false, error: 'invalid_phase' }

  const advance = readAdvance(raw.advance, formula)
  if (!advance) return { ok: false, error: 'invalid_phase' }

  if (!checkPairAndAdvance(formula, voteType, advance)) {
    return { ok: false, error: 'invalid_phase' }
  }

  return { ok: true, phase: { name, formula, voteType, config, advance } }
}

/** Valida una modifica parziale applicata alla fase corrente. */
export function validatePhasePatch(raw: unknown, current: PhaseDraft): PhaseValidation {
  if (!isRecord(raw)) return { ok: false, error: 'invalid_request' }

  let name = current.name
  if (raw.name !== undefined) {
    const read = readName(raw.name)
    if (!read) return { ok: false, error: 'invalid_request' }
    name = read
  }

  let formula = current.formula
  if (raw.formula !== undefined) {
    const read = readFormula(raw.formula)
    if (!read) return { ok: false, error: 'invalid_phase' }
    formula = read
  }

  let voteType = current.voteType
  if (raw.voteType !== undefined) {
    const read = readVoteType(raw.voteType)
    if (!read) return { ok: false, error: 'invalid_phase' }
    voteType = read
  }

  let config = current.config
  if (raw.config !== undefined) {
    const read = readConfig(raw.config)
    if (!read) return { ok: false, error: 'invalid_phase' }
    config = read
  }

  let advance = current.advance
  if (raw.advance !== undefined) {
    const read = readAdvance(raw.advance, formula)
    if (!read) return { ok: false, error: 'invalid_phase' }
    advance = read
  }

  if (
    raw.name === undefined &&
    raw.formula === undefined &&
    raw.voteType === undefined &&
    raw.config === undefined &&
    raw.advance === undefined
  ) {
    return { ok: false, error: 'invalid_request' }
  }

  if (!checkPairAndAdvance(formula, voteType, advance)) {
    return { ok: false, error: 'invalid_phase' }
  }

  return { ok: true, phase: { name, formula, voteType, config, advance } }
}
