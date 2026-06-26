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
    scoreStrip: match.score
      ? `${home} ${match.score.home} · ${away} ${match.score.away}`
      : '',
    groupLabel: match.group ? `Group ${match.group}` : match.roundName ?? 'Knockout',
    groupClickable: !!match.group,
    metaTail,
    venue: match.venue ?? '',
    matterLabel: isCompleted ? 'Did it matter?' : 'Does it matter?',
    matters: e.matters,
    matterColor: /^Yes/.test(e.matters) ? OXBLOOD : '#1c1a17',
    changeLabel: isCompleted ? 'What changed?' : 'What changes?',
    whatChanges: e.whatChanges,
    whyGloss: gloss(e.why),
    hasChances: chances.length > 0,
    chances,
    openHome: () => homeClickable && nav.openTeam(match.homeId),
    openAway: () => awayClickable && nav.openTeam(match.awayId),
    openGroup: () => match.group && nav.openGroup(match.group),
    openMatch: () => nav.openMatch(match.id),
  }
}
