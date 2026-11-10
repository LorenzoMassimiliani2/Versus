import { handleHealth } from './routes/health'

export default {
  async fetch(request: Request, _env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/api/health') {
      return handleHealth()
    }

    return new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
