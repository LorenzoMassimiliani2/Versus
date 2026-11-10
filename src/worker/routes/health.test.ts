import { describe, expect, it } from 'vitest'

import worker from '../index'

function fetchHealth(): Promise<Response> {
  return worker.fetch(new Request('https://versus.test/api/health'), {} as Env, {} as ExecutionContext)
}

describe('GET /api/health', () => {
  it('risponde 200 con JSON stabile senza autenticazione', async () => {
    const response = await fetchHealth()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/json')
    expect(await response.json()).toEqual({ ok: true })
  })

  it('non intercetta le altre rotte', async () => {
    const response = await worker.fetch(
      new Request('https://versus.test/api/altro'),
      {} as Env,
      {} as ExecutionContext,
    )

    expect(response.status).toBe(404)
  })
})
