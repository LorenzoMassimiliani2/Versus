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

async function mountPanel(
  editable = true,
  canOpen = false,
  extra: Record<string, unknown> = {},
) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(PhasesPanel, {
    props: { tournamentId: 't1', editable, canOpen, ...extra },
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

  it('indica le fasi bloccate e lascia modificabili le pending dopo una fase chiusa', async () => {
    vi.stubGlobal(
      'fetch',
      planMock([
        phase({ id: 'p1', position: 1, name: 'Gironi', status: 'closed' }),
        phase({ id: 'p2', position: 2, name: 'Finale', formula: 'ranking', voteType: 'pick', advance: { type: 'winner' } }),
      ]),
    )

    const wrapper = await mountPanel(true)

    expect(wrapper.findAll('[data-testid="phase-blocked"]')).toHaveLength(1)
    const items = wrapper.findAll('[data-testid="phase-item"]')
    const closedButtons = items[0]!.findAll('button')
    const pendingButtons = items[1]!.findAll('button')
    expect(
      closedButtons.some(
        (button) => button.text() === 'Modifica' && button.attributes('disabled') !== undefined,
      ),
    ).toBe(true)
    expect(
      pendingButtons.some(
        (button) => button.text() === 'Modifica' && button.attributes('disabled') === undefined,
      ),
    ).toBe(true)
    expect(wrapper.text()).toContain('Per aggiungere una fase devi prima chiudere')
  })

  it('blocca una fase pending la cui precedente non è chiusa', async () => {
    vi.stubGlobal(
      'fetch',
      planMock([
        phase({ id: 'p1', position: 1, name: 'Gironi', status: 'open' }),
        phase({ id: 'p2', position: 2, name: 'Finale', formula: 'ranking', voteType: 'pick', advance: { type: 'winner' } }),
      ]),
    )

    const wrapper = await mountPanel(true)

    expect(wrapper.findAll('[data-testid="phase-blocked"]')).toHaveLength(2)
  })
})
describe('apertura della fase', () => {
  function openedOperation() {
    return {
      entrants: [
        { elementId: 'e1', name: 'Alfa', seed: 1, position: 1 },
        { elementId: 'e2', name: 'Beta', seed: 2, position: 2 },
        { elementId: 'e3', name: 'Gamma', seed: 3, position: 3 },
        { elementId: 'e4', name: 'Delta', seed: 4, position: 4 },
      ],
      voters: [
        { userId: 'u1', creditsBudget: 5 },
        { userId: 'u2', creditsBudget: 5 },
      ],
      groups: [
        {
          id: 'g1',
          name: 'Girone A',
          position: 1,
          members: [
            { elementId: 'e1', position: 1 },
            { elementId: 'e2', position: 2 },
          ],
        },
      ],
      matches: [
        {
          id: 'm1',
          groupId: 'g1',
          round: 1,
          position: 1,
          sideA: 'e1',
          sideB: 'e2',
          winnerElementId: null,
          status: 'open',
        },
      ],
    }
  }

  it('apre una fase senza ripescaggio e mostra gironi e sfide', async () => {
    const fetchMock = planMock([phase({ status: 'pending' })], (input, init) => {
      const url = String(input)
      if (url.endsWith('/open-preview') && init?.method === undefined) {
        return jsonResponse({
          entrants: [],
          directQualified: [],
          repechage: null,
        })
      }
      if (url.endsWith('/open') && init?.method === 'POST') {
        return jsonResponse({
          phase: phase({ status: 'open' }),
          operation: openedOperation(),
        })
      }
      return null
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = await mountPanel(false, true)
    await wrapper.get('[data-testid="open-phase"]').trigger('click')
    await flushPromises()

    const post = fetchMock.mock.calls.find(([input, init]) => {
      return String(input).endsWith('/open') && init?.method === 'POST'
    })
    expect(JSON.parse(String(post![1]!.body))).toEqual({})
    const operation = wrapper.get('[data-testid="phase-operation"]').text()
    expect(operation).toContain('2 votanti')
    expect(operation).toContain('Girone A')
    expect(operation).toContain('Alfa')
    expect(operation).toContain('Alfa vs Beta')
  })

  it('permette di sostituire i ripescati prima dell apertura', async () => {
    const fetchMock = planMock(
      [phase({ status: 'pending', advance: { type: 'top_global', n: 2 } })],
      (input, init) => {
        const url = String(input)
        if (url.endsWith('/open-preview') && init?.method === undefined) {
          return jsonResponse({
            entrants: [],
            directQualified: [{ id: 'e1', name: 'Alfa' }],
            repechage: {
              targetSize: 3,
              slots: 2,
              selected: [
                { id: 'e2', name: 'Beta' },
                { id: 'e3', name: 'Gamma' },
              ],
              excluded: [
                { id: 'e2', name: 'Beta' },
                { id: 'e3', name: 'Gamma' },
                { id: 'e4', name: 'Delta' },
              ],
            },
          })
        }
        if (url.endsWith('/open') && init?.method === 'POST') {
          return jsonResponse({
            phase: phase({ status: 'open' }),
            operation: openedOperation(),
          })
        }
        return null
      },
    )
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = await mountPanel(false, true)
    await wrapper.get('[data-testid="open-phase"]').trigger('click')
    await flushPromises()

    const boxes = wrapper.findAll('input[type="checkbox"]')
    expect(boxes).toHaveLength(3)
    expect((boxes[0]!.element as HTMLInputElement).checked).toBe(true)
    await boxes[0]!.trigger('change')
    await boxes[2]!.trigger('change')
    await wrapper.get('[data-testid="confirm-open"]').trigger('click')
    await flushPromises()

    const post = fetchMock.mock.calls.find(([input, init]) => {
      return String(input).endsWith('/open') && init?.method === 'POST'
    })
    expect(JSON.parse(String(post![1]!.body))).toEqual({
      repechageOverride: ['e3', 'e4'],
    })
  })

  it('con autoAdvance attivo non mostra l override e apre con i ripescati automatici', async () => {
    const fetchMock = planMock(
      [phase({ status: 'pending', advance: { type: 'top_global', n: 2 } })],
      (input, init) => {
        const url = String(input)
        if (url.endsWith('/open-preview') && init?.method === undefined) {
          return jsonResponse({
            entrants: [],
            directQualified: [{ id: 'e1', name: 'Alfa' }],
            repechage: {
              targetSize: 3,
              slots: 2,
              selected: [
                { id: 'e2', name: 'Beta' },
                { id: 'e3', name: 'Gamma' },
              ],
              excluded: [
                { id: 'e2', name: 'Beta' },
                { id: 'e3', name: 'Gamma' },
                { id: 'e4', name: 'Delta' },
              ],
            },
          })
        }
        if (url.endsWith('/open') && init?.method === 'POST') {
          return jsonResponse({
            phase: phase({ status: 'open' }),
            operation: openedOperation(),
          })
        }
        return null
      },
    )
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = await mountPanel(false, true, { autoAdvance: true })
    await wrapper.get('[data-testid="open-phase"]').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(0)
    const post = fetchMock.mock.calls.find(([input, init]) => {
      return String(input).endsWith('/open') && init?.method === 'POST'
    })
    expect(JSON.parse(String(post![1]!.body))).toEqual({})
  })
})
