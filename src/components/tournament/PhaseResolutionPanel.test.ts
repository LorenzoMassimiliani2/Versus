import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'

import PhaseResolutionPanel from './PhaseResolutionPanel.vue'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const TARGETS = {
  phase: { id: 'p1', name: 'Finale', position: 2, status: 'awaiting_resolution' },
  targets: [
    {
      targetId: 'p1',
      name: 'Finale',
      elements: [
        { id: 'e1', name: 'Alfa' },
        { id: 'e2', name: 'Beta' },
      ],
    },
  ],
}

function mockFetch() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/resolution') && !init?.method) {
      return jsonResponse(TARGETS)
    }
    if (url.endsWith('/resolve') && init?.method === 'POST') {
      return jsonResponse({ phase: { id: 'p1', status: 'closed' }, result: {} })
    }
    return jsonResponse({})
  })
}

async function mountPanel() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(PhaseResolutionPanel, {
    props: { phaseId: 'p1', phaseName: 'Finale' },
    global: { plugins: [pinia] },
  })
  await flushPromises()
  return wrapper
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PhaseResolutionPanel', () => {
  it('mostra i target ambigui e invia ordine e nota', async () => {
    const fetchMock = mockFetch()
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = await mountPanel()

    expect(wrapper.findAll('[data-testid="resolution-target"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-testid="resolution-element"]').map((row) => row.text())).toEqual([
      expect.stringContaining('Alfa'),
      expect.stringContaining('Beta'),
    ])

    const firstRowButtons = wrapper.findAll('[data-testid="resolution-element"]')[0]!.findAll('button')
    await firstRowButtons[1]!.trigger('click')
    await wrapper.get('#resolution-note').setValue('Sorteggio alla presenza dei capitani')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(post![0]).toBe('/api/phases/p1/resolve')
    expect(JSON.parse(String(post![1]!.body))).toEqual({
      note: 'Sorteggio alla presenza dei capitani',
      resolutions: [{ targetId: 'p1', ordering: ['e2', 'e1'] }],
    })
    expect(wrapper.emitted('resolved')).toHaveLength(1)
  })

  it('non conferma senza una nota', async () => {
    vi.stubGlobal('fetch', mockFetch())

    const wrapper = await mountPanel()
    const confirm = wrapper.get('[data-testid="resolution-confirm"]')

    expect(confirm.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Inserisci una nota')
  })
})
