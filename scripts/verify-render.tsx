// Server-renders each view with live data to confirm they don't throw and
// contain the expected content (the bits a headless screenshot can't click into).
import { renderToString } from 'react-dom/server'
import { getScores } from '../src/lib/espnSource'
import { buildContext } from '../src/lib/qualification'
import { DayView, StandingsView, GroupView, TeamView, MatchView } from '../src/App'

const nav = {
  openTeam() {},
  openGroup() {},
  openMatch() {},
  goToday() {},
  goStandings() {},
  prevDay() {},
  nextDay() {},
}

const p = await getScores()
const ctx = buildContext(p)

let failures = 0
function check(name: string, el: React.ReactElement, must: string[]) {
  let html = ''
  try {
    html = renderToString(el)
  } catch (e) {
    console.log(`FAIL ${name} — threw: ${String(e)}`)
    failures++
    return
  }
  const missing = must.filter((s) => !html.includes(s))
  if (missing.length) {
    console.log(`FAIL ${name} (${html.length} chars) — missing: ${missing.join(' | ')}`)
    failures++
  } else {
    console.log(`PASS ${name} (${html.length} chars)`)
  }
}

const gid = p.groups[0].id
const tid = p.groups[0].table[0].teamId
const tname = p.groups[0].table[0].name

const mid = p.matches.find((m) => m.group)?.id ?? p.matches[0].id

// tense-agnostic: "it matter?" covers Does/Did, "Why?" is always present (a given
// day's games may all be completed once the group stage ends)
check('DayView', <DayView off={0} ctx={ctx} nav={nav} />, ['it matter?', 'Why?'])
check('GroupView', <GroupView groupId={gid} ctx={ctx} nav={nav} />, [`Group ${gid}`, 'Pts', 'Matches'])
check('TeamView', <TeamView teamId={tid} ctx={ctx} nav={nav} />, [tname, 'Current status', 'Past matches'])
check('MatchView', <MatchView matchId={mid} ctx={ctx} nav={nav} />, ['it matter?'])
check('StandingsView', <StandingsView ctx={ctx} nav={nav} />, [`Group ${gid}`, 'pts', tname])

console.log(failures ? `\n${failures} FAILED` : '\nALL VIEWS RENDER OK')
