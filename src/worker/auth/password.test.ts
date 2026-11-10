import { pbkdf2Sync } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { hashPassword, verifyPassword } from './password'

const PASSWORD = 'correct horse battery staple'

function decodeBase64(value: string): Buffer {
  return Buffer.from(value, 'base64')
}

describe('hashPassword', () => {
  it('produce il formato pbkdf2$100000$salt$hash con salt da 16 byte e hash da 32', async () => {
    const stored = await hashPassword(PASSWORD)
    const [algorithm, iterations, salt, hash] = stored.split('$')

    expect(algorithm).toBe('pbkdf2')
    expect(iterations).toBe('100000')
    expect(decodeBase64(salt!).length).toBe(16)
    expect(decodeBase64(hash!).length).toBe(32)
  })

  it('usa un salt diverso a ogni chiamata', async () => {
    const first = await hashPassword(PASSWORD)
    const second = await hashPassword(PASSWORD)

    expect(first).not.toBe(second)
    expect(first.split('$')[2]).not.toBe(second.split('$')[2])
    expect(await verifyPassword(PASSWORD, first)).toBe(true)
    expect(await verifyPassword(PASSWORD, second)).toBe(true)
  })
})

describe('verifyPassword', () => {
  it('accetta la password corretta', async () => {
    expect(await verifyPassword(PASSWORD, await hashPassword(PASSWORD))).toBe(true)
  })

  it('rifiuta una password errata', async () => {
    expect(await verifyPassword('sbagliata', await hashPassword(PASSWORD))).toBe(false)
  })

  it('verifica un hash prodotto da un implementazione indipendente', async () => {
    const salt = Buffer.from('0123456789abcdef')
    const hash = pbkdf2Sync(PASSWORD, salt, 100_000, 32, 'sha256')
    const stored = `pbkdf2$100000$${salt.toString('base64')}$${hash.toString('base64')}`

    expect(await verifyPassword(PASSWORD, stored)).toBe(true)
  })

  it('rifiuta un hash oltre il limite di iterazioni supportato dai Worker', async () => {
    const salt = Buffer.from('0123456789abcdef')
    const hash = pbkdf2Sync(PASSWORD, salt, 600_000, 32, 'sha256')
    const stored = `pbkdf2$600000$${salt.toString('base64')}$${hash.toString('base64')}`

    expect(await verifyPassword(PASSWORD, stored)).toBe(false)
  })

  it('rifiuta formati malformati o non supportati', async () => {
    expect(await verifyPassword(PASSWORD, '')).toBe(false)
    expect(await verifyPassword(PASSWORD, 'bcrypt$10$abc$def')).toBe(false)
    expect(await verifyPassword(PASSWORD, 'pbkdf2$0$c2FsdA==$aGFzaA==')).toBe(false)
    expect(await verifyPassword(PASSWORD, 'pbkdf2$100000$non-base64!$aGFzaA==')).toBe(false)
  })
})
