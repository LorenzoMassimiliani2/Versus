import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'

import PhasesPanel from './PhasesPanel.vue'
import type { Phase } from '@/stores/phases'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function phase(overrides: Partial<Phase> = {}): Phase {
  return {
    id: 'p1',
    position: 1,
    name: 'Gironi',
    formula: 'group',
    voteType: 'ranking',
    config: {
      deadline: null,
      closeTriggers: [],
      secrecy: 'live',
      votingMode: 'simultaneous',
      credits: { perVoter: 0, maxPerMatch: null },
    },
    advance: { type: 'top_per_group', n: 2 },
    status: 'pending',
    openedAt: null,
    closedAt: null,
    createdAt: '2026-11-10T09:00:00.000Z',
    updatedAt: '2026-11-10T09:00:00.000Z',
    ...overrides,
  }
}

function planMock(phases: Phase[], extra?: (input: RequestInfo | URL, init?: RequestInit) => Response | null) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const custom = extra?.(input, init)
    if (custom) return custom
    if (String(input) === '/api/tournaments/t1/phases' && init?.method === undefined) {
      return jsonResponse({
        settings: { selfVoteAllowed: true, autoAdvance: false },
        phases,
      })
    }
    return jsonResponse({ phases })
  })
}

async function mountPanel(editable = true) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(PhasesPanel, {
    props: { tournamentId: 't1', editable },
    global: { plugins: [pinia] },
  })
  await flushPromises()
  return wrapper
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PhasesPanel', () => {
  it('elenca le fasi e ne mostra l anteprima struttura', async () => {
    vi.stubGlobal(
      'fetch',
      planMock([
        phase({ id: 'p1', position: 1, name: 'Gironi' }),
        phase({
          id: 'p2',
          position: 2,
          name: 'Finale',
          formula: 'ranking',
          voteType: 'pick',
          advance: { type: 'winner' },
        }),
      ]),
    )

    const wrapper = await mountPanel()

    expect(wrapper.findAll('[data-testid="phase-item"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('Gironi')
    expect(wrapper.text()).toContain('Pick')
    const preview = wrapper.get('[data-testid="plan-preview"]').text()
    expect(preview).toContain('1. Gironi')
    expect(preview).toContain('I migliori 2 per girone')
    expect(preview).toContain('2. Finale')
    expect(preview).toContain('Il vincitore')
  })

  it('crea una fase con formula, scheda e avanzamento scelti', async () => {
    const fetchMock = planMock([], (input, init) => {
      if (String(input) === '/api/tournaments/t1/phases' && init?.method === 'POST') {
        return jsonResponse({ phase: phase({ id: 'new', name: 'Semifinali' }) }, 201)
      }
      return null
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = await mountPanel()
    await wrapper.get('#phase-name').setValue('Semifinali')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(post![0]).toBe('/api/tournaments/t1/phases')
    expect(JSON.parse(String(post![1]!.body))).toMatchObject({
      name: 'Semifinali',
      formula: 'group',
      voteType: 'ranking',
      advance: { type: 'top_per_group', n: 2 },
    })
    expect(wrapper.text()).toContain('Semifinali')
  })

  it('sposta una fase e invia il nuovo ordine', async () => {
    const starts = [
      phase({ id: 'p1', position: 1, name: 'Prima' }),
      phase({ id: 'p2', position: 2, name: 'Seconda' }),
    ]
    const fetchMock = planMock(starts, (input, init) => {
      if (String(input).endsWith('/phases/order') && init?.method === 'PUT') {
        return jsonResponse({
          phases: [
            phase({ id: 'p2', position: 1, name: 'Seconda' }),
            phase({ id: 'p1', position: 2, name: 'Prima' }),
          ],
        })
      }
      return null
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = await mountPanel()
    const down = wrapper.findAll('button').find((button) => button.text() === 'Sposta giù')
    await down!.trigger('click')
    await flushPromises()

    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(JSON.parse(String(put![1]!.body))).toEqual({ ids: ['p2', 'p1'] })
    expect(wrapper.get('[data-testid="plan-preview"]').text()).toContain('1. Seconda')
  })

  it('non mostra i comandi di modifica quando il piano non è modificabile', async () => {
    vi.stubGlobal('fetch', planMock([phase({ status: 'open' })]))

    const wrapper = await mountPanel(false)

    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.findAll('button')).toHaveLength(0)
    expect(wrapper.text()).toContain('solo prima dell avvio')
  })
})
