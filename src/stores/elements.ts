import { defineStore } from 'pinia'

import { elementsErrorMessage, strings } from '@/lib/strings'

export type CustomFieldType = 'text' | 'number' | 'url' | 'date'

export interface CustomField {
  id: string
  key: string
  label: string
  type: CustomFieldType
  position: number
}

export interface ElementItem {
  id: string
  userId: string | null
  name: string
  description: string
  imageUrl: string
  videoUrl: string | null
  customValues: Record<string, string | number>
  position: number
  createdAt: string
  updatedAt: string
}

export interface FieldInput {
  key: string
  label: string
  type: CustomFieldType
}

export interface ElementInput {
  name: string
  imageUrl: string
  description?: string
  videoUrl?: string | null
  customValues?: Record<string, string | number>
  userId?: string | null
}

interface FieldsResponse {
  fields: CustomField[]
}

interface FieldResponse {
  field: CustomField
}

interface ElementsResponse {
  elements: ElementItem[]
}

interface ElementResponse {
  element: ElementItem
}

interface ErrorResponse {
  error?: string
}

async function errorCode(response: Response): Promise<string | undefined> {
  const data = (await response.json().catch(() => null)) as ErrorResponse | null
  return data?.error
}

const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' }

export const useElementsStore = defineStore('elements', {
  state: () => ({
    fields: [] as CustomField[],
    elements: [] as ElementItem[],
    loading: false,
    saving: false,
    error: null as string | null,
  }),
  getters: {
    canAddField: (state) => state.fields.length < 10,
    sortedFields: (state) => [...state.fields].sort((a, b) => a.position - b.position),
  },
  actions: {
    async load(tournamentId: string): Promise<void> {
      this.loading = true
      this.error = null
      try {
        const [fieldsResponse, elementsResponse] = await Promise.all([
          fetch(`/api/tournaments/${encodeURIComponent(tournamentId)}/fields`, {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
          }),
          fetch(`/api/tournaments/${encodeURIComponent(tournamentId)}/elements`, {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
          }),
        ])
        if (!fieldsResponse.ok) {
          this.error = elementsErrorMessage(await errorCode(fieldsResponse))
          return
        }
        if (!elementsResponse.ok) {
          this.error = elementsErrorMessage(await errorCode(elementsResponse))
          return
        }
        this.fields = ((await fieldsResponse.json()) as FieldsResponse).fields ?? []
        this.elements = ((await elementsResponse.json()) as ElementsResponse).elements ?? []
      } catch {
        this.error = strings.errors.network
      } finally {
        this.loading = false
      }
    },

    async createField(tournamentId: string, input: FieldInput): Promise<boolean> {
      return this.saveField(async () => {
        const response = await fetch(
          `/api/tournaments/${encodeURIComponent(tournamentId)}/fields`,
          {
            method: 'POST',
            credentials: 'same-origin',
            headers: JSON_HEADERS,
            body: JSON.stringify(input),
          },
        )
        if (!response.ok) {
          this.error = elementsErrorMessage(await errorCode(response))
          return false
        }
        const field = ((await response.json()) as FieldResponse).field
        this.fields = [...this.fields, field]
        return true
      })
    },

    async updateField(fieldId: string, label: string): Promise<boolean> {
      return this.saveField(async () => {
        const response = await fetch(`/api/fields/${encodeURIComponent(fieldId)}`, {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: JSON_HEADERS,
          body: JSON.stringify({ label }),
        })
        if (!response.ok) {
          this.error = elementsErrorMessage(await errorCode(response))
          return false
        }
        const field = ((await response.json()) as FieldResponse).field
        this.fields = this.fields.map((item) => (item.id === field.id ? field : item))
        return true
      })
    },

    async deleteField(fieldId: string): Promise<boolean> {
      return this.saveField(async () => {
        const response = await fetch(`/api/fields/${encodeURIComponent(fieldId)}`, {
          method: 'DELETE',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        })
        if (!response.ok) {
          this.error = elementsErrorMessage(await errorCode(response))
          return false
        }
        const field = this.fields.find((item) => item.id === fieldId)
        this.fields = this.fields.filter((item) => item.id !== fieldId)
        if (field) {
          this.elements = this.elements.map((element) => {
            const values = { ...element.customValues }
            delete values[field.key]
            return { ...element, customValues: values }
          })
        }
        return true
      })
    },

    async createElement(tournamentId: string, input: ElementInput): Promise<boolean> {
      return this.saveField(async () => {
        const response = await fetch(
          `/api/tournaments/${encodeURIComponent(tournamentId)}/elements`,
          {
            method: 'POST',
            credentials: 'same-origin',
            headers: JSON_HEADERS,
            body: JSON.stringify(input),
          },
        )
        if (!response.ok) {
          this.error = elementsErrorMessage(await errorCode(response))
          return false
        }
        const element = ((await response.json()) as ElementResponse).element
        this.elements = [...this.elements, element]
        return true
      })
    },

    async updateElement(elementId: string, input: Partial<ElementInput>): Promise<boolean> {
      return this.saveField(async () => {
        const response = await fetch(`/api/elements/${encodeURIComponent(elementId)}`, {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: JSON_HEADERS,
          body: JSON.stringify(input),
        })
        if (!response.ok) {
          this.error = elementsErrorMessage(await errorCode(response))
          return false
        }
        const element = ((await response.json()) as ElementResponse).element
        this.elements = this.elements.map((item) => (item.id === element.id ? element : item))
        return true
      })
    },

    async deleteElement(elementId: string): Promise<boolean> {
      return this.saveField(async () => {
        const response = await fetch(`/api/elements/${encodeURIComponent(elementId)}`, {
          method: 'DELETE',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        })
        if (!response.ok) {
          this.error = elementsErrorMessage(await errorCode(response))
          return false
        }
        this.elements = this.elements.filter((item) => item.id !== elementId)
        this.reindex()
        return true
      })
    },

    async moveElement(tournamentId: string, elementId: string, delta: -1 | 1): Promise<boolean> {
      const current = [...this.elements].sort((a, b) => a.position - b.position)
      const index = current.findIndex((item) => item.id === elementId)
      const target = index + delta
      if (index < 0 || target < 0 || target >= current.length) return false

      const swapped = [...current]
      const [moved] = swapped.splice(index, 1)
      swapped.splice(target, 0, moved!)

      return this.saveField(async () => {
        const response = await fetch(
          `/api/tournaments/${encodeURIComponent(tournamentId)}/elements/order`,
          {
            method: 'PUT',
            credentials: 'same-origin',
            headers: JSON_HEADERS,
            body: JSON.stringify({ ids: swapped.map((item) => item.id) }),
          },
        )
        if (!response.ok) {
          this.error = elementsErrorMessage(await errorCode(response))
          return false
        }
        this.elements = ((await response.json()) as ElementsResponse).elements
        return true
      })
    },

    reindex(): void {
      this.elements = [...this.elements]
        .sort((a, b) => a.position - b.position)
        .map((item, index) => ({ ...item, position: index + 1 }))
    },

    async saveField(operation: () => Promise<boolean>): Promise<boolean> {
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
