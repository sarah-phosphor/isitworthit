// Turns a Match + the engine's editorial + odds into a flat view-model the
// MatchCard renders. Mirrors the prototype's buildCard().

import type { Gloss, Match } from './model'
import { editorialFor, type QualContext } from './qualification'
import { applyOverride } from './overrides'
import { timeLabel } from './dates'

export interface Chance {
  label: string
  pct: number
  color: string
  legendColor: string
  legendWeight?: number
  legendMark?: string
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
  notCompleted: boolean
  liveMinute: string
  homeName: string
  awayName: string
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
  hasChances: boolean
  chances: Chance[]
  expectedHeadline: string
  hasIfNot: boolean
  ifNotGloss: GlossVM
  hasPred: boolean
  predChances: Chance[]
  openHome: () => void
  openAway: () => void
  openGroup: () => void
}

const OXBLOOD = '#8a2b22'
const DRAW = '#cdc7bb'
const OTHER = '#8c8579'

function gloss(g?: Gloss): GlossVM {
  if (!g) return { noTip: true, hasTip: false, text: '' }
  if (g.term) return { noTip: false, hasTip: true, pre: g.pre, term: g.term, post: g.post, tip: g.tip }
  return { noTip: true, hasTip: false, text: g.text ?? '' }
}

function chancesFromOdds(m: Match): Chance[] {
  const o = m.odds
  if (!o) return []
  const favIsHome = o.home >= o.away
  const seg = (label: string, pct: number, side: 'home' | 'draw' | 'away'): Chance => {
    const isFav = (side === 'home' && favIsHome) || (side === 'away' && !favIsHome)
    return {
      label,
      pct,
      color: side === 'draw' ? DRAW : isFav ? OXBLOOD : OTHER,
      legendColor: isFav ? OXBLOOD : '#8a857d',
    }
  }
  return [
    seg(`${m.home} win`, o.home, 'home'),
    seg('Draw', o.draw, 'draw'),
    seg(`${m.away} win`, o.away, 'away'),
  ]
}

// Completed "What was predicted": same bar, with a ✓ + bold on what actually happened.
function predFromOdds(m: Match): Chance[] {
  const o = m.odds
  const s = m.score
  if (!o || !s) return []
  const favIsHome = o.home >= o.away
  const actual = s.home > s.away ? 'home' : s.home < s.away ? 'away' : 'draw'
  const items: Array<{ label: string; pct: number; side: 'home' | 'draw' | 'away'; color: string }> = [
    { label: `${m.home} win`, pct: o.home, side: 'home', color: favIsHome ? OXBLOOD : OTHER },
    { label: 'Draw', pct: o.draw, side: 'draw', color: DRAW },
    { label: `${m.away} win`, pct: o.away, side: 'away', color: !favIsHome ? OXBLOOD : OTHER },
  ]
  return items.map((it) => {
    const hit = it.side === actual
    return {
      label: it.label,
      pct: it.pct,
      color: it.color,
      legendColor: hit ? '#1c1a17' : it.color === OXBLOOD ? OXBLOOD : '#8a857d',
      legendWeight: hit ? 700 : 500,
      legendMark: hit ? '✓ ' : '',
    }
  })
}

export function buildCard(
  match: Match,
  ctx: QualContext,
  nav: { openTeam: (id: string) => void; openGroup: (id: string) => void },
): CardVM {
  const e = applyOverride(editorialFor(match, ctx), match.id)
  const isLive = match.state === 'live'
  const isUpcoming = match.state === 'upcoming'
  const isCompleted = match.state === 'completed'
  const home = match.home
  const away = match.away

  const chances = isLive || isUpcoming ? chancesFromOdds(match) : []
  const predChances = isCompleted ? predFromOdds(match) : []

  let metaTail = ''
  if (isUpcoming) metaTail = ' · ' + timeLabel(match.dateISO)
  else if (isCompleted) metaTail = ' · Final'

  const homeClickable = ctx.rowByTeam.has(match.homeId)
  const awayClickable = ctx.rowByTeam.has(match.awayId)

  return {
    id: match.id,
    isLive,
    isUpcoming,
    isCompleted,
    notCompleted: isLive || isUpcoming,
    liveMinute: match.minute ? `Live · ${match.minute}` : 'Live',
    homeName: home,
    awayName: away,
    homeClickable,
    awayClickable,
    hasScore: !!match.score,
    scoreStrip: match.score
      ? `${home} ${match.score.home} · ${away} ${match.score.away}`
      : '',
    groupLabel: match.group ? `Group ${match.group}` : match.roundName ?? 'Knockout',
    groupClickable: !!match.group,
    metaTail,
    matterLabel: isCompleted ? 'Did it matter?' : 'Does it matter?',
    matters: e.matters,
    matterColor: /^Yes/.test(e.matters) ? OXBLOOD : '#1c1a17',
    changeLabel: isCompleted ? 'What changed?' : 'What changes?',
    whatChanges: e.whatChanges,
    whyGloss: gloss(e.why),
    hasChances: chances.length > 0,
    chances,
    expectedHeadline: e.expectedHeadline ?? '',
    hasIfNot: !!e.ifNot,
    ifNotGloss: gloss(e.ifNot),
    hasPred: predChances.length > 0,
    predChances,
    openHome: () => homeClickable && nav.openTeam(match.homeId),
    openAway: () => awayClickable && nav.openTeam(match.awayId),
    openGroup: () => match.group && nav.openGroup(match.group),
  }
}
