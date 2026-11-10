import { defineStore } from 'pinia'

import { authErrorMessage, strings } from '@/lib/strings'

export interface SessionUser {
  id: string
  username: string
  isAdmin: boolean
}

export type SessionStatus = 'idle' | 'loading' | 'authenticated' | 'anonymous'

interface MeResponse {
  user: SessionUser
}

interface ErrorResponse {
  error?: string
}

export const useSessionStore = defineStore('session', {
  state: () => ({
    user: null as SessionUser | null,
    status: 'idle' as SessionStatus,
    error: null as string | null,
  }),
  getters: {
    isAuthenticated: (state) => state.user !== null,
  },
  actions: {
    async refresh(): Promise<void> {
      this.status = 'loading'
      try {
        const response = await fetch('/api/me', {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        })
        if (response.ok) {
          const data = (await response.json()) as MeResponse
          this.user = data.user
          this.status = 'authenticated'
          return
        }
        this.user = null
        this.status = 'anonymous'
      } catch {
        this.user = null
        this.status = 'anonymous'
      }
    },

    async ensureLoaded(): Promise<void> {
      if (this.status === 'idle') await this.refresh()
    },

    async login(username: string, password: string): Promise<boolean> {
      this.error = null
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        })
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as ErrorResponse | null
          this.error = authErrorMessage(data?.error)
          this.user = null
          this.status = 'anonymous'
          return false
        }

        const data = (await response.json()) as MeResponse
        this.user = data.user
        this.status = 'authenticated'
        return true
      } catch {
        this.error = strings.errors.network
        this.status = 'anonymous'
        return false
      }
    },

    async logout(): Promise<void> {
      try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
      } finally {
        this.user = null
        this.status = 'anonymous'
        this.error = null
      }
    },
  },
})
