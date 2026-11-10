import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { describe, expect, it } from 'vitest'

import BottomTabs from './BottomTabs.vue'
import { useSessionStore } from '@/stores/session'

function emptyView() {
  return { template: '<div />' }
}

async function mountTabs(options: { isAdmin?: boolean; path?: string } = {}): Promise<{
  wrapper: ReturnType<typeof mount>
  router: Router
}> {
  const pinia = createPinia()
  setActivePinia(pinia)

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: emptyView() },
      { path: '/admin/utenti', name: 'admin-users', component: emptyView() },
      { path: '/login', name: 'login', component: emptyView() },
    ],
  })
  await router.push(options.path ?? '/')
  await router.isReady()

  const session = useSessionStore(pinia)
  session.user = { id: 'u1', username: 'alice', isAdmin: options.isAdmin ?? false }
  session.status = 'authenticated'

  const wrapper = mount(BottomTabs, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('BottomTabs', () => {
  it('mostra Partecipo e Organizzo e segue la query tab', async () => {
    const { wrapper, router } = await mountTabs()

    expect(wrapper.get('#bottom-tab-participating').text()).toBe('In gara')
    expect(wrapper.get('#bottom-tab-organizing').text()).toBe('In regia')
    expect(wrapper.get('#bottom-tab-participating').attributes('aria-current')).toBe('page')
    expect(wrapper.find('#bottom-tab-users').exists()).toBe(false)

    await router.push({ name: 'home', query: { tab: 'organizing' } })
    await flushPromises()

    expect(wrapper.get('#bottom-tab-organizing').attributes('aria-current')).toBe('page')
    expect(wrapper.get('#bottom-tab-participating').attributes('aria-current')).toBeUndefined()
  })

  it('mostra Utenti solo all admin e la attiva sulla rotta admin', async () => {
    const { wrapper } = await mountTabs({ isAdmin: true, path: '/admin/utenti' })

    expect(wrapper.get('#bottom-tab-users').text()).toBe('Utenti')
    expect(wrapper.get('#bottom-tab-users').attributes('aria-current')).toBe('page')
  })
})
