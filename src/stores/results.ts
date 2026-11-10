import { defineStore } from 'pinia'

import { resultsErrorMessage, strings } from '@/lib/strings'

export interface ResultsElement {
  id: string
  name: string
  imageUrl: string
}

export interface ResultsRankingRow {
  elementId: string
  score: number
  firstPreferences: number
  picks?: number
  position: number
  tieBreak: string | null
}

export interface ResultsGroup {
  groupId: string
  name: string | null
  ranking: ResultsRankingRow[]
}

export interface ResultsMatchSide {
  elementId: string | null
  weight: number
  credits: number
  voters: number
}

export interface ResultsMatch {
  matchId: string
  sideA: ResultsMatchSide
  sideB: ResultsMatchSide
  winnerElementId: string | null
  resolvedBy: string | null
}

export interface ResultsRepechage {
  enabled: boolean
  selected: string[]
  criteria: string[]
}

export interface PhaseResults {
  phaseId: string
  phase: {
    id: string
    name: string
    position: number
    formula: 'group' | 'elimination' | 'ranking'
    voteType: 'duel' | 'ranking' | 'pick'
  }
  closedAt: string
  version: number
  groups: ResultsGroup[]
  matches: ResultsMatch[]
  ranking: ResultsRankingRow[]
  qualified: string[]
  repechage: ResultsRepechage | null
  winnerElementId: string | null
  elements: ResultsElement[]
}

interface ErrorResponse {
  error?: string
}

async function errorCode(response: Response): Promise<string | undefined> {
  const data = (await response.json().catch(() => null)) as ErrorResponse | null
  return data?.error
}

export const useResultsStore = defineStore('results', {
  state: () => ({
    results: null as PhaseResults | null,
    loadedPhaseId: null as string | null,
    loading: false,
    error: null as string | null,
  }),
  getters: {
    elementName: (state) => (elementId: string | null): string => {
      if (!elementId) return ''
      return (
        state.results?.elements.find((element) => element.id === elementId)?.name ?? elementId
      )
    },
  },
  actions: {
    async load(phaseId: string): Promise<void> {
      this.loading = true
      this.error = null
      try {
        const response = await fetch(
          `/api/phases/${encodeURIComponent(phaseId)}/results`,
          { credentials: 'same-origin', headers: { Accept: 'application/json' } },
        )
        if (!response.ok) {
          this.error = resultsErrorMessage(await errorCode(response))
          this.results = null
          this.loadedPhaseId = null
          return
        }
        this.results = (await response.json()) as PhaseResults
        this.loadedPhaseId = phaseId
      } catch {
        this.error = strings.errors.network
        this.results = null
        this.loadedPhaseId = null
      } finally {
        this.loading = false
      }
    },

    clear(): void {
      this.results = null
      this.loadedPhaseId = null
      this.error = null
    },
  },
})
