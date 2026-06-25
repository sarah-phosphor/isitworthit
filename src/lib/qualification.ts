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
  matters: string // 'Yes.' | 'Somewhat.' | 'Not really.'
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
      return 'finished third'
    default:
      return 'finished bottom'
  }
}

function outcomeClause(ctx: QualContext, id: string, name: string, complete: boolean): string {
  const s = statusOf(ctx, id)
  const r = ctx.rowByTeam.get(id)
  if (s === 'through') return `${name} ${complete && r ? rankPhrase(r.rank, true) : 'are through'}`
  if (s === 'alive') return complete ? `${name} finished third` : `${name} are still in it`
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
    let matters = 'Yes.'
    if (bothOut) matters = 'Not really.'
    else if (oneThroughOneOut) matters = 'Somewhat.'
    const w = score.home > score.away ? home : score.home < score.away ? away : null

    const whatChanges = bothOut
      ? 'Not much in the end — neither side reached the knockouts.'
      : `${capitalize(outcomeClause(ctx, match.homeId, home, complete))}; ${outcomeClause(ctx, match.awayId, away, complete)}.`

    let why: Gloss
    if (bothOut) {
      why = text('Both already missed the knockouts.')
    } else if (levelOnPoints(ctx, match) && complete) {
      why = tip('Level on points. ', 'Goal difference', ' settled it.', 'goalDifference')
    } else {
      why = text(
        w
          ? `${possessive(w)} win ${complete ? 'settled' : 'shaped'} the group.`
          : `Draw ${complete ? 'settled' : 'shaped'} the order.`,
      )
    }
    return { matters, whatChanges, why }
  }

  // ----- upcoming / live group match -----
  if (bothOut) {
    return {
      matters: 'Not really.',
      whatChanges: 'Nothing — both teams are already out.',
      why: text(`Neither ${home} nor ${away} can reach the knockouts.`),
    }
  }
  if (oneThroughOneOut) {
    return {
      matters: 'Not really.',
      whatChanges: `Not much — ${throughName} are through and ${outName} are out.`,
      why: text(`${throughName} qualified. ${outName} eliminated.`),
    }
  }
  if (bothThrough) {
    const decides = topTwoMeeting(ctx, match)
    return {
      matters: 'Somewhat.',
      whatChanges: decides ? `Who finishes first in Group ${match.group}.` : `Final seeding in Group ${match.group}.`,
      why: levelOnPoints(ctx, match)
        ? tip('Both already through. ', 'Goal difference', ' settles order.', 'goalDifference')
        : tip('Both already through. Winner takes the ', 'easier draw', '.', 'seeding'),
    }
  }
  if (bothAlive) {
    // Spell out who a given result actually sends through, when provable; name the
    // wider field otherwise. (R2-4)
    const hD = drawClinches(ctx, match, match.homeId)
    const hW = hD || winClinches(ctx, match, match.homeId) // a draw clinching implies a win does too
    const aD = drawClinches(ctx, match, match.awayId)
    const aW = aD || winClinches(ctx, match, match.awayId)
    const msg = (d: boolean, w: boolean, name: string): string | null =>
      d ? `a draw is enough for ${name}` : w ? `a win sends ${name} through` : null
    const hMsg = msg(hD, hW, home)
    const aMsg = msg(aD, aW, away)
    const others = otherAliveNames(ctx, match)

    let whatChanges: string
    if (hD && aD) {
      whatChanges = `A draw is enough for both ${home} and ${away} to reach the next round.`
    } else if (hMsg && aMsg) {
      whatChanges = capitalize(`${hMsg}; ${aMsg}.`)
    } else if (hMsg || aMsg) {
      const chaser = hMsg ? away : home
      whatChanges = `${capitalize((hMsg ?? aMsg)!)}; ${chaser} are still chasing.`
    } else if (others.length) {
      whatChanges = `Who goes through — ${home} and ${away} are both chasing it, with ${list(others)} still in the race too.`
    } else {
      whatChanges = `Who goes through — ${home} and ${away} are both fighting for a knockout place.`
    }

    return {
      matters: 'Yes.',
      whatChanges,
      why: text(`${home} and ${away} both fighting to go through.`),
    }
  }
  if (aliveName) {
    const aliveId = sh === 'alive' ? match.homeId : match.awayId
    const rank = ctx.rowByTeam.get(aliveId)?.rank ?? 3
    if (rank <= 2) {
      // currently in a qualifying place, just not mathematically clinched
      const d = drawClinches(ctx, match, aliveId)
      const w = d || winClinches(ctx, match, aliveId)
      const whatChanges = d
        ? `${aliveName} reach the knockouts with a point or more.`
        : w
          ? `Win and ${aliveName} are through to the knockouts.`
          : `Whether ${aliveName} confirm their place in the next round.`
      return {
        matters: 'Somewhat.',
        whatChanges,
        why: text(`${aliveName} sit in a qualifying spot. Not safe yet.`),
      }
    }
    if (rank === 3) {
      return {
        matters: 'Yes.',
        whatChanges: `Whether ${aliveName} can still reach the knockout rounds.`,
        why: text(`${aliveName} need a result to stay alive.`),
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
