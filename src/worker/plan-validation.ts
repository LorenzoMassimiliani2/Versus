import type { CustomFieldDefinition } from '../domain/custom-values'
import { validatePlan, type PlanInput, type PlanValidation } from '../domain/plan'
import { defaultPhaseConfig, type PhaseAdvance, type PhaseConfig } from '../domain/phases'
import { parseTournamentSettings } from '../domain/tournament-settings'
import { listCustomFields, listElements } from './db/elements'
import { countActiveParticipants } from './db/participants'
import { listPhases, type PhaseRecord } from './db/phases'
import type { TournamentRecord } from './db/tournaments'

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/**
 * Valida il piano in base allo stato corrente del torneo. `phases` permette di
 * validare una variante del piano prima di scriverla su D1.
 */
export async function loadPlanValidation(
  env: Env,
  tournament: TournamentRecord,
  now: number,
  phases?: PhaseRecord[],
): Promise<PlanValidation> {
  const tournamentId = tournament.id
  const [elements, fields, storedPhases, activeParticipants] = await Promise.all([
    listElements(env, tournamentId),
    listCustomFields(env, tournamentId),
    phases ?? listPhases(env, tournamentId),
    countActiveParticipants(env, tournamentId),
  ])

  const input: PlanInput = {
    tournament: {
      name: tournament.name,
      slug: tournament.slug,
      settings: parseTournamentSettings(tournament.settings),
    },
    elements: elements.map((element) => ({
      id: element.id,
      name: element.name,
      imageUrl: element.image_url,
      customValues: parseJson<Record<string, unknown>>(element.custom_values, {}),
      position: element.position,
    })),
    fields: fields.map((field): CustomFieldDefinition => ({ key: field.key, type: field.type })),
    phases: storedPhases.map((phase) => ({
      position: phase.position,
      name: phase.name,
      formula: phase.formula,
      voteType: phase.vote_type,
      config: parseJson<PhaseConfig>(phase.config, defaultPhaseConfig()),
      advance: parseJson<PhaseAdvance>(phase.advance, { type: 'all' }),
    })),
    activeParticipants,
    now: new Date(now),
  }

  return validatePlan(input)
}
