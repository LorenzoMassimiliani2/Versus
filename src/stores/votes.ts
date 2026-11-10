import { defineStore } from 'pinia'

import { voteErrorMessage, strings } from '@/lib/strings'

export type DuelSide = 'a' | 'b' | 'abstain'

export interface BallotElement {
  elementId: string
  name: string
  imageUrl: string
  videoUrl: string | null
}

export interface BallotVote {
  side: DuelSide
  credits: number
}

export interface BallotMatch {
  id: string
  groupId: string | null
  round: number
  position: number
  status: 'pending' | 'open' | 'closed' | 'bye'
  sideA: BallotElement | null
  sideB: BallotElement | null
  vote: BallotVote | null
}

export type BallotKind = 'ranking' | 'pick'

export interface RankingAssignment {
  elementId: string
  points: number
}

export type BallotTargetVote =
  | { kind: 'ranking'; assignments: RankingAssignment[] }
  | { kind: 'pick'; elementId: string }

export interface BallotTarget {
  id: string
  name: string
  elements: BallotElement[]
  vote: BallotTargetVote | null
  points: { scale: number[]; used: number[]; remaining: number[] }
}

export interface Ballot {
  phase: {
    id: string
    tournamentId: string
    name: string
    status: 'pending' | 'open' | 'awaiting_resolution' | 'closed' | 'cancelled'
    voteType: string
  }
  budget: number
  maxPerMatch: number
  balance: number
  matches: BallotMatch[]
  targets: BallotTarget[]
  completion: { voted: number; total: number }
}

interface ErrorResponse {
  error?: string
}

async function errorCode(response: Response): Promise<string | undefined> {
  const data = (await response.json().catch(() => null)) as ErrorResponse | null
  return data?.error
}

export const useVotesStore = defineStore('votes', {
  state: () => ({
    ballot: null as Ballot | null,
    loading: false,
    saving: false,
    error: null as string | null,
    saved: false,
  }),
  actions: {
    async load(phaseId: string): Promise<boolean> {
      this.loading = true
      this.error = null
      this.saved = false
      try {
        const response = await fetch(`/api/phases/${encodeURIComponent(phaseId)}/ballot`, {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        })
        if (!response.ok) {
          this.error = voteErrorMessage(await errorCode(response))
          return false
        }
        this.ballot = (await response.json()) as Ballot
        return true
      } catch {
        this.error = strings.errors.network
        return false
      } finally {
        this.loading = false
      }
    },

    async save(
      phaseId: string,
      matchId: string,
      vote: { side: DuelSide; credits: number },
    ): Promise<boolean> {
      return this.mutate(phaseId, matchId, 'POST', vote)
    },

    async remove(phaseId: string, matchId: string): Promise<boolean> {
      return this.mutate(phaseId, matchId, 'DELETE')
    },

    async saveBallot(
      phaseId: string,
      targetId: string,
      kind: BallotKind,
      payload: unknown,
    ): Promise<boolean> {
      return this.mutateBallot(phaseId, targetId, 'POST', { targetId, kind, payload })
    },

    async removeBallot(phaseId: string, targetId: string): Promise<boolean> {
      return this.mutateBallot(phaseId, targetId, 'DELETE')
    },

    async mutateBallot(
      phaseId: string,
      targetId: string,
      method: 'POST' | 'DELETE',
      body?: unknown,
    ): Promise<boolean> {
      this.saving = true
      this.error = null
      this.saved = false
      try {
        const response = await fetch(
          method === 'POST'
            ? `/api/phases/${encodeURIComponent(phaseId)}/ballots`
            : `/api/phases/${encodeURIComponent(phaseId)}/ballots/${encodeURIComponent(targetId)}`,
          {
            method,
            credentials: 'same-origin',
            headers: {
              Accept: 'application/json',
              ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          },
        )
        if (!response.ok) {
          this.error = voteErrorMessage(await errorCode(response))
          return false
        }
        this.ballot = (await response.json()) as Ballot
        this.saved = true
        return true
      } catch {
        this.error = strings.errors.network
        return false
      } finally {
        this.saving = false
      }
    },

    async mutate(
      phaseId: string,
      matchId: string,
      method: 'POST' | 'DELETE',
      vote?: { side: DuelSide; credits: number },
    ): Promise<boolean> {
      this.saving = true
      this.error = null
      this.saved = false
      try {
        const response = await fetch(
          `/api/phases/${encodeURIComponent(phaseId)}/duels/${encodeURIComponent(matchId)}/votes`,
          {
            method,
            credentials: 'same-origin',
            headers: {
              Accept: 'application/json',
              ...(vote ? { 'Content-Type': 'application/json' } : {}),
            },
            ...(vote ? { body: JSON.stringify(vote) } : {}),
          },
        )
        if (!response.ok) {
          this.error = voteErrorMessage(await errorCode(response))
          return false
        }
        this.ballot = (await response.json()) as Ballot
        this.saved = true
        return true
      } catch {
        this.error = strings.errors.network
        return false
      } finally {
        this.saving = false
      }
    },

    clear(): void {
      this.ballot = null
      this.error = null
      this.saved = false
    },
  },
})
