
import { defineStore } from 'pinia'

import type { PlanIssue, PlanPreview } from '@/domain/plan'
import { strings } from '@/lib/strings'

export interface PlanPreviewResult {
  valid: boolean
  errors: PlanIssue[]
  warnings: PlanIssue[]
  preview: PlanPreview
}

function isPreviewResult(value: unknown): value is PlanPreviewResult {
  if (typeof value !== 'object' || value === null) return false
  const result = value as Partial<PlanPreviewResult>
  return (
    typeof result.valid === 'boolean' &&
    Array.isArray(result.errors) &&
    Array.isArray(result.warnings) &&
    typeof result.preview === 'object' &&
    result.preview !== null &&
    Array.isArray(result.preview.phases)
  )
}

export const usePlanPreviewStore = defineStore('planPreview', {
  state: () => ({
    result: null as PlanPreviewResult | null,
    loading: false,
    error: null as string | null,
  }),
  actions: {
    async load(tournamentId: string): Promise<void> {
      this.loading = true
      this.error = null
      try {
        const response = await fetch(
          `/api/tournaments/${encodeURIComponent(tournamentId)}/preview`,
          { credentials: 'same-origin', headers: { Accept: 'application/json' } },
        )
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null
          this.error =
            body?.error === 'forbidden'
              ? strings.errors.forbidden
              : body?.error === 'not_found'
                ? strings.errors.tournament_not_found
                : strings.errors.unknown
          return
        }
        const body: unknown = await response.json()
        if (!isPreviewResult(body)) {
          this.error = strings.errors.unknown
          return
        }
        this.result = body
      } catch {
        this.error = strings.errors.network
      } finally {
        this.loading = false
      }
    },

    clear(): void {
      this.result = null
      this.error = null
    },
  },
})
