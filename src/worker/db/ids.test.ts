import { describe, expect, it } from 'vitest'

import { uuidv7 } from './ids'

describe('uuidv7', () => {
  it('genera un UUID v7 con timestamp in testa', () => {
    const id = uuidv7(1_700_000_000_000)

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(id.slice(0, 8)).toBe('018bcfe5')
  })

  it('ordina gli id per creazione', () => {
    expect(uuidv7(1_700_000_000_000) < uuidv7(1_700_000_001_000)).toBe(true)
  })
})
