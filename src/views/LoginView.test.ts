import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import LoginView from './LoginView.vue'

function emptyView() {
  return { template: '<div />' }
}

async function testRouter(): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: emptyView() },
      { path: '/login', name: 'login', component: LoginView },
      { path: '/tornei', name: 'tournaments', component: emptyView() },
    ],
  })
  await router.push('/login')
  await router.isReady()
  return router
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function mountLogin() {
  const router = await testRouter()
  const wrapper = mount(LoginView, {
    global: { plugins: [createPinia(), router] },
  })
  return { wrapper, router }
}

async function fillAndSubmit(wrapper: Awaited<ReturnType<typeof mountLogin>>['wrapper']) {
  await wrapper.get('#username').setValue('alice')
  await wrapper.get('#password').setValue('password123')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('LoginView', () => {
  it('dopo un login riuscito porta alla home protetta', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ user: { id: 'u1', username: 'alice', isAdmin: false } }, 200),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { wrapper, router } = await mountLogin()
    await fillAndSubmit(wrapper)

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(router.currentRoute.value.fullPath).toBe('/')
  })

  it('mostra un errore leggibile con credenziali errate', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'invalid_credentials' }, 401)))

    const { wrapper, router } = await mountLogin()
    await fillAndSubmit(wrapper)

    expect(wrapper.get('[role="alert"]').text()).toBe('Username o password non validi.')
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('mostra un errore leggibile quando il rate limit blocca il login', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'rate_limited' }, 429)))

    const { wrapper } = await mountLogin()
    await fillAndSubmit(wrapper)

    expect(wrapper.get('[role="alert"]').text()).toContain('Troppi tentativi')
  })

  it('torna al percorso richiesto dopo il login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ user: { id: 'u1', username: 'alice', isAdmin: false } }, 200),
      ),
    )

    const router = await testRouter()
    await router.push('/login?redirect=/tornei')
    const wrapper = mount(LoginView, { global: { plugins: [createPinia(), router] } })
    await fillAndSubmit(wrapper)

    expect(router.currentRoute.value.fullPath).toBe('/tornei')
  })
})
