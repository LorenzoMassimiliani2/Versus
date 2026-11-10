import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { createSessionToken, hashSessionToken } from './token'

describe('session token', () => {
  it('genera 32 byte casuali in base64url senza padding', () => {
    const token = createSessionToken()

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(Buffer.from(token, 'base64url').length).toBe(32)
    expect(createSessionToken()).not.toBe(token)
  })

  it('calcola SHA-256 esadecimale del token', async () => {
    expect(await hashSessionToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(await hashSessionToken('abc')).toBe(createHash('sha256').update('abc').digest('hex'))
  })
})
