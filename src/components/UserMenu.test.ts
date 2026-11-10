import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import UserMenu from './UserMenu.vue'
import { useSessionStore } from '@/stores/session'

function emptyView() {
  return { template: '<div />' }
}

async function mountMenu(options: { isAdmin?: boolean } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: emptyView() },
      { path: '/login', name: 'login', component: emptyView() },
    ],
  })
  await router.push('/')
  await router.isReady()

  const session = useSessionStore(pinia)
  session.user = { id: 'u1', username: 'alice', isAdmin: options.isAdmin ?? false }
  session.status = 'authenticated'

  const wrapper = mount(UserMenu, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('UserMenu', () => {
  it('mostra l iniziale e apre il menu con username e logout', async () => {
    const { wrapper } = await mountMenu()

    expect(wrapper.get('#user-menu-button').text()).toBe('A')
    expect(wrapper.find('#user-menu-logout').exists()).toBe(false)

    await wrapper.get('#user-menu-button').trigger('click')
    expect(wrapper.text()).toContain('alice')
    expect(wrapper.get('#user-menu-logout').text()).toBe('Esci')
  })

  it('mostra il ruolo admin e fa logout tornando al login', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const { wrapper, router } = await mountMenu({ isAdmin: true })

    await wrapper.get('#user-menu-button').trigger('click')
    expect(wrapper.text()).toContain('Admin')

    await wrapper.get('#user-menu-logout').trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
    })
    expect(router.currentRoute.value.name).toBe('login')
  })
})
