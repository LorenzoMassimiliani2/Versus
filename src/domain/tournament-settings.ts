export interface TournamentSettings {
  selfVoteAllowed: boolean
  autoAdvance: boolean
}

export const DEFAULT_TOURNAMENT_SETTINGS: TournamentSettings = {
  selfVoteAllowed: true,
  autoAdvance: false,
}

/** Legge le impostazioni salvate, applicando i default alle chiavi mancanti. */
export function parseTournamentSettings(raw: string): TournamentSettings {
  try {
    const parsed = JSON.parse(raw) as { selfVoteAllowed?: unknown; autoAdvance?: unknown }
    return {
      selfVoteAllowed: parsed.selfVoteAllowed === undefined ? true : parsed.selfVoteAllowed === true,
      autoAdvance: parsed.autoAdvance === true,
    }
  } catch {
    return { ...DEFAULT_TOURNAMENT_SETTINGS }
  }
}

/** Impostazioni complete per una creazione; `null` se i tipi non sono validi. */
export function readTournamentSettings(value: unknown): TournamentSettings | null {
  if (typeof value !== 'object' || value === null) return null
  const input = value as { selfVoteAllowed?: unknown; autoAdvance?: unknown }
  if (input.selfVoteAllowed !== undefined && typeof input.selfVoteAllowed !== 'boolean') {
    return null
  }
  if (input.autoAdvance !== undefined && typeof input.autoAdvance !== 'boolean') return null
  return {
    selfVoteAllowed: input.selfVoteAllowed === undefined ? true : input.selfVoteAllowed,
    autoAdvance: input.autoAdvance === true,
  }
}

/** Modifica parziale delle impostazioni; `null` se i tipi non sono validi. */
export function readTournamentSettingsPatch(
  value: unknown,
): Partial<TournamentSettings> | null {
  if (typeof value !== 'object' || value === null) return null
  const input = value as { selfVoteAllowed?: unknown; autoAdvance?: unknown }
  const patch: Partial<TournamentSettings> = {}
  if (input.selfVoteAllowed !== undefined) {
    if (typeof input.selfVoteAllowed !== 'boolean') return null
    patch.selfVoteAllowed = input.selfVoteAllowed
  }
  if (input.autoAdvance !== undefined) {
    if (typeof input.autoAdvance !== 'boolean') return null
    patch.autoAdvance = input.autoAdvance
  }
  return patch
}
