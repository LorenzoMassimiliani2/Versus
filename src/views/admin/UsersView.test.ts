import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import UsersView from './UsersView.vue'

const USERS = [
  {
    id: 'u1',
    username: 'alice',
    isAdmin: true,
    isActive: true,
    createdAt: '2026-11-10T09:00:00.000Z',
  },
  {
    id: 'u2',
    username: 'bruno',
    isAdmin: false,
    isActive: true,
    createdAt: '2026-11-10T09:10:00.000Z',
  },
]

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function emptyView() {
  return { template: '<div />' }
}

async function testRouter(): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: emptyView() },
      { path: '/admin/utenti', name: 'admin-users', component: UsersView },
    ],
  })
  await router.push('/admin/utenti')
  await router.isReady()
  return router
}

async function mountView() {
  const router = await testRouter()
  const wrapper = mount(UsersView, { global: { plugins: [createPinia(), router] } })
  await flushPromises()
  return { wrapper, router }
}

function buttonByText(wrapper: Awaited<ReturnType<typeof mountView>>['wrapper'], text: string) {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === text)
  if (!button) throw new Error(`Bottone "${text}" non trovato`)
  return button
}

function rowFor(wrapper: Awaited<ReturnType<typeof mountView>>['wrapper'], username: string) {
  const row = wrapper.findAll('li').find((candidate) => candidate.text().includes(username))
  if (!row) throw new Error(`Riga di "${username}" non trovata`)
  return row
}

function actionButton(row: ReturnType<typeof rowFor>, text: string) {
  const button = row.findAll('button').find((candidate) => candidate.text() === text)
  if (!button) throw new Error(`Azione "${text}" non trovata`)
  return button
}

function calls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map(([input, init]) => ({
    url: String(input),
    method: (init as RequestInit | undefined)?.method ?? 'GET',
    body: (init as RequestInit | undefined)?.body
      ? JSON.parse(String((init as RequestInit).body))
      : undefined,
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('UsersView', () => {
  it('elenca gli utenti caricati dal server con il ruolo admin', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ users: USERS }))
    vi.stubGlobal('fetch', fetchMock)

    const { wrapper } = await mountView()

    expect(calls(fetchMock)[0]).toEqual({ url: '/api/users?q=', method: 'GET', body: undefined })
    expect(wrapper.text()).toContain('alice')
    expect(wrapper.text()).toContain('bruno')
    expect(wrapper.text()).toContain('Admin')
    expect(wrapper.text()).not.toContain('Disattiva')
    expect(wrapper.find('#user-actions-u1').exists()).toBe(true)
  })

  it('cerca gli utenti per username', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ users: USERS }))
    vi.stubGlobal('fetch', fetchMock)

    const { wrapper } = await mountView()
    await wrapper.get('#user-search').setValue('ali')
    await wrapper.get('#user-search-form').trigger('submit')
    await flushPromises()

    expect(calls(fetchMock).at(-1)).toEqual({
      url: '/api/users?q=ali',
      method: 'GET',
      body: undefined,
    })
  })

  it('crea un utente e mostra la password iniziale una sola volta', async () => {
    const created = {
      id: 'u3',
      username: 'carla',
      isAdmin: false,
      isActive: true,
      createdAt: '2026-11-10T09:20:00.000Z',
    }
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/users' && init?.method === 'POST') {
        return jsonResponse({ user: created, initialPassword: 'password123' }, 201)
      }
      return jsonResponse({ users: USERS })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { wrapper } = await mountView()
    await wrapper.get('#open-create-user').trigger('click')
    await wrapper.get('#new-username').setValue('carla')
    await wrapper.get('#new-password').setValue('password123')
    await wrapper.get('#create-user-form').trigger('submit')
    await flushPromises()

    expect(calls(fetchMock).at(-1)).toEqual({
      url: '/api/users',
      method: 'POST',
      body: { username: 'carla', password: 'password123' },
    })
    expect(wrapper.get('[role="status"]').text()).toContain('carla')
    expect(wrapper.get('[role="status"]').text()).toContain('password123')
    expect(wrapper.text()).toContain('carla')

    await buttonByText(wrapper, 'Ho copiato la password').trigger('click')
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it('disattiva un utente chiamando PATCH e aggiorna la riga', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/users/u2' && init?.method === 'PATCH') {
        return jsonResponse({ user: { ...USERS[1]!, isActive: false } })
      }
      return jsonResponse({ users: USERS })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { wrapper } = await mountView()
    let brunoRow = rowFor(wrapper, 'bruno')
    expect(brunoRow.text()).not.toContain('Disattiva')
    await brunoRow.get('[aria-haspopup="menu"]').trigger('click')
    brunoRow = rowFor(wrapper, 'bruno')
    await actionButton(brunoRow, 'Disattiva').trigger('click')
    await flushPromises()

    expect(calls(fetchMock).at(-1)).toEqual({
      url: '/api/users/u2',
      method: 'PATCH',
      body: { isActive: false },
    })
    expect(wrapper.text()).toContain('Disattivato')
    brunoRow = rowFor(wrapper, 'bruno')
    await brunoRow.get('[aria-haspopup="menu"]').trigger('click')
    expect(actionButton(rowFor(wrapper, 'bruno'), 'Riattiva').exists()).toBe(true)
  })

  it('promuove un utente ad admin', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/users/u2' && init?.method === 'PATCH') {
        return jsonResponse({ user: { ...USERS[1]!, isAdmin: true } })
      }
      return jsonResponse({ users: USERS })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { wrapper } = await mountView()
    let brunoRow = rowFor(wrapper, 'bruno')
    await brunoRow.get('[aria-haspopup="menu"]').trigger('click')
    brunoRow = rowFor(wrapper, 'bruno')
    await actionButton(brunoRow, 'Promuovi ad admin').trigger('click')
    await flushPromises()

    expect(calls(fetchMock).at(-1)).toEqual({
      url: '/api/users/u2',
      method: 'PATCH',
      body: { isAdmin: true },
    })
    expect(rowFor(wrapper, 'bruno').text()).toContain('Admin')
    brunoRow = rowFor(wrapper, 'bruno')
    await brunoRow.get('[aria-haspopup="menu"]').trigger('click')
    expect(actionButton(rowFor(wrapper, 'bruno'), 'Revoca admin').exists()).toBe(true)
  })

  it('reimposta la password di un utente', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/users/u2/password' && init?.method === 'POST') {
        return new Response(null, { status: 204 })
      }
      return jsonResponse({ users: USERS })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { wrapper } = await mountView()
    let brunoRow = rowFor(wrapper, 'bruno')
    await brunoRow.get('[aria-haspopup="menu"]').trigger('click')
    brunoRow = rowFor(wrapper, 'bruno')
    await actionButton(brunoRow, 'Reset password').trigger('click')
    await wrapper.get('#reset-password-u2').setValue('nuovapassword')
    await wrapper.get('#reset-form-u2').trigger('submit')
    await flushPromises()

    expect(calls(fetchMock).at(-1)).toEqual({
      url: '/api/users/u2/password',
      method: 'POST',
      body: { password: 'nuovapassword' },
    })
    expect(wrapper.text()).toContain('Password aggiornata')
  })

  it('mostra un errore leggibile quando il server rifiuta la creazione', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/users' && init?.method === 'POST') {
        return jsonResponse({ error: 'user_limit_reached' }, 409)
      }
      return jsonResponse({ users: USERS })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { wrapper } = await mountView()
    await wrapper.get('#open-create-user').trigger('click')
    await wrapper.get('#new-username').setValue('carla')
    await wrapper.get('#new-password').setValue('password123')
    await wrapper.get('#create-user-form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('#create-user-form').exists()).toBe(true)
    expect(wrapper.get('[role="alert"]').text()).toBe('Limite di 20 utenti attivi raggiunto.')
  })
})
