import type { Secrecy } from './phases'

/** Ruolo del richiedente rispetto al torneo, ai fini della segretezza. */
export type ResultsRole = 'participant' | 'organizer'

/** Stato della fase rilevante per la visibilità dei risultati. */
export type ResultsPhaseState = 'pending' | 'open' | 'closed'

/**
 * Cosa può vedere il richiedente:
 * - `aggregate`: classifiche, pesi e conteggi, senza identità dei votanti;
 * - `own_vote`: nessun aggregato, solo il voto espresso dal richiedente;
 * - `hidden`: nulla, la fase non produce ancora risultati.
 */
export type ResultsVisibility = 'aggregate' | 'own_vote' | 'hidden'

export interface ResultsPolicyInput {
  secrecy: Secrecy
  role: ResultsRole
  phaseState: ResultsPhaseState
}

export interface ResultsPolicy {
  visibility: ResultsVisibility
}

/**
 * Regole della tabella "Segretezza" della spec 0001.
 *
 * | modalità | partecipante aperta | partecipante chiusa | organizzatore aperta | organizzatore chiusa |
 * | live     | aggregati           | aggregati           | aggregati           | aggregati           |
 * | blind    | solo proprio voto   | aggregati           | aggregati           | aggregati           |
 * | secret   | solo proprio voto   | aggregati           | aggregati           | aggregati           |
 *
 * Gli aggregati non contengono mai l'identità dei votanti; in `secret` non
 * esistono eccezioni per l'organizzatore.
 */
export function resultsPolicy(input: ResultsPolicyInput): ResultsPolicy {
  if (input.phaseState === 'pending') return { visibility: 'hidden' }
  if (input.phaseState === 'closed') return { visibility: 'aggregate' }
  if (input.secrecy === 'live') return { visibility: 'aggregate' }
  return {
    visibility: input.role === 'participant' ? 'own_vote' : 'aggregate',
  }
}
