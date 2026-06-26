// Fetches the FIFA World Cup 2026 from ESPN's public (unofficial) JSON endpoints
// and normalizes it into our internal model. Pure data: no editorial, no React,
// no browser-only APIs — so it runs equally in the Netlify function and the vite
// dev middleware. Confirmed live (slug `fifa.world`, season 2026):
//   scoreboard supports a date range; standings carries group + pts/GD/rank +
//   a qualification note + an `advanced` flag; odds carries 3-way moneylines.

import type {
  Group,
  GroupRow,
  Match,
  MatchState,
  Odds,
  ScoresPayload,
  Stage,
  Team,
} from './model'

const SCOREBOARD =
  'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard'
const STANDINGS =
  'https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings'
const SEASON = 2026
// Whole-tournament window (group stage → final). Over-covering is harmless.
const RANGE_START = '20260611'
const RANGE_END = '20260719'

async function getJSON(url: string): Promise<any> {
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${url}`)
  return res.json()
}

function gdLabel(gd: number): string {
  if (gd > 0) return `+${gd}`
  if (gd < 0) return `–${Math.abs(gd)}` // en-dash, matches the prototype
  return '0'
}

function parseStandings(json: any): {
  teams: Record<string, Team>
  groups: Group[]
} {
  const teams: Record<string, Team> = {}
  const groups: Group[] = []
  for (const child of json?.children ?? []) {
    const groupName: string = child.name ?? child.abbreviation ?? ''
    const id = (groupName.replace(/^Group\s+/i, '').trim() || groupName).trim()
    const entries = child.standings?.entries ?? []
    const rows: GroupRow[] = []
    for (const e of entries) {
      const teamId = String(e.team?.id ?? e.team?.uid ?? e.team?.displayName)
      const name = e.team?.displayName ?? e.team?.shortDisplayName ?? teamId
      const short = e.team?.abbreviation
      teams[teamId] = { id: teamId, name, short, group: id }
      const stat = (n: string): any =>
        (e.stats ?? []).find((s: any) => s.name === n)
      const num = (n: string, d = 0): number => {
        const s = stat(n)
        if (typeof s?.value === 'number') return s.value
        if (s?.displayValue != null) {
          const v = Number(String(s.displayValue).replace(/[^0-9.\-]/g, ''))
          return Number.isFinite(v) ? v : d
        }
        return d
      }
      const gd = num('pointDifferential', 0)
      const note = e.note
      rows.push({
        teamId,
        name,
        pts: num('points', 0),
        gd,
        gdLabel: gdLabel(gd),
        played: num('gamesPlayed', 0),
        rank: num('rank', 0),
        advanced:
          stat('advanced')?.value === 1 || stat('advanced')?.displayValue === '1',
        statusNote:
          (note && typeof note === 'object' ? note.description : note) || '',
      })
    }
    rows.sort((a, b) => (a.rank || 99) - (b.rank || 99))
    groups.push({ id, name: groupName || `Group ${id}`, table: rows })
  }
  groups.sort((a, b) => a.id.localeCompare(b.id))
  return { teams, groups }
}

function parseAmerican(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const n = Number(String(v).replace('+', '').trim())
  return Number.isFinite(n) ? n : null
}

function americanToProb(a: number): number {
  return a >= 0 ? 100 / (a + 100) : -a / (-a + 100)
}

function parseOdds(comp: any): Odds | undefined {
  const o = (comp?.odds ?? [])[0]
  if (!o) return undefined
  const homeA = parseAmerican(
    o.moneyline?.home?.current?.odds ?? o.homeTeamOdds?.moneyLine,
  )
  const awayA = parseAmerican(
    o.moneyline?.away?.current?.odds ?? o.awayTeamOdds?.moneyLine,
  )
  const drawA = parseAmerican(o.drawOdds?.moneyLine)
  if (homeA == null || awayA == null || drawA == null) return undefined
  let h = americanToProb(homeA)
  let d = americanToProb(drawA)
  let a = americanToProb(awayA)
  const sum = h + d + a
  if (sum <= 0) return undefined
  h = (h / sum) * 100
  d = (d / sum) * 100
  a = (a / sum) * 100
  let hr = Math.round(h)
  let dr = Math.round(d)
  let ar = Math.round(a)
  const drift = 100 - (hr + dr + ar) // push rounding error onto the largest bucket
  if (drift !== 0) {
    const m = Math.max(hr, dr, ar)
    if (m === hr) hr += drift
    else if (m === ar) ar += drift
    else dr += drift
  }
  return { home: hr, draw: dr, away: ar, source: o.provider?.name ?? 'odds' }
}

function parseState(comp: any): MatchState {
  const t = comp?.status?.type ?? {}
  const st = t.state
  if (st === 'in' || t.name === 'STATUS_IN_PROGRESS' || t.name === 'STATUS_HALFTIME' || t.name === 'STATUS_FIRST_HALF' || t.name === 'STATUS_SECOND_HALF')
    return 'live'
  if (st === 'post' || t.completed === true) return 'completed'
  return 'upcoming'
}

const ROUND_LABEL: Record<string, string> = {
  'round-of-32': 'Round of 32',
  'round-of-16': 'Round of 16',
  quarterfinals: 'Quarterfinals',
  'quarter-finals': 'Quarterfinals',
  semifinals: 'Semifinals',
  'semi-finals': 'Semifinals',
  final: 'Final',
  'third-place': 'Third-place playoff',
}

function roundFromSlug(slug: string): string | undefined {
  if (!slug || slug === 'group-stage') return undefined
  return ROUND_LABEL[slug] ?? slug.replace(/-/g, ' ')
}

// The 16 WC2026 host venues → a region code appended after the city (R4.1-4).
// ESPN's venue address only carries { city, country } — there is NO `state` field:
// the US state is buried inside `city` ("Foxborough, Massachusetts") and Canada/
// Mexico carry no region at all. Rather than trust that inconsistent feed we map the
// 16 known venues (keyed by ESPN's exact `fullName`). US/Canada use the standard
// 2-letter code; Mexico has no 2-letter standard, so the recognizable region name is
// used. A venue missing from the map just renders without a region.
const VENUE_REGION: Record<string, string> = {
  // United States
  'SoFi Stadium': 'CA',
  "Levi's Stadium": 'CA',
  'Lumen Field': 'WA',
  'Gillette Stadium': 'MA',
  'MetLife Stadium': 'NJ',
  'Lincoln Financial Field': 'PA',
  'Hard Rock Stadium': 'FL',
  'Mercedes-Benz Stadium': 'GA',
  'NRG Stadium': 'TX',
  'AT&T Stadium': 'TX',
  'GEHA Field at Arrowhead Stadium': 'MO',
  // Canada
  'BMO Field': 'ON',
  'BC Place': 'BC',
  // Mexico (no standard 2-letter code)
  'Estadio Banorte': 'CDMX',
  'Estadio Akron': 'Jalisco',
  'Estadio BBVA': 'Nuevo León',
}

function parseMatch(ev: any, teams: Record<string, Team>): Match | null {
  const comp = ev?.competitions?.[0]
  if (!comp) return null
  const cs = comp.competitors ?? []
  const homeC = cs.find((c: any) => c.homeAway === 'home') ?? cs[0]
  const awayC = cs.find((c: any) => c.homeAway === 'away') ?? cs[1]
  if (!homeC || !awayC) return null
  const homeId = String(homeC.team?.id)
  const awayId = String(awayC.team?.id)
  const home = homeC.team?.displayName ?? teams[homeId]?.name ?? homeId
  const away = awayC.team?.displayName ?? teams[awayId]?.name ?? awayId
  // make sure scoreboard-only teams (e.g. knockout) exist in the map
  if (!teams[homeId]) teams[homeId] = { id: homeId, name: home, short: homeC.team?.abbreviation }
  if (!teams[awayId]) teams[awayId] = { id: awayId, name: away, short: awayC.team?.abbreviation }

  const state = parseState(comp)
  const score =
    state !== 'upcoming' && homeC.score != null && awayC.score != null
      ? { home: Number(homeC.score), away: Number(awayC.score) }
      : undefined

  const gh = teams[homeId]?.group
  const ga = teams[awayId]?.group
  const isGroup = !!gh && !!ga && gh === ga
  const stage: Stage = isGroup ? 'group' : 'ko'
  const slug: string = ev.season?.slug ?? comp.season?.slug ?? ''

  let minute: string | undefined
  if (state === 'live')
    minute = comp.status?.type?.shortDetail || comp.status?.displayClock || undefined

  const vRaw = comp.venue ?? ev.venue
  let venue: string | undefined
  if (vRaw?.fullName) {
    const fullName = String(vRaw.fullName)
    // city arrives as "City, State Name" for US venues, "City" for Canada/Mexico —
    // take the city, then append our own clean region code (see VENUE_REGION).
    const city = String(vRaw.address?.city ?? '').split(',')[0].trim()
    const region = VENUE_REGION[fullName]
    venue = city
      ? `${fullName} · ${city}${region ? `, ${region}` : ''}`
      : fullName
  }

  return {
    id: String(ev.id),
    stage,
    group: isGroup ? gh : undefined,
    roundName: isGroup ? undefined : roundFromSlug(slug),
    state,
    dateISO: ev.date,
    homeId,
    awayId,
    home,
    away,
    score,
    minute,
    venue,
    odds: parseOdds(comp),
  }
}

// Two calls: standings (group tables + qualification notes) and the whole-
// tournament scoreboard range (fixtures, scores, live status + minute, and odds
// for in-play games). ESPN only attaches full 3-way moneylines to live games;
// upcoming games fall back to a form-based "favored" line computed client-side.
export async function getScores(): Promise<ScoresPayload> {
  const [stJson, rangeJson] = await Promise.all([
    getJSON(`${STANDINGS}?season=${SEASON}`),
    getJSON(`${SCOREBOARD}?dates=${RANGE_START}-${RANGE_END}`),
  ])

  const { teams, groups } = parseStandings(stJson)

  const matchMap = new Map<string, Match>()
  for (const ev of rangeJson?.events ?? []) {
    try {
      const m = parseMatch(ev, teams)
      if (m) matchMap.set(m.id, m)
    } catch {
      /* skip a single malformed event rather than fail the whole feed */
    }
  }

  const matches = [...matchMap.values()].sort((a, b) =>
    a.dateISO.localeCompare(b.dateISO),
  )

  return {
    generatedAt: new Date().toISOString(),
    source: 'espn',
    teams,
    groups,
    matches,
  }
}
