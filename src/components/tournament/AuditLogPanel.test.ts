import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'

import AuditLogPanel from './AuditLogPanel.vue'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AuditLogPanel', () => {
  it('mostra attore, azione, target, data e diff sintetico', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        entries: [
          {
            id: 'a2',
            actorId: 'u1',
            actorUsername: 'alice',
            action: 'phase.update',
            targetType: 'phase',
            targetId: 'phase-123456789',
            before: { name: 'Gironi', formula: 'group' },
            after: { name: 'Gironi A', formula: 'group' },
            createdAt: '2026-11-10T10:00:00.000Z',
          },
          {
            id: 'a1',
            actorId: 'u2',
            actorUsername: 'bruno',
            action: 'organizer.nominate',
            targetType: 'organizer',
            targetId: 'u2',
            before: null,
            after: { role: 'co_organizer' },
            createdAt: '2026-11-10T09:00:00.000Z',
          },
        ],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const pinia = createPinia()
    setActivePinia(pinia)
    const wrapper = mount(AuditLogPanel, {
      props: { tournamentId: 't1' },
      global: { plugins: [pinia] },
    })
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith('/api/tournaments/t1/audit', expect.anything())
    expect(wrapper.text()).toContain('Registro modifiche')
    expect(wrapper.text()).toContain('alice')
    expect(wrapper.text()).toContain('Modifica fase')
    expect(wrapper.text()).toContain('Fase phase-12')
    expect(wrapper.text()).toContain('Nome: Gironi → Gironi A')
    expect(wrapper.text()).toContain('bruno')
    expect(wrapper.text()).toContain('Nomina organizzatore')
    expect(wrapper.text()).toContain('Ruolo: co_organizer')
  })

  it('mostra un messaggio quando il log è vuoto', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ entries: [] })))

    const pinia = createPinia()
    setActivePinia(pinia)
    const wrapper = mount(AuditLogPanel, {
      props: { tournamentId: 't1' },
      global: { plugins: [pinia] },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Nessuna modifica registrata.')
  })
})
