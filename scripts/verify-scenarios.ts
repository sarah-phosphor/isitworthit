// Unit-checks the R2-4 scenario engine (qualification.editorialFor's group-stage
// "What changes?" copy) against HAND-BUILT standings, so the maths is validated
// independent of the live feed (real results can't be checked from memory).
//
// The contract under test: only assert a result that GUARANTEES a top-two finish
// (proven from points alone), otherwise fall back to naming the contenders. Run:
//   npx tsx scripts/verify-scenarios.ts
import type { Group, GroupRow, Match, ScoresPayload, Team } from '../src/lib/model'
import { buildContext, editorialFor, teamNextOutlook } from '../src/lib/qualification'

let failures = 0
const D = '2026-06-25T19:00:00.000Z'

// compact builders ---------------------------------------------------------
function row(teamId: string, pts: number, played: number, rank: number, opts: Partial<GroupRow> = {}): GroupRow {
  return { teamId, name: teamId, pts, gd: 0, gdLabel: '0', played, rank, advanced: false, statusNote: '', ...opts }
}
function upcoming(group: string, homeId: string, awayId: string, n: number): Match {
  return { id: `${group}${n}`, stage: 'group', group, state: 'upcoming', dateISO: D, homeId, awayId, home: homeId, away: awayId }
}
function payload(group: string, rows: GroupRow[], fixtures: Match[]): ScoresPayload {
  const teams: Record<string, Team> = {}
  for (const r of rows) teams[r.teamId] = { id: r.teamId, name: r.teamId, group }
  const g: Group = { id: group, name: `Group ${group}`, table: [...rows].sort((a, b) => a.rank - b.rank) }
  return { generatedAt: D, source: 'espn', teams, groups: [g], matches: fixtures }
}

// multi-group payloads for best-third tests (item 4) ------------------------
function mkGroup(id: string, third: { pts: number; gd: number }, done: boolean, thirdTeamId?: string): Group {
  const p = done ? 3 : 2
  const rows: GroupRow[] = [
    row(`${id}1`, 9, p, 1, { gd: 6 }),
    row(`${id}2`, 6, p, 2, { gd: 3 }),
    row(thirdTeamId ?? `${id}3`, third.pts, p, 3, { gd: third.gd }),
    row(`${id}4`, 0, p, 4, { gd: -9 }),
  ]
  return { id, name: `Group ${id}`, table: rows }
}
function fillers(prefix: string, n: number, third: { pts: number; gd: number }, done: boolean): Group[] {
  return Array.from({ length: n }, (_, i) => mkGroup(`${prefix}${i}`, third, done))
}
function outlookFor(groups: Group[], teamId: string) {
  const teams: Record<string, Team> = {}
  for (const g of groups) for (const r of g.table) teams[r.teamId] = { id: r.teamId, name: r.teamId, group: g.id }
  const p: ScoresPayload = { generatedAt: D, source: 'espn', teams, groups, matches: [] }
  return teamNextOutlook(teamId, buildContext(p))
}
function expectOutlook(label: string, o: { tone: string; line: string }, tone: string, want: string[], banned: string[] = []) {
  const missing = want.filter((s) => !o.line.includes(s))
  const hit = banned.filter((s) => o.line.includes(s))
  if (o.tone !== tone || missing.length || hit.length) {
    console.log(`FAIL  ${label} — tone=${o.tone} (want ${tone})${missing.length ? ` missing ${missing.map((s) => `"${s}"`).join(',')}` : ''}${hit.length ? ` BANNED ${hit.map((s) => `"${s}"`).join(',')}` : ''}\n        "${o.line}"`)
    failures++
  } else {
    console.log(`PASS  ${label} [${o.tone}]\n        "${o.line}"`)
  }
}

function changesFor(p: ScoresPayload, matchId: string): string {
  const ctx = buildContext(p)
  const m = p.matches.find((x) => x.id === matchId)!
  return editorialFor(m, ctx).whatChanges
}

// The concrete scenario now lives in the WHY (C1); flatten it (text or glossed).
function whyFor(p: ScoresPayload, matchId: string): string {
  const ctx = buildContext(p)
  const m = p.matches.find((x) => x.id === matchId)!
  const g = editorialFor(m, ctx).why
  return g.text ?? `${g.pre ?? ''}${g.term ?? ''}${g.post ?? ''}`
}

function expect(label: string, got: string, wantSubstr: string[]) {
  const missing = wantSubstr.filter((s) => !got.includes(s))
  if (missing.length) {
    console.log(`FAIL  ${label}\n        got:  "${got}"\n        want: ${missing.map((s) => `"${s}"`).join(', ')}`)
    failures++
  } else {
    console.log(`PASS  ${label}\n        "${got}"`)
  }
}
function expectNot(label: string, got: string, banned: string[]) {
  const hit = banned.filter((s) => got.includes(s))
  if (hit.length) {
    console.log(`FAIL  ${label} — must NOT claim ${hit.map((s) => `"${s}"`).join(', ')}\n        got: "${got}"`)
    failures++
  } else {
    console.log(`PASS  ${label} (correctly under-claims)\n        "${got}"`)
  }
}

// CASE 1 — last round, A & B level on 4, neither can be caught by a win: a win
// sends either through; a draw does NOT clinch (the other could still pass them).
{
  const p = payload('A', [row('A', 4, 2, 1), row('B', 4, 2, 2), row('C', 3, 2, 3), row('D', 0, 2, 4)], [
    upcoming('A', 'A', 'B', 1),
    upcoming('A', 'C', 'D', 2),
  ])
  expect('1. win-or-bust decider — scenario in WHY', whyFor(p, 'A1'), ['win sends A through', 'win sends B through'])
  expect('1b. clean headline', changesFor(p, 'A1'), ['Who goes through'])
}

// CASE 2 — A on 6 & B on 4 meet last; both are safe with a draw.
{
  const p = payload('B', [row('A', 6, 2, 1), row('B', 4, 2, 2), row('C', 1, 2, 3), row('D', 1, 2, 4)], [
    upcoming('B', 'A', 'B', 1),
    upcoming('B', 'C', 'D', 2),
  ])
  expect('2. a draw sends both through (WHY)', whyFor(p, 'B1'), ['draw sends both A and B'])
  expect('2b. headline = who tops', changesFor(p, 'B1'), ['Who tops'])
}

// CASE 3 — asymmetric: a draw is enough for A; B must win (C can still reach B's
// drawn total, so a B draw is not a clinch).
{
  const p = payload('C', [row('A', 6, 2, 1), row('B', 3, 2, 2), row('C', 1, 2, 3), row('D', 1, 2, 4)], [
    upcoming('C', 'A', 'B', 1),
    upcoming('C', 'C', 'D', 2),
  ])
  expect('3. asymmetric clinch (WHY)', whyFor(p, 'C1'), ['draw is enough for A', 'win sends B through'])
}

// CASE 4 — early (1 game played, 2 to go): nothing is clinchable. Must fall back
// to naming the field, never invent a guarantee.
{
  const p = payload('D', [row('A', 3, 1, 1), row('B', 3, 1, 2), row('C', 0, 1, 3), row('D', 0, 1, 4)], [
    upcoming('D', 'A', 'B', 1),
    upcoming('D', 'C', 'D', 2),
    upcoming('D', 'A', 'C', 3),
    upcoming('D', 'B', 'D', 4),
  ])
  const why = whyFor(p, 'D1')
  expect('4. no clinch → names the field (WHY)', why, ['chasing the spots', 'C', 'D'])
  expect('4b. clean headline', changesFor(p, 'D1'), ['Who goes through'])
  expectNot('4c. no false guarantee', why, ['sends A through', 'sends B through', 'draw is enough'])
}

// CASE 5 — one side already through (advanced), the other (rank 2) can confirm
// with a win: "confirm their place" upgrades to a concrete clinch.
{
  const p = payload('E', [row('B', 6, 2, 1, { advanced: true }), row('A', 4, 2, 2), row('C', 3, 2, 3), row('D', 0, 2, 4)], [
    upcoming('E', 'A', 'B', 1),
    upcoming('E', 'C', 'D', 2),
  ])
  expect('5. alive-in-spot win clinch (WHY)', whyFor(p, 'E1'), ['win sends A through'])
  expect('5b. clean headline', changesFor(p, 'E1'), ['Whether A go through'])
}

// ===== best-third-place outlook (item 4 — the heavy one) =====
// 8 of 12 third-placed teams advance, ranked pts → GD → goals (goals unavailable
// → ties handled conservatively, never assert a goals-dependent outcome).

// BT1 — in-race like South Korea: 3 thirds strictly above (4 pts), 1 below
// (3 pts worse GD), 7 groups still to play → out only if 5+ of those out-third it.
{
  const groups = [
    mkGroup('TG', { pts: 3, gd: -1 }, true, 'TARGET'),
    mkGroup('U1', { pts: 4, gd: 0 }, true),
    mkGroup('U2', { pts: 4, gd: 0 }, true),
    mkGroup('U3', { pts: 4, gd: -1 }, true),
    mkGroup('B1', { pts: 3, gd: -3 }, true),
    ...fillers('P', 7, { pts: 0, gd: 0 }, false),
  ]
  expectOutlook('BT1 in-race (3 above, 7 pending)', outlookFor(groups, 'TARGET'), 'race', ['out only if 5+', '7 groups'], ['are through', 'Knocked out'])
}

// BT2 — provably OUT: 8 third-placed teams strictly above it, can't be caught.
{
  const groups = [
    mkGroup('TG', { pts: 1, gd: -5 }, true, 'TARGET'),
    ...Array.from({ length: 8 }, (_, i) => mkGroup(`A${i}`, { pts: 3, gd: 0 }, true)),
    ...fillers('P', 3, { pts: 0, gd: 0 }, false),
  ]
  expectOutlook('BT2 provably out (8 above)', outlookFor(groups, 'TARGET'), 'out', ['outside the best 8'], ['out only if', 'are through'])
}

// BT3 — provably THROUGH: best third, too few groups left to bump it out.
{
  const groups = [
    mkGroup('TG', { pts: 5, gd: 4 }, true, 'TARGET'),
    ...Array.from({ length: 4 }, (_, i) => mkGroup(`L${i}`, { pts: 2, gd: -2 }, true)),
    ...fillers('P', 7, { pts: 9, gd: 9 }, false), // pending values irrelevant — only their count (7) matters
  ]
  expectOutlook('BT3 provably through (best, 7 pending < 8)', outlookFor(groups, 'TARGET'), 'through', ['through as one of the best 8'], ['out only if'])
}

// BT4 — all 12 groups done, target is the 8th-best third → through.
{
  const groups = [
    mkGroup('TG', { pts: 3, gd: -2 }, true, 'TARGET'),
    ...Array.from({ length: 7 }, (_, i) => mkGroup(`A${i}`, { pts: 4, gd: 0 }, true)),
    ...Array.from({ length: 4 }, (_, i) => mkGroup(`L${i}`, { pts: 2, gd: 0 }, true)),
  ]
  expectOutlook('BT4 all done, 8th third → through', outlookFor(groups, 'TARGET'), 'through', ['through'], ['out only if'])
}

// BT5 — all 12 groups done, target is the 9th-best third → out.
{
  const groups = [
    mkGroup('TG', { pts: 2, gd: -2 }, true, 'TARGET'),
    ...Array.from({ length: 8 }, (_, i) => mkGroup(`A${i}`, { pts: 3, gd: 0 }, true)),
    ...Array.from({ length: 3 }, (_, i) => mkGroup(`L${i}`, { pts: 1, gd: 0 }, true)),
  ]
  expectOutlook('BT5 all done, 9th third → out', outlookFor(groups, 'TARGET'), 'out', ['outside the best 8'])
}

// BT6 — sat at the cut-off level on pts+GD with another third, all groups done:
// the order is decided by goals scored, which the feed lacks → honest, undecided.
{
  const groups = [
    mkGroup('TG', { pts: 3, gd: -1 }, true, 'TARGET'),
    ...Array.from({ length: 7 }, (_, i) => mkGroup(`A${i}`, { pts: 4, gd: 0 }, true)),
    mkGroup('TIE', { pts: 3, gd: -1 }, true),
    ...Array.from({ length: 3 }, (_, i) => mkGroup(`L${i}`, { pts: 2, gd: 0 }, true)),
  ]
  expectOutlook('BT6 tie at cut-off → goals-scored, undecided', outlookFor(groups, 'TARGET'), 'race', ['goals scored'], ['are through', 'Knocked out', 'out only if'])
}

console.log(failures ? `\n${failures} FAILED` : '\nALL SCENARIO CHECKS PASS')
if (failures) process.exit(1)
