/** Un voto di duello: lato scelto e crediti investiti su quel lato. */
export interface DuelVote {
  side: 'a' | 'b' | 'abstain'
  credits: number
}

/** Criteri di spareggio del duello, nell'ordine predefinito della spec. */
export type DuelTieBreakCriterion = 'credits' | 'voters' | 'manual'

export const DUEL_TIEBREAKS: readonly DuelTieBreakCriterion[] = [
  'credits',
  'voters',
  'manual',
]

export interface DuelSideTally {
  elementId: string
  /** Somma dei pesi `1 + crediti` dei voti del lato. */
  weight: number
  /** Somma dei crediti investiti nel lato. */
  credits: number
  /** Voti espressi per il lato; le astensioni non contano. */
  voters: number
}

export type DuelResolvedBy = 'weight' | DuelTieBreakCriterion

export interface TallyDuelOptions {
  sideA: string
  sideB: string
  votes: readonly DuelVote[]
  /** Ordine degli spareggi; `manual` resta comunque sempre l'ultimo passo. */
  criteria?: readonly DuelTieBreakCriterion[]
  /** Scelta dell'organizzatore quando i criteri automatici non separano i lati. */
  manualWinner?: 'a' | 'b' | null
}

export interface DuelResult {
  sideA: DuelSideTally
  sideB: DuelSideTally
  winner: 'a' | 'b' | null
  winnerElementId: string | null
  resolvedBy: DuelResolvedBy | null
  /** Vero quando nessun criterio ha separato i lati. */
  unresolved: boolean
}

function emptySide(elementId: string): DuelSideTally {
  return { elementId, weight: 0, credits: 0, voters: 0 }
}

/** Peso di un voto: `1 + crediti`. */
export function voteWeight(vote: DuelVote): number {
  return 1 + vote.credits
}

/**
 * Somma i pesi dei voti per lato e determina il vincitore del duello.
 *
 * - Vince il lato con peso maggiore.
 * - A parita di peso si applicano gli spareggi nell'ordine configurato:
 *   crediti investiti, numero di votanti, risoluzione manuale.
 * - Le astensioni non aggiungono peso e non contano come votanti del lato.
 * - Senza voti validi il duello resta irrisolto, salvo risoluzione manuale.
 */
export function tallyDuel(options: TallyDuelOptions): DuelResult {
  const sideA = emptySide(options.sideA)
  const sideB = emptySide(options.sideB)

  for (const vote of options.votes) {
    if (vote.side === 'abstain') continue
    const side = vote.side === 'a' ? sideA : sideB
    side.weight += voteWeight(vote)
    side.credits += vote.credits
    side.voters += 1
  }

  const decide = (winner: 'a' | 'b', resolvedBy: DuelResolvedBy): DuelResult => ({
    sideA,
    sideB,
    winner,
    winnerElementId: winner === 'a' ? sideA.elementId : sideB.elementId,
    resolvedBy,
    unresolved: false,
  })

  if (sideA.weight !== sideB.weight) {
    return decide(sideA.weight > sideB.weight ? 'a' : 'b', 'weight')
  }

  const criteria = [
    ...(options.criteria ?? DUEL_TIEBREAKS).filter((criterion) => criterion !== 'manual'),
    'manual' as const,
  ]

  for (const criterion of criteria) {
    if (criterion === 'credits' && sideA.credits !== sideB.credits) {
      return decide(sideA.credits > sideB.credits ? 'a' : 'b', 'credits')
    }
    if (criterion === 'voters' && sideA.voters !== sideB.voters) {
      return decide(sideA.voters > sideB.voters ? 'a' : 'b', 'voters')
    }
    if (criterion === 'manual' && options.manualWinner) {
      return decide(options.manualWinner, 'manual')
    }
  }

  return {
    sideA,
    sideB,
    winner: null,
    winnerElementId: null,
    resolvedBy: null,
    unresolved: true,
  }
}
