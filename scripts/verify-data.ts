// Exercises both data sources against the live endpoints and prints a summary to
// eyeball for correctness. Run: npm run verify:data
import { getScores } from '../src/lib/espnSource'
import { getScoresFromOpenFootball } from '../src/lib/openfootballSource'
import type { Match, ScoresPayload } from '../src/lib/model'
import { buildContext, editorialFor, groupSummary, teamStatusLine } from '../src/lib/qualification'

const TZ = 'America/Los_Angeles'
const ymd = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
const todayYmd = ymd(new Date().toISOString())

function summary(label: string, p: ScoresPayload) {
  console.log(`\n========== ${label} (source=${p.source}${p.stale ? ', STALE' : ''}) ==========`)
  console.log(`teams=${Object.keys(p.teams).length}  groups=${p.groups.length}  matches=${p.matches.length}`)
  const byState = p.matches.reduce<Record<string, number>>((a, m) => ((a[m.state] = (a[m.state] || 0) + 1), a), {})
  console.log('by state:', byState)

  const today = p.matches.filter((m) => ymd(m.dateISO) === todayYmd)
  console.log(`\nTODAY (${todayYmd}) — ${today.length} matches:`)
  for (const m of today)
    console.log(
      `  [${m.state}] ${m.home} ${m.score ? m.score.home + '-' + m.score.away : ''} vs ${m.away}` +
        `${m.minute ? ' (' + m.minute + ')' : ''}  ${m.group ? 'Group ' + m.group : m.roundName ?? ''}` +
        `${m.odds ? `  odds ${m.odds.home}/${m.odds.draw}/${m.odds.away}` : '  (no odds)'}`,
    )

  console.log('\nGroup A table:')
  const ga = p.groups.find((g) => g.id === 'A')
  ga?.table.forEach((r) =>
    console.log(`  ${r.rank}. ${r.name.padEnd(16)} pts=${r.pts} gd=${r.gdLabel} played=${r.played} adv=${r.advanced} note="${r.statusNote}"`),
  )

  const withOdds = p.matches.filter((m) => m.odds)
  console.log(`\nmatches with odds: ${withOdds.length}`)
  const c = p.matches.find((m) => m.state === 'completed' && m.odds)
  if (c) console.log(`completed+odds sample: ${c.home} ${c.score?.home}-${c.score?.away} ${c.away} | predicted ${c.odds?.home}/${c.odds?.draw}/${c.odds?.away}`)
  const dates = [...new Set(p.matches.map((m) => ymd(m.dateISO)))].sort()
  console.log(`date span: ${dates[0]} … ${dates[dates.length - 1]} (${dates.length} distinct days)`)
}

function glossText(g: { text?: string; pre?: string; term?: string; post?: string }): string {
  return g.text ?? `${g.pre ?? ''}[${g.term ?? ''}]${g.post ?? ''}`
}

function engineCheck(p: ScoresPayload) {
  const ctx = buildContext(p)
  console.log('\n---------- ENGINE: today’s cards ----------')
  const today = p.matches.filter((m) => ymd(m.dateISO) === todayYmd)
  for (const m of today) printEditorial(m, ctx)

  console.log('\n---------- ENGINE: sample completed group games ----------')
  for (const m of p.matches.filter((x) => x.state === 'completed' && x.group).slice(0, 4)) printEditorial(m, ctx)

  console.log('\n---------- ENGINE: group summaries ----------')
  for (const g of p.groups) console.log(`  ${g.name}: ${groupSummary(g, ctx)}`)

  console.log('\n---------- ENGINE: team status lines (Group A) ----------')
  p.groups.find((g) => g.id === 'A')?.table.forEach((r) => console.log(`  ${r.name}: ${teamStatusLine(r.teamId, ctx)}`))

  function printEditorial(m: Match, c: ReturnType<typeof buildContext>) {
    const e = editorialFor(m, c)
    const sc = m.score ? ` ${m.score.home}-${m.score.away}` : ''
    console.log(`\n  ${m.home} vs ${m.away}${sc}  [${m.state}${m.group ? ' · Group ' + m.group : ' · ' + (m.roundName ?? 'KO')}]`)
    console.log(`     matters:   ${e.matters}`)
    console.log(`     changes:   ${e.whatChanges}`)
    console.log(`     why:       ${glossText(e.why)}`)
    if (m.odds) console.log(`     bar(odds): ${m.odds.home}/${m.odds.draw}/${m.odds.away}`)
  }
}

const espn = await getScores()
summary('ESPN', espn)
engineCheck(espn)

try {
  const of = await getScoresFromOpenFootball()
  summary('openfootball', of)
} catch (e) {
  console.log('\nopenfootball fallback FAILED:', String(e))
}
