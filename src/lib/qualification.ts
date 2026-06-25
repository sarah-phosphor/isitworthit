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
  note: string // short label for tables/search: 'Through' | 'In the hunt' | 'Out'
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
  ifNot?: Gloss
  expectedHeadline?: string // upcoming/live
  wasExpected?: string // completed (only when odds were available)
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
  return s === 'through' ? 'Through' : s === 'out' ? 'Out' : s === 'alive' ? 'In the hunt' : ''
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

function expectedHeadline(ctx: QualContext, match: Match): string {
  const o = match.odds
  if (o) {
    const max = Math.max(o.home, o.draw, o.away)
    if (max === o.draw && o.draw > o.home && o.draw > o.away)
      return 'A draw looks the likeliest result.'
    if (Math.abs(o.home - o.away) <= 6) return 'Too close to call.'
    return `${o.home > o.away ? match.home : match.away} are favored.`
  }
  // form-based fallback (no market odds for this game)
  const diff = strength(ctx, match.homeId) - strength(ctx, match.awayId)
  if (Math.abs(diff) < 1) return 'Closely matched on form.'
  return `${diff > 0 ? match.home : match.away} are the stronger side on form.`
}

function wasExpectedText(match: Match): string | undefined {
  if (!match.odds || !match.score) return undefined
  const favIsHome = match.odds.home >= match.odds.away
  const favName = favIsHome ? match.home : match.away
  const actual =
    match.score.home > match.score.away
      ? 'home'
      : match.score.home < match.score.away
        ? 'away'
        : 'draw'
  if (actual === (favIsHome ? 'home' : 'away')) return `Yes — ${favName} were favored and won.`
  if (actual === 'draw') return 'A draw was always a live possibility.'
  return 'A bit of an upset.'
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
  if (s === 'alive') return `${name} finished third — waiting on the best-third math`
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
    parts.push(`${list(alive)} ${alive.length > 1 ? 'are' : 'is'} still chasing a best-third place`)
  if (out.length) parts.push(`${list(out)} ${out.length > 1 ? 'are' : 'is'} out`)
  return parts.length ? parts.join('. ') + '.' : 'Group games are still to be played.'
}

export function teamStatusLine(id: string, ctx: QualContext): string {
  const s = statusOf(ctx, id)
  const next = ctx.payload.matches.find(
    (m) => (m.state === 'upcoming' || m.state === 'live') && (m.homeId === id || m.awayId === id),
  )
  if (s === 'through')
    return next
      ? 'Already through to the knockout rounds — with a game still to play.'
      : 'Through to the knockout rounds.'
  if (s === 'alive')
    return 'Currently third in the group — still in the hunt for one of the eight best third-place spots.'
  if (s === 'out') return 'Out of the tournament.'
  return next ? 'Still to play its group games.' : ''
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
            ? `A knockout tie — ${w} advance and ${w === home ? away : home} go home.`
            : 'A knockout tie, level after 90 minutes and decided in extra time or penalties.',
        ),
        wasExpected: wasExpectedText(match),
      }
    }
    return {
      matters: 'Yes.',
      whatChanges: 'Everything — the winner goes through, the loser is out.',
      why: tip('It’s a ', 'knockout', ' game, so there’s no safety net.', 'knockout'),
      ifNot: tip('Level after 90 minutes and it goes to ', 'extra time, then penalties', '.', 'penalties'),
      expectedHeadline: expectedHeadline(ctx, match),
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
      why = text('Both teams had already missed out on the knockout rounds.')
    } else if (levelOnPoints(ctx, match) && complete) {
      why = tip(
        `${w ?? 'The result'} came down to `,
        'goal difference',
        ' once the points were level.',
        'goalDifference',
      )
    } else {
      why = text(
        w
          ? `${possessive(w)} win ${complete ? 'settled' : 'shaped'} where the group ended up.`
          : `The draw ${complete ? 'settled' : 'shaped'} the final group order.`,
      )
    }
    return { matters, whatChanges, why, wasExpected: wasExpectedText(match) }
  }

  // ----- upcoming / live group match -----
  if (bothOut) {
    return {
      matters: 'Not really.',
      whatChanges: 'Nothing — both teams are already out.',
      why: text(`Neither ${home} nor ${away} can reach the knockout rounds, so the result won’t change the group.`),
      expectedHeadline: expectedHeadline(ctx, match),
    }
  }
  if (oneThroughOneOut) {
    return {
      matters: 'Not really.',
      whatChanges: `Not much — ${throughName} are through and ${outName} are out.`,
      why: text(`${throughName} have already qualified; ${outName} have already been eliminated.`),
      expectedHeadline: expectedHeadline(ctx, match),
    }
  }
  if (bothThrough) {
    const decides = topTwoMeeting(ctx, match)
    return {
      matters: 'Somewhat.',
      whatChanges: decides ? `Who finishes first in Group ${match.group}.` : `Final seeding in Group ${match.group}.`,
      why: levelOnPoints(ctx, match)
        ? tip(
            'Both are already through and level on points, so ',
            'goal difference',
            ' and this result decide who finishes first — and first place usually means an easier draw next round.',
            'goalDifference',
          )
        : tip(
            'Both are already through. The winner finishes first — and that usually means an ',
            'easier opponent',
            ' in the next round.',
            'seeding',
          ),
      ifNot: text('The other team finishes first instead — both still advance.'),
      expectedHeadline: expectedHeadline(ctx, match),
    }
  }
  if (bothAlive) {
    return {
      matters: 'Yes.',
      whatChanges: `Who goes through from Group ${match.group}.`,
      why: text(`${home} and ${away} are both still fighting for a knockout place — this result helps decide who takes it.`),
      ifNot: text('Win and you’re in control of your own fate; drop points and you’re leaning on the other group game.'),
      expectedHeadline: expectedHeadline(ctx, match),
    }
  }
  if (aliveName) {
    const aliveId = sh === 'alive' ? match.homeId : match.awayId
    const rank = ctx.rowByTeam.get(aliveId)?.rank ?? 3
    if (rank <= 2) {
      // currently in a qualifying place, just not mathematically clinched
      return {
        matters: 'Somewhat.',
        whatChanges: `Whether ${aliveName} confirm their place in the next round.`,
        why: text(`${aliveName} sit in a qualifying spot and are close to going through — this is about getting it over the line.`),
        ifNot: text(`Only a poor result here would put ${aliveName} back in any danger.`),
        expectedHeadline: expectedHeadline(ctx, match),
      }
    }
    if (rank === 3) {
      return {
        matters: 'Yes.',
        whatChanges: `Whether ${aliveName} can still reach the knockout rounds.`,
        why: tip(
          `${aliveName} need a result — and even then, third place only goes through if they’re among the `,
          'eight best third-place teams',
          '.',
          'bestThird',
        ),
        ifNot: tip('Without a win, ', 'they’re most likely out', '.', 'bestThird'),
        expectedHeadline: expectedHeadline(ctx, match),
      }
    }
    return {
      matters: 'Yes.',
      whatChanges: `Whether ${aliveName} can still sneak through.`,
      why: text(`${aliveName} need a big win — and other results to fall their way — to reach the knockouts.`),
      ifNot: text(`Anything less, and ${aliveName} are out.`),
      expectedHeadline: expectedHeadline(ctx, match),
    }
  }
  // early / not-yet-resolved group
  return {
    matters: 'Yes.',
    whatChanges: 'Points toward reaching the knockout rounds.',
    why: text(`${home} and ${away} are both still chasing a place in the next round.`),
    expectedHeadline: expectedHeadline(ctx, match),
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}’` : `${name}’s`
}
