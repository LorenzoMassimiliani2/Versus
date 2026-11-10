import { describe, expect, it } from 'vitest'

import { slugify } from './slug'

describe('slugify', () => {
  it('trasforma il nome in minuscolo separando le parole con trattini', () => {
    expect(slugify('Torneo di Prova')).toBe('torneo-di-prova')
  })

  it('rimuove gli accenti', () => {
    expect(slugify('Città dei Ragazzi')).toBe('citta-dei-ragazzi')
  })

  it('elimina punteggiatura e spazi ripetuti', () => {
    expect(slugify('  Foo & Bar!!  ')).toBe('foo-bar')
  })

  it('usa un valore di riserva quando il nome non contiene lettere o cifre', () => {
    expect(slugify('!!!')).toBe('torneo')
    expect(slugify('   ')).toBe('torneo')
  })

  it('limita la lunghezza senza lasciare un trattino finale', () => {
    const slug = slugify('a'.repeat(59) + ' bbbbb')

    expect(slug.length).toBeLessThanOrEqual(60)
    expect(slug.endsWith('-')).toBe(false)
  })
})
