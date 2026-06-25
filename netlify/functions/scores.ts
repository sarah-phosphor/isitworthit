// Production data endpoint. Fetches ESPN server-side (so the browser never hits
// ESPN directly — no CORS, no exposed fragile endpoints), normalizes, and serves
// a slim payload. Resilience: in-memory last-good cache for transient ESPN
// failures, then openfootball as a last resort.

import type { Handler } from '@netlify/functions'
import { getScores } from '../../src/lib/espnSource'
import { getScoresFromOpenFootball } from '../../src/lib/openfootballSource'
import type { ScoresPayload } from '../../src/lib/model'

let lastGood: ScoresPayload | null = null

const baseHeaders = {
  'content-type': 'application/json',
  // CDN may serve a slightly stale copy while revalidating — keeps us off ESPN's rate limits.
  'cache-control': 'public, max-age=60, stale-while-revalidate=180',
}

export const handler: Handler = async () => {
  try {
    const data = await getScores()
    lastGood = data
    return { statusCode: 200, headers: baseHeaders, body: JSON.stringify(data) }
  } catch (espnErr) {
    if (lastGood) {
      return {
        statusCode: 200,
        headers: { ...baseHeaders, 'x-fallback': 'cache' },
        body: JSON.stringify({ ...lastGood, source: 'cache', stale: true }),
      }
    }
    try {
      const fb = await getScoresFromOpenFootball()
      return {
        statusCode: 200,
        headers: { ...baseHeaders, 'x-fallback': 'openfootball' },
        body: JSON.stringify(fb),
      }
    } catch (fbErr) {
      return {
        statusCode: 502,
        headers: baseHeaders,
        body: JSON.stringify({
          error: 'data unavailable',
          espn: String(espnErr),
          fallback: String(fbErr),
        }),
      }
    }
  }
}
