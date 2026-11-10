import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import PhaseVoteView from './PhaseVoteView.vue'

const BALLOT = {
  phase: {
    id: 'p1',
    tournamentId: 't1',
    name: 'Semifinali',
    status: 'open',
    voteType: 'duel',
  },
  budget: 5,
  maxPerMatch: 2,
  balance: 5,
  matches: [
    {
      id: 'm1',
      groupId: null,
      round: 1,
      position: 1,
      status: 'open',
      sideA: {
        elementId: 'e1',
        name: 'Elemento Uno',
        imageUrl: 'https://images.example.test/e1.jpg',
        videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      },
      sideB: {
        elementId: 'e2',
        name: 'Elemento Due',
        imageUrl: 'https://images.example.test/e2.jpg',
        videoUrl: null,
      },
      vote: null as { side: string; credits: number } | null,
    },
  ],
  completion: { voted: 0, total: 1 },
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

async function mountView(): Promise<ReturnType<typeof mount>> {
  const pinia = createPinia()
  setActivePinia(pinia)

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: emptyView() },
      { path: '/tornei/:id', name: 'tournament', component: emptyView() },
      { path: '/tornei/:id/fase/:phaseId/voto', name: 'phase-vote', component: PhaseVoteView },
    ],
  })
  await router.push('/tornei/t1/fase/p1/voto')
  await router.isReady()

  const wrapper = mount(PhaseVoteView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return wrapper
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PhaseVoteView', () => {
  it('salva il voto con i crediti scelti e rilegge il saldo', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/votes') && init?.method === 'POST') {
        return jsonResponse({
          ...BALLOT,
          balance: 3,
          completion: { voted: 1, total: 1 },
          matches: [{ ...BALLOT.matches[0], vote: { side: 'a', credits: 2 } }],
        })
      }
      return jsonResponse(BALLOT)
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = await mountView()

    expect(wrapper.get('#vote-balance').text()).toContain('5')
    expect(wrapper.get('#vote-completion').text()).toContain('0/1')
    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.get('#play-video-e1').text()).toBe('Riproduci video')

    await wrapper.get('#play-video-e1').trigger('click')
    expect(wrapper.find('iframe').exists()).toBe(true)

    await wrapper.get('#pick-a-m1').trigger('click')
    await wrapper.get('#credits-plus-m1').trigger('click')
    await wrapper.get('#credits-plus-m1').trigger('click')
    expect(wrapper.get('#credits-value-m1').text()).toBe('2')

    await wrapper.get('#save-vote-m1').trigger('click')
    await flushPromises()

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(JSON.parse(String(post![1]!.body))).toEqual({ side: 'a', credits: 2 })
    expect(wrapper.get('#vote-balance').text()).toContain('3')
    expect(wrapper.get('#vote-completion').text()).toContain('1/1')
    expect(wrapper.text()).toContain('Voto salvato.')
  })

  it('rilegge il proprio voto e permette di rimuoverlo', async () => {
    const withVote = {
      ...BALLOT,
      balance: 3,
      completion: { voted: 1, total: 1 },
      matches: [{ ...BALLOT.matches[0], vote: { side: 'b', credits: 2 } }],
    }
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/votes') && init?.method === 'DELETE') {
        return jsonResponse({ ...BALLOT, matches: [{ ...BALLOT.matches[0], vote: null }] })
      }
      return jsonResponse(withVote)
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = await mountView()

    expect(wrapper.get('#credits-value-m1').text()).toBe('2')
    expect(wrapper.get('#pick-b-m1').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('#vote-completion').text()).toContain('1/1')

    await wrapper.get('#remove-vote-m1').trigger('click')
    await flushPromises()

    const remove = fetchMock.mock.calls.find(([, init]) => init?.method === 'DELETE')
    expect(String(remove![0])).toContain('/api/phases/p1/duels/m1/votes')
    expect(wrapper.get('#vote-balance').text()).toContain('5')
    expect(wrapper.get('#vote-completion').text()).toContain('0/1')
  })

  it('disabilita il salvataggio quando la fase è chiusa', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ ...BALLOT, phase: { ...BALLOT.phase, status: 'closed' } }),
      ),
    )

    const wrapper = await mountView()

    expect(wrapper.text()).toContain('La fase non è aperta')
    expect(wrapper.get('#save-vote-m1').attributes('disabled')).toBeDefined()
    expect(wrapper.get('#pick-a-m1').attributes('disabled')).toBeDefined()
  })
})

const RANKING_BALLOT = {
  phase: {
    id: 'p1',
    tournamentId: 't1',
    name: 'Finale classifica',
    status: 'open',
    voteType: 'ranking',
  },
  budget: 0,
  maxPerMatch: 0,
  balance: 0,
  matches: [],
  targets: [
    {
      id: 'p1',
      name: 'Finale classifica',
      elements: [
        { elementId: 'e1', name: 'Elemento Uno', imageUrl: 'https://images.example.test/e1.jpg', videoUrl: null },
        { elementId: 'e2', name: 'Elemento Due', imageUrl: 'https://images.example.test/e2.jpg', videoUrl: null },
      ],
      vote: null as { kind: string; assignments: Array<{ elementId: string; points: number }> } | null,
      points: { scale: [5, 3, 1], used: [] as number[], remaining: [5, 3, 1] },
    },
  ],
  completion: { voted: 0, total: 1 },
}

const PICK_BALLOT = {
  phase: {
    id: 'p1',
    tournamentId: 't1',
    name: 'Scelta finale',
    status: 'open',
    voteType: 'pick',
  },
  budget: 0,
  maxPerMatch: 0,
  balance: 0,
  matches: [],
  targets: [
    {
      id: 'p1',
      name: 'Scelta finale',
      elements: [
        { elementId: 'e1', name: 'Elemento Uno', imageUrl: 'https://images.example.test/e1.jpg', videoUrl: null },
        { elementId: 'e2', name: 'Elemento Due', imageUrl: 'https://images.example.test/e2.jpg', videoUrl: null },
      ],
      vote: null as { kind: string; elementId: string } | null,
      points: { scale: [1], used: [] as number[], remaining: [1] },
    },
  ],
  completion: { voted: 0, total: 1 },
}

describe('PhaseVoteView con schede classifica e pick', () => {
  it('mostra i punti residui, impedisce valori duplicati e salva la scheda classifica', async () => {
    const saved = {
      ...RANKING_BALLOT,
      targets: [
        {
          ...RANKING_BALLOT.targets[0],
          vote: { kind: 'ranking', assignments: [{ elementId: 'e1', points: 5 }] },
          points: { scale: [5, 3, 1], used: [5], remaining: [3, 1] },
        },
      ],
      completion: { voted: 1, total: 1 },
    }
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/ballots') && init?.method === 'POST') {
        return jsonResponse(saved)
      }
      return jsonResponse(RANKING_BALLOT)
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = await mountView()

    expect(wrapper.text()).toContain('Vota la classifica')
    expect(wrapper.get('#ranking-remaining-p1').text()).toContain('3')
    expect(wrapper.get('#vote-completion').text()).toContain('0/1')

    await wrapper.get('#rank-points-e1').setValue('5')
    expect(wrapper.get('#ranking-remaining-p1').text()).toContain('2')
    const e2Options = wrapper
      .get('#rank-points-e2')
      .findAll('option')
      .map((option) => (option.element as HTMLOptionElement).value)
    expect(e2Options).not.toContain('5')
    expect(wrapper.get('#ranking-order-p1').text()).toContain('Elemento Uno')

    await wrapper.get('#save-ranking-p1').trigger('click')
    await flushPromises()

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(String(post![0])).toContain('/api/phases/p1/ballots')
    expect(JSON.parse(String(post![1]!.body))).toEqual({
      targetId: 'p1',
      kind: 'ranking',
      payload: { assignments: [{ elementId: 'e1', points: 5 }] },
    })
    expect(wrapper.get('#vote-completion').text()).toContain('1/1')
    expect(wrapper.find('#remove-ranking-p1').exists()).toBe(true)
  })

  it('salva una scelta singola e la rimuove', async () => {
    const voted = {
      ...PICK_BALLOT,
      targets: [
        {
          ...PICK_BALLOT.targets[0],
          vote: { kind: 'pick', elementId: 'e2' },
          points: { scale: [1], used: [1], remaining: [] },
        },
      ],
      completion: { voted: 1, total: 1 },
    }
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return jsonResponse(voted)
      if (init?.method === 'DELETE') return jsonResponse(PICK_BALLOT)
      return jsonResponse(PICK_BALLOT)
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = await mountView()

    expect(wrapper.text()).toContain('Vota la scelta')
    await wrapper.get('#pick-element-e1').trigger('click')
    expect(wrapper.get('#pick-element-e1').attributes('aria-pressed')).toBe('true')
    await wrapper.get('#pick-element-e2').trigger('click')
    expect(wrapper.get('#pick-element-e1').attributes('aria-pressed')).toBe('false')
    expect(wrapper.get('#pick-element-e2').attributes('aria-pressed')).toBe('true')

    await wrapper.get('#save-pick-p1').trigger('click')
    await flushPromises()

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(String(post![0])).toContain('/api/phases/p1/ballots')
    expect(JSON.parse(String(post![1]!.body))).toEqual({
      targetId: 'p1',
      kind: 'pick',
      payload: { elementId: 'e2' },
    })
    expect(wrapper.get('#vote-completion').text()).toContain('1/1')

    await wrapper.get('#remove-pick-p1').trigger('click')
    await flushPromises()
    const remove = fetchMock.mock.calls.find(([, init]) => init?.method === 'DELETE')
    expect(String(remove![0])).toContain('/api/phases/p1/ballots/p1')
  })
})
