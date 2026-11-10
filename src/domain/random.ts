/** Intero uniforme in [0, maxExclusive) da una sorgente crittografica. */
export function cryptoRandomInt(maxExclusive: number): number {
  const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive
  const buffer = new Uint32Array(1)
  let value = 0
  do {
    globalThis.crypto.getRandomValues(buffer)
    value = buffer[0]!
  } while (value >= limit)
  return value % maxExclusive
}

/** Fisher-Yates con sorgente casuale iniettabile. Non modifica l input. */
export function shuffle<T>(elements: readonly T[], randomInt: (maxExclusive: number) => number): T[] {
  const result = [...elements]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1)
    const item = result[index]!
    result[index] = result[swap]!
    result[swap] = item
  }
  return result
}
