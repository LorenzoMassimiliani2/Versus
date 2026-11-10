import { describe, expect, it } from 'vitest'

import type { Secrecy } from './phases'
import {
  resultsPolicy,
  type ResultsPhaseState,
  type ResultsRole,
  type ResultsVisibility,
} from './results-secrecy'

const EXPECTED: Record<
  Secrecy,
  Record<ResultsRole, Record<'open' | 'closed', ResultsVisibility>>
> = {
  live: {
    participant: { open: 'aggregate', closed: 'aggregate' },
    organizer: { open: 'aggregate', closed: 'aggregate' },
  },
  blind: {
    participant: { open: 'own_vote', closed: 'aggregate' },
    organizer: { open: 'aggregate', closed: 'aggregate' },
  },
  secret: {
    participant: { open: 'own_vote', closed: 'aggregate' },
    organizer: { open: 'aggregate', closed: 'aggregate' },
  },
}

const MODES: Secrecy[] = ['live', 'blind', 'secret']
const ROLES: ResultsRole[] = ['participant', 'organizer']

describe('resultsPolicy', () => {
  for (const secrecy of MODES) {
    for (const role of ROLES) {
      for (const phaseState of ['open', 'closed'] as const) {
        it(`mostra ${EXPECTED[secrecy][role][phaseState]} con ${secrecy} a un ${role} in fase ${phaseState}`, () => {
          expect(resultsPolicy({ secrecy, role, phaseState })).toEqual({
            visibility: EXPECTED[secrecy][role][phaseState],
          })
        })
      }
    }
  }

  it.each<ResultsPhaseState>(['pending'])('nasconde i risultati in fase %s', (phaseState) => {
    expect(resultsPolicy({ secrecy: 'live', role: 'participant', phaseState })).toEqual({
      visibility: 'hidden',
    })
    expect(resultsPolicy({ secrecy: 'live', role: 'organizer', phaseState })).toEqual({
      visibility: 'hidden',
    })
  })
})
