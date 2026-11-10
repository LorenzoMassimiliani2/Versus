import type { DuelVote } from './duel'

export type DuelSide = DuelVote['side']

export type DuelVoteError = 'invalid_vote' | 'credits_exceeded' | 'credits_on_abstain'

export interface DuelVoteLimits {
  /** Budget crediti del votante per la fase. */
  budget: number
  /** Limite per singola sfida, oppure `null` se vale solo il budget. */
  maxPerMatch: number | null
  /** Crediti disponibili, rimborso del voto precedente incluso. */
  available: number
}

export type DuelVoteValidation =
  | { ok: true; vote: DuelVote }
  | { ok: false; error: DuelVoteError }

/** Crediti massimi investibili in una sfida: budget e limite per sfida. */
export function maxDuelCredits(budget: number, maxPerMatch: number | null): number {
  return maxPerMatch === null ? budget : Math.min(budget, maxPerMatch)
}

/** Saldo crediti: somma dei movimenti; le spese sono negative, i rimborsi positivi. */
export function creditBalance(movements: readonly number[]): number {
  return movements.reduce((total, amount) => total + amount, 0)
}

/**
 * Valida un voto di duello. I crediti devono essere interi, non negativi e
 * entro budget, limite per sfida e saldo disponibile. L'astensione non accetta
 * crediti.
 */
export function validateDuelVote(raw: unknown, limits: DuelVoteLimits): DuelVoteValidation {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'invalid_vote' }
  }

  const body = raw as Record<string, unknown>
  const side = body.side
  if (side !== 'a' && side !== 'b' && side !== 'abstain') {
    return { ok: false, error: 'invalid_vote' }
  }

  const credits = body.credits === undefined ? 0 : body.credits
  if (typeof credits !== 'number' || !Number.isInteger(credits) || credits < 0) {
    return { ok: false, error: 'invalid_vote' }
  }

  if (side === 'abstain' && credits !== 0) {
    return { ok: false, error: 'credits_on_abstain' }
  }

  const maximum = maxDuelCredits(limits.budget, limits.maxPerMatch)
  if (credits > maximum || credits > limits.available) {
    return { ok: false, error: 'credits_exceeded' }
  }

  return { ok: true, vote: { side, credits } }
}
