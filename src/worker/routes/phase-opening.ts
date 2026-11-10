import type { AuthContext } from '../auth/session'
import type { ElementRecord } from '../db/elements'
import { listElements } from '../db/elements'
import { uuidv7 } from '../db/ids'
import { findOrganizerRole, findTournamentById } from '../db/tournaments'
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
} from '../db/phase-operation'
import { findPhaseById, type PhaseRecord } from '../db/phases'
import { apiError, json } from '../http/json'
import { applyAdvance, type AdvanceMatch } from '../../domain/advance'
import { applyRepechage, type RepechageCandidate } from '../../domain/repechage'
import { planOpening } from '../../domain/phase-opening'
import { defaultPhaseConfig, type PhaseAdvance, type PhaseConfig } from '../../domain/phases'
import { serialisePhase } from './phases'

interface ResultsPayload {
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

interface PhaseEntry {
  id: string
  name: string
}

interface RepechagePreview {
  targetSize: number
  slots: number
  selected: PhaseEntry[]
  excluded: PhaseEntry[]
}

interface EntrantsPreview {
  entrants: PhaseEntry[]
  directQualified: PhaseEntry[]
  repechage: RepechagePreview | null
}

type PreviewFailure = {
  ok: false
  error: 'previous_phase_not_closed' | 'previous_results_missing' | 'previous_repechage_unavailable'
}

type PreviewResult = { ok: true; value: EntrantsPreview } | PreviewFailure

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function phaseConfig(phase: PhaseRecord): PhaseConfig {
  return parseJson<PhaseConfig>(phase.config, defaultPhaseConfig())
}

function phaseAdvance(phase: PhaseRecord): PhaseAdvance {
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

function candidatesFromResults(
  excluded: string[],
  results: ResultsPayload | null,
): RepechageCandidate[] {
  const byId = new Map<string, RepechageCandidate>(
    excluded.map((elementId) => [elementId, { elementId }]),
  )

  for (const group of results?.groups ?? []) {
    for (const row of group.ranking ?? []) {
      const candidate = row.elementId ? byId.get(row.elementId) : undefined
      if (!candidate) continue
      if (typeof row.score === 'number') candidate.groupPoints = row.score
      if (typeof row.firstPreferences === 'number') {
        candidate.firstPreferences = row.firstPreferences
      }
    }
  }

  for (const match of results?.matches ?? []) {
    const sideA = match.sideA
    const sideB = match.sideB
    const weightA = typeof sideA?.weight === 'number' ? sideA.weight : 0
    const weightB = typeof sideB?.weight === 'number' ? sideB.weight : 0
    if (sideA?.elementId && byId.has(sideA.elementId)) {
      const candidate = byId.get(sideA.elementId)!
      candidate.weightDifference = (candidate.weightDifference ?? 0) + weightA - weightB
    }
    if (sideB?.elementId && byId.has(sideB.elementId)) {
      const candidate = byId.get(sideB.elementId)!
      candidate.weightDifference = (candidate.weightDifference ?? 0) + weightB - weightA
    }
  }

  return excluded.map((elementId) => byId.get(elementId)!)
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

async function computeEntrants(
  env: Env,
  phase: PhaseRecord,
): Promise<PreviewResult> {
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
      excluded: candidatesFromResults(excluded, results),
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

function readBody(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return {}
  if (typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readStringArray(value: unknown): string[] | null | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return null
  return [...(value as string[])]
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

interface SerialisedOperation {
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

async function findPhaseForOrganizer(
  env: Env,
  auth: AuthContext,
  phaseId: string,
): Promise<{ phase: PhaseRecord; tournamentStatus: string } | Response> {
  const phase = await findPhaseById(env, phaseId)
  if (!phase) return apiError(404, 'not_found')
  if (!(await findOrganizerRole(env, phase.tournament_id, auth.user.id))) {
    return apiError(403, 'forbidden')
  }
  const tournament = await findTournamentById(env, phase.tournament_id)
  if (!tournament) return apiError(404, 'not_found')
  return { phase, tournamentStatus: tournament.status }
}

function previewBody(preview: EntrantsPreview): Record<string, unknown> {
  return {
    entrants: preview.entrants.map((entry) => ({ id: entry.id, name: entry.name })),
    directQualified: preview.directQualified.map((entry) => ({ id: entry.id, name: entry.name })),
    repechage: preview.repechage
      ? {
          targetSize: preview.repechage.targetSize,
          slots: preview.repechage.slots,
          selected: preview.repechage.selected.map((entry) => ({ id: entry.id, name: entry.name })),
          excluded: preview.repechage.excluded.map((entry) => ({ id: entry.id, name: entry.name })),
        }
      : null,
  }
}

async function previewOpeningHandler(
  env: Env,
  auth: AuthContext,
  phaseId: string,
): Promise<Response> {
  const context = await findPhaseForOrganizer(env, auth, phaseId)
  if (context instanceof Response) return context

  if (context.phase.status !== 'pending') return apiError(409, 'phase_not_pending')
  if (context.tournamentStatus !== 'published' && context.tournamentStatus !== 'running') {
    return apiError(409, 'tournament_not_openable')
  }

  const preview = await computeEntrants(env, context.phase)
  if (!preview.ok) return apiError(409, preview.error)
  return json(previewBody(preview.value))
}

async function openPhaseHandler(
  request: Request,
  env: Env,
  auth: AuthContext,
  phaseId: string,
  now: number,
): Promise<Response> {
  const context = await findPhaseForOrganizer(env, auth, phaseId)
  if (context instanceof Response) return context
  const { phase, tournamentStatus } = context

  if (phase.status !== 'pending') return apiError(409, 'phase_not_pending')
  if (tournamentStatus !== 'published' && tournamentStatus !== 'running') {
    return apiError(409, 'tournament_not_openable')
  }

  let rawBody: unknown = {}
  try {
    const text = await request.text()
    rawBody = text ? JSON.parse(text) : {}
  } catch {
    return apiError(400, 'invalid_request')
  }
  const body = readBody(rawBody)
  if (!body) return apiError(400, 'invalid_request')

  const override = readStringArray(body.repechageOverride)
  const seedingOrder = readStringArray(body.seedingOrder)
  if (override === null || seedingOrder === null) return apiError(400, 'invalid_request')

  const preview = await computeEntrants(env, phase)
  if (!preview.ok) return apiError(409, preview.error)

  const overrideError = validateOverride(override, preview.value)
  if (overrideError) return apiError(422, overrideError)

  const selected = override ?? preview.value.repechage?.selected.map((entry) => entry.id) ?? []
  const direct = preview.value.directQualified.map((entry) => entry.id)
  const entrantIds = [...direct, ...selected]

  const elements = await listElements(env, phase.tournament_id)
  const byId = new Map(elements.map((element) => [element.id, element]))
  const ordered: ElementRecord[] = []
  for (const id of entrantIds) {
    const element = byId.get(id)
    if (!element) return apiError(409, 'previous_results_missing')
    ordered.push(element)
  }

  const plan = planOpening(ordered, {
    formula: phase.formula,
    voteType: phase.vote_type,
    config: phaseConfig(phase),
    advance: phaseAdvance(phase),
  }, { seedingOrder })
  if (!plan.ok) return apiError(422, plan.error)

  const timestamp = new Date(now).toISOString()
  const voterIds = await listActiveParticipantIds(env, phase.tournament_id)
  const creditsBudget = phaseConfig(phase).credits.perVoter

  const groupIds = plan.groups.map(() => uuidv7(now))
  const groups: NewGroup[] = plan.groups.map((group) => ({
    id: groupIds[group.position - 1]!,
    name: group.name,
    position: group.position,
    memberIds: group.memberIds,
  }))

  const matches: NewMatch[] = plan.matches.map((match) => ({
    id: uuidv7(now),
    groupId: match.groupIndex === null ? null : groupIds[match.groupIndex]!,
    round: match.round,
    position: match.position,
    elementAId: match.elementAId,
    elementBId: match.elementBId,
    winnerElementId: match.winnerElementId,
    status: match.status,
    closedAt: match.status === 'bye' ? timestamp : null,
  }))

  const claim = await env.DB.prepare(
    `UPDATE phases SET status = 'open', opened_at = ?, updated_at = ?
     WHERE id = ? AND status = 'pending'`,
  )
    .bind(timestamp, timestamp, phase.id)
    .run()
  if (claim.meta.changes === 0) return apiError(409, 'phase_not_pending')

  const statements = [
    ...phaseOperationStatements(env, {
      phaseId: phase.id,
      entrantIds: plan.entrantIds,
      voterIds,
      creditsBudget,
      groups,
      matches,
    }),
    env.DB.prepare(
      `UPDATE tournaments SET status = 'running', started_at = COALESCE(started_at, ?), updated_at = ?
       WHERE id = ? AND status IN ('published','running')`,
    ).bind(timestamp, timestamp, phase.tournament_id),
  ]

  if (override !== undefined) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO audit_log (id, tournament_id, actor_id, action, target_type, target_id,
           before, after, created_at)
         VALUES (?, ?, ?, 'phase.repechage_override', 'phase', ?, ?, ?, ?)`,
      ).bind(
        uuidv7(now),
        phase.tournament_id,
        auth.user.id,
        phase.id,
        JSON.stringify(preview.value.repechage?.selected.map((entry) => entry.id) ?? []),
        JSON.stringify(override),
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
    return apiError(500, 'internal_error')
  }

  const updated = await findPhaseById(env, phase.id)
  if (!updated) return apiError(500, 'internal_error')
  return json({
    phase: serialisePhase(updated),
    operation: await loadOperation(env, phase.id),
  })
}

/** Instrada `/api/phases/:id/open` e `/api/phases/:id/open-preview`. */
export async function handlePhaseOpeningRoute(
  request: Request,
  env: Env,
  auth: AuthContext,
  now = Date.now(),
): Promise<Response | null> {
  const { pathname } = new URL(request.url)
  const method = request.method

  const previewMatch = pathname.match(/^\/api\/phases\/([^/]+)\/open-preview$/)
  if (previewMatch && method === 'GET') {
    return previewOpeningHandler(env, auth, decodeURIComponent(previewMatch[1]!))
  }

  const openMatch = pathname.match(/^\/api\/phases\/([^/]+)\/open$/)
  if (openMatch && method === 'POST') {
    return openPhaseHandler(request, env, auth, decodeURIComponent(openMatch[1]!), now)
  }

  return null
}
