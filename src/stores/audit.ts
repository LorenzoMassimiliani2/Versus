import { defineStore } from 'pinia'

import { strings } from '@/lib/strings'

export interface AuditEntry {
  id: string
  actorId: string | null
  actorUsername: string | null
  action: string
  targetType: string
  targetId: string | null
  before: unknown
  after: unknown
  createdAt: string
}

interface AuditResponse {
  entries: AuditEntry[]
}

export const useAuditStore = defineStore('audit', {
  state: () => ({
    entries: [] as AuditEntry[],
    loading: false,
    error: null as string | null,
  }),
  actions: {
    async load(tournamentId: string): Promise<void> {
      this.loading = true
      this.error = null
      try {
        const response = await fetch(
          `/api/tournaments/${encodeURIComponent(tournamentId)}/audit`,
          { credentials: 'same-origin', headers: { Accept: 'application/json' } },
        )
        if (!response.ok) {
          this.entries = []
          this.error = strings.audit.error
          return
        }
        const body = (await response.json()) as AuditResponse
        this.entries = body.entries ?? []
      } catch {
        this.entries = []
        this.error = strings.audit.error
      } finally {
        this.loading = false
      }
    },
  },
})
