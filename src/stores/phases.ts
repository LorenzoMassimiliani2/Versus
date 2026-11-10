import { defineStore } from 'pinia'

import type { PhaseAdvance, PhaseConfig, PhaseDraft, PhaseFormula, PhaseVoteType } from '@/domain/phases'
import {
  DEFAULT_TOURNAMENT_SETTINGS,
  type TournamentSettings,
} from '@/domain/tournament-settings'
import { phasesErrorMessage, strings } from '@/lib/strings'

export interface Phase extends PhaseDraft {
  id: string
  position: number
  status: 'pending' | 'open' | 'awaiting_resolution' | 'closed' | 'cancelled'
  openedAt: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string
}

export type PhaseInput = PhaseDraft

interface PlanResponse {
  settings?: TournamentSettings
  phases?: Phase[]
}

interface PhaseResponse {
  phase: Phase
}

export interface PhaseOperationEntrant {
  elementId: string
  name: string
  seed: number
  position: number
}

export interface PhaseOperationVoter {
  userId: string
  creditsBudget: number
}

export interface PhaseOperationGroup {
  id: string
  name: string
  position: number
  members: Array<{ elementId: string; position: number }>
}

export interface PhaseOperationMatch {
  id: string
  groupId: string | null
  round: number
  position: number
  sideA: string | null
  sideB: string | null
  winnerElementId: string | null
  status: string
}

export interface PhaseOperation {
  entrants: PhaseOperationEntrant[]
  voters: PhaseOperationVoter[]
  groups: PhaseOperationGroup[]
  matches: PhaseOperationMatch[]
}

export interface OpeningEntry {
  id: string
  name: string
}

export interface OpeningPreview {
  entrants: OpeningEntry[]
  directQualified: OpeningEntry[]
  repechage: {
    targetSize: number
    slots: number
    selected: OpeningEntry[]
    excluded: OpeningEntry[]
  } | null
}

interface OpenResponse {
  phase: Phase
  operation: PhaseOperation
}

interface ErrorResponse {
  error?: string
}

async function errorCode(response: Response): Promise<string | undefined> {
  const data = (await response.json().catch(() => null)) as ErrorResponse | null
  return data?.error
}

export const usePhasesStore = defineStore('phases', {
  state: () => ({
    phases: [] as Phase[],
    settings: { ...DEFAULT_TOURNAMENT_SETTINGS } as TournamentSettings,
    loading: false,
    saving: false,
    opening: false,
    error: null as string | null,
    operation: null as PhaseOperation | null,
    operationPhaseId: null as string | null,
    preview: null as OpeningPreview | null,
    previewPhaseId: null as string | null,
  }),
  getters: {
    firstPosition: (state) => state.phases[0]?.position ?? 1,
    allPending: (state) => state.phases.every((phase) => phase.status === 'pending'),
  },
  actions: {
    async load(tournamentId: string): Promise<void> {
      this.loading = true
      this.error = null
      try {
        const response = await fetch(
          `/api/tournaments/${encodeURIComponent(tournamentId)}/phases`,
          { credentials: 'same-origin', headers: { Accept: 'application/json' } },
        )
        if (!response.ok) {
          this.error = phasesErrorMessage(await errorCode(response))
          return
        }
        const body = (await response.json()) as PlanResponse
        this.phases = body.phases ?? []
        if (body.settings) this.settings = body.settings
      } catch {
        this.error = strings.errors.network
      } finally {
        this.loading = false
      }
    },

    async create(tournamentId: string, input: PhaseInput): Promise<boolean> {
      this.error = null
      this.saving = true
      try {
        const response = await fetch(
          `/api/tournaments/${encodeURIComponent(tournamentId)}/phases`,
          {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(input),
          },
        )
        if (!response.ok) {
          this.error = phasesErrorMessage(await errorCode(response))
          return false
        }
        const phase = ((await response.json()) as PhaseResponse).phase
        this.phases = [...this.phases, phase].sort((a, b) => a.position - b.position)
        return true
      } catch {
        this.error = strings.errors.network
        return false
      } finally {
        this.saving = false
      }
    },

    async update(phaseId: string, input: Partial<PhaseInput>): Promise<boolean> {
      this.error = null
      this.saving = true
      try {
        const response = await fetch(`/api/phases/${encodeURIComponent(phaseId)}`, {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(input),
        })
        if (!response.ok) {
          this.error = phasesErrorMessage(await errorCode(response))
          return false
        }
        const phase = ((await response.json()) as PhaseResponse).phase
        this.phases = this.phases.map((item) => (item.id === phase.id ? phase : item))
        return true
      } catch {
        this.error = strings.errors.network
        return false
      } finally {
        this.saving = false
      }
    },

    async remove(tournamentId: string, phaseId: string): Promise<boolean> {
      this.error = null
      this.saving = true
      try {
        const response = await fetch(`/api/phases/${encodeURIComponent(phaseId)}`, {
          method: 'DELETE',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        })
        if (!response.ok) {
          this.error = phasesErrorMessage(await errorCode(response))
          return false
        }
        await this.load(tournamentId)
        return true
      } catch {
        this.error = strings.errors.network
        return false
      } finally {
        this.saving = false
      }
    },

    async reorder(tournamentId: string, ids: string[]): Promise<boolean> {
      this.error = null
      this.saving = true
      try {
        const response = await fetch(
          `/api/tournaments/${encodeURIComponent(tournamentId)}/phases/order`,
          {
            method: 'PUT',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ ids }),
          },
        )
        if (!response.ok) {
          this.error = phasesErrorMessage(await errorCode(response))
          return false
        }
        const body = (await response.json()) as PlanResponse
        this.phases = body.phases ?? this.phases
        return true
      } catch {
        this.error = strings.errors.network
        return false
      } finally {
        this.saving = false
      }
    },

    async loadOpeningPreview(phaseId: string): Promise<OpeningPreview | null> {
      this.error = null
      this.opening = true
      try {
        const response = await fetch(
          `/api/phases/${encodeURIComponent(phaseId)}/open-preview`,
          { credentials: 'same-origin', headers: { Accept: 'application/json' } },
        )
        if (!response.ok) {
          this.error = phasesErrorMessage(await errorCode(response))
          return null
        }
        const preview = (await response.json()) as OpeningPreview
        this.preview = preview
        this.previewPhaseId = phaseId
        return preview
      } catch {
        this.error = strings.errors.network
        return null
      } finally {
        this.opening = false
      }
    },

    async open(phaseId: string, repechageOverride?: string[]): Promise<boolean> {
      this.error = null
      this.opening = true
      try {
        const body =
          repechageOverride === undefined
            ? {}
            : { repechageOverride }
        const response = await fetch(`/api/phases/${encodeURIComponent(phaseId)}/open`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body),
        })
        if (!response.ok) {
          this.error = phasesErrorMessage(await errorCode(response))
          return false
        }
        const data = (await response.json()) as OpenResponse
        this.phases = this.phases.map((item) => (item.id === data.phase.id ? data.phase : item))
        this.operation = data.operation
        this.operationPhaseId = data.phase.id
        this.preview = null
        this.previewPhaseId = null
        return true
      } catch {
        this.error = strings.errors.network
        return false
      } finally {
        this.opening = false
      }
    },

    clear(): void {
      this.phases = []
      this.settings = { ...DEFAULT_TOURNAMENT_SETTINGS }
      this.error = null
      this.operation = null
      this.operationPhaseId = null
      this.preview = null
      this.previewPhaseId = null
    },
  },
})

export type { PhaseAdvance, PhaseConfig, PhaseFormula, PhaseVoteType }
