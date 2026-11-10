import { base64UrlEncode } from './encoding.ts'

const TOKEN_BYTES = 32

export function createSessionToken(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)))
}

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
