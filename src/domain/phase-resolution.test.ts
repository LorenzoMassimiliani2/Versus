import { describe, expect, it } from 'vitest'

import { parseResolutionRequest, validateResolutions } from './phase-resolution'

describe('parseResolutionRequest', () => {
  it('accetta una richiesta completa', () => {
    const parsed = parseResolutionRequest({
      note: '  Spareggio deciso dal regolamento  ',
      resolutions: [{ targetId: 't1', ordering: ['a', 'b'] }],
    })

    expect(parsed).toEqual({
      ok: true,
      request: {
        note: 'Spareggio deciso dal regolamento',
        resolutions: [{ targetId: 't1', ordering: ['a', 'b'] }],
      },
    })
  })

  it('rifiuta una nota mancante o vuota', () => {
    expect(parseResolutionRequest({ resolutions: [{ targetId: 't1', ordering: ['a', 'b'] }] })).toEqual(
      { ok: false, error: 'note_required' },
    )
    expect(
      parseResolutionRequest({ note: '   ', resolutions: [{ targetId: 't1', ordering: ['a', 'b'] }] }),
    ).toEqual({ ok: false, error: 'note_required' })
  })

  it('rifiuta ordinamenti vuoti, duplicati o con target ripetuti', () => {
    expect(
      parseResolutionRequest({ note: 'nota', resolutions: [{ targetId: 't1', ordering: [] }] }),
    ).toEqual({ ok: false, error: 'invalid_request' })
    expect(
      parseResolutionRequest({ note: 'nota', resolutions: [{ targetId: 't1', ordering: ['a', 'a'] }] }),
    ).toEqual({ ok: false, error: 'invalid_request' })
    expect(
      parseResolutionRequest({
        note: 'nota',
        resolutions: [
          { targetId: 't1', ordering: ['a', 'b'] },
          { targetId: 't1', ordering: ['b', 'a'] },
        ],
      }),
    ).toEqual({ ok: false, error: 'invalid_request' })
    expect(parseResolutionRequest({ note: 'nota', resolutions: [] })).toEqual({
      ok: false,
      error: 'invalid_request',
    })
  })
})

describe('validateResolutions', () => {
  const unresolved = [{ targetId: 't1', elementIds: ['a', 'b'] }]

  it('accetta un ordine completo per ogni target ambiguo', () => {
    expect(validateResolutions(unresolved, [{ targetId: 't1', ordering: ['b', 'a'] }])).toBe(true)
  })

  it('rifiuta target mancanti, in piu o parziali', () => {
    expect(validateResolutions(unresolved, [])).toBe(false)
    expect(
      validateResolutions(unresolved, [
        { targetId: 't1', ordering: ['a', 'b'] },
        { targetId: 't2', ordering: ['c', 'd'] },
      ]),
    ).toBe(false)
    expect(validateResolutions(unresolved, [{ targetId: 't2', ordering: ['a', 'b'] }])).toBe(false)
    expect(validateResolutions(unresolved, [{ targetId: 't1', ordering: ['a'] }])).toBe(false)
    expect(validateResolutions(unresolved, [{ targetId: 't1', ordering: ['a', 'c'] }])).toBe(false)
  })

  it('rifiuta la risoluzione di una fase senza target ambigui', () => {
    expect(validateResolutions([], [{ targetId: 't1', ordering: ['a', 'b'] }])).toBe(false)
  })
})
