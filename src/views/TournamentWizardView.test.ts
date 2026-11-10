import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import TournamentWizardView from './TournamentWizardView.vue'

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
  organizers: [
    { userId: 'u1', username: 'alice', role: 'owner', addedAt: '2026-11-10T09:00:00.000Z' },
  ],
}

const VALID_PREVIEW = {
  valid: true,
  errors: [],
  warnings: [],
  preview: { elementCount: 2, activeParticipants: 1, phases: [] },
}

const INVALID_PREVIEW = {
  valid: false,
  errors: [{ code: 'elements_min' }],
  warnings: [],
  preview: { elementCount: 0, activeParticipants: 0, phases: [] },
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

type Handler = (init?: RequestInit) => Response

function stubFetch(overrides: Record<string, Handler> = {}) {
  const base: Record<string, Handler> = {
    'GET /api/tournaments/t1': () => jsonResponse({ tournament: DETAIL }),
    'GET /api/tournaments/t1/fields': () => jsonResponse({ fields: [] }),
    'GET /api/tournaments/t1/elements': () => jsonResponse({ elements: [] }),
    'GET /api/tournaments/t1/phases': () =>
      jsonResponse({ settings: DETAIL.settings, phases: [] }),
    'GET /api/tournaments/t1/participants': () => jsonResponse({ participants: [] }),
    'GET /api/tournaments/t1/candidates': () => jsonResponse({ users: [] }),
    'GET /api/tournaments/t1/preview': () => jsonResponse(VALID_PREVIEW),
    'PATCH /api/tournaments/t1': () =>
      jsonResponse({ tournament: { ...DETAIL, name: 'Torneo rinominato' } }),
  }
  const routes = { ...base, ...overrides }
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${String(input)}`
    const handler = routes[key]
    if (!handler) throw new Error(`Richiesta non attesa: ${key}`)
    return handler(init)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function mountWizard() {
  const pinia = createPinia()
  setActivePinia(pinia)

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: emptyView() },
      { path: '/tornei/:id', name: 'tournament', component: emptyView() },
      { path: '/tornei/:id/wizard', name: 'tournament-wizard', component: TournamentWizardView },
    ],
  })
  await router.push('/tornei/t1/wizard')
  await router.isReady()

  const wrapper = mount(TournamentWizardView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TournamentWizardView', () => {
  it('mostra i passi e salva i dettagli con le impostazioni', async () => {
    const fetchMock = stubFetch()
    const { wrapper } = await mountWizard()

    for (const step of ['details', 'fields', 'elements', 'participants', 'plan', 'preview', 'publish']) {
      expect(wrapper.find(`[data-testid="wizard-step-${step}"]`).exists()).toBe(true)
    }

    expect(wrapper.get('#wizard-name').element).toHaveProperty('value', 'Torneo di prova')

    await wrapper.get('#wizard-name').setValue('Torneo rinominato')
    await wrapper.get('#wizard-auto-advance').setValue(true)
    await wrapper.get('#wizard-details-form').trigger('submit')
    await flushPromises()

    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')
    expect(JSON.parse(String(patch![1]!.body))).toEqual({
      name: 'Torneo rinominato',
      description: 'Descrizione iniziale',
      coverUrl: null,
      settings: { selfVoteAllowed: true, autoAdvance: true },
    })
    expect(wrapper.get('[role="status"]').text()).toBe('Dettagli salvati.')
  })

  it('blocca la pubblicazione quando il piano non è valido', async () => {
    stubFetch({
      'GET /api/tournaments/t1/preview': () => jsonResponse(INVALID_PREVIEW),
    })
    const { wrapper } = await mountWizard()

    await wrapper.get('[data-testid="wizard-step-publish"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="publish-blocked"]').text()).toContain(
      'Il piano non è valido',
    )
    expect(wrapper.text()).toContain('Servono almeno 2 elementi.')
    const button = wrapper.get('#wizard-publish-button')
    expect(button.attributes('disabled')).toBeDefined()
  })

  it('pubblica un piano valido e mostra lo stato published', async () => {
    const published = { ...DETAIL, status: 'published', publishedAt: '2026-11-10T10:00:00.000Z' }
    const fetchMock = stubFetch({
      'POST /api/tournaments/t1/publish': () => jsonResponse({ tournament: published }),
    })
    const { wrapper } = await mountWizard()

    await wrapper.get('[data-testid="wizard-step-publish"]').trigger('click')
    await flushPromises()

    const button = wrapper.get('#wizard-publish-button')
    expect(button.attributes('disabled')).toBeUndefined()
    await button.trigger('click')
    await flushPromises()

    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true)
    const success = wrapper.get('[data-testid="wizard-published"]')
    expect(success.text()).toContain('Torneo pubblicato')
    expect(success.text()).toContain('visibile ai partecipanti')
    expect(wrapper.text()).not.toContain('Il piano non è valido')
  })

  it('mostra il messaggio di limite quando la pubblicazione riceve 409', async () => {
    stubFetch({
      'POST /api/tournaments/t1/publish': () =>
        jsonResponse({ error: 'tournament_limit_reached' }, 409),
    })
    const { wrapper } = await mountWizard()

    await wrapper.get('[data-testid="wizard-step-publish"]').trigger('click')
    await flushPromises()
    await wrapper.get('#wizard-publish-button').trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('Limite di 10 tornei attivi raggiunto')
    expect(wrapper.find('[data-testid="wizard-published"]').exists()).toBe(false)
  })
})
