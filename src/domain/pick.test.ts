import { describe, expect, it } from 'vitest'

import { tallyPick } from './pick'

describe('tallyPick', () => {
  it('conta un punto per ogni pick', () => {
    const result = tallyPick(
      [{ elementId: 'x' }, { elementId: 'y' }, { elementId: 'x' }],
      { elementIds: ['x', 'y', 'z'] },
    )

    expect(result.rows).toEqual([
      { elementId: 'x', picks: 2, position: 1, tied: false },
      { elementId: 'y', picks: 1, position: 2, tied: false },
      { elementId: 'z', picks: 0, position: 3, tied: false },
    ])
  })

  it('segnala la parità irrisolta e accetta un ordine manuale', () => {
    const votes = [{ elementId: 'x' }, { elementId: 'y' }]

    const unresolved = tallyPick(votes, { elementIds: ['x', 'y'] })
    expect(unresolved.rows.map((row) => [row.elementId, row.position, row.tied])).toEqual([
      ['x', 1, true],
      ['y', 1, true],
    ])
    expect(unresolved.requiresManualResolution).toBe(true)
    expect(unresolved.unresolved).toEqual([['x', 'y']])

    const manual = tallyPick(votes, { elementIds: ['x', 'y'], manualOrder: ['y', 'x'] })
    expect(manual.rows.map((row) => [row.elementId, row.position, row.tied])).toEqual([
      ['y', 1, false],
      ['x', 2, false],
    ])
    expect(manual.requiresManualResolution).toBe(false)
  })

  it('golden: stessa fixture, stesso ordine', () => {
    const result = tallyPick(
      [{ elementId: 'alba' }, { elementId: 'carla' }, { elementId: 'carla' }, { elementId: 'bruno' }],
      { elementIds: ['alba', 'bruno', 'carla'] },
    )

    expect(result).toEqual({
      rows: [
        { elementId: 'carla', picks: 2, position: 1, tied: false },
        { elementId: 'alba', picks: 1, position: 2, tied: true },
        { elementId: 'bruno', picks: 1, position: 2, tied: true },
      ],
      unresolved: [['alba', 'bruno']],
      requiresManualResolution: true,
    })
  })
})
