import { defineStore } from 'pinia'

import { participantsErrorMessage, strings } from '@/lib/strings'

export type ParticipantStatus = 'active' | 'removed'

export interface TournamentParticipant {
  userId: string
  username: string
  status: ParticipantStatus
  addedBy: string
  addedAt: string
  removedAt: string | null
}

export interface CandidateUser {
  id: string
  username: string
  isParticipant: boolean
}

interface ParticipantsResponse {
  participants: TournamentParticipant[]
}

interface ParticipantResponse {
  participant: TournamentParticipant
}

interface CandidatesResponse {
  users: CandidateUser[]
}

interface ErrorResponse {
  error?: string
}

const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' }

async function errorCode(response: Response): Promise<string | undefined> {
  const data = (await response.json().catch(() => null)) as ErrorResponse | null
  return data?.error
}

function sortParticipants(participants: TournamentParticipant[]): TournamentParticipant[] {
  return [...participants].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1
    return a.username.localeCompare(b.username)
  })
}

export const useParticipantsStore = defineStore('participants', {
  state: () => ({
    participants: [] as TournamentParticipant[],
    candidates: [] as CandidateUser[],
    loading: false,
    saving: false,
    error: null as string | null,
  }),
  getters: {
    activeCount: (state) => state.participants.filter((item) => item.status === 'active').length,
    selectableCandidates: (state) => state.candidates.filter((user) => !user.isParticipant),
  },
  actions: {
    async load(tournamentId: string): Promise<void> {
      this.loading = true
      this.error = null
      try {
        const [participantsResponse, candidatesResponse] = await Promise.all([
          fetch(`/api/tournaments/${encodeURIComponent(tournamentId)}/participants`, {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
          }),
          fetch(`/api/tournaments/${encodeURIComponent(tournamentId)}/candidates`, {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
          }),
        ])
        if (!participantsResponse.ok) {
          this.error = participantsErrorMessage(await errorCode(participantsResponse))
          return
        }
        if (!candidatesResponse.ok) {
          this.error = participantsErrorMessage(await errorCode(candidatesResponse))
          return
        }
        this.participants = sortParticipants(
          ((await participantsResponse.json()) as ParticipantsResponse).participants ?? [],
        )
        this.candidates = ((await candidatesResponse.json()) as CandidatesResponse).users ?? []
      } catch {
        this.error = strings.errors.network
      } finally {
        this.loading = false
      }
    },

    async loadCandidates(tournamentId: string): Promise<void> {
      this.error = null
      try {
        const response = await fetch(
          `/api/tournaments/${encodeURIComponent(tournamentId)}/candidates`,
          { credentials: 'same-origin', headers: { Accept: 'application/json' } },
        )
        if (!response.ok) {
          this.error = participantsErrorMessage(await errorCode(response))
          return
        }
        this.candidates = ((await response.json()) as CandidatesResponse).users ?? []
      } catch {
        this.error = strings.errors.network
      }
    },

    async add(tournamentId: string, userId: string): Promise<boolean> {
      return this.save(async () => {
        const response = await fetch(
          `/api/tournaments/${encodeURIComponent(tournamentId)}/participants`,
          {
            method: 'POST',
            credentials: 'same-origin',
            headers: JSON_HEADERS,
            body: JSON.stringify({ userId }),
          },
        )
        if (!response.ok) {
          this.error = participantsErrorMessage(await errorCode(response))
          return false
        }
        const participant = ((await response.json()) as ParticipantResponse).participant
        this.upsert(participant)
        this.markCandidate(userId, true)
        return true
      })
    },

    async remove(tournamentId: string, userId: string): Promise<boolean> {
      return this.save(async () => {
        const response = await fetch(
          `/api/tournaments/${encodeURIComponent(tournamentId)}/participants/${encodeURIComponent(userId)}`,
          {
            method: 'DELETE',
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
          },
        )
        if (!response.ok) {
          this.error = participantsErrorMessage(await errorCode(response))
          return false
        }
        this.participants = sortParticipants(
          this.participants.map((item) =>
            item.userId === userId
              ? { ...item, status: 'removed', removedAt: new Date().toISOString() }
              : item,
          ),
        )
        this.markCandidate(userId, false)
        return true
      })
    },

    upsert(participant: TournamentParticipant): void {
      const exists = this.participants.some((item) => item.userId === participant.userId)
      this.participants = sortParticipants(
        exists
          ? this.participants.map((item) =>
              item.userId === participant.userId ? participant : item,
            )
          : [...this.participants, participant],
      )
    },

    markCandidate(userId: string, isParticipant: boolean): void {
      this.candidates = this.candidates.map((user) =>
        user.id === userId ? { ...user, isParticipant } : user,
      )
    },

    clear(): void {
      this.participants = []
      this.candidates = []
      this.error = null
    },

    async save(operation: () => Promise<boolean>): Promise<boolean> {
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
  },
})
