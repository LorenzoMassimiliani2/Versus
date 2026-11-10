import { defineStore } from 'pinia'

import { adminUsersErrorMessage, strings } from '@/lib/strings'

export interface AdminUser {
  id: string
  username: string
  isAdmin: boolean
  isActive: boolean
  createdAt: string
}

export interface InitialPassword {
  username: string
  password: string
}

interface UsersResponse {
  users: AdminUser[]
}

interface UserResponse {
  user: AdminUser
}

interface CreateResponse extends UserResponse {
  initialPassword: string
}

interface ErrorResponse {
  error?: string
}

export const useUsersStore = defineStore('users', {
  state: () => ({
    users: [] as AdminUser[],
    query: '',
    loading: false,
    error: null as string | null,
    initialPassword: null as InitialPassword | null,
  }),
  actions: {
    async search(query?: string): Promise<void> {
      const term = query ?? this.query
      this.query = term
      this.loading = true
      this.error = null
      try {
        const response = await fetch(`/api/users?q=${encodeURIComponent(term)}`, {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        })
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as ErrorResponse | null
          this.error = adminUsersErrorMessage(data?.error)
          return
        }
        this.users = ((await response.json()) as UsersResponse).users
      } catch {
        this.error = strings.errors.network
      } finally {
        this.loading = false
      }
    },

    async create(username: string, password: string): Promise<boolean> {
      return this.mutate(async () => {
        const response = await fetch('/api/users', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ username, password }),
        })
        if (!response.ok) {
          this.error = adminUsersErrorMessage(await errorCode(response))
          return false
        }

        const data = (await response.json()) as CreateResponse
        this.initialPassword = { username: data.user.username, password: data.initialPassword }
        this.users = [...this.users, data.user].sort((a, b) => a.username.localeCompare(b.username))
        return true
      })
    },

    async updateUser(id: string, flags: { isActive?: boolean; isAdmin?: boolean }): Promise<boolean> {
      return this.mutate(async () => {
        const response = await fetch(`/api/users/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(flags),
        })
        if (!response.ok) {
          this.error = adminUsersErrorMessage(await errorCode(response))
          return false
        }

        const data = (await response.json()) as UserResponse
        this.users = this.users.map((user) => (user.id === data.user.id ? data.user : user))
        return true
      })
    },

    async resetPassword(id: string, password: string): Promise<boolean> {
      return this.mutate(async () => {
        const response = await fetch(`/api/users/${encodeURIComponent(id)}/password`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        })
        if (!response.ok) {
          this.error = adminUsersErrorMessage(await errorCode(response))
          return false
        }
        return true
      })
    },

    dismissInitialPassword(): void {
      this.initialPassword = null
    },

    async mutate(run: () => Promise<boolean>): Promise<boolean> {
      this.error = null
      try {
        return await run()
      } catch {
        this.error = strings.errors.network
        return false
      }
    },
  },
})

async function errorCode(response: Response): Promise<string | undefined> {
  const data = (await response.json().catch(() => null)) as ErrorResponse | null
  return data?.error
}
