import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import PhaseResultsView from './PhaseResultsView.vue'

const RESULTS = {
  phaseId: 'p1',
  phase: {
    id: 'p1',
    name: 'Girone A',
    position: 1,
    formula: 'group',
    voteType: 'duel',
  },
  closedAt: '2026-11-10T12:00:00.000Z',
  version: 1,
  groups: [
    {
      groupId: 'g1',
      name: 'Girone A',
      ranking: [
        { elementId: 'e1', score: 6, firstPreferences: 0, position: 1, tieBreak: null },
        { elementId: 'e2', score: 3, firstPreferences: 0, position: 2, tieBreak: null },
        { elementId: 'e3', score: 0, firstPreferences: 0, position: 3, tieBreak: null },
      ],
    },
  ],
  matches: [
    {
      matchId: 'm1',
      sideA: { elementId: 'e1', weight: 7, credits: 2, voters: 3 },
      sideB: { elementId: 'e2', weight: 5, credits: 0, voters: 2 },
      winnerElementId: 'e1',
      resolvedBy: 'weight',
    },
  ],
  ranking: [],
  qualified: ['e1', 'e2'],
  repechage: { enabled: true, selected: ['e3'], criteria: ['group_points'] },
  winnerElementId: 'e1',
  elements: [
    { id: 'e1', name: 'Canzone uno', imageUrl: 'https://images.example.test/1.jpg' },
    { id: 'e2', name: 'Canzone due', imageUrl: 'https://images.example.test/2.jpg' },
    { id: 'e3', name: 'Canzone tre', imageUrl: 'https://images.example.test/3.jpg' },
  ],
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function emptyView() {
  return { template: '<div />' }
}

async function mountView(): Promise<{ wrapper: ReturnType<typeof mount> }> {
  const pinia = createPinia()
  setActivePinia(pinia)

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: emptyView() },
      { path: '/tornei/:id', name: 'tournament', component: emptyView() },
      {
        path: '/tornei/:id/fase/:phaseId/risultati',
        name: 'phase-results',
        component: PhaseResultsView,
      },
    ],
  })
  await router.push('/tornei/t1/fase/p1/risultati')
  await router.isReady()

  const wrapper = mount(PhaseResultsView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PhaseResultsView', () => {
  it('mostra classifiche, sfide, qualificati e ripescati senza mutare lo stato', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(RESULTS))
    vi.stubGlobal('fetch', fetchMock)

    const { wrapper } = await mountView()

    expect(wrapper.text()).toContain('Girone A')
    expect(wrapper.text()).toContain('Classifiche dei gironi')
    expect(wrapper.text()).toContain('Canzone uno')
    expect(wrapper.text()).toContain('Canzone due')
    expect(wrapper.text()).toContain('Sfide')
    expect(wrapper.text()).toContain('Qualificati')
    expect(wrapper.text()).toContain('Ripescati')
    expect(wrapper.get('#results-winner').text()).toContain('Canzone uno')
    expect(wrapper.get('#results-qualified').text()).toContain('Canzone due')
    expect(wrapper.get('#results-repechage').text()).toContain('Canzone tre')

    const match = wrapper.findAll('article')[0]!
    expect(match.text()).toContain('Peso')
    expect(match.text()).toContain('Crediti')
    expect(match.text()).toContain('Votanti')
    expect(match.text()).toContain('7')
    expect(match.text()).toContain('5')

    expect(fetchMock.mock.calls.every(([, init]) => init?.method === undefined)).toBe(true)
  })

  it('mostra i messaggi di errore per una fase non chiusa', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'phase_not_closed' }, 409)),
    )

    const { wrapper } = await mountView()

    expect(wrapper.get('[role="alert"]').text()).toBe(
      'I risultati sono disponibili solo dopo la chiusura della fase.',
    )
    expect(wrapper.find('#results-winner').exists()).toBe(false)
  })
})
