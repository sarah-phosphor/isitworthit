// Unit-checks the R2-4 scenario engine (qualification.editorialFor's group-stage
// "What changes?" copy) against HAND-BUILT standings, so the maths is validated
// independent of the live feed (real results can't be checked from memory).
//
// The contract under test: only assert a result that GUARANTEES a top-two finish
// (proven from points alone), otherwise fall back to naming the contenders. Run:
//   npx tsx scripts/verify-scenarios.ts
import type { Group, GroupRow, Match, ScoresPayload, Team } from '../src/lib/model'
import { buildContext, editorialFor } from '../src/lib/qualification'

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

console.log(failures ? `\n${failures} FAILED` : '\nALL SCENARIO CHECKS PASS')
if (failures) process.exit(1)
