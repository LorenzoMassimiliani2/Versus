
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'

import PlanPreviewPanel from './PlanPreviewPanel.vue'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const INVALID_RESULT = {
  valid: false,
  errors: [{ code: 'final_qualifies_multiple', phase: 4, phaseName: 'Classifica finale' }],
  warnings: [{ code: 'deadline_in_past', phase: 2, phaseName: 'Sedicesimi' }],
  preview: {
    elementCount: 40,
    activeParticipants: 8,
    phases: [
      {
        position: 1,
        name: 'Gironi',
        formula: 'group',
        voteType: 'ranking',
        inputCount: 40,
        outputCount: 32,
        groups: [
          { name: 'Girone A', members: [{ id: 'e1', name: 'Elemento 1' }] },
        ],
        byes: [],
        matches: [],
        qualified: { direct: 20, repechage: 12, total: 32 },
        repechage: { targetSize: 32, excluded: 20, selected: 12 },
      },
      {
        position: 2,
        name: 'Sedicesimi',
        formula: 'elimination',
        voteType: 'duel',
        inputCount: 32,
        outputCount: 16,
        groups: [],
        byes: [{ id: 'e40', name: 'Elemento 40' }],
        matches: [
          { a: { id: 'e1', name: 'Elemento 1' }, b: null, bye: true },
          { a: { id: 'e2', name: 'Elemento 2' }, b: { id: 'e3', name: 'Elemento 3' }, bye: false },
        ],
        qualified: { direct: 16, repechage: 0, total: 16 },
        repechage: null,
      },
    ],
  },
}

const VALID_RESULT = {
  valid: true,
  errors: [],
  warnings: [],
  preview: { elementCount: 40, activeParticipants: 8, phases: [] },
}

async function mountPanel() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(PlanPreviewPanel, {
    props: { tournamentId: 't1' },
    global: { plugins: [pinia] },
  })
  await flushPromises()
  return wrapper
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PlanPreviewPanel', () => {
  it('mostra errori bloccanti, warning e struttura calcolata', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(INVALID_RESULT)))

    const wrapper = await mountPanel()

    expect(wrapper.get('[data-testid="plan-validity"]').text()).toBe('Piano non valido')
    expect(wrapper.get('[data-testid="plan-errors"]').text()).toContain(
      'Fase 4 · Classifica finale: L ultima fase deve qualificare un solo elemento.',
    )
    expect(wrapper.get('[data-testid="plan-warnings"]').text()).toContain(
      'La scadenza è già passata.',
    )
    expect(wrapper.get('[data-testid="plan-structure"]').text()).toContain('Girone A: Elemento 1')
    expect(wrapper.get('[data-testid="plan-structure"]').text()).toContain('20 qualificati diretti + 12 ripescati')
    expect(wrapper.get('[data-testid="plan-structure"]').text()).toContain('Elemento 1 (bye)')
    expect(wrapper.get('[data-testid="plan-structure"]').text()).toContain('Elemento 2 vs Elemento 3')
  })

  it('mostra il piano valido e ricarica l anteprima', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(VALID_RESULT))
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = await mountPanel()
    expect(wrapper.get('[data-testid="plan-validity"]').text()).toBe('Piano valido')
    expect(wrapper.text()).toContain('Nessun errore bloccante.')

    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('mostra un errore quando la richiesta fallisce', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: 'forbidden' }, 403)),
    )

    const wrapper = await mountPanel()
    expect(wrapper.get('[role="alert"]').text()).toBe('Non hai i permessi per questa operazione.')
  })
})
