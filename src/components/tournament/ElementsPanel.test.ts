import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'

import CustomFieldsPanel from './CustomFieldsPanel.vue'
import ElementsPanel from './ElementsPanel.vue'
import { useElementsStore, type CustomField, type ElementItem } from '@/stores/elements'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const FIELDS: CustomField[] = [
  { id: 'f1', key: 'genere', label: 'Genere', type: 'text', position: 1 },
  { id: 'f2', key: 'anno', label: 'Anno', type: 'number', position: 2 },
]

function element(id: string, name: string, position: number): ElementItem {
  return {
    id,
    userId: null,
    name,
    description: '',
    imageUrl: `https://images.example.test/${id}.jpg`,
    videoUrl: null,
    customValues: {},
    position,
    createdAt: '2026-11-10T09:00:00.000Z',
    updatedAt: '2026-11-10T09:00:00.000Z',
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CustomFieldsPanel', () => {
  it('blocca l aggiunta quando ci sono già 10 campi', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useElementsStore()
    store.fields = Array.from({ length: 10 }, (_, index) => ({
      id: `f${index}`,
      key: `campo_${index}`,
      label: `Campo ${index}`,
      type: 'text' as const,
      position: index + 1,
    }))

    const wrapper = mount(CustomFieldsPanel, {
      props: { tournamentId: 't1' },
      global: { plugins: [pinia] },
    })

    expect(wrapper.text()).toContain('Hai raggiunto il limite di 10 campi personalizzati.')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
  })
})

describe('ElementsPanel', () => {
  it('invia il nuovo elemento con immagine e valori tipizzati', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useElementsStore()
    store.fields = FIELDS

    const created = { ...element('e1', 'Canzone', 1), customValues: { genere: 'pop', anno: 1999 } }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ element: created }, 201))
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mount(ElementsPanel, {
      props: { tournamentId: 't1' },
      global: { plugins: [pinia] },
    })

    await wrapper.get('#element-name').setValue('Canzone')
    await wrapper.get('#element-image').setValue('https://images.example.test/e1.jpg')
    await wrapper.get('#element-field-genere').setValue('pop')
    await wrapper.get('#element-field-anno').setValue('1999')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const [path, init] = fetchMock.mock.calls[0]!
    expect(path).toBe('/api/tournaments/t1/elements')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      name: 'Canzone',
      description: '',
      imageUrl: 'https://images.example.test/e1.jpg',
      videoUrl: null,
      customValues: { genere: 'pop', anno: 1999 },
    })
    expect(store.elements).toHaveLength(1)
  })

  it('riordina con i bottoni accessibili e persiste l ordine', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useElementsStore()
    const first = element('e1', 'Prima', 1)
    const second = element('e2', 'Seconda', 2)
    store.elements = [first, second]

    const reordered = [{ ...second, position: 1 }, { ...first, position: 2 }]
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ elements: reordered }))
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mount(ElementsPanel, {
      props: { tournamentId: 't1' },
      global: { plugins: [pinia] },
    })

    await wrapper.get('button[aria-label="Sposta giù: Prima"]').trigger('click')
    await flushPromises()

    const [path, init] = fetchMock.mock.calls[0]!
    expect(path).toBe('/api/tournaments/t1/elements/order')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({ ids: ['e2', 'e1'] })
    expect(store.elements.map((item) => item.name)).toEqual(['Seconda', 'Prima'])
  })
})
