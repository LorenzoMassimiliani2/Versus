import { applyAdvance, type AdvanceMatch, type ApplyAdvanceOptions } from './advance'
import { tallyDuel, type DuelVote } from './duel'
import { tallyPick, type PickVote } from './pick'
import { tallyRanking, type RankingAssignment, type RankingVote } from './ranking'
import { applyRepechage, type RepechageCandidate } from './repechage'
import { computeStandings, type StandingsMatch } from './standings'
import type { PhaseAdvance, PhaseConfig, PhaseFormula, PhaseVoteType } from './phases'
import type { ResolutionOrder, UnresolvedTarget } from './phase-resolution'

/** Fase in ingresso al calcolo dei risultati. */
export interface ResultsPhase {
  id: string
  formula: PhaseFormula
  voteType: PhaseVoteType
  config: PhaseConfig
  advance: PhaseAdvance
}

export interface ResultsEntrant {
  elementId: string
}

export interface ResultsGroup {
  id: string
  position: number
  memberIds: string[]
}

export interface ResultsMatch {
  id: string
  groupId: string | null
  round: number
  position: number
  elementAId: string | null
  elementBId: string | null
  winnerElementId: string | null
  status: 'pending' | 'open' | 'closed' | 'bye'
}

export interface ResultsDuelVote {
  matchId: string
  side: 'a' | 'b' | 'abstain'
  credits: number
}

export interface ResultsBallotVote {
  targetId: string
  kind: 'ranking' | 'pick'
  payload: string
}

export interface ComputeResultsInput {
  phase: ResultsPhase
  entrants: ResultsEntrant[]
  groups: ResultsGroup[]
  matches: ResultsMatch[]
  duelVotes: ResultsDuelVote[]
  ballotVotes: ResultsBallotVote[]
  /** Ordini scelti dall'organizzatore per i target ancora ambigui. */
  resolutions?: readonly ResolutionOrder[]
}

export interface ResultsRankingRow {
  elementId: string
  score: number
  firstPreferences: number
  picks?: number
  position: number
  tieBreak: string | null
}

export interface ResultsGroupPayload {
  groupId: string
  ranking: ResultsRankingRow[]
}

export interface ResultsMatchSide {
  elementId: string | null
  weight: number
  credits: number
  voters: number
}

export interface ResultsMatchPayload {
  matchId: string
  sideA: ResultsMatchSide
  sideB: ResultsMatchSide
  winnerElementId: string | null
  resolvedBy: string | null
}

export interface ResultsRepechagePayload {
  enabled: boolean
  selected: string[]
  criteria: string[]
}

export interface ResultsPayload {
  phaseId: string
  groups: ResultsGroupPayload[]
  matches: ResultsMatchPayload[]
  ranking: ResultsRankingRow[]
  qualified: string[]
  repechage: ResultsRepechagePayload | null
  winnerElementId: string | null
}

export type ComputeResultsError = 'repechage_unavailable'

export interface ComputeResultsSuccess {
  ok: true
  results: ResultsPayload
  /** Gruppi di elementi ancora a pari merito dopo i criteri automatici. */
  unresolved: string[][]
  /** Gli stessi gruppi con il target che li contiene. */
  unresolvedTargets: UnresolvedTarget[]
  /** Vero quando un pareggio incide su una posizione che conta per l'avanzamento. */
  requiresManualResolution: boolean
}

export type ComputeResultsResult = ComputeResultsSuccess | { ok: false; error: ComputeResultsError }

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function rankingAssignments(payload: string): RankingAssignment[] {
  const raw = parseJson<unknown>(payload, null)
  if (typeof raw !== 'object' || raw === null) return []
  const assignments = (raw as { assignments?: unknown }).assignments
  if (!Array.isArray(assignments)) return []
  return assignments.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return []
    const { elementId, points } = entry as { elementId?: unknown; points?: unknown }
    if (typeof elementId !== 'string' || typeof points !== 'number') return []
    return [{ elementId, points }]
  })
}

function pickElement(payload: string): string | null {
  const raw = parseJson<unknown>(payload, null)
  if (typeof raw !== 'object' || raw === null) return null
  const elementId = (raw as { elementId?: unknown }).elementId
  return typeof elementId === 'string' ? elementId : null
}

function rankingVotes(
  ballots: readonly ResultsBallotVote[],
  targetId: string,
  allowed: ReadonlySet<string>,
): RankingVote[] {
  return ballots
    .filter((ballot) => ballot.targetId === targetId && ballot.kind === 'ranking')
    .map((ballot) => ({
      assignments: rankingAssignments(ballot.payload).filter((assignment) =>
        allowed.has(assignment.elementId),
      ),
    }))
}

function pickVotes(
  ballots: readonly ResultsBallotVote[],
  targetId: string,
  allowed: ReadonlySet<string>,
): PickVote[] {
  return ballots
    .filter((ballot) => ballot.targetId === targetId && ballot.kind === 'pick')
    .flatMap((ballot) => {
      const elementId = pickElement(ballot.payload)
      return elementId && allowed.has(elementId) ? [{ elementId }] : []
    })
}

function cutoffType(advance: PhaseAdvance): number | null {
  switch (advance.type) {
    case 'top_global':
    case 'top_per_group':
      return advance.n
    case 'winner':
      return 1
    case 'all':
    case 'winners':
      return null
  }
}

function tieCrossesCutoff(
  tied: readonly string[],
  rows: readonly ResultsRankingRow[],
  cutoff: number | null,
): boolean {
  if (cutoff === null) return false
  const positions = new Map(rows.map((row) => [row.elementId, row.position]))
  return tied.some((elementId) => (positions.get(elementId) ?? Number.POSITIVE_INFINITY) <= cutoff)
}

function duelResult(
  match: ResultsMatch,
  votes: readonly DuelVote[],
  manualWinner: 'a' | 'b' | null,
): { payload: ResultsMatchPayload; unresolved: boolean } {
  const sideA = match.elementAId ?? null
  const sideB = match.elementBId ?? null

  if (match.status === 'bye' || sideB === null) {
    return {
      payload: {
        matchId: match.id,
        sideA: { elementId: sideA, weight: 0, credits: 0, voters: 0 },
        sideB: { elementId: sideB, weight: 0, credits: 0, voters: 0 },
        winnerElementId: match.winnerElementId ?? sideA,
        resolvedBy: 'bye',
      },
      unresolved: false,
    }
  }

  const tally = tallyDuel({
    sideA: sideA ?? '',
    sideB,
    votes,
    criteria: ['credits', 'voters'],
    manualWinner,
  })

  return {
    payload: {
      matchId: match.id,
      sideA: {
        elementId: sideA,
        weight: tally.sideA.weight,
        credits: tally.sideA.credits,
        voters: tally.sideA.voters,
      },
      sideB: {
        elementId: sideB,
        weight: tally.sideB.weight,
        credits: tally.sideB.credits,
        voters: tally.sideB.voters,
      },
      winnerElementId: tally.winnerElementId,
      resolvedBy: tally.resolvedBy,
    },
    unresolved: tally.unresolved,
  }
}

function scoringPoints(config: PhaseConfig): { win: number; draw: number; loss: number } {
  return config.groups?.standings ?? { win: 3, draw: 1, loss: 0 }
}

function scalePoints(config: PhaseConfig): number[] {
  return config.ranking?.points ?? [12, 10, 8, 6, 4, 2, 1]
}

function groupResults(
  input: ComputeResultsInput,
  group: ResultsGroup,
  matchPayloadById: ReadonlyMap<string, ResultsMatchPayload>,
  unresolved: string[][],
  unresolvedTargets: UnresolvedTarget[],
  manualOrder: readonly string[] | undefined,
): { payload: ResultsGroupPayload; requiresManualResolution: boolean } {
  const members = new Set(group.memberIds)
  const matches = input.matches.filter((match) => match.groupId === group.id)
  const cutoff = cutoffType(input.phase.advance)

  if (input.phase.voteType === 'duel') {
    const standingsMatches: StandingsMatch[] = []
    let matchRequiresResolution = false

    for (const match of matches) {
      const payload = matchPayloadById.get(match.id)
      if (!payload) continue
      if (payload.winnerElementId === null) matchRequiresResolution = true
      const winner =
        payload.winnerElementId === null
          ? 'draw'
          : payload.winnerElementId === match.elementAId
            ? 'a'
            : 'b'
      standingsMatches.push({
        a: match.elementAId ?? '',
        b: match.elementBId ?? '',
        winner,
        weightA: payload.sideA.weight,
        weightB: payload.sideB.weight,
        creditsA: payload.sideA.credits,
        creditsB: payload.sideB.credits,
      })
    }

    const standings = computeStandings(standingsMatches, {
      elementIds: [...members],
      points: scoringPoints(input.phase.config),
      manualOrder,
    })
    const rows: ResultsRankingRow[] = standings.rows.map((row) => ({
      elementId: row.elementId,
      score: row.points,
      firstPreferences: 0,
      position: row.position,
      tieBreak: null,
    }))

    const tied = standings.unresolved.filter((groupIds) =>
      tieCrossesCutoff(groupIds, rows, cutoff),
    )
    unresolved.push(...tied)
    for (const elementIds of tied) {
      unresolvedTargets.push({ targetId: group.id, elementIds })
    }

    return {
      payload: { groupId: group.id, ranking: rows },
      requiresManualResolution: matchRequiresResolution || tied.length > 0,
    }
  }

  const votes = rankingVotes(input.ballotVotes, group.id, members)
  const standings = tallyRanking(votes, {
    scale: scalePoints(input.phase.config),
    elementIds: [...members],
    manualOrder,
  })
  const rows: ResultsRankingRow[] = standings.rows.map((row) => ({
    elementId: row.elementId,
    score: row.points,
    firstPreferences: row.firstPreferences,
    position: row.position,
    tieBreak: null,
  }))
  const tied = standings.unresolved.filter((groupIds) => tieCrossesCutoff(groupIds, rows, cutoff))
  unresolved.push(...tied)
  for (const elementIds of tied) {
    unresolvedTargets.push({ targetId: group.id, elementIds })
  }

  return {
    payload: { groupId: group.id, ranking: rows },
    requiresManualResolution: tied.length > 0,
  }
}

function rankingResults(
  input: ComputeResultsInput,
  unresolved: string[][],
  unresolvedTargets: UnresolvedTarget[],
  manualOrder: readonly string[] | undefined,
): { rows: ResultsRankingRow[]; requiresManualResolution: boolean } {
  const members = new Set(input.entrants.map((entrant) => entrant.elementId))
  const cutoff = cutoffType(input.phase.advance)

  if (input.phase.voteType === 'pick') {
    const votes = pickVotes(input.ballotVotes, input.phase.id, members)
    const standings = tallyPick(votes, { elementIds: [...members], manualOrder })
    const rows: ResultsRankingRow[] = standings.rows.map((row) => ({
      elementId: row.elementId,
      score: row.picks,
      firstPreferences: 0,
      picks: row.picks,
      position: row.position,
      tieBreak: null,
    }))
    const tied = standings.unresolved.filter((groupIds) => tieCrossesCutoff(groupIds, rows, cutoff))
    unresolved.push(...tied)
    for (const elementIds of tied) {
      unresolvedTargets.push({ targetId: input.phase.id, elementIds })
    }
    return { rows, requiresManualResolution: tied.length > 0 }
  }

  const votes = rankingVotes(input.ballotVotes, input.phase.id, members)
  const standings = tallyRanking(votes, {
    scale: scalePoints(input.phase.config),
    elementIds: [...members],
    manualOrder,
  })
  const rows: ResultsRankingRow[] = standings.rows.map((row) => ({
    elementId: row.elementId,
    score: row.points,
    firstPreferences: row.firstPreferences,
    position: row.position,
    tieBreak: null,
  }))
  const tied = standings.unresolved.filter((groupIds) => tieCrossesCutoff(groupIds, rows, cutoff))
  unresolved.push(...tied)
  for (const elementIds of tied) {
    unresolvedTargets.push({ targetId: input.phase.id, elementIds })
  }
  return { rows, requiresManualResolution: tied.length > 0 }
}

/** Sorgente parziale dei risultati, tollerante a payload storici o parziali. */
export interface RepechageResultSource {
  groups?: ReadonlyArray<{
    ranking?: ReadonlyArray<{
      elementId?: string
      score?: number
      firstPreferences?: number
    }>
  }>
  matches?: ReadonlyArray<{
    sideA?: { elementId?: string | null; weight?: number }
    sideB?: { elementId?: string | null; weight?: number }
  }>
}

/** Candidate al ripescaggio ricavati dal payload dei risultati. */
export function repechageCandidatesFromResults(
  excluded: readonly string[],
  results: RepechageResultSource | null,
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

function manualDuelWinner(
  match: ResultsMatch,
  ordering: readonly string[] | undefined,
): 'a' | 'b' | null {
  if (!ordering || ordering.length === 0) return null
  const first = ordering[0]
  if (first === match.elementAId) return 'a'
  if (first === match.elementBId) return 'b'
  return null
}

function matchPayloads(
  input: ComputeResultsInput,
  unresolved: string[][],
  unresolvedTargets: UnresolvedTarget[],
  manualOrderFor: (targetId: string) => readonly string[] | undefined,
): { matches: ResultsMatchPayload[]; requiresManualResolution: boolean } {
  const matches: ResultsMatchPayload[] = []
  let requiresManualResolution = false

  for (const match of input.matches) {
    const votes = input.duelVotes
      .filter((vote) => vote.matchId === match.id)
      .map((vote): DuelVote => ({ side: vote.side, credits: vote.credits }))
    const result = duelResult(match, votes, manualDuelWinner(match, manualOrderFor(match.id)))
    matches.push(result.payload)
    if (result.unresolved) {
      requiresManualResolution = true
      const elementIds = [match.elementAId, match.elementBId].filter(
        (id): id is string => id !== null,
      )
      unresolved.push(elementIds)
      unresolvedTargets.push({ targetId: match.id, elementIds })
    }
  }

  return { matches, requiresManualResolution }
}

function advanceMatches(matches: readonly ResultsMatchPayload[]): AdvanceMatch[] {
  return matches.map((match) => ({
    sideA: match.sideA.elementId,
    sideB: match.sideB.elementId,
    winnerElementId: match.winnerElementId,
    bye: match.resolvedBy === 'bye',
  }))
}

/**
 * Calcola i risultati di una fase chiusa riusando tally, classifiche, avanzamento
 * e ripescaggio. Funzione pura: non accede a D1, HTTP o UI.
 *
 * `requiresManualResolution` è vero quando un pareggio incide su una posizione
 * che conta per l'avanzamento; in quel caso la fase va in `awaiting_resolution`
 * e non produce snapshot.
 */
export function computePhaseResults(input: ComputeResultsInput): ComputeResultsResult {
  const unresolved: string[][] = []
  const unresolvedTargets: UnresolvedTarget[] = []
  const groupPayloads: ResultsGroupPayload[] = []
  let groupRequiresResolution = false

  const ordersByTarget = new Map(
    (input.resolutions ?? []).map((resolution) => [resolution.targetId, resolution.ordering]),
  )
  const manualOrderFor = (targetId: string): readonly string[] | undefined =>
    ordersByTarget.get(targetId)

  const isElimination = input.phase.formula === 'elimination'
  const isRanking = input.phase.formula === 'ranking'

  const matchesComputed =
    input.phase.voteType === 'duel'
      ? matchPayloads(input, unresolved, unresolvedTargets, manualOrderFor)
      : { matches: [], requiresManualResolution: false }
  const matchPayloadById = new Map(
    matchesComputed.matches.map((match) => [match.matchId, match]),
  )

  for (const group of input.groups) {
    const computed = groupResults(
      input,
      group,
      matchPayloadById,
      unresolved,
      unresolvedTargets,
      manualOrderFor(group.id),
    )
    groupPayloads.push(computed.payload)
    groupRequiresResolution = groupRequiresResolution || computed.requiresManualResolution
  }

  const rankingComputed = isRanking
    ? rankingResults(input, unresolved, unresolvedTargets, manualOrderFor(input.phase.id))
    : { rows: [], requiresManualResolution: false }

  const rankingOrder = isRanking
    ? rankingComputed.rows.map((row) => row.elementId)
    : []
  const groupsOrder = groupPayloads.map((group) =>
    group.ranking.map((row) => row.elementId),
  )

  const advanceInput: ApplyAdvanceOptions = {
    advance: input.phase.advance,
    entrants: input.entrants.map((entrant) => entrant.elementId),
  }
  if (isElimination) advanceInput.matches = advanceMatches(matchesComputed.matches)
  if (isRanking) advanceInput.ranking = rankingOrder
  if (groupPayloads.length > 0) advanceInput.groups = groupsOrder

  const advance = applyAdvance(advanceInput)

  let requiresManualResolution =
    groupRequiresResolution ||
    matchesComputed.requiresManualResolution ||
    rankingComputed.requiresManualResolution

  if (!advance.ok) requiresManualResolution = true

  const qualified = advance.ok ? advance.qualified : []
  const winnerElementId = advance.ok ? advance.winnerElementId : null

  let repechage: ResultsRepechagePayload | null = null
  const rule =
    input.phase.advance.type === 'top_global' || input.phase.advance.type === 'top_per_group'
      ? input.phase.advance.repechage
      : undefined
  if (rule && advance.ok) {
    const directSet = new Set(qualified)
    const excluded = input.entrants
      .map((entrant) => entrant.elementId)
      .filter((elementId) => !directSet.has(elementId))
    const selection = applyRepechage({
      excluded: repechageCandidatesFromResults(excluded, {
        groups: groupPayloads,
        matches: matchesComputed.matches,
      }),
      directQualified: qualified.length,
      targetSize: rule.targetSize,
      criteria: rule.criteria,
      hasDuels: input.phase.voteType === 'duel',
    })
    if (!selection.ok) return { ok: false, error: 'repechage_unavailable' }
    repechage = {
      enabled: true,
      selected: selection.selected,
      criteria: selection.criteria,
    }
  }

  return {
    ok: true,
    results: {
      phaseId: input.phase.id,
      groups: groupPayloads,
      matches: matchesComputed.matches,
      ranking: rankingComputed.rows,
      qualified,
      repechage,
      winnerElementId,
    },
    unresolved,
    unresolvedTargets,
    requiresManualResolution,
  }
}
