import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ParticipantsPanel from './ParticipantsPanel.vue'
import type { CandidateUser, TournamentParticipant } from '@/stores/participants'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function participant(
  userId: string,
  username: string,
  status: 'active' | 'removed' = 'active',
): TournamentParticipant {
  return {
    userId,
    username,
    status,
    addedBy: 'u1',
    addedAt: '2026-11-10T09:00:00.000Z',
    removedAt: status === 'removed' ? '2026-11-10T10:00:00.000Z' : null,
  }
}

function candidates(): CandidateUser[] {
  return [
    { id: 'u2', username: 'bruno', isParticipant: true },
    { id: 'u3', username: 'carla', isParticipant: false },
  ]
}

function mockLoad(
  participants: TournamentParticipant[],
  users: CandidateUser[] = candidates(),
  extra?: (input: RequestInfo | URL, init?: RequestInit) => Response | null,
) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const custom = extra?.(input, init)
    if (custom) return custom
    if (String(input).endsWith('/participants') && init?.method === undefined) {
      return jsonResponse({ participants })
    }
    if (String(input).endsWith('/candidates')) return jsonResponse({ users })
    return jsonResponse({})
  })
}

async function mountPanel(editable = true) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(ParticipantsPanel, {
    props: { tournamentId: 't1', editable },
    global: { plugins: [pinia] },
  })
  await flushPromises()
  return wrapper
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ParticipantsPanel', () => {
  it('elenca partecipanti attivi e rimossi con il loro stato e il conteggio', async () => {
    vi.stubGlobal(
      'fetch',
      mockLoad([participant('u2', 'bruno'), participant('u3', 'carla', 'removed')]),
    )

    const wrapper = await mountPanel()

    expect(wrapper.get('[data-testid="participant-count"]').text()).toBe(
      '1/20 partecipanti attivi',
    )
    expect(wrapper.text()).toContain('bruno')
    expect(wrapper.text()).toContain('Attivo')
    expect(wrapper.text()).toContain('carla')
    expect(wrapper.text()).toContain('Rimosso')
  })

  it('aggiunge un utente selezionato tra i candidati', async () => {
    const fetchMock = mockLoad([], undefined, (input, init) => {
      if (String(input) === '/api/tournaments/t1/participants' && init?.method === 'POST') {
        return jsonResponse({ participant: participant('u3', 'carla') }, 201)
      }
      return null
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = await mountPanel()
    await wrapper.get('#participant-select').setValue('u3')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(post![0]).toBe('/api/tournaments/t1/participants')
    expect(JSON.parse(String(post![1]!.body))).toEqual({ userId: 'u3' })
    expect(wrapper.text()).toContain('carla')
    expect(wrapper.get('[data-testid="participant-count"]').text()).toBe(
      '1/20 partecipanti attivi',
    )
  })

  it('rimuove un partecipante attivo e ne mostra lo stato aggiornato', async () => {
    const fetchMock = mockLoad([participant('u2', 'bruno')], undefined, (input, init) => {
      if (String(input) === '/api/tournaments/t1/participants/u2' && init?.method === 'DELETE') {
        return new Response(null, { status: 204 })
      }
      return null
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = await mountPanel()
    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true)
    expect(wrapper.text()).toContain('Rimosso')
    expect(wrapper.get('[data-testid="participant-count"]').text()).toBe(
      '0/20 partecipanti attivi',
    )
  })

  it('blocca la selezione quando si raggiungono 20 partecipanti attivi', async () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      participant(`u${index + 2}`, `utente${index + 2}`),
    )
    vi.stubGlobal('fetch', mockLoad(many))

    const wrapper = await mountPanel()

    expect(wrapper.text()).toContain('Limite di 20 partecipanti attivi raggiunto.')
    expect(wrapper.get('#participant-select').attributes('disabled')).toBeDefined()
  })

  it('non mostra i comandi di modifica quando il torneo non è in bozza', async () => {
    vi.stubGlobal('fetch', mockLoad([participant('u2', 'bruno')]))

    const wrapper = await mountPanel(false)

    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).toContain('solo tra una fase e l altra')
    expect(wrapper.find('button').exists()).toBe(false)
  })
})
