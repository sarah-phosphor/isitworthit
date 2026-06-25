// Fallback data source: openfootball/worldcup.json (CC0, no key). Used only when
// ESPN fails and there's no cached payload. No live status and no odds — group
// standings are computed from completed results. Degraded but real.

import type { Group, GroupRow, Match, ScoresPayload, Stage, Team } from './model'

const URL =
  'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json'

const slug = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const ROUND_LABEL: Record<string, string> = {
  'round of 32': 'Round of 32',
  'round of 16': 'Round of 16',
  'quarter-final': 'Quarterfinals',
  'quarter-finals': 'Quarterfinals',
  'semi-final': 'Semifinals',
  'semi-finals': 'Semifinals',
  final: 'Final',
  'match for third place': 'Third-place playoff',
}

function gdLabel(gd: number): string {
  if (gd > 0) return `+${gd}`
  if (gd < 0) return `–${Math.abs(gd)}`
  return '0'
}

function isoFrom(date: string, time?: string): string {
  const m = time && /(\d{1,2}):(\d{2})\s*UTC([+-]\d{1,2})/.exec(time)
  if (m) {
    const hh = m[1].padStart(2, '0')
    const off = Number(m[3])
    const sign = off <= 0 ? '+' : '-' // local = UTC+off → to get UTC ISO offset string we invert
    const oh = String(Math.abs(off)).padStart(2, '0')
    return `${date}T${hh}:${m[2]}:00${sign}${oh}:00`
  }
  return `${date}T18:00:00.000Z`
}

export async function getScoresFromOpenFootball(): Promise<ScoresPayload> {
  const res = await fetch(URL, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`openfootball ${res.status}`)
  const data: any = await res.json()
  const raw: any[] = data?.matches ?? []

  const teams: Record<string, Team> = {}
  const matches: Match[] = []
  // accumulators for computing group tables
  const acc: Record<
    string,
    Record<string, { pts: number; gf: number; ga: number; played: number }>
  > = {}

  for (const m of raw) {
    const isGroup = typeof m.group === 'string' && /^Group\s/i.test(m.group)
    const gid = isGroup ? m.group.replace(/^Group\s+/i, '').trim() : undefined
    const t1 = String(m.team1)
    const t2 = String(m.team2)
    const id1 = slug(t1)
    const id2 = slug(t2)
    teams[id1] = { id: id1, name: t1, group: gid ?? teams[id1]?.group }
    teams[id2] = { id: id2, name: t2, group: gid ?? teams[id2]?.group }

    const ft = m.score?.ft
    const hasScore = Array.isArray(ft) && ft.length === 2 && ft.every((n: any) => typeof n === 'number')
    const stage: Stage = isGroup ? 'group' : 'ko'

    matches.push({
      id: slug(`${m.date}-${id1}-${id2}`),
      stage,
      group: gid,
      roundName: isGroup ? undefined : ROUND_LABEL[String(m.round).toLowerCase()] ?? String(m.round),
      state: hasScore ? 'completed' : 'upcoming',
      dateISO: isoFrom(m.date, m.time),
      homeId: id1,
      awayId: id2,
      home: t1,
      away: t2,
      score: hasScore ? { home: ft[0], away: ft[1] } : undefined,
    })

    if (isGroup && gid && hasScore) {
      const g = (acc[gid] ??= {})
      const a = (g[id1] ??= { pts: 0, gf: 0, ga: 0, played: 0 })
      const b = (g[id2] ??= { pts: 0, gf: 0, ga: 0, played: 0 })
      a.gf += ft[0]; a.ga += ft[1]; a.played++
      b.gf += ft[1]; b.ga += ft[0]; b.played++
      if (ft[0] > ft[1]) a.pts += 3
      else if (ft[0] < ft[1]) b.pts += 3
      else { a.pts++; b.pts++ }
    }
  }

  const groups: Group[] = Object.keys(acc)
    .sort()
    .map((gid) => {
      const rows: GroupRow[] = Object.entries(acc[gid])
        .map(([teamId, s]) => {
          const gd = s.gf - s.ga
          return {
            teamId,
            name: teams[teamId]?.name ?? teamId,
            pts: s.pts,
            gd,
            gdLabel: gdLabel(gd),
            played: s.played,
            rank: 0,
            advanced: false,
            statusNote: '',
          }
        })
        .sort((a, b) => b.pts - a.pts || b.gd - a.gd)
      rows.forEach((r, i) => (r.rank = i + 1))
      return { id: gid, name: `Group ${gid}`, table: rows }
    })

  return {
    generatedAt: new Date().toISOString(),
    source: 'openfootball',
    stale: true,
    teams,
    groups,
    matches: matches.sort((a, b) => a.dateISO.localeCompare(b.dateISO)),
  }
}
