// The knockout bracket — a mirrored, two-sided tree (left half flows right,
// right half flows left, the Final in the middle) with winner-feeds-forward
// connector lines. The structure is built from ESPN's own feeder labels
// ("Round of 32 N Winner" / "Round of 16 N Winner"); R32 ties are numbered in
// date order (confirmed: the winner of tie #1 feeds Round-of-16 match 1). Rounds
// that ESPN hasn't created yet (Semifinals/Final) render as "TBD" and fill in
// as ties are won. Connector geometry relies on each round's cells being equal
// height (flex:1), so a pair's midpoint lands on the next round's cell centre —
// see the .kbr-* rules in styles.css.

import type { CSSProperties } from 'react'
import type { Match, ScoresPayload, Team } from '../lib/model'
import { isoForTeam } from '../lib/flags'
import { Flag } from './Flag'

const INK = '#1c1a17'
const SUB = '#6b6660'
const FAINT = '#9a948a'
const LINE = '#e6e1d6'
const OX = '#8a2b22'
const CARD = '#f8f6f0'

const CAP: CSSProperties = {
  font: "600 11px 'Newsreader',serif",
  letterSpacing: '.14em',
  textTransform: 'uppercase',
  color: FAINT,
}

const ROUND_ORDER = ['Round of 32', 'Round of 16', 'Quarterfinals', 'Semifinals', 'Third-place playoff', 'Final']

// A team slot is a placeholder until its feeding tie is decided (ESPN labels
// them "Round of 32 N Winner" etc.).
function isPlaceholder(name: string, team?: Team): boolean {
  if (!team || !team.short) return true
  return /winner|loser|runner|tbd|^round of|^group |best third/i.test(name)
}

interface KoTie {
  match: Match
  homeIso?: string
  awayIso?: string
  homePh: boolean
  awayPh: boolean
  winnerId?: string
  level: boolean // completed but level after 90 (ET/pens — no winner picked from the score)
}

function toTie(m: Match, p: ScoresPayload): KoTie {
  const ht = p.teams[m.homeId]
  const at = p.teams[m.awayId]
  let winnerId: string | undefined
  let level = false
  if (m.state === 'completed' && m.score) {
    if (m.score.home > m.score.away) winnerId = m.homeId
    else if (m.score.away > m.score.home) winnerId = m.awayId
    else level = true
  }
  return {
    match: m,
    homeIso: isoForTeam(ht),
    awayIso: isoForTeam(at),
    homePh: isPlaceholder(m.home, ht),
    awayPh: isPlaceholder(m.away, at),
    winnerId,
    level,
  }
}

function koByRound(p: ScoresPayload): Map<string, KoTie[]> {
  const map = new Map<string, KoTie[]>()
  for (const m of p.matches) {
    if (m.stage !== 'ko' || !m.roundName) continue
    if (!map.has(m.roundName)) map.set(m.roundName, [])
    map.get(m.roundName)!.push(toTie(m, p))
  }
  for (const [, arr] of map) arr.sort((a, b) => a.match.dateISO.localeCompare(b.match.dateISO))
  return map
}

function currentRound(byRound: Map<string, KoTie[]>): string | undefined {
  for (const r of ROUND_ORDER) {
    const ties = byRound.get(r)
    if (ties && ties.length && ties.some((t) => t.match.state !== 'completed')) return r
  }
  for (let i = ROUND_ORDER.length - 1; i >= 0; i--) {
    if (byRound.get(ROUND_ORDER[i])?.length) return ROUND_ORDER[i]
  }
  return undefined
}

function feederNum(name: string): number | null {
  const m = /Round of (?:32|16) (\d+) Winner/i.exec(name)
  return m ? Number(m[1]) : null
}

type Cell = { tie: KoTie } | { tbd: true }

interface BracketModel {
  leftR32: Cell[]
  leftR16: Cell[]
  leftQF: Cell[]
  leftSF: Cell[]
  final: Cell[]
  rightSF: Cell[]
  rightQF: Cell[]
  rightR16: Cell[]
  rightR32: Cell[]
}

function buildBracket(byRound: Map<string, KoTie[]>): BracketModel {
  const r32 = byRound.get('Round of 32') || [] // date order == bracket index 1..16
  const r16 = byRound.get('Round of 16') || []
  const qf = byRound.get('Quarterfinals') || []

  const r32IdxOfTeam = (id: string) => {
    const i = r32.findIndex((t) => t.match.homeId === id || t.match.awayId === id)
    return i >= 0 ? i + 1 : null
  }
  const r16FeedR32 = (t: KoTie): number[] =>
    [
      [t.match.home, t.match.homeId],
      [t.match.away, t.match.awayId],
    ].map(([nm, id]) => feederNum(nm) ?? r32IdxOfTeam(id) ?? 0)
  const qfFeedR16 = (t: KoTie): number[] => [t.match.home, t.match.away].map((nm) => feederNum(nm) ?? 0)

  const half = r16.length / 2 || 4
  const leftQF = qf.filter((t) => qfFeedR16(t).every((n) => n > 0 && n <= half)).sort((a, b) => Math.min(...qfFeedR16(a)) - Math.min(...qfFeedR16(b)))
  const rightQF = qf.filter((t) => qfFeedR16(t).some((n) => n > half)).sort((a, b) => Math.min(...qfFeedR16(a)) - Math.min(...qfFeedR16(b)))

  const r16Order = (qfs: KoTie[]) => qfs.flatMap((q) => qfFeedR16(q)).filter((n) => n > 0)
  const leftR16order = r16Order(leftQF)
  const rightR16order = r16Order(rightQF)
  const r32Order = (order: number[]) => order.flatMap((n) => r16FeedR32(r16[n - 1])).filter((n) => n > 0)

  const cell = (t?: KoTie): Cell => (t ? { tie: t } : { tbd: true })
  const tbds = (n: number): Cell[] => Array.from({ length: n }, () => ({ tbd: true as const }))

  return {
    leftR32: r32Order(leftR16order).map((n) => cell(r32[n - 1])),
    leftR16: leftR16order.map((n) => cell(r16[n - 1])),
    leftQF: leftQF.map((t) => cell(t)),
    leftSF: tbds(1),
    final: tbds(1),
    rightSF: tbds(1),
    rightQF: rightQF.map((t) => cell(t)),
    rightR16: rightR16order.map((n) => cell(r16[n - 1])),
    rightR32: r32Order(rightR16order).map((n) => cell(r32[n - 1])),
  }
}

function MiniTie({ cell, align, onOpenTeam }: { cell: Cell; align: 'left' | 'right'; onOpenTeam?: (id: string) => void }) {
  if ('tbd' in cell) {
    return (
      <div style={{ background: 'transparent', border: `1px dashed #d3ccbf`, padding: '9px 6px', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ font: "italic 400 12px 'Newsreader',serif", color: '#b7b0a3' }}>TBD</span>
      </div>
    )
  }
  const t = cell.tie
  const m = t.match
  const show = m.state !== 'upcoming'
  const Slot = ({ id, name, iso, ph, win, score }: { id: string; name: string; iso?: string; ph: boolean; win: boolean; score?: number }) => {
    const clickable = !ph && !!onOpenTeam
    return (
      <div style={{ display: 'flex', flexDirection: align === 'right' ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between', gap: 7, opacity: !!t.winnerId && !win && !ph ? 0.5 : 1 }}>
        <div style={{ display: 'flex', flexDirection: align === 'right' ? 'row-reverse' : 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {!ph && <Flag iso={iso} h={13} />}
          <span
            onClick={clickable ? () => onOpenTeam!(id) : undefined}
            className={clickable ? 'lk' : undefined}
            style={{ font: `${win ? 600 : 500} 13px 'Newsreader',serif`, color: ph ? FAINT : INK, fontStyle: ph ? 'italic' : 'normal', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: clickable ? 'pointer' : 'default' }}
          >
            {ph ? 'TBD' : name}
          </span>
        </div>
        {show && score != null && <span style={{ font: `${win ? 600 : 500} 13px 'Newsreader',serif`, color: INK, flex: 'none' }}>{score}</span>}
      </div>
    )
  }
  return (
    <div style={{ background: CARD, border: `1px solid ${m.state === 'live' ? OX : LINE}`, padding: '7px 10px', display: 'flex', flexDirection: 'column', gap: 4, position: 'relative' }}>
      {m.state === 'live' && <span style={{ position: 'absolute', top: 6, [align === 'right' ? 'left' : 'right']: 8, width: 6, height: 6, borderRadius: '50%', background: OX, animation: 'livepulse 1.6s ease-in-out infinite' }} />}
      <Slot id={m.homeId} name={m.home} iso={t.homeIso} ph={t.homePh} win={t.winnerId === m.homeId} score={m.score?.home} />
      <div style={{ height: 1, background: LINE }} />
      <Slot id={m.awayId} name={m.away} iso={t.awayIso} ph={t.awayPh} win={t.winnerId === m.awayId} score={m.score?.away} />
    </div>
  )
}

function KCol({ label, cells, align, accent, min, fixed, feed, onOpenTeam }: { label: string; cells: Cell[]; align: 'left' | 'right'; accent?: boolean; min: number; fixed?: number; feed?: 'L' | 'R'; onOpenTeam?: (id: string) => void }) {
  const pairs = cells.length >= 2
  const cls = ['kbr-col', fixed ? 'fixed' : 'flex', feed === 'R' ? 'kbr-feedR' : feed === 'L' ? 'kbr-feedL' : '', pairs && feed ? 'pairs' : ''].filter(Boolean).join(' ')
  const sizing: CSSProperties = fixed ? { width: fixed } : { minWidth: min }
  return (
    <div className={cls} style={sizing}>
      <div className="kbr-head" style={{ ...CAP, color: accent ? OX : FAINT }}>{label}</div>
      <div className="kbr-body">
        {cells.map((c, i) => (
          <div className="kbr-cell" key={i}>
            <div className="kbr-pad">
              <MiniTie cell={c} align={align} onOpenTeam={onOpenTeam} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function KnockoutsView({ payload, onOpenTeam }: { payload: ScoresPayload; onOpenTeam?: (id: string) => void }) {
  const byRound = koByRound(payload)
  const hasKo = [...byRound.values()].some((a) => a.length)
  const current = currentRound(byRound)
  const cur = (round: string) => round === current
  const b = buildBracket(byRound)

  return (
    <section style={{ paddingTop: 34 }}>
      <h2 style={{ margin: 0, font: "500 30px 'Newsreader',serif", color: INK, letterSpacing: '-.015em' }}>Knockout Stage</h2>
      <p style={{ margin: '10px 0 0', font: "400 18px/1.5 'Newsreader',serif", color: SUB, maxWidth: 660 }}>
        Single elimination — win and you move on, lose and you’re out. The 32 group-stage survivors play down to one champion; the lines trace the winner forward through the bracket.
      </p>

      {!hasKo ? (
        <p style={{ margin: '28px 0 0', font: "400 18px 'Newsreader',serif", color: FAINT }}>The knockout rounds haven’t started yet — they’ll appear here once the group stage is done.</p>
      ) : (
        <div style={{ overflowX: 'auto', paddingBottom: 8, marginTop: 26 }}>
          <div className="kbr" style={{ minHeight: 460 }}>
            <KCol label="R32" cells={b.leftR32} align="left" accent={cur('Round of 32')} min={138} feed="R" onOpenTeam={onOpenTeam} />
            <KCol label="R16" cells={b.leftR16} align="left" accent={cur('Round of 16')} min={110} feed="R" onOpenTeam={onOpenTeam} />
            <KCol label="QF" cells={b.leftQF} align="left" accent={cur('Quarterfinals')} min={92} feed="R" onOpenTeam={onOpenTeam} />
            <KCol label="SF" cells={b.leftSF} align="left" fixed={56} min={56} feed="R" onOpenTeam={onOpenTeam} />
            <KCol label="Final" cells={b.final} align="left" accent fixed={64} min={64} onOpenTeam={onOpenTeam} />
            <KCol label="SF" cells={b.rightSF} align="right" fixed={56} min={56} feed="L" onOpenTeam={onOpenTeam} />
            <KCol label="QF" cells={b.rightQF} align="right" accent={cur('Quarterfinals')} min={92} feed="L" onOpenTeam={onOpenTeam} />
            <KCol label="R16" cells={b.rightR16} align="right" accent={cur('Round of 16')} min={110} feed="L" onOpenTeam={onOpenTeam} />
            <KCol label="R32" cells={b.rightR32} align="right" accent={cur('Round of 32')} min={138} feed="L" onOpenTeam={onOpenTeam} />
          </div>
        </div>
      )}
    </section>
  )
}
