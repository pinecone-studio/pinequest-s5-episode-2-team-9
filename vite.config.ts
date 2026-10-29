import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), sandboxRoute()],
})
