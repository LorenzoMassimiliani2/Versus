import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import TournamentDetailView from './TournamentDetailView.vue'

const DETAIL = {
  id: 't1',
  slug: 'torneo-di-prova',
  name: 'Torneo di prova',
  description: 'Descrizione iniziale',
  coverUrl: null,
  status: 'draft',
  role: 'owner',
  settings: { selfVoteAllowed: true, autoAdvance: false },
  createdAt: '2026-11-10T09:00:00.000Z',
  updatedAt: '2026-11-10T09:00:00.000Z',
  publishedAt: null,
  startedAt: null,
  concludedAt: null,
  organizers: [{ userId: 'u1', username: 'alice', role: 'owner', addedAt: '2026-11-10T09:00:00.000Z' }],
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
      { path: '/tornei/:id', name: 'tournament', component: TournamentDetailView },
    ],
  })
  await router.push('/tornei/t1')
  await router.isReady()

  const wrapper = mount(TournamentDetailView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TournamentDetailView', () => {
  it('mostra la bozza agli organizzatori e ne salva le modifiche', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/tournaments/t1' && init?.method === 'PATCH') {
        return jsonResponse({
          tournament: { ...DETAIL, name: 'Torneo rinominato', description: 'Nuova descrizione' },
        })
      }
      return jsonResponse({ tournament: DETAIL })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { wrapper } = await mountView()

    expect(wrapper.text()).toContain('Torneo di prova')
    expect(wrapper.text()).toContain('visibile solo agli organizzatori')
    expect(wrapper.text()).toContain('alice')

    await wrapper.get('#edit-name').setValue('Torneo rinominato')
    await wrapper.get('#edit-description').setValue('Nuova descrizione')
    await wrapper.get('#tournament-edit-form').trigger('submit')
    await flushPromises()

    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')
    expect(JSON.parse(String(patch![1]!.body))).toEqual({
      name: 'Torneo rinominato',
      description: 'Nuova descrizione',
      coverUrl: null,
      settings: { selfVoteAllowed: true, autoAdvance: false },
    })
    expect(wrapper.text()).toContain('Torneo rinominato')
    expect(wrapper.get('[role="status"]').text()).toBe('Modifiche salvate.')
  })

  it('mostra la gestione dei partecipanti all organizzatore', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/participants')) {
        return jsonResponse({
          participants: [
            {
              userId: 'u2',
              username: 'bruno',
              status: 'active',
              addedBy: 'u1',
              addedAt: '2026-11-10T09:00:00.000Z',
              removedAt: null,
            },
          ],
        })
      }
      if (String(input).endsWith('/candidates')) {
        return jsonResponse({ users: [{ id: 'u3', username: 'carla', isParticipant: false }] })
      }
      return jsonResponse({ tournament: DETAIL })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { wrapper } = await mountView()

    expect(wrapper.text()).toContain('Partecipanti')
    expect(wrapper.text()).toContain('Aggiungi partecipante')
    expect(wrapper.text()).toContain('bruno')
    expect(wrapper.text()).toContain('1/20 partecipanti attivi')
  })

  it('mostra il dettaglio al partecipante senza comandi di gestione', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          tournament: {
            ...DETAIL,
            role: 'participant',
            status: 'published',
          },
        }),
      ),
    )

    const { wrapper } = await mountView()

    expect(wrapper.text()).toContain('Torneo di prova')
    expect(wrapper.text()).toContain('Organizzatori')
    expect(wrapper.text()).toContain('alice')
    expect(wrapper.text()).not.toContain('Aggiungi partecipante')
    expect(wrapper.find('#tournament-edit-form').exists()).toBe(false)
  })

  it('non mostra il form di modifica a chi non è organizzatore', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          tournament: {
            ...DETAIL,
            role: 'participant',
            status: 'running',
            organizers: [],
          },
        }),
      ),
    )

    const { wrapper } = await mountView()

    expect(wrapper.find('#tournament-edit-form').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('visibile solo agli organizzatori')
  })
})
