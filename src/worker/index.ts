import { isMutating, isSameOrigin } from './auth/origin'
import { authenticate } from './auth/session'
import { apiError } from './http/json'
import { handleLogin, handleLogout, handleMe } from './routes/auth'
import { handleHealth } from './routes/health'
import { handleUsersRoute } from './routes/users'

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const method = request.method

    if (url.pathname === '/api/health' && method === 'GET') {
      return handleHealth()
    }

    if (!url.pathname.startsWith('/api/')) {
      return new Response('Not found', { status: 404 })
    }

    if (isMutating(request) && !isSameOrigin(request)) {
      return apiError(403, 'invalid_origin')
    }
    if (url.pathname === '/api/auth/login' && method === 'POST') {
      return handleLogin(request, env)
    }

    const auth = await authenticate(request, env)
    if (!auth) return apiError(401, 'unauthorized')

    if (url.pathname === '/api/auth/logout' && method === 'POST') {
      return handleLogout(env, auth)
    }
    if (url.pathname === '/api/me' && method === 'GET') {
      return handleMe(auth)
    }

    const usersResponse = await handleUsersRoute(request, env, auth)
    if (usersResponse) return usersResponse

    return new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
