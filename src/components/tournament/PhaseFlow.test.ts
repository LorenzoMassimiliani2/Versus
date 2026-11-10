import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import PhaseFlow from './PhaseFlow.vue'
import { defaultPhaseConfig } from '@/domain/phases'
import type { Phase } from '@/stores/phases'

function phase(overrides: Partial<Phase> & Pick<Phase, 'id' | 'position' | 'name'>): Phase {
  const base: Phase = {
    id: 'phase',
    position: 1,
    name: 'Fase',
    formula: 'group',
    voteType: 'ranking',
    config: defaultPhaseConfig(),
    advance: { type: 'top_per_group', n: 2 },
    status: 'pending',
    openedAt: null,
    closedAt: null,
    createdAt: '2026-11-10T09:00:00.000Z',
    updatedAt: '2026-11-10T09:00:00.000Z',
  }
  return { ...base, ...overrides }
}

describe('PhaseFlow', () => {
  it('ordina le fasi e le collega visivamente', () => {
    const wrapper = mount(PhaseFlow, {
      props: {
        phases: [
          phase({ id: 'p2', position: 2, name: 'Finale', formula: 'ranking', voteType: 'pick', advance: { type: 'winner' } }),
          phase({ id: 'p1', position: 1, name: 'Gironi', status: 'open' }),
        ],
      },
    })

    const flow = wrapper.get('[data-testid="phase-flow"]')
    expect(flow.text()).toContain('Gironi')
    expect(flow.text()).toContain('Finale')
    expect(flow.text().indexOf('Gironi')).toBeLessThan(flow.text().indexOf('Finale'))
    expect(wrapper.text()).toContain('2 fasi')
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('mostra lo stato vuoto', () => {
    const wrapper = mount(PhaseFlow, { props: { phases: [] } })
    expect(wrapper.text()).toContain('Aggiungi la prima fase')
  })
})
