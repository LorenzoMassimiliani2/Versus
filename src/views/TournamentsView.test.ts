import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useSessionStore } from '@/stores/session'
import TournamentsView from './TournamentsView.vue'

const TOURNAMENTS = [
  {
    id: 't1',
    slug: 'torneo-organizzato',
    name: 'Torneo organizzato',
    description: '',
    coverUrl: null,
    status: 'draft',
    role: 'owner',
    createdAt: '2026-11-10T09:00:00.000Z',
    updatedAt: '2026-11-10T09:00:00.000Z',
  },
  {
    id: 't2',
    slug: 'torneo-partecipato',
    name: 'Torneo partecipato',
    description: '',
    coverUrl: null,
    status: 'running',
    role: 'participant',
    createdAt: '2026-11-10T09:10:00.000Z',
    updatedAt: '2026-11-10T09:10:00.000Z',
  },
]

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function emptyView() {
  return { template: '<div />' }
}

async function mountView(options: { isAdmin?: boolean; path?: string } = {}): Promise<{ wrapper: ReturnType<typeof mount>; router: Router }> {
  const pinia = createPinia()
  setActivePinia(pinia)

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: TournamentsView },
      { path: '/tornei/:id', name: 'tournament', component: emptyView() },
      { path: '/admin/utenti', name: 'admin-users', component: emptyView() },
      { path: '/login', name: 'login', component: emptyView() },
    ],
  })
  await router.push(options.path ?? '/')
  await router.isReady()

  const session = useSessionStore(pinia)
  session.user = { id: 'u1', username: 'alice', isAdmin: options.isAdmin ?? false }
  session.status = 'authenticated'

  const wrapper = mount(TournamentsView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TournamentsView', () => {
  it('divide i tornei tra le tab Partecipo e Organizzo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ tournaments: TOURNAMENTS })))

    const { wrapper, router } = await mountView()

    expect(wrapper.text()).toContain('Torneo partecipato')
    expect(wrapper.text()).not.toContain('Torneo organizzato')
    expect(wrapper.find('#edit-tournament-t2').exists()).toBe(false)

    await router.push({ name: 'home', query: { tab: 'organizing' } })
    await flushPromises()

    expect(wrapper.text()).toContain('Torneo organizzato')
    expect(wrapper.text()).not.toContain('Torneo partecipato')
    expect(router.currentRoute.value.query.tab).toBe('organizing')
    expect(wrapper.get('#edit-tournament-t1').attributes('href')).toBe(
      '/tornei/t1#tournament-edit-form',
    )
  })

  it('crea un torneo e apre il dettaglio', async () => {
    const created = {
      ...TOURNAMENTS[0]!,
      id: 't3',
      slug: 'nuovo-torneo',
      name: 'Nuovo torneo',
      settings: { selfVoteAllowed: true, autoAdvance: false },
      publishedAt: null,
      startedAt: null,
      concludedAt: null,
      organizers: [],
    }
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/tournaments' && init?.method === 'POST') {
        return jsonResponse({ tournament: created }, 201)
      }
      return jsonResponse({ tournaments: [] })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { wrapper, router } = await mountView()
    await wrapper.get('#open-create-tournament').trigger('click')
    await wrapper.get('#tournament-name').setValue('Nuovo torneo')
    await wrapper.get('#create-tournament-form').trigger('submit')
    await flushPromises()

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(JSON.parse(String(post![1]!.body))).toEqual({
      name: 'Nuovo torneo',
      description: '',
      coverUrl: null,
    })
    expect(router.currentRoute.value.fullPath).toBe('/tornei/t3')
  })
})
