import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Dev-only middleware: serve the same data the Netlify function will serve in
// production, so `vite dev` works standalone (no netlify-cli needed). In prod,
// Netlify serves netlify/functions/scores.ts at the same path.
function devScoresApi(): Plugin {
  return {
    name: 'dev-scores-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/.netlify/functions/scores', async (_req, res) => {
        try {
          const mod = await server.ssrLoadModule('/src/lib/espnSource.ts')
          const data = await mod.getScores()
          res.setHeader('content-type', 'application/json')
          res.setHeader('cache-control', 'no-store')
          res.end(JSON.stringify(data))
        } catch (e) {
          res.statusCode = 502
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: String(e) }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), devScoresApi()],
})
