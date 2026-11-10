import type { ElementRecord } from './db/elements'
import { listElements } from './db/elements'
import { uuidv7 } from './db/ids'
import {
  deletePhaseOperationStatements,
  findLatestPhaseResult,
  findPhaseByPosition,
  listActiveParticipantIds,
  listGroupMembers,
  listPhaseEntrants,
  listPhaseGroups,
  listPhaseMatches,
  phaseOperationStatements,
  type NewGroup,
  type NewMatch,
} from './db/phase-operation'
import { findPhaseById, type PhaseRecord } from './db/phases'
import { insertPhaseTargetStatements } from './db/phase-targets'
import { findTournamentById } from './db/tournaments'
import { matchTargetId, sequentialTargetSpecs } from './phase-targets'
import { applyAdvance, type AdvanceMatch } from '../domain/advance'
import { applyRepechage } from '../domain/repechage'
import { repechageCandidatesFromResults } from '../domain/phase-results'
import { planOpening } from '../domain/phase-opening'
import { defaultPhaseConfig, type PhaseAdvance, type PhaseConfig } from '../domain/phases'
import { parseTournamentSettings } from '../domain/tournament-settings'

export interface ResultsPayload {
  qualified?: string[]
  groups?: Array<{
    groupId?: string
    ranking?: Array<{ elementId?: string; score?: number; firstPreferences?: number }>
  }>
  matches?: Array<{
    sideA?: { elementId?: string; weight?: number }
    sideB?: { elementId?: string; weight?: number }
    winnerElementId?: string
  }>
  repechage?: { enabled?: boolean; selected?: string[]; criteria?: string[] }
  winnerElementId?: string | null
}

export interface PhaseEntry {
  id: string
  name: string
}

export interface RepechagePreview {
  targetSize: number
  slots: number
  selected: PhaseEntry[]
  excluded: PhaseEntry[]
}

export interface EntrantsPreview {
  entrants: PhaseEntry[]
  directQualified: PhaseEntry[]
  repechage: RepechagePreview | null
}

export type EntrantsFailure = {
  ok: false
  error: 'previous_phase_not_closed' | 'previous_results_missing' | 'previous_repechage_unavailable'
}

export type EntrantsResult = { ok: true; value: EntrantsPreview } | EntrantsFailure

export interface SerialisedOperation {
  entrants: Array<{ elementId: string; name: string; seed: number; position: number }>
  voters: Array<{ userId: string; creditsBudget: number }>
  groups: Array<{ id: string; name: string; position: number; members: Array<{ elementId: string; position: number }> }>
  matches: Array<{
    id: string
    groupId: string | null
    round: number
    position: number
    sideA: string | null
    sideB: string | null
    winnerElementId: string | null
    status: string
  }>
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function phaseConfig(phase: PhaseRecord): PhaseConfig {
  return parseJson<PhaseConfig>(phase.config, defaultPhaseConfig())
}

export function phaseAdvance(phase: PhaseRecord): PhaseAdvance {
  return parseJson<PhaseAdvance>(phase.advance, { type: 'all' })
}

function advanceMatches(matches: Awaited<ReturnType<typeof listPhaseMatches>>): AdvanceMatch[] {
  return matches.map((match) => ({
    sideA: match.element_a_id,
    sideB: match.element_b_id,
    winnerElementId: match.winner_element_id,
    bye: match.status === 'bye',
  }))
}

function deriveDirectQualified(
  previous: PhaseRecord,
  entrantIds: string[],
  matches: Awaited<ReturnType<typeof listPhaseMatches>>,
  results: ResultsPayload | null,
): string[] | null {
  if (Array.isArray(results?.qualified)) {
    const known = new Set(entrantIds)
    if (results.qualified.every((id) => typeof id === 'string' && known.has(id))) {
      return [...results.qualified]
    }
  }

  const advance = phaseAdvance(previous)
  if (advance.type === 'all') return [...entrantIds]
  if (advance.type === 'winners' || advance.type === 'winner') {
    const applied = applyAdvance({ advance, matches: advanceMatches(matches) })
    return applied.ok ? applied.qualified : null
  }
  return null
}

/** Elementi in ingresso calcolati da avanzamento e ripescaggio della fase precedente. */
export async function computeEntrants(env: Env, phase: PhaseRecord): Promise<EntrantsResult> {
  const elements = await listElements(env, phase.tournament_id)
  const nameOf = new Map(elements.map((element) => [element.id, element.name]))
  const entry = (id: string): PhaseEntry => ({
    id,
    name: nameOf.get(id) ?? id,
  })

  if (phase.position === 1) {
    const entrants = elements.map((element) => element.id)
    return {
      ok: true,
      value: { entrants: entrants.map(entry), directQualified: entrants.map(entry), repechage: null },
    }
  }

  const previous = await findPhaseByPosition(env, phase.tournament_id, phase.position - 1)
  if (!previous || previous.status !== 'closed') {
    return { ok: false, error: 'previous_phase_not_closed' }
  }

  const [previousEntrants, matches, resultRow] = await Promise.all([
    listPhaseEntrants(env, previous.id),
    listPhaseMatches(env, previous.id),
    findLatestPhaseResult(env, previous.id),
  ])
  const results = resultRow ? parseJson<ResultsPayload>(resultRow.results, {}) : null
  const entrantIds = previousEntrants.map((row) => row.element_id)

  const direct = deriveDirectQualified(previous, entrantIds, matches, results)
  if (!direct) return { ok: false, error: 'previous_results_missing' }

  const advance = phaseAdvance(previous)
  const rule = 'repechage' in advance ? advance.repechage : undefined
  if (!rule) {
    return {
      ok: true,
      value: {
        entrants: direct.map(entry),
        directQualified: direct.map(entry),
        repechage: null,
      },
    }
  }

  const directSet = new Set(direct)
  const excluded = entrantIds.filter((id) => !directSet.has(id))
  const slots = Math.max(0, rule.targetSize - direct.length)

  let selected: string[] | null = null
  if (Array.isArray(results?.repechage?.selected)) {
    selected = results.repechage.selected.filter((id) => excluded.includes(id))
  }
  if (!selected) {
    const selection = applyRepechage({
      excluded: repechageCandidatesFromResults(excluded, results),
      directQualified: direct.length,
      targetSize: rule.targetSize,
      criteria: rule.criteria,
      hasDuels: previous.vote_type === 'duel',
    })
    if (!selection.ok) return { ok: false, error: 'previous_repechage_unavailable' }
    selected = selection.selected
  } else if (selected.length < slots) {
    return { ok: false, error: 'previous_repechage_unavailable' }
  }

  const chosen = selected.slice(0, slots)
  const entrants = [...direct, ...chosen]

  return {
    ok: true,
    value: {
      entrants: entrants.map(entry),
      directQualified: direct.map(entry),
      repechage: {
        targetSize: rule.targetSize,
        slots,
        selected: chosen.map(entry),
        excluded: excluded.map(entry),
      },
    },
  }
}

function validateOverride(
  override: string[] | undefined,
  preview: EntrantsPreview,
): string | null | undefined {
  if (override === undefined) return undefined
  const repechage = preview.repechage
  if (!repechage) return override.length === 0 ? null : 'invalid_repechage_override'
  if (override.length !== repechage.slots) return 'invalid_repechage_override'
  const allowed = new Set(repechage.excluded.map((entry) => entry.id))
  if (new Set(override).size !== override.length) return 'invalid_repechage_override'
  if (override.some((id) => !allowed.has(id))) return 'invalid_repechage_override'
  return null
}

async function loadOperation(env: Env, phaseId: string): Promise<SerialisedOperation> {
  const [entrants, voters, groups, members, matches] = await Promise.all([
    listPhaseEntrants(env, phaseId),
    env.DB.prepare(
      'SELECT phase_id, user_id, credits_budget FROM phase_voters WHERE phase_id = ? ORDER BY user_id',
    )
      .bind(phaseId)
      .all<{ user_id: string; credits_budget: number }>()
      .then((result) => result.results),
    listPhaseGroups(env, phaseId),
    listGroupMembers(env, phaseId),
    listPhaseMatches(env, phaseId),
  ])

  return {
    entrants: entrants.map((row) => ({
      elementId: row.element_id,
      name: row.element_name,
      seed: row.seed,
      position: row.position,
    })),
    voters: voters.map((row) => ({ userId: row.user_id, creditsBudget: row.credits_budget })),
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      position: group.position,
      members: members
        .filter((member) => member.group_id === group.id)
        .map((member) => ({ elementId: member.element_id, position: member.position })),
    })),
    matches: matches.map((match) => ({
      id: match.id,
      groupId: match.group_id,
      round: match.round,
      position: match.position,
      sideA: match.element_a_id,
      sideB: match.element_b_id,
      winnerElementId: match.winner_element_id,
      status: match.status,
    })),
  }
}

export interface OpenPhaseOptions {
  override?: string[]
  seedingOrder?: string[]
  /** Attore che ha richiesto l'apertura; `null` per l'avanzamento automatico. */
  actorId?: string | null
  now: number
}

export type OpenPhaseResult =
  | { ok: true; phase: PhaseRecord; operation: SerialisedOperation }
  | { ok: false; status: number; error: string }

/**
 * Apre una fase `pending` con gli elementi calcolati da avanzamento e
 * ripescaggio. Il claim condizionale su `status = 'pending'` rende l'operazione
 * idempotente: due richieste concorrenti non creano due stati operativi.
 */
export async function openPendingPhase(
  env: Env,
  phase: PhaseRecord,
  options: OpenPhaseOptions,
): Promise<OpenPhaseResult> {
  if (phase.status !== 'pending') return { ok: false, status: 409, error: 'phase_not_pending' }

  const tournament = await findTournamentById(env, phase.tournament_id)
  if (!tournament) return { ok: false, status: 404, error: 'not_found' }
  if (tournament.status !== 'published' && tournament.status !== 'running') {
    return { ok: false, status: 409, error: 'tournament_not_openable' }
  }

  // Con avanzamento automatico il ripescaggio usa i criteri automatici.
  if (options.override !== undefined && parseTournamentSettings(tournament.settings).autoAdvance) {
    return { ok: false, status: 422, error: 'repechage_override_unavailable' }
  }

  const preview = await computeEntrants(env, phase)
  if (!preview.ok) return { ok: false, status: 409, error: preview.error }

  const overrideError = validateOverride(options.override, preview.value)
  if (overrideError) return { ok: false, status: 422, error: overrideError }

  const selected =
    options.override ?? preview.value.repechage?.selected.map((entry) => entry.id) ?? []
  const direct = preview.value.directQualified.map((entry) => entry.id)
  const entrantIds = [...direct, ...selected]

  const elements = await listElements(env, phase.tournament_id)
  const byId = new Map(elements.map((element) => [element.id, element]))
  const ordered: ElementRecord[] = []
  for (const id of entrantIds) {
    const element = byId.get(id)
    if (!element) return { ok: false, status: 409, error: 'previous_results_missing' }
    ordered.push(element)
  }

  const config = phaseConfig(phase)
  const sequential = config.votingMode === 'sequential'
  const plan = planOpening(
    ordered,
    {
      formula: phase.formula,
      voteType: phase.vote_type,
      config,
      advance: phaseAdvance(phase),
    },
    { seedingOrder: options.seedingOrder },
  )
  if (!plan.ok) return { ok: false, status: 422, error: plan.error }

  const timestamp = new Date(options.now).toISOString()
  const voterIds = await listActiveParticipantIds(env, phase.tournament_id)

  const groupIds = plan.groups.map(() => uuidv7(options.now))
  const groups: NewGroup[] = plan.groups.map((group) => ({
    id: groupIds[group.position - 1]!,
    name: group.name,
    position: group.position,
    memberIds: group.memberIds,
  }))

  const matchIds = plan.matches.map((_, index) => uuidv7(options.now + index))
  const targets = sequential
    ? sequentialTargetSpecs({
        phase: { id: phase.id, name: phase.name, formula: phase.formula },
        groups,
        matches: plan.matches.map((match, index) => ({
          id: matchIds[index]!,
          groupId: match.groupIndex === null ? null : groups[match.groupIndex]!.id,
          round: match.round,
          position: match.position,
          status: match.status,
          elementAId: match.elementAId,
          elementBId: match.elementBId,
        })),
        elementNames: new Map(elements.map((element) => [element.id, element.name])),
      })
    : []
  const firstTargetId = targets[0]?.targetId ?? null

  const matches: NewMatch[] = plan.matches.map((match, index) => {
    const groupId = match.groupIndex === null ? null : groups[match.groupIndex]!.id
    const matchId = matchIds[index]!
    let status: NewMatch['status'] = match.status
    if (status !== 'bye' && sequential) {
      const targetId = matchTargetId(
        { id: phase.id, formula: phase.formula },
        { id: matchId, groupId },
      )
      status = targetId === firstTargetId ? 'open' : 'pending'
    }
    return {
      id: matchId,
      groupId,
      round: match.round,
      position: match.position,
      elementAId: match.elementAId,
      elementBId: match.elementBId,
      winnerElementId: match.winnerElementId,
      status,
      closedAt: match.status === 'bye' ? timestamp : null,
    }
  })

  const targetStatements = sequential
    ? insertPhaseTargetStatements(
        env,
        phase.id,
        targets.map((target, index) => ({
          targetId: target.targetId,
          name: target.name,
          position: index + 1,
          status: index === 0 ? 'open' : 'pending',
          openedAt: index === 0 ? timestamp : null,
        })),
      )
    : []

  const claim = await env.DB.prepare(
    `UPDATE phases SET status = 'open', opened_at = ?, updated_at = ?
     WHERE id = ? AND status = 'pending'`,
  )
    .bind(timestamp, timestamp, phase.id)
    .run()
  if (claim.meta.changes === 0) return { ok: false, status: 409, error: 'phase_not_pending' }

  const statements = [
    ...phaseOperationStatements(env, {
      phaseId: phase.id,
      entrantIds: plan.entrantIds,
      voterIds,
      creditsBudget: config.credits.perVoter,
      groups,
      matches,
    }),
    ...targetStatements,
    env.DB.prepare(
      `UPDATE tournaments SET status = 'running', started_at = COALESCE(started_at, ?), updated_at = ?
       WHERE id = ? AND status IN ('published','running')`,
    ).bind(timestamp, timestamp, phase.tournament_id),
  ]

  if (options.override !== undefined && options.actorId) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO audit_log (id, tournament_id, actor_id, action, target_type, target_id,
           before, after, created_at)
         VALUES (?, ?, ?, 'phase.repechage_override', 'phase', ?, ?, ?, ?)`,
      ).bind(
        uuidv7(options.now),
        phase.tournament_id,
        options.actorId,
        phase.id,
        JSON.stringify(preview.value.repechage?.selected.map((entry) => entry.id) ?? []),
        JSON.stringify(options.override),
        timestamp,
      ),
    )
  }

  try {
    await env.DB.batch(statements)
  } catch {
    await env.DB.batch([
      ...deletePhaseOperationStatements(env, phase.id),
      env.DB.prepare(
        `UPDATE phases SET status = 'pending', opened_at = NULL WHERE id = ? AND status = 'open'`,
      ).bind(phase.id),
      env.DB.prepare(
        `UPDATE tournaments SET status = 'published', started_at = NULL, updated_at = ?
         WHERE id = ? AND status = 'running' AND started_at = ?
           AND NOT EXISTS (
             SELECT 1 FROM phases WHERE tournament_id = ? AND status IN ('open','closed','awaiting_resolution') AND id <> ?
           )`,
      ).bind(timestamp, phase.tournament_id, timestamp, phase.tournament_id, phase.id),
    ])
    return { ok: false, status: 500, error: 'internal_error' }
  }

  const updated = await findPhaseById(env, phase.id)
  if (!updated) return { ok: false, status: 500, error: 'internal_error' }
  return { ok: true, phase: updated, operation: await loadOperation(env, phase.id) }
}
