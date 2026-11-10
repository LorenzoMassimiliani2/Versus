export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  headers.set('Cache-Control', 'no-store')
  return new Response(JSON.stringify(data), { ...init, headers })
}

export function apiError(status: number, error: string, headers?: HeadersInit): Response {
  return json({ error }, { status, headers })
}
