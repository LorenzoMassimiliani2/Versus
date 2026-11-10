/**
 * Le mutazioni devono arrivare dallo stesso origin. Le richieste senza header
 * Origin (client non browser, test, curl) sono ammesse: i browser lo inviano
 * sempre per POST/PUT/PATCH/DELETE cross-origin e same-origin.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin')
  if (!origin) return true
  if (origin === 'null') return false

  try {
    return new URL(origin).origin === new URL(request.url).origin
  } catch {
    return false
  }
}

export function isMutating(request: Request): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
}
