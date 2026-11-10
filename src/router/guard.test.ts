import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import router from './index'

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.unstubAllGlobals()
})

describe('router guard', () => {
  it('reindirizza al login una rotta protetta senza sessione', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'unauthorized' }, 401)))

    await router.push('/')

    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/')
  })

  it('consente la home con una sessione valida', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ user: { id: 'u1', username: 'alice', isAdmin: false } }, 200),
      ),
    )

    await router.push('/')

    expect(router.currentRoute.value.name).toBe('home')
  })

  it('porta alla home chi visita il login già autenticato', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ user: { id: 'u1', username: 'alice', isAdmin: false } }, 200),
      ),
    )

    await router.push('/login')

    expect(router.currentRoute.value.name).toBe('home')
  })
})

describe('router guard della gestione utenti', () => {
  it('reindirizza alla home un utente che non è admin', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ user: { id: 'u1', username: 'alice', isAdmin: false } }, 200),
      ),
    )

    await router.push('/admin/utenti')

    expect(router.currentRoute.value.name).toBe('home')
  })

  it('consente la pagina utenti a un admin', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ user: { id: 'u1', username: 'alice', isAdmin: true } }, 200),
      ),
    )

    await router.push('/admin/utenti')

    expect(router.currentRoute.value.name).toBe('admin-users')
  })
})
