/** Elemento con la posizione scelta dall'organizzatore nel torneo. */
export interface SeedableElement {
  id: string
  position: number
}

/**
 * Ordine iniziale del seeding: la posizione degli elementi nel torneo.
 * Le fasi senza classifica precedente usano questo ordine.
 */
export function initialSeeding<T extends SeedableElement>(elements: T[]): T[] {
  return [...elements].sort((a, b) => a.position - b.position)
}
