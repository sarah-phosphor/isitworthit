// Server-renders each view with live data to confirm they don't throw and
// contain the expected content (the bits a headless screenshot can't click into).
import { renderToString } from 'react-dom/server'
import { getScores } from '../src/lib/espnSource'
import { buildContext } from '../src/lib/qualification'
import { DayView, SearchView, GroupView, TeamView, MatchView } from '../src/App'

const nav = {
  openTeam() {},
  openGroup() {},
  openMatch() {},
  goBack() {},
  goToday() {},
  goSearch() {},
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

check('DayView', <DayView off={0} ctx={ctx} nav={nav} />, ['Does it matter', 'What changes'])
check('GroupView', <GroupView groupId={gid} ctx={ctx} backLabel="Today" nav={nav} />, [`Group ${gid}`, 'Pts', 'Matches'])
check('TeamView', <TeamView teamId={tid} ctx={ctx} backLabel="Group" nav={nav} />, [tname, 'Current status', 'Past matches'])
check('MatchView', <MatchView matchId={mid} ctx={ctx} backLabel="Today" nav={nav} />, ['it matter?'])
check('SearchView', <SearchView ctx={ctx} query="" onQuery={() => {}} nav={nav} />, ['Search by team', 'pts'])
check('SearchView(USA alias)', <SearchView ctx={ctx} query="usa" onQuery={() => {}} nav={nav} />, ['United States'])
check('SearchView(turkey alias)', <SearchView ctx={ctx} query="turkey" onQuery={() => {}} nav={nav} />, ['Türkiye'])

console.log(failures ? `\n${failures} FAILED` : '\nALL VIEWS RENDER OK')
