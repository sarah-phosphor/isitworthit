// Turns a Match + the engine's editorial + odds into a flat view-model the
// MatchCard renders. Mirrors the prototype's buildCard().

import type { Gloss, Match } from './model'
import { editorialFor, formProbabilities, type QualContext } from './qualification'
import { applyOverride } from './overrides'
import { timeLabel } from './dates'
import { isoForTeam } from './flags'

export interface Chance {
  label: string
  pct: number
  color: string
  legendColor: string
  legendWeight?: number
}

export interface GlossVM {
  noTip: boolean
  hasTip: boolean
  text?: string
  pre?: string
  term?: string
  post?: string
  tip?: string
}

export interface CardVM {
  id: string
  isLive: boolean
  isUpcoming: boolean
  isCompleted: boolean
  liveMinute: string
  homeName: string
  awayName: string
  homeIso?: string
  awayIso?: string
  homeClickable: boolean
  awayClickable: boolean
  hasScore: boolean
  scoreStrip: string
  groupLabel: string
  groupClickable: boolean
  metaTail: string
  matterLabel: string
  matters: string
  matterColor: string
  changeLabel: string
  whatChanges: string
  whyGloss: GlossVM
  predictionWhy?: string // upcoming/live knockout cards: lead with Expected result, explain the prediction here
  koResult?: string // finished knockout cards: lead with the result instead of the verdict
  venue: string
  hasChances: boolean
  chances: Chance[]
  openHome: () => void
  openAway: () => void
  openGroup: () => void
  openMatch: () => void
}

const OXBLOOD = '#8a2b22'
const DRAW = '#cdc7bb'
const OTHER = '#8c8579'

function gloss(g?: Gloss): GlossVM {
  if (!g) return { noTip: true, hasTip: false, text: '' }
  if (g.term) return { noTip: false, hasTip: true, pre: g.pre, term: g.term, post: g.post, tip: g.tip }
  return { noTip: true, hasTip: false, text: g.text ?? '' }
}

function chancesFrom(p: { home: number; draw: number; away: number }, m: Match): Chance[] {
  const favIsHome = p.home >= p.away
  const seg = (label: string, pct: number, side: 'home' | 'draw' | 'away'): Chance => {
    const isFav = (side === 'home' && favIsHome) || (side === 'away' && !favIsHome)
    return {
      label,
      pct,
      color: side === 'draw' ? DRAW : isFav ? OXBLOOD : OTHER,
      legendColor: isFav ? OXBLOOD : '#8a857d',
      legendWeight: isFav ? 600 : 500,
    }
  }
  // labels are bare names (no "win") so the legend fits one line (C2)
  return [
    seg(m.home, p.home, 'home'),
    seg('Draw', p.draw, 'draw'),
    seg(m.away, p.away, 'away'),
  ]
}

// For a knockout game the "Does it matter?" verdict is always Yes, so the card
// instead leads with the Expected result and explains WHY that's the prediction.
// The reason is grounded, not invented: a live game cites the current score; an
// upcoming game cites the two sides' group-stage form (the same signal the form
// model uses). Group games never call this.
function knockoutPredictionWhy(match: Match, ctx: QualContext, chances: Chance[]): string {
  if (match.state === 'live' && match.score) {
    const { home: sh, away: sa } = match.score
    if (sh === sa) return `Level at ${sh}–${sa} — nothing between them yet.`
    const leader = sh > sa ? match.home : match.away
    return `${leader} lead ${Math.max(sh, sa)}–${Math.min(sh, sa)}, tilting the odds their way.`
  }
  const hp = chances[0]?.pct ?? 0
  const ap = chances[2]?.pct ?? 0
  const favIsHome = hp >= ap
  const favRow = ctx.rowByTeam.get(favIsHome ? match.homeId : match.awayId)
  const dogRow = ctx.rowByTeam.get(favIsHome ? match.awayId : match.homeId)
  if (Math.abs(hp - ap) <= 6 || !favRow || !dogRow) return 'Little between them on group-stage form — close to a coin toss.'
  const finish = (r: { rank: number }) => (r.rank === 1 ? 'won their group' : r.rank === 2 ? 'came second' : 'came third')
  const fav = favIsHome ? match.home : match.away
  const dog = favIsHome ? match.away : match.home
  return `${fav} ${finish(favRow)} (${favRow.pts} pts, ${favRow.gdLabel}); ${dog} ${finish(dogRow)} (${dogRow.pts} pts, ${dogRow.gdLabel}).`
}

export function buildCard(
  match: Match,
  ctx: QualContext,
  nav: { openTeam: (id: string) => void; openGroup: (id: string) => void; openMatch: (id: string) => void },
): CardVM {
  const e = applyOverride(editorialFor(match, ctx), match.id)
  const isLive = match.state === 'live'
  const isUpcoming = match.state === 'upcoming'
  const isCompleted = match.state === 'completed'
  const home = match.home
  const away = match.away

  // Expected-result bar on every state now, incl. completed (R3-3): pre-match
  // odds when ESPN has them, else the form-based estimate — same as upcoming.
  const probs = match.odds ?? formProbabilities(ctx, match)
  const chances = chancesFrom(probs, match)

  let metaTail = ''
  if (isUpcoming) metaTail = ' · ' + timeLabel(match.dateISO)
  else if (isCompleted) metaTail = ' · Final'

  const homeClickable = ctx.rowByTeam.has(match.homeId)
  const awayClickable = ctx.rowByTeam.has(match.awayId)

  // A finished knockout game leads with the result instead of the moot
  // "Did it matter? Yes" verdict. (Sarah, 2026-06-29)
  let koResult: string | undefined
  if (match.stage === 'ko' && isCompleted) {
    const sc = match.score
    const w = sc ? (sc.home > sc.away ? home : sc.away > sc.home ? away : null) : null
    koResult = w ? `${w} advanced; ${w === home ? away : home} is out.` : 'Settled in extra time or penalties.'
  }

  return {
    id: match.id,
    isLive,
    isUpcoming,
    isCompleted,
    liveMinute: match.minute ? `Live · ${match.minute}` : 'Live',
    homeName: home,
    awayName: away,
    homeIso: isoForTeam(ctx.payload.teams[match.homeId]),
    awayIso: isoForTeam(ctx.payload.teams[match.awayId]),
    homeClickable,
    awayClickable,
    hasScore: !!match.score,
    // just the numbers, home–away (names are already in the title) — item 1
    scoreStrip: match.score ? `${match.score.home} – ${match.score.away}` : '',
    groupLabel: match.group ? `Group ${match.group}` : match.roundName ?? 'Knockout',
    groupClickable: !!match.group,
    metaTail,
    venue: match.venue ?? '',
    matterLabel: isCompleted ? 'Did it matter?' : 'Does it matter?',
    matters: e.matters,
    matterColor: /^Yes/.test(e.matters) ? OXBLOOD : '#8a857d', // Yes oxblood, No muted grey (item 2)
    changeLabel: isCompleted ? 'What changed?' : 'What changes?',
    whatChanges: e.whatChanges,
    whyGloss: gloss(e.why),
    predictionWhy: match.stage === 'ko' && !isCompleted ? knockoutPredictionWhy(match, ctx, chances) : undefined,
    koResult,
    hasChances: chances.length > 0,
    chances,
    openHome: () => homeClickable && nav.openTeam(match.homeId),
    openAway: () => awayClickable && nav.openTeam(match.awayId),
    openGroup: () => match.group && nav.openGroup(match.group),
    openMatch: () => nav.openMatch(match.id),
  }
}
