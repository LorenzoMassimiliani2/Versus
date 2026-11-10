import { defineStore } from 'pinia'

import { strings, tournamentErrorMessage } from '@/lib/strings'

export type TournamentStatus = 'draft' | 'published' | 'running' | 'concluded' | 'archived'
export type TournamentRole = 'owner' | 'co_organizer' | 'participant'

export interface TournamentSummary {
  id: string
  slug: string
  name: string
  description: string
  coverUrl: string | null
  status: TournamentStatus
  createdAt: string
  updatedAt: string
  role: TournamentRole
}

export interface TournamentOrganizer {
  userId: string
  username: string
  role: 'owner' | 'co_organizer'
  addedAt: string
}

export interface TournamentDetail extends TournamentSummary {
  settings: { autoAdvance: boolean }
  publishedAt: string | null
  startedAt: string | null
  concludedAt: string | null
  organizers: TournamentOrganizer[]
}

export interface TournamentInput {
  name: string
  description?: string
  coverUrl?: string | null
}

interface TournamentsResponse {
  tournaments: TournamentSummary[]
}

interface TournamentResponse {
  tournament: TournamentDetail
}

interface OrganizerResponse {
  organizer: TournamentOrganizer
}

interface ErrorResponse {
  error?: string
}

export const useTournamentsStore = defineStore('tournaments', {
  state: () => ({
    tournaments: [] as TournamentSummary[],
    current: null as TournamentDetail | null,
    loading: false,
    saving: false,
    error: null as string | null,
  }),
  getters: {
    organized: (state) =>
      state.tournaments.filter(
        (tournament) => tournament.role === 'owner' || tournament.role === 'co_organizer',
      ),
    participating: (state) =>
      state.tournaments.filter((tournament) => tournament.role === 'participant'),
  },
  actions: {
    async load(): Promise<void> {
      this.loading = true
      this.error = null
      try {
        const response = await fetch('/api/tournaments', {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        })
        if (!response.ok) {
          this.error = tournamentErrorMessage(await errorCode(response))
          return
        }
        this.tournaments = ((await response.json()) as TournamentsResponse).tournaments
      } catch {
        this.error = strings.errors.network
      } finally {
        this.loading = false
      }
    },

    async loadOne(id: string): Promise<void> {
      this.loading = true
      this.error = null
      this.current = null
      try {
        const response = await fetch(`/api/tournaments/${encodeURIComponent(id)}`, {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        })
        if (!response.ok) {
          this.error = tournamentErrorMessage(await errorCode(response))
          return
        }
        this.current = ((await response.json()) as TournamentResponse).tournament
      } catch {
        this.error = strings.errors.network
      } finally {
        this.loading = false
      }
    },

    async create(input: TournamentInput): Promise<TournamentDetail | null> {
      this.error = null
      try {
        const response = await fetch('/api/tournaments', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(input),
        })
        if (!response.ok) {
          this.error = tournamentErrorMessage(await errorCode(response))
          return null
        }
        const tournament = ((await response.json()) as TournamentResponse).tournament
        this.tournaments = [tournament, ...this.tournaments]
        return tournament
      } catch {
        this.error = strings.errors.network
        return null
      }
    },

    async update(id: string, input: Partial<TournamentInput>): Promise<boolean> {
      this.error = null
      this.saving = true
      try {
        const response = await fetch(`/api/tournaments/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(input),
        })
        if (!response.ok) {
          this.error = tournamentErrorMessage(await errorCode(response))
          return false
        }
        const tournament = ((await response.json()) as TournamentResponse).tournament
        this.current = tournament
        this.tournaments = this.tournaments.map((item) =>
          item.id === tournament.id ? { ...item, ...tournament } : item,
        )
        return true
      } catch {
        this.error = strings.errors.network
        return false
      } finally {
        this.saving = false
      }
    },

    async nominateOrganizer(id: string, userId: string): Promise<boolean> {
      return this.mutateOrganizers(async () => {
        const response = await fetch(`/api/tournaments/${encodeURIComponent(id)}/organizers`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ userId }),
        })
        if (!response.ok) {
          this.error = tournamentErrorMessage(await errorCode(response))
          return false
        }
        const organizer = ((await response.json()) as OrganizerResponse).organizer
        if (this.current) {
          const exists = this.current.organizers.some((item) => item.userId === organizer.userId)
          this.current.organizers = exists
            ? this.current.organizers.map((item) =>
                item.userId === organizer.userId ? organizer : item,
              )
            : [...this.current.organizers, organizer]
        }
        return true
      })
    },

    async revokeOrganizer(id: string, userId: string): Promise<boolean> {
      return this.mutateOrganizers(async () => {
        const response = await fetch(
          `/api/tournaments/${encodeURIComponent(id)}/organizers/${encodeURIComponent(userId)}`,
          {
            method: 'DELETE',
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
          },
        )
        if (!response.ok) {
          this.error = tournamentErrorMessage(await errorCode(response))
          return false
        }
        if (this.current) {
          this.current.organizers = this.current.organizers.filter(
            (item) => item.userId !== userId,
          )
        }
        return true
      })
    },

    async mutateOrganizers(operation: () => Promise<boolean>): Promise<boolean> {
      this.error = null
      this.saving = true
      try {
        return await operation()
      } catch {
        this.error = strings.errors.network
        return false
      } finally {
        this.saving = false
      }
    },

    clearCurrent(): void {
      this.current = null
      this.error = null
    },
  },
})

async function errorCode(response: Response): Promise<string | undefined> {
  const data = (await response.json().catch(() => null)) as ErrorResponse | null
  return data?.error
}
