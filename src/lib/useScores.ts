import { useEffect, useState } from 'react'
import type { ScoresPayload } from './model'

const ENDPOINT = '/.netlify/functions/scores'
const LS_KEY = 'dim_scores_v1'

// Fetches the data endpoint, polls every 60s, and keeps the last good payload in
// localStorage so the page renders instantly and survives a transient blip.
export function useScores() {
  const [data, setData] = useState<ScoresPayload | null>(() => {
    try {
      const cached = localStorage.getItem(LS_KEY)
      return cached ? (JSON.parse(cached) as ScoresPayload) : null
    } catch {
      return null
    }
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!data)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const r = await fetch(ENDPOINT)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const j = (await r.json()) as ScoresPayload
        if (!alive) return
        setData(j)
        setError(null)
        setLoading(false)
        try {
          localStorage.setItem(LS_KEY, JSON.stringify(j))
        } catch {
          /* storage full / disabled — fine */
        }
      } catch (e) {
        if (!alive) return
        setError(String(e))
        setLoading(false)
      }
    }
    load()
    const t = setInterval(load, 60_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  return { data, error, loading }
}
