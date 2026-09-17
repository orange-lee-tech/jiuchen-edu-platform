import Fastify from 'fastify'

export function buildApp() {
  const app = Fastify({
    logger: true,
  })

  app.get('/health', async () => ({
    ok: true,
    service: 'jiuchen-api',
  }))

  return app
}
