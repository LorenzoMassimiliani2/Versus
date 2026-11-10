import { defineStore } from 'pinia'

import { resolutionErrorMessage, strings } from '@/lib/strings'

export interface ResolutionElement {
  id: string
  name: string
}

export interface ResolutionTarget {
  targetId: string
  name: string
  elements: ResolutionElement[]
}

interface ErrorResponse {
  error?: string
}

async function errorCode(response: Response): Promise<string | undefined> {
  const data = (await response.json().catch(() => null)) as ErrorResponse | null
  return data?.error
}

export const useResolutionStore = defineStore('resolution', {
  state: () => ({
    targets: [] as ResolutionTarget[],
    loadedPhaseId: null as string | null,
    loading: false,
    saving: false,
    error: null as string | null,
  }),
  actions: {
    async load(phaseId: string): Promise<boolean> {
      this.loading = true
      this.error = null
      try {
        const response = await fetch(`/api/phases/${encodeURIComponent(phaseId)}/resolution`, {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        })
        if (!response.ok) {
          this.error = resolutionErrorMessage(await errorCode(response))
          this.targets = []
          this.loadedPhaseId = null
          return false
        }
        const body = (await response.json()) as { targets: ResolutionTarget[] }
        this.targets = body.targets
        this.loadedPhaseId = phaseId
        return true
      } catch {
        this.error = strings.errors.network
        this.targets = []
        this.loadedPhaseId = null
        return false
      } finally {
        this.loading = false
      }
    },

    async resolve(
      phaseId: string,
      note: string,
      orders: Record<string, string[]>,
    ): Promise<boolean> {
      if (note.trim().length === 0) {
        this.error = strings.resolution.noteRequired
        return false
      }
      this.saving = true
      this.error = null
      try {
        const response = await fetch(`/api/phases/${encodeURIComponent(phaseId)}/resolve`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            note: note.trim(),
            resolutions: this.targets.map((target) => ({
              targetId: target.targetId,
              ordering: orders[target.targetId] ?? target.elements.map((element) => element.id),
            })),
          }),
        })
        if (!response.ok) {
          this.error = resolutionErrorMessage(await errorCode(response))
          return false
        }
        this.targets = []
        this.loadedPhaseId = null
        return true
      } catch {
        this.error = strings.errors.network
        return false
      } finally {
        this.saving = false
      }
    },
  },
})
