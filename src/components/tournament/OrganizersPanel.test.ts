import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'

import OrganizersPanel from './OrganizersPanel.vue'
import { useTournamentsStore, type TournamentDetail } from '@/stores/tournaments'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const DETAIL: TournamentDetail = {
  id: 't1',
  slug: 'torneo-di-prova',
  name: 'Torneo di prova',
  description: '',
  coverUrl: null,
  status: 'draft',
  role: 'owner',
  createdAt: '2026-11-10T09:00:00.000Z',
  updatedAt: '2026-11-10T09:00:00.000Z',
  settings: { selfVoteAllowed: true, autoAdvance: false },
  publishedAt: null,
  startedAt: null,
  concludedAt: null,
  organizers: [
    {
      userId: 'u1',
      username: 'alice',
      role: 'owner',
      addedAt: '2026-11-10T09:00:00.000Z',
    },
  ],
}

function mockFetch(extra?: (input: RequestInfo | URL, init?: RequestInit) => Response | null) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const custom = extra?.(input, init)
    if (custom) return custom
    if (String(input).endsWith('/candidates')) {
      return jsonResponse({
        users: [
          { id: 'u1', username: 'alice', isParticipant: false },
          { id: 'u2', username: 'bruno', isParticipant: false },
        ],
      })
    }
    return jsonResponse({})
  })
}

async function mountPanel(canManage: boolean) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const tournaments = useTournamentsStore()
  tournaments.current = structuredClone(DETAIL)

  const wrapper = mount(OrganizersPanel, {
    props: { tournamentId: 't1', canManage },
    global: { plugins: [pinia] },
  })
  await flushPromises()
  return { wrapper, tournaments }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OrganizersPanel', () => {
  it('l owner nomina un co-organizzatore tra gli utenti esistenti', async () => {
    const fetchMock = mockFetch((input, init) => {
      if (String(input) === '/api/tournaments/t1/organizers' && init?.method === 'POST') {
        return jsonResponse(
          {
            organizer: {
              userId: 'u2',
              username: 'bruno',
              role: 'co_organizer',
              addedAt: '2026-11-10T10:00:00.000Z',
            },
          },
          201,
        )
      }
      return null
    })
    vi.stubGlobal('fetch', fetchMock)

    const { wrapper, tournaments } = await mountPanel(true)
    await wrapper.get('#organizer-select').setValue('u2')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(post![0]).toBe('/api/tournaments/t1/organizers')
    expect(JSON.parse(String(post![1]!.body))).toEqual({ userId: 'u2' })
    expect(wrapper.text()).toContain('bruno')
    expect(wrapper.text()).toContain('Co-organizzatore')
    expect(tournaments.current?.organizers.map((organizer) => organizer.username)).toEqual([
      'alice',
      'bruno',
    ])
  })

  it('l owner revoca un co-organizzatore', async () => {
    const coOrganizer = {
      userId: 'u2',
      username: 'bruno',
      role: 'co_organizer' as const,
      addedAt: '2026-11-10T10:00:00.000Z',
    }
    const fetchMock = mockFetch((input, init) => {
      if (String(input) === '/api/tournaments/t1/organizers/u2' && init?.method === 'DELETE') {
        return new Response(null, { status: 204 })
      }
      return null
    })
    vi.stubGlobal('fetch', fetchMock)

    const { wrapper, tournaments } = await mountPanel(true)
    tournaments.current!.organizers = [...tournaments.current!.organizers, coOrganizer]
    await flushPromises()

    const revoke = wrapper.findAll('button').find((button) => button.text() === 'Revoca')
    await revoke!.trigger('click')
    await flushPromises()

    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true)
    expect(wrapper.text()).not.toContain('Revoca')
    expect(tournaments.current?.organizers).toHaveLength(1)
  })

  it('un co-organizzatore vede la lista ma non può nominare né revocare', async () => {
    vi.stubGlobal('fetch', mockFetch())

    const { wrapper, tournaments } = await mountPanel(false)
    tournaments.current!.organizers = [
      ...tournaments.current!.organizers,
      {
        userId: 'u2',
        username: 'bruno',
        role: 'co_organizer',
        addedAt: '2026-11-10T10:00:00.000Z',
      },
    ]
    await flushPromises()

    expect(wrapper.text()).toContain('alice')
    expect(wrapper.text()).toContain('bruno')
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.find('button').exists()).toBe(false)
  })
})
