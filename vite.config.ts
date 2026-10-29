import react from '@vitejs/plugin-react'
import type { IncomingMessage } from 'node:http'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/**
 * Dev only: serves the Vercel functions in /api (api/<name>.ts, exporting GET/POST handlers) from
 * the Vite dev server, with the variables in .env.local, so `npm run dev` runs the tutor and
 * billing endpoints without `vercel dev`. Production uses Vercel's own runtime.
 */
function apiRoutes(): Plugin {
  return {
    name: 'hologemma-api-routes',
    apply: 'serve',
    configureServer(server) {
      Object.assign(process.env, loadEnv(server.config.mode, process.cwd(), ''))
      server.middlewares.use(async (req, res, next) => {
        const name = req.url?.match(/^\/api\/([a-z-]+)(?:\?|$)/)?.[1]
        if (!name) return next()
        try {
          const mod = (await server.ssrLoadModule(`/api/${name}.ts`)) as Record<string, unknown>
          const handler = mod[req.method ?? 'GET']
          if (typeof handler !== 'function') {
            res.statusCode = 405
            return res.end()
          }
          const abort = new AbortController()
          res.on('close', () => abort.abort())
          const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
          const request = new Request(`http://${req.headers.host}${req.url}`, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body: hasBody ? await readBody(req) : undefined,
            signal: abort.signal,
          })
          const response = (await handler(request)) as Response
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          // Stream the body through as it arrives (the tutor answers word by word).
          if (response.body) for await (const chunk of response.body) res.write(chunk)
          res.end()
        } catch (error) {
          server.ssrFixStacktrace(error as Error)
          next(error)
        }
      })
    },
  }
}

/** Dev only: serves the isolated sandbox page (sandbox.html) at /sandbox. */
function sandboxRoute(): Plugin {
  return {
    name: 'sandbox-route',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/sandbox' || req.url === '/sandbox/') req.url = '/sandbox.html'
        next()
      })
    },
  }
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), apiRoutes(), sandboxRoute()],
})
