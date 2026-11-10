import { base64ToBytes, bytesToBase64 } from './encoding.ts'

const ALGORITHM = 'pbkdf2'
// Cloudflare Workers WebCrypto rifiuta PBKDF2 con più di 100.000 iterazioni.
const ITERATIONS = 100_000
const SALT_BYTES = 16
const HASH_BYTES = 32
const MAX_ITERATIONS = 100_000

async function derive(
  password: string,
  salt: Uint8Array,
  iterations: number,
  bits: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(salt), iterations },
    key,
    bits,
  )
  return new Uint8Array(derived)
}

/** Formato: `pbkdf2$<iterazioni>$<salt_b64>$<hash_b64>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = await derive(password, salt, ITERATIONS, HASH_BYTES * 8)
  return `${ALGORITHM}$${ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== ALGORITHM) return false

  const iterations = Number(parts[1])
  if (!Number.isInteger(iterations) || iterations <= 0 || iterations > MAX_ITERATIONS) return false

  let salt: Uint8Array
  let expected: Uint8Array
  try {
    salt = base64ToBytes(parts[2]!)
    expected = base64ToBytes(parts[3]!)
  } catch {
    return false
  }
  if (salt.length === 0 || expected.length === 0) return false

  const actual = await derive(password, salt, iterations, expected.length * 8)
  let difference = actual.length ^ expected.length
  for (let index = 0; index < expected.length; index += 1) {
    difference |= actual[index]! ^ expected[index]!
  }
  return difference === 0
}

/** Hash usato per uniformare il tempo di risposta quando lo username non esiste. */
export const DUMMY_PASSWORD_HASH =
  'pbkdf2$100000$dmVyc3VzLWR1bW15LXNsdA==$S9i1a00wtz9vQJ5KwJDv1HNQRJ2+nR1mJoThDMhUjwA='
