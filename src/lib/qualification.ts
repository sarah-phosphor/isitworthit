// The deterministic engine. Given the live standings + fixtures, it works out
// what each match is actually at stake for and renders that as plain-English
// copy. The hard part — who's through, out, or still alive — leans on ESPN's
// own qualification notes (authoritative), and the engine only *translates*.
// Design rule: when something isn't certain, say less, never more.

import { GLOSSARY, type GlossaryKey } from './glossary'
import type {
  Gloss,
  Group,
  GroupRow,
  Match,
  ScoresPayload,
} from './model'

export type Status = 'through' | 'alive' | 'out' | 'unknown'

export interface TeamStatus {
  status: Status
  note: string // short label for tables/search: 'Through' | 'In contention' | 'Out'
  tone: string // color
}

const TONE: Record<Status, string> = {
  through: '#3a3631',
  alive: '#7a6f55',
  out: '#b0a99c',
  unknown: '#9a948a',
}

export interface Editorial {
  matters: string // binary verdict: 'Yes.' | 'No.'
  whatChanges: string // tense matches the match state
  why: Gloss
}

export interface QualContext {
  payload: ScoresPayload
  status: Map<string, TeamStatus>
  rowByTeam: Map<string, GroupRow>
  groupById: Map<string, Group>
}

// ---------- helpers ----------

const text = (s: string): Gloss => ({ text: s })
const tip = (pre: string, term: string, post: string, key: GlossaryKey): Gloss => ({
  pre,
  term,
  post,
  tip: GLOSSARY[key],
})

function list(a: string[]): string {
  if (a.length <= 1) return a[0] ?? ''
  if (a.length === 2) return `${a[0]} and ${a[1]}`
  return `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`
}

// Clinched-only 'through'/'out'; anything still mathematically open is 'alive'.
// We trust ESPN's `advanced` flag and explicit "Eliminated" note, plus final
// standings once a group is complete. A projected top-2 that hasn't clinched
// stays 'alive' on purpose — better to under-claim than to call a team through
// before it actually is.
function classify(row: GroupRow, complete: boolean): Status {
  const n = (row.statusNote || '').toLowerCase()
  if (/elimin/.test(n)) return 'out'
  if (row.advanced) return 'through'
  if (complete) return row.rank <= 2 ? 'through' : row.rank === 3 ? 'alive' : 'out'
  if (/best\s*8|best\s*eight|third|advance|round of 32/.test(n)) return 'alive'
  if (row.played > 0) return 'alive'
  return 'unknown'
}

function shortNote(s: Status): string {
  return s === 'through' ? 'Through' : s === 'out' ? 'Out' : s === 'alive' ? 'In contention' : ''
}

export function buildContext(payload: ScoresPayload): QualContext {
  const status = new Map<string, TeamStatus>()
  const rowByTeam = new Map<string, GroupRow>()
  const groupById = new Map<string, Group>()
  for (const g of payload.groups) {
    groupById.set(g.id, g)
    const complete = g.table.every((r) => r.played >= 3)
    for (const r of g.table) {
      rowByTeam.set(r.teamId, r)
      const s = classify(r, complete)
      status.set(r.teamId, { status: s, note: shortNote(s), tone: TONE[s] })
    }
  }
  return { payload, status, rowByTeam, groupById }
}

function statusOf(ctx: QualContext, id: string): Status {
  return ctx.status.get(id)?.status ?? 'unknown'
}

function groupComplete(ctx: QualContext, gid?: string): boolean {
  const g = gid ? ctx.groupById.get(gid) : undefined
  return !!g && g.table.every((r) => r.played >= 3)
}

function topTwoMeeting(ctx: QualContext, match: Match): boolean {
  const g = match.group ? ctx.groupById.get(match.group) : undefined
  if (!g) return false
  const top = [...g.table].sort((a, b) => a.rank - b.rank).slice(0, 2).map((r) => r.teamId)
  return top.includes(match.homeId) && top.includes(match.awayId)
}

function levelOnPoints(ctx: QualContext, match: Match): boolean {
  const h = ctx.rowByTeam.get(match.homeId)
  const a = ctx.rowByTeam.get(match.awayId)
  return !!h && !!a && h.pts === a.pts
}

// rough, clearly-qualitative strength proxy from tournament form
function strength(ctx: QualContext, id: string): number {
  const r = ctx.rowByTeam.get(id)
  if (!r) return 0
  const games = Math.max(1, r.played)
  return r.pts / games + 0.35 * (r.gd / games)
}

// ---------- scenario maths (R2-4) ----------
// We only ever assert a *positive* clinch we can prove from points alone, so
// tiebreakers (goal difference, head-to-head) never enter into it, and we always
// under-claim: a rival counts as "can still catch us" whenever its maximum
// reachable points merely *ties* ours. Note: this proves a top-two finish.
// Finishing third can still qualify via the best-thirds rule, so we never use
// this to claim a team is *out* — only that a result guarantees them through.

function remainingGamesInGroup(ctx: QualContext, gid?: string): Match[] {
  if (!gid) return []
  return ctx.payload.matches.filter((m) => m.group === gid && m.state !== 'completed')
}

function remGamesFor(ctx: QualContext, gid: string | undefined, teamId: string): number {
  return remainingGamesInGroup(ctx, gid).filter(
    (m) => m.homeId === teamId || m.awayId === teamId,
  ).length
}

// Does `gain` points (3 for a win, 1 for a draw) from THIS match guarantee that
// `teamId` finishes in the top two of its group? Conservative — only true when at
// most one other team can even reach the team's post-result total.
function resultClinchesTop2(ctx: QualContext, match: Match, teamId: string, gain: number): boolean {
  const g = match.group ? ctx.groupById.get(match.group) : undefined
  const me = ctx.rowByTeam.get(teamId)
  if (!g || !me) return false
  const target = me.pts + gain // our guaranteed floor after this result
  const oppId = teamId === match.homeId ? match.awayId : match.homeId
  const oppGain = gain === 3 ? 0 : gain // if we win the opponent gets 0; if we draw, they draw too
  let canCatch = 0
  for (const r of g.table) {
    if (r.teamId === teamId) continue
    const otherRem = remGamesFor(ctx, match.group, r.teamId)
    // this match is settled by our assumed result; the opponent's *other* games stay open
    const max =
      r.teamId === oppId
        ? r.pts + oppGain + 3 * Math.max(0, otherRem - 1)
        : r.pts + 3 * otherRem
    if (max >= target) canCatch++
  }
  return canCatch <= 1
}

const winClinches = (ctx: QualContext, m: Match, id: string) => resultClinchesTop2(ctx, m, id, 3)
const drawClinches = (ctx: QualContext, m: Match, id: string) => resultClinchesTop2(ctx, m, id, 1)

// ---------- "did a completed game actually matter?" (dead-rubber detection) ----------
// A finished group game changed nothing if neither side's qualification could have
// differed under any other result. The group must be complete (every OTHER team's
// total is already final), so across the three W/D/L outcomes only these two teams'
// points move. We prove invariance on points alone — goal margins for hypothetical
// results are unknowable — and only call it settled when BOTH teams land definitively
// through (top two) or out (bottom) in every case. A third-place finish is left as
// "could have mattered": the best-third cut is cross-group and turns on the exact
// points/GD we can't reconstruct for a what-if score.

type QualBucket = 'top2' | 'third' | 'fourth' | 'amb'

function qualBucket(pts: number, otherPts: number[]): QualBucket {
  const above = otherPts.filter((p) => p > pts).length
  const ties = otherPts.filter((p) => p === pts).length
  const best = above + 1 // best possible finishing rank (ties break our way)
  const worst = above + ties + 1 // worst possible (ties break against us)
  if (worst <= 2) return 'top2'
  if (best >= 4) return 'fourth'
  if (best >= 3 && worst <= 3) return 'third'
  return 'amb'
}

function completedGroupMatchInvariant(ctx: QualContext, match: Match): boolean {
  if (!match.group || !match.score) return false
  const g = ctx.groupById.get(match.group)
  if (!g || !g.table.every((r) => r.played >= 3)) return false
  const h = ctx.rowByTeam.get(match.homeId)
  const a = ctx.rowByTeam.get(match.awayId)
  if (!h || !a) return false
  const { home: sh, away: sa } = match.score
  const got = (gf: number, ga: number) => (gf > ga ? 3 : gf === ga ? 1 : 0)
  const preH = h.pts - got(sh, sa) // each side's points BEFORE this game
  const preA = a.pts - got(sa, sh)
  const others = g.table
    .filter((r) => r.teamId !== match.homeId && r.teamId !== match.awayId)
    .map((r) => r.pts)
  const outcomes: Array<[number, number]> = [[3, 0], [1, 1], [0, 3]]
  const hB = new Set<QualBucket>()
  const aB = new Set<QualBucket>()
  for (const [hp, ap] of outcomes) {
    hB.add(qualBucket(preH + hp, [...others, preA + ap]))
    aB.add(qualBucket(preA + ap, [...others, preH + hp]))
  }
  const settled = (s: Set<QualBucket>) => s.size === 1 && (s.has('top2') || s.has('fourth'))
  return settled(hB) && settled(aB)
}

// Mirror of the clinch maths but for a team's FLOOR: can `teamId` still finish in
// the top two if it takes `gain` (3 = win, 1 = draw) from this match? Best case for
// them — they win every other game left; every rival loses every other game (the
// direct opponent only banks this match's `oppGain`). A rival is "locked above"
// only when even that floor clears the team's ceiling, so the result keeps a top-two
// finish reachable while at most one rival is locked above. Top-two only (best thirds
// can't be proven from points + GD), so a `false` here never asserts a team is out —
// only that a top-two finish is gone.
function resultKeepsTop2Possible(ctx: QualContext, match: Match, teamId: string, gain: number): boolean {
  const g = match.group ? ctx.groupById.get(match.group) : undefined
  const me = ctx.rowByTeam.get(teamId)
  if (!g || !me) return true // can't disprove → assume still possible (under-claim)
  const otherRem = remGamesFor(ctx, match.group, teamId) // includes this match
  const myCeiling = me.pts + gain + 3 * Math.max(0, otherRem - 1)
  const oppId = teamId === match.homeId ? match.awayId : match.homeId
  const oppGain = gain === 3 ? 0 : gain
  let lockedAbove = 0
  for (const r of g.table) {
    if (r.teamId === teamId) continue
    const rivalFloor = r.pts + (r.teamId === oppId ? oppGain : 0)
    if (rivalFloor > myCeiling) lockedAbove++
  }
  return lockedAbove <= 1
}

// Plain-English "what does this still-alive team need from the match" — replaces the
// old "need a result" jargon. Anchored on the top two, which is provable from points;
// it never claims a draw ends their tournament, since a best-third place can't be
// ruled out from the feed.
function aliveNeedPhrase(ctx: QualContext, match: Match, teamId: string, name: string): string {
  if (resultKeepsTop2Possible(ctx, match, teamId, 1)) return `A draw keeps ${name} in contention for the top two.`
  if (resultKeepsTop2Possible(ctx, match, teamId, 3)) return `${name} need to win to reach the top two.`
  return `${name} need to win — and other results to go their way.`
}

// Teams still in contention in this match's group, excluding the two playing.
// Safe to name: 'alive' is the engine's own ESPN-anchored status.
function otherAliveNames(ctx: QualContext, match: Match): string[] {
  const g = match.group ? ctx.groupById.get(match.group) : undefined
  if (!g) return []
  return g.table
    .filter(
      (r) =>
        r.teamId !== match.homeId &&
        r.teamId !== match.awayId &&
        statusOf(ctx, r.teamId) === 'alive',
    )
    .map((r) => r.name)
}

// Rounds three numbers to ints summing to exactly 100 (drift onto the largest).
function to3(home: number, draw: number, away: number) {
  let h = Math.round(home)
  let d = Math.round(draw)
  let a = Math.round(away)
  const drift = 100 - (h + d + a)
  if (drift !== 0) {
    const m = Math.max(h, d, a)
    if (m === h) h += drift
    else if (m === a) a += drift
    else d += drift
  }
  return { home: h, draw: d, away: a }
}

// Form-based win/draw/win estimate from tournament results — used for the
// expected-result bar when no live market odds exist (most upcoming games).
export function formProbabilities(ctx: QualContext, match: Match) {
  const diff = strength(ctx, match.homeId) - strength(ctx, match.awayId)
  const pHome = 1 / (1 + Math.exp(-0.9 * diff))
  let draw = 0.28 - 0.05 * Math.abs(diff)
  draw = Math.max(0.08, Math.min(0.3, draw))
  const rest = 1 - draw
  return to3(rest * pHome * 100, draw * 100, rest * (1 - pHome) * 100)
}

function rankPhrase(rank: number, complete: boolean): string {
  if (!complete) return 'are in the mix'
  switch (rank) {
    case 1:
      return 'won the group'
    case 2:
      return 'finished second and went through'
    case 3:
      // only reached for a 'through' team (outcomeClause) — a rank-3 side that
      // advanced is a best-third qualifier; don't leave "third" reading as out
      return 'finished third but went through as a best third'
    default:
      return 'finished bottom'
  }
}

// Short best-third consequence for a third-placed team, reusing the team-page
// outlook (item 1) so the completed card and the team page can't contradict.
function bestThirdTag(ctx: QualContext, id: string): string {
  const o = teamNextOutlook(id, ctx)
  if (o.tone === 'through') return ' and through as a best third'
  if (o.tone === 'out') return ' but edged out of the best-third places'
  if (o.tone === 'race') return ' — still alive in the best-third race'
  return ' — waiting on other groups'
}

function outcomeClause(ctx: QualContext, id: string, name: string, complete: boolean): string {
  const s = statusOf(ctx, id)
  const r = ctx.rowByTeam.get(id)
  if (s === 'through') return `${name} ${complete && r ? rankPhrase(r.rank, true) : 'are through'}`
  // third place doesn't mean out — say what it actually means (item 1)
  if (s === 'alive') return complete ? `${name} finished third${bestThirdTag(ctx, id)}` : `${name} are still in it`
  if (s === 'out') return `${name} are out`
  return `${name} ${r ? rankPhrase(r.rank, complete) : 'are still in it'}`
}

// ---------- public copy builders ----------

export function groupSummary(g: Group, ctx: QualContext): string {
  const by = (s: Status) => g.table.filter((r) => statusOf(ctx, r.teamId) === s).map((r) => r.name)
  const through = by('through')
  const alive = by('alive')
  const out = by('out')
  const parts: string[] = []
  if (through.length)
    parts.push(`${list(through)} ${through.length > 1 ? 'have' : 'has'} reached the knockout rounds`)
  if (alive.length)
    parts.push(`${list(alive)} ${alive.length > 1 ? 'are' : 'is'} still in contention`)
  if (out.length) parts.push(`${list(out)} ${out.length > 1 ? 'are' : 'is'} out`)
  return parts.length ? parts.join('. ') + '.' : 'Group games are still to be played.'
}

export function teamStatusLine(id: string, ctx: QualContext): string {
  const s = statusOf(ctx, id)
  const rank = ctx.rowByTeam.get(id)?.rank
  if (s === 'through') return 'Through to the knockout rounds.'
  if (s === 'alive')
    return rank && rank <= 2
      ? 'In a qualifying spot, but not yet safe.'
      : 'Just outside the cut-off — still has a chance.'
  if (s === 'out') return 'Out of the tournament.'
  return 'Still to play its group games.'
}

// ---------- team "what's next" outlook (item 4) ----------
// For a team with NO scheduled match. Splits the old blanket "tournament is over"
// by real state, and for a third-placed team whose group is done it computes the
// best-third advance/elimination conditions from the feed.
//
// Best-third rule: the top 8 of the 12 third-placed teams advance, ranked by
// points → goal difference → goals scored → … The feed gives points + GD but NOT
// goals scored, so we prove from points alone and treat pts+GD ties as undecided
// (handled conservatively); we never assert a goals-for-dependent outcome.

const BEST_THIRDS = 8

export interface NextOutlook {
  tone: 'out' | 'through' | 'race' | 'wait'
  line: string
}

// 3rd-place rows of groups whose games are all played (fixed for the race).
function completedThirds(ctx: QualContext): GroupRow[] {
  const out: GroupRow[] = []
  for (const g of ctx.groupById.values()) {
    if (g.table.every((r) => r.played >= 3)) {
      const third = g.table.find((r) => r.rank === 3)
      if (third) out.push(third)
    }
  }
  return out
}

// >0 if A ranks above B among third-placed teams; 0 = level on pts+GD (undecided).
function thirdAboveBy(a: { pts: number; gd: number }, b: { pts: number; gd: number }): number {
  return a.pts !== b.pts ? a.pts - b.pts : a.gd - b.gd
}

export function teamNextOutlook(teamId: string, ctx: QualContext): NextOutlook {
  const s = statusOf(ctx, teamId)
  const name = ctx.payload.teams[teamId]?.name ?? ctx.rowByTeam.get(teamId)?.name ?? 'This team'
  if (s === 'out') return { tone: 'out', line: 'Knocked out — no more games.' }
  if (s === 'through') return { tone: 'through', line: `${name} are through — waiting on the knockout draw.` }

  const row = ctx.rowByTeam.get(teamId)
  const grp = ctx.payload.teams[teamId]?.group
  const g = grp ? ctx.groupById.get(grp) : undefined
  const groupDone = !!g && g.table.every((r) => r.played >= 3)

  // a third-placed team whose group is done, still chasing a best-third spot
  if (s === 'alive' && row && row.rank === 3 && groupDone && grp) {
    const thirds = completedThirds(ctx).filter((t) => t.teamId !== teamId)
    const pending = [...ctx.groupById.values()].filter((x) => !x.table.every((r) => r.played >= 3)).length
    const strictlyAbove = thirds.filter((t) => thirdAboveBy(t, row) > 0).length
    const couldBeAbove = thirds.filter((t) => thirdAboveBy(t, row) >= 0).length // ties count as maybe-above

    if (strictlyAbove >= BEST_THIRDS) {
      return { tone: 'out', line: `Knocked out — ${name} finished outside the best ${BEST_THIRDS} third-placed teams.` }
    }
    if (couldBeAbove + pending < BEST_THIRDS) {
      return { tone: 'through', line: `${name} are through as one of the best ${BEST_THIRDS} third-placed teams.` }
    }

    const kElim = BEST_THIRDS - strictlyAbove // this many pending groups must out-third them to eliminate
    const pts = `${row.pts} ${row.pts === 1 ? 'pt' : 'pts'}`
    if (kElim > pending) {
      // pending results alone can't push them out — it comes down to the goals-scored tiebreak
      const tail = pending > 0 ? `goals scored and the last ${pending} ${pending === 1 ? 'group' : 'groups'}` : 'goals scored'
      return { tone: 'race', line: `${name} finished third in Group ${grp} on ${pts}. Level with other thirds on points and goal difference — their place hinges on ${tail}.` }
    }
    const aboveTxt = strictlyAbove === 0 ? 'none above them yet' : `${strictlyAbove} third${strictlyAbove === 1 ? '' : 's'} above`
    return {
      tone: 'race',
      line: `${name} finished third in Group ${grp} on ${pts} — ${aboveTxt}, ${pending} ${pending === 1 ? 'group' : 'groups'} left. Best ${BEST_THIRDS} thirds advance; out only if ${kElim}+ of those finish with a better third.`,
    }
  }

  // genuinely indeterminate / unusual (e.g. knockout limbo) — honest, no false claim
  return { tone: 'wait', line: 'Group games done — waiting on other groups’ results.' }
}

export function editorialFor(match: Match, ctx: QualContext): Editorial {
  const { home, away, score } = match
  const sh = statusOf(ctx, match.homeId)
  const sa = statusOf(ctx, match.awayId)
  const completed = match.state === 'completed'

  // ----- knockout -----
  if (match.stage === 'ko') {
    if (completed && score) {
      const w = score.home > score.away ? home : score.home < score.away ? away : null
      return {
        matters: 'Yes.',
        whatChanges: w ? `${w} went through; ${w === home ? away : home} are out.` : 'It was settled after 90 minutes.',
        why: text(
          w
            ? `${w} advance. ${w === home ? away : home} go home.`
            : 'Level after 90. Decided in extra time or penalties.',
        ),
      }
    }
    return {
      matters: 'Yes.',
      whatChanges: 'Everything — the winner goes through, the loser is out.',
      why: tip('', 'Knockout', ' game. No safety net.', 'knockout'),
    }
  }

  const bothOut = sh === 'out' && sa === 'out'
  const bothThrough = sh === 'through' && sa === 'through'
  const oneThroughOneOut = (sh === 'through' && sa === 'out') || (sa === 'through' && sh === 'out')
  const throughName = sh === 'through' ? home : away
  const outName = sh === 'out' ? home : away
  const aliveName = sh === 'alive' ? home : sa === 'alive' ? away : null
  const bothAlive = sh === 'alive' && sa === 'alive'
  const complete = groupComplete(ctx, match.group)

  // ----- completed group match (safe, status-anchored) -----
  if (completed && score) {
    // binary verdict (item 2): No when advancement was fully settled regardless of
    // this result — both ended out, both through (so it only set seeding), or a
    // dead rubber where the points couldn't have moved either side's fate (e.g. the
    // group winner losing to an already-eliminated side). Else Yes.
    const deadRubber = bothOut || bothThrough || completedGroupMatchInvariant(ctx, match)
    const matters = deadRubber ? 'No.' : 'Yes.'
    const w = score.home > score.away ? home : score.home < score.away ? away : null

    if (deadRubber) {
      // Nothing was riding on it — say so plainly, while still noting where each
      // side ended up (informative, just not consequential to qualification).
      let whatChanges: string
      let why: Gloss
      if (bothOut) {
        whatChanges = 'Not much in the end — neither side reached the knockouts.'
        why = text('Both had already missed the knockouts.')
      } else if (bothThrough) {
        whatChanges = `Only the seeding — both were already through in Group ${match.group}.`
        why = text('Both had already qualified; this just set the order.')
      } else if (oneThroughOneOut) {
        whatChanges = `Nothing was riding on it — ${throughName} were already through and ${outName} already out.`
        why = text(`${throughName} had qualified and ${outName} were eliminated before kickoff.`)
      } else {
        whatChanges = 'Nothing — the group was already settled before kickoff.'
        why = text('Neither side’s place could have changed.')
      }
      return { matters, whatChanges, why }
    }

    const whatChanges = `${capitalize(outcomeClause(ctx, match.homeId, home, complete))}; ${outcomeClause(ctx, match.awayId, away, complete)}.`
    const why: Gloss =
      levelOnPoints(ctx, match) && complete
        ? tip('Level on points. ', 'Goal difference', ' settled it.', 'goalDifference')
        : text(
            w
              ? `${possessive(w)} win ${complete ? 'settled' : 'shaped'} the group.`
              : `Draw ${complete ? 'settled' : 'shaped'} the order.`,
          )
    return { matters, whatChanges, why }
  }

  // ----- upcoming / live group match -----
  if (bothOut) {
    return {
      matters: 'No.',
      whatChanges: 'Nothing — both teams are already out.',
      why: text(`Neither ${home} nor ${away} can reach the knockouts.`),
    }
  }
  if (oneThroughOneOut) {
    return {
      matters: 'No.',
      whatChanges: `Not much — ${throughName} are through and ${outName} are out.`,
      why: text(`${throughName} qualified. ${outName} eliminated.`),
    }
  }
  if (bothThrough) {
    const decides = topTwoMeeting(ctx, match)
    return {
      matters: 'No.',
      whatChanges: decides ? `Who finishes first in Group ${match.group}.` : `Final seeding in Group ${match.group}.`,
      why: levelOnPoints(ctx, match)
        ? tip('Both already through, level on points. ', 'Goal difference', ' decides who gets the easier draw.', 'goalDifference')
        : tip('Both already through. Winner takes the ', 'easier draw', '.', 'seeding'),
    }
  }
  if (bothAlive) {
    // Clean headline in whatChanges; the concrete, provable scenario carries the
    // WHY (C1). Reuse the points-only clinch logic — still under-claims, never
    // asserts a result that isn't mathematically forced.
    const hD = drawClinches(ctx, match, match.homeId)
    const hW = hD || winClinches(ctx, match, match.homeId) // a draw clinching implies a win does too
    const aD = drawClinches(ctx, match, match.awayId)
    const aW = aD || winClinches(ctx, match, match.awayId)
    const msg = (d: boolean, w: boolean, name: string): string | null =>
      d ? `a draw is enough for ${name}` : w ? `a win sends ${name} through` : null
    const hMsg = msg(hD, hW, home)
    const aMsg = msg(aD, aW, away)
    const others = otherAliveNames(ctx, match)

    let why: Gloss
    if (hD && aD) {
      why = text(`A draw sends both ${home} and ${away} through.`)
    } else if (hMsg && aMsg) {
      why = text(`${capitalize(hMsg)}. ${capitalize(aMsg)}.`)
    } else if (hMsg || aMsg) {
      const chaserId = hMsg ? match.awayId : match.homeId
      const chaser = hMsg ? away : home
      why = text(`${capitalize((hMsg ?? aMsg)!)}. ${aliveNeedPhrase(ctx, match, chaserId, chaser)}`)
    } else if (others.length) {
      why = text(`${list([home, away, ...others])} are all chasing the spots.`)
    } else {
      why = text(`A straight fight between ${home} and ${away}.`)
    }

    return {
      matters: 'Yes.',
      whatChanges: hD && aD ? `Who tops Group ${match.group}.` : `Who goes through from Group ${match.group}.`,
      why,
    }
  }
  if (aliveName) {
    const aliveId = sh === 'alive' ? match.homeId : match.awayId
    const rank = ctx.rowByTeam.get(aliveId)?.rank ?? 3
    if (rank <= 2) {
      // currently in a qualifying place, just not mathematically clinched
      const d = drawClinches(ctx, match, aliveId)
      const w = d || winClinches(ctx, match, aliveId)
      const why = d
        ? text(`A draw is enough for ${aliveName}.`)
        : w
          ? text(`A win sends ${aliveName} through.`)
          : text(`${aliveName} sit in a qualifying spot. Not safe yet.`)
      return {
        matters: 'Yes.',
        whatChanges: `Whether ${aliveName} go through.`,
        why,
      }
    }
    if (rank === 3) {
      return {
        matters: 'Yes.',
        whatChanges: `Whether ${aliveName} can still reach the knockout rounds.`,
        why: text(aliveNeedPhrase(ctx, match, aliveId, aliveName)),
      }
    }
    return {
      matters: 'Yes.',
      whatChanges: `Whether ${aliveName} can still sneak through.`,
      why: text(`${aliveName} need a big win and other results to fall their way.`),
    }
  }
  // early / not-yet-resolved group
  return {
    matters: 'Yes.',
    whatChanges: 'Points toward reaching the knockout rounds.',
    why: text('Early days. Both still chasing a place.'),
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}’` : `${name}’s`
}
