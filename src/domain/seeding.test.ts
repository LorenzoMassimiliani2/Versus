import { describe, expect, it } from 'vitest'

import { initialSeeding } from './seeding'

describe('initialSeeding', () => {
  it('usa la posizione degli elementi come ordine di seeding', () => {
    const elements = [
      { id: 'c', position: 3 },
      { id: 'a', position: 1 },
      { id: 'b', position: 2 },
    ]

    expect(initialSeeding(elements).map((element) => element.id)).toEqual(['a', 'b', 'c'])
  })

  it('non modifica l array di input', () => {
    const elements = [
      { id: 'b', position: 2 },
      { id: 'a', position: 1 },
    ]

    initialSeeding(elements)

    expect(elements.map((element) => element.id)).toEqual(['b', 'a'])
  })
})
