import { describe, expect, it } from 'vitest'

import { validateCustomValues } from './custom-values'

const fields = [
  { key: 'genere', type: 'text' as const },
  { key: 'anno', type: 'number' as const },
  { key: 'sito', type: 'url' as const },
  { key: 'uscita', type: 'date' as const },
]

describe('validateCustomValues', () => {
  it('accetta valori conformi e li normalizza', () => {
    const result = validateCustomValues(fields, {
      genere: '  pop  ',
      anno: 1999,
      sito: 'https://example.test/album',
      uscita: '1999-12-31',
    })

    expect(result).toEqual({
      ok: true,
      values: { genere: 'pop', anno: 1999, sito: 'https://example.test/album', uscita: '1999-12-31' },
    })
  })

  it('ammette valori mancanti', () => {
    expect(validateCustomValues(fields, {})).toEqual({ ok: true, values: {} })
  })

  it('rifiuta valori del tipo sbagliato', () => {
    expect(validateCustomValues(fields, { anno: '1999' })).toEqual({
      ok: false,
      error: 'invalid_values',
    })
    expect(validateCustomValues(fields, { sito: 'ftp://example.test' })).toEqual({
      ok: false,
      error: 'invalid_values',
    })
    expect(validateCustomValues(fields, { uscita: '1999-02-31' })).toEqual({
      ok: false,
      error: 'invalid_values',
    })
    expect(validateCustomValues(fields, { genere: 42 })).toEqual({
      ok: false,
      error: 'invalid_values',
    })
  })

  it('rifiuta chiavi che non appartengono al torneo', () => {
    expect(validateCustomValues(fields, { colore: 'rosso' })).toEqual({
      ok: false,
      error: 'unknown_field',
    })
  })

  it('rifiuta input non oggetto', () => {
    expect(validateCustomValues(fields, null)).toEqual({ ok: false, error: 'invalid_values' })
    expect(validateCustomValues(fields, ['x'])).toEqual({ ok: false, error: 'invalid_values' })
  })
})
